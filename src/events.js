import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import pino from 'pino';
import redis from 'redis';
import amqplib from 'amqplib';
import kafka from 'kafkajs';
import $RefParser from '@apidevtools/json-schema-ref-parser';

export async function load(services, settings) {
  const specPath = path.join(process.cwd(), settings.specPath);
  const hasSpec = await fs.stat(specPath).then(() => true, () => false);

  if (!hasSpec) {
    return null;
  }

  const {servers, channels, operations} =  await $RefParser.dereference(specPath);
  const logger = pino({level: settings.logLevel});

  for (const serverId in servers) {
    const server = servers[serverId];
    const {'x-labels': serverLabels} = server;

    if (!server.host || !server.protocol) {
      continue;
    }

    let isEvery = true;

    for (const varName in serverLabels) {
      if (serverLabels[varName] !== settings.labels[varName]) {
        isEvery = false;
        break;
      }
    }

    if (!isEvery) {
      delete servers[serverId];
      continue;
    }

    server.url = `${server.protocol}://${server.host}${server.pathname ?? '/'}`;
    server.id = serverId;

    if (server.variables) {
      for (const varName in server.variables) {
        const value = settings.variables[varName] ?? server.variables[varName].default;

        server.url = server.url.replace(`{${varName}}`, value);
      }
    }

    server.parsedUrl = new URL(server.url);

    switch (server.protocol) {
      case 'redis': {
        server.instance = {
          _producer: redis.createClient({
            url: server.url,
            RESP: Number(server.protocolVersion || '2')
          }),
          _consumer: redis.createClient({
            url: server.url,
            RESP: Number(server.protocolVersion || '2')
          }),
          connect: () => Promise.all([
            server.instance._producer.connect(),
            server.instance._consumer.connect(),
          ]),
          publish: (topic, message) => server.instance._consumer.publish(topic, message),
          subscribe: (topic, handler) => server.instance._consumer.subscribe(topic, handler),
          listen: () => {},
          close: () => Promise.all([
            server.instance._producer.close(),
            server.instance._consumer.close(),
          ])
        };
        break;
      }
      case 'amqp': {
        if (server.protocolVersion && server.protocolVersion.replace(/-/g, '.') !== '0.9.1') {
          throw new Error(`Unsupported server protocol version: ${server.protocolVersion}`);
        }

        server.instance = {
          connect: () => amqplib.connect(server.url)
            .then((client) => { server.instance._client = client })
            .then(() => Promise.all([
              server.instance._client.createChannel()
                .then((channel) => { server.instance._pubChannel = channel }),
              server.instance._client.createChannel()
                .then((channel) => { server.instance._subChannel = channel })
            ])),
          publish: (topic, message) => server.instance._pubChannel.publish(topic, '', Buffer.from(message)),
          subscribe: (topic, handler) => server.instance._subChannel.consume(topic, async(msg) => {
            await server.instance._subChannel.ack(msg);
            await handler(msg.content.toString());
          }),
          listen: () => {},
          close: () => Promise.all([
            server.instance._pubChannel.close(),
            server.instance._subChannel.close()
          ]).then(() => server.instance._client?.close())
        };
        break;
      }
      case 'kafka': {
        const client = new kafka.Kafka({brokers: [`${server.parsedUrl.hostname}:${server.parsedUrl.port}`]});

        server.instance = {
          _handlerByTopic: new Map(),
          _client: client,
          _producer: client.producer(),
          _consumer: client.consumer({groupId: settings.appName}),
          connect: () => Promise.all([
            server.instance._producer.connect(),
            server.instance._consumer.connect()
          ]),
          publish: (topic, message) => server.instance._producer.send({topic, messages: [{value: message}]}),
          subscribe: (topic, handler) => server.instance._consumer.subscribe({topic})
            .then(() => server.instance._handlerByTopic.has(topic) ?
              server.instance._handlerByTopic.get(topic).push(handler) :
              server.instance._handlerByTopic.set(topic, [handler])),
          listen: () => server.instance._consumer.run({
            eachMessage: ({topic, message: {value}}) => {
              const msg = value?.toString();

              return Promise.all(server.instance._handlerByTopic.get(topic)?.map((handle) => handle(msg)))
            }
          }),
          close: () => Promise.all([
            server.instance._consumer.disconnect(),
            server.instance._producer.disconnect()
          ])
        };
        break;
      }
      default: {
        throw new Error(`Unsupported server protocol: ${server.protocol}`);
      }
    }
  }

  for (const channelId in channels) {
    const channel = channels[channelId];

    channel.id = channelId;

    for (const messageId in channel.messages) {
      const message = channel.messages[messageId];

      message.id = messageId;
      message.compiledSchema = settings.ajv.compile(message.payload);
    }
  }

  const serverConnectors = new Map();
  const senderServers = new Map();
  const sender = {};
  const listenPromises = [];

  for (const operationId in operations) {
    const operation = operations[operationId];
    const operationLogger = logger.child({operationId, event: operation.channel.address});
    const {channel, messages} = operation;
    const operationServers = channel.servers ?? Object.values(servers);

    for (const server of operationServers) {
      if (!server.id || !server.instance) {
        continue;
      }
      if (!serverConnectors.has(server.id)) {
        serverConnectors.set(server.id, {
          ...server.instance,
          connect: () => server.instance.connect()
            .then(() => logger.info(`Server connected to ${server.url}`))
        });
      }
      if (operation.action === 'receive') {
        listenPromises.push(() => server.instance.subscribe(channel.address, async(rawMessage) => {
          operationLogger.info('incoming message');

          const service = services[operationId];

          if (!service) {
            operationLogger.error('handler not found');
            return;
          }

          let parsedMessage;

          try {
            parsedMessage = JSON.parse(rawMessage);
          } catch(_) {
            operationLogger.error('Message is not json');
            return;
          }

          let validatedMessage;

          for (const message of messages) {
            if (message.compiledSchema(parsedMessage)) {
              if (validatedMessage) {
                operationLogger.error(`More than one message valid`);
                return;
              } else {
                validatedMessage = parsedMessage;
              }
            }
          }

          if (!validatedMessage) {
            operationLogger.error(`No message valid`);
            return;
          }

          try {
            await service(validatedMessage);
          } catch(e) {
            operationLogger.error(`Runtime error: ${e?.stack ?? e?.message ?? e}`);
          }
        }));
      } else if (operation.action === 'send') {
        if (!sender[operationId]) {
          senderServers.set(operationId, [server.instance]);
          sender[operationId] = async(rawMessage) => {
            operationLogger.info('sending message');

            let validatedMessage;

            for (const message of messages) {
              if (message.compiledSchema(rawMessage)) {
                if (validatedMessage) {
                  operationLogger.error(`More than one message valid`);
                  return;
                } else {
                  validatedMessage = rawMessage;
                }
              }
            }

            if (!validatedMessage) {
              operationLogger.error(`No message valid`);
              return;
            }

            let serializedMessage;

            try {
              serializedMessage = JSON.stringify(validatedMessage);
            } catch(_) {
              operationLogger.error('Message is not serializable');
              return;
            }
            try {
              await Promise.all(senderServers.get(operationId)
                .map((server) => server.publish(channel.address, serializedMessage)));
            } catch(e) {
              operationLogger.error(`Runtime error: ${e?.stack ?? e?.message ?? e}`);
            }
          };
        } else {
          senderServers.get(operationId).push(server.instance);
        }
      }
    }
  }

  return {
    receiver: {
      run: async() => {
        await Promise.all(Array.from(serverConnectors.values()).map(({connect}) => connect()));
        await Promise.all(listenPromises.map((listen) => listen()));
        await Promise.all(Array.from(serverConnectors.values()).map(({listen}) => listen()));
      },
      dispose: async() => {
        await Promise.all(Array.from(serverConnectors.values()).map(({close}) => close()));
      }
    },
    sender
  };
}

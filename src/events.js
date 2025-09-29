import path from 'node:path';
import process from 'node:process';

import pino from 'pino';
import redis from 'redis';
import amqplib from 'amqplib';
import $RefParser from '@apidevtools/json-schema-ref-parser';

export async function receiver(services, settings) {
  const {servers, channels, operations} =  await $RefParser.dereference(path.join(process.cwd(), settings.specPath));
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

    switch (server.protocol) {
      case 'redis': {
        server.instance = redis.createClient({
          url: server.url,
          RESP: Number(server.protocolVersion || '2')
        });
        break;
      }
      case 'amqp': {
        if (server.protocolVersion && server.protocolVersion.replace(/-/g, '.') !== '0.9.1') {
          throw new Error(`Unsupported server protocol version: ${server.protocolVersion}`);
        }

        server.instance = {
          connect: () => amqplib.connect(server.url).then((conn) => {
            server.instance.conn = conn;
          }),
          close: () => server.instance.conn?.close()
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
  const listenPromises = [];

  for (const operationId in operations) {
    const operation = operations[operationId];
    const operationLogger = logger.child({operationId, event: operation.channel.address});

    if (operation.action === 'receive') {
      const {channel, messages} = operation;
      const operationServers = channel.servers ?? Object.values(servers);
      const listener = async(rawMessage) => {
        operationLogger.info('incoming message');

        const service = services[operationId];

        if (!service) {
          operationLogger.error('handler not found');
          return;
        }

        const parsedMessage = JSON.parse(rawMessage);

        let validatedMessage;

        for (const message of messages) {
          if (message.compiledSchema(parsedMessage)) {
            if (validatedMessage) {
              operationLogger.error(`More than one message vliad`);
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
      };

      for (const server of operationServers) {
        if (!server.id || !server.instance) {
          continue;
        }
        if (!serverConnectors.has(server.id)) {
          serverConnectors.set(server.id, {
            listen: () => server.instance.connect()
              .then(() => logger.info(`Server connected to ${server.url}`)),
            dispose: () => server.instance.close()
          });
        }

        switch (server.protocol) {
          case 'redis': {
            listenPromises.push(() => server.instance.subscribe(channel.address, listener));
            break;
          }
          case 'amqp': {
            listenPromises.push(() => server.instance.conn?.createChannel()
              .then((ch) => ch.consume(channel.address, async(msg) => {
                await ch.ack(msg);
                await listener(msg.content.toString());
              })));
            break;
          }
        }
      }
    }
  }

  return {
    run: async() => {
      await Promise.all(Array.from(serverConnectors.values()).map(({listen}) => listen()));
      await Promise.all(listenPromises.map((listen) => listen()));
    },
    dispose: async() => {
      await Promise.all(Array.from(serverConnectors.values()).map(({dispose}) => dispose()));
    }
  };
}

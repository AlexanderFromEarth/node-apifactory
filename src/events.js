import path from 'node:path';
import process from 'node:process';

import pino from 'pino';
import redis from 'redis';
import $RefParser from '@apidevtools/json-schema-ref-parser';

export async function receiver(services, settings) {
  const {servers, channels, operations} =  await $RefParser.dereference(path.join(process.cwd(), settings.specPath));
  const logger = pino({level: settings.logLevel});

  for (const serverId in servers) {
    const server = servers[serverId];
    const {
      host: serverHost,
      pathname,
      protocol,
      'x-labels': serverLabels
    } = server;

    if (!serverHost || !protocol) {
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

    server.url = `${protocol}://${serverHost}${pathname}`;
    server.id = serverId;

    if (server.variables) {
      for (const varName in server.variables) {
        const value = settings.variables[varName] ?? server.variables[varName].default;

        server.url = server.url.replace(`{${varName}}`, value);
      }
    }

    switch (server.protocol) {
      case 'redis': {
        server.instance = redis.createClient({url: server.url});
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

        switch (server.protocol) {
          case 'redis': {
            if (!serverConnectors.has(server.id)) {
              serverConnectors.set(server.id, {
                listen: () => server.instance.connect()
                  .then(() => logger.info(`Server connected to ${server.url}`)),
                dispose: () => server.instance.close()
              });
            }

            listenPromises.push(() => server.instance.subscribe(channel.address, listener));
            break;
          }
          default: {
            throw new Error(`Unsupported server protocol: ${server.protocol}`);
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

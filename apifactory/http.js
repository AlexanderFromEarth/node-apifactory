import path from 'node:path';
import process from 'node:process';

import $RefParser from '@apidevtools/json-schema-ref-parser';
import fastify from 'fastify';

import * as service from './services.js';

export default async function http() {
  const app = fastify({
    logger: {
      level: process.env.HTTP_LOG_LEVEL || process.env.LOG_LEVEL || 'info',
      timestamp: true
    },
    return503OnClosing: true,
    ignoreTrailingSlash: true,
    ajv: {
      customOptions: {
        removeAdditional: true,
        coerceTypes: true,
        useDefaults: true
      }
    }
  });

  const specPath = process.env.HTTP_SPEC_PATH || './spec.yml';
  const labels = {};

  for (const envVar in process.env) {
    const envPrefix = 'HTTP_LABEL_';

    if (envVar.startsWith(envPrefix)) {
      const name = envVar
        .slice(envPrefix.length)
        .toLowerCase()
        .replaceAll(/([_][a-z])/g, (group) => group
          .toUpperCase()
          .replace('_', ''));

      labels[name] = process.env[envVar];
    }
  }

  labels.env = process.env.NODE_ENV || 'development';

  const {servers, paths} =  await $RefParser.dereference(path.join(process.cwd(), specPath));
  let exactServer;
  let fuzzyServer;

  for (const server of servers) {
    let {url: serverUrl, 'x-labels': serverLabels} = server;

    if (!serverUrl || !serverLabels) {
      continue;
    }

    let isNotEvery = false;
    let isSome = false;

    for (const varName in serverLabels) {
      if (serverLabels[varName] === labels[varName]) {
        isSome = true;
      } else {
        isNotEvery = true;
      }
    }

    if (isSome && !fuzzyServer) {
      fuzzyServer = server;
    }
    if (!isNotEvery) {
      exactServer = server;
      break;
    }
  }

  const server = exactServer ?? fuzzyServer ?? servers[0] ?? {url: 'http://0.0.0.0'};
  let serverUrl = server.url;

  if (server.variables) {
    const vars = {};

    for (const envVar in process.env) {
      const envPrefix = 'HTTP_VARIABLE_';

      if (envVar.startsWith(envPrefix)) {
        const name = envVar
          .slice(envPrefix.length)
          .toLowerCase()
          .replaceAll(/([_][a-z])/g, (group) => group
            .toUpperCase()
            .replace('_', ''));

        vars[name] = process.env[envVar];
      }
    }

    for (const varName in server.variables) {
      const value = vars[varName] ?? server.variables[varName].default;

      serverUrl = serverUrl.replace(`{${varName}}`, value);
    }
  }

  const {hostname: host, port, pathname: serverPath} = new URL(serverUrl);

  const services = await service.load();

  const allowedMethods = new Set(['get', 'post', 'put', 'patch', 'delete']);

  for (const path in paths) {
    const pathObject = paths[path];

    for (const method of allowedMethods) {
      if (method in pathObject) {
        const methodObject = pathObject[method];
        const bodyName = methodObject.requestBody?.['x-name'] ?? 'body';
        const schema = {};

        if (methodObject.requestBody?.content?.['application/json']?.schema) {
          schema.body = methodObject.requestBody?.content['application/json'].schema;
        }

        if (methodObject.responses) {
          for (const statusCode in methodObject.responses) {
            if (methodObject.responses[statusCode]?.content?.['application/json']?.schema) {
              if (!schema.response) {
                schema.response = {};
              }

              schema.response[statusCode] =
                methodObject.responses[statusCode]?.content?.['application/json']?.schema;
            }
          }
        }

        for (const parameters of [pathObject.parameters, methodObject.parameters]) {
          if (!parameters) {
            continue;
          }

          for (const parameter of parameters) {
            switch (parameter.in) {
              case 'path': {
                if (!schema.params) {
                  schema.params = {
                    type: 'object',
                    required: [],
                    properties: {}
                  };
                }

                schema.params.properties[parameter.name] = parameter.schema;
                schema.params.required.push(parameter.name);
                break;
              }
              case 'query': {
                if (!schema.querystring) {
                  schema.querystring = {
                    type: 'object',
                    required: [],
                    properties: {}
                  };
                }

                schema.querystring.properties[parameter.name] = parameter.schema;

                if (parameter.required) {
                  schema.querystring.required.push(parameter.name);
                }

                break;
              }
            }
          }
        }

        const operation = services[methodObject.operationId];
        const operationPath = path.replaceAll(/\{([^}]+)}/g, (_, param) => `:${param}`);

        app.route({
          method,
          path: `${serverPath}/${operationPath}`.replaceAll(/\/{2,}/g, '/'),
          schema,
          async handler(req, reply) {
            const {result: payload, meta} = await operation({
              ...req.params,
              ...req.query,
              ...req.body && {[bodyName]: req.body}
            });

            const linkEntries = [];

            for (const rel in meta.links) {
              linkEntries.push(`<${meta.links[rel]}>; rel=${rel}`);
            }

            reply.header('link', linkEntries.join(', '));

            return payload;
          }
        });
      }
    }
  }

  const dispose = async() => {
    await app.close();
  };

  return {
    run: async() => {
      process.on('SIGTERM', dispose);
      process.on('SIGINT', dispose);
      await app.listen({host, port: Number(port)});
    }
  };
}

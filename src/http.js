import path from 'node:path';
import process from 'node:process';

import $RefParser from '@apidevtools/json-schema-ref-parser';
import fastify from 'fastify';

export default async function http(services, settings) {
  const app = fastify({
    logger: {
      level: settings.logLevel,
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

  const {servers, paths} =  await $RefParser.dereference(path.join(process.cwd(), settings.specPath));
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
      if (serverLabels[varName] === settings.labels[varName]) {
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
    for (const varName in server.variables) {
      const value = settings.variables[varName] ?? server.variables[varName].default;

      serverUrl = serverUrl.replace(`{${varName}}`, value);
    }
  }

  const {hostname: host, port, pathname: serverPath} = new URL(serverUrl);

  const allowedMethods = new Set(['get', 'post', 'put', 'patch', 'delete']);
  const errorSchema = {
    type: 'object',
    required: ['code', 'message'],
    properties: {
      code: {
        type: 'string',
        enum: ['invalid', 'noAccess', 'notExists', 'alreadyExists', 'deleted', 'error']
      },
      message: {
        type: 'string',
        minLength: 1
      }
    }
  };

  for (const path in paths) {
    const pathObject = paths[path];

    for (const method of allowedMethods) {
      if (method in pathObject) {
        const methodObject = pathObject[method];
        const bodyName = methodObject.requestBody?.['x-name'] ?? 'body';
        const schema = {
          response: {
            400: errorSchema,
            403: errorSchema,
            404: errorSchema,
            409: errorSchema,
            410: errorSchema,
            422: errorSchema
          }
        };

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
            if (!operation) {
              return reply.code(404).send();
            }

            const {result, meta} = await operation({
              ...req.params,
              ...req.query,
              ...req.body && {[bodyName]: req.body}
            });

            const linkEntries = [];

            for (const rel in meta.links) {
              linkEntries.push(`<${meta.links[rel]}>; rel=${rel}`);
            }

            reply.header('link', linkEntries.join(', '));

            if (result.success) {
              return result.payload;
            }

            switch (result.error?.code) {
              case 'invalid': {
                return reply.code(400).send(result.error);
              }
              case 'noAccess': {
                return reply.code(403).send(result.error);
              }
              case 'notExists': {
                return reply.code(404).send(result.error);
              }
              case 'alreadyExists': {
                return reply.code(409).send(result.error);
              }
              case 'deleted': {
                return reply.code(410).send(result.error);
              }
              default: {
                return reply.code(422).send(result.error);
              }
            }
          }
        });
      }
    }
  }

  return {
    run: async() => {
      await app.listen({host, port: Number(port || '8080')});
    },
    dispose: async() => {
      await app.close();
    }
  };
}

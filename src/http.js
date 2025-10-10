import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import $RefParser from '@apidevtools/json-schema-ref-parser';
import fastify from 'fastify';

export async function load(services, settings) {
  const specPath = path.join(process.cwd(), settings.specPath);
  const hasSpec = await fs.stat(specPath).then(() => true, () => false);

  if (!hasSpec) {
    return null;
  }

  const serverByUrl = new Map()
  const schemaCompilers = {
    body: settings.ajv,
    params: settings.ajv,
    querystring: settings.ajv,
    headers: settings.ajv
  };

  const registerServers = (servers) => {
    let idx = 0;
    const toRemove = [];

    for (const server of servers) {
      if (!server.url) {
        toRemove.push(idx);
        continue;
      }

      let isEvery = true;

      for (const varName in server['x-labels']) {
        if (server['x-labels'][varName] !== settings.labels[varName]) {
          isEvery = false;
          break;
        }
      }

      if (!isEvery) {
        toRemove.push(idx);
        continue;
      }

      if (server.variables) {
        for (const varName in server.variables) {
          const value = settings.variables[varName] ?? server.variables[varName].default;

          server.url = server.url.replace(`{${varName}}`, value);
        }
      }

      if (serverByUrl.has(server.url)) {
        toRemove.push(idx);
        continue;
      }

      idx += 1;
      serverByUrl.set(server.url, server);

      const {hostname, port, pathname} = new URL(server.url);

      server.host = hostname;
      server.port = Number(port) || 8080;
      server.pathname = pathname;
      server.instance = fastify({
        logger: {
          level: settings.logLevel,
          timestamp: true
        },
        return503OnClosing: true,
        ignoreTrailingSlash: true
      }).setValidatorCompiler((req) => {
        if (!req.httpPart) {
          throw new Error('Missing httpPart')
        }

        const compiler = schemaCompilers[req.httpPart]

        if (!compiler) {
          throw new Error(`Missing compiler for ${req.httpPart}`)
        }

        return compiler.compile(req.schema)
      }).setErrorHandler((err, req, reply) => {
        reply.code(err.statusCode ?? 500).send();
      });
    }

    for (const idx of toRemove) {
      servers.splice(servers.length - idx - 1, 1);
    }
  };

  const {servers, paths} =  await $RefParser.dereference(specPath);

  registerServers(servers);

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

  const serverConnectors = new Map();

  for (const path in paths) {
    const pathObject = paths[path];

    if (pathObject.servers) {
      registerServers(pathObject.servers);
    }

    const pathServers = pathObject.servers ?? servers;

    for (const method of allowedMethods) {
      if (method in pathObject) {
        const methodObject = pathObject[method];

        if (methodObject.servers) {
          registerServers(methodObject.servers);
        }

        const methodServers = methodObject.servers ?? pathServers;
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

        const operationPath = path.replaceAll(/\{([^}]+)}/g, (_, param) => `:${param}`);
        const handler = async(req, reply) => {
          const operation = services[methodObject.operationId];

          if (!operation) {
            return reply.code(405).send();
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
        };

        for (const server of methodServers) {
          if (!serverConnectors.has(server.url)) {
            serverConnectors.set(server.url, {
              listen: () => server.instance.listen({host: server.host, port: server.port}),
              dispose: () => server.instance.close()
            });
          }

          server.instance.route({
            path: `${server.pathname}/${operationPath}`.replaceAll(/\/{2,}/g, '/'),
            method,
            schema,
            handler
          });
        }
      }
    }
  }

  return {
    receiver: {
      run: async() => {
        await Promise.all(Array.from(serverConnectors.values(), ({listen}) => listen()));
      },
      dispose: async() => {
        await Promise.all(Array.from(serverConnectors.values(), ({dispose}) => dispose()));
      }
    }
  }
}

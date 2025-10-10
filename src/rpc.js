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

  const jsonrpc = '2.0';
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
      server.methodNames = new Set();
      server.requests = [];
      server.responses = [];
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
        const id = req.body?.id ?? null;

        reply.code(200);

        if (err.statusCode === 400 && err instanceof SyntaxError) {
          reply.send({id, jsonrpc, error: {code: -32700, message: 'Parse error'}});
        } else if (
          err.statusCode === 400 && !(
            (
              !req.body?.id || Number(req.body?.id)
            ) &&
            req.body?.jsonrpc === '2.0' &&
            typeof req.body?.method === 'string' &&
            (
              !req.body?.params || typeof req.body?.params === 'object'
            )
          )
        ) {
          reply.send({id, jsonrpc, error: {code: -32600, message: 'Invalid Request'}});
        } else if (err.statusCode === 400 && !server.methodNames.has(req.body.method)) {
          reply.send({id, jsonrpc, error: {code: -32601, message: 'Method not found'}});
        } else if (err.statusCode === 400) {
          reply.send({id, jsonrpc, error: {code: -32602, message: 'Invalid params'}});
        } else {
          reply.send({id, jsonrpc, error: {code: -32603, message: 'Internal error'}});
        }
      });
    }

    for (const idx of toRemove) {
      servers.splice(servers.length - idx - 1, 1);
    }
  };

  const {servers, methods} =  await $RefParser.dereference(specPath);

  registerServers(servers);

  const nameByPositionByMethod = new Map();
  const idSchema = {anyOf: [{type: 'integer'}, {type: 'string'}, {type: 'null'}]};
  const jsonrpcSchema = {enum: [jsonrpc]};
  const serverConnectors = new Map();

  for (const {name, paramStructure, params, result, servers: localMethodServers} of methods) {
    if (localMethodServers) {
      registerServers(localMethodServers);
    }

    const methodServers = localMethodServers ?? servers;
    const request = {
      type: 'object',
      required: ['jsonrpc', 'method', 'params'],
      properties: {
        id: idSchema,
        jsonrpc: jsonrpcSchema,
        method: {enum: [name]}
      }
    };
    const response = {
      type: 'object',
      required: ['id', 'jsonrpc', 'result'],
      properties: {
        id: idSchema,
        jsonrpc: jsonrpcSchema,
        result: result?.schema ?? {type: 'null'}
      }
    };
    const requiredParams = new Set();
    const byNameSchema = {
      type: 'object',
      required: [],
      properties: {}
    };
    const byPositionSchema = {
      type: 'array',
      prefixItems: [],
      minItems: 0,
      items: false
    };
    const nameByPosition = new Map();
    let idx = 0;

    for (const {name, schema, required} of params) {
      byNameSchema.properties[name] = schema;
      byPositionSchema.prefixItems.push(schema);
      nameByPosition.set(idx++, name);

      if (required && !requiredParams.has(name)) {
        requiredParams.add(name);
        byNameSchema.required.push(name);
        byPositionSchema.minItems += 1;
      }
    }

    nameByPositionByMethod.set(name, nameByPosition);

    switch (paramStructure) {
      case 'by-name': {
        request.properties.params = byNameSchema;
        break;
      }
      case 'by-position': {
        request.properties.params = byPositionSchema;
        break;
      }
      default: {
        request.properties.params = {oneOf: [byNameSchema, byPositionSchema]};
        break;
      }
    }

    for (const server of methodServers) {
      if (!serverConnectors.has(server.url)) {
        serverConnectors.set(server.url, {
          listen: () => server.instance.listen({host: server.host, port: server.port}),
          dispose: () => server.instance.close()
        });
      }

      server.methodNames.add(name);
      server.requests.push(request);
      server.responses.push(response);
    }
  }

  const handler = async(req, reply) => {
    const {id, method, params: reqParams} = req.body;
    const operation = services[method];
    let replied = false;

    if (!id) {
      reply.code(200).send({jsonrpc, method});
      replied = true;
    }
    if (!operation) {
      return !replied && reply.code(200)
        .send({id, jsonrpc, error: {code: -32601, message: 'Method not found'}});
    }

    const nameByPosition = nameByPositionByMethod.get(method);
    const params = Array.isArray(reqParams) ? reqParams.reduce((res, value, pos) => {
      res[nameByPosition.get(pos)] = value;

      return res;
    }, {}) : reqParams;
    const {result} = await operation(params);

    if (result.success) {
      return !replied && reply.code(200)
        .send({id, jsonrpc, result: result.payload ?? null});
    }

    let error;

    switch (result.error?.code) {
      case 'invalid': {
        error = {code: -32000, message: result.error.message};
        break;
      }
      case 'noAccess': {
        error = {code: -32001, message: result.error.message};
        break;
      }
      case 'notExists': {
        error = {code: -32002, message: result.error.message};
        break;
      }
      case 'alreadyExists': {
        error = {code: -32003, message: result.error.message};
        break;
      }
      case 'deleted': {
        error = {code: -32004, message: result.error.message};
        break;
      }
      default: {
        error = {code: -32005, message: result.error.message};
        break;
      }
    }

    return !replied && reply.code(200)
      .send({id, jsonrpc, error});
  };

  for (const server of serverByUrl.values()) {
    server.instance.route({
      method: 'POST',
      path: server.pathname.replaceAll(/\/{2,}/g, '/'),
      schema: {
        body: {oneOf: server.requests},
        response: {
          200: {
            anyOf: server.responses.concat([
              {
                type: 'object',
                required: ['jsonrpc', 'method'],
                properties: {jsonrpc: jsonrpcSchema, method: {enum: Array.from(server.methodNames)}}
              },
              {
                type: 'object',
                required: ['id', 'jsonrpc', 'error'],
                properties: {
                  id: idSchema,
                  jsonrpc: jsonrpcSchema,
                  error: {
                    type: 'object',
                    required: ['code', 'message'],
                    properties: {
                      code: {
                        type: 'number',
                        enum: [
                          -32700, // Parse error
                          -32600, // Invalid Request
                          -32601, // Method not found
                          -32602, // Invalid params
                          -32603, // Internal error
                          -32000, // invalid
                          -32001, // noAccess
                          -32002, // notExists
                          -32003, // alreadyExists
                          -32004, // deleted
                          -32005, // error
                        ]
                      },
                      message: {
                        type: 'string',
                        minLength: 1
                      }
                    }
                  }
                }
              }
            ])
          }
        }
      },
      handler
    });
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
  };
}

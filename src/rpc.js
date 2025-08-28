import path from 'node:path';
import process from 'node:process';

import $RefParser from '@apidevtools/json-schema-ref-parser';
import fastify from 'fastify';
import Ajv from 'ajv/dist/2020.js';

export async function receiver(services, settings) {
  const jsonrpc = '2.0';
  const app = fastify({
    logger: {
      level: settings.logLevel,
      timestamp: true
    },
    return503OnClosing: true,
    ignoreTrailingSlash: true
  });
  const ajvOptions = {
    removeAdditional: true,
    coerceTypes: true,
    useDefaults: true
  };
  const schemaCompilers = {
    body: new Ajv(ajvOptions),
    params: new Ajv(ajvOptions),
    querystring: new Ajv(ajvOptions),
    headers: new Ajv(ajvOptions),
  };

  app.setValidatorCompiler((req) => {
    if (!req.httpPart) {
      throw new Error('Missing httpPart')
    }
    const compiler = schemaCompilers[req.httpPart]
    if (!compiler) {
      throw new Error(`Missing compiler for ${req.httpPart}`)
    }
    return compiler.compile(req.schema)
  });
  app.setErrorHandler((err, req, reply) => {
    const id = req.body?.id ?? null;

    reply.code(200);

    if (err.statusCode === 400 && err instanceof SyntaxError) {
      reply.send({id, jsonrpc, error: {code: -32700, message: 'Parse error'}});
    } else if (
      err.statusCode === 400 && !(
        (!req.body?.id || Number(req.body?.id)) &&
        req.body?.jsonrpc === '2.0' &&
        typeof req.body?.method === 'string' &&
        (!req.body?.params || typeof req.body?.params === 'object')
      )
    ) {
      reply.send({id, jsonrpc, error: {code: -32600, message: 'Invalid Request'}});
    } else if (err.statusCode === 400 && !methodNames.has(req.body.method)) {
      reply.send({id, jsonrpc, error: {code: -32601, message: 'Method not found'}});
    } else if (err.statusCode === 400) {
      reply.send({id, jsonrpc, error: {code: -32602, message: 'Invalid params'}});
    } else {
      reply.send({id, jsonrpc, error: {code: -32603, message: 'Internal error'}});
    }
  });

  const {servers, methods} =  await $RefParser.dereference(path.join(process.cwd(), settings.specPath));
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
  const methodNames = new Set();
  const requests = [];
  const responses = [];
  const nameByPositionByMethod = new Map();
  const idSchema = {anyOf: [{type: 'integer'}, {type: 'string'}, {type: 'null'}]};
  const jsonrpcSchema = {enum: [jsonrpc]};

  for (const {name, paramStructure, params, result} of methods) {
    const request = {
      type: 'object',
      required: ['jsonrpc', 'method', 'params'],
      properties: {
        id: idSchema,
        jsonrpc: jsonrpcSchema,
        method: {enum: [name]}
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

    methodNames.add(name);
    requests.push(request);
    responses.push({
      type: 'object',
      required: ['id', 'jsonrpc', 'result'],
      properties: {
        id: idSchema,
        jsonrpc: jsonrpcSchema,
        result: result?.schema ?? {type: 'null'}
      }
    });
  }

  app.route({
    method: 'POST',
    path: serverPath.replaceAll(/\/{2,}/g, '/'),
    schema: {
      body: {oneOf: requests},
      response: {
        200: {
          anyOf: responses.concat([
            {
              type: 'object',
              required: ['jsonrpc', 'method'],
              properties: {jsonrpc: jsonrpcSchema, method: {enum: Array.from(methodNames)}}
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
    async handler(req, reply) {
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
    }
  });

  return {
    run: async() => {
      await app.listen({host, port: Number(port || '8081')});
    },
    dispose: async() => {
      await app.close();
    }
  };
}

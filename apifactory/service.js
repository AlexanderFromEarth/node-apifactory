import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as process from 'node:process';

import $RefParser from '@apidevtools/json-schema-ref-parser';
import fastify from 'fastify';

export async function service() {
  const app = fastify({
    logger: true,
  });
  const [openapi, controllers] = await Promise.all([
    loadOpenapi(),
    loadControllers(),
  ]);

  for (const route of buildRoutes(openapi, controllers)) {
    app.route(route);
  }

  return app;
}

function buildRoutes(openapi, controllers) {
  const routes = [];
  const paths = openapi.paths;

  if (!paths) {
    throw new Error('No paths in specification');
  }

  const allowedMethods = new Set(['get', 'post', 'put', 'patch', 'delete']);

  for (const path in paths) {
    const pathObject = paths[path];

    for (const method in pathObject) {
      if (allowedMethods.has(method)) {
        const methodObject = pathObject[method];
        const schema = {
          params: {
            type: 'object',
            required: [],
            properties: {},
          },
          querystring: {
            type: 'object',
            required: [],
            properties: {},
          },
          body: methodObject.requestBody?.content?.['application/json']?.schema,
          response: {},
        };

        if (methodObject.responses) {
          for (const statusCode in methodObject.responses) {
            if (methodObject.responses[statusCode]?.content?.['application/json']?.schema) {
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
                schema.params.properties[parameter.name] = parameter.schema;
                schema.params.required.push(parameter.name);
                break;
              }
              case 'query': {
                schema.querystring.properties[parameter.name] = parameter.schema;

                if (schema.querystring) {
                  schema.querystring.required.push(parameter.name);
                }

                break;
              }
            }
          }
        }

        const controller = controllers[methodObject.operationId];

        routes.push({
          method,
          path,
          schema,
          async handler(req) {
            return await controller({
              ...req.params,
              ...req.query,
              body: req.body,
            });
          }
        });
      }
    }
  }

  return routes;
}

async function loadOpenapi() {
  const specPath = process.env.APIFACTORY_SPEC_PATH || './spec.yml';

  return await $RefParser.dereference(path.join(process.cwd(), specPath));
}

async function loadControllers() {
  const controllers = {};
  const controllersPath = process.env.APIFACTORY_CONTROLLERS_PATH || './controllers';
  const controllersDir = path.join(process.cwd(), controllersPath);

  for (const filename of await fs.readdir(controllersDir)) {
    if (!filename.endsWith('.js')) {
      continue;
    }

    const filePath = path.join(controllersDir, filename);
    const stat = await fs.stat(filePath);

    if (stat.isFile()) {
      const module = await import(filePath);

      Object.assign(controllers, module);
    }
  }

  return controllers;
}

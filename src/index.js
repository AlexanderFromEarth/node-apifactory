import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import Ajv from 'ajv/dist/2020.js';
import {default as addFormats} from 'ajv-formats';

import * as http from './http.js';
import * as rpc from './rpc.js';
import * as events from './events.js';
import * as env from './env.js';
import * as modules from './modules.js';
import * as services from './services.js';

export default async function app() {
  const packageJsonPath = path.join(process.cwd(), env.get('packagePath', './package.json'));
  const appName = env.get('appName') ?? await fs.readFile(packageJsonPath, 'utf8')
    .then((content) => JSON.parse(content).name)
    .catch(() => 'node-apifactory');
  const ajv = new Ajv({
    removeAdditional: true,
    coerceTypes: true,
    useDefaults: true
  });

  addFormats(ajv);

  const appModules = {};
  const appServices = {};
  const apps = {
    http: await http.load(appServices, {
      ajv,
      appName,
      specPath: env.get('httpSpecPath', './openapi.yml'),
      logLevel: env.get('httpLogLevel', 'info'),
      labels: env.getByPrefix('httpLabel'),
      variables: env.getByPrefix('httpVariable')
    }),
    rpc: await rpc.load(appServices, {
      ajv,
      appName,
      specPath: env.get('rpcSpecPath', './openrpc.yml'),
      logLevel: env.get('rpcLogLevel', 'info'),
      labels: env.getByPrefix('rpcLabel'),
      variables: env.getByPrefix('rpcVariable')
    }),
    events: await events.load(appServices, {
      ajv,
      appName,
      specPath: env.get('eventsSpecPath', './asyncapi.yml'),
      logLevel: env.get('eventsLogLevel', 'info'),
      labels: env.getByPrefix('eventsLabel'),
      variables: env.getByPrefix('eventsVariable')
    })
  };

  if (apps.events) {
    appModules.events = {
      name: 'events',
      make: () => ({action: () => apps.events.sender})
    };
  }

  const resolvedModules = await modules.load(env.get('modulesPath', './modules'), appModules);
  await services.load(env.get('servicesPath', './services'), resolvedModules, appServices);

  const dispose = async() => {
    for (const name in resolvedModules) {
      await resolvedModules[name].dispose?.();
    }
    for (const name in apps) {
      await apps[name]?.receiver?.dispose?.();
    }
  };

  process.on('SIGINT', dispose);
  process.on('SIGTERM', dispose);

  const waiting = [];

  for (const type in apps) {
    waiting.push(apps[type]?.receiver?.run());
  }

  await Promise.all(waiting);
}

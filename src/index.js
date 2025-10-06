import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import Ajv from 'ajv/dist/2020.js';

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
  const httpSpecPath = env.get('httpSpecPath', './openapi.yml');
  const rpcSpecPath = env.get('rpcSpecPath', './openrpc.yml');
  const eventsSpecPath = env.get('eventsSpecPath', './asyncapi.yml');
  const [hasHttp, hasRpc, hasEvents] = await Promise.all([
    fs.stat(httpSpecPath).then(() => true, () => false),
    fs.stat(rpcSpecPath).then(() => true, () => false),
    fs.stat(eventsSpecPath).then(() => true, () => false)
  ]).then((apps) => {
    if (!apps.some(Boolean)) {
      throw new Error(`No apps started`);
    }

    return apps;
  });

  const ajv = new Ajv({
    removeAdditional: true,
    coerceTypes: true,
    useDefaults: true
  });

  const appModules = {};
  const appServices = {};
  const apps = {};

  if (hasHttp) {
    apps.http = await http.receiver(appServices, {
      ajv,
      appName,
      specPath: httpSpecPath,
      logLevel: env.get('httpLogLevel', 'info'),
      labels: env.getByPrefix('httpLabel'),
      variables: env.getByPrefix('httpVariable')
    });
  }
  if (hasRpc) {
    apps.rpc = await rpc.receiver(appServices, {
      ajv,
      appName,
      specPath: rpcSpecPath,
      logLevel: env.get('rpcLogLevel', 'info'),
      labels: env.getByPrefix('rpcLabel'),
      variables: env.getByPrefix('rpcVariable')
    });
  }
  if (hasEvents) {
    apps.events = await events.receiver(appServices, {
      ajv,
      appName,
      specPath: eventsSpecPath,
      logLevel: env.get('eventsLogLevel', 'info'),
      labels: env.getByPrefix('eventsLabel'),
      variables: env.getByPrefix('eventsVariable')
    });
  }

  await modules.load(env.get('modulesPath', './modules'), appModules);
  await services.load(env.get('servicesPath', './services'), appModules, appServices);

  const dispose = async() => {
    for (const name in appModules) {
      await appModules[name].dispose?.();
    }
    for (const name in apps) {
      await apps[name].dispose?.();
    }
  };

  process.on('SIGINT', dispose);
  process.on('SIGTERM', dispose);

  const waiting = [];

  for (const type in apps) {
    waiting.push(apps[type].run());
  }

  await Promise.all(waiting);
}

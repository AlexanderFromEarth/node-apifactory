import process from 'node:process';
import fs from 'node:fs/promises';

import {default as http} from './http.js';
import {default as rpc} from './rpc.js';
import * as env from './env.js';
import * as modules from './modules.js';
import * as services from './services.js';

export default async function app() {
  const appModules = await modules.load(env.get('modulesPath', './modules'));
  const appServices = await services.load(env.get('servicesPath', './services'), appModules);
  const apps = {};
  const httpSpecPath = env.get('httpSpecPath', './openapi.yml');
  const rpcSpecPath = env.get('rpcSpecPath', './openrpc.yml');
  const [hasHttp, hasRpc] = await Promise.all([
    fs.stat(httpSpecPath).then(() => true, () => false),
    fs.stat(rpcSpecPath).then(() => true, () => false)
  ]);

  if (hasHttp) {
    apps.http = await http(appServices, {
      specPath: httpSpecPath,
      logLevel: env.get('httpLogLevel', 'info'),
      labels: env.getByPrefix('httpLabel'),
      variables: env.getByPrefix('httpVariable')
    });
  }
  if (hasRpc) {
    apps.rpc = await rpc(appServices, {
      specPath: rpcSpecPath,
      logLevel: env.get('rpcLogLevel', 'info'),
      labels: env.getByPrefix('rpcLabel'),
      variables: env.getByPrefix('rpcVariable')
    });
  }

  if (!Object.keys(apps).length) {
    throw new Error(`No apps started`);
  }

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

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import * as result from './result.js';
import * as env from './env.js';
import * as logger from './logging.js';
import * as redis from './redis.js';
import * as sql from './sql.js';
import * as ids from './ids.js';

export async function load(modulesPath, modules) {
  const modulesDir = path.join(process.cwd(), modulesPath);
  const hasModules = await fs.stat(modulesDir)
    .then(() => true)
    .catch(() => false);

  modules[env.name] = env;
  modules[logger.name] = logger;
  modules[redis.name] = redis;
  modules[sql.name] = sql;
  modules[ids.name] = ids;

  if (hasModules) {
    for (const filename of await fs.readdir(modulesDir)) {
      if (!filename.endsWith('.js') && !filename.endsWith('.ts')) {
        continue;
      }

      const filePath = path.join(modulesDir, filename);
      const stat = await fs.stat(filePath);

      if (stat.isFile()) {
        const module = await import(filePath);

        if (
          module.name &&
          typeof module.name === 'string' &&
          module.make &&
          typeof module.make === 'function'
        ) {
          modules[module.name] = module;
        }
      }
    }
  }

  const visited = new Set();
  const ancestors = new Set();
  const stack = [];
  const sorted = [];
  let top

  for (const moduleName in modules) {
    const module = modules[moduleName];

    stack.push(module)

    while ((top = stack.at(-1)) !== undefined) {
      const hasNotVisited = top.require?.length && top.require
        .some((moduleName) => !visited.has(modules[moduleName]));

      if (visited.has(top)) {
        stack.pop();
        ancestors.delete(top);
      } else if (ancestors.has(top) && stack.indexOf(top) !== stack.length - 1) {
        throw new Error('circular dependency detected');
      } else if (hasNotVisited) {
        ancestors.add(top);

        for (const moduleName of top.require) {
          if (!modules[moduleName]) {
            throw new Error(`not found module "${moduleName}"`);
          }

          stack.push(modules[moduleName]);
        }
      } else {
        visited.add(top);
        stack.pop();
        ancestors.delete(top);
        sorted.push(top);
      }
    }
  }

  const madeModules = {};

  for (const module of sorted) {
    const requiredModuleActions = {};

    if (module.require) {
      for (const moduleName of module.require) {
        requiredModuleActions[moduleName] = madeModules[moduleName].action;
      }
    }

    madeModules[module.name] = module.make(requiredModuleActions, result);
  }

  return madeModules;
}

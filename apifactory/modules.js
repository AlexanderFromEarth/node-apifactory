import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import logging from './logging.js';
import redis from './redis.js';
import sql from './sql.js';

export async function load() {
  const modules = {};
  const system = {
    logger: logging(),
    sql: sql(),
    redis: redis()
  };
  const modulesPath = process.env.MODULES_PATH || './modules';
  const modulesDir = path.join(process.cwd(), modulesPath);
  const hasModules = await fs.stat(modulesDir)
    .then(() => true)
    .catch(() => false);

  if (!hasModules) {
    return {...system};
  }

  for (const filename of await fs.readdir(modulesDir)) {
    if (!filename.endsWith('.js') && !filename.endsWith('.ts')) {
      continue;
    }

    const filePath = path.join(modulesDir, filename);
    const stat = await fs.stat(filePath);

    if (stat.isFile()) {
      const module = await import(filePath);

      for (const name in module) {
        if (typeof module[name] === 'function') {
          modules[name] = () => module[name](system);
        }
      }
    }
  }

  Object.assign(modules, system);

  return modules;
}

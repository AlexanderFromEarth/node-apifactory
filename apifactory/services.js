import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import * as module from './modules.js';

export async function load() {
  const services = {};
  const servicesPath = process.env.SERVICES_PATH || './services';
  const servicesDir = path.join(process.cwd(), servicesPath);
  const modules = await module.load();

  for (const filename of await fs.readdir(servicesDir)) {
    if (!filename.endsWith('.js') && !filename.endsWith('.ts')) {
      continue;
    }

    const filePath = path.join(servicesDir, filename);
    const stat = await fs.stat(filePath);

    if (stat.isFile()) {
      const module = await import(filePath);

      for (const name in module) {
        if (typeof module[name] === 'function') {
          services[name] = async(params, extraMeta) => {
            const meta = {...extraMeta, links: {}};
            const result = await module[name](params, modules, extraMeta);

            return {result, meta};
          };
        }
      }
    }
  }

  return services;
}

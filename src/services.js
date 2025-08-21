import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import * as result from './result.js';

export async function load(servicesPath, modules) {
  const services = {};
  const servicesDir = path.join(process.cwd(), servicesPath);

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
            const moduleActions = {};

            for (const name in modules) {
              moduleActions[name] = modules[name].action;
            }

            try {
              const payload = await module[name](params, result, moduleActions, meta);

              return {
                result: typeof payload === 'object' && payload !== null && 'success' in payload ?
                  payload :
                  {success: true, payload},
                meta
              };
            } catch(err) {
              if (typeof err === 'object' && err !== null && 'success' in err) {
                return {result: err, meta};
              }

              throw err;
            }
          };
        }
      }
    }
  }

  return services;
}

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

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

            const result = await module[name](params, moduleActions, extraMeta);

            return {result, meta};
          };
        }
      }
    }
  }

  return services;
}

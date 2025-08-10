import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export async function load(modulesPath, systemModules) {
  const modulesDir = path.join(process.cwd(), modulesPath);
  const hasModules = await fs.stat(modulesDir)
    .then(() => true)
    .catch(() => false);

  if (!hasModules) {
    return {...systemModules};
  }

  const systemModuleActions = {};

  for (const name in systemModules) {
    systemModuleActions[name] = systemModules[name].action;
  }

  const modules = {};

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
          modules[name] = module[name](systemModuleActions);
        }
      }
    }
  }

  Object.assign(modules, systemModules);

  return modules;
}

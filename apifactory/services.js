import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export async function load() {
  const services = {};
  const servicesPath = process.env.SERVICES_PATH || './services';
  const servicesDir = path.join(process.cwd(), servicesPath);

  for (const filename of await fs.readdir(servicesDir)) {
    if (!filename.endsWith('.js') && !filename.endsWith('.ts')) {
      continue;
    }

    const filePath = path.join(servicesDir, filename);
    const stat = await fs.stat(filePath);

    if (stat.isFile()) {
      const module = await import(filePath);

      Object.assign(services, module);
    }
  }

  return services;
}

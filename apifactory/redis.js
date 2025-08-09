import process from 'node:process';

import {createClientPool} from 'redis';

export default function redis() {
  const result = {};

  for (const envVar in process.env) {
    const envPostfix = '_REDIS_URL';

    if (envVar.endsWith(envPostfix)) {
      const name = envVar
        .slice(0, -envPostfix.length)
        .toLowerCase()
        .replaceAll(/([_][a-z])/g, (group) => group
          .toUpperCase()
          .replace('_', ''));

      result[name] = createClientPool({url: process.env[envVar]});

      const dispose = async() => {
        await result[name].close();
        result[name].destroy();
      };

      process.on('SIGTERM', dispose);
      process.on('SIGINT', dispose);
    }
  }

  return (name) => {
    if (!(name in result)) {
      throw new Error(`Unknown redis name ${name}`);
    }

    return result[name];
  };
}

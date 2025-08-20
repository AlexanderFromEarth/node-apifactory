import {createClientPool} from 'redis';

export function make({env}) {
  const dbs = env().getByPostfix('redisUrl');
  const result = {};

  for (const name in dbs) {
    result[name] = createClientPool({url: dbs[name]});
  }

  return {
    action: (name) => {
      if (!(name in result)) {
        throw new Error(`Unknown redis name ${name}`);
      }

      return result[name];
    },
    dispose: async() => {
      for (const name in result) {
        await result[name].close();
        result[name].destroy();
      }
    }
  };
}

export const name = 'redis';

export const require = ['env'];

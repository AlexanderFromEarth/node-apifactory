import {createClientPool} from 'redis';

export default function redis(dbs) {
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

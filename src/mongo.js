import mongo from 'mongodb';

export function make({env}) {
  const dbs = env().getByPostfix('mongoUrl');
  const result = {};

  for (const name in dbs) {
    result[name] = new mongo.MongoClient(dbs[name]);
  }

  return {
    action: (name) => {
      if (!(name in result)) {
        throw new Error(`Unknown mongo name ${name}`);
      }

      return result[name].db();
    },
    dispose: async() => {
      for (const name in result) {
        await result[name].close();
      }
    }
  };
}

export const name = 'mongo';

export const require = ['env'];

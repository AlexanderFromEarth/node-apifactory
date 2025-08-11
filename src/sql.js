import * as kysely from 'kysely';
import pg from 'pg';
import mysql from 'mysql2';
import sqlite from 'better-sqlite3';

export default function sql(dbs) {
  const result = {};

  for (const name in dbs) {
    const url = dbs[name];
    let dialect;

    if (url === ':memory:') {
      dialect = new kysely.SqliteDialect({
        database: sqlite(url)
      });
    } else {
      switch (new URL(url).protocol) {
        case 'postgresql:': {
          dialect = new kysely.PostgresDialect({
            pool: new pg.Pool({connectionString: url})
          });
          break;
        }
        case 'mysql:': {
          dialect = new kysely.MysqlDialect({
            pool: mysql.createPool({uri: url})
          });
          break;
        }
        case 'sqlite:': {
          dialect = new kysely.SqliteDialect({
            database: sqlite(new URL(url).hostname)
          });
          break;
        }
        default: {
          throw new Error(`Unknown database protocol ${new URL(url).protocol}`);
        }
      }
    }

    result[name] = new kysely.Kysely({dialect});
  }

  return {
    action: (name) => {
      if (!(name in result)) {
        throw new Error(`Unknown database name ${name}`);
      }

      return {
        query: (query, ...args) => kysely.sql(query, ...args)
          .execute(result[name])
          .then(({rows}) => rows),
        raw: (query, ...args) => kysely.sql(query, ...args),
        transaction: async(arg) => {
          if (Array.isArray(arg)) {
            await result[name].transaction(async(trx) => {
              for (const query of arg) {
                await query.execute(trx);
              }
            });
          } else {
            return await result[name].transaction(async(trx) => await arg({
              query: (query, ...args) => kysely.sql(query, ...args)
                .execute(trx)
                .then(({rows}) => rows),
              raw: (query, ...args) => kysely.sql(query, ...args)
            }));
          }
        }
      };
    },
    dispose: async() => {
      for (const name in result) {
        await result[name].destroy();
      }
    }
  };
}

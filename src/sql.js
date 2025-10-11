import * as kysely from 'kysely';
import pg from 'pg';
import mysql from 'mysql2';
import sqlite from 'better-sqlite3';

export function make({env}, {isResult, success}) {
  const dbs = env().getByPostfix('sqlUrl');
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
          .then(({rows}) => success(rows)),
        raw: (query, ...args) => kysely.sql(query, ...args),
        transaction: async(arg) => {
          try {
            return await result[name].transaction().execute(async(trx) => {
              if (Array.isArray(arg)) {
                for (const query of arg) {
                  const res = await query.execute(trx);

                  if (isResult(res) && !res.success) {
                    throw res;
                  }
                }

                return success();
              } else {
                const res = await arg({
                  query: (query, ...args) => kysely.sql(query, ...args)
                    .execute(trx)
                    .then(({rows}) => rows),
                  raw: (query, ...args) => kysely.sql(query, ...args)
                });

                if (isResult(res) && !res.success) {
                  throw res;
                } else if (isResult(res)) {
                  return res;
                } else {
                  return success(res);
                }
              }
            });
          } catch (err) {
            if (isResult(err)) {
              return err;
            }

            throw err;
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

export const name = 'sql';

export const require = ['env'];

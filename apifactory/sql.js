import process from 'node:process';

import * as kysely from 'kysely';
import pg from 'pg';
import mysql from 'mysql2';
import sqlite from 'better-sqlite3';

export default function sql() {
  const result = {};

  for (const envVar in process.env) {
    const envPostfix = '_DATABASE_URL';

    if (envVar.endsWith(envPostfix)) {
      const name = envVar
        .slice(0, -envPostfix.length)
        .toLowerCase()
        .replaceAll(/([_][a-z])/g, (group) => group
          .toUpperCase()
          .replace('_', ''));
      const url = process.env[envVar];
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

      const database = new kysely.Kysely({dialect});
      const dispose = async() => {
        await database.destroy();
      };

      process.on('SIGTERM', dispose);
      process.on('SIGINT', dispose);

      result[name] = {
        query: (query, ...args) => kysely.sql(query, ...args)
          .execute(database)
          .then(({rows}) => rows),
        raw: (query, ...args) => kysely.sql(query, ...args)
      };
    }
  }

  return (name) => {
    if (!(name in result)) {
      throw new Error(`Unknown database name ${name}`);
    }

    return result[name];
  };
}

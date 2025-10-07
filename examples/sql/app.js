import app from '#node-apifactory';

process.env.MAIN_SQL_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';

await app();

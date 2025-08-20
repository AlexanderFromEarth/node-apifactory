import app from '#node-apifactory';

process.env.MAIN_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';

await app();

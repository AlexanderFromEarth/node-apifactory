import service from 'src';

process.env.MAIN_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';

await service();

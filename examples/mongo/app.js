import app from '#node-apifactory';

process.env.MAIN_MONGO_URL = 'mongodb://localhost:27017';

await app();

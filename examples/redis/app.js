import {http} from '#node-apifactory';

process.env.MAIN_REDIS_URL = 'redis://localhost:6379/5';

const app = await http();

await app.run();

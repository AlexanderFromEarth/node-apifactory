import {http} from '#node-apifactory';

const app = await http();

await app.run();

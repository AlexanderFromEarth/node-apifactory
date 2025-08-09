import {http} from '#node-apifactory';

process.env.HTTP_VARIABLE_PORT = '4000';
process.env.HTTP_LABEL_TYPE = 'global';

const app = await http();

await app.run();

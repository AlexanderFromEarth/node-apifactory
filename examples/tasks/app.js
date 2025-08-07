import {http} from '#node-apifactory';

const app = await http({server: {labels: {app: 'atasks'}}});

await app.run();

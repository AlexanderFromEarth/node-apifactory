import {service} from '#node-apifactory';

const app = await service();

app.listen({port: 8000});

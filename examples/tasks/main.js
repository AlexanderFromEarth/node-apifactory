import {service} from '#apifactory';

const app = await service();

app.listen({port: 8000});

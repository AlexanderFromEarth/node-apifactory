import service from 'src';

process.env.HTTP_VARIABLE_PORT = '4000';
process.env.HTTP_LABEL_TYPE = 'global';

await service();

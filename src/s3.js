import * as S3 from '@aws-sdk/client-s3';

export function make({env}) {
  const dbs = env()
    .getByPostfix('s3Bucket');
  const result = {};

  for (const name in dbs) {
    const client = new S3.S3Client({
      region: env().get(`${name}S3Region`),
      accessKeyId: env().get(`${name}S3AccessKeyId`),
      secretAccessKey: env().get(`${name}S3AccessKeySecret`)
    });

    result[name] = new Proxy({}, {
      get(target, p, receiver) {
        const cls = `${p[0].toUpperCase()}${p.slice(1)}Command`;

        if (cls in S3) {
          return (arg) => client.send(new S3[p]({...arg, Bucket: name}));
        }

        return Reflect.get(...arguments);
      }
    });
  }

  return {
    action: (name) => {
      if (!(
        name in result
      )) {
        throw new Error(`Unknown s3 name ${name}`);
      }

      return result[name];
    }
  };
}

export const name = 's3';

export const require = ['env'];

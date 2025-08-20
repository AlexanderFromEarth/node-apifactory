import crypto from 'node:crypto';

export function make({env}) {
  const idLength = Number(env().get('idLength', '24'));
  const cacheSize = Number(env().get('cacheSize', '128'));
  const cacheLength = idLength << cacheSize;
  let cache, position;

  return {
    action: () => {
      const buffer = Buffer.allocUnsafe(idLength);

      if (!cache || position + idLength > cacheLength) {
        cache = crypto.randomBytes(cacheLength);
        position = 0;
      }

      cache.copy(buffer, 0, position, position + idLength);
      position += idLength;

      return buffer.toString('base64url');
    }
  };
}

export const name = 'ids';

export const require = ['env'];

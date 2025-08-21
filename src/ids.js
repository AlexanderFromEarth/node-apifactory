import crypto from 'node:crypto';

const base32Chars = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789';
const asciiSize = 256;
const alphabet = new Uint8Array(asciiSize);

for (let i = 0; i < base32Chars.length; i++) {
  for (let j = 0; j < asciiSize / base32Chars.length; j++) {
    alphabet[i + base32Chars.length * j] = base32Chars.charCodeAt(i);
  }
}

const checksumChars = base32Chars + '*~$=U';

function calculateChecksum(buffer) {
  const checksum = Number(BigInt(`0x${buffer.toString('hex')}`) % BigInt(checksumChars.length));

  return checksumChars[Math.abs(checksum)];
}

export function make({env}) {
  const idLength = Number(env().get('idLength', '24'));
  const cacheSize = Number(env().get('cacheSize', '500'));
  const cacheLength = idLength * cacheSize;
  const buffer = Buffer.allocUnsafe(idLength);
  let cache = crypto.randomBytes(cacheLength);
  let position = 0;

  return {
    action: (payload) => {
      let value;
      let checksum;

      if (!payload) {
        if (position + idLength > cacheLength) {
          crypto.randomFillSync(cache);
          position = 0;
        }

        for (let i = 0; i < idLength; i++) {
          buffer[i] = alphabet[cache[position + i]];
        }

        value = buffer.toString('ascii');
        checksum = calculateChecksum(buffer);
      } else if (typeof payload === 'string') {
        value = payload.substring(0, payload.length - 1);
        checksum = payload[payload.length - 1];

        if (calculateChecksum(Buffer.from(value, 'ascii')) !== checksum) {
          throw {success: false, error: {code: 'invalid', message: 'invalid parameters passed'}};
        }
      } else if (
        typeof payload === 'object' &&
        'value' in payload &&
        typeof payload.value === 'string'
      ) {
        value = payload.value;
        checksum = calculateChecksum(Buffer.from(value, 'ascii'));
      } else {
        throw new Error('invalid payload');
      }

      return {
        valueOf() {
          return value;
        },
        toString() {
          return value + checksum;
        },
        toJSON() {
          return value + checksum;
        }
      };
    },
  };
}

export const name = 'ids';

export const require = ['env'];

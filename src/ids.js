import crypto from 'node:crypto';

const base32Chars = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789';
const checksumChars = base32Chars + '*~$=U';
const asciiSize = 256;
const alphabet = new Uint8Array(asciiSize);

for (let i = 0; i < base32Chars.length; i++) {
  for (let j = 0; j < asciiSize / base32Chars.length; j++) {
    alphabet[i + base32Chars.length * j] = base32Chars.charCodeAt(i);
  }
}

export function make({env}) {
  const idLength = Number(env().get('idLength', '24'));
  const cacheSize = Number(env().get('cacheSize', '128'));
  const cacheLength = idLength << cacheSize;
  const buffer = Buffer.allocUnsafe(idLength);
  let cache, position;

  return {
    action: () => ({
      generate: () => {
        if (!cache || position + idLength > cacheLength) {
          crypto.randomFillSync(cache);
          position = 0;
        }

        for (let i = 0; i < idLength; i++) {
          buffer[i] = alphabet[buffer[position + idLength]];
        }

        return buffer.toString('ascii') + checksum(buffer);
      },
      validate: (id) => {
        return checksum(Buffer.from(id.substring(0, id.length - 1), 'ascii')) === id[id.length - 1];
      }
    }),
  };
}

export const name = 'ids';

export const require = ['env'];

function checksum(buffer) {
  const checksum = Number(BigInt(`0x${buffer.toString('hex')}`) % BigInt(checksumChars.length));

  return checksumChars[Math.abs(checksum)];
}

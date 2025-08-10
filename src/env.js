import process from 'node:process';

export function get(key, defaultValue = null) {
  return process.env[toEnvKey(key)] ?? defaultValue;
}

export function getByPrefix(prefix) {
  const obj = {};
  const envPrefix = `${toEnvKey(prefix)}_`;

  for (const key in process.env) {
    if (key.startsWith(envPrefix)) {
      obj[fromEnvKey(key.slice(envPrefix.length))] = process.env[key];
    }
  }

  return obj;
}

export function getByPostfix(postfix) {
  const obj = {};
  const envPostfix = `_${toEnvKey(postfix)}`;

  for (const key in process.env) {
    if (key.endsWith(envPostfix)) {
      obj[fromEnvKey(key.slice(0, -envPostfix.length))] = process.env[key];
    }
  }

  return obj;
}

function fromEnvKey(key) {
  return key
    .toLowerCase()
    .replaceAll(/(_[a-z])/g, (group) => group
      .toUpperCase()
      .replace('_', ''));
}

function toEnvKey(key) {
  return key
    .replaceAll(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)
    .toUpperCase();
}

import process from 'node:process';

export function success(payload) {
  return new Result({success: true, payload});
}

export function invalid() {
  return new Result({success: false, error: {message: 'invalid parameters passed', code: 'invalid'}});
}

export function noAccess() {
  return new Result({success: false, error: {message: 'no access', code: 'noAccess'}});
}

export function notExists(entityType, entityId) {
  return new Result({success: false, error: {message: `${entityType}(${entityId}) not exists`, code: 'notExists'}});
}

export function alreadyExists(entityType, entityId) {
  return new Result({success: false, error: {message: `${entityType}(${entityId}) already exists`, code: 'alreadyExists'}});
}

export function deleted(entityType, entityId) {
  return new Result({success: false, error: {message: `${entityType}(${entityId}) is deleted`, code: 'deleted'}});
}

export function error(message) {
  return new Result({success: false, error: {message, code: 'error'}});
}

export function isResult(obj) {
  return obj instanceof Result;
}

function Result({success, payload, error}) {
  if (!Number(process.env.EXCEPTIONS)) {
    return success ?
      {
        success,
        payload,
        then(fn) {
          return fn(this.payload);
        }
      } :
      {
        success,
        error,
        then() {
          return this;
        }
      };
  }
  if (success) {
    return payload;
  }

  throw new Error(error.message);
}

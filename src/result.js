export function success(payload) {
  return {success: true, payload};
}

export function invalid() {
  return {success: false, error: {message: 'invalid parameters passed', code: 'invalid'}};
}

export function noAccess() {
  return {success: false, error: {message: 'no access', code: 'noAccess'}};
}

export function notExists(entityType, entityId) {
  return {success: false, error: {message: `${entityType}(${entityId}) not exists`, code: 'notExists'}};
}

export function alreadyExists(entityType, entityId) {
  return {success: false, error: {message: `${entityType}(${entityId}) already exists`, code: 'alreadyExists'}};
}

export function deleted(entityType, entityId) {
  return {success: false, error: {message: `${entityType}(${entityId}) is deleted`, code: 'deleted'}};
}

export function error(message) {
  return {success: false, error: {message, code: 'error'}};
}

import pino from 'pino';

export function make({env}) {
  const logger = pino({level: env().get('logLevel', 'info')});

  return {action: child(logger)};
}

export const name = 'logger';

export const require = ['env'];

function child(logger) {
  return function childLogger(name) {
    const namedLogger = name ?
      logger.child({name}) :
      logger;

    return {
      child: child(namedLogger),
      fatal: (msg, obj, ...args) => namedLogger.fatal(msg, obj, ...args),
      error: (msg, obj, ...args) => namedLogger.error(msg, obj, ...args),
      warn: (msg, obj, ...args) => namedLogger.warn(msg, obj, ...args),
      info: (msg, obj, ...args) => namedLogger.info(msg, obj, ...args),
      debug: (msg, obj, ...args) => namedLogger.debug(msg, obj, ...args),
      trace: (msg, obj, ...args) => namedLogger.trace(msg, obj, ...args)
    };
  }
}

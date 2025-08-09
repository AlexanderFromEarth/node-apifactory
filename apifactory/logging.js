import pino from 'pino';

export default function logging() {
  const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    timestamp: true
  });

  return (name) => {
    const namedLogger = name ?
      logger.child({name}) :
      logger;

    return {
      child: (name) => namedLogger.child({name}),
      fatal: (msg, obj, ...args) => namedLogger.fatal(msg, obj, ...args),
      error: (msg, obj, ...args) => namedLogger.error(msg, obj, ...args),
      warn: (msg, obj, ...args) => namedLogger.warn(msg, obj, ...args),
      info: (msg, obj, ...args) => namedLogger.info(msg, obj, ...args),
      debug: (msg, obj, ...args) => namedLogger.debug(msg, obj, ...args),
      trace: (msg, obj, ...args) => namedLogger.trace(msg, obj, ...args)
    };
  };
}

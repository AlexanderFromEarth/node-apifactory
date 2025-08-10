import {type LogFn} from 'pino';
import {type RedisClientPoolType} from 'redis';

export interface Modules {
  sql: ModuleFactory<{
    query<T>(query: string, ...args: any[]): Promise<T>;
    raw(query: string, ...args: any[]): any;
  }, [string]>;
  redis: ModuleFactory<RedisClientPoolType, [string]>;
  logger: ModuleFactory<Logger, [string]>;
}

export type SystemModuleActions = {
  sql(name: string): {
    query<T>(query: string, ...args: any[]): Promise<T>;
    raw(query: string, ...args: any[]): any;
  };
  redis(name: string): RedisClientPoolType;
  logger(name?: string): Logger;
}

interface Logger {
  child(name?: string): Logger;
  fatal: LogFn;
  error: LogFn;
  warn: LogFn;
  info: LogFn;
  debug: LogFn;
  trace: LogFn;
}

export type ModuleFactory<T, Args extends Array<any>> = () => Module<T, Args>

export interface Module<T, Args extends Array<any>> {
  action(...args: Args): T;
  dispose?(): Promise<void>;
}

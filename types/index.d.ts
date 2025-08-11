import {type LogFn} from 'pino';
import {type RedisClientPoolType} from 'redis';

export default function service(): Promise<void>;

export type Service<T, U> = (
  params: T,
  modules: ModuleActions,
  meta: {links: Record<string, string>}
) => U | Promise<U>;

export type ModuleActions = {
  [ModuleName in keyof Modules]: ReturnType<Modules[ModuleName]>['action'];
};

export interface Modules extends Record<string, ModuleFactory<any, any>> {
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

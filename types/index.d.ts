import {type LogFn} from 'pino';
import {type RedisClientPoolType} from 'redis';

export default function app(): Promise<void>;

export type Service<T, U> = (
  params: T,
  modules: ModuleActions,
  meta: {links: Record<string, string>}
) => U | Promise<U>;

export type ModuleActions = {
  [ModuleName in keyof Modules]: ReturnType<Modules[ModuleName]>['action'];
};

export interface Modules extends Record<string, ModuleFactory<any, any>> {
  env: ModuleFactory<{
    get(key: string): string | undefined;
    get(key: string, defaultValue: string): string;
    getByPrefix(key: string): Record<string, string>;
    getByPostfix(key: string): Record<string, string>;
  }, []>
  sql: ModuleFactory<{
    query<T = unknown>(query: TemplateStringsArray, ...args: any[]): Promise<Array<T>>;
    raw(query: TemplateStringsArray, ...args: any[]): any;
    transaction(queries: Array<any>): Promise<void>;
    transaction<T>(fn: (_: {
      query<T = unknown>(query: TemplateStringsArray, ...args: any[]): Promise<Array<T>>;
      raw(query: TemplateStringsArray, ...args: any[]): any;
    }) => Promise<T>): Promise<T>;
  }, [string]>;
  redis: ModuleFactory<RedisClientPoolType, [string]>;
  logger: ModuleFactory<Logger, [string]>;
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

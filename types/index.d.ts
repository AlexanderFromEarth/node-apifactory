import {type LogFn} from 'pino';
import {type RedisClientPoolType} from 'redis';

export default function app(): Promise<void>;

export type Service<T, U> = (
  params: T,
  result: Result<U>,
  modules: ModuleActions,
  meta: {links: Record<string, string>}
) => Promisified<U | {success: true, payload: T} | {success: false, error: Error}>;

type Promisified<T> = T | PromiseLike<T>;

interface Error {
  code: string;
  message: string;
}

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
  ids: ModuleFactory<{
    valueOf(): string;
    toString(): string;
    toJSON(): string;
  }, [string | {value: string} | never]>;
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

export interface Result<T> {
  success(payload: T): {success: true, payload: T};
  invalid(): {success: false, error: Error};
  noAccess(): {success: false, error: Error};
  notExists(entityType: string, entityId: string): {success: false, error: Error};
  alreadyExists(entityType: string, entityId: string): {success: false, error: Error};
  deleted(entityType: string, entityId: string): {success: false, error: Error};
  error(message: string): {success: false, error: Error};
}

export type ModuleFactory<T, Args extends Array<any>, Deps extends keyof Modules = never> =
  (modules: Pick<Modules, Deps>) => Module<T, Args>;

export interface Module<T, Args extends Array<any>> {
  action(...args: Args): T;

  dispose?(): Promise<void>;
}

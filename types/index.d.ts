import {type LogFn} from 'pino';
import {type RedisClientPoolType} from 'redis';
import {type Db as Mongo} from 'mongodb';
import {
  PutObjectCommandInput,
  PutObjectCommandOutput,
  DeleteObjectCommandInput,
  DeleteObjectCommandOutput,
  GetObjectCommandInput,
  GetObjectCommandOutput
} from '@aws-sdk/client-s3';

export default function app(): Promise<void>;

export type Service<T, U> = (
  params: T,
  result: Result,
  modules: Modules,
  meta: {links: Record<string, string>}
) => Promisified<U | ReturnType<Result[keyof Result]>>;

type Promisified<T> = T | PromiseLike<T>;

interface Error {
  code: string;
  message: string;
}

export interface Modules extends Record<string, (...args: any[]) => any> {
  env: () => {
    get(key: string): string | undefined;
    get(key: string, defaultValue: string): string;
    getByPrefix(key: string): Record<string, string>;
    getByPostfix(key: string): Record<string, string>;
  };
  sql: (name: string) => {
    query<T = unknown>(query: TemplateStringsArray, ...args: any[]): Promise<Array<T>>;
    raw(query: TemplateStringsArray, ...args: any[]): any;
    transaction(queries: Array<any>): Promise<void>;
    transaction<T>(fn: (_: {
      query<T = unknown>(query: TemplateStringsArray, ...args: any[]): Promise<Array<T>>;
      raw(query: TemplateStringsArray, ...args: any[]): any;
    }) => Promise<T>): Promise<T>;
  };
  redis: (name: string) => RedisClientPoolType;
  logger: (name: string) => Logger;
  ids: {
    (): Id;
    (id: string): Id;
    (id: {value: string}): Id;
  };
  events: <Obj extends Record<string, object>>() => {
    [K in keyof Obj]: (params: Obj[K]) => Promise<void>
  };
  mongo: (name: string) => Mongo;
  s3: (name: string) => {
    putObject(arg: Omit<PutObjectCommandInput, 'Bucket'>): Promise<PutObjectCommandOutput>;
    getObject(arg: Omit<GetObjectCommandInput, 'Bucket'>): Promise<GetObjectCommandInput>;
    deleteObject(arg: Omit<DeleteObjectCommandInput, 'Bucket'>): Promise<DeleteObjectCommandOutput>;
  };
}

interface Id {
  valueOf(): string;
  toString(): string;
  toJSON(): string;
}

export type ModuleFactory<Key extends keyof Modules, Deps extends keyof Modules = never> =
  (modules: Pick<Modules, Deps>, result: Result) => {
    action: Modules[Key];
    dispose?: () => void | Promise<void>;
  };

interface Logger {
  child(name?: string): Logger;

  fatal: LogFn;
  error: LogFn;
  warn: LogFn;
  info: LogFn;
  debug: LogFn;
  trace: LogFn;
}

export interface Result {
  success<T>(payload: T): {success: true, payload: T};
  invalid(): {success: false, error: Error};
  noAccess(): {success: false, error: Error};
  notExists(entityType: string, entityId: string): {success: false, error: Error};
  alreadyExists(entityType: string, entityId: string): {success: false, error: Error};
  deleted(entityType: string, entityId: string): {success: false, error: Error};
  error(message: string): {success: false, error: Error};
}

declare module 'better-sqlite3' {
  namespace Database {
    interface RunResult {
      changes: number;
      lastInsertRowid: number | bigint;
    }

    interface Statement {
      run(...params: unknown[]): RunResult;
      get(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
    }

    interface PragmaOptions {
      simple?: boolean;
    }

    interface Database {
      exec(sql: string): this;
      prepare(sql: string): Statement;
      pragma(source: string, options?: PragmaOptions): unknown;
      transaction<F extends (...args: never[]) => unknown>(fn: F): F;
      close(): this;
    }
  }

  interface DatabaseConstructor {
    new (filename?: string, options?: Record<string, unknown>): Database.Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
}

declare module 'multer' {
  import type { RequestHandler } from 'express';

  namespace multer {
    interface StorageEngine {
      _handleFile?: unknown;
      _removeFile?: unknown;
    }

    interface Options {
      storage?: StorageEngine;
      limits?: Record<string, number>;
    }

    interface Multer {
      single(fieldName: string): RequestHandler;
    }
  }

  interface MulterFactory {
    (options?: multer.Options): multer.Multer;
    memoryStorage(): multer.StorageEngine;
  }

  const multer: MulterFactory;
  export default multer;
}

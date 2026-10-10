import { IDatabase } from './interface.js';
import { SQLiteDatabase } from './sqlite.js';

let dbInstance: IDatabase | null = null;

export function getDatabase(): IDatabase {
  if (!dbInstance) {
    const provider = process.env.DB_PROVIDER || 'sqlite';
    switch (provider) {
      case 'sqlite':
        dbInstance = new SQLiteDatabase();
        break;
      default:
        throw new Error(`Unknown database provider: ${provider}`);
    }
  }
  return dbInstance;
}

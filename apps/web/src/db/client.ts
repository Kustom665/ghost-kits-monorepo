import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SCHEMA_SQL } from './schema.ts';

const DB_PATH = process.env.TAXFLOW_DB ?? resolve(process.cwd(), '.data/taxflow.db');

/**
 * Next dev reloads modules on every edit. Without a global cache we would open
 * a new SQLite handle per reload and eventually exhaust file descriptors.
 */
const globalForDb = globalThis as unknown as { __taxflowDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (globalForDb.__taxflowDb) return globalForDb.__taxflowDb;

  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(SCHEMA_SQL);
  globalForDb.__taxflowDb = db;
  return db;
}

export function isEmpty(db: DatabaseSync): boolean {
  const row = db.prepare('SELECT COUNT(*) AS n FROM returns').get() as { n: number };
  return row.n === 0;
}

export { DB_PATH };

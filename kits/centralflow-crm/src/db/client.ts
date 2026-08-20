import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SCHEMA_SQL } from './schema.ts';

const DB_PATH = process.env.CENTRALFLOW_DB ?? resolve(process.cwd(), '.data/centralflow.db');

/**
 * Next dev reloads modules on every edit. Without a global cache we would open
 * a new SQLite handle per reload and eventually exhaust file descriptors.
 */
const globalForDb = globalThis as unknown as { __centralflowDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (globalForDb.__centralflowDb) return globalForDb.__centralflowDb;

  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(SCHEMA_SQL);
  globalForDb.__centralflowDb = db;
  return db;
}

export function isEmpty(db: DatabaseSync): boolean {
  const row = db.prepare('SELECT COUNT(*) AS n FROM conversations').get() as { n: number };
  return row.n === 0;
}

export { DB_PATH };

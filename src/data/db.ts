// The on-device SQLite schema and its migrations (expo-sqlite, async API).

/** Values the data layer binds. Parameterized queries only: never build SQL from data. */
export type SqlValue = string | number | null;

/**
 * The part of expo-sqlite's async `SQLiteDatabase` API the data layer uses
 * (execAsync, runAsync, getFirstAsync, getAllAsync, withTransactionAsync).
 * `SQLiteDatabase` from 'expo-sqlite' satisfies it as is, so the app passes
 * `useSQLiteContext()` straight in. Typing against this subset instead of
 * importing the class keeps db.ts and repository.ts free of expo imports,
 * so the same SQL runs on node:sqlite in test/repository.test.ts.
 */
export interface SqlDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: SqlValue[]): Promise<unknown>;
  getFirstAsync<T>(source: string, ...params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: SqlValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export const DATABASE_NAME = 'mindmodx-scan.db';

/** Migration n (0-based) takes the database from user_version n to n + 1. Append only; never edit a shipped one. */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE products (
    code TEXT PRIMARY KEY NOT NULL,
    json TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );
  CREATE TABLE entries (
    code TEXT PRIMARY KEY NOT NULL,
    entry_number INTEGER NOT NULL UNIQUE,
    first_scanned_at TEXT NOT NULL,
    last_scanned_at TEXT NOT NULL,
    scan_count INTEGER NOT NULL
  );
  CREATE INDEX entries_by_last_scan ON entries (last_scanned_at);
  CREATE TABLE ingredient_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    uri TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued'
  );
  CREATE INDEX ingredient_photos_by_status ON ingredient_photos (status);
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/**
 * Brings the schema up to SCHEMA_VERSION; pass it to SQLiteProvider's onInit.
 * Each migration and its version bump commit together, so a failure leaves
 * the previous version intact. A database newer than this app is left alone.
 */
export async function migrateDbIfNeeded(db: SqlDatabase): Promise<void> {
  // WAL persists in the file, but setting it on every open is harmless. It cannot run inside a transaction.
  await db.execAsync('PRAGMA journal_mode = WAL');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  for (let version = row?.user_version ?? 0; version < MIGRATIONS.length; version++) {
    const sql = MIGRATIONS[version];
    if (sql === undefined) break;
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      // PRAGMA takes no bound parameters; the value is an integer from this file, not data.
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

// <DataProvider> opens the on-device database, runs the migrations and holds
// the context that the hooks in hooks.ts read. Wrap the app once, near the
// root. Children render only once the database is open and migrated.

import { createContext, useMemo, type ReactNode } from 'react';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';

import { fetchOffProduct } from '../off/client.ts';
import { RUBRIC } from '../rubric/index.ts';
import type { Rubric } from '../rubric/schema.ts';
import { DATABASE_NAME, migrateDbIfNeeded, type SqlDatabase } from './db.ts';
import { createLookup } from './lookup.ts';
import { createProductCache, recordScan } from './repository.ts';
import { createChangeEmitter, createScanLookup, type ChangeEmitter, type ScanLookup } from './session.ts';

export interface DataContextValue {
  db: SqlDatabase;
  rubric: Rubric;
  /** Cache first, then OFF. Shared per code while in flight; records only with { record: true }. Never rejects. */
  lookup: ScanLookup;
  /** Fires after a scan is recorded, so history and cache stats reload. */
  changes: ChangeEmitter;
  now: () => Date;
}

export const DataContext = createContext<DataContextValue | null>(null);

const warn = (what: string) => (error: unknown) => console.warn(`[data] ${what}`, error);

function createDataContext(db: SqlDatabase): DataContextValue {
  const now = () => new Date();
  const changes = createChangeEmitter();
  const { lookup } = createLookup({
    cache: createProductCache(db),
    fetchProduct: (code) => fetchOffProduct(code),
    rubric: RUBRIC,
    now,
    onError: warn('product cache failed'),
  });
  return {
    db,
    rubric: RUBRIC,
    lookup: createScanLookup({
      lookup,
      recordScan: (code) => recordScan(db, code, now()),
      onRecorded: changes.emit,
      onError: warn('lookup failed'),
    }),
    changes,
    now,
  };
}

function DataContextProvider({ children }: { children: ReactNode }) {
  // expo-sqlite's SQLiteDatabase satisfies SqlDatabase (see db.ts).
  const db = useSQLiteContext();
  const value = useMemo(() => createDataContext(db), [db]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function DataProvider({ children }: { children: ReactNode }) {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
      <DataContextProvider>{children}</DataContextProvider>
    </SQLiteProvider>
  );
}

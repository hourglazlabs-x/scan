// Storage for the web build. SQLite compiled to WebAssembly (sql.js) runs the
// same SQL as the phone, in memory, and the whole database is saved to
// IndexedDB after writes, so the Index survives a reload. If IndexedDB is
// unavailable (some private windows), the app still works and forgets on reload.
//
// sql.js isn't bundled: scripts/build-web.sh copies sql-wasm.js and
// sql-wasm.wasm into the site's sqljs/ folder, and this file loads them.

import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { color } from '../theme/tokens.ts';
import { createDataContext, DataContext, type DataContextValue } from './context.ts';
import { migrateDbIfNeeded, type SqlDatabase, type SqlValue } from './db.ts';

interface SqlJsStatement {
  bind(values: SqlValue[]): boolean;
  step(): boolean;
  getAsObject(): Record<string, SqlValue>;
  free(): boolean;
}
interface SqlJsDatabase {
  exec(sql: string): unknown;
  run(sql: string, params?: SqlValue[]): unknown;
  prepare(sql: string): SqlJsStatement;
  getRowsModified(): number;
  export(): Uint8Array;
}
type InitSqlJs = (config: { locateFile: (file: string) => string }) => Promise<{
  Database: new (data?: Uint8Array) => SqlJsDatabase;
}>;

/** The site's base path (for example "/scan" on GitHub Pages), set at build time. */
const SQLJS_DIR = `${process.env.EXPO_BASE_URL ?? ''}/sqljs`;
const IDB_NAME = 'mindmodx-scan';
const IDB_STORE = 'files';
const IDB_KEY = 'database';
/** Writes are saved together once this long has passed without another. */
const SAVE_DELAY_MS = 400;

/**
 * Browsers either drop a User-Agent header or turn the request into a CORS
 * preflight, so the web build sends only Accept. Open Food Facts answers with
 * Access-Control-Allow-Origin: *.
 */
const webFetch: typeof fetch = (input, init) => fetch(input, { ...init, headers: { Accept: 'application/json' } });

function loadSqlJs(): Promise<InitSqlJs> {
  const ready = (globalThis as { initSqlJs?: InitSqlJs }).initSqlJs;
  if (ready) return Promise.resolve(ready);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${SQLJS_DIR}/sql-wasm.js`;
    script.onload = () => {
      const init = (globalThis as { initSqlJs?: InitSqlJs }).initSqlJs;
      if (init) resolve(init);
      else reject(new Error('sql.js loaded without initSqlJs'));
    };
    script.onerror = () => reject(new Error(`Could not load ${script.src}`));
    document.head.appendChild(script);
  });
}

const request = <T,>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function openStore(): Promise<IDBDatabase> {
  const open = indexedDB.open(IDB_NAME, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(IDB_STORE);
  return request(open);
}

/** Wraps sql.js in the SqlDatabase interface and saves after every write that isn't inside a transaction. */
function persisted(raw: SqlJsDatabase, save: (bytes: Uint8Array) => Promise<void>): SqlDatabase {
  let depth = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    // export() closes and reopens the database, so never in the middle of a transaction.
    if (depth > 0) return schedule();
    save(raw.export()).catch((error: unknown) => console.warn('[data] could not save the web database', error));
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY_MS);
  };
  const wrote = () => {
    if (depth === 0) schedule();
  };
  // Leaving or hiding the page saves at once, so the last scan isn't lost.
  addEventListener('pagehide', () => timer && flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && timer) flush();
  });

  const rows = <T,>(source: string, params: SqlValue[]): T[] => {
    const stmt = raw.prepare(source);
    try {
      stmt.bind(params);
      const out: T[] = [];
      while (stmt.step()) out.push(stmt.getAsObject() as T);
      return out;
    } finally {
      stmt.free();
    }
  };

  return {
    async execAsync(source) {
      raw.exec(source);
      wrote();
    },
    async runAsync(source, ...params) {
      raw.run(source, params);
      const changes = raw.getRowsModified();
      wrote();
      return { changes };
    },
    async getFirstAsync<T>(source: string, ...params: SqlValue[]) {
      return rows<T>(source, params)[0] ?? null;
    },
    async getAllAsync<T>(source: string, ...params: SqlValue[]) {
      return rows<T>(source, params);
    },
    async withTransactionAsync(task) {
      if (depth > 0) return task();
      depth++;
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      } finally {
        depth--;
      }
      schedule();
    },
  };
}

async function openWebDb(): Promise<SqlDatabase> {
  const initSqlJs = await loadSqlJs();
  const SQL = await initSqlJs({ locateFile: (file) => `${SQLJS_DIR}/${file}` });
  let store: IDBDatabase | null = null;
  let saved: Uint8Array | undefined;
  try {
    store = await openStore();
    const value: unknown = await request(store.transaction(IDB_STORE).objectStore(IDB_STORE).get(IDB_KEY));
    if (value instanceof Uint8Array) saved = value;
  } catch (error) {
    console.warn('[data] IndexedDB unavailable; scans last until the page closes', error);
  }
  const save = async (bytes: Uint8Array) => {
    if (store === null) return;
    const tx = store.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  };
  const db = persisted(new SQL.Database(saved), save);
  await migrateDbIfNeeded(db);
  return db;
}

export function WebDataProvider({ children, onError }: { children: ReactNode; onError: (error: Error) => void }) {
  const [value, setValue] = useState<DataContextValue | null>(null);
  useEffect(() => {
    let live = true;
    openWebDb()
      .then((db) => {
        if (live) setValue(createDataContext(db, webFetch));
      })
      .catch((error: unknown) => onError(error instanceof Error ? error : new Error(String(error))));
    return () => {
      live = false;
    };
  }, [onError]);

  if (value === null) return <View style={{ flex: 1, backgroundColor: color.ground }} />;
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

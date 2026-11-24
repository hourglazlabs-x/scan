// The context the hooks in hooks.ts read, and how it is built from an open
// database. Shared by both storage back ends: expo-sqlite on the phone
// (provider.tsx) and sql.js in the web build (webDb.tsx).

import { createContext } from 'react';

import { fetchOffProduct } from '../off/client.ts';
import { createThrottle } from '../off/throttle.ts';
import { RUBRIC } from '../rubric/index.ts';
import type { Rubric } from '../rubric/schema.ts';
import type { SqlDatabase } from './db.ts';
import { createLookup } from './lookup.ts';
import { createProductCache, recordScan } from './repository.ts';
import {
  createChangeEmitter,
  createScanLookup,
  notifyOnWrite,
  type ChangeEmitter,
  type ScanLookup,
} from './session.ts';

/** OFF's rate limit is per IP, so one throttle serves the whole app. */
const throttle = createThrottle();

export interface DataContextValue {
  db: SqlDatabase;
  rubric: Rubric;
  /** Cache first, then OFF. Shared per code while in flight; records only with { record: true }. Never rejects. */
  lookup: ScanLookup;
  /** Fires after a scan is recorded or a product is saved to the cache, so history and cache stats reload. */
  changes: ChangeEmitter;
  now: () => Date;
}

export const DataContext = createContext<DataContextValue | null>(null);

const warn = (what: string) => (error: unknown) => console.warn(`[data] ${what}`, error);

/**
 * fetchImpl sends the Open Food Facts requests. Left out, it's the global
 * fetch; the web build passes one without the User-Agent header (see webDb.tsx).
 */
export function createDataContext(db: SqlDatabase, fetchImpl?: typeof fetch): DataContextValue {
  const now = () => new Date();
  const changes = createChangeEmitter();
  const { lookup } = createLookup({
    cache: notifyOnWrite(createProductCache(db), changes.emit),
    fetchProduct: (code) => fetchOffProduct(code, { throttle, fetchImpl }),
    throttle,
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
      now,
    }),
    changes,
    now,
  };
}

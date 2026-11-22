// Reads and writes the on-device tables (schema in db.ts). Every query is
// parameterized. Codes from the screens are stored in their lookup form
// (offLookupCode), so a 12-digit and a 13-digit scan of one UPC-A share a row.

import type { Product } from '../domain/types.ts';
import { offLookupCode } from '../off/barcode.ts';
import type { SqlDatabase } from './db.ts';
import type { HistoryEntry } from './history.ts';
import type { CachedProduct, ProductCache } from './lookup.ts';

interface ProductRow {
  json: string;
  fetched_at: string;
}

interface EntryRow {
  code: string;
  entry_number: number;
  first_scanned_at: string;
  last_scanned_at: string;
  scan_count: number;
  json: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Light shape check: the JSON was written by this app, but may predate a change to Product. */
function isStoredProduct(value: unknown): value is Product {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    (value.basis === 'food' || value.basis === 'drink') &&
    isRecord(value.nutrients) &&
    Array.isArray(value.categories) &&
    isRecord(value.source) &&
    typeof value.source.fetchedAt === 'string'
  );
}

function parseStoredProduct(json: string | null): Product | null {
  if (json === null) return null;
  try {
    const value: unknown = JSON.parse(json);
    return isStoredProduct(value) ? value : null;
  } catch {
    return null;
  }
}

/** The cache createLookup uses. An unreadable row counts as a miss, so it is refetched and overwritten. */
export function createProductCache(db: SqlDatabase): ProductCache {
  return {
    async get(code): Promise<CachedProduct | null> {
      const row = await db.getFirstAsync<ProductRow>('SELECT json, fetched_at FROM products WHERE code = ?', code);
      const product = parseStoredProduct(row?.json ?? null);
      return row && product ? { product, fetchedAt: row.fetched_at } : null;
    },
    async put(product) {
      await db.runAsync(
        `INSERT INTO products (code, json, fetched_at) VALUES (?, ?, ?)
         ON CONFLICT (code) DO UPDATE SET json = excluded.json, fetched_at = excluded.fetched_at`,
        product.code,
        JSON.stringify(product),
        product.source.fetchedAt,
      );
    },
  };
}

/**
 * One entry per code. The first scan takes the next entry number; later
 * scans bump last_scanned_at and scan_count. A single statement, so it is
 * atomic without a transaction and two scans can never share a number.
 */
export async function recordScan(db: SqlDatabase, code: string, now: Date): Promise<void> {
  const at = now.toISOString();
  await db.runAsync(
    `INSERT INTO entries (code, entry_number, first_scanned_at, last_scanned_at, scan_count)
     VALUES (?, (SELECT COALESCE(MAX(entry_number), 0) + 1 FROM entries), ?, ?, 1)
     ON CONFLICT (code) DO UPDATE SET
       last_scanned_at = excluded.last_scanned_at,
       scan_count = entries.scan_count + 1`,
    offLookupCode(code),
    at,
    at,
  );
}

/** Every entry with its cached product, newest scan first. Scoring happens on read (see history.ts). */
export async function listEntries(db: SqlDatabase): Promise<HistoryEntry[]> {
  const rows = await db.getAllAsync<EntryRow>(
    `SELECT e.code, e.entry_number, e.first_scanned_at, e.last_scanned_at, e.scan_count, p.json
     FROM entries e
     LEFT JOIN products p ON p.code = e.code
     ORDER BY e.last_scanned_at DESC, e.entry_number DESC`,
  );
  return rows.map((row) => ({
    code: row.code,
    entryNumber: row.entry_number,
    firstScannedAt: row.first_scanned_at,
    lastScannedAt: row.last_scanned_at,
    scanCount: row.scan_count,
    product: parseStoredProduct(row.json),
  }));
}

export async function countCachedProducts(db: SqlDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM products');
  return row?.n ?? 0;
}

/** Records a photo of an ingredient list, already copied into app storage, for later text reading. */
export async function queueIngredientPhoto(db: SqlDatabase, code: string, uri: string, now: Date): Promise<void> {
  await db.runAsync(
    'INSERT INTO ingredient_photos (code, uri, created_at) VALUES (?, ?, ?)',
    offLookupCode(code),
    uri,
    now.toISOString(),
  );
}

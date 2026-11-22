// The contract between the data layer (src/data, src/off) and the screens
// (app/, src/ui). Screens only use these types and the hooks listed below;
// they never talk to SQLite or Open Food Facts directly.

import type { GradeId, Product, ScoreResult } from '../domain/types.ts';

export type LookupErrorReason = 'offline' | 'rate_limited' | 'server' | 'timeout' | 'invalid_code';

/**
 * `code` is the code as passed to the hook. Pass canonicalBarcode() keys
 * (src/off/barcode.ts): the cache and history are keyed by them.
 */
export type LookupState =
  | { status: 'loading'; code: string }
  | {
      status: 'found';
      code: string;
      product: Product;
      result: ScoreResult;
      from: 'cache' | 'network';
      /** ISO 8601 time the product data was fetched from Open Food Facts, to show how old a cached copy is. */
      fetchedAt: string;
    }
  | { status: 'not_found'; code: string }
  | {
      status: 'error';
      code: string;
      reason: LookupErrorReason;
      /** With reason 'rate_limited': how long to wait before asking Open Food Facts again. */
      retryAfterMs?: number;
    };

/** One row of scan history, as the Index screen shows it. */
export interface ScanRecord {
  id: number;
  code: string;
  /** ISO 8601 time of the most recent scan of this code. */
  scannedAt: string;
  /** Entry number in the Index: 1 for the first product ever scanned. */
  entryNumber: number;
  kind: 'food';
  name?: string;
  brand?: string;
  /** Readable category, for example "Hams". */
  categoryLabel?: string;
  imageUrl?: string;
  score: number | null;
  grade: GradeId;
  gradeLabel: string;
  /** Poor grade, or at least one high-risk additive. */
  flagged: boolean;
}

export type HistoryFilter = 'all' | 'food' | 'objects' | 'flagged';

export interface HistoryState {
  loading: boolean;
  records: ScanRecord[];
  counts: Record<HistoryFilter, number>;
  /** Reading history failed: loading is false, and records holds the last good read (often none). */
  error?: true;
}

export interface CacheStats {
  /** Products stored on the phone, available without signal. */
  cachedProducts: number;
}

/*
 * Hooks implemented in src/data/hooks.ts. All of them need the app to be
 * wrapped in <DataProvider> (src/data/provider.tsx).
 *
 * useProductLookup(code: string | null, options?: { record?: boolean }): LookupState | null
 *   Cache first, then Open Food Facts. Scores with the bundled rubric.
 *   Returns null when code is null. If Open Food Facts cannot answer (or
 *   says not found) and a cached copy exists, the cached copy is returned.
 *   Requests are throttled app-wide; over budget, the result is error
 *   'rate_limited' with retryAfterMs.
 *   Only a scan from the camera records history: with { record: true } (the
 *   Scan screen), a found product is recorded once per code per mount.
 *   Without it (the default) the product is only shown, so opening it from
 *   the Index or viewing its breakdown never counts as a scan. A camera scan
 *   that ended in an error is recorded on the next successful lookup of the
 *   code within 10 minutes, whichever screen makes it.
 *
 * useScanHistory(filter: HistoryFilter, query: string): HistoryState
 *   Newest first. `query` matches name, brand or barcode, case-insensitive.
 *   Refreshes when a scan is recorded or a product is saved to the cache.
 *   On a failed read: loading false, error true.
 *
 * useCacheStats(): CacheStats
 *   Refreshes when a product is saved to the cache.
 *
 * useOnline(): boolean | null
 *   Whether the phone has a network connection (NetInfo isConnected; no
 *   reachability ping to third parties). null while unknown.
 *
 * useQueueIngredientPhoto(): (code: string, photoUri: string) => Promise<void>
 *   Stores a photo of an ingredient list for later text reading.
 */

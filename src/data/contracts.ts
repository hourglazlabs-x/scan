// The contract between the data layer (src/data, src/off) and the screens
// (app/, src/ui). Screens only use these types and the hooks listed below;
// they never talk to SQLite or Open Food Facts directly.

import type { GradeId, Product, ScoreResult } from '../domain/types.ts';

export type LookupErrorReason = 'offline' | 'rate_limited' | 'server' | 'timeout' | 'invalid_code';

export type LookupState =
  | { status: 'loading'; code: string }
  | { status: 'found'; code: string; product: Product; result: ScoreResult; from: 'cache' | 'network' }
  | { status: 'not_found'; code: string }
  | { status: 'error'; code: string; reason: LookupErrorReason };

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
}

export interface CacheStats {
  /** Products stored on the phone, available without signal. */
  cachedProducts: number;
}

/*
 * Hooks implemented in src/data/hooks.ts. All of them need the app to be
 * wrapped in <DataProvider> (src/data/provider.tsx).
 *
 * useProductLookup(code: string | null): LookupState | null
 *   Cache first, then Open Food Facts. Scores with the bundled rubric.
 *   Records one history entry per scan once the product is found.
 *   Returns null when code is null.
 *
 * useScanHistory(filter: HistoryFilter, query: string): HistoryState
 *   Newest first. `query` matches name, brand or barcode, case-insensitive.
 *   Refreshes when a scan is recorded.
 *
 * useCacheStats(): CacheStats
 *
 * useOnline(): boolean | null
 *   null while unknown.
 *
 * useQueueIngredientPhoto(): (code: string, photoUri: string) => Promise<void>
 *   Stores a photo of an ingredient list for later text reading.
 */

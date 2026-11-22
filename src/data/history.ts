// Turns stored history entries into the rows the Index screen shows, and
// filters them. Pure, so it runs under node tests.
//
// History stores no scores. Every read re-scores the cached product with the
// current rubric, so after a rubric update past scans are graded exactly
// like new ones and the Index never mixes rubric versions.

import type { Product } from '../domain/types.ts';
import { categoryLabel } from '../off/normalize.ts';
import { normalizeAdditiveCode, scoreProduct } from '../rubric/engine.ts';
import type { Rubric } from '../rubric/schema.ts';
import type { HistoryFilter, HistoryState, ScanRecord } from './contracts.ts';

/** One row of the entries table joined with its cached product. */
export interface HistoryEntry {
  code: string;
  entryNumber: number;
  firstScannedAt: string;
  lastScannedAt: string;
  scanCount: number;
  /** null when the product is missing from the cache, or its stored JSON is unreadable. */
  product: Product | null;
}

export const LOADING_HISTORY: HistoryState = {
  loading: true,
  records: [],
  counts: { all: 0, food: 0, objects: 0, flagged: 0 },
};

/** Whether the rubric rates any of the product's additives as high risk. */
export function hasHighRiskAdditive(product: Product, rubric: Rubric): boolean {
  if (product.additives === undefined) return false;
  const high = new Set(rubric.additiveRisk.items.filter((item) => item.risk === 'high').map((item) => item.code));
  return product.additives.some((tag) => high.has(normalizeAdditiveCode(tag)));
}

export function toScanRecord(entry: HistoryEntry, rubric: Rubric): ScanRecord {
  const base = {
    // The entry number is unique and never changes, unlike SQLite's rowid.
    id: entry.entryNumber,
    code: entry.code,
    scannedAt: entry.lastScannedAt,
    entryNumber: entry.entryNumber,
    kind: 'food' as const,
  };
  const { product } = entry;
  if (product === null) return { ...base, score: null, grade: 'incomplete', gradeLabel: 'Incomplete', flagged: false };

  const result = scoreProduct(product, rubric);
  return {
    ...base,
    name: product.name,
    brand: product.brand,
    categoryLabel: categoryLabel(product.categories),
    imageUrl: product.imageUrl,
    score: result.score,
    grade: result.grade,
    gradeLabel: result.gradeLabel,
    // Checked against the rubric rather than the hit text, and also for Incomplete products.
    flagged: result.grade === 'poor' || hasHighRiskAdditive(product, rubric),
  };
}

/** Case-insensitive match on name, brand or barcode. An empty query matches everything. */
export function matchesQuery(record: ScanRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return [record.name, record.brand, record.code].some((field) => field?.toLowerCase().includes(q) === true);
}

export function inFilter(record: ScanRecord, filter: HistoryFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'food':
      return record.kind === 'food';
    case 'objects':
      // Object scanning does not exist yet, so no record is an object.
      return false;
    case 'flagged':
      return record.flagged;
  }
}

/**
 * The state useScanHistory returns. `records` must be newest first.
 * Counts follow the search query but not the selected filter, so each tab
 * shows how many results it would hold.
 */
export function buildHistoryState(records: readonly ScanRecord[], filter: HistoryFilter, query: string): HistoryState {
  const matching = records.filter((record) => matchesQuery(record, query));
  const count = (f: HistoryFilter) => matching.filter((record) => inFilter(record, f)).length;
  return {
    loading: false,
    records: matching.filter((record) => inFilter(record, filter)),
    counts: { all: count('all'), food: count('food'), objects: count('objects'), flagged: count('flagged') },
  };
}

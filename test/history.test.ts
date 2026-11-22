// Tests for history rows: re-scoring on read, the flagged rule, search,
// filters and counts.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ScanRecord } from '../src/data/contracts.ts';
import { buildHistoryState, hasHighRiskAdditive, toScanRecord, type HistoryEntry } from '../src/data/history.ts';
import type { Product } from '../src/domain/types.ts';
import { normalizeOffProduct } from '../src/off/normalize.ts';
import { parseRubric } from '../src/rubric/schema.ts';
import { FETCHED_AT, fixture, loadRubric, rubricJson } from './helpers.ts';

const rubric = loadRubric();

function product(name: string): Product {
  const p = normalizeOffProduct(fixture(name), FETCHED_AT);
  assert.ok(p);
  return p;
}

const ham = product('found-complete');
const oats = product('bare-strings');

function entry(entryNumber: number, p: Product | null, lastScannedAt = '2026-11-21T10:00:00.000Z'): HistoryEntry {
  return {
    code: p?.code ?? '0400000000015',
    entryNumber,
    firstScannedAt: '2026-11-01T10:00:00.000Z',
    lastScannedAt,
    scanCount: 1,
    product: p,
  };
}

test('a history row shows the product, re-scored with the current rubric', () => {
  const record = toScanRecord({ ...entry(3, ham), scanCount: 4 }, rubric);
  const expected: ScanRecord = {
    id: 3,
    code: '0412345678903',
    scannedAt: '2026-11-21T10:00:00.000Z',
    entryNumber: 3,
    kind: 'food',
    name: 'Smoked ham, sliced',
    brand: 'Example Smokehouse',
    categoryLabel: 'Hams',
    imageUrl: ham.imageUrl,
    score: 28,
    grade: 'poor',
    gradeLabel: 'Poor',
    flagged: true,
  };
  assert.deepEqual(record, expected);
});

test('a rubric change re-grades past scans on the next read', () => {
  const lenientJson = structuredClone(rubricJson()) as { additiveRisk: { items: Array<{ code: string; risk: string }> } };
  for (const item of lenientJson.additiveRisk.items) if (item.code === 'e250') item.risk = 'low';
  const record = toScanRecord(entry(1, ham), parseRubric(lenientJson));
  assert.equal(record.score, 58);
  assert.equal(record.grade, 'caution');
  assert.equal(record.flagged, false, 'no longer Poor, and no high-risk additive left');
});

test('flagged: Poor, or any high-risk additive, even on an Incomplete product', () => {
  const { novaGroup: _dropped, ...hamWithoutNova } = ham;
  const incomplete = toScanRecord(entry(1, hamWithoutNova), rubric);
  assert.equal(incomplete.grade, 'incomplete');
  assert.equal(incomplete.flagged, true);
  assert.equal(hasHighRiskAdditive({ ...ham, additives: ['E 250'] }, rubric), true);
  assert.equal(hasHighRiskAdditive({ ...ham, additives: ['en:e301'] }, rubric), false);
  assert.equal(hasHighRiskAdditive({ ...ham, additives: undefined }, rubric), false);

  const optimal = toScanRecord(entry(2, oats), rubric);
  assert.equal(optimal.grade, 'optimal');
  assert.equal(optimal.flagged, false);
});

test('an entry whose product is gone shows as Incomplete, not flagged', () => {
  const record = toScanRecord(entry(5, null), rubric);
  assert.equal(record.grade, 'incomplete');
  assert.equal(record.gradeLabel, 'Incomplete');
  assert.equal(record.score, null);
  assert.equal(record.flagged, false);
  assert.equal(record.name, undefined);
});

test('search matches name, brand or barcode, ignoring case; counts follow the search', () => {
  const records = [entry(2, oats, '2026-11-21T12:00:00.000Z'), entry(1, ham)].map((e) => toScanRecord(e, rubric));

  const all = buildHistoryState(records, 'all', '');
  assert.equal(all.loading, false);
  assert.deepEqual(all.records.map((r) => r.entryNumber), [2, 1], 'order is kept (newest first)');
  assert.deepEqual(all.counts, { all: 2, food: 2, objects: 0, flagged: 1 });

  assert.deepEqual(buildHistoryState(records, 'all', '  HAM ').records.map((r) => r.entryNumber), [1]);
  assert.deepEqual(buildHistoryState(records, 'all', 'example mills').records.map((r) => r.entryNumber), [2]);
  assert.deepEqual(buildHistoryState(records, 'all', '412345678903').records.map((r) => r.entryNumber), [1]);
  assert.deepEqual(buildHistoryState(records, 'all', 'nothing like it').counts, { all: 0, food: 0, objects: 0, flagged: 0 });
  assert.deepEqual(buildHistoryState(records, 'flagged', 'oats').counts, { all: 1, food: 1, objects: 0, flagged: 0 });
});

test('filters: all, food, objects (none yet) and flagged', () => {
  const records = [entry(2, oats), entry(1, ham)].map((e) => toScanRecord(e, rubric));
  const numbers = (filter: 'all' | 'food' | 'objects' | 'flagged') =>
    buildHistoryState(records, filter, '').records.map((r) => r.entryNumber);
  assert.deepEqual(numbers('all'), [2, 1]);
  assert.deepEqual(numbers('food'), [2, 1]);
  assert.deepEqual(numbers('objects'), []);
  assert.deepEqual(numbers('flagged'), [1]);
});

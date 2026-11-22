// Tests for history rows: re-scoring on read, the flagged rule, search,
// filters, counts, and the loading and error states.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ScanRecord } from '../src/data/contracts.ts';
import {
  buildHistoryState,
  hasHighRiskAdditive,
  historyState,
  LOADING_HISTORY,
  toScanRecord,
  type HistoryEntry,
} from '../src/data/history.ts';
import type { Product } from '../src/domain/types.ts';
import { normalizeOffProduct } from '../src/off/normalize.ts';
import { scoreProduct } from '../src/rubric/engine.ts';
import { parseRubric } from '../src/rubric/schema.ts';
import { FETCHED_AT, fixture, loadRubric, rubricJson } from './helpers.ts';

const rubric = loadRubric();

function product(name: string): Product {
  const p = normalizeOffProduct(fixture(name), FETCHED_AT);
  assert.ok(p);
  return p;
}

// The ham carries sodium nitrite (E250), which the rubric rates high risk; the oats carry no additives.
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

test('a history row shows the product, scored with the current rubric', () => {
  const result = scoreProduct(ham, rubric);
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
    score: result.score,
    grade: result.grade,
    gradeLabel: result.gradeLabel,
    flagged: true,
  };
  assert.deepEqual(toScanRecord({ ...entry(3, ham), scanCount: 4 }, rubric), expected);
});

test('a rubric change re-grades past scans on the next read', () => {
  const json = structuredClone(rubricJson()) as { additiveRisk: { items: Array<{ risk: string }> } };
  for (const item of json.additiveRisk.items) item.risk = 'low';
  const lenient = parseRubric(json);

  const before = toScanRecord(entry(1, ham), rubric);
  const after = toScanRecord(entry(1, ham), lenient);
  const expected = scoreProduct(ham, lenient);
  assert.equal(after.score, expected.score);
  assert.equal(after.grade, expected.grade);
  assert.notEqual(after.score, before.score, 'the stored entry did not change, the score did');
  assert.equal(after.flagged, expected.grade === 'poor', 'with no high-risk additive left, only Poor flags');
});

test('flagged: any high-risk additive, even on an Incomplete product; checked against the rubric', () => {
  const incomplete = toScanRecord(entry(1, { ...ham, nutrients: {} }), rubric);
  assert.equal(incomplete.grade, 'incomplete');
  assert.equal(incomplete.flagged, true);
  assert.equal(hasHighRiskAdditive({ ...ham, additives: ['E 250'] }, rubric), true);
  assert.equal(hasHighRiskAdditive({ ...ham, additives: ['en:e301'] }, rubric), false);
  assert.equal(hasHighRiskAdditive({ ...ham, additives: undefined }, rubric), false);
  assert.equal(toScanRecord(entry(2, oats), rubric).flagged, false);
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

test('historyState: loading until the first read; a failed read is an error, never an endless spinner', () => {
  assert.deepEqual(historyState(undefined, false, 'all', ''), LOADING_HISTORY);

  const failedFirst = historyState(undefined, true, 'all', '');
  assert.equal(failedFirst.loading, false);
  assert.equal(failedFirst.error, true);
  assert.deepEqual(failedFirst.records, []);
  assert.deepEqual(failedFirst.counts, { all: 0, food: 0, objects: 0, flagged: 0 });

  const records = [entry(2, oats), entry(1, ham)].map((e) => toScanRecord(e, rubric));
  const failedLater = historyState(records, true, 'flagged', '');
  assert.equal(failedLater.loading, false);
  assert.equal(failedLater.error, true);
  assert.deepEqual(failedLater.records.map((r) => r.entryNumber), [1], 'the last good read stays visible');

  const ok = historyState(records, false, 'all', '');
  assert.equal(ok.loading, false);
  assert.equal('error' in ok, false);
});

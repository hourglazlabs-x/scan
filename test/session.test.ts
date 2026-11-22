// Tests for the logic behind useProductLookup: shared in-flight lookups, and
// history recorded only for camera scans ({ record: true }).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { LookupResult } from '../src/data/lookup.ts';
import { createChangeEmitter, createScanLookup, type ScanLookupDeps } from '../src/data/session.ts';
import { normalizeOffProduct } from '../src/off/normalize.ts';
import { scoreProduct } from '../src/rubric/engine.ts';
import { FETCHED_AT, fixture, loadRubric } from './helpers.ts';

const rubric = loadRubric();
const product = normalizeOffProduct(fixture('found-complete'), FETCHED_AT);
assert.ok(product);
const found = (code: string): LookupResult => ({
  status: 'found',
  code,
  product,
  result: scoreProduct(product, rubric),
  from: 'network',
});
const RECORD = { record: true };

/** A lookup whose answers the test releases by hand. */
function controlledLookup() {
  const calls: string[] = [];
  const pending: Array<(result: LookupResult) => void> = [];
  const lookup = (code: string) => {
    calls.push(code);
    return new Promise<LookupResult>((resolve) => pending.push(resolve));
  };
  const release = (result: LookupResult) => {
    const next = pending.shift();
    assert.ok(next, 'a lookup is waiting');
    next(result);
  };
  return { lookup, calls, release };
}

function recorder() {
  const recorded: string[] = [];
  let changes = 0;
  const deps: Pick<ScanLookupDeps, 'recordScan' | 'onRecorded'> = {
    recordScan: async (code) => {
      recorded.push(code);
    },
    onRecorded: () => {
      changes++;
    },
  };
  return { deps, recorded, changes: () => changes };
}

test('only { record: true } records; the default only shows the product', async () => {
  const rec = recorder();
  const scan = createScanLookup({ lookup: async (code) => found(code), ...rec.deps });
  assert.equal((await scan('412345678903')).status, 'found');
  assert.equal((await scan('412345678903', {})).status, 'found');
  assert.equal((await scan('412345678903', { record: false })).status, 'found');
  assert.deepEqual(rec.recorded, []);
  assert.equal(rec.changes(), 0);
  await scan('412345678903', RECORD);
  // Recorded under the lookup form of the code.
  assert.deepEqual(rec.recorded, ['0412345678903']);
  assert.equal(rec.changes(), 1);
});

test('concurrent recording lookups of one code share a single lookup and record one scan', async () => {
  const source = controlledLookup();
  const rec = recorder();
  const scan = createScanLookup({ lookup: source.lookup, ...rec.deps });
  const first = scan('412345678903', RECORD);
  const second = scan('412345678903', RECORD);
  assert.equal(first, second, 'the same promise');
  source.release(found('412345678903'));
  assert.equal(await first, await second);
  assert.deepEqual(source.calls, ['412345678903']);
  assert.deepEqual(rec.recorded, ['0412345678903']);
  assert.equal(rec.changes(), 1);
});

test('a shared lookup records once if any caller passed record: true, whoever came first', async () => {
  for (const order of [
    [false, true],
    [true, false],
  ]) {
    const source = controlledLookup();
    const rec = recorder();
    const scan = createScanLookup({ lookup: source.lookup, ...rec.deps });
    const calls = order.map((record) => scan('412345678903', { record }));
    source.release(found('412345678903'));
    await Promise.all(calls);
    assert.deepEqual(source.calls, ['412345678903'], `one lookup for ${order}`);
    assert.deepEqual(rec.recorded, ['0412345678903'], `one record for ${order}`);
  }
});

test('once a lookup settles, the next recording scan is a new lookup and a new record', async () => {
  const source = controlledLookup();
  const rec = recorder();
  const scan = createScanLookup({ lookup: source.lookup, ...rec.deps });
  const first = scan('412345678903', RECORD);
  source.release(found('412345678903'));
  await first;
  // A later show-only lookup does not inherit the wish to record.
  const view = scan('412345678903');
  source.release(found('412345678903'));
  await view;
  const second = scan('412345678903', RECORD);
  source.release(found('412345678903'));
  await second;
  assert.equal(source.calls.length, 3);
  assert.equal(rec.recorded.length, 2);
});

test('different codes do not share a lookup', async () => {
  const source = controlledLookup();
  const scan = createScanLookup({ lookup: source.lookup, ...recorder().deps });
  const a = scan('412345678903', RECORD);
  const b = scan('0412345678903', RECORD);
  assert.notEqual(a, b);
  source.release(found('412345678903'));
  source.release(found('0412345678903'));
  assert.equal((await b).code, '0412345678903');
  assert.equal((await a).code, '412345678903');
});

test('not found and error results record nothing, even with record: true', async () => {
  const rec = recorder();
  const results: LookupResult[] = [
    { status: 'not_found', code: '412345678903' },
    { status: 'error', code: '412345678903', reason: 'offline' },
  ];
  const scan = createScanLookup({ lookup: async () => results.shift() ?? found('x'), ...rec.deps });
  assert.equal((await scan('412345678903', RECORD)).status, 'not_found');
  assert.equal((await scan('412345678903', RECORD)).status, 'error');
  assert.deepEqual(rec.recorded, []);
  assert.equal(rec.changes(), 0);
});

test('a lookup that throws becomes a server error and is reported', async () => {
  const errors: unknown[] = [];
  const scan = createScanLookup({
    lookup: async () => {
      throw new Error('bug');
    },
    recordScan: async () => assert.fail('nothing to record'),
    onError: (e) => errors.push(e),
  });
  assert.deepEqual(await scan('412345678903', RECORD), { status: 'error', code: '412345678903', reason: 'server' });
  assert.equal(errors.length, 1);
});

test('a failed recording still returns the product, and is reported', async () => {
  const errors: unknown[] = [];
  let changes = 0;
  const scan = createScanLookup({
    lookup: async (code) => found(code),
    recordScan: async () => {
      throw new Error('database is locked');
    },
    onRecorded: () => changes++,
    onError: (e) => errors.push(e),
  });
  assert.equal((await scan('412345678903', RECORD)).status, 'found');
  assert.equal(errors.length, 1);
  assert.equal(changes, 0);
});

test('the change emitter calls current listeners only', () => {
  const emitter = createChangeEmitter();
  const calls: string[] = [];
  const offA = emitter.subscribe(() => calls.push('a'));
  emitter.subscribe(() => calls.push('b'));
  emitter.emit();
  offA();
  emitter.emit();
  assert.deepEqual(calls, ['a', 'b', 'b']);
});

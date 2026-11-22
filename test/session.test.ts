// Tests for the logic behind useProductLookup: shared in-flight lookups,
// history recorded only for camera scans ({ record: true }), failed camera
// scans recorded on a later success, and the change signal.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { LookupResult, ProductCache } from '../src/data/lookup.ts';
import type { Product } from '../src/domain/types.ts';
import {
  createChangeEmitter,
  createScanLookup,
  FAILED_SCAN_WINDOW_MS,
  notifyOnWrite,
  type ScanLookupDeps,
} from '../src/data/session.ts';
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
  fetchedAt: FETCHED_AT,
});
const failed = (code: string): LookupResult => ({ status: 'error', code, reason: 'offline' });
const RECORD = { record: true };
const CODE = '0412345678903';

/** A lookup whose answers the test releases by hand. */
function controlledLookup() {
  const calls: string[] = [];
  const pending: ((result: LookupResult) => void)[] = [];
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

/** A lookup that answers from a script, one result per call. */
function scriptedLookup(...results: LookupResult[]) {
  return async (code: string): Promise<LookupResult> => results.shift() ?? found(code);
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

function clock(start = Date.parse(FETCHED_AT)) {
  let t = start;
  return { now: () => new Date(t), advance: (ms: number) => (t += ms) };
}

test('only { record: true } records; the default only shows the product', async () => {
  const rec = recorder();
  const scan = createScanLookup({ lookup: async (code) => found(code), ...rec.deps });
  assert.equal((await scan(CODE)).status, 'found');
  assert.equal((await scan(CODE, {})).status, 'found');
  assert.equal((await scan(CODE, { record: false })).status, 'found');
  assert.deepEqual(rec.recorded, []);
  assert.equal(rec.changes(), 0);
  await scan(CODE, RECORD);
  assert.deepEqual(rec.recorded, [CODE]);
  assert.equal(rec.changes(), 1);
});

test('concurrent recording lookups of one code share a single lookup and record one scan', async () => {
  const source = controlledLookup();
  const rec = recorder();
  const scan = createScanLookup({ lookup: source.lookup, ...rec.deps });
  const first = scan(CODE, RECORD);
  const second = scan(CODE, RECORD);
  assert.equal(first, second, 'the same promise');
  source.release(found(CODE));
  assert.equal(await first, await second);
  assert.deepEqual(source.calls, [CODE]);
  assert.deepEqual(rec.recorded, [CODE]);
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
    const calls = order.map((record) => scan(CODE, { record }));
    source.release(found(CODE));
    await Promise.all(calls);
    assert.deepEqual(source.calls, [CODE], `one lookup for ${order}`);
    assert.deepEqual(rec.recorded, [CODE], `one record for ${order}`);
  }
});

test('once a lookup settles, the next recording scan is a new lookup and a new record', async () => {
  const source = controlledLookup();
  const rec = recorder();
  const scan = createScanLookup({ lookup: source.lookup, ...rec.deps });
  const first = scan(CODE, RECORD);
  source.release(found(CODE));
  await first;
  // A later show-only lookup does not inherit the wish to record.
  const view = scan(CODE);
  source.release(found(CODE));
  await view;
  const second = scan(CODE, RECORD);
  source.release(found(CODE));
  await second;
  assert.equal(source.calls.length, 3);
  assert.equal(rec.recorded.length, 2);
});

test('different codes do not share a lookup', async () => {
  const source = controlledLookup();
  const scan = createScanLookup({ lookup: source.lookup, ...recorder().deps });
  const a = scan('412345678903', RECORD);
  const b = scan(CODE, RECORD);
  assert.notEqual(a, b);
  source.release(found('412345678903'));
  source.release(found(CODE));
  assert.equal((await b).code, CODE);
  assert.equal((await a).code, '412345678903');
});

test('a failed camera scan is recorded once on the next success, whoever triggers it', async () => {
  const rec = recorder();
  const time = clock();
  const scan = createScanLookup({ lookup: scriptedLookup(failed(CODE)), ...rec.deps, now: time.now });
  assert.equal((await scan(CODE, RECORD)).status, 'error');
  assert.deepEqual(rec.recorded, []);
  time.advance(FAILED_SCAN_WINDOW_MS);
  // The Result screen's "Try again" does not ask to record, but the scan is owed.
  assert.equal((await scan(CODE)).status, 'found');
  assert.deepEqual(rec.recorded, [CODE]);
  assert.equal(rec.changes(), 1);
  await scan(CODE);
  assert.deepEqual(rec.recorded, [CODE], 'owed once, not forever');
});

test('a failed camera scan is no longer owed after 10 minutes', async () => {
  const rec = recorder();
  const time = clock();
  const scan = createScanLookup({ lookup: scriptedLookup(failed(CODE)), ...rec.deps, now: time.now });
  await scan(CODE, RECORD);
  time.advance(FAILED_SCAN_WINDOW_MS + 1);
  assert.equal((await scan(CODE)).status, 'found');
  assert.deepEqual(rec.recorded, []);
});

test('an owed scan is not recorded twice when the success is itself a camera scan', async () => {
  const rec = recorder();
  const scan = createScanLookup({ lookup: scriptedLookup(failed(CODE)), ...rec.deps, now: clock().now });
  await scan(CODE, RECORD);
  await scan(CODE, RECORD);
  assert.deepEqual(rec.recorded, [CODE]);
  await scan(CODE);
  assert.deepEqual(rec.recorded, [CODE]);
});

test('owed scans are keyed by the canonical code, so another form of it settles the debt', async () => {
  const rec = recorder();
  const scan = createScanLookup({ lookup: scriptedLookup(failed('412345678903')), ...rec.deps, now: clock().now });
  await scan('412345678903', RECORD);
  await scan(CODE);
  assert.deepEqual(rec.recorded, [CODE]);
});

test('nothing is owed for a failed lookup that did not ask to record, or for an invalid code', async () => {
  const rec = recorder();
  const scan = createScanLookup({
    lookup: scriptedLookup(failed(CODE), { status: 'error', code: 'x', reason: 'invalid_code' }),
    ...rec.deps,
    now: clock().now,
  });
  await scan(CODE);
  await scan('x', RECORD);
  await scan(CODE);
  await scan('x');
  assert.deepEqual(rec.recorded, []);
});

test('not found records nothing, even with record: true', async () => {
  const rec = recorder();
  const scan = createScanLookup({ lookup: scriptedLookup({ status: 'not_found', code: CODE }), ...rec.deps });
  assert.equal((await scan(CODE, RECORD)).status, 'not_found');
  assert.deepEqual(rec.recorded, []);
  assert.equal(rec.changes(), 0);
});

test('a lookup that throws becomes a server error, is reported, and the camera scan is owed', async () => {
  const errors: unknown[] = [];
  const rec = recorder();
  let calls = 0;
  const scan = createScanLookup({
    lookup: async (code) => {
      if (calls++ === 0) throw new Error('bug');
      return found(code);
    },
    ...rec.deps,
    onError: (e) => errors.push(e),
    now: clock().now,
  });
  assert.deepEqual(await scan(CODE, RECORD), { status: 'error', code: CODE, reason: 'server' });
  assert.equal(errors.length, 1);
  await scan(CODE);
  assert.deepEqual(rec.recorded, [CODE]);
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
  assert.equal((await scan(CODE, RECORD)).status, 'found');
  assert.equal(errors.length, 1);
  assert.equal(changes, 0);
});

test('notifyOnWrite fires after each successful cache write, and only then', async () => {
  let writes = 0;
  const stored = new Map<string, Product>();
  const inner: ProductCache = {
    get: async (code) => {
      const p = stored.get(code);
      return p ? { product: p, fetchedAt: p.source.fetchedAt } : null;
    },
    put: async (p) => {
      if (p.code === 'fail') throw new Error('database is full');
      stored.set(p.code, p);
    },
  };
  const cache = notifyOnWrite(inner, () => writes++);
  assert.equal(await cache.get(CODE), null);
  assert.equal(writes, 0, 'reads do not fire');
  await cache.put(product);
  assert.equal(writes, 1);
  assert.equal((await cache.get(CODE))?.product, product);
  await assert.rejects(cache.put({ ...product, code: 'fail' }));
  assert.equal(writes, 1);
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

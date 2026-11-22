// Tests for the cache-then-network lookup, with a fake cache, a fake fetch
// and a throttle on an injected clock.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLookup, DEFAULT_MAX_AGE_MS, type CachedProduct, type LookupDeps, type ProductCache } from '../src/data/lookup.ts';
import type { Product } from '../src/domain/types.ts';
import type { OffResult } from '../src/off/client.ts';
import { normalizeOffProduct } from '../src/off/normalize.ts';
import { createThrottle } from '../src/off/throttle.ts';
import { scoreProduct } from '../src/rubric/engine.ts';
import { parseRubric } from '../src/rubric/schema.ts';
import { fixture, loadRubric, rubricJson } from './helpers.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-21T19:00:00.000Z');
const KEY = '0412345678903';
const OTHER = '4006381333931';
const rubric = loadRubric();

const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

function ham(fetchedAt: string, name = 'Smoked ham, sliced'): Product {
  const p = normalizeOffProduct(fixture('found-complete'), fetchedAt);
  assert.ok(p);
  return { ...p, name };
}

const cachedCopy = (product: Product): CachedProduct => ({ product, fetchedAt: product.source.fetchedAt });

function fakeCache(...entries: CachedProduct[]) {
  const rows = new Map(entries.map((e) => [e.product.code, e]));
  const gets: string[] = [];
  const cache: ProductCache = {
    async get(code) {
      gets.push(code);
      return rows.get(code) ?? null;
    },
    async put(product) {
      rows.set(product.code, cachedCopy(product));
    },
  };
  return { cache, rows, gets };
}

function fakeFetch(...results: OffResult[]) {
  const codes: string[] = [];
  const fetchProduct = async (code: string): Promise<OffResult> => {
    codes.push(code);
    const result = results[Math.min(codes.length - 1, results.length - 1)];
    assert.ok(result, 'the fake fetch has a result');
    return result;
  };
  return { fetchProduct, codes };
}

const setup = (cache: ProductCache, fetchProduct: LookupDeps['fetchProduct'], extra: Partial<LookupDeps> = {}) =>
  createLookup({ cache, fetchProduct, rubric, now: () => NOW, ...extra });

/** Every additive rated low risk: the same product scores differently. */
function lenientRubric() {
  const json = structuredClone(rubricJson()) as { additiveRisk: { items: Array<{ risk: string }> } };
  for (const item of json.additiveRisk.items) item.risk = 'low';
  return parseRubric(json);
}

test('a fresh cache entry is returned without a network call, with its fetchedAt', async () => {
  const cached = ham(ago(DAY));
  const { cache } = fakeCache(cachedCopy(cached));
  const net = fakeFetch({ status: 'not_found' });
  const state = await setup(cache, net.fetchProduct).lookup('412345678903');
  assert.ok(state.status === 'found');
  assert.equal(state.from, 'cache');
  assert.equal(state.fetchedAt, ago(DAY));
  assert.equal(state.code, '412345678903', 'the code as passed in');
  assert.equal(state.product, cached);
  assert.deepEqual(net.codes, []);
});

test('a stale cache entry is refreshed from the network and saved', async () => {
  const stale = ham(ago(31 * DAY), 'Old name');
  const fresh = ham(NOW.toISOString(), 'New name');
  const store = fakeCache(cachedCopy(stale));
  const net = fakeFetch({ status: 'found', product: fresh });
  const state = await setup(store.cache, net.fetchProduct).lookup(KEY);
  assert.ok(state.status === 'found');
  assert.equal(state.from, 'network');
  assert.equal(state.fetchedAt, NOW.toISOString());
  assert.equal(state.product.name, 'New name');
  assert.deepEqual(net.codes, [KEY]);
  assert.equal(store.rows.get(KEY)?.product.name, 'New name');
  assert.equal(store.rows.get(KEY)?.fetchedAt, NOW.toISOString());
});

test('a network error falls back to the cached copy, however old, with its fetchedAt', async () => {
  for (const reason of ['offline', 'timeout', 'rate_limited', 'server'] as const) {
    const stale = ham(ago(90 * DAY), 'Stale ham');
    const { cache } = fakeCache(cachedCopy(stale));
    const net = fakeFetch({ status: 'error', reason });
    const state = await setup(cache, net.fetchProduct).lookup(KEY);
    assert.ok(state.status === 'found', reason);
    assert.equal(state.from, 'cache');
    assert.equal(state.fetchedAt, ago(90 * DAY));
    assert.equal(state.product.name, 'Stale ham');
  }
});

test('not found, but a cached copy exists: the cached copy is returned', async () => {
  const stale = ham(ago(45 * DAY), 'Kept ham');
  const { cache } = fakeCache(cachedCopy(stale));
  const state = await setup(cache, fakeFetch({ status: 'not_found' }).fetchProduct).lookup(KEY);
  assert.ok(state.status === 'found');
  assert.equal(state.from, 'cache');
  assert.equal(state.fetchedAt, ago(45 * DAY));
  assert.equal(state.product.name, 'Kept ham');
});

test('not found and nothing cached: not_found, and nothing is saved', async () => {
  const store = fakeCache();
  const net = fakeFetch({ status: 'not_found' });
  assert.deepEqual(await setup(store.cache, net.fetchProduct).lookup(KEY), { status: 'not_found', code: KEY });
  assert.equal(store.rows.size, 0);
});

test('errors without a cached copy: retryAfterMs is passed on for rate_limited only', async () => {
  const limited = fakeFetch({ status: 'error', reason: 'rate_limited', retryAfterMs: 5_000 });
  assert.deepEqual(await setup(fakeCache().cache, limited.fetchProduct).lookup('412345678903'), {
    status: 'error',
    code: '412345678903',
    reason: 'rate_limited',
    retryAfterMs: 5_000,
  });
  const busy = fakeFetch({ status: 'error', reason: 'server', retryAfterMs: 5_000 });
  assert.deepEqual(await setup(fakeCache().cache, busy.fetchProduct).lookup(KEY), {
    status: 'error',
    code: KEY,
    reason: 'server',
  });
  const offline = fakeFetch({ status: 'error', reason: 'offline' });
  assert.deepEqual(await setup(fakeCache().cache, offline.fetchProduct).lookup(KEY), {
    status: 'error',
    code: KEY,
    reason: 'offline',
  });
});

test('scoring is always applied, with the rubric passed in, from cache and network alike', async () => {
  const product = ham(NOW.toISOString());
  const fromNetwork = await setup(fakeCache().cache, fakeFetch({ status: 'found', product }).fetchProduct).lookup(KEY);
  assert.ok(fromNetwork.status === 'found');
  assert.deepEqual(fromNetwork.result, scoreProduct(product, rubric));

  const lenient = lenientRubric();
  const { cache } = fakeCache(cachedCopy(product));
  const fromCache = await setup(cache, fakeFetch({ status: 'not_found' }).fetchProduct, { rubric: lenient }).lookup(KEY);
  assert.ok(fromCache.status === 'found');
  assert.equal(fromCache.from, 'cache');
  assert.deepEqual(fromCache.result, scoreProduct(product, lenient));
  assert.notDeepEqual(fromCache.result, fromNetwork.result, 'the rubric passed in decides the score');
});

test('a code with no canonical key is rejected before the cache and the network', async () => {
  const store = fakeCache();
  const net = fakeFetch({ status: 'not_found' });
  const lookup = setup(store.cache, net.fetchProduct);
  for (const code of ['412345678904', '04252614', '']) {
    assert.deepEqual(await lookup.lookup(code), { status: 'error', code, reason: 'invalid_code' });
  }
  assert.deepEqual(store.gets, []);
  assert.deepEqual(net.codes, []);
});

test('one key per product: 12-digit and 13-digit UPC-A share a cache entry, UPC-E keys go out as they are', async () => {
  const store = fakeCache();
  const net = fakeFetch({ status: 'found', product: ham(NOW.toISOString()) });
  const lookup = setup(store.cache, net.fetchProduct);
  assert.equal((await lookup.lookup('412345678903')).status, 'found');
  const second = await lookup.lookup('0412345678903');
  assert.ok(second.status === 'found');
  assert.equal(second.from, 'cache');
  assert.deepEqual(store.gets, [KEY, KEY]);

  await lookup.lookup('0042100005264'); // canonicalBarcode('04252614', 'upc_e')
  assert.deepEqual(net.codes, [KEY, '0042100005264']);
});

test('the product is stored under the key asked for, even if OFF answers with another form', async () => {
  const store = fakeCache();
  const answer = { ...ham(NOW.toISOString()), code: '412345678903' };
  const state = await setup(store.cache, fakeFetch({ status: 'found', product: answer }).fetchProduct).lookup(KEY);
  assert.ok(state.status === 'found');
  assert.equal(state.product.code, KEY);
  assert.deepEqual([...store.rows.keys()], [KEY]);
});

test('cache failures never fail a lookup, and are reported', async () => {
  const errors: unknown[] = [];
  const broken: ProductCache = {
    get: async () => {
      throw new Error('disk I/O error');
    },
    put: async () => {
      throw new Error('database is full');
    },
  };
  const net = fakeFetch({ status: 'found', product: ham(NOW.toISOString()) });
  const state = await setup(broken, net.fetchProduct, { onError: (e) => errors.push(e) }).lookup(KEY);
  assert.ok(state.status === 'found');
  assert.equal(state.from, 'network');
  assert.equal(errors.length, 2);
});

test('freshness: up to maxAgeMs inclusive; a future or unreadable fetchedAt counts as stale', async () => {
  const fromWith = async (fetchedAt: string, maxAgeMs?: number) => {
    const product = ham(fetchedAt);
    const { cache } = fakeCache({ product, fetchedAt });
    const net = fakeFetch({ status: 'found', product: ham(NOW.toISOString()) });
    const state = await setup(cache, net.fetchProduct, maxAgeMs === undefined ? {} : { maxAgeMs }).lookup(KEY);
    assert.ok(state.status === 'found');
    return state.from;
  };
  assert.equal(await fromWith(ago(DEFAULT_MAX_AGE_MS)), 'cache');
  assert.equal(await fromWith(ago(DEFAULT_MAX_AGE_MS + 1)), 'network');
  assert.equal(await fromWith(ago(2 * DAY), DAY), 'network');
  assert.equal(await fromWith(new Date(NOW.getTime() + DAY).toISOString()), 'network');
  assert.equal(await fromWith('not a date'), 'network');
});

test('throttle: over budget, the lookup is rate_limited without calling fetch', async () => {
  let clock = 0;
  const throttle = createThrottle({ limit: 1, now: () => clock });
  const net = fakeFetch({ status: 'found', product: ham(NOW.toISOString()) });
  const lookup = setup(fakeCache().cache, net.fetchProduct, { throttle });
  assert.equal((await lookup.lookup(KEY)).status, 'found');
  clock = 15_000;
  assert.deepEqual(await lookup.lookup(OTHER), { status: 'error', code: OTHER, reason: 'rate_limited', retryAfterMs: 45_000 });
  assert.deepEqual(net.codes, [KEY]);
});

test('throttle: when refused, a cached copy is still returned', async () => {
  const throttle = createThrottle({ limit: 1, now: () => 0 });
  assert.equal(throttle.tryAcquire().allowed, true);
  const stale = ham(ago(60 * DAY));
  const net = fakeFetch({ status: 'not_found' });
  const state = await setup(fakeCache(cachedCopy(stale)).cache, net.fetchProduct, { throttle }).lookup(KEY);
  assert.ok(state.status === 'found');
  assert.equal(state.from, 'cache');
  assert.deepEqual(net.codes, []);
});

test('throttle: a Retry-After in any result blocks the lookups after it', async () => {
  let clock = 0;
  const throttle = createThrottle({ now: () => clock });
  const net = fakeFetch({ status: 'error', reason: 'server', retryAfterMs: 30_000 }, { status: 'not_found' });
  const lookup = setup(fakeCache().cache, net.fetchProduct, { throttle });
  assert.equal((await lookup.lookup(KEY)).status, 'error');
  clock = 10_000;
  assert.deepEqual(await lookup.lookup(OTHER), { status: 'error', code: OTHER, reason: 'rate_limited', retryAfterMs: 20_000 });
  assert.deepEqual(net.codes, [KEY]);
  clock = 30_000;
  assert.equal((await lookup.lookup(OTHER)).status, 'not_found');
  assert.deepEqual(net.codes, [KEY, OTHER]);
});

test('throttle: fresh cache hits never use a slot', async () => {
  const throttle = createThrottle({ limit: 1, now: () => 0 });
  const cached = ham(ago(DAY));
  const net = fakeFetch({ status: 'not_found' });
  const lookup = setup(fakeCache(cachedCopy(cached)).cache, net.fetchProduct, { throttle });
  for (let i = 0; i < 5; i++) assert.equal((await lookup.lookup(KEY)).status, 'found');
  assert.equal((await lookup.lookup(OTHER)).status, 'not_found');
  assert.deepEqual(net.codes, [OTHER]);
});

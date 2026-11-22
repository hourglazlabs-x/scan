// Tests for the cache-then-network lookup, with a fake cache and a fake fetch.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLookup, DEFAULT_MAX_AGE_MS, type CachedProduct, type LookupDeps, type ProductCache } from '../src/data/lookup.ts';
import type { Product } from '../src/domain/types.ts';
import type { OffResult } from '../src/off/client.ts';
import { normalizeOffProduct } from '../src/off/normalize.ts';
import { scoreProduct } from '../src/rubric/engine.ts';
import { parseRubric } from '../src/rubric/schema.ts';
import { fixture, loadRubric, rubricJson } from './helpers.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-21T19:00:00.000Z');
const KEY = '0412345678903';
const rubric = loadRubric();

const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

function ham(fetchedAt: string, name = 'Smoked ham, sliced'): Product {
  const p = normalizeOffProduct(fixture('found-complete'), fetchedAt);
  assert.ok(p);
  return { ...p, name };
}

function fakeCache(...entries: CachedProduct[]) {
  const rows = new Map(entries.map((e) => [e.product.code, e]));
  const gets: string[] = [];
  const cache: ProductCache = {
    async get(code) {
      gets.push(code);
      return rows.get(code) ?? null;
    },
    async put(product) {
      rows.set(product.code, { product, fetchedAt: product.source.fetchedAt });
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

test('a fresh cache entry is returned without a network call', async () => {
  const cached = ham(ago(DAY));
  const { cache } = fakeCache({ product: cached, fetchedAt: cached.source.fetchedAt });
  const net = fakeFetch({ status: 'not_found' });
  const state = await setup(cache, net.fetchProduct).lookup('412345678903');
  assert.ok(state.status === 'found');
  assert.equal(state.from, 'cache');
  assert.equal(state.code, '412345678903', 'the code as passed in');
  assert.equal(state.product, cached);
  assert.deepEqual(net.codes, []);
});

test('a stale cache entry is refreshed from the network and saved', async () => {
  const stale = ham(ago(31 * DAY), 'Old name');
  const fresh = ham(NOW.toISOString(), 'New name');
  const store = fakeCache({ product: stale, fetchedAt: stale.source.fetchedAt });
  const net = fakeFetch({ status: 'found', product: fresh });
  const state = await setup(store.cache, net.fetchProduct).lookup(KEY);
  assert.ok(state.status === 'found');
  assert.equal(state.from, 'network');
  assert.equal(state.product.name, 'New name');
  assert.deepEqual(net.codes, [KEY]);
  assert.equal(store.rows.get(KEY)?.product.name, 'New name');
  assert.equal(store.rows.get(KEY)?.fetchedAt, NOW.toISOString());
});

test('a network error falls back to the stale cache entry, whatever the reason', async () => {
  for (const reason of ['offline', 'timeout', 'rate_limited', 'server'] as const) {
    const stale = ham(ago(90 * DAY), 'Stale ham');
    const { cache } = fakeCache({ product: stale, fetchedAt: stale.source.fetchedAt });
    const net = fakeFetch({ status: 'error', reason });
    const state = await setup(cache, net.fetchProduct).lookup(KEY);
    assert.ok(state.status === 'found', reason);
    assert.equal(state.from, 'cache');
    assert.equal(state.product.name, 'Stale ham');
  }
});

test('a network error without a cache entry is returned as is', async () => {
  const net = fakeFetch({ status: 'error', reason: 'offline', retryAfterMs: 5 });
  assert.deepEqual(await setup(fakeCache().cache, net.fetchProduct).lookup('412345678903'), {
    status: 'error',
    code: '412345678903',
    reason: 'offline',
  });
});

test('not found: nothing is cached', async () => {
  const store = fakeCache();
  const net = fakeFetch({ status: 'not_found' });
  assert.deepEqual(await setup(store.cache, net.fetchProduct).lookup(KEY), { status: 'not_found', code: KEY });
  assert.equal(store.rows.size, 0);
});

test('scoring is always applied, with the rubric passed in, from cache and network alike', async () => {
  const product = ham(NOW.toISOString());
  const fromNetwork = await setup(fakeCache().cache, fakeFetch({ status: 'found', product }).fetchProduct).lookup(KEY);
  assert.ok(fromNetwork.status === 'found');
  assert.deepEqual(fromNetwork.result, scoreProduct(product, rubric));
  assert.equal(fromNetwork.result.score, 28);

  // A rubric that rates nitrite as low risk re-grades the same cached product.
  const lenientJson = structuredClone(rubricJson()) as { additiveRisk: { items: Array<{ code: string; risk: string }> } };
  for (const item of lenientJson.additiveRisk.items) if (item.code === 'e250') item.risk = 'low';
  const lenient = parseRubric(lenientJson);
  const { cache } = fakeCache({ product, fetchedAt: product.source.fetchedAt });
  const fromCache = await setup(cache, fakeFetch({ status: 'not_found' }).fetchProduct, { rubric: lenient }).lookup(KEY);
  assert.ok(fromCache.status === 'found');
  assert.equal(fromCache.from, 'cache');
  assert.deepEqual(fromCache.result, scoreProduct(product, lenient));
  assert.equal(fromCache.result.score, 58);
  assert.equal(fromCache.result.grade, 'caution');
});

test('an invalid code is rejected before the cache and the network', async () => {
  const store = fakeCache();
  const net = fakeFetch({ status: 'not_found' });
  assert.deepEqual(await setup(store.cache, net.fetchProduct).lookup('412345678904'), {
    status: 'error',
    code: '412345678904',
    reason: 'invalid_code',
  });
  assert.deepEqual(store.gets, []);
  assert.deepEqual(net.codes, []);
});

test('12-digit and 13-digit forms of a UPC-A share one cache entry', async () => {
  const store = fakeCache();
  const net = fakeFetch({ status: 'found', product: ham(NOW.toISOString()) });
  const lookup = setup(store.cache, net.fetchProduct);
  assert.equal((await lookup.lookup('412345678903')).status, 'found');
  const second = await lookup.lookup('0412345678903');
  assert.ok(second.status === 'found');
  assert.equal(second.from, 'cache');
  assert.deepEqual(net.codes, [KEY]);
  assert.deepEqual(store.gets, [KEY, KEY]);
});

test('the product is stored under the code asked for, even if OFF answers with another form', async () => {
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

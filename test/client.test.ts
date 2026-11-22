// Tests for the OFF API client with a fake fetch: no test touches the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_RATE_LIMIT_WAIT_MS,
  fetchOffProduct,
  parseRetryAfter,
  type FetchOffProductOptions,
} from '../src/off/client.ts';
import { USER_AGENT } from '../src/off/config.ts';
import { OFF_FIELDS } from '../src/off/fields.ts';
import { createThrottle } from '../src/off/throttle.ts';
import { FETCHED_AT, fixture } from './helpers.ts';

const CODE = '412345678903';
const now = () => new Date(FETCHED_AT);

type Reply = () => Response | Promise<Response>;

const json =
  (status: number, body: unknown, headers: Record<string, string> = {}): Reply =>
  () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

/** Answers with the replies in order (the last one repeats) and records every request. */
function fakeFetch(...replies: Reply[]) {
  const calls: { url: string; headers: Headers }[] = [];
  const impl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    assert.ok(reply, 'the fake fetch has a reply');
    return reply();
  };
  return { impl, calls };
}

/** Never answers; like a real fetch, it rejects when its signal aborts, or at once if it already has. */
const hangingFetch: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException('This operation was aborted', 'AbortError'));
    if (init?.signal?.aborted) abort();
    else init?.signal?.addEventListener('abort', abort);
  });

const fetchWith = (impl: typeof fetch, opts: FetchOffProductOptions = {}) =>
  fetchOffProduct(CODE, { fetchImpl: impl, now, ...opts });

test('found: the product is normalized, and the request is identified', async () => {
  const { impl, calls } = fakeFetch(json(200, fixture('found-complete')));
  const result = await fetchWith(impl);
  assert.ok(result.status === 'found');
  assert.equal(result.product.code, '0412345678903');
  assert.equal(result.product.name, 'Smoked ham, sliced');
  assert.equal(result.product.source.fetchedAt, FETCHED_AT);

  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.ok(call);
  const url = new URL(call.url);
  // The 12-digit UPC-A goes out in its 13-digit EAN-13 form.
  assert.equal(`${url.origin}${url.pathname}`, 'https://world.openfoodfacts.org/api/v2/product/0412345678903');
  assert.equal(url.searchParams.get('fields'), OFF_FIELDS.join(','));
  assert.equal(call.headers.get('User-Agent'), USER_AGENT);
  assert.equal(call.headers.get('Accept'), 'application/json');
});

test('not found as HTTP 200 with status 0', async () => {
  const { impl } = fakeFetch(json(200, fixture('not-found')));
  assert.deepEqual(await fetchWith(impl), { status: 'not_found' });
});

test('not found as HTTP 404', async () => {
  const { impl, calls } = fakeFetch(json(404, fixture('not-found')));
  assert.deepEqual(await fetchWith(impl), { status: 'not_found' });
  assert.equal(calls.length, 1);
});

test('429 with a long Retry-After: rate_limited at once, with the wait in ms', async () => {
  const { impl, calls } = fakeFetch(json(429, {}, { 'Retry-After': '120' }));
  assert.deepEqual(await fetchWith(impl), { status: 'error', reason: 'rate_limited', retryAfterMs: 120_000 });
  assert.equal(calls.length, 1, 'no retry when the wait is over 3 s');
});

test('429 with Retry-After as an HTTP date', async () => {
  const at = new Date(Date.parse(FETCHED_AT) + 60_000).toUTCString();
  const { impl } = fakeFetch(json(429, {}, { 'Retry-After': at }));
  assert.deepEqual(await fetchWith(impl), { status: 'error', reason: 'rate_limited', retryAfterMs: 60_000 });
});

test('429 without Retry-After waits one full rate-limit window, without a retry', async () => {
  const { impl, calls } = fakeFetch(json(429, {}));
  assert.deepEqual(await fetchWith(impl), {
    status: 'error',
    reason: 'rate_limited',
    retryAfterMs: DEFAULT_RATE_LIMIT_WAIT_MS,
  });
  assert.equal(calls.length, 1);
});

test('any Retry-After blocks the shared throttle at once, so other lookups wait too', async () => {
  let clock = 0;
  const throttle = createThrottle({ now: () => clock });
  const { impl } = fakeFetch(json(503, {}, { 'Retry-After': '120' }));
  assert.deepEqual(await fetchWith(impl, { throttle }), { status: 'error', reason: 'server', retryAfterMs: 120_000 });
  assert.deepEqual(throttle.tryAcquire(), { allowed: false, retryAfterMs: 120_000 });
  clock = 120_000;
  assert.deepEqual(throttle.tryAcquire(), { allowed: true });
});

test("the retry takes its own throttle slot, and is skipped when there is none", async () => {
  // The caller (createLookup) took the first request's slot; the budget here is two.
  const roomy = createThrottle({ limit: 2, now: () => 0 });
  assert.equal(roomy.tryAcquire().allowed, true);
  const retried = fakeFetch(json(429, {}, { 'Retry-After': '0' }), json(200, fixture('found-complete')));
  assert.equal((await fetchWith(retried.impl, { throttle: roomy })).status, 'found');
  assert.equal(retried.calls.length, 2);
  assert.equal(roomy.tryAcquire().allowed, false, 'both slots used');

  const full = createThrottle({ limit: 1, now: () => 0 });
  assert.equal(full.tryAcquire().allowed, true);
  const skipped = fakeFetch(json(429, {}, { 'Retry-After': '0' }), json(200, fixture('found-complete')));
  assert.deepEqual(await fetchWith(skipped.impl, { throttle: full }), {
    status: 'error',
    reason: 'rate_limited',
    retryAfterMs: 0,
  });
  assert.equal(skipped.calls.length, 1);
});

test('UPC-E: the canonical key is what OFF is asked for', async () => {
  const { impl, calls } = fakeFetch(json(404, fixture('not-found')));
  await fetchOffProduct('0042100005264', { fetchImpl: impl });
  assert.equal(new URL(calls[0]?.url ?? '').pathname, '/api/v2/product/0042100005264');
  // The 8 digits alone read as an EAN-8, which this code is not: no request.
  assert.deepEqual(await fetchOffProduct('04252614', { fetchImpl: impl }), { status: 'error', reason: 'invalid_code' });
  assert.equal(calls.length, 1);
});

test('429 with a short Retry-After: one retry, then the second answer stands', async () => {
  const { impl, calls } = fakeFetch(json(429, {}, { 'Retry-After': '0' }));
  assert.deepEqual(await fetchWith(impl), { status: 'error', reason: 'rate_limited', retryAfterMs: 0 });
  assert.equal(calls.length, 2, 'retried exactly once');
});

test('503 then success: retried once and found', async () => {
  const { impl, calls } = fakeFetch(json(503, {}, { 'Retry-After': '0' }), json(200, fixture('found-complete')));
  const result = await fetchWith(impl);
  assert.equal(result.status, 'found');
  assert.equal(calls.length, 2);
});

test('no retry without Retry-After, for other 5xx, or when the wait would pass the deadline', async () => {
  const bare = fakeFetch(json(503, {}));
  assert.deepEqual(await fetchWith(bare.impl), { status: 'error', reason: 'server' });
  assert.equal(bare.calls.length, 1);

  const other = fakeFetch(json(500, {}, { 'Retry-After': '0' }));
  assert.deepEqual(await fetchWith(other.impl), { status: 'error', reason: 'server', retryAfterMs: 0 });
  assert.equal(other.calls.length, 1);

  const late = fakeFetch(json(503, {}, { 'Retry-After': '1' }));
  assert.deepEqual(await fetchWith(late.impl, { timeoutMs: 500 }), { status: 'error', reason: 'server', retryAfterMs: 1000 });
  assert.equal(late.calls.length, 1);
});

test('timeout: the request is aborted and reported as timeout', async () => {
  const startedAt = Date.now();
  assert.deepEqual(await fetchWith(hangingFetch, { timeoutMs: 30 }), { status: 'error', reason: 'timeout' });
  assert.ok(Date.now() - startedAt < 2_000);
});

test("the caller's abort signal ends the call as timeout", async () => {
  const controller = new AbortController();
  const pending = fetchWith(hangingFetch, { signal: controller.signal });
  controller.abort();
  assert.deepEqual(await pending, { status: 'error', reason: 'timeout' });

  const aborted = new AbortController();
  aborted.abort();
  assert.deepEqual(await fetchWith(hangingFetch, { signal: aborted.signal }), { status: 'error', reason: 'timeout' });
});

test('offline: a fetch TypeError', async () => {
  const offline: typeof fetch = async () => {
    throw new TypeError('Network request failed');
  };
  assert.deepEqual(await fetchWith(offline), { status: 'error', reason: 'offline' });
});

test('invalid code: no request at all', async () => {
  const { impl, calls } = fakeFetch(json(200, fixture('found-complete')));
  for (const code of ['412345678904', '', 'abc', '12345']) {
    assert.deepEqual(await fetchOffProduct(code, { fetchImpl: impl }), { status: 'error', reason: 'invalid_code' });
  }
  assert.equal(calls.length, 0);
});

test('a body that is not usable JSON is a server error', async () => {
  const html = fakeFetch(() => new Response('<html>Bad gateway</html>', { status: 200 }));
  assert.deepEqual(await fetchWith(html.impl), { status: 'error', reason: 'server' });
  const list = fakeFetch(json(200, []));
  assert.deepEqual(await fetchWith(list.impl), { status: 'error', reason: 'server' });
  const noCode = fakeFetch(json(200, { status: 1, product: { product_name: 'No code anywhere' } }));
  assert.deepEqual(await fetchWith(noCode.impl), { status: 'error', reason: 'server' });
});

test('parseRetryAfter reads seconds or HTTP dates, and nothing else', () => {
  const at = Date.parse(FETCHED_AT);
  assert.equal(parseRetryAfter('120', at), 120_000);
  assert.equal(parseRetryAfter(' 0 ', at), 0);
  assert.equal(parseRetryAfter(new Date(at + 2_000).toUTCString(), at), 2_000);
  assert.equal(parseRetryAfter(new Date(at - 60_000).toUTCString(), at), 0, 'a past date means retry now');
  for (const value of [null, '', 'soon', '1.5', '-1']) assert.equal(parseRetryAfter(value, at), undefined, String(value));
});

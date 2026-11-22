// Tests for the client-side OFF rate limit, on an injected clock.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createThrottle, OFF_REQUESTS_PER_MINUTE } from '../src/off/throttle.ts';

function clockedThrottle(options: { limit?: number; windowMs?: number } = {}) {
  let t = 1_000;
  const throttle = createThrottle({ ...options, now: () => t });
  return { throttle, advance: (ms: number) => (t += ms) };
}

test(`about ${OFF_REQUESTS_PER_MINUTE} requests per rolling minute, then a wait until the oldest leaves the window`, () => {
  const { throttle, advance } = clockedThrottle();
  for (let i = 0; i < OFF_REQUESTS_PER_MINUTE; i++) {
    assert.deepEqual(throttle.tryAcquire(), { allowed: true }, `request ${i + 1}`);
    advance(1_000);
  }
  // 12 requests at 0 s … 11 s; now it is 12 s, so the oldest leaves the window at 60 s.
  assert.deepEqual(throttle.tryAcquire(), { allowed: false, retryAfterMs: 48_000 });
  advance(47_999);
  assert.equal(throttle.tryAcquire().allowed, false);
  advance(1);
  assert.deepEqual(throttle.tryAcquire(), { allowed: true });
  assert.equal(throttle.tryAcquire().allowed, false, 'only one slot came free');
});

test('a refused request takes no slot', () => {
  const { throttle, advance } = clockedThrottle({ limit: 1 });
  assert.equal(throttle.tryAcquire().allowed, true);
  for (let i = 0; i < 5; i++) assert.equal(throttle.tryAcquire().allowed, false);
  advance(60_000);
  assert.equal(throttle.tryAcquire().allowed, true);
});

test('blockFor blocks every request until it passes, and never shortens a longer block', () => {
  const { throttle, advance } = clockedThrottle();
  throttle.blockFor(30_000);
  assert.deepEqual(throttle.tryAcquire(), { allowed: false, retryAfterMs: 30_000 });
  throttle.blockFor(5_000);
  assert.deepEqual(throttle.tryAcquire(), { allowed: false, retryAfterMs: 30_000 });
  advance(10_000);
  assert.deepEqual(throttle.tryAcquire(), { allowed: false, retryAfterMs: 20_000 });
  throttle.blockFor(40_000);
  assert.deepEqual(throttle.tryAcquire(), { allowed: false, retryAfterMs: 40_000 });
  advance(40_000);
  assert.deepEqual(throttle.tryAcquire(), { allowed: true });
});

test('zero, negative or NaN blocks are ignored', () => {
  const { throttle } = clockedThrottle();
  for (const ms of [0, -5_000, Number.NaN]) throttle.blockFor(ms);
  assert.deepEqual(throttle.tryAcquire(), { allowed: true });
});

test('blocked and over budget at once: the longer wait wins', () => {
  const { throttle, advance } = clockedThrottle({ limit: 1 });
  assert.equal(throttle.tryAcquire().allowed, true);
  throttle.blockFor(10_000);
  assert.deepEqual(throttle.tryAcquire(), { allowed: false, retryAfterMs: 60_000 });
  advance(20_000);
  throttle.blockFor(90_000);
  assert.deepEqual(throttle.tryAcquire(), { allowed: false, retryAfterMs: 90_000 });
});

test('a limit of 0 refuses every request for a window', () => {
  const { throttle } = clockedThrottle({ limit: 0 });
  assert.deepEqual(throttle.tryAcquire(), { allowed: false, retryAfterMs: 60_000 });
});

test('the default clock is monotonic, so it works without an injected clock', () => {
  const throttle = createThrottle({ limit: 1 });
  assert.equal(throttle.tryAcquire().allowed, true);
  const refused = throttle.tryAcquire();
  assert.ok(!refused.allowed && refused.retryAfterMs > 59_000 && refused.retryAfterMs <= 60_000);
});

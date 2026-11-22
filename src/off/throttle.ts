// Client-side rate limit for Open Food Facts, shared by every lookup in the
// app. OFF allows 15 product reads per minute per IP; we stay at 12 per
// rolling minute, and honour any Retry-After by blocking every request until
// it has passed. Pure: the clock is injected.

export const OFF_REQUESTS_PER_MINUTE = 12;

export interface ThrottleOptions {
  /** Requests allowed per rolling window. */
  limit?: number;
  windowMs?: number;
  /**
   * Milliseconds on a clock that never jumps. Defaults to performance.now(),
   * so changing the phone's time cannot block or unblock requests.
   */
  now?: () => number;
}

export type ThrottleDecision = { allowed: true } | { allowed: false; retryAfterMs: number };

export interface Throttle {
  /** Takes a request slot if one is free now; otherwise says how long to wait and takes nothing. */
  tryAcquire(): ThrottleDecision;
  /** Blocks every request for `ms` from now, for a Retry-After. Never shortens a longer block. */
  blockFor(ms: number): void;
}

export function createThrottle(options: ThrottleOptions = {}): Throttle {
  const { limit = OFF_REQUESTS_PER_MINUTE, windowMs = 60_000, now = () => performance.now() } = options;
  let granted: number[] = []; // times of the requests in the window, oldest first
  let blockedUntil = -Infinity;

  return {
    tryAcquire() {
      const t = now();
      granted = granted.filter((at) => at > t - windowMs && at <= t);
      const oldest = granted[0];
      const fullForMs = granted.length < limit ? 0 : oldest === undefined ? windowMs : oldest + windowMs - t;
      const waitMs = Math.max(blockedUntil - t, fullForMs, 0);
      if (waitMs > 0) return { allowed: false, retryAfterMs: Math.ceil(waitMs) };
      granted.push(t);
      return { allowed: true };
    },
    blockFor(ms) {
      if (!(ms > 0)) return; // zero, negative or NaN: no block
      blockedUntil = Math.max(blockedUntil, now() + ms);
    },
  };
}

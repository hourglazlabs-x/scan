// Fetches one product from the Open Food Facts API v2 and normalizes it.
// Network outcomes are values, not exceptions, so the caller can fall back to
// the cache. fetch is injectable, so tests never touch the network.

import type { Product } from '../domain/types.ts';
import { canonicalBarcode } from './barcode.ts';
import { OFF_BASE_URL, USER_AGENT } from './config.ts';
import { OFF_FIELDS } from './fields.ts';
import { normalizeOffProduct } from './normalize.ts';
import type { Throttle } from './throttle.ts';

export type OffErrorReason = 'offline' | 'rate_limited' | 'server' | 'timeout' | 'invalid_code';

export type OffResult =
  | { status: 'found'; product: Product }
  | { status: 'not_found' }
  | { status: 'error'; reason: OffErrorReason; retryAfterMs?: number };

export interface FetchOffProductOptions {
  fetchImpl?: typeof fetch;
  /** Aborting it ends the call with reason 'timeout'. */
  signal?: AbortSignal;
  /** Time budget for the whole call, including the retry and the wait before it. */
  timeoutMs?: number;
  /** Clock for the record's fetchedAt and for Retry-After dates. */
  now?: () => Date;
  /**
   * The app's shared throttle. Any Retry-After blocks it at once, so other
   * lookups wait too, and the retry takes a slot from it. The first
   * request's slot is the caller's to take: createLookup takes it before
   * calling fetchProduct.
   */
  throttle?: Throttle;
}

export const DEFAULT_TIMEOUT_MS = 10_000;

/** The single retry happens only when OFF asks us to wait this long or less. */
export const MAX_RETRY_WAIT_MS = 3_000;

/** A 429 without Retry-After waits one full rate-limit window. */
export const DEFAULT_RATE_LIMIT_WAIT_MS = 60_000;

const RETRYABLE_STATUS = new Set([429, 503]);
const TIMEOUT: OffResult = { status: 'error', reason: 'timeout' };

interface Attempt {
  result: OffResult;
  retryable: boolean;
}

interface Deadline {
  signal: AbortSignal;
  remainingMs(): number;
  clear(): void;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function offProductUrl(code: string): string {
  return `${OFF_BASE_URL}/api/v2/product/${encodeURIComponent(code)}?fields=${OFF_FIELDS.join(',')}`;
}

/** Retry-After in milliseconds, from delta-seconds ("120") or an HTTP date. Anything else is undefined. */
export function parseRetryAfter(header: string | null, nowMs: number): number | undefined {
  const value = header?.trim();
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  // Every HTTP date names its month; without the letter check, Date.parse reads "1.5" as a date in 2001.
  if (!/[a-z]/i.test(value)) return undefined;
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - nowMs);
}

/**
 * Not found arrives two ways: HTTP 404, or HTTP 200 with status 0. Both give
 * 'not_found'. 429 gives 'rate_limited'; any other non-2xx status gives
 * 'server'. An abort or the timeout gives 'timeout'; a failed fetch gives
 * 'offline'. A code with no canonical form gives 'invalid_code' without any
 * request; otherwise the canonical key is what OFF is asked for.
 */
export async function fetchOffProduct(code: string, opts: FetchOffProductOptions = {}): Promise<OffResult> {
  const key = canonicalBarcode(code);
  if (key === null) return { status: 'error', reason: 'invalid_code' };

  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date());
  const url = offProductUrl(key);
  const deadline = startDeadline(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, opts.signal);
  try {
    const first = await attempt(fetchImpl, url, deadline.signal, now);
    const wait = retryWait(first, deadline.remainingMs());
    // The retry's slot is taken before the Retry-After block below, so that block cannot refuse it.
    const retry = wait !== undefined && (opts.throttle?.tryAcquire().allowed ?? true);
    blockOnRetryAfter(opts.throttle, first.result);
    if (!retry || wait === undefined) return first.result;
    if (!(await sleep(wait, deadline.signal))) return TIMEOUT;
    const second = (await attempt(fetchImpl, url, deadline.signal, now)).result;
    blockOnRetryAfter(opts.throttle, second);
    return second;
  } finally {
    deadline.clear();
  }
}

function blockOnRetryAfter(throttle: Throttle | undefined, result: OffResult): void {
  if (result.status === 'error' && result.retryAfterMs !== undefined) throttle?.blockFor(result.retryAfterMs);
}

async function attempt(fetchImpl: typeof fetch, url: string, signal: AbortSignal, now: () => Date): Promise<Attempt> {
  if (signal.aborted) return { result: TIMEOUT, retryable: false };
  let response: Response;
  try {
    response = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal });
  } catch {
    // fetch rejects only for aborts and network failures (a TypeError).
    return { result: signal.aborted ? TIMEOUT : { status: 'error', reason: 'offline' }, retryable: false };
  }

  const retryable = RETRYABLE_STATUS.has(response.status);
  if (response.status === 404) return { result: { status: 'not_found' }, retryable };
  if (!response.ok) {
    const limited = response.status === 429;
    const reason = limited ? 'rate_limited' : 'server';
    const retryAfterMs =
      parseRetryAfter(response.headers.get('Retry-After'), now().getTime()) ??
      (limited ? DEFAULT_RATE_LIMIT_WAIT_MS : undefined);
    const result: OffResult =
      retryAfterMs === undefined ? { status: 'error', reason } : { status: 'error', reason, retryAfterMs };
    return { result, retryable };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { result: signal.aborted ? TIMEOUT : { status: 'error', reason: 'server' }, retryable: false };
  }
  return { result: readBody(body, now().toISOString()), retryable: false };
}

function readBody(body: unknown, fetchedAt: string): OffResult {
  if (!isRecord(body)) return { status: 'error', reason: 'server' };
  if (body.status === 0 || body.status === '0' || !isRecord(body.product)) return { status: 'not_found' };
  const product = normalizeOffProduct(body, fetchedAt);
  return product ? { status: 'found', product } : { status: 'error', reason: 'server' };
}

/** How long to wait before the single retry, or undefined for no retry. */
function retryWait(first: Attempt, remainingMs: number): number | undefined {
  if (!first.retryable || first.result.status !== 'error') return undefined;
  const wait = first.result.retryAfterMs;
  return wait !== undefined && wait <= MAX_RETRY_WAIT_MS && wait < remainingMs ? wait : undefined;
}

/** One AbortController for the whole call; it fires on timeout or when the caller's signal aborts. */
function startDeadline(timeoutMs: number, outer: AbortSignal | undefined): Deadline {
  const controller = new AbortController();
  const startedAt = Date.now();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  if (outer?.aborted) abort();
  else outer?.addEventListener('abort', abort);
  return {
    signal: controller.signal,
    remainingMs: () => timeoutMs - (Date.now() - startedAt),
    clear: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', abort);
    },
  };
}

/** Resolves true after `ms`, or false as soon as the signal aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort);
  });
}

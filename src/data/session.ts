// The logic behind DataProvider's context, kept free of React so it runs
// under node tests: the change signal the hooks reload on, and the lookup
// useProductLookup calls.

import { canonicalBarcode } from '../off/barcode.ts';
import type { LookupResult, ProductCache } from './lookup.ts';

export interface ChangeEmitter {
  /** Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  emit(): void;
}

export function createChangeEmitter(): ChangeEmitter {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit() {
      for (const listener of [...listeners]) listener();
    },
  };
}

/** Wraps a cache so each successful write fires `onWrite`, and the Index and the saved-products count reload. */
export function notifyOnWrite(cache: ProductCache, onWrite: () => void): ProductCache {
  return {
    get: (code) => cache.get(code),
    put: async (product) => {
      await cache.put(product);
      onWrite();
    },
  };
}

export interface ScanLookupDeps {
  lookup: (code: string) => Promise<LookupResult>;
  /** Called with product.code, the product's canonical key. */
  recordScan: (code: string) => Promise<void>;
  /** After a scan is recorded. */
  onRecorded?: () => void;
  onError?: (error: unknown) => void;
  now?: () => Date;
}

export interface ScanLookupOptions {
  /**
   * Record a found product as a scan in history. Default false: only a scan
   * from the camera records; screens that show a product (Result, Breakdown,
   * a Result opened from the Index) leave it out.
   */
  record?: boolean;
}

export type ScanLookup = (code: string, options?: ScanLookupOptions) => Promise<LookupResult>;

/** How long a camera scan that ended in an error stays owed to history. */
export const FAILED_SCAN_WINDOW_MS = 10 * 60 * 1000;

/**
 * Callers asking for a code that is already being looked up share that
 * lookup, so two screens (or React's StrictMode double effect) cause one
 * request and at most one history entry. A found product is recorded once
 * per lookup, and only if a caller sharing it passed { record: true },
 * whichever caller came first.
 *
 * A camera scan that ends in an error (offline, timeout, rate limited) is
 * owed: the next found lookup of that code within FAILED_SCAN_WINDOW_MS
 * records it once, whoever triggered it (typically the Result screen's
 * "Try again").
 *
 * The returned promise never rejects: an unexpected failure becomes reason
 * 'server' and goes to onError. A failed recording still returns the product.
 */
export function createScanLookup(deps: ScanLookupDeps): ScanLookup {
  const now = deps.now ?? (() => new Date());
  const inFlight = new Map<string, Promise<LookupResult>>();
  const recordWanted = new Set<string>();
  /** Canonical key → time (ms) until which a found lookup still records the failed camera scan. */
  const owed = new Map<string, number>();

  const keyOf = (code: string) => canonicalBarcode(code) ?? code;

  const record = async (code: string): Promise<void> => {
    try {
      await deps.recordScan(code);
      deps.onRecorded?.();
    } catch (error) {
      deps.onError?.(error);
    }
  };

  const run = async (code: string): Promise<LookupResult> => {
    let result: LookupResult;
    try {
      result = await deps.lookup(code);
    } catch (error) {
      deps.onError?.(error);
      result = { status: 'error', code, reason: 'server' };
    }
    const fromCamera = recordWanted.has(code);
    const key = keyOf(code);
    if (result.status === 'error') {
      if (fromCamera && result.reason !== 'invalid_code') owed.set(key, now().getTime() + FAILED_SCAN_WINDOW_MS);
    } else if (result.status === 'found') {
      const wasOwed = owed.delete(key);
      if (fromCamera || wasOwed) await record(result.product.code);
    }
    return result;
  };

  return (code, options) => {
    // Forget failed scans past their window, so only a lookup started within it records them.
    const t = now().getTime();
    for (const [key, until] of owed) if (until < t) owed.delete(key);
    if (options?.record === true) recordWanted.add(code);
    const pending = inFlight.get(code);
    if (pending) return pending;
    const promise = run(code).finally(() => {
      inFlight.delete(code);
      recordWanted.delete(code);
    });
    inFlight.set(code, promise);
    return promise;
  };
}

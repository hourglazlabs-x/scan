// The logic behind DataProvider's context, kept free of React so it runs
// under node tests: the change signal the hooks reload on, and the lookup
// useProductLookup calls.

import type { LookupResult } from './lookup.ts';

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

export interface ScanLookupDeps {
  lookup: (code: string) => Promise<LookupResult>;
  /** Called with product.code, the lookup form of the barcode. */
  recordScan: (code: string) => Promise<void>;
  /** After a scan is recorded (the cache may have changed too). */
  onRecorded?: () => void;
  onError?: (error: unknown) => void;
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

/**
 * Callers asking for a code that is already being looked up share that
 * lookup, so two screens (or React's StrictMode double effect) cause one
 * request and at most one history entry. A found product is recorded once
 * per lookup, and only if a caller sharing it passed { record: true },
 * whichever caller came first. The returned promise never rejects: an
 * unexpected failure becomes reason 'server' and goes to onError. A failed
 * recording still returns the product.
 */
export function createScanLookup(deps: ScanLookupDeps): ScanLookup {
  const inFlight = new Map<string, Promise<LookupResult>>();
  const recordWanted = new Set<string>();

  const run = async (code: string): Promise<LookupResult> => {
    let result: LookupResult;
    try {
      result = await deps.lookup(code);
    } catch (error) {
      deps.onError?.(error);
      return { status: 'error', code, reason: 'server' };
    }
    if (result.status === 'found' && recordWanted.has(code)) {
      try {
        await deps.recordScan(result.product.code);
        deps.onRecorded?.();
      } catch (error) {
        deps.onError?.(error);
      }
    }
    return result;
  };

  return (code, options) => {
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

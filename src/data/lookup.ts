// Product lookup: cache first, then Open Food Facts, scored with the rubric.
// Pure apart from its injected dependencies, so it runs under node tests.
// It does not record history; useProductLookup does that (see session.ts).

import type { Product } from '../domain/types.ts';
import { canonicalBarcode } from '../off/barcode.ts';
import type { OffResult } from '../off/client.ts';
import type { Throttle } from '../off/throttle.ts';
import { scoreProduct } from '../rubric/engine.ts';
import type { Rubric } from '../rubric/schema.ts';
import type { LookupState } from './contracts.ts';

/** Every LookupState except 'loading', which only the hook produces. */
export type LookupResult = Exclude<LookupState, { status: 'loading' }>;

export interface CachedProduct {
  product: Product;
  /** ISO 8601 time the product was fetched from OFF. */
  fetchedAt: string;
}

export interface ProductCache {
  get(code: string): Promise<CachedProduct | null>;
  /** Stores under product.code, using product.source.fetchedAt. */
  put(product: Product): Promise<void>;
}

export interface LookupDeps {
  cache: ProductCache;
  fetchProduct: (code: string) => Promise<OffResult>;
  rubric: Rubric;
  now: () => Date;
  /** Cache entries older than this are refreshed from the network. */
  maxAgeMs?: number;
  /**
   * The app's shared rate limit (one instance per app). Every request to OFF
   * takes a slot first; when it is blocked or over budget, the lookup acts as
   * if OFF had answered rate_limited, without calling fetchProduct. Any
   * Retry-After in a result blocks it.
   */
  throttle?: Throttle;
  /** Cache failures never fail a lookup (a read error counts as a miss); they are reported here. */
  onError?: (error: unknown) => void;
}

export interface Lookup {
  lookup(code: string): Promise<LookupResult>;
}

export const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Order: a fresh cache entry is returned as from: 'cache'. Otherwise OFF is
 * asked; a found product is saved and returned as from: 'network'. If OFF
 * cannot answer, or says not found, a cached copy (however old) is returned
 * instead. Everything is keyed by canonicalBarcode(code); the result's
 * `code` is the code as passed in.
 */
export function createLookup(deps: LookupDeps): Lookup {
  const { cache, fetchProduct, rubric, now, maxAgeMs = DEFAULT_MAX_AGE_MS, throttle, onError } = deps;

  const found = (code: string, product: Product, from: 'cache' | 'network', fetchedAt: string): LookupResult => ({
    status: 'found',
    code,
    product,
    result: scoreProduct(product, rubric),
    from,
    fetchedAt,
  });

  const fromCache = (code: string, cached: CachedProduct): LookupResult =>
    found(code, cached.product, 'cache', cached.fetchedAt);

  // A fetchedAt in the future (a clock that was wrong) counts as stale, so it heals on the next lookup.
  const isFresh = (fetchedAt: string): boolean => {
    const age = now().getTime() - Date.parse(fetchedAt);
    return age >= 0 && age <= maxAgeMs;
  };

  const readCache = async (key: string): Promise<CachedProduct | null> => {
    try {
      return await cache.get(key);
    } catch (error) {
      onError?.(error);
      return null;
    }
  };

  const writeCache = async (product: Product): Promise<void> => {
    try {
      await cache.put(product);
    } catch (error) {
      onError?.(error);
    }
  };

  const askOff = async (key: string): Promise<OffResult> => {
    const slot = throttle?.tryAcquire();
    if (slot && !slot.allowed) return { status: 'error', reason: 'rate_limited', retryAfterMs: slot.retryAfterMs };
    const result = await fetchProduct(key);
    if (result.status === 'error' && result.retryAfterMs !== undefined) throttle?.blockFor(result.retryAfterMs);
    return result;
  };

  return {
    async lookup(code) {
      const key = canonicalBarcode(code);
      if (key === null) return { status: 'error', code, reason: 'invalid_code' };

      const cached = await readCache(key);
      if (cached && isFresh(cached.fetchedAt)) return fromCache(code, cached);

      const fetched = await askOff(key);
      switch (fetched.status) {
        case 'found': {
          // Keyed by what was asked for, even if OFF answers with another form of the code.
          const product: Product = { ...fetched.product, code: key };
          await writeCache(product);
          return found(code, product, 'network', product.source.fetchedAt);
        }
        case 'not_found':
          // A copy already on the phone beats "not found" (OFF can merge or remove records).
          return cached ? fromCache(code, cached) : { status: 'not_found', code };
        case 'error':
          if (cached) return fromCache(code, cached);
          return fetched.reason === 'rate_limited' && fetched.retryAfterMs !== undefined
            ? { status: 'error', code, reason: fetched.reason, retryAfterMs: fetched.retryAfterMs }
            : { status: 'error', code, reason: fetched.reason };
      }
    },
  };
}

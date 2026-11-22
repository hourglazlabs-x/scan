// Product lookup: cache first, then Open Food Facts, scored with the rubric.
// Pure apart from its injected dependencies, so it runs under node tests.
// It does not record history; useProductLookup does that (see session.ts).

import type { Product } from '../domain/types.ts';
import type { OffResult } from '../off/client.ts';
import { isValidBarcode, normalizeBarcode, offLookupCode } from '../off/barcode.ts';
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
  /** Cache failures never fail a lookup (a read error counts as a miss); they are reported here. */
  onError?: (error: unknown) => void;
}

export interface Lookup {
  lookup(code: string): Promise<LookupResult>;
}

export const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Order: a fresh cache entry is returned as from: 'cache'. Otherwise OFF is
 * asked; a found product is saved and returned as from: 'network'. If the
 * network fails, a stale cache entry is returned instead of the error.
 * The result's `code` is the code as passed in; `product.code` is the
 * lookup form (offLookupCode) that the cache and history use.
 */
export function createLookup(deps: LookupDeps): Lookup {
  const { cache, fetchProduct, rubric, now, maxAgeMs = DEFAULT_MAX_AGE_MS, onError } = deps;

  const found = (code: string, product: Product, from: 'cache' | 'network'): LookupResult => ({
    status: 'found',
    code,
    product,
    result: scoreProduct(product, rubric),
    from,
  });

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

  return {
    async lookup(code) {
      const digits = normalizeBarcode(code);
      if (!isValidBarcode(digits)) return { status: 'error', code, reason: 'invalid_code' };
      const key = offLookupCode(digits);

      const cached = await readCache(key);
      if (cached && isFresh(cached.fetchedAt)) return found(code, cached.product, 'cache');

      const fetched = await fetchProduct(key);
      switch (fetched.status) {
        case 'found': {
          // Keyed by what was asked for, even if OFF answers with another form of the code.
          const product: Product = { ...fetched.product, code: key };
          await writeCache(product);
          return found(code, product, 'network');
        }
        case 'not_found':
          return { status: 'not_found', code };
        case 'error':
          return cached ? found(code, cached.product, 'cache') : { status: 'error', code, reason: fetched.reason };
      }
    },
  };
}

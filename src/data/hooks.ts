// The hooks the screens use (contract in contracts.ts). They need
// <DataProvider> (provider.tsx) around the app. The logic they wrap lives in
// pure modules (lookup.ts, session.ts, history.ts, repository.ts) that are
// tested under node; this file only connects it to React.

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { Directory, File, Paths } from 'expo-file-system';

import { offLookupCode } from '../off/barcode.ts';
import type { CacheStats, HistoryFilter, HistoryState, LookupState, ScanRecord } from './contracts.ts';
import type { SqlDatabase } from './db.ts';
import { buildHistoryState, LOADING_HISTORY, toScanRecord } from './history.ts';
import { DataContext, type DataContextValue } from './provider.tsx';
import { countCachedProducts, listEntries, queueIngredientPhoto } from './repository.ts';

const PHOTO_DIRECTORY = 'ingredient-photos';

function useData(): DataContextValue {
  const value = useContext(DataContext);
  if (value === null) throw new Error('The data hooks need <DataProvider> around the app (src/data/provider.tsx).');
  return value;
}

/**
 * Runs `query` now and again after every recorded scan. A result that
 * arrives after a newer run has started is dropped, so a slow read never
 * overwrites a newer one. `query` must be stable (module level or memoized).
 */
function useLiveQuery<T>(query: (db: SqlDatabase) => Promise<T>): T | undefined {
  const { db, changes } = useData();
  const [value, setValue] = useState<T>();
  useEffect(() => {
    let latest = 0;
    let active = true;
    const run = () => {
      const id = ++latest;
      query(db).then(
        (next) => {
          if (active && id === latest) setValue(() => next);
        },
        (error: unknown) => console.warn('[data] query failed', error),
      );
    };
    run();
    const unsubscribe = changes.subscribe(run);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [db, changes, query]);
  return value;
}

/**
 * Only a scan from the camera records history: with { record: true }, a
 * found product is recorded once per code per mount. Without it (the
 * default) the product is only shown, so opening it from the Index or
 * viewing its breakdown never counts as a scan.
 */
export function useProductLookup(code: string | null, options?: { record?: boolean }): LookupState | null {
  const { lookup } = useData();
  const record = options?.record === true;
  // Codes this mounted screen has recorded. Marked only once found, so a
  // failed lookup that is retried within the same mount can still record.
  const recordedHere = useRef(new Set<string>());
  const [result, setResult] = useState<LookupState | null>(null);
  useEffect(() => {
    let active = true;
    if (code !== null) {
      const wantsRecord = record && !recordedHere.current.has(code);
      // StrictMode's second effect joins the same in-flight lookup, so it still records once.
      void lookup(code, { record: wantsRecord }).then((next) => {
        if (wantsRecord && next.status === 'found') recordedHere.current.add(code);
        if (active) setResult(next);
      });
    }
    return () => {
      active = false;
    };
  }, [code, lookup, record]);
  // Until a result for this exact code arrives (also on the first render after the code changes), it is loading.
  return useMemo(() => {
    if (code === null) return null;
    return result?.code === code ? result : { status: 'loading', code };
  }, [code, result]);
}

export function useScanHistory(filter: HistoryFilter, query: string): HistoryState {
  const { rubric } = useData();
  const load = useCallback(
    async (db: SqlDatabase): Promise<ScanRecord[]> => (await listEntries(db)).map((entry) => toScanRecord(entry, rubric)),
    [rubric],
  );
  const records = useLiveQuery(load);
  return useMemo(
    () => (records === undefined ? LOADING_HISTORY : buildHistoryState(records, filter, query)),
    [records, filter, query],
  );
}

export function useCacheStats(): CacheStats {
  const cachedProducts = useLiveQuery(countCachedProducts) ?? 0;
  return useMemo(() => ({ cachedProducts }), [cachedProducts]);
}

/**
 * null until NetInfo first reports.
 * Assumed API (@react-native-community/netinfo 11): addEventListener returns
 * the unsubscribe function and calls the listener with the current state
 * soon after subscribing; isInternetReachable is null while unknown.
 */
export function useOnline(): boolean | null {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => NetInfo.addEventListener((state) => setOnline(state.isInternetReachable ?? state.isConnected)), []);
  return online;
}

/** Copies the photo into app storage, then queues it. Rejects if the copy or the insert fails. */
export function useQueueIngredientPhoto(): (code: string, photoUri: string) => Promise<void> {
  const { db, now } = useData();
  return useCallback(
    async (code: string, photoUri: string) => {
      const at = now();
      const storedUri = copyIntoDocuments(photoUri, photoFileName(code, photoUri, at));
      await queueIngredientPhoto(db, code, storedUri, at);
    },
    [db, now],
  );
}

/** For example "0412345678903-1763740800000.jpg", keeping the camera's extension. */
function photoFileName(code: string, photoUri: string, at: Date): string {
  const extension = /\.([a-z0-9]{1,5})(?:[?#]|$)/i.exec(photoUri)?.[1]?.toLowerCase() ?? 'jpg';
  return `${offLookupCode(code)}-${at.getTime()}.${extension}`;
}

/**
 * Camera photos live in the cache directory, which iOS may clear, so the
 * photo is copied into the document directory before it is queued.
 *
 * Assumed API: expo-file-system's object API, the default export since Expo
 * SDK 54: `Paths.document` is a Directory, `new Directory(parent, name)` and
 * `new File(parent | uri, name?)` build paths, `exists` is a property, and
 * `create()` and `copy()` are synchronous and throw on failure. On SDK 52-53
 * the same API is imported from 'expo-file-system/next'. Legacy equivalent:
 * FileSystem.makeDirectoryAsync(dir, { intermediates: true }) and
 * FileSystem.copyAsync({ from, to }) under FileSystem.documentDirectory.
 */
function copyIntoDocuments(photoUri: string, fileName: string): string {
  const directory = new Directory(Paths.document, PHOTO_DIRECTORY);
  if (!directory.exists) directory.create({ intermediates: true });
  const target = new File(directory, fileName);
  new File(photoUri).copy(target);
  return target.uri;
}

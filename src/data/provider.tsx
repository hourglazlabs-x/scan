// <DataProvider> opens the on-device database, runs the migrations and holds
// the context that the hooks in hooks.ts read. Wrap the app once, near the
// root. Children render only once the database is open and migrated; if it
// cannot be opened, a plain message replaces the app instead of a crash.

import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';

import { fetchOffProduct } from '../off/client.ts';
import { createThrottle } from '../off/throttle.ts';
import { RUBRIC } from '../rubric/index.ts';
import type { Rubric } from '../rubric/schema.ts';
import { color, radius, space } from '../theme/tokens.ts';
import { DATABASE_NAME, migrateDbIfNeeded, type SqlDatabase } from './db.ts';
import { createLookup } from './lookup.ts';
import { createProductCache, recordScan } from './repository.ts';
import {
  createChangeEmitter,
  createScanLookup,
  notifyOnWrite,
  type ChangeEmitter,
  type ScanLookup,
} from './session.ts';

/*
 * NetInfo's reachability check fetches https://clients3.google.com/generate_204
 * by default. It is turned off once, here, before any listener exists (hooks.ts
 * imports this module), so the app never pings a third party; useOnline reads
 * isConnected instead.
 * Assumed API (@react-native-community/netinfo 9.3 or later):
 * NetInfo.configure({ reachabilityShouldRun }) skips the check whenever it
 * returns false, and isInternetReachable then stays null.
 */
NetInfo.configure({ reachabilityShouldRun: () => false });

/** OFF's rate limit is per IP, so one throttle serves the whole app. */
const throttle = createThrottle();

export interface DataContextValue {
  db: SqlDatabase;
  rubric: Rubric;
  /** Cache first, then OFF. Shared per code while in flight; records only with { record: true }. Never rejects. */
  lookup: ScanLookup;
  /** Fires after a scan is recorded or a product is saved to the cache, so history and cache stats reload. */
  changes: ChangeEmitter;
  now: () => Date;
}

export const DataContext = createContext<DataContextValue | null>(null);

const warn = (what: string) => (error: unknown) => console.warn(`[data] ${what}`, error);

function createDataContext(db: SqlDatabase): DataContextValue {
  const now = () => new Date();
  const changes = createChangeEmitter();
  const { lookup } = createLookup({
    cache: notifyOnWrite(createProductCache(db), changes.emit),
    fetchProduct: (code) => fetchOffProduct(code, { throttle }),
    throttle,
    rubric: RUBRIC,
    now,
    onError: warn('product cache failed'),
  });
  return {
    db,
    rubric: RUBRIC,
    lookup: createScanLookup({
      lookup,
      recordScan: (code) => recordScan(db, code, now()),
      onRecorded: changes.emit,
      onError: warn('lookup failed'),
      now,
    }),
    changes,
    now,
  };
}

function DataContextProvider({ children }: { children: ReactNode }) {
  // expo-sqlite's SQLiteDatabase satisfies SqlDatabase (see db.ts).
  const db = useSQLiteContext();
  const value = useMemo(() => createDataContext(db), [db]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [failure, setFailure] = useState<Error | null>(null);
  // SQLiteProvider may call onError while it renders, so the state update waits a tick.
  const onError = useCallback((error: Error) => {
    setTimeout(() => setFailure(error), 0);
  }, []);
  useEffect(() => {
    if (failure !== null) console.warn('[data] the on-device database could not be opened', failure);
  }, [failure]);

  if (failure !== null) return <StorageFailure />;
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded} onError={onError}>
      <DataContextProvider>{children}</DataContextProvider>
    </SQLiteProvider>
  );
}

/** Shown instead of the app when the database cannot be opened or migrated. */
function StorageFailure() {
  return (
    <View style={styles.ground}>
      <View style={styles.plate} accessibilityRole="alert">
        <Text style={styles.title}>Storage unavailable</Text>
        <Text style={styles.body}>
          MINDMODX Scan could not open its storage on this phone, so scanning and the Index cannot work right now.
          Close the app completely and open it again. If this keeps happening, check that the phone has free space.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ground: { flex: 1, justifyContent: 'center', padding: space.s6, backgroundColor: color.ground },
  plate: {
    padding: space.s6,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.plateRim,
    backgroundColor: color.plate,
  },
  title: { fontSize: 20, fontWeight: '600', color: color.ink },
  body: { marginTop: space.s3, fontSize: 16, lineHeight: 22, color: color.ink2 },
});

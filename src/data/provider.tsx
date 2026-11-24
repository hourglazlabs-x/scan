// <DataProvider> opens the on-device database, runs the migrations and holds
// the context that the hooks in hooks.ts read. Wrap the app once, near the
// root. Children render only once the database is open and migrated; if it
// cannot be opened, a plain message replaces the app instead of a crash.
//
// On the phone the database is expo-sqlite. The web build uses sql.js instead
// (webDb.tsx): expo-sqlite's web version needs cross-origin isolation headers,
// which static hosting such as GitHub Pages can't send.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';

import { color, radius, space } from '../theme/tokens.ts';
import { createDataContext, DataContext } from './context.ts';
import { DATABASE_NAME, migrateDbIfNeeded } from './db.ts';
import { WebDataProvider } from './webDb.tsx';

export { DataContext, type DataContextValue } from './context.ts';

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
  if (Platform.OS === 'web') return <WebDataProvider onError={onError}>{children}</WebDataProvider>;
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded} onError={onError}>
      <DataContextProvider>{children}</DataContextProvider>
    </SQLiteProvider>
  );
}

/** Shown instead of the app when the database cannot be opened or migrated. */
function StorageFailure() {
  const web = Platform.OS === 'web';
  return (
    <View style={styles.ground}>
      <View style={styles.plate} accessibilityRole="alert">
        <Text style={styles.title}>Storage unavailable</Text>
        <Text style={styles.body}>
          {web
            ? 'MINDMODX Scan could not open its storage in this browser, so scanning and the Index cannot work right now. Reload the page. If this keeps happening, check that the browser allows this site to store data.'
            : 'MINDMODX Scan could not open its storage on this phone, so scanning and the Index cannot work right now. Close the app completely and open it again. If this keeps happening, check that the phone has free space.'}
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

// Root layout: loads the fonts behind the splash screen, then provides the
// safe-area context and the data layer to every screen.

import { useEffect } from 'react';
import { Michroma_400Regular } from '@expo-google-fonts/michroma';
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DataProvider } from '../src/data/provider';
import { color } from '../src/theme/tokens';

// Deep links to a product still get the tabs underneath, so Back works.
export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  // Keys are the family names used in src/theme/type.ts.
  const [fontsLoaded, fontError] = useFonts({
    Michroma_400Regular,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    GeistMono_400Regular,
    GeistMono_500Medium,
  });
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  // If a font fails to load, carry on with the system font rather than hang on the splash.
  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <DataProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.ground } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="product/[code]/index" />
          <Stack.Screen name="product/[code]/breakdown" />
          <Stack.Screen name="object" />
        </Stack>
      </DataProvider>
    </SafeAreaProvider>
  );
}

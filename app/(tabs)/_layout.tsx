// Three tabs with the custom floating tab bar. The bar floats over the
// screens, so each tab screen keeps useTabBarSpace() clear at the bottom.

import { Tabs } from 'expo-router';

import { TabBar } from '../../src/ui/TabBar';

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Scan' }} />
      <Tabs.Screen name="collection" options={{ title: 'Index' }} />
      <Tabs.Screen name="you" options={{ title: 'You' }} />
    </Tabs>
  );
}

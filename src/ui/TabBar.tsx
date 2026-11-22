// The floating tab bar from the mockups: a white plate (radius 16) 16 pt
// from each side, resting on the bottom safe-area inset. The active tab is
// an ink tile with a white icon.

// expo-router's own tab navigator passes these props (emitter and
// navigateToTab instead of a navigation object).
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, radius, shadow, space } from '../theme/tokens';
import { font } from '../theme/type';
import { Icon, type IconName } from './Icon';
import { Txt } from './Txt';

export const TAB_BAR_HEIGHT = 64;
/** Gap under the bar on phones without a home indicator. */
const MIN_BOTTOM_GAP = 12;

function bottomGap(insetBottom: number): number {
  return Math.max(insetBottom, MIN_BOTTOM_GAP);
}

/** Height that tab screens keep clear at the bottom so content never hides behind the bar. */
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + bottomGap(insets.bottom);
}

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Scan', icon: 'barcode' },
  collection: { label: 'Index', icon: 'grid' },
  you: { label: 'You', icon: 'person' },
};

export function TabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { bottom: bottomGap(insets.bottom) }]} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const options = descriptors[route.key]?.options;
        const meta = TABS[route.name];
        const label = typeof options?.title === 'string' ? options.title : (meta?.label ?? route.name);

        const onPress = () => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        };
        const onLongPress = () => {
          emitter.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={onLongPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={options?.tabBarAccessibilityLabel ?? label}
            style={styles.tab}
          >
            <View style={[styles.iconWrap, focused && styles.iconWrapOn]}>
              <Icon name={meta?.icon ?? 'grid'} size={focused ? 18 : 20} color={focused ? color.tileFg : color.ink3} />
            </View>
            <Txt
              variant="tab"
              tone={focused ? 'ink' : 'ink3'}
              style={focused ? styles.labelOn : null}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: space.s4,
    right: space.s4,
    height: TAB_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s1,
    paddingHorizontal: space.s2,
    backgroundColor: color.plate,
    borderWidth: 1,
    borderColor: color.plateRim,
    borderRadius: radius.xl,
    ...shadow.plate,
  },
  tab: {
    flex: 1,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s1,
  },
  iconWrap: {
    width: 40,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  iconWrapOn: {
    backgroundColor: color.tile,
  },
  labelOn: {
    fontFamily: font.sansSemibold,
  },
});

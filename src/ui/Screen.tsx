// Screen wrapper: the ground background, safe-area padding and the
// mockups' 16 pt side margins and 10 pt gap between blocks. With `scroll`,
// the content scrolls.

import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, space } from '../theme/tokens';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  /**
   * Space to keep clear at the bottom, for example the floating tab bar
   * (see useTabBarSpace). Defaults to the bottom safe-area inset.
   */
  bottomSpace?: number;
  /** Gap between direct children. */
  gap?: number;
  contentStyle?: StyleProp<ViewStyle>;
}

export function Screen({ children, scroll = false, bottomSpace, gap = 10, contentStyle }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: insets.top + space.s1,
    paddingBottom: (bottomSpace ?? insets.bottom) + space.s4,
    gap,
  };

  if (scroll) {
    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, padding, contentStyle]}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    );
  }
  return <View style={[styles.root, styles.content, padding, contentStyle]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.ground,
  },
  content: {
    paddingHorizontal: space.s4,
  },
});

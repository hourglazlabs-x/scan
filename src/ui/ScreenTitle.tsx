// A tab screen's title block, from the Index mockup: the MINDMODX wordmark,
// the title, and the racing stripe (a skewed red bar and a short ink bar).

import { StyleSheet, View } from 'react-native';

import { color } from '../theme/tokens';
import { Txt } from './Txt';

export function ScreenTitle({ title }: { title: string }) {
  return (
    <View style={styles.wrap}>
      <Txt variant="wordmark" tone="ink2" accessibilityElementsHidden importantForAccessibility="no">
        MINDMODX
      </Txt>
      <Txt variant="screenTitle" accessibilityRole="header">
        {title}
      </Txt>
      <RacingStripe />
    </View>
  );
}

export function RacingStripe() {
  return (
    <View style={styles.stripe} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.bar, styles.red]} />
      <View style={[styles.bar, styles.ink]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 2,
  },
  stripe: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 6,
    paddingLeft: 2,
  },
  bar: {
    height: 5,
    transform: [{ skewX: '-24deg' }],
  },
  red: {
    width: 30,
    backgroundColor: color.runnerRed,
  },
  ink: {
    width: 12,
    backgroundColor: color.ink,
  },
});

// A segmented meter, as in the breakdown's "How 28 adds up": 20 segments,
// round(value / max × 20) of them filled in ink, the rest plateRim.
// Decorative; the row's "value / max" text carries the number.

import { StyleSheet, View } from 'react-native';

import { color } from '../theme/tokens';

export interface SegmentsProps {
  /** Null when the pillar could not be scored: every segment stays empty. */
  value: number | null;
  max: number;
  count?: number;
}

export function Segments({ value, max, count = 20 }: SegmentsProps) {
  const filled = value === null || max <= 0 ? 0 : Math.max(0, Math.min(count, Math.round((value / max) * count)));
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.segment, i < filled ? styles.on : styles.off]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 3,
  },
  segment: {
    flex: 1,
    height: 10,
    borderRadius: 2,
  },
  on: {
    backgroundColor: color.ink,
  },
  off: {
    backgroundColor: color.plateRim,
  },
});

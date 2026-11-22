// Pill chips: status readouts over the camera, the header's connection
// state, and the Index filters.

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, radius, shadow, space } from '../theme/tokens';
import { font } from '../theme/type';
import { StatusLight } from './StatusLight';
import { Txt } from './Txt';

export type ChipSize = 'sm' | 'md' | 'lg';

export interface ChipProps {
  children: ReactNode;
  /** Minimum heights: sm 28 pt, md 32 pt, lg 36 pt. Chips grow with the text size. */
  size?: ChipSize;
  /** The card shadow, for chips that float over the camera. */
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
  /** When set, VoiceOver reads the chip as one element with this label. */
  accessibilityLabel?: string;
}

export function Chip({ children, size = 'md', elevated = false, style, accessibilityLabel }: ChipProps) {
  return (
    <View
      style={[styles.chip, sizes[size], elevated && styles.elevated, style]}
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </View>
  );
}

/** "Online" or "Offline" with a status light, for screen headers. */
export function ConnectionChip({ online }: { online: boolean }) {
  const label = online ? 'Online' : 'Offline';
  return (
    <Chip size="sm" accessibilityLabel={label}>
      <StatusLight tone={online ? 'aqua' : 'silver'} size={9} />
      <Txt variant="labelStrong" tone="ink2" maxFontSizeMultiplier={1.4}>
        {label}
      </Txt>
    </Chip>
  );
}

export interface FilterChipProps {
  label: string;
  /** Shown after the label in grey. "All" has none in the mockup. */
  count?: number;
  selected: boolean;
  onPress: () => void;
}

/** A 44 pt filter chip; the selected one is an ink pill. */
export function FilterChip({ label, count, selected, onPress }: FilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.filter,
        count === undefined ? styles.filterWide : null,
        selected ? styles.filterOn : styles.filterOff,
        pressed && !selected && styles.filterPressed,
      ]}
    >
      <Txt style={styles.filterLabel} tone={selected ? 'tileFg' : 'ink'}>
        {label}
      </Txt>
      {count !== undefined ? (
        <Txt style={styles.filterCount} tone={selected ? 'tileFg' : 'ink3'}>
          {count}
        </Txt>
      ) : null}
    </Pressable>
  );
}

const sizes = StyleSheet.create({
  sm: { minHeight: 28, paddingLeft: 9, paddingRight: 11, gap: 7 },
  md: { minHeight: 32, paddingLeft: 10, paddingRight: space.s3, gap: space.s2 },
  lg: { minHeight: 36, paddingLeft: 10, paddingRight: space.s3, gap: space.s2 },
});

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    backgroundColor: color.plate,
    borderWidth: 1,
    borderColor: color.plateRim,
    borderRadius: radius.pill,
  },
  elevated: {
    ...shadow.card,
  },
  filter: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: space.s3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  filterWide: {
    paddingHorizontal: space.s4,
  },
  filterOn: {
    backgroundColor: color.ink,
    borderColor: color.ink,
  },
  filterOff: {
    backgroundColor: color.plate,
    borderColor: color.plateRim,
  },
  filterPressed: {
    backgroundColor: color.well,
  },
  filterLabel: {
    fontFamily: font.sansSemibold,
    fontSize: 13.5,
    lineHeight: 18,
  },
  filterCount: {
    fontFamily: font.sansMedium,
    fontSize: 13.5,
    lineHeight: 18,
  },
});

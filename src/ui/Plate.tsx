// White plates on the ground colour, the design system's main surface.
// The outer view carries the shadow; the inner view clips rows to the
// rounded corners (on iOS, clipping the outer view would also clip its shadow).

import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type AccessibilityRole,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { color, radius, shadow, space } from '../theme/tokens';
import { Txt } from './Txt';

export interface PlateProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Style of the inner, clipped view (padding, gap, row direction). */
  contentStyle?: StyleProp<ViewStyle>;
  /** Groups the plate into one element for VoiceOver when set with a label. */
  accessible?: boolean;
  accessibilityLabel?: string;
}

export function Plate({ children, style, contentStyle, accessible, accessibilityLabel }: PlateProps) {
  return (
    <View style={[styles.plate, style]} accessible={accessible} accessibilityLabel={accessibilityLabel}>
      <View style={[styles.clip, contentStyle]}>{children}</View>
    </View>
  );
}

export interface PlateHeaderProps {
  title: string;
  /** A count, version or link shown on the right. */
  right?: ReactNode;
  /** Tighter right padding when `right` is a link with its own padding. */
  tightRight?: boolean;
}

/** A 44 pt plate header such as "Why it scored 28". */
export function PlateHeader({ title, right, tightRight = false }: PlateHeaderProps) {
  return (
    <View style={[styles.header, tightRight && styles.headerTight]}>
      <Txt variant="sectionTitle" accessibilityRole="header" style={styles.headerTitle}>
        {title}
      </Txt>
      {right}
    </View>
  );
}

export interface ListRowProps {
  title: string;
  /** A plain string is shown as the grey detail line; pass a node for mixed text. */
  detail?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  /** 48 pt in most plates, 52 to 56 pt where the mockups use taller rows. */
  minHeight?: number;
  /** Smaller title (13.5 pt), as in the breakdown's rule rows. */
  compactTitle?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  /** Shown under the row, outside its touch target (for example a rule's sources). */
  children?: ReactNode;
}

/** A plate row with a hairline above it, as in every list in the mockups. */
export function ListRow({
  title,
  detail,
  leading,
  trailing,
  onPress,
  minHeight = 48,
  compactTitle = false,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  accessibilityState,
  children,
}: ListRowProps) {
  const body = (
    <>
      {leading}
      <View style={styles.rowText}>
        <Txt variant="rowTitle" style={compactTitle ? styles.compactTitle : null}>
          {title}
        </Txt>
        {typeof detail === 'string' ? (
          <Txt variant="label" tone="ink3">
            {detail}
          </Txt>
        ) : (
          detail
        )}
      </View>
      {trailing}
    </>
  );
  return (
    <View style={styles.row}>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole={accessibilityRole ?? 'button'}
          accessibilityLabel={accessibilityLabel ?? title}
          accessibilityHint={accessibilityHint}
          accessibilityState={accessibilityState}
          style={({ pressed }) => [styles.rowInner, styles.rowInnerPressable, { minHeight }, pressed && styles.pressed]}
        >
          {body}
        </Pressable>
      ) : (
        <View
          style={[styles.rowInner, { minHeight }]}
          accessible
          accessibilityLabel={accessibilityLabel}
          accessibilityRole={accessibilityRole}
        >
          {body}
        </View>
      )}
      {children}
    </View>
  );
}

export const plateStyles = StyleSheet.create({
  /** Padding for plates that hold text rather than rows. */
  padded: { paddingTop: space.s3, paddingBottom: 14, paddingHorizontal: space.s4, gap: space.s3 },
});

const styles = StyleSheet.create({
  plate: {
    backgroundColor: color.plate,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.plateRim,
    ...shadow.plate,
  },
  clip: {
    borderRadius: radius.lg - 1,
    overflow: 'hidden',
  },
  header: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s3,
    paddingLeft: space.s4,
    paddingRight: space.s4,
  },
  headerTight: {
    paddingRight: 6,
  },
  headerTitle: {
    flexShrink: 1,
  },
  row: {
    borderTopWidth: 1,
    borderTopColor: color.hair,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    paddingVertical: 6,
    paddingHorizontal: space.s4,
  },
  rowInnerPressable: {
    paddingRight: space.s3,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  compactTitle: {
    fontSize: 13.5,
  },
  pressed: {
    backgroundColor: color.well,
  },
});

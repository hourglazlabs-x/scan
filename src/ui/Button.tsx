// Buttons: the 48 pt pill (ink for the main action, white for the second)
// and the aqua text link used in plate headers ("All 6 rules").

import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { color, radius, space } from '../theme/tokens';
import { font } from '../theme/type';
import { Icon, type IconName } from './Icon';
import { Txt } from './Txt';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  style,
}: ButtonProps) {
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.primary : styles.secondary,
        pressed && (primary ? styles.primaryPressed : styles.secondaryPressed),
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={18} color={primary ? color.tileFg : color.ink} /> : null}
      <Txt variant="button" tone={primary ? 'tileFg' : 'ink'}>
        {label}
      </Txt>
    </Pressable>
  );
}

export interface LinkButtonProps {
  label: string;
  onPress: () => void;
  /** Trailing icon. Defaults to a chevron. */
  icon?: IconName;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** "link" for pages outside the app. */
  role?: 'button' | 'link';
}

export function LinkButton({ label, onPress, icon = 'chevronRight', accessibilityLabel, accessibilityHint, role = 'button' }: LinkButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      hitSlop={{ top: 0, bottom: 0, left: 8, right: 8 }}
      style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
    >
      <Txt style={styles.linkLabel} tone="aquaInk">
        {label}
      </Txt>
      <Icon name={icon} size={16} color={color.aquaInk} strokeWidth={2.5} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s2,
    paddingHorizontal: 20,
    paddingVertical: space.s2,
    borderRadius: radius.pill,
  },
  primary: {
    backgroundColor: color.ink,
  },
  primaryPressed: {
    opacity: 0.86,
  },
  secondary: {
    backgroundColor: color.plate,
    borderWidth: 1,
    borderColor: color.plateRim,
  },
  secondaryPressed: {
    backgroundColor: color.well,
  },
  disabled: {
    opacity: 0.45,
  },
  link: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: space.s2,
    borderRadius: radius.md,
  },
  linkPressed: {
    backgroundColor: color.well,
  },
  linkLabel: {
    fontFamily: font.sansSemibold,
    fontSize: 13,
    lineHeight: 18,
  },
});

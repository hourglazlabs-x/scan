// The 44 pt header row of pushed screens: a back link on the left, an
// optional centred chip, and an optional share button on the right.

import { useCallback, type ReactNode } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, radius, shadow } from '../theme/tokens';
import { font } from '../theme/type';
import { Icon, type IconName } from './Icon';
import { Txt } from './Txt';

/** Goes back, or to `fallback` when the screen was opened directly (a deep link). */
export function useGoBack(fallback = '/'): () => void {
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  }, [fallback]);
}

export interface HeaderBarProps {
  /** Name of the screen the back link returns to, such as "Scan". */
  backLabel: string;
  onBack: () => void;
  center?: ReactNode;
  onShare?: () => void;
}

export function HeaderBar({ backLabel, onBack, center, onShare }: HeaderBarProps) {
  return (
    <View style={styles.bar}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={`Back to ${backLabel}`}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      >
        <Icon name="chevronLeft" size={22} color={color.ink} />
        <Txt style={styles.backLabel}>{backLabel}</Txt>
      </Pressable>
      {center ? (
        <View style={styles.center} pointerEvents="box-none">
          {center}
        </View>
      ) : null}
      {onShare ? <IconButton icon="share" label="Share" onPress={onShare} style={styles.share} /> : null}
    </View>
  );
}

export interface IconButtonProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** plain: no background (headers). plate: a white 44 pt circle with rim and shadow (over the camera). */
  variant?: 'plain' | 'plate';
  /** On state for a toggle such as the flash: ink circle, white icon. */
  active?: boolean;
  /** "switch" reads the on and off state to VoiceOver. */
  role?: 'button' | 'switch';
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  label,
  onPress,
  variant = 'plain',
  active = false,
  role = 'button',
  iconSize = 20,
  style,
}: IconButtonProps) {
  const on = variant === 'plate' && active;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={role === 'switch' ? { checked: active } : undefined}
      style={({ pressed }) => [
        styles.iconButton,
        variant === 'plate' && styles.iconPlate,
        on && styles.iconOn,
        pressed && (on ? styles.iconOnPressed : styles.pressed),
        style,
      ]}
    >
      <Icon name={icon} size={iconSize} color={on ? color.tileFg : color.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingRight: 10,
    marginLeft: -6,
    borderRadius: radius.md,
  },
  backLabel: {
    fontFamily: font.sansMedium,
    fontSize: 15,
    lineHeight: 20,
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  share: {
    marginRight: -10,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  iconPlate: {
    backgroundColor: color.plate,
    borderWidth: 1,
    borderColor: color.plateRim,
    ...shadow.card,
  },
  iconOn: {
    backgroundColor: color.ink,
    borderColor: color.ink,
  },
  iconOnPressed: {
    opacity: 0.86,
  },
  pressed: {
    backgroundColor: color.well,
  },
});

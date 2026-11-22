// Text with the design system's type styles and colour tokens. Font scaling
// stays on (Dynamic Type); pass maxFontSizeMultiplier where a layout is fixed,
// such as numerals inside the dial.

import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { color, type ColorName } from '../theme/tokens';
import { text } from '../theme/type';

export type TextVariant = keyof typeof text;

export interface TxtProps extends TextProps {
  variant?: TextVariant;
  /** A colour token name. Defaults to ink. */
  tone?: ColorName;
  align?: 'left' | 'center' | 'right';
}

const toneStyles: Partial<Record<ColorName, TextStyle>> = {};
for (const name of Object.keys(color) as ColorName[]) toneStyles[name] = { color: color[name] };
const tones = StyleSheet.create(toneStyles as Record<ColorName, TextStyle>);

const aligns = StyleSheet.create({
  left: { textAlign: 'left' },
  center: { textAlign: 'center' },
  right: { textAlign: 'right' },
});

export function Txt({ variant = 'body', tone = 'ink', align, style, ...rest }: TxtProps) {
  return <Text {...rest} style={[text[variant], tones[tone], align ? aligns[align] : null, style]} />;
}

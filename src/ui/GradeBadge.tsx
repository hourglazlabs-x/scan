// The grade, always as an icon and a word (colour is never alone).
//
// Sizes, from the mockups:
// - inline: icon and word only, under a numeral (peek card, breakdown header)
// - sm: a 26 pt pill with the score, "28 Poor" (Index cards)
// - md: a 30 pt pill (the Result score plate). An incomplete product shows
//   amber hazard stripes in place of the icon, the system's warning motif.

import Svg, { Line, Rect } from 'react-native-svg';
import { StyleSheet, View } from 'react-native';

import type { GradeId } from '../domain/types';
import { GRADE_LOOK, type GradeIcon } from '../theme/grade';
import { color, radius } from '../theme/tokens';
import { font, text } from '../theme/type';
import { Icon } from './Icon';
import { Txt } from './Txt';

export type GradeBadgeSize = 'inline' | 'sm' | 'md';

export interface GradeBadgeProps {
  grade: GradeId;
  /** The grade's word from the result, such as "Poor". */
  label: string;
  /** Shown before the word ("28 Poor") when given and not null. */
  score?: number | null;
  size?: GradeBadgeSize;
}

const ICON_STROKE: Record<GradeIcon, number> = { tick: 3, cross: 3, warning: 2.5 };

export function GradeBadge({ grade, label, score, size = 'sm' }: GradeBadgeProps) {
  const look = GRADE_LOOK[grade];
  const hasScore = score !== undefined && score !== null;
  const words = hasScore ? `${score} ${label}` : label;
  const spoken = hasScore ? `${score} of 100, ${label}` : label;
  const fg = { color: look.fg };

  if (size === 'inline') {
    return (
      <View style={styles.inline} accessible accessibilityLabel={spoken}>
        <Icon name={look.icon} size={12} color={look.fg} strokeWidth={ICON_STROKE[look.icon]} />
        <Txt variant="labelStrong" style={fg} maxFontSizeMultiplier={1.6}>
          {words}
        </Txt>
      </View>
    );
  }

  const md = size === 'md';
  const stripes = md && look.stripes;
  return (
    <View
      style={[
        styles.pill,
        md ? styles.pillMd : styles.pillSm,
        { backgroundColor: look.bg },
        look.border ? { borderWidth: 1, borderColor: look.border } : null,
        stripes && styles.pillStriped,
      ]}
      accessible
      accessibilityLabel={spoken}
    >
      {stripes ? (
        <View style={styles.stripes}>
          <HazardStripes />
        </View>
      ) : (
        <Icon name={look.icon} size={md ? 14 : 12} color={look.fg} strokeWidth={ICON_STROKE[look.icon]} />
      )}
      <Txt style={[md ? styles.wordMd : styles.wordSm, fg]} maxFontSizeMultiplier={1.6}>
        {words}
      </Txt>
    </View>
  );
}

/**
 * Amber and white diagonal stripes, 4 pt each, like the mockup's
 * repeating-linear-gradient(45deg, …). Fills its parent; lines are drawn
 * long and clipped, so the block can grow with the text size.
 */
export function HazardStripes({ width = 22, height = 60 }: { width?: number; height?: number }) {
  const step = 8 * Math.SQRT2; // 8 pt period measured across the stripes
  const starts: number[] = [];
  for (let x = -height; x < width + step; x += step) starts.push(x);
  return (
    <Svg width="100%" height="100%">
      <Rect x={0} y={0} width={width} height={height} fill={color.plate} />
      {starts.map((x) => (
        <Line key={x} x1={x} y1={0} x2={x + height} y2={height} stroke={color.amber} strokeWidth={4} />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  pillSm: {
    minHeight: 26,
    gap: 4,
    paddingLeft: 7,
    paddingRight: 9,
  },
  pillMd: {
    minHeight: 30,
    gap: 6,
    paddingLeft: 10,
    paddingRight: 12,
  },
  pillStriped: {
    gap: 8,
    paddingLeft: 0,
    alignItems: 'stretch',
  },
  stripes: {
    width: 22,
    alignSelf: 'stretch',
  },
  wordSm: {
    ...text.labelStrong,
  },
  wordMd: {
    fontFamily: font.sansSemibold,
    fontSize: 15,
    lineHeight: 20,
    alignSelf: 'center',
  },
});

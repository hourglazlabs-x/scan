// The NUÏTRIX score dial, 136 pt, with the mockup's geometry: a 270° gauge
// that starts at 135° (lower left) and runs clockwise to 45° (lower right).
// - an outer bearing ring at r = 65
// - 11 ticks from r = 57 (r = 54 for the majors at 0, 50 and 100) to r = 61
// - an 8 pt track at r = 49, and the score arc over it in the grade's colour
// - a needle notch from r = 40 to r = 58 at the score
// With no score (incomplete), the track is dashed silver and there is no arc.

import Svg, { Circle, Line, Path } from 'react-native-svg';
import { StyleSheet, View } from 'react-native';

import type { GradeId } from '../domain/types';
import { GRADE_LOOK } from '../theme/grade';
import { color } from '../theme/tokens';
import { text } from '../theme/type';
import { Txt } from './Txt';

const BOX = 136;
const C = BOX / 2;
const START = 135;
const SWEEP = 270;
const RING_R = 65;
const TRACK_R = 49;
const TRACK_W = 8;

interface Point {
  x: number;
  y: number;
}

function polar(r: number, degrees: number): Point {
  const a = (degrees * Math.PI) / 180;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
}

const f = (n: number) => n.toFixed(2);

const TICKS = Array.from({ length: 11 }, (_, i) => {
  const degrees = START + (SWEEP / 10) * i;
  const major = i % 5 === 0;
  const from = polar(major ? 54 : 57, degrees);
  const to = polar(61, degrees);
  return { key: i, major, from, to };
});

const TRACK_START = polar(TRACK_R, START);
const TRACK_END = polar(TRACK_R, START + SWEEP);
const TRACK_PATH = `M ${f(TRACK_START.x)} ${f(TRACK_START.y)} A ${TRACK_R} ${TRACK_R} 0 1 1 ${f(TRACK_END.x)} ${f(TRACK_END.y)}`;

function arcPath(score: number): string {
  const sweep = (SWEEP * score) / 100;
  const end = polar(TRACK_R, START + sweep);
  const large = sweep > 180 ? 1 : 0;
  return `M ${f(TRACK_START.x)} ${f(TRACK_START.y)} A ${TRACK_R} ${TRACK_R} 0 ${large} 1 ${f(end.x)} ${f(end.y)}`;
}

export interface ScoreDialProps {
  /** 0 to 100, or null when the product is not scored. */
  score: number | null;
  grade: GradeId;
}

/** Decorative for VoiceOver: the score plate around it carries the spoken score. */
export function ScoreDial({ score, grade }: ScoreDialProps) {
  const scored = score !== null;
  const value = scored ? Math.max(0, Math.min(100, score)) : 0;
  const angle = START + (SWEEP * value) / 100;
  const needleFrom = polar(40, angle);
  const needleTo = polar(58, angle);

  return (
    <View style={styles.dial} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={BOX} height={BOX} viewBox={`0 0 ${BOX} ${BOX}`} fill="none">
        <Circle cx={C} cy={C} r={RING_R} stroke={color.plateRim} strokeWidth={1} fill="none" />
        {TICKS.map((t) => (
          <Line
            key={t.key}
            x1={f(t.from.x)}
            y1={f(t.from.y)}
            x2={f(t.to.x)}
            y2={f(t.to.y)}
            stroke={t.major ? color.ink3 : color.silver}
            strokeWidth={1.5}
          />
        ))}
        {scored ? (
          <>
            <Path d={TRACK_PATH} stroke={color.plateRim} strokeWidth={TRACK_W} fill="none" />
            {value > 0 ? <Path d={arcPath(value)} stroke={GRADE_LOOK[grade].arc} strokeWidth={TRACK_W} fill="none" /> : null}
            <Line
              x1={f(needleFrom.x)}
              y1={f(needleFrom.y)}
              x2={f(needleTo.x)}
              y2={f(needleTo.y)}
              stroke={color.ink}
              strokeWidth={2}
              strokeLinecap="round"
            />
          </>
        ) : (
          <Path d={TRACK_PATH} stroke={color.silver} strokeWidth={TRACK_W} strokeDasharray={[3, 5]} fill="none" />
        )}
      </Svg>
      <View style={styles.center}>
        <Txt
          variant="numeralXL"
          tone={scored ? 'ink' : 'ink3'}
          align="center"
          style={styles.numeral}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          maxFontSizeMultiplier={1.2}
        >
          {scored ? String(value) : '—'}
        </Txt>
        <Txt style={styles.unit} tone="ink3" align="center" maxFontSizeMultiplier={1.3}>
          {scored ? 'of 100' : 'not scored'}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dial: {
    width: BOX,
    height: BOX,
    flexShrink: 0,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numeral: {
    width: 84,
    lineHeight: 44,
  },
  unit: {
    ...text.label,
    fontSize: 11,
    lineHeight: 14,
    marginTop: 2,
  },
});

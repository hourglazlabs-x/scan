// "Why it scored N": the rules that moved the score most, with a link to
// every rule in the breakdown.

import { StyleSheet } from 'react-native';

import type { RuleHit, ScoreResult } from '../domain/types';
import { LinkButton } from './Button';
import { formatPoints, spokenPoints } from './format';
import { ListRow, Plate, PlateHeader } from './Plate';
import { PointsMarker } from './Tile';
import { Txt } from './Txt';

/**
 * The `count` non-zero hits with the largest effect, shown in the engine's
 * order (most negative first). So a big bonus can outrank a small penalty,
 * as in the mockup.
 */
export function topHits(hits: readonly RuleHit[], count = 4): RuleHit[] {
  return hits
    .map((hit, index) => ({ hit, index }))
    .filter(({ hit }) => hit.points !== 0)
    .sort((a, b) => Math.abs(b.hit.points) - Math.abs(a.hit.points) || a.index - b.index)
    .slice(0, count)
    .sort((a, b) => a.index - b.index)
    .map(({ hit }) => hit);
}

export interface WhyPlateProps {
  result: ScoreResult;
  onShowAll: () => void;
}

export function WhyPlate({ result, onShowAll }: WhyPlateProps) {
  const shown = topHits(result.hits);
  const total = result.hits.length;
  return (
    <Plate>
      <PlateHeader
        title={`Why it scored ${result.score ?? '—'}`}
        tightRight
        right={
          total > 0 ? (
            <LinkButton
              label={total === 1 ? 'The rule' : `All ${total} rules`}
              onPress={onShowAll}
              accessibilityHint="Opens the score breakdown"
            />
          ) : null
        }
      />
      {shown.length === 0 ? (
        <ListRow title="No rule added or removed points" detail="Every rule that applies scored 0." />
      ) : (
        shown.map((hit) => (
          <ListRow
            key={hit.ruleId}
            leading={<PointsMarker points={hit.points} />}
            title={hit.label}
            detail={hit.detail}
            trailing={<SignedPoints points={hit.points} />}
            accessibilityLabel={`${hit.label}. ${hit.detail}. ${spokenPoints(hit.points)}.`}
          />
        ))
      )}
    </Plate>
  );
}

/** "−30" in red ink, "+6" in green ink, "0" in grey. md is 15 pt (Result), sm 14 pt (Breakdown). */
export function SignedPoints({ points, size = 'md' }: { points: number; size?: 'sm' | 'md' }) {
  return (
    <Txt
      variant="rowTitle"
      tone={points < 0 ? 'redInk' : points > 0 ? 'greenInk' : 'ink3'}
      align="right"
      maxFontSizeMultiplier={1.4}
      style={[styles.points, size === 'md' ? styles.md : styles.sm]}
    >
      {formatPoints(points)}
    </Txt>
  );
}

const styles = StyleSheet.create({
  points: {
    minWidth: 34,
    flexShrink: 0,
  },
  md: {
    fontSize: 15,
    lineHeight: 20,
  },
  sm: {
    fontSize: 14,
    lineHeight: 20,
  },
});

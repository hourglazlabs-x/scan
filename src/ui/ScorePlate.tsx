// The Result's score plate: the dial, "NUÏTRIX score", the grade badge and
// one sentence. An unscored (incomplete) product gets the dashed dial, the
// striped Incomplete badge and a plain refusal to guess.

import { StyleSheet, View } from 'react-native';

import type { ScoreResult } from '../domain/types';
import { space } from '../theme/tokens';
import { GradeBadge } from './GradeBadge';
import { Plate } from './Plate';
import { ScoreDial } from './ScoreDial';
import { Txt } from './Txt';

export const INCOMPLETE_SENTENCE = 'We won’t guess a score while data is missing.';

export function ScorePlate({ result }: { result: ScoreResult }) {
  const scored = result.score !== null;
  const sentence = scored ? result.summary : INCOMPLETE_SENTENCE;
  const spokenScore = scored ? `${result.score} of 100` : 'not scored';

  return (
    <Plate
      contentStyle={styles.content}
      accessible
      accessibilityLabel={`NUÏTRIX score ${spokenScore}, ${result.gradeLabel}. ${sentence}`}
    >
      <ScoreDial score={result.score} grade={result.grade} />
      <View style={styles.side}>
        <Txt variant="sectionTitle" tone="ink2">
          NUÏTRIX score
        </Txt>
        <GradeBadge grade={result.grade} label={result.gradeLabel} size="md" />
        <Txt variant="body" tone="ink2">
          {sentence}
        </Txt>
      </View>
    </Plate>
  );
}

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s4,
    paddingVertical: 14,
    paddingLeft: space.s3,
    paddingRight: space.s4,
  },
  side: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    gap: 10,
  },
});

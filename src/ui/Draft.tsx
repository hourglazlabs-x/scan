// The scoring rubric's draft status. While RUBRIC.status is "draft", every
// score and grade says so, quietly: amber-ink or grey text, never red.

import { StyleSheet, View } from 'react-native';

import { RUBRIC } from '../rubric/index';
import { color, radius } from '../theme/tokens';
import { Txt } from './Txt';

export const RUBRIC_IS_DRAFT = RUBRIC.status === 'draft';

/** "Rubric v0.1.0 (draft)", or "Rubric v1.0.0" once the rubric is approved. */
export const RUBRIC_LINE = `Rubric v${RUBRIC.version}${RUBRIC_IS_DRAFT ? ' (draft)' : ''}`;

/** A small "Draft" tag beside a score label. Renders nothing once the rubric is approved. */
export function DraftTag() {
  if (!RUBRIC_IS_DRAFT) return null;
  return (
    <View style={styles.tag} accessible accessibilityLabel="Draft rubric">
      <Txt variant="micro" tone="amberInk" maxFontSizeMultiplier={1.4}>
        Draft
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    minHeight: 20,
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: color.amber,
    borderRadius: radius.sm,
    backgroundColor: color.plate,
  },
});

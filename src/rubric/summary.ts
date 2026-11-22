// Builds the one-sentence explanation shown under the score. It is a fixed
// template over the rules' `counted` points (what each rule actually changed
// after clamping), so it can never credit a rule that changed nothing.

import type { MissingInput, RuleHit } from '../domain/types.ts';
import { capitalize, joinList } from './format.ts';

const MISSING_TEXT: Record<MissingInput, string> = {
  nutrition: 'the nutrition facts',
  ingredients: 'the ingredient list',
  processing: 'the processing level',
};

/** Uses at most the two biggest counted penalties and the biggest counted bonus. */
export function summarize(hits: RuleHit[], missing: MissingInput[]): string {
  if (missing.length > 0) {
    const what = joinList(missing.map((m) => MISSING_TEXT[m]));
    return `Not scored: ${what} ${missing.length === 1 ? 'is' : 'are'} missing.`;
  }

  const penalties = hits
    .filter((h) => h.counted < 0)
    .sort((a, b) => a.counted - b.counted || a.points - b.points || compareIds(a.ruleId, b.ruleId));
  const bonuses = hits
    .filter((h) => h.counted > 0)
    .sort((a, b) => b.counted - a.counted || compareIds(a.ruleId, b.ruleId));

  const shown = penalties.slice(0, 2);
  const topBonus = bonuses[0];
  if (shown.length === 0) {
    // Every pillar starts at its maximum, so with no counted penalty nothing
    // was lost, and no bonus can have added anything.
    return 'Nothing lowered the score.';
  }

  const penaltyText = joinList(shown.map((h) => h.phrase));
  const plural = shown.length > 1;
  if (!topBonus) {
    return `${capitalize(penaltyText)} ${plural ? 'lower' : 'lowers'} the score.`;
  }

  // Bonuses only ever make up for penalties, so what was gained is at most what was lost.
  const lost = -penalties.reduce((sum, h) => sum + h.counted, 0);
  const gained = bonuses.reduce((sum, h) => sum + h.counted, 0);
  return lost > gained
    ? `${capitalize(penaltyText)} outweigh${plural ? '' : 's'} the ${topBonus.phrase}.`
    : `The ${topBonus.phrase} offsets ${penaltyText}.`;
}

/** Locale-independent string order, so results never depend on the device language. */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Builds the one-sentence explanation shown under the score. It is a fixed
// template over the rule hits, so it can never disagree with the score.

import type { MissingInput, RuleHit } from '../domain/types.ts';
import { capitalize, joinList } from './format.ts';

const MISSING_TEXT: Record<MissingInput, string> = {
  nutrition: 'the nutrition facts',
  ingredients: 'the ingredient list',
  processing: 'the processing level',
};

/**
 * `hits` must already be sorted most negative first (as the engine returns them).
 * Uses at most the two biggest penalties and the biggest bonus.
 */
export function summarize(hits: RuleHit[], missing: MissingInput[]): string {
  if (missing.length > 0) {
    const what = joinList(missing.map((m) => MISSING_TEXT[m]));
    return `Not scored: ${what} ${missing.length === 1 ? 'is' : 'are'} missing.`;
  }

  const penalties = hits.filter((h) => h.points < 0);
  const bonuses = hits
    .filter((h) => h.points > 0)
    .sort((a, b) => b.points - a.points || compareIds(a.ruleId, b.ruleId));

  const shownPenalties = penalties.slice(0, 2);
  const topBonus = bonuses[0];
  const penaltyText = joinList(shownPenalties.map((h) => h.phrase));
  const plural = shownPenalties.length > 1;

  if (shownPenalties.length > 0 && topBonus) {
    const lost = -penalties.reduce((sum, h) => sum + h.points, 0);
    const gained = bonuses.reduce((sum, h) => sum + h.points, 0);
    return lost > gained
      ? `${capitalize(penaltyText)} outweigh${plural ? '' : 's'} the ${topBonus.phrase}.`
      : `The ${topBonus.phrase} outweighs ${penaltyText}.`;
  }
  if (shownPenalties.length > 0) {
    return `${capitalize(penaltyText)} ${plural ? 'lower' : 'lowers'} the score.`;
  }
  if (topBonus) {
    return `No penalties, and the ${topBonus.phrase} adds points.`;
  }
  return 'No rule changed the score.';
}

/** Locale-independent string order, so results never depend on the device language. */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

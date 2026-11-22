// The NUÏTRIX scoring engine. A pure function: the same product and the same
// rubric always give the same result, on any device, with no network.
//
// Each pillar starts at its maximum. Every rule adds or removes points, and
// the pillar is then clamped to 0..max. The score is the sum of the pillars.
// If an input a pillar needs is missing, the product is not scored at all.
//
// Because of clamping, a rule can be worth more than it changes: a bonus on a
// pillar already at its maximum, or a second penalty on a pillar already at 0,
// changes nothing. Each hit records both `points` (what the rule is worth) and
// `counted` (what it changed), and explanations use `counted` only.

import type {
  GradeId,
  MissingInput,
  NovaGroup,
  PillarId,
  PillarResult,
  Product,
  RuleHit,
  ScoreResult,
} from '../domain/types.ts';
import type { AdditiveItem, NovaKey, RiskLevel, Rubric } from './schema.ts';
import { formatAdditiveCode, formatGrams, formatNumber } from './format.ts';
import { compareIds, summarize } from './summary.ts';

const MISSING_ORDER: readonly MissingInput[] = ['nutrition', 'ingredients', 'processing'];

/** Worded as the rubric's rating, not as a fact about the additive. */
const RISK_DETAIL: Record<RiskLevel, string> = {
  high: 'Rated high risk',
  moderate: 'Rated moderate risk',
  low: 'Rated low risk',
};

const NOVA_DETAIL: Record<NovaGroup, string> = {
  1: 'Unprocessed or minimally processed',
  2: 'Processed culinary ingredient',
  3: 'Processed food',
  4: 'Ultra-processed food',
};

const NOVA_PHRASE: Record<NovaGroup, string> = {
  1: 'minimal processing',
  2: 'culinary processing',
  3: 'processing',
  4: 'ultra-processing',
};

/** Protein supplies 4 kcal per gram (the conversion factor used for nutrition labels). */
const KCAL_PER_GRAM_PROTEIN = 4;

const isKnown = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * Amounts are compared at the precision they are shown (two decimals), so a
 * label can never read "1.5 g" while the rule treats it as above 1.5 g.
 */
const atDisplayPrecision = (v: number): number => Number(v.toFixed(2));

/** Normalises an additive tag such as "en:e250" or "E 150d" to "e250" / "e150d". */
export function normalizeAdditiveCode(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/^[a-z]{2}:/, '')
    .replace(/[\s-]/g, '');
}

export function gradeFor(score: number, rubric: Rubric): { id: Exclude<GradeId, 'incomplete'>; label: string } {
  for (const grade of rubric.grades) {
    if (score >= grade.min) return { id: grade.id, label: grade.label };
  }
  const last = rubric.grades[rubric.grades.length - 1];
  if (!last) throw new Error('Rubric has no grades');
  return { id: last.id, label: last.label };
}

type NewHit = Omit<RuleHit, 'counted'>;

export function scoreProduct(product: Product, rubric: Rubric): ScoreResult {
  const hits: RuleHit[] = [];
  const add = (hit: NewHit) => hits.push({ ...hit, counted: hit.points });
  const unrated: string[] = [];
  const missingBy: Record<PillarId, MissingInput[]> = { nutrients: [], additives: [], processing: [] };
  const per = product.basis === 'drink' ? 'per 100 ml' : 'per 100 g';

  // Nutrient limits. Every limit needs its value, or the pillar is missing.
  for (const limit of rubric.nutrientLimits) {
    const raw = product.nutrients[limit.nutrient];
    if (!isKnown(raw)) {
      if (!missingBy.nutrients.includes('nutrition')) missingBy.nutrients.push('nutrition');
      continue;
    }
    const value = atDisplayPrecision(raw);
    const t = limit.thresholds[product.basis];
    const level = value > t.high ? 'high' : value > t.low ? 'medium' : 'low';
    const name = limit.label.toLowerCase();
    add({
      ruleId: limit.id,
      pillar: 'nutrients',
      label: `${limit.label} ${formatGrams(value)} ${per}`,
      detail:
        level === 'high'
          ? `High: above ${formatGrams(t.high)}`
          : level === 'medium'
            ? `Medium: ${formatNumber(t.low)} to ${formatGrams(t.high)}`
            : `Low: ${formatGrams(t.low)} or less`,
      points: level === 'low' ? 0 : limit.points[level],
      phrase: level === 'high' ? `high ${name}` : level === 'medium' ? `moderate ${name}` : `low ${name}`,
      sources: limit.sources,
    });
  }

  // Nutrient bonuses. A missing value skips the bonus; it never blocks the score.
  for (const bonus of rubric.nutrientBonuses) {
    const raw = product.nutrients[bonus.nutrient];
    if (!isKnown(raw)) continue;
    const grams = atDisplayPrecision(raw);
    const name = bonus.label.toLowerCase();
    const base = {
      ruleId: bonus.id,
      pillar: 'nutrients' as const,
      label: `${bonus.label} ${formatGrams(grams)} ${per}`,
      sources: bonus.sources,
    };
    let measure = grams;
    let shown = formatGrams(grams);
    if (bonus.basis === 'energyShare') {
      const kcal = product.nutrients.energyKcal;
      if (!isKnown(kcal) || kcal === 0) continue;
      measure = (grams * KCAL_PER_GRAM_PROTEIN) / kcal;
      if (measure > 1) {
        // The nutrient alone would supply more energy than the whole product:
        // the stated energy is wrong, so the bonus cannot be judged.
        add({
          ...base,
          detail: 'Not counted: the stated energy is lower than this alone supplies',
          points: 0,
          phrase: name,
        });
        continue;
      }
      // Rounded down, so a value just under a level never displays as that level.
      shown = `${Math.floor(measure * 100)}% of energy`;
    }
    const level = measure >= bonus.levels.high ? 'high' : measure >= bonus.levels.source ? 'source' : 'none';
    const threshold = (v: number) => (bonus.basis === 'energyShare' ? `${Math.round(v * 100)}% of energy` : formatGrams(v));
    add({
      ...base,
      detail:
        level === 'high'
          ? `High: ${shown}`
          : level === 'source'
            ? `Source of ${name}: ${shown}`
            : `Below ${threshold(bonus.levels.source)}`,
      points: level === 'none' ? 0 : bonus.points[level],
      phrase: level === 'high' ? `high ${name}` : level === 'source' ? `${name} content` : `low ${name}`,
    });
  }

  // Additives. Unknown ingredients block the pillar; unlisted additives are reported as unrated.
  if (product.additives === undefined) {
    missingBy.additives.push('ingredients');
  } else {
    const rated = new Map<string, AdditiveItem>(rubric.additiveRisk.items.map((item) => [item.code, item]));
    const codes = [...new Set(product.additives.map(normalizeAdditiveCode))].filter((c) => c.length > 0).sort(compareIds);
    for (const code of codes) {
      const item = rated.get(code);
      if (!item) {
        unrated.push(code);
        continue;
      }
      const display = formatAdditiveCode(code);
      add({
        ruleId: `NX-A:${display}`,
        pillar: 'additives',
        label: `${item.name} (${display})`,
        detail: RISK_DETAIL[item.risk],
        points: rubric.additiveRisk.points[item.risk],
        phrase: item.risk === 'low' ? `low-risk ${item.name.toLowerCase()}` : `added ${item.name.toLowerCase()}`,
        sources: item.sources,
      });
    }
  }

  // Processing: the NOVA group, then category rules such as processed meat.
  if (product.novaGroup === undefined) {
    missingBy.processing.push('processing');
  } else {
    const nova = rubric.processing.nova;
    const key = String(product.novaGroup) as NovaKey;
    add({
      ruleId: nova.id,
      pillar: 'processing',
      label: `Processing level: NOVA ${product.novaGroup}`,
      detail: NOVA_DETAIL[product.novaGroup],
      points: nova.points[key],
      phrase: NOVA_PHRASE[product.novaGroup],
      sources: nova.sources,
    });
  }
  for (const rule of rubric.processing.categoryRules) {
    if (product.categories.some((c) => rule.categories.includes(c.toLowerCase()))) {
      add({
        ruleId: rule.id,
        pillar: 'processing',
        label: rule.label,
        detail: 'Category rule',
        points: rule.points,
        phrase: rule.phrase,
        sources: rule.sources,
      });
    }
  }

  const pillars: PillarResult[] = rubric.pillars.map((p) => {
    const own = hits.filter((h) => h.pillar === p.id);
    const missing = missingBy[p.id];
    if (missing.length > 0) {
      // No score for this pillar, so no rule in it changed one.
      for (const h of own) h.counted = 0;
      return { id: p.id, label: p.label, max: p.max, value: null, raw: null, capped: false, missing: [...missing] };
    }
    const raw = p.max + own.reduce((sum, h) => sum + h.points, 0);
    const value = Math.min(p.max, Math.max(0, raw));
    allocateCounted(own, raw, p.max);
    return { id: p.id, label: p.label, max: p.max, value, raw, capped: value !== raw, missing: [] };
  });

  hits.sort((a, b) => a.counted - b.counted || a.points - b.points || compareIds(a.ruleId, b.ruleId));

  const missing = MISSING_ORDER.filter((m) => pillars.some((p) => p.missing.includes(m)));
  const complete = pillars.every((p) => p.value !== null);
  const score = complete ? pillars.reduce((sum, p) => sum + (p.value ?? 0), 0) : null;
  const grade = score === null ? { id: 'incomplete' as const, label: 'Incomplete' } : gradeFor(score, rubric);

  return {
    rubricId: rubric.id,
    rubricVersion: rubric.version,
    rubricStatus: rubric.status,
    score,
    grade: grade.id,
    gradeLabel: grade.label,
    pillars,
    hits,
    unrated,
    missing,
    summary: summarize(hits, missing),
  };
}

/**
 * Sets `counted` on one pillar's hits so they add up to exactly what the
 * pillar changed (value − max). Order is fixed, so the split is deterministic:
 * - Over the maximum: bonuses only make up for penalties; the largest bonus counts first.
 * - Below zero: penalties stop at zero; the largest penalty counts first.
 */
function allocateCounted(own: RuleHit[], raw: number, max: number): void {
  const penalties = own.filter((h) => h.points < 0).sort((a, b) => a.points - b.points || compareIds(a.ruleId, b.ruleId));
  const bonuses = own.filter((h) => h.points > 0).sort((a, b) => b.points - a.points || compareIds(a.ruleId, b.ruleId));
  // Math.max(0, …) and the `> 0` checks keep every result a plain 0, never −0.
  if (raw > max) {
    let room = Math.max(0, -penalties.reduce((sum, h) => sum + h.points, 0));
    for (const h of bonuses) {
      const take = Math.min(h.points, room);
      h.counted = take > 0 ? take : 0;
      room -= take;
    }
  } else if (raw < 0) {
    let room = Math.max(0, max + bonuses.reduce((sum, h) => sum + h.points, 0));
    for (const h of penalties) {
      const take = Math.min(-h.points, room);
      h.counted = take > 0 ? -take : 0;
      room -= take;
    }
  }
}

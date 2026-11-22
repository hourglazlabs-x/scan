// The NUÏTRIX scoring engine. A pure function: the same product and the same
// rubric always give the same result, on any device, with no network.
//
// Each pillar starts at its maximum. Every rule adds or removes points, and
// the pillar is then clamped to 0..max. The score is the sum of the pillars.
// If an input a pillar needs is missing, the product is not scored at all.

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

const RISK_DETAIL: Record<RiskLevel, string> = {
  high: 'High-risk additive',
  moderate: 'Moderate-risk additive',
  low: 'Low-risk additive',
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

export function scoreProduct(product: Product, rubric: Rubric): ScoreResult {
  const hits: RuleHit[] = [];
  const unrated: string[] = [];
  const missingBy: Record<PillarId, MissingInput[]> = { nutrients: [], additives: [], processing: [] };
  const per = product.basis === 'drink' ? 'per 100 ml' : 'per 100 g';

  // Nutrient limits. Every limit needs its value, or the pillar is missing.
  for (const limit of rubric.nutrientLimits) {
    const value = product.nutrients[limit.nutrient];
    if (!isKnown(value)) {
      if (!missingBy.nutrients.includes('nutrition')) missingBy.nutrients.push('nutrition');
      continue;
    }
    const t = limit.thresholds[product.basis];
    const level = value > t.high ? 'high' : value > t.low ? 'medium' : 'low';
    const name = limit.label.toLowerCase();
    hits.push({
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
    const grams = product.nutrients[bonus.nutrient];
    if (!isKnown(grams)) continue;
    let measure = grams;
    let detailValue = formatGrams(grams);
    if (bonus.basis === 'energyShare') {
      const kcal = product.nutrients.energyKcal;
      if (!isKnown(kcal) || kcal === 0) continue;
      measure = (grams * KCAL_PER_GRAM_PROTEIN) / kcal;
      detailValue = `${Math.round(measure * 100)}% of energy`;
    }
    const level = measure >= bonus.levels.high ? 'high' : measure >= bonus.levels.source ? 'source' : 'none';
    const name = bonus.label.toLowerCase();
    const threshold = (v: number) => (bonus.basis === 'energyShare' ? `${Math.round(v * 100)}% of energy` : formatGrams(v));
    hits.push({
      ruleId: bonus.id,
      pillar: 'nutrients',
      label: `${bonus.label} ${formatGrams(grams)} ${per}`,
      detail:
        level === 'high'
          ? `High: ${detailValue}`
          : level === 'source'
            ? `Source of ${name}: ${detailValue}`
            : `Below ${threshold(bonus.levels.source)}`,
      points: level === 'none' ? 0 : bonus.points[level],
      phrase: level === 'high' ? `high ${name}` : level === 'source' ? `${name} content` : `low ${name}`,
      sources: bonus.sources,
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
      hits.push({
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
    hits.push({
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
      hits.push({
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

  hits.sort((a, b) => a.points - b.points || compareIds(a.ruleId, b.ruleId));

  const pillars: PillarResult[] = rubric.pillars.map((p) => {
    const missing = missingBy[p.id];
    if (missing.length > 0) {
      return { id: p.id, label: p.label, max: p.max, value: null, raw: null, capped: false, missing: [...missing] };
    }
    const raw = p.max + hits.filter((h) => h.pillar === p.id).reduce((sum, h) => sum + h.points, 0);
    const value = Math.min(p.max, Math.max(0, raw));
    return { id: p.id, label: p.label, max: p.max, value, raw, capped: value !== raw, missing: [] };
  });

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

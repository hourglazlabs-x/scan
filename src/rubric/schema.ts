// The shape of a rubric file (for example nuitrix-v0.1.json) and a strict
// validator, so a hand edit to the rubric fails loudly instead of silently
// changing scores.

import type { Basis, NutrientKey, PillarId } from '../domain/types.ts';

export type RiskLevel = 'high' | 'moderate' | 'low';
export type GradeKey = 'optimal' | 'caution' | 'poor';
export type NovaKey = '1' | '2' | '3' | '4';

export interface Grade {
  id: GradeKey;
  label: string;
  /** Lowest score that earns this grade. */
  min: number;
}

export interface Pillar {
  id: PillarId;
  label: string;
  max: number;
}

export interface Thresholds {
  /** At or below this amount per 100 g or 100 ml counts as low. */
  low: number;
  /** Above this amount counts as high. Between low and high is medium. */
  high: number;
}

export interface NutrientLimit {
  id: string;
  nutrient: Extract<NutrientKey, 'salt' | 'sugars' | 'saturatedFat' | 'fat'>;
  label: string;
  thresholds: Record<Basis, Thresholds>;
  points: { medium: number; high: number };
  sources: string[];
}

export interface NutrientBonus {
  id: string;
  nutrient: Extract<NutrientKey, 'proteins' | 'fiber'>;
  label: string;
  /** `energyShare`: share of energy from the nutrient. `per100`: grams per 100 g or 100 ml. */
  basis: 'energyShare' | 'per100';
  levels: { source: number; high: number };
  points: { source: number; high: number };
  sources: string[];
}

export interface AdditiveItem {
  code: string;
  name: string;
  risk: RiskLevel;
  sources: string[];
}

export interface CategoryRule {
  id: string;
  label: string;
  phrase: string;
  categories: string[];
  points: number;
  sources: string[];
}

export interface Source {
  title: string;
  publisher: string;
  year: number;
  url?: string;
  /** False until someone checks the citation against the original. */
  checked: boolean;
}

export interface Rubric {
  id: string;
  version: string;
  status: 'draft' | 'approved';
  note?: string;
  grades: Grade[];
  pillars: Pillar[];
  nutrientLimits: NutrientLimit[];
  nutrientBonuses: NutrientBonus[];
  additiveRisk: { points: Record<RiskLevel, number>; items: AdditiveItem[] };
  processing: {
    nova: { id: string; points: Record<NovaKey, number>; sources: string[] };
    categoryRules: CategoryRule[];
  };
  sources: Record<string, Source>;
}

export class RubricError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Invalid rubric:\n- ${problems.join('\n- ')}`);
    this.name = 'RubricError';
    this.problems = problems;
  }
}

const PILLAR_IDS: readonly PillarId[] = ['nutrients', 'additives', 'processing'];
const GRADE_IDS: readonly GradeKey[] = ['optimal', 'caution', 'poor'];
const RISKS: readonly RiskLevel[] = ['high', 'moderate', 'low'];
const NOVA_KEYS: readonly NovaKey[] = ['1', '2', '3', '4'];
const LIMIT_NUTRIENTS = ['salt', 'sugars', 'saturatedFat', 'fat'] as const;
const BONUS_NUTRIENTS = ['proteins', 'fiber'] as const;
const ADDITIVE_CODE = /^e\d{3,4}[a-z]?$/;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const oneOf = <T extends string>(v: unknown, options: readonly T[]): v is T =>
  typeof v === 'string' && (options as readonly string[]).includes(v);

/** Returns every problem found. An empty list means the rubric is valid. */
export function validateRubric(input: unknown): string[] {
  const problems: string[] = [];
  const fail = (path: string, message: string) => problems.push(`${path}: ${message}`);
  const ruleIds = new Set<string>();
  const usedSources: Array<[string, string]> = [];

  const claimId = (path: string, id: unknown) => {
    if (!isStr(id)) return fail(path, 'id must be a non-empty string');
    if (ruleIds.has(id)) fail(path, `duplicate rule id "${id}"`);
    ruleIds.add(id);
  };
  const checkSources = (path: string, list: unknown) => {
    if (!Array.isArray(list) || list.length === 0) return fail(path, 'sources must list at least one source id');
    list.forEach((s, i) => (isStr(s) ? usedSources.push([`${path}[${i}]`, s]) : fail(`${path}[${i}]`, 'must be a source id')));
  };

  if (!isObj(input)) return ['rubric: must be an object'];
  const r = input;

  if (!isStr(r.id)) fail('id', 'must be a non-empty string');
  if (!isStr(r.version)) fail('version', 'must be a non-empty string');
  if (!oneOf(r.status, ['draft', 'approved'] as const)) fail('status', 'must be "draft" or "approved"');

  // Grades: ids once each, minimums strictly falling, the last at 0.
  if (!Array.isArray(r.grades) || r.grades.length === 0) {
    fail('grades', 'must be a non-empty list');
  } else {
    const seen = new Set<string>();
    let previous = Infinity;
    r.grades.forEach((g, i) => {
      const path = `grades[${i}]`;
      if (!isObj(g)) return fail(path, 'must be an object');
      if (!oneOf(g.id, GRADE_IDS)) fail(path, `id must be one of ${GRADE_IDS.join(', ')}`);
      else if (seen.has(g.id)) fail(path, `duplicate grade "${g.id}"`);
      else seen.add(g.id);
      if (!isStr(g.label)) fail(path, 'label must be a non-empty string');
      if (!isInt(g.min) || g.min < 0 || g.min > 100) fail(path, 'min must be a whole number from 0 to 100');
      else if (g.min >= previous) fail(path, 'min must be lower than the grade before it');
      else previous = g.min;
    });
    const last = r.grades[r.grades.length - 1];
    if (isObj(last) && last.min !== 0) fail('grades', 'the last grade must start at 0');
  }

  // Pillars: exactly the three known pillars, adding up to 100.
  if (!Array.isArray(r.pillars)) {
    fail('pillars', 'must be a list');
  } else {
    const ids = r.pillars.map((p) => (isObj(p) ? p.id : undefined));
    for (const id of PILLAR_IDS) if (!ids.includes(id)) fail('pillars', `missing pillar "${id}"`);
    if (r.pillars.length !== PILLAR_IDS.length) fail('pillars', `must have exactly ${PILLAR_IDS.length} pillars`);
    let total = 0;
    r.pillars.forEach((p, i) => {
      const path = `pillars[${i}]`;
      if (!isObj(p)) return fail(path, 'must be an object');
      if (!oneOf(p.id, PILLAR_IDS)) fail(path, `id must be one of ${PILLAR_IDS.join(', ')}`);
      if (!isStr(p.label)) fail(path, 'label must be a non-empty string');
      if (!isInt(p.max) || p.max <= 0) fail(path, 'max must be a positive whole number');
      else total += p.max;
    });
    if (total !== 100) fail('pillars', `max values must add up to 100 (they add up to ${total})`);
  }

  // Nutrient limits: penalties for medium and high amounts.
  if (!Array.isArray(r.nutrientLimits)) {
    fail('nutrientLimits', 'must be a list');
  } else {
    // Each limit nutrient exactly once: a missing one would let any amount pass unpenalised.
    for (const nutrient of LIMIT_NUTRIENTS) {
      const count = r.nutrientLimits.filter((l) => isObj(l) && l.nutrient === nutrient).length;
      if (count !== 1) fail('nutrientLimits', `needs exactly one rule for ${nutrient} (found ${count})`);
    }
    r.nutrientLimits.forEach((l, i) => {
      const path = `nutrientLimits[${i}]`;
      if (!isObj(l)) return fail(path, 'must be an object');
      claimId(path, l.id);
      if (!oneOf(l.nutrient, LIMIT_NUTRIENTS)) fail(path, `nutrient must be one of ${LIMIT_NUTRIENTS.join(', ')}`);
      if (!isStr(l.label)) fail(path, 'label must be a non-empty string');
      if (!isObj(l.thresholds)) {
        fail(path, 'thresholds must have food and drink values');
      } else {
        for (const basis of ['food', 'drink'] as const) {
          const t = l.thresholds[basis];
          if (!isObj(t) || !isNum(t.low) || !isNum(t.high)) fail(`${path}.thresholds.${basis}`, 'needs numeric low and high');
          else if (!(t.low >= 0 && t.low < t.high)) fail(`${path}.thresholds.${basis}`, 'low must be at least 0 and below high');
        }
      }
      if (!isObj(l.points) || !isInt(l.points.medium) || !isInt(l.points.high)) {
        fail(path, 'points needs whole-number medium and high');
      } else if (!(l.points.high <= l.points.medium && l.points.medium <= 0)) {
        fail(path, 'points must be 0 or negative, with high at least as negative as medium');
      }
      checkSources(`${path}.sources`, l.sources);
    });
  }

  // Nutrient bonuses: points for being a source of, or high in, a nutrient.
  if (!Array.isArray(r.nutrientBonuses)) {
    fail('nutrientBonuses', 'must be a list');
  } else {
    const bonusNutrients = new Set<string>();
    r.nutrientBonuses.forEach((b, i) => {
      const path = `nutrientBonuses[${i}]`;
      if (!isObj(b)) return fail(path, 'must be an object');
      claimId(path, b.id);
      if (!oneOf(b.nutrient, BONUS_NUTRIENTS)) fail(path, `nutrient must be one of ${BONUS_NUTRIENTS.join(', ')}`);
      else if (bonusNutrients.has(b.nutrient)) fail(path, `duplicate bonus for ${b.nutrient}`);
      else bonusNutrients.add(b.nutrient);
      if (!isStr(b.label)) fail(path, 'label must be a non-empty string');
      if (!oneOf(b.basis, ['energyShare', 'per100'] as const)) fail(path, 'basis must be "energyShare" or "per100"');
      if (!isObj(b.levels) || !isNum(b.levels.source) || !isNum(b.levels.high)) fail(path, 'levels needs numeric source and high');
      else if (!(b.levels.source > 0 && b.levels.source < b.levels.high)) fail(path, 'levels.source must be above 0 and below levels.high');
      else if (b.basis === 'energyShare' && b.levels.high > 1) {
        fail(path, 'energyShare levels are shares of energy from 0 to 1 (0.2 means 20 %), not percentages');
      }
      if (!isObj(b.points) || !isInt(b.points.source) || !isInt(b.points.high)) fail(path, 'points needs whole-number source and high');
      else if (!(b.points.source >= 0 && b.points.high >= b.points.source)) fail(path, 'points must be 0 or positive, with high at least source');
      checkSources(`${path}.sources`, b.sources);
    });
  }

  // Additives: points per risk level and the rated list.
  if (!isObj(r.additiveRisk)) {
    fail('additiveRisk', 'must be an object');
  } else {
    const a = r.additiveRisk;
    if (!isObj(a.points)) {
      fail('additiveRisk.points', 'must give points for high, moderate and low');
    } else {
      const pts = a.points;
      for (const risk of RISKS) if (!isInt(pts[risk]) || (pts[risk] as number) > 0) fail(`additiveRisk.points.${risk}`, 'must be a whole number, 0 or negative');
      if (isInt(pts.high) && isInt(pts.moderate) && isInt(pts.low) && !(pts.high <= pts.moderate && pts.moderate <= pts.low)) {
        fail('additiveRisk.points', 'high must be at least as negative as moderate, and moderate as low');
      }
    }
    if (!Array.isArray(a.items)) {
      fail('additiveRisk.items', 'must be a list');
    } else {
      const codes = new Set<string>();
      a.items.forEach((item, i) => {
        const path = `additiveRisk.items[${i}]`;
        if (!isObj(item)) return fail(path, 'must be an object');
        if (!isStr(item.code) || !ADDITIVE_CODE.test(item.code)) fail(path, 'code must look like "e250" or "e150d" (lowercase)');
        else if (codes.has(item.code)) fail(path, `duplicate additive "${item.code}"`);
        else codes.add(item.code);
        if (!isStr(item.name)) fail(path, 'name must be a non-empty string');
        if (!oneOf(item.risk, RISKS)) fail(path, `risk must be one of ${RISKS.join(', ')}`);
        checkSources(`${path}.sources`, item.sources);
      });
    }
  }

  // Processing: NOVA group points and category rules.
  if (!isObj(r.processing)) {
    fail('processing', 'must be an object');
  } else {
    const nova = r.processing.nova;
    if (!isObj(nova)) {
      fail('processing.nova', 'must be an object');
    } else {
      claimId('processing.nova', nova.id);
      if (!isObj(nova.points)) {
        fail('processing.nova.points', 'must give points for NOVA groups 1 to 4');
      } else {
        const pts = nova.points;
        for (const key of NOVA_KEYS) if (!isInt(pts[key]) || (pts[key] as number) > 0) fail(`processing.nova.points.${key}`, 'must be a whole number, 0 or negative');
      }
      checkSources('processing.nova.sources', nova.sources);
    }
    if (!Array.isArray(r.processing.categoryRules)) {
      fail('processing.categoryRules', 'must be a list');
    } else {
      r.processing.categoryRules.forEach((c, i) => {
        const path = `processing.categoryRules[${i}]`;
        if (!isObj(c)) return fail(path, 'must be an object');
        claimId(path, c.id);
        if (!isStr(c.label)) fail(path, 'label must be a non-empty string');
        if (!isStr(c.phrase)) fail(path, 'phrase must be a non-empty string');
        if (!Array.isArray(c.categories) || c.categories.length === 0 || !c.categories.every(isStr)) fail(path, 'categories must be a non-empty list of tags');
        if (!isInt(c.points) || c.points > 0) fail(path, 'points must be a whole number, 0 or negative');
        checkSources(`${path}.sources`, c.sources);
      });
    }
  }

  // Sources: every reference resolves, and every entry is complete.
  if (!isObj(r.sources)) {
    fail('sources', 'must be an object keyed by source id');
  } else {
    const sources = r.sources;
    for (const [id, s] of Object.entries(sources)) {
      const path = `sources.${id}`;
      if (!isObj(s)) {
        fail(path, 'must be an object');
        continue;
      }
      if (!isStr(s.title)) fail(path, 'title must be a non-empty string');
      if (!isStr(s.publisher)) fail(path, 'publisher must be a non-empty string');
      if (!isInt(s.year)) fail(path, 'year must be a whole number');
      if (s.url !== undefined && !(isStr(s.url) && s.url.startsWith('https://'))) fail(path, 'url must start with https://');
      if (typeof s.checked !== 'boolean') fail(path, 'checked must be true or false');
    }
    for (const [path, id] of usedSources) if (!(id in sources)) fail(path, `unknown source "${id}"`);
    // An approved rubric may not rest on a citation nobody has read.
    if (r.status === 'approved') {
      for (const [id, s] of Object.entries(sources)) {
        if (isObj(s) && s.checked !== true) fail(`sources.${id}`, 'must be checked (checked: true) before the rubric is approved');
      }
    }
  }

  return problems;
}

/** Validates and returns the rubric, or throws a RubricError listing every problem. */
export function parseRubric(input: unknown): Rubric {
  const problems = validateRubric(input);
  if (problems.length > 0) throw new RubricError(problems);
  return input as Rubric;
}

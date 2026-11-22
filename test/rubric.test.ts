// Tests for the NUÏTRIX engine and the rubric file. Run with: npm run test:logic
// (node --test, no dependencies needed).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { Product } from '../src/domain/types.ts';
import { gradeFor, normalizeAdditiveCode, scoreProduct } from '../src/rubric/engine.ts';
import { parseRubric, RubricError, validateRubric } from '../src/rubric/schema.ts';

const rubricJson: unknown = JSON.parse(
  readFileSync(new URL('../src/rubric/nuitrix-v0.1.json', import.meta.url), 'utf8'),
);
const rubric = parseRubric(rubricJson);

const source = { name: 'Open Food Facts', fetchedAt: '2026-11-21T19:00:00.000Z' } as const;

// Illustrative products. Values are typical of the category, not taken from a real pack.
const ham: Product = {
  code: '412345678903',
  name: 'Smokehouse ham, sliced',
  basis: 'food',
  nutrients: { energyKcal: 110, fat: 4, saturatedFat: 2.1, sugars: 1, salt: 2.6, proteins: 17, fiber: 0 },
  ingredientsText: 'Pork, water, salt, dextrose, sodium phosphate, sodium ascorbate, sodium nitrite.',
  additives: ['en:e301', 'en:e250', 'en:e451'],
  novaGroup: 4,
  categories: ['en:meats', 'en:prepared-meats', 'en:hams'],
  source,
};

const oats: Product = {
  code: '000000000017',
  name: 'Rolled oats',
  basis: 'food',
  nutrients: { energyKcal: 375, fat: 6.5, saturatedFat: 1.2, sugars: 1, salt: 0.01, proteins: 13, fiber: 10 },
  ingredientsText: 'Whole grain rolled oats.',
  additives: [],
  novaGroup: 1,
  categories: ['en:cereals-and-potatoes', 'en:breakfast-cereals', 'en:rolled-oats'],
  source,
};

const trailMix: Product = {
  code: '000000000024',
  name: 'Sweet & salty trail mix',
  basis: 'food',
  nutrients: { energyKcal: 500, fat: 30, saturatedFat: 6, sugars: 28, salt: 0.8, proteins: 14, fiber: 6 },
  categories: ['en:snacks'],
  source,
};

const cola: Product = {
  code: '000000000031',
  name: 'Classic cola',
  basis: 'drink',
  nutrients: { energyKcal: 42, fat: 0, saturatedFat: 0, sugars: 10.6, salt: 0.01, proteins: 0 },
  ingredientsText: 'Carbonated water, sugar, color (caramel E150d), acid (phosphoric acid), natural flavorings, caffeine.',
  additives: ['en:e150d', 'en:e338'],
  novaGroup: 4,
  categories: ['en:beverages', 'en:carbonated-drinks', 'en:sodas', 'en:colas'],
  source,
};

test('the bundled rubric is valid', () => {
  assert.deepEqual(validateRubric(rubricJson), []);
  assert.equal(rubric.status, 'draft');
});

test('ham: nitrite and salt drive a Poor score, and the math adds up', () => {
  const r = scoreProduct(ham, rubric);
  const pillar = (id: string) => r.pillars.find((p) => p.id === id);

  // Nutrients: 50 − 20 (salt high) − 5 (sat fat medium) − 3 (fat medium) + 6 (protein high) = 28.
  assert.equal(pillar('nutrients')?.value, 28);
  // Additives: 30 − 30 (E250 high risk) + 0 (E301 low risk) = 0. E451 is not rated.
  assert.equal(pillar('additives')?.value, 0);
  assert.equal(pillar('additives')?.capped, false);
  // Processing: 20 − 20 (NOVA 4) − 8 (processed meat) = −8, clamped to 0.
  assert.equal(pillar('processing')?.raw, -8);
  assert.equal(pillar('processing')?.value, 0);
  assert.equal(pillar('processing')?.capped, true);

  assert.equal(r.score, 28);
  assert.equal(r.grade, 'poor');
  assert.equal(r.gradeLabel, 'Poor');
  assert.deepEqual(r.unrated, ['e451']);
  assert.deepEqual(r.missing, []);
  assert.equal(r.hits[0]?.ruleId, 'NX-A:E250');
  assert.equal(r.summary, 'Added sodium nitrite and high salt outweigh the high protein.');
});

test('oats: bonuses cannot push a pillar past its maximum', () => {
  const r = scoreProduct(oats, rubric);
  const nutrients = r.pillars.find((p) => p.id === 'nutrients');
  // 50 − 3 (fat medium) + 3 (protein source, 14% of energy) + 6 (fiber high) = 56, capped at 50.
  assert.equal(nutrients?.raw, 56);
  assert.equal(nutrients?.value, 50);
  assert.equal(nutrients?.capped, true);
  assert.equal(r.score, 100);
  assert.equal(r.grade, 'optimal');
  // Only 3 of the 9 bonus points could count (they make up for the −3); the biggest bonus counts first.
  const counted = (id: string) => r.hits.find((h) => h.ruleId === id)?.counted;
  assert.equal(counted('NX-N12'), 3);
  assert.equal(counted('NX-N11'), 0);
  assert.equal(r.summary, 'The high fiber offsets moderate fat.');
});

test('missing ingredients and processing level: no score, no guess', () => {
  const r = scoreProduct(trailMix, rubric);
  assert.equal(r.score, null);
  assert.equal(r.grade, 'incomplete');
  assert.deepEqual(r.missing, ['ingredients', 'processing']);
  // The nutrient pillar still scores, so the screen can show what is known.
  assert.equal(r.pillars.find((p) => p.id === 'nutrients')?.value !== null, true);
  assert.equal(r.pillars.find((p) => p.id === 'additives')?.value, null);
  assert.equal(r.summary, 'Not scored: the ingredient list and the processing level are missing.');
});

test('missing nutrition facts block the score', () => {
  const r = scoreProduct({ ...oats, nutrients: { proteins: 13, fiber: 10 } }, rubric);
  assert.equal(r.score, null);
  assert.deepEqual(r.missing, ['nutrition']);
});

test('drinks use the per-100 ml thresholds', () => {
  const r = scoreProduct(cola, rubric);
  const sugar = r.hits.find((h) => h.ruleId === 'NX-N02');
  // 10.6 g per 100 ml is medium for a drink (2.5 to 11.25), even though it would be medium for food too.
  assert.equal(sugar?.points, -8);
  assert.equal(sugar?.label, 'Sugars 10.6 g per 100 ml');
  const higher = scoreProduct({ ...cola, nutrients: { ...cola.nutrients, sugars: 11.3 } }, rubric);
  assert.equal(higher.hits.find((h) => h.ruleId === 'NX-N02')?.points, -20);
  // As food, 11.3 g would only be medium.
  const asFood = scoreProduct({ ...cola, basis: 'food', nutrients: { ...cola.nutrients, sugars: 11.3 } }, rubric);
  assert.equal(asFood.hits.find((h) => h.ruleId === 'NX-N02')?.points, -8);
});

test('threshold edges follow the guidance: low is "or less", high is "above"', () => {
  const salt = (value: number) =>
    scoreProduct({ ...oats, nutrients: { ...oats.nutrients, salt: value } }, rubric).hits.find((h) => h.ruleId === 'NX-N01');
  assert.equal(salt(0.3)?.points, 0);
  assert.equal(salt(0.31)?.points, -8);
  assert.equal(salt(1.5)?.points, -8);
  assert.equal(salt(1.51)?.points, -20);
});

test('the same product always gets the same result, whatever order its data arrives in', () => {
  const a = scoreProduct(ham, rubric);
  const b = scoreProduct({ ...ham, additives: ['E 250', 'en:e451', 'en:e301', 'en:e250'] }, rubric);
  assert.deepEqual(a, b);
  assert.deepEqual(scoreProduct(ham, rubric), a);
});

test('the score always equals the sum of the pillars', () => {
  for (const p of [ham, oats, cola]) {
    const r = scoreProduct(p, rubric);
    const sum = r.pillars.reduce((s, x) => s + (x.value ?? 0), 0);
    assert.equal(r.score, sum);
    for (const x of r.pillars) {
      assert.ok(x.value !== null && x.value >= 0 && x.value <= x.max, `${x.id} within 0..${x.max}`);
    }
  }
});

test('grade bands: Optimal from 70, Caution from 40, Poor below', () => {
  assert.equal(gradeFor(100, rubric).id, 'optimal');
  assert.equal(gradeFor(70, rubric).id, 'optimal');
  assert.equal(gradeFor(69, rubric).id, 'caution');
  assert.equal(gradeFor(40, rubric).id, 'caution');
  assert.equal(gradeFor(39, rubric).id, 'poor');
  assert.equal(gradeFor(0, rubric).id, 'poor');
});

test('every rule hit points at sources that exist in the rubric', () => {
  for (const p of [ham, oats, cola]) {
    for (const hit of scoreProduct(p, rubric).hits) {
      assert.ok(hit.sources.length > 0, `${hit.ruleId} has sources`);
      for (const s of hit.sources) assert.ok(s in rubric.sources, `${hit.ruleId} → ${s}`);
    }
  }
});

test('additive tags are normalised', () => {
  assert.equal(normalizeAdditiveCode('en:e250'), 'e250');
  assert.equal(normalizeAdditiveCode('E 150d'), 'e150d');
  assert.equal(normalizeAdditiveCode('fr:E-330'), 'e330');
});

test('the validator rejects broken rubrics with a readable list of problems', () => {
  const broken = structuredClone(rubricJson) as Record<string, any>;
  broken.pillars[0].max = 60;
  broken.nutrientLimits[1].id = 'NX-N01';
  broken.additiveRisk.items[0].sources = ['no-such-source'];
  broken.grades[1].min = 80;
  const problems = validateRubric(broken);
  assert.ok(problems.some((p) => p.includes('add up to 100')), 'pillar total');
  assert.ok(problems.some((p) => p.includes('duplicate rule id "NX-N01"')), 'duplicate id');
  assert.ok(problems.some((p) => p.includes('unknown source "no-such-source"')), 'unknown source');
  assert.ok(problems.some((p) => p.includes('lower than the grade before it')), 'grade order');
  assert.throws(() => parseRubric(broken), RubricError);
});

// ---- Clamping: explanations must only credit what actually changed the score ----

const plain = (over: Partial<Product>): Product => ({
  code: '000000000048',
  basis: 'food',
  nutrients: { energyKcal: 300, fat: 2, saturatedFat: 0.5, sugars: 2, salt: 0.1, proteins: 2, fiber: 1 },
  ingredientsText: 'Test ingredients.',
  additives: [],
  novaGroup: 1,
  categories: [],
  source,
  ...over,
});

test('no penalties: a capped bonus is not credited', () => {
  // Lentils: nothing lowers the score, so the protein bonus has nothing to make up for.
  const lentils = plain({ nutrients: { energyKcal: 350, fat: 1.5, saturatedFat: 0.2, sugars: 2, salt: 0.02, proteins: 24, fiber: 11 } });
  const r = scoreProduct(lentils, rubric);
  assert.equal(r.score, 100);
  assert.ok(r.hits.every((h) => h.counted === 0), 'no rule changed the score');
  assert.equal(r.summary, 'Nothing lowered the score.');
});

test('a bonus on a full pillar never "outweighs" a penalty elsewhere', () => {
  // Wholegrain bread: nutrients are full even before the bonus; processing costs 12.
  const bread = plain({
    nutrients: { energyKcal: 240, fat: 2.5, saturatedFat: 0.5, sugars: 4, salt: 0.25, proteins: 13, fiber: 7 },
    novaGroup: 3,
  });
  const r = scoreProduct(bread, rubric);
  assert.equal(r.score, 88);
  assert.equal(r.hits.find((h) => h.ruleId === 'NX-N11')?.counted, 0);
  assert.equal(r.summary, 'Processing lowers the score.');
});

test('a second penalty on an empty pillar counts for nothing and is not named', () => {
  const salami = plain({
    nutrients: { energyKcal: 400, fat: 30, saturatedFat: 12, sugars: 1, salt: 4.5, proteins: 25, fiber: 0 },
    additives: ['en:e250', 'en:e252'],
    novaGroup: 4,
    categories: ['en:salamis'],
  });
  const r = scoreProduct(salami, rubric);
  const hit = (id: string) => r.hits.find((h) => h.ruleId === id);
  assert.equal(hit('NX-A:E250')?.counted, -30);
  assert.equal(hit('NX-A:E252')?.points, -30);
  assert.equal(hit('NX-A:E252')?.counted, 0);
  assert.equal(hit('NX-P01')?.counted, -20);
  assert.equal(hit('NX-P02')?.counted, 0);
  // Nutrients 50 − 20 − 14 − 8 + 6 = 14; additives and processing at 0.
  assert.equal(r.score, 14);
  assert.equal(r.summary, 'Added sodium nitrite and high salt outweigh the high protein.');
});

test('an equal bonus and penalty "offset" each other', () => {
  const r = scoreProduct(plain({ nutrients: { energyKcal: 300, fat: 5, saturatedFat: 1, sugars: 2, salt: 0.1, proteins: 2, fiber: 3.5 } }), rubric);
  assert.equal(r.score, 100);
  assert.equal(r.summary, 'The fiber content offsets moderate fat.');
});

test('counted points always add up to exactly what each pillar changed', () => {
  const products = [ham, oats, cola, plain({}), plain({ additives: ['e250', 'e171', 'e951'], novaGroup: 4, categories: ['en:hams'] })];
  for (const p of products) {
    const r = scoreProduct(p, rubric);
    for (const pillar of r.pillars) {
      const counted = r.hits.filter((h) => h.pillar === pillar.id).reduce((s, h) => s + h.counted, 0);
      assert.equal(counted, (pillar.value ?? pillar.max) - pillar.max, `${p.code} ${pillar.id}`);
      for (const h of r.hits.filter((x) => x.pillar === pillar.id)) {
        assert.ok(Math.abs(h.counted) <= Math.abs(h.points) && h.counted * h.points >= 0, `${h.ruleId} counted within points`);
      }
    }
  }
});

// ---- Thresholds, precision and plausibility ----

test('drinks and foods differ where the thresholds differ', () => {
  const salt = (basis: 'food' | 'drink') =>
    scoreProduct(plain({ basis, nutrients: { ...plain({}).nutrients, salt: 0.8 } }), rubric).hits.find((h) => h.ruleId === 'NX-N01');
  assert.equal(salt('drink')?.points, -20); // above 0.75 g per 100 ml
  assert.equal(salt('food')?.points, -8); // between 0.3 and 1.5 g per 100 g
});

test('a shown amount never contradicts its band', () => {
  const salt = (value: number) =>
    scoreProduct(plain({ nutrients: { ...plain({}).nutrients, salt: value } }), rubric).hits.find((h) => h.ruleId === 'NX-N01');
  assert.equal(salt(1.504)?.label, 'Salt 1.5 g per 100 g');
  assert.equal(salt(1.504)?.points, -8);
  assert.equal(salt(0.304)?.label, 'Salt 0.3 g per 100 g');
  assert.equal(salt(0.304)?.points, 0);
});

test('protein energy-share edges and display', () => {
  const protein = (grams: number) =>
    scoreProduct(plain({ nutrients: { ...plain({}).nutrients, energyKcal: 100, proteins: grams } }), rubric).hits.find(
      (h) => h.ruleId === 'NX-N11',
    );
  assert.equal(protein(2.99)?.points, 0);
  assert.equal(protein(3)?.points, 3); // 12 % of energy
  assert.equal(protein(4.99)?.points, 3);
  assert.equal(protein(4.99)?.detail, 'Source of protein: 19% of energy');
  assert.equal(protein(5)?.points, 6); // 20 % of energy
});

test('an impossible energy value skips the protein bonus instead of rewarding it', () => {
  const r = scoreProduct({ ...ham, nutrients: { ...ham.nutrients, energyKcal: 26 } }, rubric);
  const hit = r.hits.find((h) => h.ruleId === 'NX-N11');
  assert.equal(hit?.points, 0);
  assert.match(hit?.detail ?? '', /^Not counted/);
});

test('additive risk is worded as the rubric rating, not as fact', () => {
  const hit = scoreProduct(ham, rubric).hits.find((h) => h.ruleId === 'NX-A:E250');
  assert.equal(hit?.detail, 'Rated high risk');
});

// ---- Validator ----

test('the validator requires each limit nutrient exactly once and energy shares as fractions', () => {
  const broken = structuredClone(rubricJson) as Record<string, any>;
  broken.nutrientLimits[1].nutrient = 'salt'; // two salt rules, no sugar rule
  broken.nutrientBonuses[0].levels = { source: 12, high: 20 }; // percentages instead of shares
  const problems = validateRubric(broken);
  assert.ok(problems.some((p) => p.includes('exactly one rule for salt (found 2)')), 'duplicate salt');
  assert.ok(problems.some((p) => p.includes('exactly one rule for sugars (found 0)')), 'missing sugars');
  assert.ok(problems.some((p) => p.includes('not percentages')), 'energy share as percentage');
});

test('a rubric cannot be approved while any source is unchecked', () => {
  const approved = structuredClone(rubricJson) as Record<string, any>;
  approved.status = 'approved';
  assert.ok(validateRubric(approved).some((p) => p.includes('must be checked')));
  for (const s of Object.values(approved.sources) as Array<Record<string, unknown>>) s.checked = true;
  assert.deepEqual(validateRubric(approved), []);
});

// Real Open Food Facts records (test/fixtures/off/real, fetched 2026-11-22)
// through the real normalizer and scorer. These check how the code handles
// actual OFF data, which the synthetic fixtures can only approximate.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { canonicalBarcode } from '../src/off/barcode.ts';
import { normalizeOffProduct } from '../src/off/normalize.ts';
import { scoreProduct } from '../src/rubric/engine.ts';
import { parseRubric } from '../src/rubric/schema.ts';

const rubric = parseRubric(
  JSON.parse(readFileSync(new URL('../src/rubric/nuitrix-v0.1.json', import.meta.url), 'utf8')),
);

const load = (file: string) => {
  const raw: unknown = JSON.parse(readFileSync(new URL(`./fixtures/off/real/${file}`, import.meta.url), 'utf8'));
  const product = normalizeOffProduct(raw, '2026-11-22T23:45:00.000Z');
  assert.ok(product, `${file} normalizes`);
  return { product, result: scoreProduct(product, rubric) };
};

const hit = (r: ReturnType<typeof scoreProduct>, id: string) => r.hits.find((h) => h.ruleId === id);

test('UPC-A: stored under its 13-digit key, all three pillars scored', () => {
  const { product, result } = load('noodle-kit-0737628064502.json');
  assert.equal(product.code, '0737628064502');
  assert.equal(canonicalBarcode('737628064502', 'upc_a'), product.code);
  assert.equal(product.basis, 'food');
  assert.equal(product.novaGroup, 4);
  assert.deepEqual(product.additives, ['e330']);
  assert.deepEqual(result.unrated, ['e330']);
  assert.notEqual(result.score, null);
});

test('EAN-13 drink: drink thresholds and the E150d rating apply', () => {
  const { product, result } = load('cola-330ml-5449000000996.json');
  assert.equal(product.basis, 'drink');
  assert.ok(product.additives?.includes('e150d'));
  assert.equal(hit(result, 'NX-A:E150d')?.detail, 'Rated moderate risk');
  // 10.9 g sugars per 100 ml: medium for a drink (2.5 to 11.25 g).
  assert.equal(hit(result, 'NX-N02')?.points, -8);
  assert.notEqual(result.score, null);
});

test('sweeteners: aspartame is rated, the rest are listed as unrated', () => {
  const { result } = load('cola-zero-330ml-5449000131805.json');
  assert.equal(hit(result, 'NX-A:E951')?.detail, 'Rated moderate risk');
  assert.ok(result.unrated.includes('e950'));
});

test('high sugar and high saturated fat are both penalised at the high level', () => {
  const { result } = load('hazelnut-spread-3017620422003.json');
  assert.equal(hit(result, 'NX-N02')?.points, -20);
  assert.equal(hit(result, 'NX-N03')?.points, -14);
  assert.match(result.summary, /^High sugars and high saturated fat/);
});

test('single-ingredient oats: nothing to penalise beyond fat, grade Optimal', () => {
  const { product, result } = load('rolled-oats-0030000010402.json');
  assert.deepEqual(product.additives, []);
  assert.equal(product.novaGroup, 1);
  assert.equal(result.grade, 'optimal');
});

test('UPC-E: the camera code finds the same record, and a mg-as-g sodium error is not scored', () => {
  const { product, result } = load('cola-12oz-can-upce-0049000006346.json');
  assert.equal(canonicalBarcode('04963406', 'upc_e'), product.code);
  // The record says 31.7 g salt per 100 ml (45 "g" sodium per can): dropped, not scored as high salt.
  assert.equal(product.nutrients.salt, undefined);
  // Saturated fat is missing, but total fat is 0, so it must be 0 too.
  assert.equal(product.nutrients.saturatedFat, 0);
  assert.equal(result.score, null);
  assert.deepEqual(result.missing, ['nutrition']);
  assert.equal(result.summary, 'Not scored: the nutrition facts are missing.');
});

test('no ingredients and no categories: Incomplete, never a guessed score', () => {
  const { product, result } = load('diet-cola-12oz-can-upce-0049000006582.json');
  assert.equal(canonicalBarcode('04965802', 'upc_e'), product.code);
  assert.equal(product.additives, undefined);
  assert.equal(result.score, null);
  assert.deepEqual(result.missing, ['ingredients', 'processing']);
});

test('contradictory nutrients are dropped, not scored', async () => {
  const { checkNutrients } = await import('../src/off/normalize.ts');
  // Saturated fat cannot exceed total fat: one of them is wrong, so saturated fat becomes unknown.
  assert.equal(checkNutrients({ fat: 2, saturatedFat: 5 }, 'food').saturatedFat, undefined);
  // Salty foods are real (stock cubes are around 50 g per 100 g), so the drink limit does not apply to food.
  assert.equal(checkNutrients({ salt: 50 }, 'food').salt, 50);
  assert.equal(checkNutrients({ salt: 3 }, 'drink').salt, undefined);
});

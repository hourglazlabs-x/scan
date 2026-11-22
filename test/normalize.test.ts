// Tests for the Open Food Facts normalizer. The fixtures in test/fixtures/off
// are synthetic records in the OFF API v2 shape. Run with: npm test
// Scores are checked only where normalization decides them (known or unknown
// inputs); the engine's own numbers are covered by rubric.test.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Product } from '../src/domain/types.ts';
import { categoryLabel, normalizeOffProduct, offNumber } from '../src/off/normalize.ts';
import { scoreProduct } from '../src/rubric/engine.ts';
import { FETCHED_AT, fixture, loadRubric } from './helpers.ts';

const rubric = loadRubric();
const normalize = (raw: unknown) => normalizeOffProduct(raw, FETCHED_AT);
const withNutriments = (nutriments: Record<string, unknown>) =>
  normalize({ code: '0400000000046', nutriments })?.nutrients;
const additivesOf = (fields: Record<string, unknown>) => normalize({ code: '0400000000046', ...fields })?.additives;

function product(name: string): Product {
  const p = normalize(fixture(name));
  assert.ok(p, `${name} normalizes`);
  return p;
}

test('a complete product maps every field', () => {
  const expected: Product = {
    code: '0412345678903',
    name: 'Smoked ham, sliced',
    brand: 'Example Smokehouse',
    quantity: '9 oz (255 g)',
    basis: 'food',
    nutrients: { energyKcal: 110, fat: 4, saturatedFat: 2.1, sugars: 1, salt: 2.6, proteins: 17, fiber: 0 },
    ingredientsText: 'Pork, water, salt, dextrose, sodium phosphate, sodium ascorbate, sodium nitrite.',
    additives: ['e250', 'e301', 'e451'],
    novaGroup: 4,
    categories: ['en:meats-and-their-products', 'en:meats', 'en:prepared-meats', 'en:hams', 'fr:jambons-fumes-en-tranches'],
    imageUrl: 'https://images.openfoodfacts.org/images/products/041/234/567/8903/front_en.4.400.jpg',
    source: { name: 'Open Food Facts', fetchedAt: FETCHED_AT, lastModified: 1763251200 },
  };
  assert.deepEqual(product('found-complete'), expected);
  assert.deepEqual(scoreProduct(product('found-complete'), rubric).missing, [], 'every input is known');
});

test('the full API response and the bare product (bulk export shape) give the same Product', () => {
  const response = fixture('found-complete') as { product: unknown };
  assert.deepEqual(normalize(response.product), normalize(response));
});

test('a normalized product survives a JSON round trip unchanged (no undefined keys)', () => {
  for (const name of ['found-complete', 'missing-ingredients', 'no-additives', 'bare-strings', 'drink', 'absurd']) {
    const p = product(name);
    assert.deepEqual(JSON.parse(JSON.stringify(p)), p, name);
  }
});

test('empty ingredients with additives_n 0: additives are unknown, and the product is Incomplete', () => {
  // The fixture has ingredients_text "", ingredients_text_en "   ", additives_n 0 and additives_tags ["en:e330"].
  const p = product('missing-ingredients');
  assert.equal(p.additives, undefined);
  assert.equal('additives' in p, false);
  assert.equal(p.ingredientsText, undefined);
  const r = scoreProduct(p, rubric);
  assert.equal(r.score, null);
  assert.ok(r.missing.includes('ingredients'));
  assert.equal(r.pillars.find((x) => x.id === 'additives')?.value, null, 'no full additives pillar without ingredients');
});

test('additives_n alone never makes additives known', () => {
  assert.equal(additivesOf({ additives_n: 0 }), undefined);
  assert.equal(additivesOf({ additives_n: 2, additives_tags: ['en:e330', 'en:e250'] }), undefined);
  assert.equal(additivesOf({ ingredients_text: '', additives_n: 0 }), undefined);
});

test('ingredient text or ingredients_n > 0 makes additives known, with or without tags', () => {
  assert.deepEqual(additivesOf({ ingredients_text: 'Peanuts, raisins, salt.' }), []);
  assert.deepEqual(additivesOf({ ingredients_text_en: 'Peanuts.', additives_tags: ['en:e330'] }), ['e330']);
  assert.deepEqual(additivesOf({ ingredients_n: 3 }), []);
  assert.deepEqual(additivesOf({ ingredients_n: '2', additives_tags: ['en:e330'] }), ['e330']);
  assert.equal(additivesOf({ ingredients_n: 0, additives_tags: ['en:e330'] }), undefined);
  assert.equal(additivesOf({ ingredients_n: 'n/a' }), undefined);
  // Tags are normalized, deduplicated and sorted.
  assert.deepEqual(
    additivesOf({ ingredients_text: 'x', additives_tags: ['en:e330', 'en:E250', 'fr:e-330', 7] }),
    ['e250', 'e330'],
  );
});

test('ingredients known and no tags: analysed, and none found (additives [])', () => {
  const p = product('no-additives');
  assert.deepEqual(p.additives, []);
  assert.equal(p.ingredientsText, 'Green peas.');
  assert.ok(!scoreProduct(p, rubric).missing.includes('ingredients'));
});

test('numbers as strings, in the bare export shape, with salt and energy derived', () => {
  const expected: Product = {
    // The 12-digit UPC-A in the record is stored as its 13-digit canonical key.
    code: '0400000000046',
    name: 'Rolled oats',
    brand: 'Example Mills',
    quantity: '18 oz (510 g)',
    basis: 'food',
    nutrients: { energyKcal: 375, fat: 6.5, saturatedFat: 1.2, sugars: 1, salt: 0.01, proteins: 13, fiber: 10 },
    ingredientsText: 'Whole grain rolled oats.',
    additives: [],
    novaGroup: 1,
    categories: ['en:plant-based-foods-and-beverages', 'en:cereals-and-potatoes', 'en:breakfast-cereals', 'en:rolled-oats'],
    source: { name: 'Open Food Facts', fetchedAt: FETCHED_AT, lastModified: 1763251200 },
  };
  assert.deepEqual(product('bare-strings'), expected);
});

test('salt only as sodium: salt = sodium × 2.5', () => {
  assert.equal(withNutriments({ sodium_100g: 0.4 })?.salt, 1);
  assert.equal(withNutriments({ sodium_100g: '0.12' })?.salt, 0.3);
  // A given salt value wins over sodium.
  assert.equal(withNutriments({ salt_100g: 0.5, sodium_100g: 0.4 })?.salt, 0.5);
  assert.equal(withNutriments({})?.salt, undefined);
});

test('energy only in kJ: kcal = kJ ÷ 4.184 (energy-kj_100g first, then energy_100g)', () => {
  assert.equal(withNutriments({ 'energy-kj_100g': 1569 })?.energyKcal, 375);
  assert.equal(withNutriments({ energy_100g: 176 })?.energyKcal, 42.1);
  assert.equal(withNutriments({ 'energy-kj_100g': 1000, energy_100g: 2000 })?.energyKcal, 239);
  assert.equal(withNutriments({ 'energy-kcal_100g': 42, 'energy-kj_100g': 999 })?.energyKcal, 42);
});

test('floating-point noise is rounded away (0.30000000000000004 g → 0.3 g)', () => {
  assert.equal(withNutriments({ salt_100g: 0.30000000000000004 })?.salt, 0.3);
  assert.equal(withNutriments({ sodium_100g: 0.12000000000000001 })?.salt, 0.3);
});

test('drinks: the en:beverages tag sets the drink basis', () => {
  const cola = product('drink');
  assert.equal(cola.basis, 'drink');
  assert.equal(cola.nutrients.energyKcal, 42.1);
  assert.equal(cola.nutrients.fiber, undefined);
  // The tag must match exactly: "en:plant-based-foods-and-beverages" is food.
  assert.equal(product('no-additives').basis, 'food');
});

test('absurd values are dropped, and the fallbacks fill in where they can', () => {
  const p = product('absurd');
  // fat −1, sugars 250, protein "abc" and fiber 100.5 are dropped; 5000 kcal falls back to
  // 1000 kJ; salt 101 g falls back to sodium 0.4 g × 2.5.
  assert.deepEqual(p.nutrients, { energyKcal: 239, saturatedFat: 2, salt: 1 });
  assert.equal(p.novaGroup, undefined);
  assert.equal(p.name, 'Snack with data entry errors');
  assert.equal(p.imageUrl, undefined, 'only https image URLs are kept');
  // The limits themselves are allowed.
  assert.deepEqual(withNutriments({ fat_100g: 100, 'energy-kcal_100g': 900 }), { energyKcal: 900, fat: 100 });
  assert.deepEqual(withNutriments({ fat_100g: 100.01, 'energy-kcal_100g': 900.1 }), {});
});

test('garbage input gives null', () => {
  const garbage: unknown[] = [
    null,
    undefined,
    42,
    'product',
    [],
    {},
    { code: '' },
    { code: 'n/a' },
    { code: '0400000000015', status: 0 },
    { code: '0400000000015', status: 1, product: null },
    { code: '0400000000015', status: 1, product: 'none' },
    { code: '0400000000015', status: 0, product: { code: '0400000000015' } },
    fixture('not-found'),
  ];
  for (const raw of garbage) assert.equal(normalize(raw), null, JSON.stringify(raw) ?? String(raw));
});

test('codes: canonical keys, numbers accepted, the envelope code used when the product has none', () => {
  assert.equal(normalize({ code: ' 4123-4567-8903 ' })?.code, '0412345678903');
  assert.equal(normalize({ code: 412345678903 })?.code, '0412345678903');
  assert.equal(normalize({ code: '0412345678903', status: 1, product: { product_name: 'x' } })?.code, '0412345678903');
});

test('8-digit OFF codes: EAN-8 first, then UPC-E, so export rows match camera scans', () => {
  // Not a valid EAN-8 but a valid UPC-E: keyed like a camera scan of it.
  assert.equal(normalize({ code: '04252614' })?.code, '0042100005264');
  // Valid as EAN-8 (and as UPC-E): EAN-8 wins, as for a code typed without a type.
  assert.equal(normalize({ code: '01234565' })?.code, '01234565');
  // No canonical form: the digits are kept, and build-pack drops the product.
  assert.equal(normalize({ code: '123' })?.code, '123');
});

test('names and brands: English name first, first brand of the list', () => {
  assert.equal(normalize({ code: '96385074', product_name: 'Jambon', product_name_en: 'Ham' })?.name, 'Ham');
  assert.equal(normalize({ code: '96385074', product_name: 'Jambon', product_name_en: '  ' })?.name, 'Jambon');
  assert.equal(normalize({ code: '96385074', brands: ',  Acme , Other' })?.brand, 'Acme');
  assert.equal(normalize({ code: '96385074', brands: ['', 'Acme'] })?.brand, 'Acme');
  assert.equal(normalize({ code: '96385074' })?.brand, undefined);
});

test('offNumber accepts plain numbers only', () => {
  assert.equal(offNumber(2.6), 2.6);
  assert.equal(offNumber(' 2,6 '), 2.6);
  assert.equal(offNumber('1e2'), 100);
  assert.equal(offNumber('.5'), 0.5);
  for (const v of ['', ' ', '0x10', '<0.5', '1,234.5', 'abc', NaN, Infinity, true, null, undefined]) {
    assert.equal(offNumber(v), undefined, String(v));
  }
});

test('categoryLabel: the most specific English tag, readable', () => {
  assert.equal(categoryLabel(['en:meats', 'en:prepared-meats', 'en:hams', 'fr:jambons-fumes']), 'Hams');
  assert.equal(categoryLabel(['en:beverages', 'en:carbonated-drinks']), 'Carbonated drinks');
  assert.equal(categoryLabel(['en:plant-based-foods', 'en:frozen--vegetables']), 'Frozen vegetables');
  assert.equal(categoryLabel(['fr:jambons', 'de:schinken']), undefined);
  assert.equal(categoryLabel(['en:']), undefined);
  assert.equal(categoryLabel([]), undefined);
});

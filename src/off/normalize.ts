// Turns an Open Food Facts record into a Product. Pure and defensive: OFF is
// crowd-sourced, so numbers arrive as strings, fields go missing and values
// can be negative or absurd. Anything that cannot be trusted becomes
// undefined ("not known"), which the engine reports as Incomplete instead
// of guessing.

import type { NovaGroup, Nutrients, Product, ProductSource } from '../domain/types.ts';
import { normalizeAdditiveCode } from '../rubric/engine.ts';
import { capitalize } from '../rubric/format.ts';
import { canonicalBarcode, normalizeBarcode } from './barcode.ts';
import type { OffField } from './fields.ts';

/** The product fields we request (see fields.ts), all untrusted. */
type OffProduct = Partial<Record<OffField, unknown>>;

const MAX_GRAMS = 100;
const MAX_KCAL = 900;
const KJ_PER_KCAL = 4.184;
const SALT_PER_SODIUM = 2.5;

/**
 * Basis rule: a product is a drink when its categories include
 * "en:beverages". OFF stores per-100 ml values for drinks under the same
 * `_100g` keys, and categories_tags lists every parent category, so each
 * drink category carries this tag. Known gap: dry products filed under
 * beverages (ground coffee, tea leaves, drink powders) may be labelled per
 * 100 g, and are scored on drink thresholds until a rule excludes them.
 */
const DRINK_TAG = 'en:beverages';

const NUMBER_TEXT = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isNotFoundStatus = (status: unknown): boolean => status === 0 || status === '0' || status === 'failure';

/** A finite number, or a string holding only a number ("2.6", " 2,6 "). Anything else is undefined. */
export function offNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!NUMBER_TEXT.test(trimmed)) return undefined;
  const n = Number(trimmed.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(text).filter((v): v is string => v !== undefined);
}

/** Drops undefined values, so a product survives a JSON round trip (the cache) unchanged. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Rounds away floating-point noise first (OFF derives values such as
 * 0.30000000000000004 g, which would cross a 0.3 g threshold), then keeps
 * the value only if it lies within 0..max.
 */
function inRange(value: number, max: number, decimals: number): number | undefined {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor || 0; // `|| 0` turns -0 into 0
  return rounded >= 0 && rounded <= max ? rounded : undefined;
}

/**
 * Per-100 g (or 100 ml) values. A missing or out-of-range value counts as
 * missing, so the fallback applies: kcal from kJ, salt from sodium.
 */
function readNutrients(value: unknown): Nutrients {
  const n = isRecord(value) ? value : {};
  const read = (key: string, max: number, decimals: number, scale = 1): number | undefined => {
    const v = offNumber(n[key]);
    return v === undefined ? undefined : inRange(v * scale, max, decimals);
  };
  const grams = (key: string, scale = 1) => read(key, MAX_GRAMS, 3, scale);
  const kcal = (key: string, scale = 1) => read(key, MAX_KCAL, 1, scale);
  return compact<Nutrients>({
    // energy_100g is OFF's energy in kJ.
    energyKcal: kcal('energy-kcal_100g') ?? kcal('energy-kj_100g', 1 / KJ_PER_KCAL) ?? kcal('energy_100g', 1 / KJ_PER_KCAL),
    fat: grams('fat_100g'),
    saturatedFat: grams('saturated-fat_100g'),
    sugars: grams('sugars_100g'),
    salt: grams('salt_100g') ?? grams('sodium_100g', SALT_PER_SODIUM),
    proteins: grams('proteins_100g'),
    fiber: grams('fiber_100g'),
  });
}

/**
 * Additives are known only once the ingredients are: a non-empty ingredient
 * text, or at least one parsed ingredient (ingredients_n > 0). Without them
 * an empty additives_tags means "not analysed", not "none", so the result is
 * undefined and the product shows as Incomplete. additives_n alone is not
 * trusted: OFF can report 0 for a product whose ingredient list is empty.
 */
function readAdditives(p: OffProduct): string[] | undefined {
  const parsed = offNumber(p.ingredients_n);
  const known =
    text(p.ingredients_text) !== undefined ||
    text(p.ingredients_text_en) !== undefined ||
    (parsed !== undefined && parsed > 0);
  if (!known) return undefined;
  const codes = strings(p.additives_tags)
    .map(normalizeAdditiveCode)
    .filter((c) => c.length > 0);
  return [...new Set(codes)].sort();
}

function readNova(value: unknown): NovaGroup | undefined {
  const n = offNumber(value);
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : undefined;
}

/** OFF stores brands as one comma-separated string; the first is the main brand. */
function firstBrand(value: unknown): string | undefined {
  const list: unknown[] = typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value : [];
  for (const item of list) {
    const brand = text(item);
    if (brand !== undefined) return brand;
  }
  return undefined;
}

function codeDigits(value: unknown): string {
  if (typeof value === 'string') return normalizeBarcode(value);
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return '';
}

/**
 * OFF records carry no symbology, so an 8-digit code is read as EAN-8 first
 * and, only if that check digit fails, as UPC-E. That way a UPC-E product in
 * the bulk export gets the same key as a camera scan of it. A code that is
 * neither keeps its digits (createLookup re-keys API results anyway, and
 * build-pack drops codes that have no canonical form).
 */
function productKey(digits: string): string {
  return canonicalBarcode(digits) ?? canonicalBarcode(digits, 'upc_e') ?? digits;
}

function httpsUrl(value: unknown): string | undefined {
  const url = text(value);
  return url?.startsWith('https://') ? url : undefined;
}

function readSource(p: OffProduct, fetchedAt: string): ProductSource {
  const modified = offNumber(p.last_modified_t);
  const lastModified = modified !== undefined && Number.isInteger(modified) && modified > 0 ? modified : undefined;
  return compact<ProductSource>({ name: 'Open Food Facts', fetchedAt, lastModified });
}

/**
 * Accepts a full API v2 response ({ code, status, product }) or a bare product
 * object (one line of the bulk JSONL export). Returns null when there is no
 * usable product: not an object, a "not found" response, or no barcode.
 * The code is stored as its canonical key (see canonicalBarcode).
 */
export function normalizeOffProduct(raw: unknown, fetchedAt: string): Product | null {
  if (!isRecord(raw)) return null;
  let record: Record<string, unknown> = raw;
  let envelopeCode = '';
  if (isRecord(raw.product)) {
    if (isNotFoundStatus(raw.status)) return null;
    record = raw.product;
    envelopeCode = codeDigits(raw.code);
  } else if ('product' in raw || 'status_verbose' in raw || isNotFoundStatus(raw.status)) {
    return null;
  }
  const code = codeDigits(record.code) || envelopeCode;
  if (code === '') return null;

  const p: OffProduct = record;
  const categories = strings(p.categories_tags);
  return compact<Product>({
    code: productKey(code),
    name: text(p.product_name_en) ?? text(p.product_name),
    brand: firstBrand(p.brands),
    quantity: text(p.quantity),
    basis: categories.includes(DRINK_TAG) ? 'drink' : 'food',
    nutrients: readNutrients(p.nutriments),
    ingredientsText: text(p.ingredients_text_en) ?? text(p.ingredients_text),
    additives: readAdditives(p),
    novaGroup: readNova(p.nova_group),
    categories,
    imageUrl: httpsUrl(p.image_front_url) ?? httpsUrl(p.image_url),
    source: readSource(p, fetchedAt),
  });
}

/**
 * Readable name of the most specific English category, for example
 * "en:prepared-meats" → "Prepared meats". OFF lists category tags from the
 * most general to the most specific, so the last "en:" tag wins. Tags in
 * other languages ("fr:…", kept by OFF when a category is not in its
 * taxonomy) are skipped.
 */
export function categoryLabel(categories: readonly string[]): string | undefined {
  for (let i = categories.length - 1; i >= 0; i--) {
    const tag = categories[i];
    if (tag === undefined || !tag.startsWith('en:')) continue;
    const words = tag.slice(3).replace(/-+/g, ' ').trim();
    if (words.length > 0) return capitalize(words);
  }
  return undefined;
}

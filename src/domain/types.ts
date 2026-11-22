// Core data shapes shared by the scanner, the scoring engine and storage.
// Nothing here depends on Open Food Facts or on React Native, so the same
// types can be reused by a server later.

/** Whether nutrient values are per 100 g (food) or per 100 ml (drink). */
export type Basis = 'food' | 'drink';

/** Nutrient amounts per 100 g or 100 ml. `undefined` means not known. */
export interface Nutrients {
  energyKcal?: number;
  fat?: number;
  saturatedFat?: number;
  sugars?: number;
  salt?: number;
  proteins?: number;
  fiber?: number;
}

export type NutrientKey = keyof Nutrients;

export type NovaGroup = 1 | 2 | 3 | 4;

/** A product as the app understands it, independent of its data source. */
export interface Product {
  /** Barcode digits as scanned (UPC-A, EAN-13, EAN-8 or UPC-E). */
  code: string;
  name?: string;
  brand?: string;
  /** Quantity as printed on the pack, for example "9 oz (255 g)". */
  quantity?: string;
  basis: Basis;
  nutrients: Nutrients;
  /** The ingredient list as printed. `undefined` means not known. */
  ingredientsText?: string;
  /**
   * Lowercase E-number codes found in the ingredients, for example "e250".
   * `undefined` means the ingredients have not been analysed, so additives
   * are unknown. An empty array means none were found.
   */
  additives?: string[];
  novaGroup?: NovaGroup;
  /** Category tags, for example "en:hams". */
  categories: string[];
  imageUrl?: string;
  source: ProductSource;
}

export interface ProductSource {
  name: 'Open Food Facts';
  /** ISO 8601 time the record was fetched. */
  fetchedAt: string;
  /** Source's own last-modified time, seconds since the epoch, when given. */
  lastModified?: number;
}

export type PillarId = 'nutrients' | 'additives' | 'processing';

export type GradeId = 'optimal' | 'caution' | 'poor' | 'incomplete';

/** Inputs that can be missing and stop a product from being scored. */
export type MissingInput = 'nutrition' | 'ingredients' | 'processing';

/** One rule that the engine evaluated, with its effect on the score. */
export interface RuleHit {
  ruleId: string;
  pillar: PillarId;
  /** Short name with the measured value, for example "Salt 2.6 g per 100 g". */
  label: string;
  /** Why it scored this way, for example "High: above 1.5 g". */
  detail: string;
  /** Points added (positive) or removed (negative). Zero is allowed. */
  points: number;
  /** Lowercase phrase used in the summary sentence, for example "high salt". */
  phrase: string;
  /** Ids of entries in the rubric's `sources`. */
  sources: string[];
}

export interface PillarResult {
  id: PillarId;
  label: string;
  max: number;
  /** Points kept after clamping to 0..max. `null` when inputs are missing. */
  value: number | null;
  /** `max` plus the sum of rule points, before clamping. */
  raw: number | null;
  /** True when clamping changed the value. */
  capped: boolean;
  missing: MissingInput[];
}

export interface ScoreResult {
  rubricId: string;
  rubricVersion: string;
  rubricStatus: 'draft' | 'approved';
  /** 0 to 100, or `null` when the product cannot be scored. */
  score: number | null;
  grade: GradeId;
  gradeLabel: string;
  pillars: PillarResult[];
  /** Every rule evaluated, most negative first. */
  hits: RuleHit[];
  /** Additive codes found in the product that the rubric does not rate. */
  unrated: string[];
  missing: MissingInput[];
  /** One plain sentence on what moved the score. */
  summary: string;
}

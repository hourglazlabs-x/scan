// Category pictograms: an ink tile with a white glyph, used when there is no
// product photo. The glyph is picked from category tags and names:
// deli tray, pouch, bowl, cup, bottle, or a generic package.

import type { Basis } from '../domain/types';
import { radius as radii } from '../theme/tokens';
import { IconTile } from './Tile';

export type PictogramKind = 'deli' | 'pouch' | 'bowl' | 'cup' | 'bottle' | 'package';

export interface PictogramHint {
  /** Open Food Facts category tags, general to specific ("en:meats", …, "en:hams"). */
  categories?: readonly string[];
  /** A readable category such as "Hams". */
  categoryLabel?: string;
  name?: string;
  basis?: Basis;
}

// Order matters: yogurt is a cup before "milk" makes it a bottle, and a
// chocolate bar is a pouch before "milk chocolate" does.
const RULES: readonly (readonly [PictogramKind, RegExp])[] = [
  ['deli', /\b(meats?|hams?|bacons?|sausages?|salamis?|deli|cured|hot-?dogs?|turkey|chicken|poultry|charcuterie|jerky|pepperoni|prosciutto)\b/],
  ['cup', /\b(yogh?urts?|skyr|kefir|puddings?|desserts?|custards?)\b/],
  ['pouch', /\b(snacks?|chips|crisps|nuts?|trail|seeds?|candy|candies|confectionery|confectioneries|sweets|cookies?|biscuits?|crackers?|chocolates?|bars?|popcorn|dried)\b/],
  ['bottle', /\b(beverages?|drinks?|waters?|juices?|sodas?|colas?|lemonades?|teas?|coffees?|wines?|beers?|milks?|oils?|vinegars?|sauces?|syrups?|ketchup|dressings?)\b/],
  ['cup', /\b(dairy|dairies|cheeses?|creams?|butter)\b/],
  ['bowl', /\b(cereals?|oats?|grains?|muesli|granola|porridge|rice|pasta|noodles?|soups?|legumes?|beans?|lentils?|flours?|flakes)\b/],
];

/** Tags so broad that they say nothing about the pack ("en:plant-based-foods-and-beverages"). */
const TOO_BROAD = /foods-and-beverages|plant-based-foods$/;

export function pictogramFor(hint: PictogramHint): PictogramKind {
  if (hint.basis === 'drink') return 'bottle';
  const tags = [...(hint.categories ?? [])].reverse().filter((tag) => !TOO_BROAD.test(tag));
  // Most specific first: the readable label, then tags from the specific end, then the name.
  const candidates = [hint.categoryLabel, ...tags, hint.name].filter((c): c is string => Boolean(c));
  for (const candidate of candidates) {
    const words = candidate.toLowerCase().replace(/^[a-z]{2,3}:/, '').replace(/_/g, '-');
    for (const [kind, pattern] of RULES) {
      if (pattern.test(words)) return kind;
    }
  }
  return 'package';
}

export interface PictogramProps {
  kind: PictogramKind;
  /** Tile size in points (40 on Index cards, 52 in the product header). */
  size?: number;
  radius?: number;
}

export function Pictogram({ kind, size = 40, radius = radii.md }: PictogramProps) {
  return <IconTile icon={kind} variant="ink" size={size} iconSize={Math.round(size * 0.55)} radius={radius} />;
}

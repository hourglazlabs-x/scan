// Text helpers shared by the screens: signed points, counts with units,
// barcodes, category names and the copy for lookup errors. Pure functions,
// so every screen words things the same way.

import type { LookupErrorReason } from '../data/contracts';

/** The true minus sign (U+2212). Negative points always use it, never a hyphen. */
export const MINUS = '−';

/** Signed points as the design shows them: "+6", "−30", "0". */
export function formatPoints(points: number): string {
  if (points > 0) return `+${points}`;
  if (points < 0) return `${MINUS}${Math.abs(points)}`;
  return '0';
}

/** Signed points for screen readers, for example "minus 30 points". */
export function spokenPoints(points: number): string {
  const size = Math.abs(points);
  const unit = size === 1 ? 'point' : 'points';
  if (points > 0) return `plus ${size} ${unit}`;
  if (points < 0) return `minus ${size} ${unit}`;
  return 'no points';
}

/** A whole number with thousands separators: 9412 → "9,412". */
export function formatInteger(value: number): string {
  const digits = String(Math.round(Math.abs(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return value < 0 ? `${MINUS}${digits}` : digits;
}

/** A short count for tight spaces: 9,412 stays whole, 412,000 → "412K", 1,250,000 → "1.3M". */
export function formatCompact(value: number): string {
  if (value < 10_000) return formatInteger(value);
  const thousands = Math.round(value / 1000);
  if (thousands < 1000) return `${thousands}K`;
  const millions = value / 1_000_000;
  return `${millions >= 9.95 ? Math.round(millions) : millions.toFixed(1).replace(/\.0$/, '')}M`;
}

/** A number with its unit: "1 entry", "127 entries", or with `compact`, "412K products". */
export function countLabel(value: number, one: string, many: string, compact = false): string {
  return `${compact ? formatCompact(value) : formatInteger(value)} ${value === 1 ? one : many}`;
}

/**
 * A barcode grouped the way packs print it: "UPC 4 12345 67890 3",
 * "EAN 5 012345 678900", "EAN-8 1234 5670". A 13-digit code that starts with
 * 0 is a UPC-A in EAN form (iOS reports UPC-A that way, and the data layer
 * keys products by it), so it is shown as UPC. `type` is the scanner's
 * symbology, used only to tell UPC-E from EAN-8.
 */
export function formatBarcode(code: string, type?: string): string {
  if (!/^\d+$/.test(code)) return code;
  const kind = (type ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (code.length === 13 && code.startsWith('0')) return formatBarcode(code.slice(1));
  if (code.length === 12) return `UPC ${code.charAt(0)} ${code.slice(1, 6)} ${code.slice(6, 11)} ${code.charAt(11)}`;
  if (code.length === 13) return `EAN ${code.charAt(0)} ${code.slice(1, 7)} ${code.slice(7)}`;
  if (code.length === 8 && kind.endsWith('upce')) {
    return `UPC-E ${code.charAt(0)} ${code.slice(1, 7)} ${code.charAt(7)}`;
  }
  if (code.length === 8) return `EAN-8 ${code.slice(0, 4)} ${code.slice(4)}`;
  return code;
}

/** Digits spaced out so VoiceOver reads them one by one. */
export function spokenDigits(code: string): string {
  return code.split('').join(' ');
}

/**
 * A readable category from Open Food Facts tags, most specific first:
 * ["en:meats", "en:prepared-meats", "en:hams"] → "Hams". English tags win
 * over untranslated ones.
 */
export function categoryLabelFor(categories: readonly string[]): string | undefined {
  const tags = [...categories].reverse();
  const tag = tags.find((t) => t.startsWith('en:')) ?? tags[0];
  if (!tag) return undefined;
  const words = tag.replace(/^[a-z]{2,3}:/i, '').replace(/[-_]+/g, ' ').trim();
  return words.length > 0 ? words.charAt(0).toUpperCase() + words.slice(1) : undefined;
}

/** The first value of a route parameter, which expo-router may give as a list. */
export function paramValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export interface LookupErrorCopy {
  /** One line for the peek card on the Scan screen. */
  peek: string;
  title: string;
  body: string;
  /** False when trying again cannot help (an invalid code). */
  canRetry: boolean;
}

export const LOOKUP_ERROR_COPY: Record<LookupErrorReason, LookupErrorCopy> = {
  offline: {
    peek: 'No signal, and this product isn’t saved on your phone',
    title: 'No signal',
    body: 'This product isn’t saved on your phone yet, so it can’t be looked up offline. Try again when you have signal.',
    canRetry: true,
  },
  rate_limited: {
    peek: 'Open Food Facts is busy. Try again in a minute.',
    title: 'Open Food Facts is busy',
    body: 'Too many lookups in a short time. Wait a minute, then try again.',
    canRetry: true,
  },
  server: {
    peek: 'Open Food Facts isn’t responding',
    title: 'Open Food Facts isn’t responding',
    body: 'Their server returned an error. Try again in a moment.',
    canRetry: true,
  },
  timeout: {
    peek: 'The lookup took too long',
    title: 'The lookup took too long',
    body: 'The connection is slow. Try again.',
    canRetry: true,
  },
  invalid_code: {
    peek: 'This barcode can’t be looked up',
    title: 'This barcode can’t be looked up',
    body: 'Its digits don’t form a valid product code. Scan it again and hold the phone steady.',
    canRetry: false,
  },
};

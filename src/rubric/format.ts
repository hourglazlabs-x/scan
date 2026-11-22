// Small formatting helpers used in rule labels. Kept separate so the
// engine's text and the app's text format numbers the same way.

/** Up to two decimals, trailing zeros dropped: 2.6 → "2.6", 17 → "17", 11.25 → "11.25". */
export function formatNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

/** A gram amount, for example "2.6 g". */
export function formatGrams(value: number): string {
  return `${formatNumber(value)} g`;
}

/** Additive code for display: "e150d" → "E150d". */
export function formatAdditiveCode(code: string): string {
  return code.length > 0 ? code.charAt(0).toUpperCase() + code.slice(1) : code;
}

/** "a", "a and b", "a, b and c". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function capitalize(text: string): string {
  return text.length > 0 ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

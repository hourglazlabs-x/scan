// Barcode helpers. canonicalBarcode gives every product one key, used
// everywhere: the code sent to OFF, the cache, history and the offline pack.

/** Keeps digits only: "4 12345-67890 3" → "412345678903". */
export function normalizeBarcode(input: string): string {
  return input.replace(/\D/g, '');
}

/** GS1 check digit (EAN-8, UPC-A, EAN-13): weights 3, 1, 3, … from the right, check digit excluded. */
function hasValidCheckDigit(digits: string): boolean {
  let sum = 0;
  let weight = 3;
  for (let i = digits.length - 2; i >= 0; i--) {
    sum += (digits.charCodeAt(i) - 48) * weight;
    weight = 4 - weight;
  }
  return (10 - (sum % 10)) % 10 === digits.charCodeAt(digits.length - 1) - 48;
}

/**
 * Expands an 8-digit UPC-E code (number system 0 or 1, six digits, check
 * digit) to its 12-digit UPC-A form. Returns null for anything else.
 * The UPC-E check digit is the check digit of the expanded UPC-A.
 */
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const x = code.slice(1, 7);
  const last = x.charAt(5);
  let body: string;
  switch (last) {
    case '0':
    case '1':
    case '2':
      body = `${x.slice(0, 2)}${last}0000${x.slice(2, 5)}`;
      break;
    case '3':
      body = `${x.slice(0, 3)}00000${x.slice(3, 5)}`;
      break;
    case '4':
      body = `${x.slice(0, 4)}00000${x.charAt(4)}`;
      break;
    default:
      body = `${x.slice(0, 5)}0000${last}`;
  }
  return `${code.charAt(0)}${body}${code.charAt(7)}`;
}

/** expo-camera's "upc_e", and the legacy iOS symbology name "org.gs1.UPC-E". */
function isUpcE(type: string | undefined): boolean {
  return type !== undefined && type.toLowerCase().replace(/[^a-z0-9]/g, '').endsWith('upce');
}

/**
 * The one key for a product, or null when `raw` is not a valid retail
 * barcode. Non-digits are stripped first; then:
 * - type 'upc_e': the 8 digits expand to UPC-A, keyed like a UPC-A below.
 *   (Assumes expo-camera reports UPC-E as all 8 digits; a 12- or 13-digit
 *   value already expanded by the platform is keyed as UPC-A or EAN-13.)
 * - UPC-A (12 digits): "0" + the 12 digits, its EAN-13 form. The iPhone
 *   camera reports UPC-A that way anyway, and OFF's server pads 12-digit
 *   codes the same way (to confirm against a live response).
 * - EAN-13: as it is.
 * - EAN-8: as it is. An 8-digit code with no type is read as EAN-8.
 * Keys are stable: canonicalBarcode(key) === key.
 */
export function canonicalBarcode(raw: string, type?: string): string | null {
  const digits = normalizeBarcode(raw);
  if (isUpcE(type) && digits.length === 8) {
    const upcA = expandUpcE(digits);
    return upcA !== null && hasValidCheckDigit(upcA) ? `0${upcA}` : null;
  }
  switch (digits.length) {
    case 8:
    case 13:
      return hasValidCheckDigit(digits) ? digits : null;
    case 12:
      return hasValidCheckDigit(digits) ? `0${digits}` : null;
    default:
      return null;
  }
}

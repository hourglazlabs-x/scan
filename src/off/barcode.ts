// Barcode helpers: clean up scanner output, test the check digit, and pick
// the one form of each code that the app sends to OFF and stores data under.

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

/**
 * True for an EAN-8, UPC-E, UPC-A or EAN-13 code with a correct check digit.
 * Expects digits only (see normalizeBarcode). An 8-digit code passes as
 * EAN-8 or, when it starts with 0 or 1, as UPC-E.
 */
export function isValidBarcode(code: string): boolean {
  if (!/^\d+$/.test(code)) return false;
  switch (code.length) {
    case 8: {
      if (hasValidCheckDigit(code)) return true;
      const upcA = expandUpcE(code);
      return upcA !== null && hasValidCheckDigit(upcA);
    }
    case 12:
    case 13:
      return hasValidCheckDigit(code);
    default:
      return false;
  }
}

/**
 * The code sent to OFF, and the key under which products, history and the
 * offline pack store a product.
 *
 * OFF resolves a UPC-A both as 12 digits and as its 13-digit EAN-13 form
 * ("0" + UPC-A). We use the 13-digit form because:
 * - the iPhone camera (AVFoundation, behind expo-camera) reports UPC-A as
 *   EAN-13 with the leading 0, so it is usually what was scanned anyway;
 * - OFF's server pads valid 12-digit codes the same way, so the `code` in
 *   API responses and in the bulk export should match our key (to confirm
 *   against a live response once the network is open);
 * - one key per product stops a typed 12-digit code and a scanned 13-digit
 *   code from becoming two cache rows or two history entries.
 * 8-digit codes (EAN-8 and UPC-E) are sent as scanned, the form scanner
 * apps submit them in. If UPC-E lookups miss in practice, retry with the
 * expanded form (expandUpcE).
 */
export function offLookupCode(code: string): string {
  const digits = normalizeBarcode(code);
  return digits.length === 12 && isValidBarcode(digits) ? `0${digits}` : digits;
}

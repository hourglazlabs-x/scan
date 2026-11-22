// Tests for barcode clean-up and the canonical key used everywhere.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { canonicalBarcode, expandUpcE, normalizeBarcode } from '../src/off/barcode.ts';

test('normalizeBarcode keeps digits only', () => {
  assert.equal(normalizeBarcode(' 4 12345-67890 3\n'), '412345678903');
  assert.equal(normalizeBarcode('no digits'), '');
});

test('UPC-A (12 digits): keyed as "0" + the 12 digits; a bad check digit is null', () => {
  assert.equal(canonicalBarcode('412345678903'), '0412345678903');
  assert.equal(canonicalBarcode('737628064502'), '0737628064502');
  assert.equal(canonicalBarcode('412345678903', 'upc_a'), '0412345678903');
  assert.equal(canonicalBarcode('412345678904'), null);
  assert.equal(canonicalBarcode('737628064503'), null);
});

test('EAN-13 stays as it is, including UPC-A written as EAN-13', () => {
  assert.equal(canonicalBarcode('4006381333931'), '4006381333931');
  assert.equal(canonicalBarcode('3017620422003', 'ean13'), '3017620422003');
  assert.equal(canonicalBarcode('0412345678903'), '0412345678903');
  assert.equal(canonicalBarcode('4006381333932'), null);
  assert.equal(canonicalBarcode('0412345678904'), null);
});

test('EAN-8 stays as it is; an 8-digit code without a type is read as EAN-8', () => {
  assert.equal(canonicalBarcode('96385074'), '96385074');
  assert.equal(canonicalBarcode('96385074', 'ean8'), '96385074');
  assert.equal(canonicalBarcode('96385075'), null);
  // Valid as UPC-E but not as EAN-8: without the type it is an invalid EAN-8.
  assert.equal(canonicalBarcode('04252614'), null);
  // Valid both ways: without the type it stays an EAN-8.
  assert.equal(canonicalBarcode('01234565'), '01234565');
});

test("UPC-E (type 'upc_e'): expanded to UPC-A, then keyed with a leading 0", () => {
  assert.equal(canonicalBarcode('04252614', 'upc_e'), '0042100005264'); // last digit 0–2
  assert.equal(canonicalBarcode('01234531', 'upc_e'), '0012300000451'); // last digit 3
  assert.equal(canonicalBarcode('01234543', 'upc_e'), '0012340000053'); // last digit 4
  assert.equal(canonicalBarcode('01234565', 'upc_e'), '0012345000065'); // last digit 5–9
  assert.equal(canonicalBarcode('04252614', 'org.gs1.UPC-E'), '0042100005264', 'legacy iOS type name');
  assert.equal(canonicalBarcode('042100005264', 'upc_e'), '0042100005264', 'already expanded by the platform');
  assert.equal(canonicalBarcode('04252615', 'upc_e'), null, 'bad check digit');
  assert.equal(canonicalBarcode('24252614', 'upc_e'), null, 'number system must be 0 or 1');
  assert.equal(canonicalBarcode('425261', 'upc_e'), null, 'six digits without number system and check digit');
});

test('non-digits are stripped first; other lengths are null', () => {
  assert.equal(canonicalBarcode(' 4123-4567-8903 '), '0412345678903');
  for (const raw of ['', 'abc', '1234567', '12345678901', '00412345678903']) {
    assert.equal(canonicalBarcode(raw), null, JSON.stringify(raw));
  }
});

test('keys are stable: the key of a key is itself', () => {
  const inputs: Array<[string, string?]> = [
    ['412345678903'],
    ['4006381333931'],
    ['96385074'],
    ['04252614', 'upc_e'],
    ['01234565', 'upc_e'],
  ];
  for (const [raw, type] of inputs) {
    const key = canonicalBarcode(raw, type);
    assert.ok(key !== null);
    assert.equal(canonicalBarcode(key), key, `${raw} ${type ?? ''}`);
  }
});

test('expandUpcE: one example per expansion rule', () => {
  assert.equal(expandUpcE('04252614'), '042100005264');
  assert.equal(expandUpcE('01234531'), '012300000451');
  assert.equal(expandUpcE('01234543'), '012340000053');
  assert.equal(expandUpcE('01234565'), '012345000065');
  assert.equal(expandUpcE('24252614'), null);
  assert.equal(expandUpcE('0425261'), null);
});

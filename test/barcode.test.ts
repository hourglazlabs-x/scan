// Tests for barcode clean-up, check digits and the code sent to OFF.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { expandUpcE, isValidBarcode, normalizeBarcode, offLookupCode } from '../src/off/barcode.ts';

test('normalizeBarcode keeps digits only', () => {
  assert.equal(normalizeBarcode(' 4 12345-67890 3\n'), '412345678903');
  assert.equal(normalizeBarcode('no digits'), '');
});

test('UPC-A (12 digits): check digit', () => {
  assert.equal(isValidBarcode('412345678903'), true);
  assert.equal(isValidBarcode('737628064502'), true);
  assert.equal(isValidBarcode('412345678904'), false);
  assert.equal(isValidBarcode('737628064503'), false);
});

test('EAN-13: check digit, including UPC-A written as EAN-13', () => {
  assert.equal(isValidBarcode('4006381333931'), true);
  assert.equal(isValidBarcode('3017620422003'), true);
  assert.equal(isValidBarcode('0412345678903'), true);
  assert.equal(isValidBarcode('0737628064502'), true);
  assert.equal(isValidBarcode('4006381333932'), false);
  assert.equal(isValidBarcode('0412345678904'), false);
});

test('EAN-8: check digit', () => {
  assert.equal(isValidBarcode('96385074'), true);
  // Starts with 9, so it cannot be read as UPC-E either.
  assert.equal(isValidBarcode('96385075'), false);
});

test('UPC-E: expanded to UPC-A, one example per expansion rule', () => {
  assert.equal(expandUpcE('04252614'), '042100005264'); // last digit 0–2
  assert.equal(expandUpcE('01234531'), '012300000451'); // last digit 3
  assert.equal(expandUpcE('01234543'), '012340000053'); // last digit 4
  assert.equal(expandUpcE('01234565'), '012345000065'); // last digit 5–9
  assert.equal(expandUpcE('24252614'), null, 'number system must be 0 or 1');
  assert.equal(expandUpcE('0425261'), null);
});

test('UPC-E: valid through the UPC-A check digit, even when the EAN-8 check fails', () => {
  assert.equal(isValidBarcode('04252614'), true);
  assert.equal(isValidBarcode('01234531'), true);
  assert.equal(isValidBarcode('04252615'), false);
  assert.equal(isValidBarcode('01234532'), false);
});

test('other lengths and non-digits are rejected', () => {
  for (const code of ['', '1234567', '12345678901', '00412345678903', '41234567890a', ' 412345678903']) {
    assert.equal(isValidBarcode(code), false, JSON.stringify(code));
  }
});

test('offLookupCode: UPC-A goes to OFF as 13 digits, everything else as scanned', () => {
  assert.equal(offLookupCode('412345678903'), '0412345678903');
  assert.equal(offLookupCode('737628064502'), '0737628064502');
  assert.equal(offLookupCode('0412345678903'), '0412345678903');
  assert.equal(offLookupCode(' 4123-4567-8903 '), '0412345678903');
  assert.equal(offLookupCode('4006381333931'), '4006381333931');
  assert.equal(offLookupCode('96385074'), '96385074');
  assert.equal(offLookupCode('04252614'), '04252614');
  // An invalid 12-digit code is not padded (it may be an EAN-13 missing a digit).
  assert.equal(offLookupCode('412345678904'), '412345678904');
  // Idempotent, so the lookup form can be passed through it again safely.
  for (const code of ['412345678903', '4006381333931', '96385074', '04252614']) {
    assert.equal(offLookupCode(offLookupCode(code)), offLookupCode(code));
  }
});

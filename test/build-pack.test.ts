// Tests for the offline pack builder, on a tiny synthetic JSONL export.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';

import { buildPack } from '../scripts/build-pack.ts';
import { isValidBarcode } from '../src/off/barcode.ts';
import { scoreProduct } from '../src/rubric/engine.ts';
import { loadRubric } from './helpers.ts';
import type { Product } from '../src/domain/types.ts';

const dir = mkdtempSync(join(tmpdir(), 'mindmodx-pack-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const BUILT_AT = new Date('2026-11-21T12:00:00.000Z');
const rubric = loadRubric();

const NUTRIMENTS = {
  'energy-kcal_100g': 375,
  fat_100g: 6.5,
  'saturated-fat_100g': 1.2,
  sugars_100g: 1,
  salt_100g: 0.01,
  proteins_100g: 13,
  fiber_100g: 10,
};

/** A synthetic EAN-13 in the restricted-circulation 200 range, with a valid check digit. */
function ean(n: number): string {
  const body = `2000000${String(n).padStart(5, '0')}`;
  for (let d = 0; d <= 9; d++) if (isValidBarcode(`${body}${d}`)) return `${body}${d}`;
  throw new Error('unreachable');
}

/** One line of the OFF export: a bare product. */
function record(code: string, scans: number, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    code,
    product_name: `Product ${code}`,
    countries_tags: ['en:united-states'],
    unique_scans_n: scans,
    nutriments: NUTRIMENTS,
    ingredients_text: 'Oats.',
    nova_group: 1,
    categories_tags: ['en:breakfast-cereals'],
    ...extra,
  });
}

function writeExport(name: string, lines: string[]): string {
  const path = join(dir, name);
  writeFileSync(path, gzipSync(lines.join('\n')));
  return path;
}

function readPack(path: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const rows = db.prepare('SELECT code, json, score, grade FROM products ORDER BY rowid').all();
    const meta = Object.fromEntries(db.prepare('SELECT key, value FROM meta').all().map((r) => [r.key, r.value]));
    return { rows, meta };
  } finally {
    db.close();
  }
}

test('keeps the most-scanned US products with scoreable nutrition, most scanned first', async () => {
  const invalid = `${ean(9).slice(0, 12)}${(Number(ean(9).slice(12)) + 1) % 10}`;
  const input = writeExport('export.jsonl.gz', [
    record(ean(1), 50),
    record(ean(2), 10),
    record(ean(3), 30),
    record(ean(4), 40),
    record(ean(5), 20),
    record('400000000046', 45), // 12-digit UPC-A: stored in its 13-digit form
    record(ean(6), 1000, { countries_tags: ['en:france'] }),
    record(ean(7), 999, { nutriments: { proteins_100g: 13 } }), // nutrition not scoreable
    record(invalid, 500), // bad check digit: no scanner can produce it
    record(ean(8), 900, { countries_tags: ['en:canada'], origins_tags: ['en:united-states'] }),
    '{"countries_tags": ["en:united-states"], truncated',
    '',
    'not json and not American',
  ]);
  const out = join(dir, 'packs', 'us-top.sqlite');

  const stats = await buildPack({ input, out, limit: 4, builtAt: BUILT_AT });
  assert.deepEqual(stats, { lines: 13, unreadable: 1, eligible: 6, written: 4, duplicates: 0 });

  const { rows, meta } = readPack(out);
  assert.deepEqual(
    rows.map((r) => r.code),
    [ean(1), '0400000000046', ean(4), ean(3)],
  );
  for (const row of rows) {
    const p = JSON.parse(String(row.json)) as Product;
    assert.equal(p.code, row.code);
    assert.equal(p.source.fetchedAt, BUILT_AT.toISOString());
    const result = scoreProduct(p, rubric);
    assert.equal(row.score, result.score);
    assert.equal(row.grade, result.grade);
  }
  assert.deepEqual(meta, {
    rubric_id: 'nuitrix',
    rubric_version: '0.1.0',
    built_at: '2026-11-21T12:00:00.000Z',
    source: 'Open Food Facts JSONL export (export.jsonl.gz)',
    license: 'ODbL-1.0',
    attribution: 'Open Food Facts contributors',
    country: 'en:united-states',
    product_count: '4',
  });
  assert.equal(existsSync(`${out}.tmp`), false);
});

test('the bounded heap keeps exactly the top N of many, ties broken by code', async () => {
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  const all = Array.from({ length: 300 }, (_, i) => ({ code: ean(100 + i), scans: Math.floor(random() * 40) }));
  const input = writeExport('many.jsonl.gz', all.map((p) => record(p.code, p.scans)));
  const out = join(dir, 'many.sqlite');

  const stats = await buildPack({ input, out, limit: 37, builtAt: BUILT_AT });
  assert.equal(stats.eligible, 300);
  assert.equal(stats.written, 37);
  const expected = [...all]
    .sort((a, b) => b.scans - a.scans || (a.code < b.code ? -1 : 1))
    .slice(0, 37)
    .map((p) => p.code);
  assert.deepEqual(readPack(out).rows.map((r) => r.code), expected);
});

test('two records with the same lookup code: the more-scanned one is kept', async () => {
  const input = writeExport('dupes.jsonl.gz', [
    record('400000000053', 10, { product_name: 'Less scanned' }),
    record('0400000000053', 20, { product_name: 'More scanned' }),
    record(ean(1), 5),
  ]);
  const out = join(dir, 'dupes.sqlite');
  const stats = await buildPack({ input, out, limit: 10, builtAt: BUILT_AT });
  assert.equal(stats.written, 2);
  assert.equal(stats.duplicates, 1);
  const { rows, meta } = readPack(out);
  assert.equal((JSON.parse(String(rows[0]?.json)) as Product).name, 'More scanned');
  assert.equal(meta.product_count, '2');
});

test('a plain .jsonl file works too, and a rebuild replaces the old pack', async () => {
  const input = join(dir, 'plain.jsonl');
  writeFileSync(input, [record(ean(1), 1), record(ean(2), 2)].join('\n'));
  const out = join(dir, 'plain.sqlite');
  await buildPack({ input, out, limit: 1, builtAt: BUILT_AT });
  await buildPack({ input, out, limit: 2, builtAt: BUILT_AT });
  assert.deepEqual(readPack(out).rows.map((r) => r.code), [ean(2), ean(1)]);
});

test('bad input fails loudly and leaves no pack behind', async () => {
  const out = join(dir, 'failed.sqlite');
  await assert.rejects(buildPack({ input: join(dir, 'missing.jsonl.gz'), out }), { code: 'ENOENT' });
  const corrupt = join(dir, 'corrupt.jsonl.gz');
  writeFileSync(corrupt, gzipSync(record(ean(1), 1)).subarray(0, 20));
  await assert.rejects(buildPack({ input: corrupt, out }));
  await assert.rejects(buildPack({ input: corrupt, out, limit: 0 }), RangeError);
  assert.equal(existsSync(out), false);
  assert.equal(existsSync(`${out}.tmp`), false);
});

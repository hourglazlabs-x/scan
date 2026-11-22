// Tests for the schema and the repository SQL on a real SQLite engine
// (node:sqlite), behind the same async methods expo-sqlite provides.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { migrateDbIfNeeded, SCHEMA_VERSION, type SqlDatabase } from '../src/data/db.ts';
import { createLookup } from '../src/data/lookup.ts';
import {
  countCachedProducts,
  createProductCache,
  listEntries,
  queueIngredientPhoto,
  recordScan,
} from '../src/data/repository.ts';
import type { Product } from '../src/domain/types.ts';
import type { OffResult } from '../src/off/client.ts';
import { normalizeOffProduct } from '../src/off/normalize.ts';
import { FETCHED_AT, fixture, loadRubric } from './helpers.ts';

/** node:sqlite wrapped in the async expo-sqlite methods the data layer calls. */
function asyncDb(raw: DatabaseSync): SqlDatabase {
  return {
    async execAsync(source) {
      raw.exec(source);
    },
    async runAsync(source, ...params) {
      return raw.prepare(source).run(...params);
    },
    async getFirstAsync<T>(source: string, ...params: (string | number | null)[]) {
      return (raw.prepare(source).get(...params) as T | undefined) ?? null;
    },
    async getAllAsync<T>(source: string, ...params: (string | number | null)[]) {
      return raw.prepare(source).all(...params) as T[];
    },
    async withTransactionAsync(task) {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

async function openMigrated(): Promise<{ db: SqlDatabase; raw: DatabaseSync }> {
  const raw = new DatabaseSync(':memory:');
  const db = asyncDb(raw);
  await migrateDbIfNeeded(db);
  return { db, raw };
}

function product(name: string, fetchedAt = FETCHED_AT): Product {
  const p = normalizeOffProduct(fixture(name), fetchedAt);
  assert.ok(p);
  return p;
}

test('migration creates the schema in WAL mode, and running it again changes nothing', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mindmodx-db-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const raw = new DatabaseSync(join(dir, 'mindmodx-scan.db'));
  t.after(() => raw.close());
  const db = asyncDb(raw);

  await migrateDbIfNeeded(db);
  await migrateDbIfNeeded(db);
  assert.equal((raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, SCHEMA_VERSION);
  assert.equal((raw.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode, 'wal');
  const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
  assert.deepEqual(
    tables.map((row) => row.name).filter((name) => name !== 'sqlite_sequence'),
    ['entries', 'ingredient_photos', 'products'],
  );
});

test('a failed migration rolls back, leaving the version unchanged', async () => {
  const raw = new DatabaseSync(':memory:');
  raw.exec('CREATE TABLE products (code TEXT)'); // a leftover that makes CREATE TABLE fail
  await assert.rejects(migrateDbIfNeeded(asyncDb(raw)));
  assert.equal((raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 0);
  assert.equal(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'entries'").get(), undefined);
});

test('product cache: round trip, replace, miss, and unreadable rows', async () => {
  const { db, raw } = await openMigrated();
  const cache = createProductCache(db);
  const ham = product('found-complete');

  assert.equal(await cache.get(ham.code), null);
  await cache.put(ham);
  assert.deepEqual(await cache.get(ham.code), { product: ham, fetchedAt: FETCHED_AT });

  const newer = { ...product('found-complete', '2026-11-22T08:00:00.000Z'), name: 'Renamed ham' };
  await cache.put(newer);
  assert.deepEqual(await cache.get(ham.code), { product: newer, fetchedAt: '2026-11-22T08:00:00.000Z' });
  assert.equal(await countCachedProducts(db), 1);

  raw.prepare('INSERT INTO products (code, json, fetched_at) VALUES (?, ?, ?)').run('96385074', '{not json', FETCHED_AT);
  raw.prepare('INSERT INTO products (code, json, fetched_at) VALUES (?, ?, ?)').run('4006381333931', '{"code":1}', FETCHED_AT);
  assert.equal(await cache.get('96385074'), null);
  assert.equal(await cache.get('4006381333931'), null);
});

test('recordScan: one entry per code, numbered in first-scan order', async () => {
  const { db, raw } = await openMigrated();
  await recordScan(db, '412345678903', new Date('2026-11-20T10:00:00.000Z'));
  await recordScan(db, '4006381333931', new Date('2026-11-20T11:00:00.000Z'));
  // The 13-digit form of the first code is the same entry.
  await recordScan(db, '0412345678903', new Date('2026-11-21T09:00:00.000Z'));

  const rows = raw.prepare('SELECT * FROM entries ORDER BY entry_number').all();
  assert.deepEqual(rows.map((row) => ({ ...row })), [
    {
      code: '0412345678903',
      entry_number: 1,
      first_scanned_at: '2026-11-20T10:00:00.000Z',
      last_scanned_at: '2026-11-21T09:00:00.000Z',
      scan_count: 2,
    },
    {
      code: '4006381333931',
      entry_number: 2,
      first_scanned_at: '2026-11-20T11:00:00.000Z',
      last_scanned_at: '2026-11-20T11:00:00.000Z',
      scan_count: 1,
    },
  ]);
});

test('concurrent first scans of different codes still get distinct entry numbers', async () => {
  const { db, raw } = await openMigrated();
  const at = new Date('2026-11-21T09:00:00.000Z');
  await Promise.all(['412345678903', '4006381333931', '96385074', '3017620422003'].map((code) => recordScan(db, code, at)));
  const numbers = raw.prepare('SELECT entry_number FROM entries ORDER BY entry_number').all().map((r) => r.entry_number);
  assert.deepEqual(numbers, [1, 2, 3, 4]);
});

test('listEntries joins the cached product, newest scan first', async () => {
  const { db } = await openMigrated();
  const cache = createProductCache(db);
  const ham = product('found-complete');
  await cache.put(ham);
  await recordScan(db, ham.code, new Date('2026-11-20T10:00:00.000Z'));
  await recordScan(db, '4006381333931', new Date('2026-11-21T10:00:00.000Z')); // no cached product

  const entries = await listEntries(db);
  assert.deepEqual(
    entries.map((e) => [e.entryNumber, e.code, e.product?.name ?? null]),
    [
      [2, '4006381333931', null],
      [1, '0412345678903', 'Smoked ham, sliced'],
    ],
  );
  assert.deepEqual(entries[1]?.product, ham);
});

test('a code with no canonical key is refused, and nothing is stored', async () => {
  const { db, raw } = await openMigrated();
  const at = new Date(FETCHED_AT);
  for (const code of ['412345678904', '04252614', '']) {
    await assert.rejects(recordScan(db, code, at), /Not a valid barcode/);
    await assert.rejects(queueIngredientPhoto(db, code, 'file:///docs/a.jpg', at), /Not a valid barcode/);
  }
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM entries').get()?.n, 0);
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM ingredient_photos').get()?.n, 0);
  // A UPC-E camera scan arrives as its canonical key, which is a valid EAN-13.
  await recordScan(db, '0042100005264', at);
  assert.equal(raw.prepare('SELECT code FROM entries').get()?.code, '0042100005264');
});

test('queueIngredientPhoto stores the photo as queued, under the canonical key', async () => {
  const { db, raw } = await openMigrated();
  await queueIngredientPhoto(db, '412345678903', 'file:///docs/ingredient-photos/a.jpg', new Date(FETCHED_AT));
  const rows = raw.prepare('SELECT code, uri, created_at, status FROM ingredient_photos').all();
  assert.deepEqual(rows.map((row) => ({ ...row })), [
    { code: '0412345678903', uri: 'file:///docs/ingredient-photos/a.jpg', created_at: FETCHED_AT, status: 'queued' },
  ]);
});

test('end to end: lookup over the SQLite cache goes to the network once, then reads the cache', async () => {
  const { db } = await openMigrated();
  const calls: string[] = [];
  const fetchProduct = async (code: string): Promise<OffResult> => {
    calls.push(code);
    return { status: 'found', product: product('found-complete') };
  };
  const { lookup } = createLookup({
    cache: createProductCache(db),
    fetchProduct,
    rubric: loadRubric(),
    now: () => new Date('2026-11-22T00:00:00.000Z'),
  });
  const first = await lookup('412345678903');
  const second = await lookup('412345678903');
  assert.ok(first.status === 'found' && second.status === 'found');
  assert.equal(first.from, 'network');
  assert.equal(second.from, 'cache');
  assert.deepEqual(second.product, first.product);
  assert.equal(second.fetchedAt, first.fetchedAt, 'the cached copy keeps the time it was fetched');
  assert.deepEqual(second.result, first.result);
  assert.deepEqual(calls, ['0412345678903']);
});

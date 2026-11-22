// Builds the offline pack: the most-scanned US products from an Open Food
// Facts JSONL export, normalized and scored, in one SQLite file.
//
// LICENSE: the pack is a derived database of Open Food Facts data. OFF's
// database is published under the Open Database License (ODbL 1.0), so the
// pack must be offered under ODbL 1.0 as well, with attribution to "Open Food
// Facts contributors" (https://world.openfoodfacts.org). The meta table
// records both, and the app must show the attribution wherever it uses the pack.
//
// Usage (Node 22.13 or later, no dependencies):
//   node scripts/build-pack.ts --input openfoodfacts-products.jsonl.gz --out packs/us-top.sqlite --limit 300000
// The kept products are held in memory as JSON until the end. If Node runs
// out of heap, add --max-old-space-size=4096 after `node`.
//
// Output:
//   products(code, json, score, grade): json is the normalized Product, keyed
//     by its lookup code (offLookupCode). Rows are written most-scanned first,
//     so rowid order is popularity order. score and grade use the rubric at
//     build time and are for inspection only; the app re-scores from json.
//   meta(key, value): rubric_id, rubric_version, built_at, source, license,
//     attribution, country, product_count.

import { createReadStream, mkdirSync, readFileSync, realpathSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createGunzip } from 'node:zlib';

import type { GradeId } from '../src/domain/types.ts';
import { isValidBarcode } from '../src/off/barcode.ts';
import { normalizeOffProduct, offNumber } from '../src/off/normalize.ts';
import { scoreProduct } from '../src/rubric/engine.ts';
import { parseRubric, type Rubric } from '../src/rubric/schema.ts';

export const DEFAULT_LIMIT = 300_000;
export const DEFAULT_COUNTRY = 'en:united-states';
const DEFAULT_OUT = 'packs/us-top.sqlite';
const DEFAULT_RUBRIC = new URL('../src/rubric/nuitrix-v0.1.json', import.meta.url);
const PROGRESS_EVERY = 100_000;

export interface BuildPackOptions {
  /** OFF JSONL export, gzipped (.gz) or plain, one bare product per line. */
  input: string;
  out: string;
  /** How many products to keep, by unique_scans_n. */
  limit?: number;
  rubricPath?: string | URL;
  /** Country tag a product must list in countries_tags. */
  country?: string;
  builtAt?: Date;
  onProgress?: (stats: BuildPackStats) => void;
}

export interface BuildPackStats {
  /** Lines read, blank ones included. */
  lines: number;
  /** Lines that mention the country tag but are not valid JSON (other lines are skipped unparsed). */
  unreadable: number;
  /** Products sold in the country, with a valid barcode and scoreable nutrition. */
  eligible: number;
  /** Rows written to the pack. */
  written: number;
  /** Kept products dropped because a more-scanned one had the same lookup code. */
  duplicates: number;
}

interface Candidate {
  code: string;
  scans: number;
  json: string;
  score: number | null;
  grade: GradeId;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** More scans first; ties go to the lower code, so builds are reproducible. */
function outranks(a: Candidate, b: Candidate): boolean {
  return a.scans > b.scans || (a.scans === b.scans && a.code < b.code);
}

/** Keeps the `limit` best candidates in a min-heap: the weakest one kept sits at the root. */
class TopN {
  private readonly heap: Candidate[] = [];
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  offer(candidate: Candidate): void {
    const weakest = this.heap[0];
    if (this.heap.length < this.limit) {
      this.heap.push(candidate);
      this.siftUp(this.heap.length - 1);
    } else if (weakest !== undefined && outranks(candidate, weakest)) {
      this.heap[0] = candidate;
      this.siftDown(0);
    }
  }

  /** Best first. */
  sorted(): Candidate[] {
    return [...this.heap].sort((a, b) => (outranks(a, b) ? -1 : outranks(b, a) ? 1 : 0));
  }

  private siftUp(start: number): void {
    let i = start;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.weaker(i, parent)) return;
      this.swap(i, parent);
      i = parent;
    }
  }

  private siftDown(start: number): void {
    let i = start;
    for (;;) {
      const left = 2 * i + 1;
      let weakest = i;
      if (this.weaker(left, weakest)) weakest = left;
      if (this.weaker(left + 1, weakest)) weakest = left + 1;
      if (weakest === i) return;
      this.swap(i, weakest);
      i = weakest;
    }
  }

  /** True when both slots are filled and the candidate at `a` ranks below the one at `b`. */
  private weaker(a: number, b: number): boolean {
    const x = this.heap[a];
    const y = this.heap[b];
    return x !== undefined && y !== undefined && outranks(y, x);
  }

  private swap(a: number, b: number): void {
    const x = this.heap[a];
    const y = this.heap[b];
    if (x === undefined || y === undefined) return;
    this.heap[a] = y;
    this.heap[b] = x;
  }
}

function readLines(path: string): AsyncIterable<string> {
  const file = createReadStream(path);
  if (!path.endsWith('.gz')) return createInterface({ input: file, crlfDelay: Infinity });
  const gunzip = createGunzip();
  file.on('error', (error) => gunzip.destroy(error)); // pipe() does not forward read errors
  return createInterface({ input: file.pipe(gunzip), crlfDelay: Infinity });
}

function toCandidate(raw: unknown, country: string, rubric: Rubric, fetchedAt: string): Candidate | null {
  if (!isRecord(raw) || !Array.isArray(raw.countries_tags) || !raw.countries_tags.includes(country)) return null;
  const product = normalizeOffProduct(raw, fetchedAt);
  // A code the scanner can never produce can never be looked up.
  if (product === null || !isValidBarcode(product.code)) return null;
  const result = scoreProduct(product, rubric);
  if (result.missing.includes('nutrition')) return null;
  const scans = offNumber(raw.unique_scans_n);
  return {
    code: product.code,
    scans: scans !== undefined && scans > 0 ? scans : 0,
    json: JSON.stringify(product),
    score: result.score,
    grade: result.grade,
  };
}

/** Writes to a temporary file and renames it at the end, so a failed build never leaves a half-written pack. */
function writePack(out: string, rows: readonly Candidate[], meta: Record<string, string>): number {
  mkdirSync(dirname(out), { recursive: true });
  const tmp = `${out}.tmp`;
  rmSync(tmp, { force: true });
  let written = 0;
  try {
    const db = new DatabaseSync(tmp);
    try {
      db.exec(`
        PRAGMA journal_mode = OFF;
        PRAGMA synchronous = OFF;
        CREATE TABLE products (code TEXT PRIMARY KEY, json TEXT, score INTEGER, grade TEXT);
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
      `);
      const insertProduct = db.prepare(
        'INSERT INTO products (code, json, score, grade) VALUES (?, ?, ?, ?) ON CONFLICT (code) DO NOTHING',
      );
      const insertMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
      db.exec('BEGIN');
      for (const row of rows) written += Number(insertProduct.run(row.code, row.json, row.score, row.grade).changes);
      for (const [key, value] of Object.entries({ ...meta, product_count: String(written) })) insertMeta.run(key, value);
      db.exec('COMMIT');
    } finally {
      db.close();
    }
    renameSync(tmp, out);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
  return written;
}

export async function buildPack(options: BuildPackOptions): Promise<BuildPackStats> {
  const { input, out, limit = DEFAULT_LIMIT, country = DEFAULT_COUNTRY, builtAt = new Date(), onProgress } = options;
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`limit must be a positive whole number, got ${limit}`);
  const rubric = parseRubric(JSON.parse(readFileSync(options.rubricPath ?? DEFAULT_RUBRIC, 'utf8')));
  const fetchedAt = builtAt.toISOString();
  // Most lines are not sold in the country: a substring test skips them without a JSON parse.
  const needle = JSON.stringify(country);
  const top = new TopN(limit);
  const stats: BuildPackStats = { lines: 0, unreadable: 0, eligible: 0, written: 0, duplicates: 0 };

  for await (const line of readLines(input)) {
    stats.lines++;
    if (onProgress && stats.lines % PROGRESS_EVERY === 0) onProgress({ ...stats });
    if (!line.includes(needle)) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      stats.unreadable++;
      continue;
    }
    const candidate = toCandidate(raw, country, rubric, fetchedAt);
    if (candidate === null) continue;
    stats.eligible++;
    top.offer(candidate);
  }

  const rows = top.sorted();
  stats.written = writePack(out, rows, {
    rubric_id: rubric.id,
    rubric_version: rubric.version,
    built_at: fetchedAt,
    source: `Open Food Facts JSONL export (${basename(input)})`,
    license: 'ODbL-1.0',
    attribution: 'Open Food Facts contributors',
    country,
  });
  stats.duplicates = rows.length - stats.written;
  return stats;
}

const USAGE =
  'Usage: node scripts/build-pack.ts --input <openfoodfacts-products.jsonl.gz> [--out packs/us-top.sqlite] [--limit 300000]';

async function main(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: { input: { type: 'string' }, out: { type: 'string' }, limit: { type: 'string' } },
  });
  const limit = values.limit === undefined ? DEFAULT_LIMIT : Number(values.limit);
  if (values.input === undefined || !Number.isInteger(limit) || limit < 1) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const out = values.out ?? DEFAULT_OUT;
  const startedAt = Date.now();
  const stats = await buildPack({
    input: values.input,
    out,
    limit,
    onProgress: (s) => console.error(`${s.lines} lines read, ${s.eligible} eligible`),
  });
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `Wrote ${stats.written} products to ${out} in ${seconds} s ` +
      `(${stats.lines} lines, ${stats.eligible} eligible, ${stats.unreadable} unreadable, ${stats.duplicates} duplicate codes).`,
  );
}

/** True when this file is the script node was started with, not a module imported by a test. */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

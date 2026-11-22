// Shared test helpers. Not a test file itself (the runner only picks up
// *.test.ts). The rubric is read with fs because src/rubric/index.ts is
// app-only (node cannot import JSON without import attributes).

import { readFileSync } from 'node:fs';

import { parseRubric, type Rubric } from '../src/rubric/schema.ts';

export const FETCHED_AT = '2026-11-21T19:00:00.000Z';

/** A synthetic OFF record from test/fixtures/off, by file name without ".json". */
export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/off/${name}.json`, import.meta.url), 'utf8'));
}

export function rubricJson(): unknown {
  return JSON.parse(readFileSync(new URL('../src/rubric/nuitrix-v0.1.json', import.meta.url), 'utf8'));
}

export function loadRubric(): Rubric {
  return parseRubric(rubricJson());
}

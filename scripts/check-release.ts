// Release gate. Run with: npm run check:release
// Fails (exit 1, "not ready to ship") while any file under src/ or app/, or
// app.json, contains the marker below (for example the OFF contact email in
// src/off/config.ts), or while the rubric the app bundles is not approved.
// Tests and scripts are not scanned, so they may mention the marker.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isEntryPoint } from './cli.ts';

const MARKER = 'PLACEHOLDER';
const SCANNED_DIRS = ['src', 'app'];
const SCANNED_FILES = ['app.json'];
/** The app's rubric loader; the JSON files it imports are the rubrics that ship. */
const RUBRIC_LOADER = 'src/rubric/index.ts';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return filesUnder(path);
      return entry.isFile() ? [path] : [];
    })
    .sort();
}

function markerProblems(root: string): string[] {
  const files = [
    ...SCANNED_DIRS.flatMap((dir) => filesUnder(join(root, dir))),
    ...SCANNED_FILES.map((file) => join(root, file)).filter((path) => existsSync(path)),
  ];
  return files.flatMap((path) =>
    readFileSync(path, 'utf8')
      .split('\n')
      .flatMap((line, i) => (line.includes(MARKER) ? [`${relative(root, path)}:${i + 1}: contains ${MARKER}`] : [])),
  );
}

function rubricProblems(root: string): string[] {
  const loader = join(root, RUBRIC_LOADER);
  if (!existsSync(loader)) return [`${RUBRIC_LOADER}: missing, so the bundled rubric cannot be checked`];
  const imports = [...readFileSync(loader, 'utf8').matchAll(/from\s+['"](\.{1,2}\/[^'"]+\.json)['"]/g)]
    .map((match) => match[1])
    .filter((spec): spec is string => spec !== undefined);
  if (imports.length === 0) return [`${RUBRIC_LOADER}: imports no rubric JSON, so the bundled rubric cannot be checked`];

  return imports.flatMap((spec) => {
    const path = join(root, 'src/rubric', spec);
    const name = relative(root, path);
    let rubric: unknown;
    try {
      rubric = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      return [`${name}: cannot be read as JSON`];
    }
    const status = isRecord(rubric) ? rubric.status : undefined;
    return status === 'approved' ? [] : [`${name}: rubric status is "${String(status)}", not "approved"`];
  });
}

/** Everything that blocks a release, one readable line each. An empty list means ready to ship. */
export function checkRelease(root: string): string[] {
  return [...markerProblems(root), ...rubricProblems(root)];
}

if (isEntryPoint(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const problems = checkRelease(root);
  if (problems.length > 0) {
    console.error(`Not ready to ship:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`Ready to ship: no ${MARKER} markers, and the bundled rubric is approved.`);
  }
}

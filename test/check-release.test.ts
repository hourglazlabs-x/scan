// Tests for the release gate, on synthetic project trees in a temp dir.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { checkRelease } from '../scripts/check-release.ts';

const base = mkdtempSync(join(tmpdir(), 'mindmodx-release-'));
after(() => rmSync(base, { recursive: true, force: true }));

// Built with + so this test file never contains the marker itself.
const MARKER = 'PLACE' + 'HOLDER';
const LOADER = "import rubricJson from './nuitrix-v0.1.json';\nexport const RUBRIC = rubricJson;\n";

function tree(name: string, files: Record<string, string>): string {
  const root = join(base, name);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const rubric = (status: string) => JSON.stringify({ id: 'nuitrix', version: '0.1.0', status });

test('lists every marker under src/ and app/ and in app.json, and a draft rubric', () => {
  const root = tree('dirty', {
    'src/off/config.ts': `export const USER_AGENT = 'MINDMODXScan/0.1.0 (CONTACT_EMAIL_${MARKER})';\n`,
    'src/ui/Search.tsx': '<TextInput placeholder="Search" />\n',
    'app/deep/nested/screen.tsx': `const a = 1;\n// ${MARKER}: copy\n`,
    'app.json': `{ "expo": { "name": "${MARKER}" } }\n`,
    'src/rubric/index.ts': LOADER,
    'src/rubric/nuitrix-v0.1.json': rubric('draft'),
    'test/client.test.ts': `// ${MARKER} in a test is fine\n`,
    'scripts/x.ts': `// ${MARKER} in a script is fine\n`,
  });
  assert.deepEqual(checkRelease(root), [
    'src/off/config.ts:1: contains ' + MARKER,
    'app/deep/nested/screen.tsx:2: contains ' + MARKER,
    'app.json:1: contains ' + MARKER,
    'src/rubric/nuitrix-v0.1.json: rubric status is "draft", not "approved"',
  ]);
});

test('a clean tree with an approved rubric is ready to ship', () => {
  const root = tree('clean', {
    'src/off/config.ts': "export const USER_AGENT = 'MINDMODXScan/0.1.0 (founder@example.com)';\n",
    'app/index.tsx': 'export default function Screen() { return null; }\n',
    'app.json': '{ "expo": { "name": "MINDMODX Scan" } }\n',
    'src/rubric/index.ts': LOADER,
    'src/rubric/nuitrix-v0.1.json': rubric('approved'),
  });
  assert.deepEqual(checkRelease(root), []);
});

test('a missing rubric loader or rubric file is reported, not ignored', () => {
  assert.deepEqual(checkRelease(tree('no-loader', { 'app/index.tsx': '' })), [
    'src/rubric/index.ts: missing, so the bundled rubric cannot be checked',
  ]);
  assert.deepEqual(checkRelease(tree('no-rubric', { 'src/rubric/index.ts': LOADER })), [
    'src/rubric/nuitrix-v0.1.json: cannot be read as JSON',
  ]);
});

test('the CLI exits 1 with "Not ready to ship" and the list, and 0 when ready', () => {
  const copyScripts = (root: string) => {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    for (const file of ['check-release.ts', 'cli.ts']) {
      copyFileSync(new URL(`../scripts/${file}`, import.meta.url), join(root, 'scripts', file));
    }
    return join(root, 'scripts', 'check-release.ts');
  };
  const run = (script: string) => {
    try {
      execFileSync(process.execPath, ['--no-warnings', script], { stdio: 'pipe' });
      return { code: 0, stderr: '' };
    } catch (error) {
      const e = error as { status: number; stderr: Buffer };
      return { code: e.status, stderr: e.stderr.toString() };
    }
  };

  const dirty = run(copyScripts(tree('cli-dirty', { 'src/rubric/index.ts': LOADER, 'src/rubric/nuitrix-v0.1.json': rubric('draft') })));
  assert.equal(dirty.code, 1);
  assert.match(dirty.stderr, /^Not ready to ship:\n {2}- src\/rubric\/nuitrix-v0\.1\.json: rubric status is "draft"/);

  const ready = run(copyScripts(tree('cli-ready', { 'src/rubric/index.ts': LOADER, 'src/rubric/nuitrix-v0.1.json': rubric('approved') })));
  assert.equal(ready.code, 0);
});

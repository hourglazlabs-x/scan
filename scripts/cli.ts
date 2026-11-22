// Shared by the scripts in this folder.

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** True when the module at `moduleUrl` is the script node was started with, not a module imported by a test. */
export function isEntryPoint(moduleUrl: string): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return moduleUrl === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

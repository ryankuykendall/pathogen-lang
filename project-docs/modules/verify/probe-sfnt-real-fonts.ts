/**
 * Phase 0b core-review check (2026-10-24): sfntLooksComplete must accept
 * every real TrueType/OpenType file — the repo's fonts and this computer's —
 * or a working font would turn into a "damaged or incomplete" error.
 *
 *   npx tsx project-docs/modules/verify/probe-sfnt-real-fonts.ts
 *
 * Result on the author's Mac: 537 files checked, 0 rejected.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join } from 'node:path';

import { fontFileKind, sfntLooksComplete } from '../../../src/host/google-fonts';

const roots = [
  'fonts',
  'tests/fixtures/fonts',
  '/System/Library/Fonts',
  '/Library/Fonts',
  join(homedir(), 'Library/Fonts'),
  '/usr/share/fonts',
  join(homedir(), '.local/share/fonts'),
];

let checked = 0;
const rejected: string[] = [];
const skipped: Record<string, number> = {};

function walk(dir: string, depth: number): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const path = join(dir, name);
    let isDir = false;
    try {
      isDir = statSync(path).isDirectory();
    } catch {
      continue;
    }
    if (isDir) {
      if (depth < 4) walk(path, depth + 1);
      continue;
    }
    const ext = extname(name).toLowerCase();
    if (ext !== '.ttf' && ext !== '.otf') continue;
    const bytes = new Uint8Array(readFileSync(path));
    const kind = fontFileKind(bytes);
    if (kind !== 'ttf' && kind !== 'otf') {
      skipped[String(kind)] = (skipped[String(kind)] ?? 0) + 1;
      continue;
    }
    checked += 1;
    if (!sfntLooksComplete(bytes)) rejected.push(path);
  }
}

for (const root of roots) walk(root, 0);
console.log(`checked ${checked} TrueType/OpenType files; rejected ${rejected.length}`);
console.log(`not checked (other kinds named .ttf/.otf): ${JSON.stringify(skipped)}`);
for (const path of rejected) console.log(`REJECTED ${path}`);

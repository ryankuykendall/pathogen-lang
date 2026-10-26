// Smoke test for the built `pathogen-lang/node` entry (run after `npm run build`):
// both the CommonJS and ESM builds load, build a host, and decode WOFF2 —
// the one dependency the entry loads at runtime (woff2-encoder).
//
//   node project-docs/modules/verify/smoke-node-entry.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { compress } from 'woff2-encoder';

const require = createRequire(import.meta.url);
const root = new URL('../../../', import.meta.url);
const ttf = new Uint8Array(readFileSync(new URL('tests/fixtures/fonts/Inter-Regular.ttf', root)));
const woff2 = new Uint8Array(await compress(ttf));
const tag = (bytes) => String.fromCharCode(...bytes.slice(0, 4));

let failed = false;
const builds = [
  ['cjs', require(new URL('dist/node.cjs', root).pathname)],
  ['esm', await import(new URL('dist/node.js', root).href)],
];
for (const [label, mod] of builds) {
  const host = mod.createNodeFontHost({
    root: process.cwd(),
    programDir: process.cwd(),
    offlineReason: 'smoke test',
    cacheDir: null,
    systemFontDirs: [],
  });
  const decoded = await host.decodeWoff2(woff2);
  const ok = tag(woff2) === 'wOF2' && decoded[0] === 0 && decoded[1] === 1 && decoded.length > woff2.length;
  failed ||= !ok;
  console.log(`${label}: ${ok ? 'ok' : 'FAILED'} — woff2 ${woff2.length} bytes → ttf ${decoded.length} bytes`);
}
process.exitCode = failed ? 1 : 0;

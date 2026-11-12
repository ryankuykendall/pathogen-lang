// Builds multi-file-mockup-v10.html: v9's built page (phase-2-mockups-v9/multi-file-mockup-v9.html,
// read in place, never edited), with v10's screen in place of v9's.
//
//   npx tsx project-docs/modules/phase-2-mockups-v10/build.ts
//
// v9's page already holds v6's kit, v7's, v8's and v9's parts and the example data, so v10 adds
// only its own. If v9's template changes, rebuild v9 first (npx tsx project-docs/modules/phase-2-mockups-v9/build.ts).
//
// multi-file-mockup-v10.template.html holds what v10 adds, in four parts marked <!-- @@CSS -->,
// <!-- @@NAV -->, <!-- @@SECTIONS --> and <!-- @@SCRIPT -->:
//   - the CSS goes at the end of the page's <style>;
//   - the harness button replaces v9's;
//   - the section replaces v9's screen;
//   - the script replaces v9's screen table (from v9's "the screen and its states" line to
//     v6's `const current = {};`). Its function declarations come after v9's, so they win.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const v9page = path.join(dir, '..', 'phase-2-mockups-v9', 'multi-file-mockup-v9.html');
const v10 = fs.readFileSync(path.join(dir, 'multi-file-mockup-v10.template.html'), 'utf8');

function part(name: string): string {
  const start = v10.indexOf(`<!-- @@${name} -->`);
  if (start < 0) throw new Error(`v10 template has no @@${name} part`);
  const from = v10.indexOf('\n', start) + 1;
  const next = v10.indexOf('<!-- @@', from);
  return v10.slice(from, next < 0 ? v10.length : next).trimEnd();
}

/** Replace the one span from `startMarker` up to (not including) `endMarker`. */
function swap(source: string, startMarker: string, endMarker: string, replacement: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0 || source.indexOf(startMarker, start + 1) >= 0) {
    throw new Error(`v9 page: expected one "${startMarker}" before "${endMarker}"`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

let html = fs.readFileSync(v9page, 'utf8');
html = swap(html, '<title>', '</title>', '<title>Mockup v10 — no file open, round 3');
html = swap(html, '<h1>', '</h1>', '<h1>Multi-file workspaces — mockup v10');
html = swap(html, '<nav id="screens">', '</nav>', `<nav id="screens">\n${part('NAV')}\n  `);
html = swap(html, '<!-- ============ Z, ROUND 2. NO FILE OPEN ============ -->', '<script>', `${part('SECTIONS')}\n\n`);
html = swap(html, '/* ---------- the screen and its states ---------- */', 'const current = {};', `${part('SCRIPT')}\n\n`);
// The page's own </style>, not the one inside an example SVG in the data.
html = swap(html, '</style>\n</head>', '</head>', `\n  /* ===== v10 ===== */\n${part('CSS')}\n</style>\n`);

const outPath = path.join(dir, 'multi-file-mockup-v10.html');
fs.writeFileSync(outPath, html);
console.log(`wrote ${path.relative(process.cwd(), outPath)} (${Math.round(fs.statSync(outPath).size / 1024)} KB)`);

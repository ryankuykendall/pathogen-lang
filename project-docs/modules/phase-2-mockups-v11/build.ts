// Builds multi-file-mockup-v11.html: v10's built page (phase-2-mockups-v10/multi-file-mockup-v10.html,
// read in place, never edited), with v11's screen in place of v10's.
//
//   npx tsx project-docs/modules/phase-2-mockups-v11/build.ts
//
// v10's page already holds v6's kit, v7's to v10's parts and the example data, so v11 adds only
// its own. If v10's template changes, rebuild v10 first (npx tsx project-docs/modules/phase-2-mockups-v10/build.ts).
//
// multi-file-mockup-v11.template.html holds what v11 adds, in four parts marked <!-- @@CSS -->,
// <!-- @@NAV -->, <!-- @@SECTIONS --> and <!-- @@SCRIPT -->:
//   - the CSS goes at the end of the page's <style>;
//   - the harness button replaces v10's;
//   - the section replaces v10's screen;
//   - the script replaces v10's screen table (from v10's "the screen and its states" line to
//     v6's `const current = {};`). Its function declarations come after v10's, so they win.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const v10page = path.join(dir, '..', 'phase-2-mockups-v10', 'multi-file-mockup-v10.html');
const v11 = fs.readFileSync(path.join(dir, 'multi-file-mockup-v11.template.html'), 'utf8');

function part(name: string): string {
  const start = v11.indexOf(`<!-- @@${name} -->`);
  if (start < 0) throw new Error(`v11 template has no @@${name} part`);
  const from = v11.indexOf('\n', start) + 1;
  const next = v11.indexOf('<!-- @@', from);
  return v11.slice(from, next < 0 ? v11.length : next).trimEnd();
}

/** Replace the one span from `startMarker` up to (not including) `endMarker`. */
function swap(source: string, startMarker: string, endMarker: string, replacement: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0 || source.indexOf(startMarker, start + 1) >= 0) {
    throw new Error(`v10 page: expected one "${startMarker}" before "${endMarker}"`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

let html = fs.readFileSync(v10page, 'utf8');
html = swap(html, '<title>', '</title>', '<title>Mockup v11 — no file open, round 4');
html = swap(html, '<h1>', '</h1>', '<h1>Multi-file workspaces — mockup v11');
html = swap(html, '<nav id="screens">', '</nav>', `<nav id="screens">\n${part('NAV')}\n  `);
html = swap(html, '<!-- ============ Z, ROUND 3. NO FILE OPEN ============ -->', '<script>', `${part('SECTIONS')}\n\n`);
html = swap(html, '/* ---------- the screen and its states ---------- */', 'const current = {};', `${part('SCRIPT')}\n\n`);
// The page's own </style>, not the one inside an example SVG in the data.
html = swap(html, '</style>\n</head>', '</head>', `\n  /* ===== v11 ===== */\n${part('CSS')}\n</style>\n`);

const outPath = path.join(dir, 'multi-file-mockup-v11.html');
fs.writeFileSync(outPath, html);
console.log(`wrote ${path.relative(process.cwd(), outPath)} (${Math.round(fs.statSync(outPath).size / 1024)} KB)`);

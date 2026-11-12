// Builds multi-file-mockup-v9.html: v8's built page (phase-2-mockups-v8/multi-file-mockup-v8.html,
// read in place, never edited), with v9's screen in place of v8's.
//
//   npx tsx project-docs/modules/phase-2-mockups-v9/build.ts
//
// v8's page already holds v6's kit, v7's parts, v8's parts and the example data, so v9 adds only
// its own. If v8's template changes, rebuild v8 first (npx tsx project-docs/modules/phase-2-mockups-v8/build.ts).
//
// multi-file-mockup-v9.template.html holds what v9 adds, in four parts marked <!-- @@CSS -->,
// <!-- @@NAV -->, <!-- @@SECTIONS --> and <!-- @@SCRIPT -->:
//   - the CSS goes at the end of the page's <style>;
//   - the harness button replaces v8's;
//   - the section replaces v8's screen Z;
//   - the script replaces v8's screen table (from v8's "the screen and its states" line to
//     v6's `const current = {};`). Its function declarations come after v8's, so they win.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const v8page = path.join(dir, '..', 'phase-2-mockups-v8', 'multi-file-mockup-v8.html');
const v9 = fs.readFileSync(path.join(dir, 'multi-file-mockup-v9.template.html'), 'utf8');

function part(name: string): string {
  const start = v9.indexOf(`<!-- @@${name} -->`);
  if (start < 0) throw new Error(`v9 template has no @@${name} part`);
  const from = v9.indexOf('\n', start) + 1;
  const next = v9.indexOf('<!-- @@', from);
  return v9.slice(from, next < 0 ? v9.length : next).trimEnd();
}

/** Replace the one span from `startMarker` up to (not including) `endMarker`. */
function swap(source: string, startMarker: string, endMarker: string, replacement: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0 || source.indexOf(startMarker, start + 1) >= 0) {
    throw new Error(`v8 page: expected one "${startMarker}" before "${endMarker}"`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

let html = fs.readFileSync(v8page, 'utf8');
html = swap(html, '<title>', '</title>', '<title>Mockup v9 — no file open, round 2');
html = swap(html, '<h1>', '</h1>', '<h1>Multi-file workspaces — mockup v9');
html = swap(html, '<nav id="screens">', '</nav>', `<nav id="screens">\n${part('NAV')}\n  `);
html = swap(html, '<!-- ============ Z. NO FILE OPEN ============ -->', '<script>', `${part('SECTIONS')}\n\n`);
html = swap(html, '/* ---------- the screen and its states ---------- */', 'const current = {};', `${part('SCRIPT')}\n\n`);
// The page's own </style>, not the one inside an example SVG in the data.
html = swap(html, '</style>\n</head>', '</head>', `\n  /* ===== v9 ===== */\n${part('CSS')}\n</style>\n`);

const outPath = path.join(dir, 'multi-file-mockup-v9.html');
fs.writeFileSync(outPath, html);
console.log(`wrote ${path.relative(process.cwd(), outPath)} (${Math.round(fs.statSync(outPath).size / 1024)} KB)`);

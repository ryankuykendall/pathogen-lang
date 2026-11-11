// Builds multi-file-mockup-v8.html: v7's built page (phase-2-mockups-v7/multi-file-mockup-v7.html,
// read in place, never edited), with v8's one screen in place of v7's five.
//
//   npx tsx project-docs/modules/phase-2-mockups-v8/build.ts
//
// v7's page already holds v6's kit, v7's parts and the example data, so v8 adds only its own
// parts. If v7's template changes, rebuild v7 first (npx tsx project-docs/modules/phase-2-mockups-v7/build.ts).
//
// multi-file-mockup-v8.template.html holds what v8 adds, in four parts marked <!-- @@CSS -->,
// <!-- @@NAV -->, <!-- @@SECTIONS --> and <!-- @@SCRIPT -->:
//   - the CSS goes at the end of the page's <style>;
//   - the harness buttons replace v7's;
//   - the section replaces v7's five screens;
//   - the script replaces v7's screens table (from v7's "screens and their states" line to
//     v6's `const current = {};`). Its function declarations come after v7's, so they win.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const v7page = path.join(dir, '..', 'phase-2-mockups-v7', 'multi-file-mockup-v7.html');
const v8 = fs.readFileSync(path.join(dir, 'multi-file-mockup-v8.template.html'), 'utf8');

function part(name: string): string {
  const start = v8.indexOf(`<!-- @@${name} -->`);
  if (start < 0) throw new Error(`v8 template has no @@${name} part`);
  const from = v8.indexOf('\n', start) + 1;
  const next = v8.indexOf('<!-- @@', from);
  return v8.slice(from, next < 0 ? v8.length : next).trimEnd();
}

/** Replace the one span from `startMarker` up to (not including) `endMarker`. */
function swap(source: string, startMarker: string, endMarker: string, replacement: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0 || source.indexOf(startMarker, start + 1) >= 0) {
    throw new Error(`v7 page: expected one "${startMarker}" before "${endMarker}"`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

let html = fs.readFileSync(v7page, 'utf8');
html = swap(html, '<title>', '</title>', '<title>Mockup v8 — no file open');
html = swap(html, '<h1>', '</h1>', '<h1>Multi-file workspaces — mockup v8');
html = swap(html, '<nav id="screens">', '</nav>', `<nav id="screens">\n${part('NAV')}\n  `);
html = swap(html, '<!-- ============ X. NO PROGRAMS LEFT ============ -->', '<script>', `${part('SECTIONS')}\n\n`);
html = swap(html, '/* ---------- screens and their states ---------- */', 'const current = {};', `${part('SCRIPT')}\n\n`);
// The page's own </style>, not the one inside an example SVG in the data.
html = swap(html, '</style>\n</head>', '</head>', `\n  /* ===== v8 ===== */\n${part('CSS')}\n</style>\n`);

const outPath = path.join(dir, 'multi-file-mockup-v8.html');
fs.writeFileSync(outPath, html);
console.log(`wrote ${path.relative(process.cwd(), outPath)} (${Math.round(fs.statSync(outPath).size / 1024)} KB)`);

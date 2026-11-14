// Builds multi-file-mockup-v12.html: v11's built page (phase-2-mockups-v11/multi-file-mockup-v11.html,
// read in place, never edited), with v12's screens in place of v11's.
//
//   npx tsx project-docs/modules/phase-2-mockups-v12/build.ts           (the page)
//   npx tsx project-docs/modules/phase-2-mockups-v12/build.ts --bbwp    (also a BBWP copy in website/bbwp/)
//
// v11's page already holds v6's kit, v7's to v11's parts and the example workspace's data, so v12
// adds only its own. If v11's template changes, rebuild v11 first.
//
// multi-file-mockup-v12.template.html holds what v12 adds, in four parts marked <!-- @@CSS -->,
// <!-- @@NAV -->, <!-- @@SECTIONS --> and <!-- @@SCRIPT -->:
//   - the CSS goes at the end of the page's <style>;
//   - the harness buttons replace v11's;
//   - the sections replace v11's screen;
//   - the script replaces v11's screen table (from v11's "the screen and its states" line to
//     v6's `const current = {};`). Its function declarations come after v11's, so they win.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const v11page = path.join(dir, '..', 'phase-2-mockups-v11', 'multi-file-mockup-v11.html');
const v12 = fs.readFileSync(path.join(dir, 'multi-file-mockup-v12.template.html'), 'utf8');

function part(name: string): string {
  const start = v12.indexOf(`<!-- @@${name} -->`);
  if (start < 0) throw new Error(`v12 template has no @@${name} part`);
  const from = v12.indexOf('\n', start) + 1;
  const next = v12.indexOf('<!-- @@', from);
  return v12.slice(from, next < 0 ? v12.length : next).trimEnd();
}

/** Replace the one span from `startMarker` up to (not including) `endMarker`. */
function swap(source: string, startMarker: string, endMarker: string, replacement: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0 || source.indexOf(startMarker, start + 1) >= 0) {
    throw new Error(`v11 page: expected one "${startMarker}" before "${endMarker}"`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

let html = fs.readFileSync(v11page, 'utf8');
html = swap(html, '<title>', '</title>', '<title>Mockup v12 — several files, outside the workspace');
html = swap(html, '<h1>', '</h1>', '<h1>Multi-file workspaces — mockup v12');
html = swap(html, '<nav id="screens">', '</nav>', `<nav id="screens">\n${part('NAV')}\n  `);
html = swap(html, '<!-- ============ Z, ROUND 4. NO FILE OPEN ============ -->', '<script>', `${part('SECTIONS')}\n\n`);
html = swap(html, '/* ---------- the screen and its states ---------- */', 'const current = {};', `${part('SCRIPT')}\n\n`);
// The page's own </style>, not the one inside an example SVG in the data.
html = swap(html, '</style>\n</head>', '</head>', `\n  /* ===== v12 ===== */\n${part('CSS')}\n</style>\n`);

const outPath = path.join(dir, 'multi-file-mockup-v12.html');
fs.writeFileSync(outPath, html);
console.log(`wrote ${path.relative(process.cwd(), outPath)} (${Math.round(fs.statSync(outPath).size / 1024)} KB)`);

if (process.argv.includes('--bbwp')) {
  // website/CLAUDE.md: YYYY-MM-DD-HH:MM:SS--<roadmap>--<feature>.html, never overwriting one.
  const d = new Date();
  const two = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
  const bbwp = path.join(dir, '..', '..', '..', 'website', 'bbwp', `${stamp}--multi-file-workspaces--mockup-v12.bbwp.html`);
  if (fs.existsSync(bbwp)) throw new Error(`${bbwp} exists already`);
  fs.writeFileSync(bbwp, html);
  console.log(`wrote ${path.relative(process.cwd(), bbwp)}; now run npm run update:bbwp-index`);
}

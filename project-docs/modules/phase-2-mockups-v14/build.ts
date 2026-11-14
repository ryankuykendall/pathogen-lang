// Builds multi-file-mockup-v14.html: v13's built page (phase-2-mockups-v13/multi-file-mockup-v13.html,
// read in place, never edited), with v14's section and a few lines of script.
//
//   npx tsx project-docs/modules/phase-2-mockups-v14/build.ts           (the page)
//   npx tsx project-docs/modules/phase-2-mockups-v14/build.ts --bbwp    (also a BBWP copy in website/bbwp/)
//
// multi-file-mockup-v14.template.html holds what v14 adds, in four parts marked <!-- @@CSS -->,
// <!-- @@NAV -->, <!-- @@SECTIONS --> and <!-- @@SCRIPT -->:
//   - the CSS goes at the end of the page's <style>;
//   - the harness button replaces v13's;
//   - the section replaces v13's;
//   - the script goes just before v6's `const current = {};`, after v13's screen table, which it edits.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const v13page = path.join(dir, '..', 'phase-2-mockups-v13', 'multi-file-mockup-v13.html');
const v14 = fs.readFileSync(path.join(dir, 'multi-file-mockup-v14.template.html'), 'utf8');

function part(name: string): string {
  const start = v14.indexOf(`<!-- @@${name} -->`);
  if (start < 0) throw new Error(`v14 template has no @@${name} part`);
  const from = v14.indexOf('\n', start) + 1;
  const next = v14.indexOf('<!-- @@', from);
  return v14.slice(from, next < 0 ? v14.length : next).trimEnd();
}

/** Replace the one span from `startMarker` up to (not including) `endMarker`. */
function swap(source: string, startMarker: string, endMarker: string, replacement: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0 || source.indexOf(startMarker, start + 1) >= 0) {
    throw new Error(`v13 page: expected one "${startMarker}" before "${endMarker}"`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

/** Insert `text` just before the one `marker`. */
function insertBefore(source: string, marker: string, text: string): string {
  const at = source.indexOf(marker);
  if (at < 0 || source.indexOf(marker, at + 1) >= 0) throw new Error(`v13 page: expected one "${marker}"`);
  return source.slice(0, at) + text + source.slice(at);
}

let html = fs.readFileSync(v13page, 'utf8');
html = swap(html, '<title>', '</title>', '<title>Mockup v14 — copying code, round 2');
// The harness's heading; the page's script holds another <h1> (the review screen's "Moderation").
html = swap(html, '<h1>Multi-file workspaces', '</h1>', '<h1>Multi-file workspaces — mockup v14');
html = swap(html, '<nav id="screens">', '</nav>', `<nav id="screens">\n${part('NAV')}\n  `);
html = swap(html, '<!-- ============ C. COPYING CODE ============ -->', '<script>', `${part('SECTIONS')}\n\n`);
html = insertBefore(html, 'const current = {};', `${part('SCRIPT')}\n\n`);
// The page's own </style>, not the one inside an example SVG in the data.
html = swap(html, '</style>\n</head>', '</head>', `\n  /* ===== v14 ===== */\n${part('CSS')}\n</style>\n`);

const outPath = path.join(dir, 'multi-file-mockup-v14.html');
fs.writeFileSync(outPath, html);
console.log(`wrote ${path.relative(process.cwd(), outPath)} (${Math.round(fs.statSync(outPath).size / 1024)} KB)`);

if (process.argv.includes('--bbwp')) {
  // website/CLAUDE.md: YYYY-MM-DD-HH:MM:SS--<roadmap>--<feature>.html, never overwriting one.
  const d = new Date();
  const two = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
  const bbwp = path.join(dir, '..', '..', '..', 'website', 'bbwp', `${stamp}--multi-file-workspaces--mockup-v14.bbwp.html`);
  if (fs.existsSync(bbwp)) throw new Error(`${bbwp} exists already`);
  fs.writeFileSync(bbwp, html);
  console.log(`wrote ${path.relative(process.cwd(), bbwp)}; now run npm run update:bbwp-index`);
}

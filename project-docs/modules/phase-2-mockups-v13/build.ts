// Builds multi-file-mockup-v13.html: v12's built page (phase-2-mockups-v12/multi-file-mockup-v12.html,
// read in place, never edited), with v13's screen in place of v12's five.
//
//   npx tsx project-docs/modules/phase-2-mockups-v13/build.ts           (the page)
//   npx tsx project-docs/modules/phase-2-mockups-v13/build.ts --bbwp    (also a BBWP copy in website/bbwp/)
//
// v12's page already holds v6's kit, v7's to v12's parts and the example workspace's data. If v12's
// template changes, rebuild v12 first.
//
// multi-file-mockup-v13.template.html holds what v13 adds, in four parts marked <!-- @@CSS -->,
// <!-- @@NAV -->, <!-- @@SECTIONS --> and <!-- @@SCRIPT -->:
//   - the CSS goes at the end of the page's <style>;
//   - the harness button replaces v12's five;
//   - the section replaces v12's sections;
//   - the script replaces v12's span from `const SCREENS = {` to v6's `const current = {};`: its
//     screen table, its click listeners and its style switch. v12's state helpers come before it and
//     stay. Its function declarations come after v12's, so they win.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const v12page = path.join(dir, '..', 'phase-2-mockups-v12', 'multi-file-mockup-v12.html');
const v13 = fs.readFileSync(path.join(dir, 'multi-file-mockup-v13.template.html'), 'utf8');

function part(name: string): string {
  const start = v13.indexOf(`<!-- @@${name} -->`);
  if (start < 0) throw new Error(`v13 template has no @@${name} part`);
  const from = v13.indexOf('\n', start) + 1;
  const next = v13.indexOf('<!-- @@', from);
  return v13.slice(from, next < 0 ? v13.length : next).trimEnd();
}

/** Replace the one span from `startMarker` up to (not including) `endMarker`. */
function swap(source: string, startMarker: string, endMarker: string, replacement: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0 || source.indexOf(startMarker, start + 1) >= 0) {
    throw new Error(`v12 page: expected one "${startMarker}" before "${endMarker}"`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

let html = fs.readFileSync(v12page, 'utf8');
html = swap(html, '<title>', '</title>', '<title>Mockup v13 — copying code from the code panel');
// The harness's heading; v12's script holds another <h1> (the review screen's "Moderation").
html = swap(html, '<h1>Multi-file workspaces', '</h1>', '<h1>Multi-file workspaces — mockup v13');
html = swap(html, '<nav id="screens">', '</nav>', `<nav id="screens">\n${part('NAV')}\n  `);
html = swap(html, '<!-- ============ F. THREE WAYS TO SWITCH FILES ============ -->', '<script>', `${part('SECTIONS')}\n\n`);
html = swap(html, 'const SCREENS = {', 'const current = {};', `${part('SCRIPT')}\n\n`);
// The page's own </style>, not the one inside an example SVG in the data.
html = swap(html, '</style>\n</head>', '</head>', `\n  /* ===== v13 ===== */\n${part('CSS')}\n</style>\n`);

const outPath = path.join(dir, 'multi-file-mockup-v13.html');
fs.writeFileSync(outPath, html);
console.log(`wrote ${path.relative(process.cwd(), outPath)} (${Math.round(fs.statSync(outPath).size / 1024)} KB)`);

if (process.argv.includes('--bbwp')) {
  // website/CLAUDE.md: YYYY-MM-DD-HH:MM:SS--<roadmap>--<feature>.html, never overwriting one.
  const d = new Date();
  const two = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
  const bbwp = path.join(dir, '..', '..', '..', 'website', 'bbwp', `${stamp}--multi-file-workspaces--mockup-v13.bbwp.html`);
  if (fs.existsSync(bbwp)) throw new Error(`${bbwp} exists already`);
  fs.writeFileSync(bbwp, html);
  console.log(`wrote ${path.relative(process.cwd(), bbwp)}; now run npm run update:bbwp-index`);
}

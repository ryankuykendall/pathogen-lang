// Builds multi-file-mockup-v7.html: v6's approved kit (its CSS, chrome and drawing
// code, read in place from phase-2-mockups-v6/, never edited) with v7's own screens.
//
//   npx tsx project-docs/modules/phase-2-mockups-v7/build.ts
//
// multi-file-mockup-v7.template.html holds only what v7 adds, in four parts marked
// <!-- @@CSS -->, <!-- @@NAV -->, <!-- @@SECTIONS --> and <!-- @@SCRIPT -->. This
// script puts them into v6's template:
//   - the CSS goes at the end of v6's <style>;
//   - the harness buttons replace v6's;
//   - the sections replace v6's six screens;
//   - the script replaces v6's SCREENS table. Its function declarations come later
//     in the same script, so they replace v6's functions of the same name.
//
// The data is v6's (the gears workspace from v2, and the files v6 added), plus:
//   - the files after each move the screens show, made by the engine's own
//     importEditsForMoves (src/host/move-imports.ts), so the rewritten imports
//     drawn are the ones the playground will write;
//   - example/swatch.pathogen and its SVG for the mini-workspace (screen W),
//     compiled with
//       npx tsx src/cli.ts project-docs/modules/phase-2-mockups-v7/example/swatch.pathogen \
//         --output-svg-file=project-docs/modules/phase-2-mockups-v7/example/swatch.svg
//     (its folder has its own pathogen.json, so the CLI doesn't find v2's).
import fs from 'node:fs';
import path from 'node:path';

import { applyImportEdits, importEditsForMoves, pathAfterMoves } from '../../../src/host/move-imports';

import type { PathMove } from '../../../src/host/move-imports';

const dir = path.dirname(new URL(import.meta.url).pathname);
const v6dir = path.join(dir, '..', 'phase-2-mockups-v6');
const v2 = (p: string) => path.join(dir, '..', 'phase-2-mockups-v2', 'example', p);
const v2ed = (p: string) => path.join(dir, '..', 'phase-2-mockups-v2', 'example-edited', p);
const v3 = (p: string) => path.join(dir, '..', 'phase-2-mockups-v3', 'example', p);
const v5 = (p: string) => path.join(dir, '..', 'phase-2-mockups-v5', 'example', p);

// v6's sources and SVGs, as v6's build.ts lists them (keys: workspace paths without .pathogen).
const SOURCES: Record<string, string> = {
  'main': v2('main.pathogen'),
  'demos/gears': v2('demos/gears.pathogen'),
  'try-sizes': v2('try-sizes.pathogen'),
  'parts/gears': v2('parts/gears.pathogen'),
  'parts/kit': v2('parts/kit.pathogen'),
  'parts/labels': v2('parts/labels.pathogen'),
  'parts/gears#edited': v2ed('parts/gears.pathogen'),
  'main#new': v3('main.pathogen'),
  'parts/ratchet': v5('new-library.pathogen'),
  'poster': v3('main.pathogen'),
  'parts/springs': v2('parts/springs.pathogen'),
  'parts/labels-2': v2('parts/labels.pathogen'),
  'springs': v2('parts/springs.pathogen'),
  'shapes/star': v3('main.pathogen'),
  // v7: the mini-workspace's code
  'swatch': path.join(dir, 'example', 'swatch.pathogen'),
};
const SVGS: Record<string, string> = {
  main: v2('main.svg'),
  demo: v2('demos/gears.svg'),
  try: v2('try-sizes.svg'),
  mainEdited: v2ed('main.svg'),
  blank: v3('main.svg'),
};

const text = (file: string) => fs.readFileSync(file, 'utf8').replace(/\n+$/, '');
const lines = (file: string) => text(file).split('\n');

// As v6: the playground's white background, CSS sizing, no ids.
function prepSvg(file: string): { svg: string; vb: number[] } {
  let s = fs.readFileSync(file, 'utf8').trim();
  const vbMatch = /viewBox="([^"]+)"/.exec(s);
  if (!vbMatch) throw new Error(`${file}: no viewBox`);
  const vb = vbMatch[1].split(/\s+/).map(Number);
  const openEnd = s.indexOf('>');
  let open = s.slice(0, openEnd);
  open = open.replace(/\s(width|height)="[^"]*"/g, '');
  const bg = `<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#fff"/>`;
  s = `${open}>${bg}${s.slice(openEnd + 1)}`;
  s = s.replace(/\sid="[^"]*"/g, '').replace(/\n\s*/g, '');
  return { svg: s, vb };
}

// The mini-workspace's drawing: no background rect (the page draws the canvas, in the
// Background the screen chooses) and an __UNDER__ marker where the canvas and grid go.
function prepBare(file: string): { svg: string; vb: number[] } {
  let s = fs.readFileSync(file, 'utf8').trim();
  const vb = (/viewBox="([^"]+)"/.exec(s) as RegExpExecArray)[1].split(/\s+/).map(Number);
  const openEnd = s.indexOf('>');
  const open = s.slice(0, openEnd).replace(/\s(width|height)="[^"]*"/g, '');
  s = `${open}>__UNDER__${s.slice(openEnd + 1)}`;
  return { svg: s.replace(/\sid="[^"]*"/g, '').replace(/\n\s*/g, ''), vb };
}

// The example workspace by project path, for the engine.
const WORKSPACE_KEYS = ['main', 'demos/gears', 'try-sizes', 'parts/gears', 'parts/kit', 'parts/labels'];
const workspace = Object.fromEntries(WORKSPACE_KEYS.map((k) => [`/${k}.pathogen`, text(SOURCES[k])]));
const keyOf = (projectPath: string) => projectPath.slice(1).replace(/\.pathogen$/, '');

/** One move as the screens draw it: every file after it, and which lines changed where. */
function scenario(moves: PathMove[]) {
  const edits = importEditsForMoves(workspace, moves);
  const src: Record<string, string[]> = {};
  const changed: Record<string, number[]> = {};
  for (const [file, source] of Object.entries(workspace)) {
    const fileEdits = edits.find((e) => e.file === file)?.edits ?? [];
    const after = keyOf(pathAfterMoves(file, moves));
    src[after] = applyImportEdits(source, fileEdits).split('\n');
    if (fileEdits.length > 0) changed[after] = fileEdits.map((e) => e.line);
  }
  // The files whose imports change, by their paths after the move and before it.
  return { src, changed, updated: Object.keys(changed), updatedBefore: edits.map((e) => keyOf(e.file)) };
}

const data = {
  src: Object.fromEntries(Object.entries(SOURCES).map(([k, f]) => [k, lines(f)])),
  svg: {
    ...Object.fromEntries(Object.entries(SVGS).map(([k, f]) => [k, prepSvg(f)])),
    swatch: prepBare(path.join(dir, 'example', 'swatch.svg')),
  },
  moves: {
    folder: scenario([{ from: '/parts', to: '/machines' }]),
    renameGears: scenario([{ from: '/parts/gears.pathogen', to: '/parts/cogs.pathogen' }]),
    kitToDemos: scenario([{ from: '/parts/kit.pathogen', to: '/demos/kit.pathogen' }]),
  },
};

// v7's parts, from its template.
const v7 = fs.readFileSync(path.join(dir, 'multi-file-mockup-v7.template.html'), 'utf8');
function part(name: string): string {
  const start = v7.indexOf(`<!-- @@${name} -->`);
  if (start < 0) throw new Error(`v7 template has no @@${name} part`);
  const from = v7.indexOf('\n', start) + 1;
  const next = v7.indexOf('<!-- @@', from);
  return v7.slice(from, next < 0 ? v7.length : next).trimEnd();
}

/** Replace the one span from `startMarker` up to (not including) `endMarker`. */
function swap(source: string, startMarker: string, endMarker: string, replacement: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0 || source.indexOf(startMarker, start + 1) >= 0) {
    throw new Error(`v6 template: expected one "${startMarker}" before "${endMarker}"`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

let html = fs.readFileSync(path.join(v6dir, 'multi-file-mockup-v6.template.html'), 'utf8');
html = swap(html, '<title>', '</title>', '<title>Mockup v7 — what v6 left undrawn');
html = swap(html, '<h1>', '</h1>', '<h1>Multi-file workspaces — mockup v7');
html = swap(html, '<nav id="screens">', '</nav>', `<nav id="screens">\n${part('NAV')}\n  `);
html = swap(html, '<!-- ============ J. PATHOGEN.JSON ============ -->', '<script>', `${part('SECTIONS')}\n\n`);
html = swap(html, 'const SCREENS = {', 'const current = {};', `${part('SCRIPT')}\n\n`);
html = swap(html, '</style>', '</head>', `\n  /* ===== v7 ===== */\n${part('CSS')}\n</style>\n`);
if (!html.includes('__DATA__')) throw new Error('v6 template has no __DATA__ marker');

const outPath = path.join(dir, 'multi-file-mockup-v7.html');
const json = JSON.stringify(data).replace(/<\/script/gi, '<\\/script');
fs.writeFileSync(outPath, html.replace('__DATA__', () => json));
console.log(`wrote ${path.relative(process.cwd(), outPath)} (${Math.round(fs.statSync(outPath).size / 1024)} KB)`);
for (const [name, s] of Object.entries(data.moves)) {
  console.log(`  ${name}: updates ${s.updated.join(', ') || 'nothing'}`);
}

// Builds multi-file-mockup-v3.html from the template, inlining the example's real
// sources and the SVGs the CLI compiled from them (so the editor panes and drawings
// can't drift from the files).
//
//   npx tsx project-docs/modules/phase-2-mockups-v3/build.ts
//
// The gears workspace is v2's example, read in place (v2 is never edited).
// example/main.pathogen here is a new workspace's main.pathogen: the playground's
// emptyBoilerplate (playground/utils/examples.ts), copied on 2026-11-06.
// Recompile an SVG if its file changes:
//   npx tsx src/cli.ts <program>.pathogen --output-svg-file=<program>.svg
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const v2 = (p: string) => path.join(dir, '..', 'phase-2-mockups-v2', 'example', p);
const v2ed = (p: string) => path.join(dir, '..', 'phase-2-mockups-v2', 'example-edited', p);
const v3 = (p: string) => path.join(dir, 'example', p);

// key -> source file (keys are workspace paths without .pathogen; '#' marks a variant)
const SOURCES: Record<string, string> = {
  'main': v2('main.pathogen'),
  'demos/gears': v2('demos/gears.pathogen'),
  'try-sizes': v2('try-sizes.pathogen'),
  'parts/gears': v2('parts/gears.pathogen'),
  'parts/kit': v2('parts/kit.pathogen'),
  'parts/labels': v2('parts/labels.pathogen'),
  'parts/gears#edited': v2ed('parts/gears.pathogen'),
  'main#new': v3('main.pathogen'),
};

// key -> compiled SVG
const SVGS: Record<string, string> = {
  main: v2('main.svg'),
  demo: v2('demos/gears.svg'),
  try: v2('try-sizes.svg'),
  mainEdited: v2ed('main.svg'),
  blank: v3('main.svg'),
};

function lines(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8').replace(/\n+$/, '');
  return text.split('\n');
}

// The CLI's SVG is strokes on nothing. Give it the playground's white background
// (the Background default), let CSS size it, and drop ids (the same drawing appears
// several times on the page).
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

const data = {
  src: Object.fromEntries(Object.entries(SOURCES).map(([k, f]) => [k, lines(f)])),
  svg: Object.fromEntries(Object.entries(SVGS).map(([k, f]) => [k, prepSvg(f)])),
};

const templatePath = path.join(dir, 'multi-file-mockup-v3.template.html');
const outPath = path.join(dir, 'multi-file-mockup-v3.html');
const template = fs.readFileSync(templatePath, 'utf8');
if (!template.includes('__DATA__')) throw new Error('template has no __DATA__ marker');
const json = JSON.stringify(data).replace(/<\/script/gi, '<\\/script');
fs.writeFileSync(outPath, template.replace('__DATA__', () => json));
console.log(`wrote ${path.relative(process.cwd(), outPath)} (${Math.round(fs.statSync(outPath).size / 1024)} KB)`);

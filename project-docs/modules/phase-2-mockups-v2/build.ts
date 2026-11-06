// Builds multi-file-mockup-v2.html from the template, inlining the example's real
// sources and the SVGs the CLI compiled from them (so the editor panes and drawings
// can't drift from the files).
//
//   npx tsx project-docs/modules/phase-2-mockups-v2/build.ts
//
// Recompile the SVGs first if an example file changes:
//   npx tsx src/cli.ts <program>.pathogen --output-svg-file=<program>.svg
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const ex = (p: string) => path.join(dir, 'example', p);
const ed = (p: string) => path.join(dir, 'example-edited', p);

// key -> source file (keys are workspace paths without .pathogen; '#' marks a variant)
const SOURCES: Record<string, string> = {
  'main': ex('main.pathogen'),
  'demos/gears': ex('demos/gears.pathogen'),
  'demos/springs': ex('demos/springs.pathogen'),
  'try-sizes': ex('try-sizes.pathogen'),
  'parts/gears': ex('parts/gears.pathogen'),
  'parts/kit': ex('parts/kit.pathogen'),
  'parts/labels': ex('parts/labels.pathogen'),
  'parts/springs': ex('parts/springs.pathogen'),
  'try-sizes#error': ex('try-sizes-error.pathogen'),
  'parts/gears#edited': ed('parts/gears.pathogen'),
};

// key -> compiled SVG
const SVGS: Record<string, string> = {
  main: ex('main.svg'),
  demo: ex('demos/gears.svg'),
  try: ex('try-sizes.svg'),
  springs: ex('demos/springs.svg'),
  mainEdited: ed('main.svg'),
};

function lines(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8').replace(/\n+$/, '');
  return text.split('\n');
}

// The CLI's SVG is black strokes on nothing. Give it the playground's white
// background (BG swatch default) so it reads on the dark canvas, let CSS size it,
// and drop ids (the same drawing appears several times on the page).
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

const templatePath = path.join(dir, 'multi-file-mockup-v2.template.html');
const outPath = path.join(dir, 'multi-file-mockup-v2.html');
const template = fs.readFileSync(templatePath, 'utf8');
if (!template.includes('__DATA__')) throw new Error('template has no __DATA__ marker');
const json = JSON.stringify(data).replace(/<\/script/gi, '<\\/script');
fs.writeFileSync(outPath, template.replace('__DATA__', () => json));
console.log(`wrote ${path.relative(process.cwd(), outPath)} (${Math.round(fs.statSync(outPath).size / 1024)} KB)`);

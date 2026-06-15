// Visual verification: render real Pathogen-compiled SVGs (via the library, the
// same path the CLI uses) and screenshot them in Chromium to confirm the
// MotionBlurFilter pipeline produces the intended directional/progressive look.
// Run: npx tsx project-docs/motion-blur/probes/render-samples.ts

import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from '../../../src';
import { buildDefs } from '../../../src/render';
import { toSvgString } from '../../../src/render';

const here = dirname(fileURLToPath(import.meta.url));

// A "comb" of thin bars makes directional smearing obvious. Built with Pathogen
// so we exercise the real evaluator → render path.
function comb(filterName: string): string {
  let bars = '';
  for (let i = 0; i < 9; i++) {
    const y = 16 + i * 19;
    bars += `circle(100, ${y + 3}, 6); rect(20, ${y}, 160, 7);`;
  }
  return `
${filterName ? '' : ''}
define PathLayer('art') \${ fill: oklch(45% 0.18 265); ${filterName ? `filter: ${filterName};` : ''} }
layer('art').apply { ${bars} }
`;
}

function program(filterDecl: string, filterName: string): string {
  return `${filterDecl}\n${comb(filterName)}`;
}

function render(src: string): string {
  const result = compile(src);
  const defs = buildDefs(result);
  const body = result.layers
    .map((l) => ('pathData' in l && l.pathData ? `<path d="${l.pathData}" ${styleAttrs(l)}/>` : ''))
    .join('');
  const defsStr = defs.map((d) => toSvgString(d)).join('');
  return `<svg width="200" height="200" viewBox="0 0 200 200" style="background:#fff;border:1px solid #ccc"><defs>${defsStr}</defs>${body}</svg>`;
}

// minimal style serialization for the demo (fill + filter)
function styleAttrs(l: unknown): string {
  const s = (l as { styles?: Record<string, string> }).styles ?? {};
  return Object.entries(s)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
}

const samples: { label: string; decl: string; name: string }[] = [
  { label: 'reference (no filter)', decl: '', name: '' },
  {
    label: 'linear 0deg d=18',
    decl: 'let f = MotionBlurFilter() {|f| f.type = MotionBlurType.Linear; f.distance = 18; f.angle = 0deg; f.samples = 14; };',
    name: 'f',
  },
  {
    label: 'linear 90deg d=18',
    decl: 'let f = MotionBlurFilter() {|f| f.type = MotionBlurType.Linear; f.distance = 18; f.angle = 90deg; f.samples = 14; };',
    name: 'f',
  },
  {
    label: 'linear 45deg d=24',
    decl: 'let f = MotionBlurFilter() {|f| f.type = MotionBlurType.Linear; f.distance = 24; f.angle = 45deg; f.samples = 16; };',
    name: 'f',
  },
  {
    label: 'progressive 90deg d=8',
    decl: 'let f = MotionBlurFilter() {|f| f.type = MotionBlurType.Progressive; f.distance = 8; f.angle = 90deg; };',
    name: 'f',
  },
  {
    label: 'progressive 0deg d=8',
    decl: 'let f = MotionBlurFilter() {|f| f.type = MotionBlurType.Progressive; f.distance = 8; f.angle = 0deg; };',
    name: 'f',
  },
];

async function main(): Promise<void> {
  const panels = samples
    .map((s) => {
      const svg = render(program(s.decl, s.name));
      return `<figure style="margin:0;text-align:center;font:12px monospace">${svg}<figcaption>${s.label}</figcaption></figure>`;
    })
    .join('');
  const page = `<!doctype html><html><body style="margin:16px;background:#eee">
    <div style="display:grid;grid-template-columns:repeat(3,200px);gap:18px">${panels}</div>
  </body></html>`;
  writeFileSync(join(here, 'render-samples.html'), page);

  const browser = await puppeteer.launch({ headless: 'new' as unknown as boolean });
  try {
    const p = await browser.newPage();
    await p.setViewport({ width: 700, height: 540, deviceScaleFactor: 2 });
    await p.setContent(page, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 300));
    const out = join(here, 'render-samples.png');
    await p.screenshot({ path: out });
    console.log('wrote', out);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

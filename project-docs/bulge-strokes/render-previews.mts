// Renders PNG previews for every bulge-strokes stage file.
// Self-contained: compiles each .pathogen source via the CLI into svg/, then
// screenshots with Puppeteer into previews/. Run from the repo root:
//   npx tsx project-docs/bulge-strokes/render-previews.mts
import { execFileSync } from 'child_process';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(DIR, '..', '..');
const SVG_DIR = path.join(DIR, 'svg');
const OUT = path.join(DIR, 'previews');

const stages = fs
  .readdirSync(DIR)
  .filter((f) => /^\d.*\.pathogen$/.test(f))
  .sort();

fs.mkdirSync(SVG_DIR, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

for (const stage of stages) {
  const svgPath = path.join(SVG_DIR, stage.replace('.pathogen', '.svg'));
  execFileSync('npx', ['tsx', 'src/cli.ts', `--src=${path.join(DIR, stage)}`, `--output-svg-file=${svgPath}`], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  console.log(`compiled ${stage}`);
}

const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.setViewport({ width: 500, height: 700, deviceScaleFactor: 2 });
page.on('dialog', (d) => d.dismiss());

for (const stage of stages) {
  const name = stage.replace('.pathogen', '');
  const svg = fs.readFileSync(path.join(SVG_DIR, `${name}.svg`), 'utf8');
  await page.setContent(`<body style="margin:0;background:#fff">${svg}</body>`);
  const el = await page.$('svg');
  if (!el) { console.error(`no <svg> for ${name}`); continue; }
  await el.screenshot({ path: path.join(OUT, `${name}.png`) as `${string}.png` });
  console.log(`rendered ${name}.png`);
}
await browser.close();

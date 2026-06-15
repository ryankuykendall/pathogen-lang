// Tile the CLI-generated sample SVGs into one screenshot for visual review.
// Run: npx tsx project-docs/motion-blur/probes/tile-svgs.ts
import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const svgs = join(here, 'svgs');
const order: [string, string][] = [
  ['ref', 'reference (no filter)'],
  ['lin0', 'linear 0deg d=18'],
  ['lin90', 'linear 90deg d=18'],
  ['lin45', 'linear 45deg d=24'],
  ['prog90', 'progressive 90deg d=8'],
  ['prog0', 'progressive 0deg d=8'],
];

const panels = order
  .map(([file, label]) => {
    const svg = readFileSync(join(svgs, `${file}.svg`), 'utf8');
    return `<figure style="margin:0;text-align:center;font:12px monospace">
      <div style="width:200px;height:200px;border:1px solid #ccc;background:#fff">${svg}</div>
      <figcaption>${label}</figcaption></figure>`;
  })
  .join('');

const page = `<!doctype html><html><body style="margin:16px;background:#eee">
  <div style="display:grid;grid-template-columns:repeat(3,200px);gap:18px">${panels}</div>
</body></html>`;

async function main(): Promise<void> {
  writeFileSync(join(here, 'tile-svgs.html'), page);
  const browser = await puppeteer.launch({ headless: 'new' as unknown as boolean });
  try {
    const p = await browser.newPage();
    await p.setViewport({ width: 700, height: 540, deviceScaleFactor: 2 });
    await p.setContent(page, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 300));
    await p.screenshot({ path: join(here, 'tile-svgs.png') });
    console.log('wrote tile-svgs.png');
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

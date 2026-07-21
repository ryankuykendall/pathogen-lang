// Screenshot the Phase A mockups into mockups/previews/.
// Run from the repo root: node project-docs/unified-export/shoot-mockups.mjs
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, 'mockups');
const out = resolve(dir, 'previews');
mkdirSync(out, { recursive: true });

const files = [
  '01-default-export.html',
  '02-legend-on-highlighted.html',
  '03-png-settings.html',
  '04-menu-and-watermark.html',
];

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

for (const f of files) {
  await page.goto(`file://${dir}/${f}`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${out}/${f.replace('.html', '')}.png`, fullPage: true });
  console.log(`shot ${f}`);
}

await browser.close();

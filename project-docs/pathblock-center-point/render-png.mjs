// Renders centerpoint-demo.svg to centerpoint-demo.png at 2x for a durable preview.
// Run from the repo root: node project-docs/pathblock-center-point/render-png.mjs
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const dir = path.dirname(new URL(import.meta.url).pathname);
const svg = fs.readFileSync(path.join(dir, 'centerpoint-demo.svg'), 'utf8');
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 520, height: 300, deviceScaleFactor: 2 });
  await page.setContent(`<html><body style="margin:0;background:#fff">${svg}</body></html>`, { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: path.join(dir, 'centerpoint-demo.png'), clip: { x: 0, y: 0, width: 520, height: 300 } });
  console.log('wrote centerpoint-demo.png');
} finally {
  await browser.close();
}

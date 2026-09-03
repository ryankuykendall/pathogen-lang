// Renders a demo SVG in this directory to a 2x PNG for a durable preview.
// Run from the repo root:
//   node project-docs/easing-interpolation/render-png.mjs demo-cubic-bezier
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const name = process.argv[2] ?? 'demo-cubic-bezier';
const dir = path.dirname(new URL(import.meta.url).pathname);
const svg = fs.readFileSync(path.join(dir, `${name}.svg`), 'utf8');
const vb = /viewBox="([^"]+)"/.exec(svg);
const [, , w, h] = (vb ? vb[1] : '0 0 400 270').split(/\s+/).map(Number);
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  await page.setContent(
    `<html><body style="margin:0;background:#fff">${svg.replace(/<svg /, `<svg width="${w}" height="${h}" `)}</body></html>`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.screenshot({ path: path.join(dir, `${name}.png`), clip: { x: 0, y: 0, width: w, height: h } });
  console.log(`wrote ${name}.png (${w}x${h} @2x)`);
} finally {
  await browser.close();
}

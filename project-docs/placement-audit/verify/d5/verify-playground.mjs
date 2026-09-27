// D5 / ISSUE-027 — drive the LIVE playground (dev stack on :3000) with the
// negative-origin conic program and pull the rendered <pattern> straight out of
// the preview DOM: its tile placement and the raster the playground produced
// (WebGPU, then the Canvas 2D fallback via localStorage.pathogenForceCanvas2D).
// The raster is saved as a PNG next to this script so it can be compared with
// the CLI/headless renders by compare-png.mjs. No page.screenshot (it hangs on
// this host); no waitForFunction (blocked by the page CSP).
//
//   node project-docs/placement-audit/verify/d5/verify-playground.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGES = process.env.PAGES_URL ?? 'http://localhost:3000';
const code = readFileSync(join(HERE, 'conic-origin.pathogen'), 'utf8');
const state = Buffer.from(encodeURIComponent(JSON.stringify({ code }))).toString('base64');

let failures = 0;
for (const mode of ['gpu', 'canvas2d']) {
  const browser = await puppeteer.launch({ headless: true, args: ['--enable-unsafe-webgpu', '--no-sandbox'] });
  try {
    const page = await browser.newPage();
    page.on('dialog', (d) => d.dismiss());
    await page.evaluateOnNewDocument((force) => {
      window.__name = (fn) => fn;
      try {
        if (force) localStorage.setItem('pathogenForceCanvas2D', '1');
        else localStorage.removeItem('pathogenForceCanvas2D');
      } catch {}
    }, mode === 'canvas2d');
    const url = `${PAGES}/workspace/scratch?state=${state}${mode === 'canvas2d' ? '&gpu=off' : ''}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

    let info = null;
    for (let i = 0; i < 120 && !info; i++) {
      await new Promise((r) => setTimeout(r, 500));
      info = await page.evaluate(() => {
        const deep = (root, sel) => {
          const hit = root.querySelector ? root.querySelector(sel) : null;
          if (hit) return hit;
          for (const el of root.querySelectorAll ? root.querySelectorAll('*') : []) {
            if (el.shadowRoot) {
              const f = deep(el.shadowRoot, sel);
              if (f) return f;
            }
          }
          return null;
        };
        const iframe = deep(document, 'iframe');
        const doc = iframe && iframe.contentDocument;
        if (!doc) return null;
        const pattern = doc.querySelector('pattern#g');
        if (!pattern) return null;
        const image = pattern.querySelector('image');
        const href = (image && image.getAttribute('href')) || '';
        if (!href.startsWith('data:image/png')) return null;
        const svg = doc.querySelector('svg');
        return {
          viewBox: svg && svg.getAttribute('viewBox'),
          x: pattern.getAttribute('x'),
          y: pattern.getAttribute('y'),
          width: pattern.getAttribute('width'),
          height: pattern.getAttribute('height'),
          href,
        };
      });
    }
    if (!info) {
      console.log(`${mode}: FAIL — no rendered conic pattern appeared in the preview within 60 s`);
      failures++;
      continue;
    }
    const png = join(HERE, `playground-${mode}.png`);
    writeFileSync(png, Buffer.from(info.href.split(',')[1], 'base64'));
    const ok = info.x === '-100' && info.y === '-100' && info.width === '200' && info.height === '200';
    console.log(
      `${mode}: ${ok ? 'OK' : 'FAIL'} — preview viewBox="${info.viewBox}", <pattern id="g" x="${info.x}" y="${info.y}" width="${info.width}" height="${info.height}">, raster saved to ${png}`,
    );
    if (!ok) failures++;
  } finally {
    await browser.close();
  }
}
process.exit(failures === 0 ? 0 : 1);

// Chrome's V8 heap ceiling, with and without --js-flags=--max-old-space-size.
// Measured 2026-09-10 on Chrome 152, 32 GB Mac: default 3,586 MB; 8192 flag →
// unchanged (pointer-compression cage); 1024 flag → 1,144 MB (honoured
// downward). Node 24 default 4,288 MB, --max-old-space-size=12000 → 12,192 MB.
// Run from the repo root: node project-docs/glyph-halo-diagnosis/probes/chrome-heap-limit.mjs
import puppeteer from 'puppeteer';

async function limitWith(args) {
  const browser = await puppeteer.launch({ headless: true, args });
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  const mb = await page.evaluate(() => Math.round(performance.memory.jsHeapSizeLimit / 1048576));
  const version = await browser.version();
  await browser.close();
  return { version, mainLimitMB: mb };
}

console.log('default      :', JSON.stringify(await limitWith([])));
console.log('max-old 1024 :', JSON.stringify(await limitWith(['--js-flags=--max-old-space-size=1024'])));
console.log('max-old 8192 :', JSON.stringify(await limitWith(['--js-flags=--max-old-space-size=8192'])));

// Screenshots every state of vscode-chip-mockup.html in both themes, plus the list state in
// each variant: node project-docs/modules/mockups-2f-vscode-chip/shoot.mjs
// Files: <state>-<theme>.png, list-toolbar-<theme>.png, list-names-<theme>.png.
import path from 'node:path';

import puppeteer from 'puppeteer';

const dir = path.dirname(new URL(import.meta.url).pathname);
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('requestfailed', (r) => errors.push(`failed: ${r.url()}`));
await page.setViewport({ width: 1320, height: 1000, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(dir, 'vscode-chip-mockup.html'));

const click = (sel) => page.click(sel);
const settle = () => page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));

// Read the states from the page itself, so a new one can't be forgotten here.
const states = await page.evaluate(() => [...document.querySelectorAll('#states [data-st]')].map((b) => b.dataset.st));
let shots = 0;
for (const theme of ['light', 'dark']) {
  await click(`[data-theme-set=${theme}]`);
  await click('[data-place=zoom]');
  await click('[data-rows=mini]');
  for (const state of states) {
    await click(`#states [data-st=${state}]`);
    await settle();
    await page.screenshot({ path: path.join(dir, `${state}-${theme}.png`), fullPage: true });
    shots++;
  }
  await click('#states [data-st=list]');
  await click('[data-place=toolbar]');
  await settle();
  await page.screenshot({ path: path.join(dir, `list-toolbar-${theme}.png`), fullPage: true });
  await click('[data-place=zoom]');
  await click('[data-rows=names]');
  await settle();
  await page.screenshot({ path: path.join(dir, `list-names-${theme}.png`), fullPage: true });
  await click('[data-rows=mini]');
  shots += 2;
}
await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`ok: ${shots} screenshots`);

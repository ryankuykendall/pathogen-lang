// Screenshots every mockup state in light + dark: node project-docs/modules/phase-2-mockups-v1/shoot.mjs
// Each state chip sets the whole state, so the order of the shots doesn't matter.
import puppeteer from 'puppeteer';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1320, height: 1000 });
await page.goto('file://' + path.join(dir, 'multi-file-mockup-v1.html'));
const wait = ms => new Promise(r => setTimeout(r, ms));
// [file prefix, screen id, state id]
const shots = [
  ['1-tree-main', 'tree', 'main'],
  ['1-tree-library', 'tree', 'library'],
  ['1-tree-row-menu', 'tree', 'row-menu'],
  ['1-tree-program-menu', 'tree', 'program-menu'],
  ['1-tree-add-menu', 'tree', 'add-menu'],
  ['1-tree-new-file', 'tree', 'new-file'],
  ['1-tree-collapsed', 'tree', 'collapsed'],
  ['2-tabs-library', 'tabs', 'library'],
  ['3-tree-tabs-library', 'both', 'library'],
  ['4-errors-other-file', 'errors', 'other-file'],
  ['4-errors-opened', 'errors', 'opened'],
  ['4-errors-hover', 'errors', 'hover'],
  ['4-errors-renamed', 'errors', 'renamed'],
  ['5-narrow-closed', 'narrow', 'closed'],
  ['5-narrow-open', 'narrow', 'open'],
  ['6-pin-main', 'pin', 'main'],
  ['6-pin-pinned', 'pin', 'pinned'],
  ['7-source-tabs', 'source', 'tabs'],
];
for (const theme of ['light', 'dark']) {
  await page.reload();
  await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
  await page.evaluate(() => document.fonts.ready);
  await wait(300);
  for (const [name, screen, state] of shots) {
    await page.click(`#screens [data-s=${screen}]`);
    await page.click(`#st-${screen} [data-st=${state}]`);
    await wait(350);
    await page.screenshot({ path: path.join(dir, `${name}-${theme}.png`), fullPage: true });
  }
}
await browser.close();
console.log('ok');

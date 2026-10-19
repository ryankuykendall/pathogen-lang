// Screenshots every mockup screen in light + dark: node project-docs/snapshots/mockups-v1/shoot.mjs
import puppeteer from 'puppeteer';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1320, height: 1000, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(dir, 'snapshots-mockup-v1.html'));
await page.evaluate(() => document.fonts.ready);
const wait = ms => new Promise(r => setTimeout(r, ms));
const steps = {
  '1-capture-toast': async () => { await page.click('#cap-snap'); },
  '1-capture-popover': async () => { await page.click('#cap-states [data-v=popover]'); await page.click('#cap-snap'); },
  '1-capture-compiling': async () => { await page.click('#cap-states [data-v=toast]'); await page.click('#cap-states [data-c=busy]'); },
  '1-capture-stale': async () => { await page.click('#cap-states [data-c=stale]'); await page.click('#cap-snap'); },
  '2-fullscreen': async () => { await page.click('[data-s=fullscreen]'); for (let i = 0; i < 3; i++) { await page.click('#fs-snap'); await page.click('#fs-refresh'); } await page.click('#fs-snap'); },
  '3-filmstrip': async () => { await page.click('[data-s=strip]'); },
  '3-filmstrip-collapsed': async () => { await page.click('#strip-states [data-st=closed]'); },
  '4-gallery': async () => { await page.click('[data-s=gallery]'); },
  '4-gallery-menu': async () => { await page.click('#gal-states [data-g=menu]'); },
  '4-gallery-empty': async () => { await page.click('#gal-states [data-g=empty]'); },
  '5-viewer': async () => { await page.click('[data-s=viewer]'); },
  '5-viewer-code': async () => { await page.click('#v-states [data-vc=open]'); },
  '6-edge': async () => { await page.click('[data-s=edge]'); },
};
for (const theme of ['light', 'dark']) {
  await page.reload(); await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
  await page.evaluate(() => document.fonts.ready);
  for (const [name, fn] of Object.entries(steps)) {
    await fn(); await wait(450);
    await page.screenshot({ path: path.join(dir, `${name}-${theme}.png`), fullPage: true });
  }
}
await browser.close();
console.log('ok');

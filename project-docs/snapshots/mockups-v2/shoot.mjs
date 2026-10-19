// Screenshots every v2 mockup state in light + dark: node project-docs/snapshots/mockups-v2/shoot.mjs
import puppeteer from 'puppeteer';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1320, height: 1000 });
await page.goto('file://' + path.join(dir, 'snapshots-mockup-v2.html'));
const wait = ms => new Promise(r => setTimeout(r, ms));
const steps = {
  '1-capture-naming': async () => { await page.click('[data-s=capture]'); },
  '1-capture-stale': async () => { await page.click('#cap-states [data-c=stale]'); },
  '1-capture-saved': async () => { await page.click('#cap-states [data-c=ok]'); await page.click('#cap-states [data-p=saved]'); },
  '1-capture-compiling': async () => { await page.click('#cap-states [data-c=busy]'); },
  '2-fullscreen-naming': async () => { await page.click('[data-s=fullscreen]'); for (let i = 0; i < 3; i++) { await page.click('#fs-snap'); await page.click('#fs-save'); await page.click('#fs-refresh'); } await page.click('#fs-snap'); },
  '2-fullscreen-tray': async () => { await page.click('#fs-save'); },
  '3-ingress': async () => { await page.click('[data-s=ingress]'); },
  '4-page': async () => { await page.click('[data-s=page]'); },
  '4-page-code': async () => { await page.click('#page-states [data-pg=code]'); },
  '4-page-fork': async () => { await page.click('#page-states [data-pg=fork]'); },
  '4-page-empty': async () => { await page.click('#page-states [data-pg=empty]'); },
  '5-edge': async () => { await page.click('[data-s=edge]'); },
};
for (const theme of ['light', 'dark']) {
  await page.reload(); await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
  await page.evaluate(() => document.fonts.ready); await wait(300);
  for (const [name, fn] of Object.entries(steps)) {
    await fn(); await wait(450);
    await page.screenshot({ path: path.join(dir, `${name}-${theme}.png`), fullPage: true });
  }
}
await browser.close();
console.log('ok');

// Screenshots every mockup state in light + dark: node project-docs/modules/phase-2-mockups-v2/shoot.mjs
// Files are <screen>-<state>-<theme>.png. Each state chip sets the whole state, so order doesn't matter.
// Rebuild the page first if the template or the example changed:
//   npx tsx project-docs/modules/phase-2-mockups-v2/build.ts
import puppeteer from 'puppeteer';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.setViewport({ width: 1320, height: 1000 });
await page.goto('file://' + path.join(dir, 'multi-file-mockup-v2.html'));
const wait = ms => new Promise(r => setTimeout(r, ms));
// Read the screens and states from the page itself, so a new state can't be forgotten here.
const shots = await page.evaluate(() => [...document.querySelectorAll('#screens [data-s]')].flatMap(b => {
  const screen = b.dataset.s;
  return [...document.querySelectorAll(`#st-${screen} [data-st]`)].map(s => [screen, s.dataset.st]);
}));
for (const theme of ['light', 'dark']) {
  await page.reload();
  await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
  await page.evaluate(() => document.fonts.ready);
  await wait(300);
  for (const [screen, state] of shots) {
    await page.click(`#screens [data-s=${screen}]`);
    await page.click(`#st-${screen} [data-st=${state}]`);
    await wait(250);
    await page.screenshot({ path: path.join(dir, `${screen}-${state}-${theme}.png`), fullPage: true });
  }
}
await browser.close();
// Font fetches fail offline; anything else is a real problem.
const real = errors.filter(e => !/fonts\.(googleapis|gstatic)\.com|net::ERR_/.test(e));
if (real.length) { console.error(real.join('\n')); process.exit(1); }
console.log(`ok: ${shots.length} states x 2 themes`);

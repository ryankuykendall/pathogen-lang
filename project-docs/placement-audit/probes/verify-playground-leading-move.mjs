import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
const src = readFileSync(process.argv[2], 'utf8');
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
page.on('dialog', (d) => d.dismiss().catch(() => {}));
await page.goto('http://localhost:3000/playground', { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => !!window.PathogenLang, { timeout: 60000 });
const d = await page.evaluate((s) => {
  const o = window.PathogenLang.compile(s);
  return o.layers.find((l) => l.name === 'ribbon').data;
}, src);
console.log('Playground:', '[ribbon] ' + d.slice(0, 30));
console.log('starts with a moveto?', /^[Mm] /.test(d));
await browser.close();

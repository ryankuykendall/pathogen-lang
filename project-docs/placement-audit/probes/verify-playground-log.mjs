import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
const src = readFileSync(process.argv[2], 'utf8');
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
page.on('dialog', (d) => d.dismiss().catch(() => {}));
await page.goto('http://localhost:3000/playground', { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => !!window.PathogenLang, { timeout: 60000 });
const out = await page.evaluate((s) => {
  const o = window.PathogenLang.compile(s);
  return o.logs[0].parts.map((p) => String(p.value)).join('');
}, src);
console.log('Playground     :', out);
await browser.close();

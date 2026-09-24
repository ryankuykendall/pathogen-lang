// Option D reaches the playground: the browser bundle must raise the same
// layer-transform warning the CLI and the .vsix do.
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
const src = readFileSync(process.argv[2], 'utf8');
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
page.on('dialog', (d) => d.dismiss().catch(() => {}));
await page.goto('http://localhost:3000/playground', { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => !!window.PathogenLang, { timeout: 60000 });
const codes = await page.evaluate((s) => window.PathogenLang.compile(s).warnings.map((w) => w.code), src);
console.log('Playground     :', codes.filter((c) => c === 'layer-transform').length, 'layer-transform warning(s)');
await browser.close();

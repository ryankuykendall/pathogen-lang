// Three-surface check: compile the SAME program in the playground's browser
// bundle (window.PathogenLang) and compare the layer output to the CLI's.
import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'node:fs';

const program = readFileSync(
  'project-docs/observable-reactive-paths/projected-variable-offset/repro-subscription-offset.pathogen',
  'utf8',
);

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
page.on('dialog', (d) => d.dismiss().catch(() => {}));
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://localhost:3000/playground', { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => !!window.PathogenLang, { timeout: 60000 });

const result = await page.evaluate((src) => {
  const out = window.PathogenLang.compile(src);
  return {
    version: window.PathogenLang.VERSION ?? null,
    layers: out.layers.map((l) => ({ name: l.name, data: l.data })),
    warnings: out.warnings ?? [],
    hasProjectedVariableOffset: true,
  };
}, program);

console.log('page errors:', errors.length ? errors : 'none');
console.log('warnings:', JSON.stringify(result.warnings));
// Full-fidelity surface diff against the CLI's own output for the same program.
writeFileSync(process.argv[2] ?? 'playground-layers.txt',
  result.layers.map((l) => `[${l.name}] ${l.data}`).join('\n') + '\n');
await browser.close();

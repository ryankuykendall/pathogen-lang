// Three-surface check, playground half: compile the probe program with the bundle the
// playground actually serves, and ask its language services about the new methods.
//   node project-docs/placement-audit/v3-translate/verify-playground.mjs <file.pathogen>
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
const src = readFileSync(process.argv[2], 'utf8');
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
page.on('dialog', (d) => d.dismiss().catch(() => {}));
await page.goto('http://localhost:3000/playground', { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => !!window.PathogenLang, { timeout: 60000 });
const out = await page.evaluate((s) => {
  const P = window.PathogenLang;
  const o = P.compile(s);
  const log = o.logs[0].parts.map((p) => String(p.value)).join('');
  const data = o.layers.map((l) => l.data).join(' ');
  const probe = s + '\npiece.tr';
  let completions = 'language services not exported on the bundle';
  let hover = completions;
  if (P.getCompletions && P.StringTextDocument) {
    const doc = new P.StringTextDocument(probe);
    const lines = probe.split('\n');
    const pos = { line: lines.length - 1, character: lines[lines.length - 1].length };
    completions = P.getCompletions(doc, pos)
      .map((c) => c.label)
      .filter((l) => l.startsWith('translate'))
      .join(', ');
    const line = lines.findIndex((l) => l.includes('piece.translateStartPointTo'));
    const h = P.getHoverInfo(doc, { line, character: lines[line].indexOf('translateStartPointTo') + 3 });
    hover = h ? JSON.stringify(h.contents ?? h).slice(0, 220) : 'no hover';
  }
  return { log, data, completions, hover };
}, src);
console.log('Playground log :', out.log);
console.log('Playground path:', out.data);
console.log('Completions    :', out.completions);
console.log('Hover          :', out.hover);
await browser.close();

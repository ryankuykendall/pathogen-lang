// Where does the repro's CLI-vs-browser drift originate? Sample the SAME
// layer-sourced arc both engines see, with no variableOffset involved.
import puppeteer from 'puppeteer';
const SRC = `
define default PathLayer('shape') #{ fill: none; };
M 400 500;
a 100 100 0 1 1 200 0;
let arc = layer('shape').query('command(a)');
let out = '';
for (i in 0..20) {
  let t = calc(i / 20);
  let p = arc.block.get(t);
  out = \`\${out} \${p.x},\${p.y}\`;
}
log(out);
log(\`len \${arc.block.length}\`);
`;
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
page.on('dialog', (d) => d.dismiss().catch(() => {}));
await page.goto('http://localhost:3000/playground', { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => !!window.PathogenLang, { timeout: 60000 });
const logsOf = (o) => o.logs.map((l) => l.parts.map((p) => String(p.value)).join(' '));
const b = await page.evaluate((s) => {
  const o = window.PathogenLang.compile(s);
  return o.logs.map((l) => l.parts.map((p) => String(p.value)).join(' '));
}, SRC);
await browser.close();
const { compile } = await import('../../../src/index.ts');
const a = logsOf(compile(SRC));
for (let i = 0; i < a.length; i++) {
  if (a[i] === b[i]) { console.log(`IDENTICAL line ${i}`); continue; }
  const at = a[i].trim().split(/\s+/), bt = b[i].trim().split(/\s+/);
  const diffs = at.map((t, j) => [j, t, bt[j]]).filter(([, t, u]) => t !== u);
  console.log(`DIFFERS   line ${i}: ${diffs.length}/${at.length} samples`);
  for (const [j, t, u] of diffs.slice(0, 3)) console.log(`   [${j}] node=${t}\n        browser=${u}`);
}

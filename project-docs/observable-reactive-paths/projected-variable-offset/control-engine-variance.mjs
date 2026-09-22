// Control: does CLI-vs-browser last-bit drift predate this feature? Compare an
// existing trig-heavy method (offset on an arc) across the two engines.
import puppeteer from 'puppeteer';
const SRC = `
define default PathLayer('p') #{ fill: none; };
let ring = @{ circle(0, 0, 100); }.project(500, 500);
ring.offset(17).draw();
`;
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
page.on('dialog', (d) => d.dismiss().catch(() => {}));
await page.goto('http://localhost:3000/playground', { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => !!window.PathogenLang, { timeout: 60000 });
const browserOut = await page.evaluate((s) => window.PathogenLang.compile(s).layers[0].data, SRC);
await browser.close();
const { compile } = await import('../../../src/index.ts');
const nodeOut = compile(SRC).layers[0].data;
console.log('identical:', nodeOut === browserOut);
if (nodeOut !== browserOut) {
  const a = nodeOut.split(' '), b = browserOut.split(' ');
  const diffs = a.map((t, i) => [i, t, b[i]]).filter(([, t, u]) => t !== u);
  console.log('differing tokens:', diffs.length, 'of', a.length);
  for (const [i, t, u] of diffs.slice(0, 4)) console.log(`  [${i}] node=${t} browser=${u}`);
}

// Sharper control: the PathBlock variableOffset path is UNCHANGED by this work.
// If it also drifts CLI-vs-browser on an arc spine, the drift belongs to the
// spline/trig math, not to the projected form.
import puppeteer from 'puppeteer';
const CASES = {
  'PathBlock variableOffset (arc spine, unchanged code path)': `
define default PathLayer('p') #{ fill: none; };
let spine = @{ circle(0, 0, 100); };
let edge = spine.variableOffset() {|go, pb|
  go.stop(0%, 0, CurveContinuity.G1);
  go.stop(50%, 40, CurveContinuity.G2);
  go.stop(100%, 0, CurveContinuity.G1);
};
edge.drawTo(500, 500);
`,
  'ProjectedPath variableOffset (arc spine, new code path)': `
define default PathLayer('p') #{ fill: none; };
let spine = @{ circle(0, 0, 100); }.project(500, 500);
let edge = spine.variableOffset() {|go, pb|
  go.stop(0%, 0, CurveContinuity.G1);
  go.stop(50%, 40, CurveContinuity.G2);
  go.stop(100%, 0, CurveContinuity.G1);
};
edge.draw();
`,
  'PathBlock variableOffset (straight spine)': `
define default PathLayer('p') #{ fill: none; };
let edge = @{ h 100 }.variableOffset() {|go, pb|
  go.stop(10%, 5, CurveContinuity.G1);
  go.stop(90%, 5, CurveContinuity.G1);
};
edge.drawTo(500, 500);
`,
};
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
page.on('dialog', (d) => d.dismiss().catch(() => {}));
await page.goto('http://localhost:3000/playground', { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => !!window.PathogenLang, { timeout: 60000 });
const { compile } = await import('../../../src/index.ts');
for (const [name, src] of Object.entries(CASES)) {
  const browserOut = await page.evaluate((s) => window.PathogenLang.compile(s).layers[0].data, src);
  const nodeOut = compile(src).layers[0].data;
  const a = nodeOut.split(' '), b = browserOut.split(' ');
  const diffs = a.map((t, i) => [i, t, b[i]]).filter(([, t, u]) => t !== u);
  console.log(`${nodeOut === browserOut ? 'IDENTICAL ' : 'DIFFERS   '} ${name}`);
  if (diffs.length) {
    const worst = Math.max(...diffs.map(([, t, u]) => Math.abs(Number(t) - Number(u))));
    console.log(`            ${diffs.length}/${a.length} tokens, max abs delta ${worst.toExponential(2)}`);
  }
}
await browser.close();

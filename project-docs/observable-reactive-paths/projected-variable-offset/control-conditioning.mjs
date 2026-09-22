// Is the CLI-vs-browser drift in the repro caused by the PROJECTED form, or by
// the repro's near-coincident G2 stops (49.95% / 50% / 50.05%) making the
// tridiagonal spline solve ill-conditioned? Run the same profile both ways.
import puppeteer from 'puppeteer';
const STOPS_TIGHT = `
  go.stop(0%, 0, CurveContinuity.G1);
  go.stop(20%, 20, CurveContinuity.G1);
  go.stop(45%, 40, CurveContinuity.G1);
  go.stop(49.95%, 80, CurveContinuity.G2);
  go.stop(50%, 150, CurveContinuity.G2);
  go.stop(50.05%, 80, CurveContinuity.G2);
  go.stop(55%, 40, CurveContinuity.G1);
  go.stop(80%, 20, CurveContinuity.G1);
  go.stop(100%, 0, CurveContinuity.G1);`;
const STOPS_LOOSE = `
  go.stop(0%, 0, CurveContinuity.G1);
  go.stop(25%, 40, CurveContinuity.G2);
  go.stop(50%, 150, CurveContinuity.G2);
  go.stop(75%, 40, CurveContinuity.G2);
  go.stop(100%, 0, CurveContinuity.G1);`;
const mk = (stops, projected) => projected
  ? `define default PathLayer('p') #{ fill: none; };\nlet s = @{ circle(0,0,100); }.project(500,500);\nlet e = s.variableOffset() {|go, pb|${stops}\n};\ne.draw();`
  : `define default PathLayer('p') #{ fill: none; };\nlet s = @{ circle(0,0,100); };\nlet e = s.variableOffset() {|go, pb|${stops}\n};\ne.drawTo(500,500);`;
const CASES = {
  'tight stops, PathBlock (UNCHANGED path)': mk(STOPS_TIGHT, false),
  'tight stops, ProjectedPath (new path)': mk(STOPS_TIGHT, true),
  'loose stops, PathBlock (UNCHANGED path)': mk(STOPS_LOOSE, false),
  'loose stops, ProjectedPath (new path)': mk(STOPS_LOOSE, true),
};
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
page.on('dialog', (d) => d.dismiss().catch(() => {}));
await page.goto('http://localhost:3000/playground', { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => !!window.PathogenLang, { timeout: 60000 });
const { compile } = await import('../../../src/index.ts');
for (const [name, src] of Object.entries(CASES)) {
  const b = (await page.evaluate((s) => window.PathogenLang.compile(s).layers[0].data, src)).split(' ');
  const a = compile(src).layers[0].data.split(' ');
  const diffs = a.map((t, i) => [t, b[i]]).filter(([t, u]) => t !== u);
  const worst = diffs.length ? Math.max(...diffs.map(([t, u]) => Math.abs(Number(t) - Number(u)))) : 0;
  console.log(`${diffs.length ? 'DIFFERS  ' : 'IDENTICAL'} ${name.padEnd(42)} ${diffs.length}/${a.length} tokens, max delta ${worst.toExponential(2)}`);
}
await browser.close();

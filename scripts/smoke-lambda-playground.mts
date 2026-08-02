// Playground smoke test for lambda expressions: drives the LOCAL dev server
// (npm run dev:website / dev:stack must be running on :3000), injects a
// lambda program via the new-workspace state param, and polls the preview
// for the expected geometry. Safe to delete after lambdas ship.
import puppeteer from 'puppeteer';

const CODE = `define ViewBox(0, 0, 100, 100);
let f = {|x| return calc(x * 10); };
let vals = [1, 2, 3].map(f);
let v0 = vals[0];
M f(2) f(3)
L v0 0
`;

const state = Buffer.from(encodeURIComponent(JSON.stringify({ code: CODE, title: 'lambda-smoke' }))).toString('base64');
const base = process.env.SMOKE_BASE ?? 'http://localhost:3000';
const url = `${base}/workspace/scratch?state=${state}`;

const browser = await puppeteer.launch();
const page = await browser.newPage();
page.on('dialog', (d) => d.dismiss());
await page.evaluateOnNewDocument(() => {
  try { localStorage.setItem('pathogen-anon-id', 'smoke-test-anon'); } catch {}
});

await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

// Poll with evaluate (CSP blocks waitForFunction) for a preview path whose
// d-attribute starts with the lambda-computed M 20 30. The probe is a string
// so tsx's transpile helpers (__name) never leak into the page context.
const PROBE = `(() => {
  const collect = (root) => {
    const out = [];
    for (const p of Array.from(root.querySelectorAll('path'))) out.push(p.getAttribute('d') || '');
    for (const el of Array.from(root.querySelectorAll('*'))) {
      if (el.shadowRoot) out.push(...collect(el.shadowRoot));
    }
    return out;
  };
  return collect(document).find((d) => d.startsWith('M 20 30')) || '';
})()`;

let found = '';
for (let i = 0; i < 40; i++) {
  found = (await page.evaluate(PROBE)) as string;
  if (found) break;
  await new Promise((r) => setTimeout(r, 500));
}

await browser.close();
if (found.includes('L 10 0')) {
  console.log(`PLAYGROUND SMOKE PASS: preview rendered "${found.trim()}"`);
} else {
  console.error(`PLAYGROUND SMOKE FAIL: no lambda-computed path found (last saw: "${found}")`);
  process.exit(1);
}

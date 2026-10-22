// Playground verification for the Font namespace (docs/fonts.md) against real
// Google Fonts slices. Requires the dev site on :3000 built from this tree.
//   node project-docs/glyph-listing/verify/verify-font-namespace.mjs
// Each scenario loads /workspace/scratch?state=… (no API), waits for the
// compile, and reads the console pane's logs, the font warning banner, the
// font requests made, and the rendered preview.
import path from 'node:path';
import puppeteer from 'puppeteer';

const OUT = path.dirname(new URL(import.meta.url).pathname);
const APP = 'http://localhost:3000';
const results = [];
const check = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DEEP = `const deep = (sel, root = document) => { const f = root.querySelector(sel); if (f) return f; for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) { const r = deep(sel, el.shadowRoot); if (r) return r; } } return null; };`;

async function scenario(name, code, { until, timeout = 60000 } = {}) {
  const browser = await puppeteer.launch({ headless: 'shell' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.on('dialog', (d) => d.dismiss());
  const fontRequests = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'fetch' && /fonts\.(gstatic|googleapis)\.com/.test(r.url())) fontRequests.push(r.url());
  });
  const state = Buffer.from(encodeURIComponent(JSON.stringify({ code }))).toString('base64');
  try {
    await page.goto(`${APP}/workspace/scratch?state=${state}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch {}
  const start = Date.now();
  let snap = null;
  let firstError = '';
  while (Date.now() - start < timeout) {
    snap = await page.evaluate(`(() => { ${DEEP}
      const pane = deep('console-pane');
      const logs = (pane?.logs ?? []).map((l) => (l.parts ?? []).map((p) => p.value ?? '').join(' '));
      const banner = deep('#font-warning');
      const err = deep('error-panel');
      const errText = err && getComputedStyle(err).display !== 'none' ? [...err.shadowRoot.querySelectorAll(':not(style)')].map((e) => e.children.length ? '' : e.textContent.trim()).filter(Boolean).join(' | ') : '';
      const iframe = deep('svg-preview-pane')?.shadowRoot?.querySelector('iframe');
      const paths = iframe?.contentDocument ? [...iframe.contentDocument.querySelectorAll('#preview-layers path, #preview-path')].filter((p) => (p.getAttribute('d') || '').length > 10).length : 0;
      return { logs, banner: banner ? banner.textContent.replace(/\\s+/g, ' ').trim() : '', errText, paths };
    })()`);
    if (snap.errText && !firstError) firstError = `${((Date.now() - start) / 1000).toFixed(1)}s: ${snap.errText.slice(0, 120)}`;
    if (until(snap)) break;
    await wait(500);
  }
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  // How many slices Google serves this family in (browser UA, like the playground).
  const family = (code.match(/@font "([^"]+)"/) || [])[1];
  const totalSlices = family
    ? await page.evaluate(async (f) => {
        const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(f)}`)).text();
        return (css.match(/@font-face/g) || []).length;
      }, family)
    : 0;
  await browser.close();
  if (firstError) console.log(`  [${name}] transient error seen at ${firstError}`);
  return { ...snap, fontRequests, totalSlices };
}

// 1. Raleway 700 from Google vs the repo's Raleway-Bold.ttf through the CLI.
const ralewayCode = `@font "Raleway" 700;
let styles = #{ font-family: Raleway; font-weight: 700; font-size: 40; };
let info = Font.info(styles);
log("chars", info.characterCount);
for (s in info.scripts) { log("script", s.name, s.count); }
log("cyr", Font.characters(styles, "Cyrillic").length);
log("digits", Font.characters(styles, "digit"));
for ([g, i] in Font.glyphs(styles, "digit")) { M calc(20 + i * 30) 60 g.draw() }
`;
const raleway = await scenario('raleway-info', ralewayCode, { until: (s) => s?.logs.some((l) => l.startsWith('digits')) });
console.log(raleway.logs.slice(0, 12).join('\n'));
check('Raleway: no error', !raleway.errText, raleway.errText);
check('Raleway: info + selections logged', raleway.logs.some((l) => /^chars \d+/.test(l)) && raleway.logs.some((l) => l.startsWith('digits 0123456789')));
check('Raleway: digits drawn in the preview', raleway.paths >= 1, `${raleway.paths} path(s)`);
check('Raleway: whole-font note in the banner', /Loaded all \d+ slices of "Raleway"/.test(raleway.banner), raleway.banner.slice(0, 160));
console.log(`  font requests: ${raleway.fontRequests.length}`);

// 2. Roboto: a script selection fetches only the overlapping slices.
const robotoCode = `@font "Roboto";
let styles = #{ font-family: Roboto; font-size: 32; };
let cyr = Font.glyphs(styles, "Cyrillic");
log("cyr", cyr.length, cyr[0].char, cyr[0].script);
for ([g, i] in cyr.slice(0, 20)) { M calc(20 + (i % 10) * 34) calc(40 + floor(i / 10) * 40) g.draw() }
`;
const roboto = await scenario('roboto-cyrillic', robotoCode, { until: (s) => s?.logs.some((l) => l.startsWith('cyr')) });
console.log(roboto.logs.join('\n'));
const robotoWoff = roboto.fontRequests.filter((u) => u.includes('gstatic'));
check('Roboto: Cyrillic glyphs listed', roboto.logs.some((l) => /^cyr \d{2,} \S+ Cyrillic$/.test(l)), roboto.logs.find((l) => l.startsWith('cyr')));
check('Roboto: drawn', roboto.paths >= 1);
check('Roboto: selection loaded some but not all slices (no whole-font note)', robotoWoff.length >= 2 && robotoWoff.length < roboto.totalSlices && !/Loaded all/.test(roboto.banner), `${robotoWoff.length} of ${roboto.totalSlices} slices`);

// 3. Noto Sans SC: a code-point selection fetches one slice; "Han" counts many.
const cjkCode = `@font "Noto Sans SC";
let styles = #{ font-family: "Noto Sans SC"; font-size: 40; };
let some = Font.glyphs(styles, (19968..19977));
log("some", some.length, some[0].char, some[0].block);
for ([g, i] in some) { M calc(20 + i * 44) 60 g.draw() }
`;
const cjk = await scenario('noto-sans-sc-codepoints', cjkCode, { until: (s) => s?.logs.some((l) => l.startsWith('some')), timeout: 90000 });
console.log(cjk.logs.join('\n'));
const cjkWoff = cjk.fontRequests.filter((u) => u.includes('gstatic'));
check('Noto Sans SC: 10 ideographs from code points', cjk.logs.some((l) => /^some 10 一 CJK Unified Ideographs$/.test(l)), cjk.logs.find((l) => l.startsWith('some')));
check('Noto Sans SC: only the slices holding those 10 characters, not the whole font', cjkWoff.length > 0 && cjkWoff.length < cjk.totalSlices / 4, `${cjkWoff.length} of ${cjk.totalSlices} slices`);
check('Noto Sans SC: drawn', cjk.paths >= 1);

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);

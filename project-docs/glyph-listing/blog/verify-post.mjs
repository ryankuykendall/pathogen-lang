// End-to-end checks for the "What's in the Font?" post (dev site on :3000):
//  1. the post page has five mini-workspaces and every sample SVG loads;
//  2. each sample, opened in the playground (Google's Raleway), compiles with
//     no error, draws paths, and shows no error squiggle in the editor.
//   node project-docs/glyph-listing/blog/verify-post.mjs
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:3000';
const SAMPLES = ['01-digits', '02-coverage-bars', '03-two-alphabets', '04-kinds-of-character', '05-specimen'];
const DEEP = `const deep = (sel, root = document) => { const f = root.querySelector(sel); if (f) return f; for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) { const r = deep(sel, el.shadowRoot); if (r) return r; } } return null; };
const deepAll = (sel, root = document, out = []) => { out.push(...root.querySelectorAll(sel)); for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) deepAll(sel, el.shadowRoot, out); } return out; };`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await puppeteer.launch({ headless: 'shell' });
try {
  // 1. The post page.
  const page = await browser.newPage();
  const svgStatus = new Map();
  page.on('response', (r) => {
    const m = /\/blog\/samples\/post57\/([\w-]+)\.svg/.exec(r.url());
    if (m) svgStatus.set(m[1], r.status());
  });
  await page.goto(`${BASE}/blog/whats-in-the-font`, { waitUntil: 'networkidle0', timeout: 60000 });
  const count = await page.evaluate(`(() => { ${DEEP} return deepAll('mini-workspace').length; })()`);
  check('post page has five mini-workspaces', count === 5, `${count}`);
  const title = await page.evaluate(`document.title`);
  check('post title', /What's in the Font/.test(title), title);
  // 304 = served from the browser cache, which is just as good.
  for (const name of SAMPLES) check(`sample SVG served: ${name}`, [200, 304].includes(svgStatus.get(name)), String(svgStatus.get(name)));
  await page.close();

  // 2. Each sample in the playground.
  for (const name of SAMPLES) {
    const code = readFileSync(new URL(`../../../website/blog/samples/post57/${name}.pathogen`, import.meta.url), 'utf8');
    const tab = await browser.newPage();
    await tab.setViewport({ width: 1400, height: 900 });
    tab.on('dialog', (d) => d.dismiss());
    // A ?state= URL can't carry the longer samples (wrangler answers 431),
    // and the reader's "open in playground" route creates a signed-in
    // workspace. So: open a scratch workspace, then paste the sample into
    // the editor as one input event.
    const stub = Buffer.from(encodeURIComponent(JSON.stringify({ code: 'circle(10, 10, 5);\n' }))).toString('base64');
    try {
      await tab.goto(`${BASE}/workspace/scratch?state=${stub}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch {}
    for (let i = 0; i < 60; i++) {
      if (await tab.evaluate(`(() => { ${DEEP} return !!deep('.cm-content'); })()`)) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    await tab.evaluate(`(() => { ${DEEP} deep('.cm-content').focus(); })()`);
    await tab.keyboard.down('Meta');
    await tab.keyboard.press('a');
    await tab.keyboard.up('Meta');
    await tab.keyboard.sendCharacter(code);
    await new Promise((r) => setTimeout(r, 1500));
    // Same probes as verify/verify-font-namespace.mjs: the preview lives in an
    // iframe inside svg-preview-pane; errors show in error-panel.
    let snapshot = null;
    const start = Date.now();
    while (Date.now() - start < 60000) {
      snapshot = await tab.evaluate(`(() => { ${DEEP}
        const err = deep('error-panel');
        const error = err && getComputedStyle(err).display !== 'none' ? [...err.shadowRoot.querySelectorAll(':not(style)')].map((e) => e.children.length ? '' : e.textContent.trim()).filter(Boolean).join(' | ') : '';
        const iframe = deep('svg-preview-pane')?.shadowRoot?.querySelector('iframe');
        const paths = iframe?.contentDocument ? [...iframe.contentDocument.querySelectorAll('#preview-layers path, #preview-path')].filter((p) => (p.getAttribute('d') || '').length > 10).length : 0;
        const squiggles = deepAll('.cm-lintRange-error').length;
        return { paths, squiggles, error };
      })()`);
      if (snapshot.paths >= 3 || snapshot.error) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    // Let a late font-slice recompile settle before judging.
    await new Promise((r) => setTimeout(r, 2000));
    check(`playground compiles: ${name}`, !snapshot.error, snapshot.error.slice(0, 160));
    // One <path> per layer, so a handful means the drawing rendered.
    check(`playground draws: ${name}`, snapshot.paths >= 3, `${snapshot.paths} layer paths`);
    check(`no error squiggles: ${name}`, snapshot.squiggles === 0, `${snapshot.squiggles}`);
    await tab.screenshot({ path: new URL(`./previews/playground-${name}.png`, import.meta.url).pathname });
    await tab.close();
  }
} finally {
  await browser.close();
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);

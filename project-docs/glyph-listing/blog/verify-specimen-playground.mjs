// The specimen with Google Fonts families the CLI doesn't have locally —
// wide faces, a capitals-only face, a CJK face — rendered in the playground.
// Screenshots of the preview go to previews/playground-specimen-<slug>.png.
//   node project-docs/glyph-listing/blog/verify-specimen-playground.mjs
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:3000';
const FAMILIES = ['Unbounded', 'Syncopate', 'Bebas Neue', 'Playfair Display', 'Noto Sans SC', 'Roboto'];
const sample = readFileSync(new URL('../../../website/blog/samples/post57/05-specimen.pathogen', import.meta.url), 'utf8');
const DEEP = `const deep = (sel, root = document) => { const f = root.querySelector(sel); if (f) return f; for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) { const r = deep(sel, el.shadowRoot); if (r) return r; } } return null; };`;

let failures = 0;
for (const family of FAMILIES) {
  const code = sample.replace(/let family = ['"]Raleway['"];/, `let family = '${family}';`);
  const slug = family.toLowerCase().replace(/\s+/g, '-');
  const browser = await puppeteer.launch({ headless: 'shell' });
  const tab = await browser.newPage();
  await tab.setViewport({ width: 1400, height: 1000 });
  tab.on('dialog', (d) => d.dismiss());
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
  // Whole-font loads (Font.info) can take a while for a CJK family.
  let state = { error: '', ink: 0 };
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    state = await tab.evaluate(`(() => { ${DEEP}
      const err = deep('error-panel');
      const error = err && getComputedStyle(err).display !== 'none' ? [...err.shadowRoot.querySelectorAll(':not(style)')].map((e) => e.children.length ? '' : e.textContent.trim()).filter(Boolean).join(' | ') : '';
      const iframe = deep('svg-preview-pane')?.shadowRoot?.querySelector('iframe');
      // Longest layer path: the glyph ink dwarfs every other layer.
      const ink = iframe?.contentDocument ? Math.max(0, ...[...iframe.contentDocument.querySelectorAll('#preview-layers path')].map((p) => (p.getAttribute('d') || '').length)) : 0;
      return { error, ink };
    })()`);
    if (state.error || state.ink > 1000) break;
  }
  await new Promise((r) => setTimeout(r, 3000));
  const pane = await tab.evaluateHandle(`(() => { ${DEEP} return deep('svg-preview-pane'); })()`);
  await pane.asElement()?.screenshot({ path: new URL(`./previews/playground-specimen-${slug}.png`, import.meta.url).pathname });
  const ok = !state.error && state.ink > 1000;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${family}${state.error ? ` — ${state.error.slice(0, 160)}` : ''} (ink path ${state.ink} chars)`);
  await browser.close();
}
process.exit(failures ? 1 : 0);

// What do Google-served fonts report as family / style / fullName / weight?
//   node project-docs/glyph-listing/blog/probes/playground-identity.mjs
import puppeteer from 'puppeteer';

const DEEP = `const deep = (sel, root = document) => { const f = root.querySelector(sel); if (f) return f; for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) { const r = deep(sel, el.shadowRoot); if (r) return r; } } return null; };`;
const cases = [
  ['Raleway', 700],
  ['Raleway', 400],
  ['Playfair Display', 700],
  ['Bebas Neue', 700],
];
for (const [family, weight] of cases) {
  const code = `@font "${family}" ${weight};\nlet info = Font.info(#{ font-family: "${family}"; font-weight: ${weight}; });\nlog("id", info.family, "|", info.style, "|", info.fullName, "|", info.weight);\n`;
  const browser = await puppeteer.launch({ headless: 'shell' });
  const page = await browser.newPage();
  page.on('dialog', (d) => d.dismiss());
  const state = Buffer.from(encodeURIComponent(JSON.stringify({ code }))).toString('base64');
  try {
    await page.goto(`http://localhost:3000/workspace/scratch?state=${state}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch {}
  let line = '';
  for (let i = 0; i < 60 && !line; i++) {
    await new Promise((r) => setTimeout(r, 500));
    line = await page.evaluate(`(() => { ${DEEP} return (deep('console-pane')?.logs ?? []).map((l) => (l.parts ?? []).map((p) => p.value ?? '').join(' ')).find((s) => s.startsWith('id')) || ''; })()`);
  }
  console.log(`${family} ${weight}: ${line || '(no log)'}`);
  await browser.close();
}

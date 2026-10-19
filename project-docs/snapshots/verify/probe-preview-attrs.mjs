import puppeteer from 'puppeteer';
const state = Buffer.from(encodeURIComponent(JSON.stringify({ code: 'define ViewBox(0, 0, 400, 400);\ncircle(200, 200, 150);\n' }))).toString('base64');
const browser = await puppeteer.launch({ headless: 'shell' });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
page.on('dialog', (d) => d.dismiss());
try { await page.goto(`http://localhost:3000/workspace/scratch?state=${state}`, { waitUntil: 'domcontentloaded', timeout: 20000 }); } catch {}
const DEEP = `const deep = (sel, root = document) => { const f = root.querySelector(sel); if (f) return f; for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) { const r = deep(sel, el.shadowRoot); if (r) return r; } } return null; };`;
for (let i = 0; i < 60; i++) {
  const r = await page.evaluate(`(() => { ${DEEP} const pane = deep('svg-preview-pane'); const svg = pane && pane.preview; if (!svg || svg.getAttribute('width') === '200') return null; return { width: svg.getAttribute('width'), height: svg.getAttribute('height'), viewBox: svg.getAttribute('viewBox'), style: svg.getAttribute('style'), bg: svg.querySelector('#preview-bg')?.outerHTML.slice(0,160), firstPath: svg.querySelector('path:not(#grid-path)')?.getAttribute('d')?.slice(0,80), groups: [...svg.children].map(c => c.tagName + (c.id ? '#' + c.id : '') + (c.getAttribute('transform') ? '[' + c.getAttribute('transform') + ']' : '')).join(' ') }; })()`);
  if (r) { console.log(JSON.stringify(r, null, 1)); break; }
  await new Promise((res) => setTimeout(res, 250));
}
await browser.close();

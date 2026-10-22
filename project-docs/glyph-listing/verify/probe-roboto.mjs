import puppeteer from 'puppeteer';
const code = process.argv[2];
const browser = await puppeteer.launch({ headless: 'shell' });
const page = await browser.newPage();
page.on('dialog', (d) => d.dismiss());
page.on('console', (m) => { if (/pathogen|font|Font/i.test(m.text())) console.log('[console]', m.text().slice(0, 200)); });
const state = Buffer.from(encodeURIComponent(JSON.stringify({ code }))).toString('base64');
try { await page.goto(`http://localhost:3000/workspace/scratch?state=${state}`, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch {}
await new Promise((r) => setTimeout(r, 12000));
const DEEP = `const deep = (sel, root = document) => { const f = root.querySelector(sel); if (f) return f; for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) { const r = deep(sel, el.shadowRoot); if (r) return r; } } return null; };`;
console.log(await page.evaluate(`(() => { ${DEEP} const pane = deep('console-pane'); const logs = (pane?.logs ?? []).map((l) => (l.parts ?? []).map((p) => p.value ?? '').join(' ')); const err = deep('error-panel'); return JSON.stringify({ logs, err: err && getComputedStyle(err).display !== 'none' ? err.shadowRoot.textContent.replace(/\\s+/g,' ').slice(-200) : '' }); })()`));
await browser.close();

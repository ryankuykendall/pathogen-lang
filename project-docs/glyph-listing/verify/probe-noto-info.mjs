import puppeteer from 'puppeteer';
const code = `@font "Noto Sans SC";\nlet styles = #{ font-family: "Noto Sans SC"; };\nlet info = Font.info(styles);\nlog("chars", info.characterCount);\nfor (script in info.scripts) { log("script", script.name, script.count); }\n`;
const browser = await puppeteer.launch({ headless: 'shell' });
const page = await browser.newPage();
page.on('dialog', (d) => d.dismiss());
let gstatic = 0, failed = 0;
page.on('requestfinished', (r) => { if (r.url().includes('gstatic')) gstatic++; });
page.on('requestfailed', (r) => { if (r.url().includes('gstatic')) failed++; });
const state = Buffer.from(encodeURIComponent(JSON.stringify({ code }))).toString('base64');
try { await page.goto(`http://localhost:3000/workspace/scratch?state=${state}`, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch {}
await new Promise((r) => setTimeout(r, 15000));
const DEEP = `const deep = (sel, root = document) => { const f = root.querySelector(sel); if (f) return f; for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) { const r = deep(sel, el.shadowRoot); if (r) return r; } } return null; };`;
console.log(await page.evaluate(`(() => { ${DEEP} return JSON.stringify({ logs: (deep('console-pane')?.logs ?? []).slice(0, 8).map((l) => (l.parts ?? []).map((p) => p.value ?? '').join(' ')), banner: deep('#font-warning')?.textContent.replace(/\\s+/g, ' ').trim() }); })()`));
console.log('gstatic finished', gstatic, 'failed', failed);
await browser.close();

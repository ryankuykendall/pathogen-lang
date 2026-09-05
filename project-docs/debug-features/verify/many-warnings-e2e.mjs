// Repro for the 2026-09-05 report: a program that emits thousands of
// corner-op warnings at ONE source position compiled fine but the playground
// showed "Maximum call stack size exceeded" and no layers.
import puppeteer from 'puppeteer';
const outDir = process.argv[2] ?? '.';
const reps = Number(process.argv[3] ?? 1500);
const code = `let plate = @{\n  h 40\n  v 40\n  h -40\n  z\n};\nfor (i in 1..${reps}) {\n  let soft = plate.fillet(30);\n}\nM 10 10\nplate.draw();`;
const state = Buffer.from(encodeURIComponent(JSON.stringify({ code }))).toString('base64');
const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox'], protocolTimeout: 180000 });
const page = await browser.newPage();
page.on('dialog', (d) => d.dismiss());
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') consoleErrors.push(m.text().slice(0, 200)); });
await page.setViewport({ width: 1400, height: 900 });
try {
  await page.goto(`http://localhost:3000/workspace/scratch?state=${encodeURIComponent(state)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
} catch (e) { console.log('goto:', e.message.split('\n')[0]); }
const probe = `(() => {
  const walk = (root, sel, out) => { for (const el of root.querySelectorAll('*')) { if (el.matches(sel)) out.push(el); if (el.shadowRoot) walk(el.shadowRoot, sel, out); } return out; };
  const panel = walk(document, 'error-panel', [])[0];
  const errText = panel ? (panel.shadowRoot?.textContent ?? panel.textContent ?? '').replace(/\\s+/g, ' ').trim().slice(0, 160) : null;
  const errVisible = panel ? !panel.hidden && getComputedStyle(panel).display !== 'none' : false;
  const warnChars = walk(document, '.cm-warning-char', []).length;
  const paths = walk(document, 'svg path', []).length;
  const entries = walk(document, 'log-entry', []).length;
  const loading = walk(document, '.loading, .loading-overlay', []).filter((e) => getComputedStyle(e).display !== 'none').length;
  const status = walk(document, 'app-breadcrumb', [])[0]?.shadowRoot?.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 80) ?? null;
  return { errVisible, errText: errVisible ? errText : null, warnChars, paths, entries, loading, status };
})()`;
let found = null;
const t0 = Date.now();
await new Promise((r) => setTimeout(r, Number(process.argv[4] ?? 15000)));
for (let i = 0; i < 240; i++) {
  found = await page.evaluate(probe);
  if (found.errVisible || found.warnChars > 0) break;
  await new Promise((r) => setTimeout(r, 500));
}
// Open the console pane: warning mirrors that differ only in numbers collapse
// to one row per family with a ×N chip (expected: 2 rows at any rep count).
await page.evaluate(`(() => {
  const walk = (root, sel, out) => { for (const el of root.querySelectorAll('*')) { if (el.matches(sel)) out.push(el); if (el.shadowRoot) walk(el.shadowRoot, sel, out); } return out; };
  walk(document, 'console-pane', [])[0]?.open();
})()`);
await new Promise((r) => setTimeout(r, 1000));
const consoleProbe = `(() => {
  const walk = (root, sel, out) => { for (const el of root.querySelectorAll('*')) { if (el.matches(sel)) out.push(el); if (el.shadowRoot) walk(el.shadowRoot, sel, out); } return out; };
  const pane = walk(document, 'console-pane', [])[0];
  if (!pane) return { pane: false };
  const rows = Array.from(pane.shadowRoot.querySelectorAll('log-entry'));
  const chips = rows.map((r) => r.shadowRoot?.querySelector('.count')?.textContent ?? null);
  const text = rows.map((r) => (r.shadowRoot?.textContent ?? '').replace(/\\s+/g, ' ').trim().slice(0, 90));
  const first = rows[0]?.shadowRoot?.querySelector('.count');
  first?.click();
  const instances = rows[0]?.shadowRoot?.querySelectorAll('.instance').length ?? 0;
  const more = rows[0]?.shadowRoot?.querySelector('.more')?.textContent ?? null;
  return { pane: true, rawLogs: pane.logs.length, rows: rows.length, chips, text, instances, more };
})()`;
const consoleFound = await page.evaluate(consoleProbe);
console.log(JSON.stringify({ reps, secs: Math.round((Date.now() - t0) / 1000), ...found, console: consoleFound, pageErrors: pageErrors.slice(0, 3), consoleErrors: consoleErrors.slice(0, 5) }));
await browser.close();

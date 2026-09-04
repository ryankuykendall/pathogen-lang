// Verifies the three-surface parity claim in docs/debug.md: a compiler warning
// shows as a warn chip in the console pane AND a yellow squiggle in the editor.
import puppeteer from 'puppeteer';
const outDir = process.argv[2] ?? '.';
const code = "let plate = @{\n  h 40\n  v 40\n  h -40\n  z\n};\nlet soft = plate.fillet(30);\nM 10 10\nsoft.draw();";
const state = Buffer.from(encodeURIComponent(JSON.stringify({ code }))).toString('base64');
const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox'], protocolTimeout: 30000 });
const page = await browser.newPage();
page.on('dialog', (d) => d.dismiss());
await page.setViewport({ width: 1400, height: 900 });
try {
  await page.goto(`http://localhost:3000/workspace/scratch?state=${encodeURIComponent(state)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
} catch (e) { console.log('goto:', e.message.split('\n')[0]); }
const probe = `(() => {
  const walk = (root, sel, out) => { for (const el of root.querySelectorAll('*')) { if (el.matches(sel)) out.push(el); if (el.shadowRoot) walk(el.shadowRoot, sel, out); } return out; };
  const warnChars = walk(document, '.cm-warning-char', []).length;
  const warnLines = walk(document, '.cm-warning-line', []).length;
  const errorChars = walk(document, '.cm-error-char', []).length;
  const chips = walk(document, '.log-severity-warn, .warn-chip, .severity-warn', []).length;
  const consoleText = walk(document, 'console-pane', []).map((c) => c.shadowRoot?.textContent ?? '').join(' ');
  const warnText = /Fillet radius clamped/.test(consoleText);
  const cmContent = walk(document, '.cm-content', [])[0];
  return { warnChars, warnLines, errorChars, chips, warnText, editorReady: !!cmContent };
})()`;
let found = null;
for (let i = 0; i < 80; i++) {
  found = await page.evaluate(probe);
  if (found.warnChars > 0 && found.warnText) break;
  await new Promise((r) => setTimeout(r, 500));
}
console.log(JSON.stringify(found));
// Open the console pane and look for the warn chip on the mirrored log entry.
await page.evaluate(`(() => {
  const walk = (root, out) => { for (const el of root.querySelectorAll('button')) { if (el.textContent.trim() === 'Console') out.push(el); if (el.shadowRoot) walk(el.shadowRoot, out); } for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) walk(el.shadowRoot, out); } return out; };
  const btn = walk(document, [])[0]; if (btn) btn.click(); return !!btn;
})()`);
let chip = null;
for (let i = 0; i < 20; i++) {
  chip = await page.evaluate(`(() => {
    const walk = (root, sel, out) => { for (const el of root.querySelectorAll('*')) { if (el.matches(sel)) out.push(el); if (el.shadowRoot) walk(el.shadowRoot, sel, out); } return out; };
    const entries = walk(document, 'log-entry', []);
    const warnEntries = entries.filter((e) => e.classList.contains('warn'));
    const chips = warnEntries.map((e) => e.shadowRoot?.querySelector('.chip')?.textContent ?? null);
    const texts = warnEntries.map((e) => (e.shadowRoot?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 90));
    return { entries: entries.length, warnEntries: warnEntries.length, chips, texts };
  })()`);
  if (chip.warnEntries > 0) break;
  await new Promise((r) => setTimeout(r, 500));
}
console.log(JSON.stringify(chip));
try { await page.screenshot({ path: `${outDir}/squiggle-e2e.png` }); await page.screenshot({ path: 'project-docs/debug-features/verify/squiggle-e2e.png' }); console.log('screenshot written'); } catch (e) { console.log('screenshot:', e.message.split('\n')[0]); }
await browser.close();

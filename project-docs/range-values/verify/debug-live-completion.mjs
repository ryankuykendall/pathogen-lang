// Debug aid: why does the live editor popup differ from getCompletions()?
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
const code = readFileSync('project-docs/range-values/demo.pathogen', 'utf8');
const WALK = `
  function walkAll(root, sel, out) {
    for (const el of root.querySelectorAll(sel)) out.push(el);
    for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) walkAll(el.shadowRoot, sel, out); }
    return out;
  }`;
const browser = await puppeteer.launch({ headless: 'shell' });
const page = await browser.newPage();
page.on('dialog', (d) => { d.dismiss().catch(() => {}); });
const state = Buffer.from(encodeURIComponent(JSON.stringify({ code }))).toString('base64');
try { await page.goto(`http://localhost:3000/workspace/scratch?state=${encodeURIComponent(state)}`, { waitUntil: 'domcontentloaded', timeout: 20000 }); } catch {}
for (let i = 0; i < 120; i++) { if (await page.evaluate(`(() => { ${WALK} return walkAll(document, '.cm-content', []).length > 0; })()`)) break; await new Promise((r) => setTimeout(r, 250)); }
await page.evaluate(`(() => { ${WALK} walkAll(document, '.cm-content', [])[0].focus(); })()`);
await page.keyboard.down('Meta'); await page.keyboard.press('End'); await page.keyboard.up('Meta');
await page.keyboard.press('Enter');
const snap = async (label) => {
  const out = await page.evaluate(`(() => { ${WALK}
    const content = walkAll(document, '.cm-content', [])[0];
    const lines = Array.from(content.querySelectorAll('.cm-line')).map((l) => l.textContent || '');
    const text = lines.join('\\n');
    const L = window.PathogenLang;
    const items = L.getCompletions(new L.StringTextDocument(text), { line: lines.length - 1, character: lines[lines.length - 1].length }).map((c) => c.label);
    const popup = walkAll(document, '.cm-tooltip-autocomplete li', []).map((li) => li.textContent || '');
    let real = null, realItems = null, head = null;
    try {
      const view = content.cmView && (content.cmView.view || (content.cmView.rootView && content.cmView.rootView.view));
      if (view) {
        real = view.state.doc.toString();
        head = view.state.selection.main.head;
        const before = real.slice(0, head).split('\\n');
        realItems = L.getCompletions(new L.StringTextDocument(real), { line: before.length - 1, character: before[before.length - 1].length }).map((c) => c.label).slice(0, 4);
      }
    } catch (e) { real = 'ERR ' + e.message; }
    return { last: lines[lines.length - 1], service: items.slice(0, 3), popup: popup.slice(0, 3).map((t) => t.slice(0, 12)), popupCount: popup.length,
             realTail: real && JSON.stringify(real.slice(-30)), afterHead: real && JSON.stringify(real.slice(head, head + 5)), realItems };
  })()`);
  console.log(label, JSON.stringify(out));
};
const clearLine = async () => {
  await page.keyboard.down('Meta'); await page.keyboard.press('Backspace'); await page.keyboard.up('Meta');
  await page.keyboard.press('Escape');
};
for (const receiver of ['columns.', '(1..100).']) {
  await page.keyboard.type(receiver, { delay: 30 });
  await new Promise((r) => setTimeout(r, 1000));
  await snap(`after ${JSON.stringify(receiver)}:`);
  await clearLine();
  await new Promise((r) => setTimeout(r, 300));
}
await browser.close();

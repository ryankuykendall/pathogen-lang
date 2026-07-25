// Follow-up verification: span-level tokenization inside ${ }, completion
// popup after `filter: `, and the comma-form error panel.
import puppeteer from 'puppeteer';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = (code) => encodeURIComponent(Buffer.from(encodeURIComponent(JSON.stringify({ code }))).toString('base64'));

const GOOD = [
  "let grain = NoiseFilter() {|f| f.style = NoiseFilterStyle.Grain; };",
  "define PathLayer('a') ${",
  '  fill: #eaaa;',
  '  filter: drop-shadow(4px 4px 4px #c00);',
  '}',
  "layer('a').apply { M 10 10 L 90 90 }",
].join('\n');

const COMMA = [
  "define PathLayer('a') ${",
  '  filter: drop-shadow(4px, 4px, 4px, #c00);',
  '}',
  "layer('a').apply { M 10 10 }",
].join('\n');

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
page.on('dialog', (d) => d.dismiss().catch(() => {}));
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const ws = () => document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');

async function open(code) {
  await page.goto(`http://localhost:3000/pathogen/workspace/scratch?state=${enc(code)}`, { waitUntil: 'networkidle2', timeout: 60000 });
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(() => {
      const w = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
      const cm = w?.shadowRoot?.querySelector('code-editor-pane')?.shadowRoot?.querySelector('.cm-content');
      return Boolean(cm?.textContent?.includes('filter'));
    });
    if (ok) return true;
    await sleep(500);
  }
  return false;
}

try {
  // ── 1. Tokenization detail on the good program ──
  console.log('open-good:', await open(GOOD));
  const spans = await page.evaluate(() => {
    const w = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
    const root = w.shadowRoot.querySelector('code-editor-pane').shadowRoot;
    const line = [...root.querySelectorAll('.cm-line')].find((l) => l.textContent.includes('drop-shadow'));
    return [...line.childNodes].map((n) => ({
      text: (n.textContent ?? '').slice(0, 24),
      cls: n.nodeType === 1 ? n.className || n.tagName.toLowerCase() : '(text)',
    }));
  });
  console.log('drop-shadow-line-spans:', JSON.stringify(spans));

  // ── 2. Completions after `filter: ` (fresh line in the style block) ──
  const compl = await page.evaluate(async () => {
    const w = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
    const pane = w.shadowRoot.querySelector('code-editor-pane');
    const view = pane._editor;
    if (!view) return { ok: false, reason: 'no _editor' };
    const doc = view.state.doc.toString();
    // Insert a new declaration line after `fill: #eaaa;` and put cursor after `filter: `
    const anchor = doc.indexOf('  fill: #eaaa;') + '  fill: #eaaa;'.length;
    view.dispatch({ changes: { from: anchor, insert: '\n  filter: ' }, selection: { anchor: anchor + '\n  filter: '.length } });
    view.focus();
    return { ok: true };
  });
  console.log('insert-filter-line:', JSON.stringify(compl));
  await sleep(400);
  await page.keyboard.down('Control');
  await page.keyboard.press('Space');
  await page.keyboard.up('Control');
  await sleep(1000);
  const items = await page.evaluate(() => {
    const w = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
    const root = w.shadowRoot.querySelector('code-editor-pane').shadowRoot;
    const opts = root.querySelectorAll('.cm-tooltip-autocomplete li[role=option], .cm-tooltip-autocomplete .cm-completionLabel');
    return [...opts].map((o) => o.textContent.trim()).slice(0, 20);
  });
  console.log('filter-value-completions:', JSON.stringify(items));

  // ── 3. Comma form shows the compile error ──
  console.log('open-comma:', await open(COMMA));
  await sleep(1200);
  const err = await page.evaluate(() => {
    const w = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
    const panel = w.shadowRoot.querySelector('error-panel');
    const host = panel?.shadowRoot?.host;
    const style = host ? getComputedStyle(host) : null;
    const msg = panel?.shadowRoot?.querySelector('.message, .error-message, [class*=message]')?.textContent
      ?? panel?.shadowRoot?.textContent ?? '';
    return { visible: style ? style.display !== 'none' : false, msg: msg.replace(/\s+/g, ' ').slice(0, 200) };
  });
  console.log('comma-error-panel:', JSON.stringify(err));
  console.log('page-errors:', JSON.stringify(errors.slice(0, 5)));
} finally {
  await browser.close();
}

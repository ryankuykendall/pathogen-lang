// Round 3: prefix-narrowed completions after `filter: dro` and the real
// comma-form error message text.
import puppeteer from 'puppeteer';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = (code) => encodeURIComponent(Buffer.from(encodeURIComponent(JSON.stringify({ code }))).toString('base64'));

const GOOD = ["define PathLayer('a') ${", '  fill: #eaaa;', '}', "layer('a').apply { M 10 10 }"].join('\n');
const COMMA = ["define PathLayer('a') ${", '  filter: drop-shadow(4px, 4px, 4px, #c00);', '}', "layer('a').apply { M 10 10 }"].join('\n');

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
page.on('dialog', (d) => d.dismiss().catch(() => {}));

async function open(code, waitText) {
  await page.goto(`http://localhost:3000/pathogen/workspace/scratch?state=${enc(code)}`, { waitUntil: 'networkidle2', timeout: 60000 });
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate((t) => {
      const w = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
      return Boolean(w?.shadowRoot?.querySelector('code-editor-pane')?.shadowRoot?.querySelector('.cm-content')?.textContent?.includes(t));
    }, waitText);
    if (ok) return true;
    await sleep(500);
  }
  return false;
}

try {
  console.log('open-good:', await open(GOOD, 'fill'));
  await page.evaluate(() => {
    const w = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
    const view = w.shadowRoot.querySelector('code-editor-pane')._editor;
    const doc = view.state.doc.toString();
    const anchor = doc.indexOf('  fill: #eaaa;') + '  fill: #eaaa;'.length;
    view.dispatch({ changes: { from: anchor, insert: '\n  filter: dro' }, selection: { anchor: anchor + '\n  filter: dro'.length } });
    view.focus();
  });
  await sleep(300);
  await page.keyboard.down('Control');
  await page.keyboard.press('Space');
  await page.keyboard.up('Control');
  await sleep(1000);
  const dropItems = await page.evaluate(() => {
    const w = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
    const root = w.shadowRoot.querySelector('code-editor-pane').shadowRoot;
    return [...root.querySelectorAll('.cm-tooltip-autocomplete li[role=option]')].map((o) => o.textContent.trim());
  });
  console.log('completions-for-dro:', JSON.stringify(dropItems));

  // Accept the first completion and inspect the inserted text.
  await page.keyboard.press('Enter');
  await sleep(300);
  const lineAfter = await page.evaluate(() => {
    const w = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
    const view = w.shadowRoot.querySelector('code-editor-pane')._editor;
    const doc = view.state.doc.toString();
    return doc.split('\n').find((l) => l.includes('filter:'));
  });
  console.log('accepted-line:', JSON.stringify(lineAfter));

  console.log('open-comma:', await open(COMMA, 'drop-shadow'));
  await sleep(1500);
  const err = await page.evaluate(() => {
    const w = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
    const panel = w.shadowRoot.querySelector('error-panel');
    const els = [...(panel?.shadowRoot?.querySelectorAll('*') ?? [])].filter((e) => e.tagName !== 'STYLE');
    const texts = els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    return texts.sort((a, b) => a.length - b.length)[0] ?? '(none)';
  });
  console.log('comma-error-message:', JSON.stringify(err));
} finally {
  await browser.close();
}

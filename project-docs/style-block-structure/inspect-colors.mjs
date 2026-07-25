// Inspect computed token colors in the playground editor for both themes.
// Usage: node inspect-colors.mjs   (dev server must be on :3000)
import puppeteer from 'puppeteer';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = (code) => encodeURIComponent(Buffer.from(encodeURIComponent(JSON.stringify({ code }))).toString('base64'));

const CODE = [
  'let mainColor = oklch(0.65 0.2 30);',
  "define PathLayer('a') ${",
  '  fill: mainColor;',
  '  stroke-width: 4;',
  '  filter: drop-shadow(4px 4px 4px black) blur(2px);',
  '  text-anchor: middle;',
  '}',
  "layer('a').apply { M 10 10 L 90 90 }",
].join('\n');

async function probe(page, theme) {
  await page.evaluateOnNewDocument((t) => {
    try { localStorage.setItem('pathogen-theme', t); } catch {}
  }, theme);
  await page.goto(`http://localhost:3000/pathogen/workspace/scratch?state=${enc(CODE)}`, { waitUntil: 'networkidle2', timeout: 60000 });
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(() => {
      const w = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
      return Boolean(w?.shadowRoot?.querySelector('code-editor-pane')?.shadowRoot?.querySelector('.cm-content')?.textContent?.includes('drop-shadow'));
    });
    if (ok) break;
    await sleep(500);
  }
  return page.evaluate(() => {
    const w = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
    const root = w.shadowRoot.querySelector('code-editor-pane').shadowRoot;
    const colorOf = (needle) => {
      for (const line of root.querySelectorAll('.cm-line')) {
        for (const span of line.querySelectorAll('span')) {
          if (span.textContent === needle) {
            return getComputedStyle(span).color;
          }
        }
        // uncolored tokens are bare text nodes — report null by finding the line
      }
      return null;
    };
    return {
      'outer-var-def (mainColor)': colorOf('mainColor'),
      'property (fill)': colorOf('fill'),
      'property (stroke-width)': colorOf('stroke-width'),
      'value-ident (mainColor ref)': null, // same text; see below
      'value-ident (middle)': colorOf('middle'),
      'value-ident (black)': null, // chip may wrap it; check separately
      'number (4px)': colorOf('4px'),
      'number (4)': colorOf('4'),
      'fn-name (drop-shadow)': colorOf('drop-shadow'),
      'fn-name (blur)': colorOf('blur'),
      'outer-keyword (let)': colorOf('let'),
    };
  });
}

const browser = await puppeteer.launch({ headless: 'new' });
try {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage();
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    const res = await probe(page, theme);
    console.log(`=== ${theme} ===`);
    for (const [k, v] of Object.entries(res)) console.log(' ', k, '→', v);
    await page.close();
  }
} finally {
  await browser.close();
}

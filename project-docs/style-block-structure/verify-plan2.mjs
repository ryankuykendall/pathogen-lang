// PLAN-2 verification: scope-aware recolor, chip exclusion, Member values.
// Per project-docs/style-block-structure/PLAN-2.md Verification section.
import puppeteer from 'puppeteer';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = (code) => encodeURIComponent(Buffer.from(encodeURIComponent(JSON.stringify({ code }))).toString('base64'));

const CODE = [
  'let c = oklch(0.63 0.24 30);',
  'let tomato = oklch(0.7 0.2 40);',
  'let s = ${',
  '  stroke: c;',
  '  filter: drop-shadow(1px 1px c);',
  '  fill: c.alpha(40%);',
  '  stop-color: tomato;',
  '  flood-color: salmon;',
  '  stroke-width: .5;',
  '  text-anchor: middle;',
  '};',
  'M 10 10 L 90 90',
].join('\n');

async function inspect(page, theme) {
  await page.evaluateOnNewDocument((t) => {
    try { localStorage.setItem('pathogen-theme', t); localStorage.setItem('pathogen-user-id', 'verify-plan2'); } catch {}
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
  await sleep(800);
  return page.evaluate(() => {
    const w = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
    const root = w.shadowRoot.querySelector('code-editor-pane').shadowRoot;
    const lines = [...root.querySelectorAll('.cm-line')];
    const spanColor = (lineNeedle, spanText) => {
      const line = lines.find((l) => l.textContent.includes(lineNeedle));
      if (!line) return 'LINE-NOT-FOUND';
      for (const span of line.querySelectorAll('span')) {
        if (span.textContent === spanText) return getComputedStyle(span).color;
      }
      return null; // plain text (default color)
    };
    return {
      'outer c (decl line)': spanColor('let c =', 'c'),
      'stroke: c value': spanColor('stroke: c', 'c'),
      'drop-shadow arg c': spanColor('drop-shadow', 'c'),
      'member head c (fill line)': spanColor('c.alpha', 'c'),
      'declared tomato value': spanColor('stop-color', 'tomato'),
      'undeclared salmon value': spanColor('flood-color', 'salmon'),
      'CSS keyword middle': spanColor('text-anchor', 'middle'),
      'member .alpha call': spanColor('c.alpha', 'alpha'),
      chips: [...root.querySelectorAll('color-input')].map((ch) => ch.closest('.cm-line')?.textContent?.trim().slice(0, 40) ?? '?'),
      errorHidden: (() => {
        const p = w.shadowRoot.querySelector('error-panel');
        return p ? getComputedStyle(p).display === 'none' : true;
      })(),
    };
  });
}

const browser = await puppeteer.launch({ headless: 'new' });
try {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage();
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    const res = await inspect(page, theme);
    console.log(`=== ${theme} ===`);
    for (const [k, v] of Object.entries(res)) console.log(' ', k, '→', Array.isArray(v) ? JSON.stringify(v) : v);
    await page.close();
  }
} finally {
  await browser.close();
}

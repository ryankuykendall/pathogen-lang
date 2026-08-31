import puppeteer from 'puppeteer';
const CODE = 'define ViewBox(0, 0, 200, 200);\nfor (i in 1..8) {\n  let px = randomRange(20, 180);\n  let py = randomRange(20, 180);\n  circle(px, py, 8);\n}';
const state = Buffer.from(encodeURIComponent(JSON.stringify({ code: CODE }))).toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PANE = `document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view')?.shadowRoot?.querySelector('svg-preview-pane')`;
const browser = await puppeteer.launch({ headless: 'new' });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1000 });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('pathogen-user-id', 'verify-agent-anon'); } catch {} });
  await page.goto(`https://pathogen.studio/pathogen/workspace/scratch?state=${encodeURIComponent(state)}`, { waitUntil: 'networkidle2', timeout: 60000 });
  let ok = false;
  for (let i = 0; i < 40 && !ok; i++) {
    ok = await page.evaluate(`(() => { const p = ${PANE}; const d = p?.shadowRoot?.querySelector('#preview-frame')?.contentDocument; return Boolean(d?.querySelector('svg')?.innerHTML.includes('<path')); })()`);
    if (!ok) await sleep(500);
  }
  console.log(`${ok ? 'PASS' : 'FAIL'}  prod compile`);
  await page.evaluate(`${PANE}.shadowRoot.querySelector('#fullscreen-toggle').click()`);
  await sleep(400);
  const r = await page.evaluate(`(() => { const p = ${PANE}; const s = (id) => { const e = p.shadowRoot.querySelector(id); return e && getComputedStyle(e).display !== 'none'; }; return { fs: p.classList.contains('fullscreen'), exp: s('#export-btn'), ref: s('#refresh-btn') }; })()`);
  console.log(`${r.fs && r.exp && r.ref ? 'PASS' : 'FAIL'}  prod fullscreen chrome (export + refresh visible) — ${JSON.stringify(r)}`);
  const wEditor = await page.evaluate(() => Math.round(document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view')?.shadowRoot?.querySelector('code-editor-pane')?.getBoundingClientRect().width ?? 0));
  console.log(`editor width @1920 (fullscreen active, informational): ${wEditor}px`);
} finally { await browser.close(); }

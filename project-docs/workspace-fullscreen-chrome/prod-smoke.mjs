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

  // Hover fill: opaque 0.9 composite in both themes (color-mix serializes
  // as color(srgb …) in Chrome).
  const hoverCheck = async (label, want) => {
    const r = await page.evaluate(`(() => { const b = ${PANE}.shadowRoot.querySelector('#export-btn').getBoundingClientRect(); return { x: b.x + b.width/2, y: b.y + b.height/2 }; })()`);
    await page.mouse.move(r.x, r.y);
    await sleep(300);
    const bg = await page.evaluate(`getComputedStyle(${PANE}.shadowRoot.querySelector('#export-btn')).backgroundColor`);
    const m = bg.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)\)$/);
    const ok = m && want.every((w, i) => Math.abs(+m[i + 1] * 255 - w) < 2);
    console.log(`${ok ? 'PASS' : 'FAIL'}  prod hover fill ${label} — ${bg}`);
    await page.mouse.move(10, 500);
    await sleep(200);
  };
  await hoverCheck('light', [198, 98, 153]);
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await sleep(300);
  await hoverCheck('dark', [225, 165, 103]);
  await page.emulateMediaFeatures([]);
  await sleep(300);

  // Status chip: click fullscreen refresh, catch the chip mid-cycle.
  await page.evaluate(`${PANE}.shadowRoot.querySelector('#refresh-btn').click()`);
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(`(() => { const el = ${PANE}.shadowRoot.querySelector('#compilation-status'); return el && getComputedStyle(el).display !== 'none' && el.textContent ? el.textContent : null; })()`);
    if (s) seen.add(s);
    await sleep(50);
  }
  console.log(`${seen.size > 0 ? 'PASS' : 'FAIL'}  prod fullscreen status chip — ${[...seen].join(', ') || 'never visible'}`);
} finally { await browser.close(); }

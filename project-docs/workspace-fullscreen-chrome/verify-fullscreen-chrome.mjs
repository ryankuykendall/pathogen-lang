// Verification for the fullscreen refresh/export chrome + wide-screen editor caps.
// Run: node project-docs/workspace-fullscreen-chrome/verify-fullscreen-chrome.mjs
// Requires `npm run dev:website` (or equivalent wrangler pages dev) on :3000.
//
// Checks:
//   1. randomRange program → fullscreen shows export + refresh stacked under
//      the inspector button; refresh recompiles (path data changes); export
//      opens the modal ABOVE the fullscreen pane; ESC closes modal first,
//      second ESC exits fullscreen; buttons hidden outside fullscreen.
//   2. Non-random program → fullscreen shows export but NOT refresh.
//   3. Editor pane width at 1600/1920/2560/3200 → ~50% / ~80ch / ~100ch / ~120ch.
//   4. Screenshots (light + dark, fullscreen chrome) into this directory.
import puppeteer from 'puppeteer';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = dirname(fileURLToPath(import.meta.url));

const RANDOM_CODE = [
  'define ViewBox(0, 0, 200, 200);',
  'for (i in 1..8) {',
  '  let px = randomRange(20, 180);',
  '  let py = randomRange(20, 180);',
  '  circle(px, py, 8);',
  '}',
].join('\n');

const STATIC_CODE = [
  'define ViewBox(0, 0, 200, 200);',
  'circle(100, 100, 50);',
].join('\n');

const urlFor = (code) => {
  const state = Buffer.from(encodeURIComponent(JSON.stringify({ code }))).toString('base64');
  return `http://localhost:3000/pathogen/workspace/scratch?state=${encodeURIComponent(state)}`;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// Evaluate helpers run inside the page (nested shadow roots).
const PANE_PATH = `document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view')?.shadowRoot?.querySelector('svg-preview-pane')`;

async function setupPage(browser, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('pathogen-user-id', 'verify-agent-anon'); } catch {}
  });
  return page;
}

async function waitForCompile(page, needle) {
  for (let i = 0; i < 60; i++) {
    const ok = await page.evaluate((panePath, want) => {
      const pane = eval(panePath);
      const doc = pane?.shadowRoot?.querySelector('#preview-frame')?.contentDocument;
      const svg = doc?.querySelector('svg');
      return Boolean(svg && svg.innerHTML.includes(want));
    }, PANE_PATH, needle);
    if (ok) return true;
    await sleep(500);
  }
  return false;
}

const paneEval = (page, fn) => page.evaluate(`(${fn})(${PANE_PATH})`);

const browser = await puppeteer.launch({ headless: 'new' });
try {
  // ---------- 1. Random program: fullscreen chrome behavior ----------
  let page = await setupPage(browser, { width: 1600, height: 1000 });
  await page.goto(urlFor(RANDOM_CODE), { waitUntil: 'networkidle2', timeout: 60000 });
  check('compile (random program)', await waitForCompile(page, '<path'));

  // Outside fullscreen: export/refresh hidden.
  let vis = await paneEval(page, (pane) => {
    const q = (id) => pane.shadowRoot.querySelector(id);
    const shown = (el) => el && getComputedStyle(el).display !== 'none';
    return { export: shown(q('#export-btn')), refresh: shown(q('#refresh-btn')), inspector: shown(q('#inspector-open-btn')) };
  });
  check('normal mode: export hidden', !vis.export);
  check('normal mode: refresh hidden', !vis.refresh);
  check('normal mode: inspector visible', vis.inspector);

  // Normal mode: the status chip never displays regardless of compile status
  // (breadcrumb owns it there) — display is gated on :host(.fullscreen).
  const chipNormal = await paneEval(page, (pane) => {
    const el = pane.shadowRoot.querySelector('#compilation-status');
    return el ? getComputedStyle(el).display : 'missing';
  });
  check('normal mode: status chip hidden', chipNormal === 'none', chipNormal);

  // Enter fullscreen.
  await paneEval(page, (pane) => pane.shadowRoot.querySelector('#fullscreen-toggle').click());
  await sleep(400);
  const fs1 = await paneEval(page, (pane) => {
    const q = (id) => pane.shadowRoot.querySelector(id);
    const shown = (el) => el && getComputedStyle(el).display !== 'none';
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y) }; };
    return {
      fullscreen: pane.classList.contains('fullscreen'),
      export: shown(q('#export-btn')), refresh: shown(q('#refresh-btn')),
      inspectorBox: box(q('#inspector-open-btn')), exportBox: box(q('#export-btn')), refreshBox: box(q('#refresh-btn')),
    };
  });
  check('fullscreen entered', fs1.fullscreen);
  check('fullscreen: export visible', fs1.export);
  check('fullscreen: refresh visible (uses-random)', fs1.refresh);
  const stacked = fs1.inspectorBox.x === fs1.exportBox.x && fs1.exportBox.x === fs1.refreshBox.x
    && fs1.inspectorBox.y < fs1.exportBox.y && fs1.exportBox.y < fs1.refreshBox.y;
  check('buttons stacked under inspector', stacked, JSON.stringify([fs1.inspectorBox, fs1.exportBox, fs1.refreshBox]));

  // Screenshots: light + dark fullscreen chrome. While dark is emulated,
  // assert the dark hover composite too (the light one is asserted below) —
  // dark is where a color-mix() fallback failure would hide the icon, since
  // dark --bg-elevated equals --accent-contrast.
  await page.screenshot({ path: join(OUT_DIR, 'fullscreen-chrome-light.png') });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await sleep(300);
  const darkRect = await paneEval(page, (pane) => {
    const r = pane.shadowRoot.querySelector('#export-btn').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(darkRect.x, darkRect.y);
  await sleep(300);
  const darkHov = await paneEval(page, (pane) => {
    const cs = getComputedStyle(pane.shadowRoot.querySelector('#export-btn'));
    return { bg: cs.backgroundColor, color: cs.color };
  });
  const darkBg = darkHov.bg.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)\)$/);
  const darkOk = darkBg && Math.abs(+darkBg[1] * 255 - 225) < 2 && Math.abs(+darkBg[2] * 255 - 165) < 2
    && Math.abs(+darkBg[3] * 255 - 103) < 2 && darkHov.color === 'rgb(26, 20, 36)';
  check('dark hover fill opaque + contrast ink', Boolean(darkOk), `bg ${darkHov.bg}, icon ${darkHov.color}`);
  await page.mouse.move(10, 500);
  await sleep(200);
  await page.screenshot({ path: join(OUT_DIR, 'fullscreen-chrome-dark.png') });
  await page.emulateMediaFeatures([]);

  // Refresh regenerates random values.
  const before = await paneEval(page, (pane) =>
    pane.shadowRoot.querySelector('#preview-frame').contentDocument.querySelector('svg').innerHTML);
  await paneEval(page, (pane) => pane.shadowRoot.querySelector('#refresh-btn').click());
  let changed = false;
  for (let i = 0; i < 20 && !changed; i++) {
    await sleep(300);
    const after = await paneEval(page, (pane) =>
      pane.shadowRoot.querySelector('#preview-frame').contentDocument.querySelector('svg').innerHTML);
    changed = after !== before;
  }
  check('refresh regenerates output', changed);

  // Hover fill regression: hovered chrome buttons must be fully opaque
  // (the old --accent-subtle wash was 0.10/0.15 alpha over artwork) with the
  // contrast-flipped icon ink. Real mouse hover; pane is fixed fullscreen so
  // rect coords == viewport coords.
  const exportRect = await paneEval(page, (pane) => {
    const r = pane.shadowRoot.querySelector('#export-btn').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(exportRect.x, exportRect.y);
  await sleep(300);
  const hov = await paneEval(page, (pane) => {
    const cs = getComputedStyle(pane.shadowRoot.querySelector('#export-btn'));
    return { bg: cs.backgroundColor, color: cs.color };
  });
  // color-mix() computes to `color(srgb r g b [/ a])` in Chrome; rgb() elsewhere.
  const parseBg = (s) => {
    let m = s.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/);
    if (m) return { rgb: [+m[1] * 255, +m[2] * 255, +m[3] * 255], a: m[4] === undefined ? 1 : +m[4] };
    m = s.match(/^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/);
    if (m) return { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] };
    return null;
  };
  const bg = parseBg(hov.bg);
  const near = (v, want) => Math.abs(v - want) < 2;
  check('hover fill is opaque (0.9 tint composite)',
    bg !== null && bg.a === 1 && near(bg.rgb[0], 198) && near(bg.rgb[1], 98) && near(bg.rgb[2], 153),
    `bg ${hov.bg}, icon ${hov.color}`);
  check('hover icon uses --accent-contrast ink', hov.color === 'rgb(28, 23, 34)', hov.color);
  await page.mouse.move(10, 500); // un-hover

  // Status chip: a second refresh should surface the top-center chip (some of
  // compiling/rendering/"Ready"; "Ready" persists 1500ms so it's catchable),
  // then it hides again on the completed→idle timeout.
  await paneEval(page, (pane) => pane.shadowRoot.querySelector('#refresh-btn').click());
  const seen = new Set();
  let chipCenter = null;
  for (let i = 0; i < 40; i++) {
    const s = await paneEval(page, (pane) => {
      const el = pane.shadowRoot.querySelector('#compilation-status');
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && el.textContent
        ? { text: el.textContent, mid: Math.round(r.x + r.width / 2), vw: window.innerWidth }
        : null;
    });
    if (s) { seen.add(s.text); chipCenter = s; }
    await sleep(50);
  }
  check('fullscreen refresh shows status chip', seen.size > 0, [...seen].join(', '));
  check('chip centered top', chipCenter !== null && Math.abs(chipCenter.mid - chipCenter.vw / 2) < 10,
    chipCenter ? `mid ${chipCenter.mid} vs ${Math.round(chipCenter.vw / 2)}` : 'never visible');
  await sleep(2000);
  const chipAfter = await paneEval(page, (pane) =>
    getComputedStyle(pane.shadowRoot.querySelector('#compilation-status')).display);
  check('chip hides after completed→idle timeout', chipAfter === 'none', chipAfter);

  // Export opens the modal above the fullscreen pane.
  await paneEval(page, (pane) => pane.shadowRoot.querySelector('#export-btn').click());
  await sleep(600);
  const modal = await page.evaluate(() => {
    const ws = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
    const m = ws?.shadowRoot?.querySelector('export-modal');
    if (!m) return { open: false };
    const cs = getComputedStyle(m);
    return { open: m.classList.contains('open') && cs.display !== 'none', z: cs.zIndex, overlay: m.classList.contains('fullscreen-overlay') };
  });
  check('export modal open in fullscreen', modal.open);
  check('export modal above pane (z-index 10001)', modal.overlay && Number(modal.z) > 9999, `z=${modal.z}`);

  // ESC closes the modal but stays fullscreen; second ESC exits fullscreen.
  await page.keyboard.press('Escape');
  await sleep(400);
  const afterEsc1 = await page.evaluate((panePath) => {
    const ws = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
    const m = ws?.shadowRoot?.querySelector('export-modal');
    const pane = eval(panePath);
    return { modalOpen: m?.classList.contains('open') ?? false, fullscreen: pane.classList.contains('fullscreen') };
  }, PANE_PATH);
  check('ESC closes modal, stays fullscreen', !afterEsc1.modalOpen && afterEsc1.fullscreen, JSON.stringify(afterEsc1));

  await page.keyboard.press('Escape');
  await sleep(400);
  const afterEsc2 = await paneEval(page, (pane) => {
    const q = (id) => pane.shadowRoot.querySelector(id);
    const shown = (el) => el && getComputedStyle(el).display !== 'none';
    return { fullscreen: pane.classList.contains('fullscreen'), export: shown(q('#export-btn')), refresh: shown(q('#refresh-btn')) };
  });
  check('second ESC exits fullscreen', !afterEsc2.fullscreen);
  check('buttons hidden after exit', !afterEsc2.export && !afterEsc2.refresh);

  // Fullscreen + inspector open: the inspector becomes a fixed 280px right-edge
  // overlay at z-index 10000 — the chrome column must shift clear of it.
  await paneEval(page, (pane) => pane.shadowRoot.querySelector('#fullscreen-toggle').click());
  await sleep(400);
  await paneEval(page, (pane) => pane.shadowRoot.querySelector('#inspector-open-btn').click());
  await sleep(600);
  const occl = await page.evaluate((panePath) => {
    const ws = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
    const pane = eval(panePath);
    const inspector = ws?.shadowRoot?.querySelector('inspector-panel');
    const col = pane.shadowRoot.querySelector('#chrome-right').getBoundingClientRect();
    const insp = inspector.getBoundingClientRect();
    const overlap = col.right > insp.left && col.left < insp.right && insp.width > 0;
    return { overlap, colRight: Math.round(col.right), inspLeft: Math.round(insp.left) };
  }, PANE_PATH);
  check('inspector open: chrome column not occluded', !occl.overlap,
    `column right edge ${occl.colRight} vs inspector left ${occl.inspLeft}`);

  // Export must still be clickable in this combined state.
  await paneEval(page, (pane) => pane.shadowRoot.querySelector('#export-btn').click());
  await sleep(600);
  const modalWithInspector = await page.evaluate(() => {
    const ws = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
    return ws?.shadowRoot?.querySelector('export-modal')?.classList.contains('open') ?? false;
  });
  check('export works with inspector open in fullscreen', modalWithInspector);
  await page.keyboard.press('Escape');
  await sleep(300);
  await page.close();

  // ---------- 2. Static program: refresh absent in fullscreen ----------
  page = await setupPage(browser, { width: 1600, height: 1000 });
  await page.goto(urlFor(STATIC_CODE), { waitUntil: 'networkidle2', timeout: 60000 });
  check('compile (static program)', await waitForCompile(page, '<path'));
  await paneEval(page, (pane) => pane.shadowRoot.querySelector('#fullscreen-toggle').click());
  await sleep(400);
  const fs2 = await paneEval(page, (pane) => {
    const q = (id) => pane.shadowRoot.querySelector(id);
    const shown = (el) => el && getComputedStyle(el).display !== 'none';
    return { export: shown(q('#export-btn')), refresh: shown(q('#refresh-btn')) };
  });
  check('static fullscreen: export visible', fs2.export);
  check('static fullscreen: refresh hidden', !fs2.refresh);
  await page.close();

  // ---------- 2b. Error program: chip "Error" + stale badge coexistence ----------
  page = await setupPage(browser, { width: 1600, height: 1000 });
  await page.goto(urlFor('let x = 5\ncircle(100, 100, 50);'), { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(3000); // let the failing compile settle (error state is sticky)
  await paneEval(page, (pane) => pane.shadowRoot.querySelector('#fullscreen-toggle').click());
  await sleep(400);
  const err = await paneEval(page, (pane) => {
    const chip = pane.shadowRoot.querySelector('#compilation-status');
    const badge = pane.shadowRoot.querySelector('#stale-badge');
    const cs = getComputedStyle(chip);
    const bs = getComputedStyle(badge);
    const c = chip.getBoundingClientRect();
    const b = badge.getBoundingClientRect();
    const badgeShown = bs.display !== 'none';
    const overlap = badgeShown && c.bottom > b.top && c.top < b.bottom && c.right > b.left && c.left < b.right;
    return { text: chip.textContent, shown: cs.display !== 'none', badgeShown, overlap,
      chipTop: Math.round(c.top), badgeBottom: Math.round(b.bottom) };
  });
  check('error program: chip shows "Error" in fullscreen', err.shown && err.text === 'Error', JSON.stringify(err));
  if (err.badgeShown) {
    check('error chip does not overlap stale badge', !err.overlap,
      `chip top ${err.chipTop} vs badge bottom ${err.badgeBottom}`);
  } else {
    console.log('NOTE  stale badge not shown for this error state; overlap check skipped');
  }
  await page.close();

  // ---------- 3. Editor width caps ----------
  // ~7px/ch (Inconsolata 14px): 80ch≈560, 100ch≈700, 120ch≈840. Allow slack
  // for font metric differences; the key property is "well below 50%".
  const widthCases = [
    { vw: 1600, expect: 'half', lo: 700, hi: 900 },
    { vw: 1920, expect: '80ch', lo: 480, hi: 640 },
    { vw: 2560, expect: '100ch', lo: 620, hi: 780 },
    { vw: 3200, expect: '120ch', lo: 760, hi: 920 },
  ];
  page = await setupPage(browser, { width: 1600, height: 1000 });
  await page.goto(urlFor(STATIC_CODE), { waitUntil: 'networkidle2', timeout: 60000 });
  await waitForCompile(page, '<path');
  for (const { vw, expect, lo, hi } of widthCases) {
    await page.setViewport({ width: vw, height: 1000 });
    await sleep(400);
    const w = await page.evaluate(() => {
      const ws = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
      const pane = ws?.shadowRoot?.querySelector('code-editor-pane');
      return Math.round(pane.getBoundingClientRect().width);
    });
    check(`editor width @${vw}px (${expect})`, w >= lo && w <= hi, `${w}px (want ${lo}-${hi})`);
  }

  // The ≥1800px rule puts mono/14px on :host so ch resolves correctly. Verify
  // CodeMirror's completion list doesn't visibly change font when it kicks in
  // (its tooltip lives inside .cm-editor, which pins its own fonts).
  const completionFontAt = async (vw) => {
    await page.setViewport({ width: vw, height: 1000 });
    await sleep(400);
    return page.evaluate(() => {
      const ws = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
      const root = ws?.shadowRoot?.querySelector('code-editor-pane')?.shadowRoot;
      const view = root?.querySelector('.cm-content')?.cmView?.view
        ?? root?.querySelector('.cm-editor')?.querySelector('.cm-content')?.cmView?.view;
      const cm = root?.querySelector('.cm-content');
      if (!cm) return null;
      cm.focus();
      document.execCommand?.('selectAll');
      document.execCommand?.('delete');
      document.execCommand?.('insertText', false, 'cir');
      return new Promise((resolve) => setTimeout(() => {
        const label = root.querySelector('.cm-tooltip-autocomplete .cm-completionLabel');
        if (!label) return resolve({ shown: false });
        const cs = getComputedStyle(label);
        resolve({ shown: true, family: cs.fontFamily, size: cs.fontSize });
      }, 800));
    });
  };
  const fontNarrow = await completionFontAt(1600);
  const fontWide = await completionFontAt(1900);
  if (fontNarrow?.shown && fontWide?.shown) {
    check('completion font stable across 1800px breakpoint',
      fontNarrow.family === fontWide.family && fontNarrow.size === fontWide.size,
      `1600px: ${fontNarrow.family} ${fontNarrow.size} | 1900px: ${fontWide.family} ${fontWide.size}`);
  } else {
    console.log(`SKIP  completion font check (autocomplete not shown: ${JSON.stringify({ fontNarrow, fontWide })})`);
  }
  await page.close();
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);

// Real-browser verification for the inspector windowed-rendering work
// (virtual-list windowing, closed-inspector gate, visibility diff-patching).
// jsdom tests cover the logic; this exercises real layout — actual scroller
// heights, scroll-driven re-windowing, and the shell-scroller wiring.
//
//   1. Closed inspector renders ZERO rows after compile (the setData gate).
//   2. Opening renders a bounded window (not 2000 rows) inside a full-height
//      sizer, with the badge showing the full count.
//   3. Scrolling the shared .inspector shell re-windows to a deep slice, and
//      scrolling past the layers list windows the palette panel instead.
//   4. An eye toggle on a windowed row patches in place and survives the
//      store round-trip (no rebuild reverting it).
//
// Environment caveat: puppeteer's Chrome on this machine never runs the
// rendering loop (zero rAF ticks, scroll events never dispatched — verified
// even headful on about:blank), so browser-delivered scroll cannot be tested
// here. The scroll step therefore falls back: native event → synthetic
// dispatchEvent('scroll') (verifies listener wiring) → manual refresh()
// (verifies window math), logging which level responded.
//
// Run via `npx tsx scripts/debug-inspector-virtualization.ts` (requires
// `npm run dev:website` on :3000 and a fresh
// `PATHOGEN_API_BASE=http://localhost:8787 npm run build:playground`).

import puppeteer from 'puppeteer';
import type { Page } from 'puppeteer';

const LAYERS = 2000;
const ROW_H = 28; // keep in sync with layers-panel.ts / layers-panel.css

const findInShadowSrc = `
  const findInShadow = (selector, root) => {
    const queue = [root || document];
    while (queue.length) {
      const n = queue.shift();
      const hit = n && n.querySelector ? n.querySelector(selector) : null;
      if (hit) return hit;
      if (n && n.children) for (const c of n.children) queue.push(c);
      if (n && n.shadowRoot) queue.push(n.shadowRoot);
    }
    return null;
  };
`;

function encodeState(code: string): string {
  return btoa(encodeURIComponent(JSON.stringify({ code })));
}

function wideProgram(layers: number): string {
  return [
    'define ViewBox(0, 0, 2000, 2000);',
    '',
    `for (i in 0..${layers}) {`,
    // eslint-disable-next-line no-template-curly-in-string -- Pathogen interpolation, not a JS template
    '  let wideLayer = PathLayer(`wide${i}`) << ${ stroke: oklch(0.6 0.12 200); stroke-width: 0.5; fill: oklch(0.9 0.05 80); };',
    '  wideLayer.apply {',
    '    circle(40 + (i % 140) * 14, 40 + floor(i / 140) * 14, 5);',
    '  }',
    '}',
    '',
  ].join('\n');
}

async function inspectorProbe(page: Page): Promise<{
  rowCount: number;
  firstRowName: string | null;
  sizerHeight: string | null;
  badge: string | null;
  paletteRows: number;
}> {
  return page.evaluate(`(() => {
    ${findInShadowSrc}
    const lp = findInShadow('layers-panel');
    const pp = findInShadow('palette-panel');
    const rows = lp ? lp.shadowRoot.querySelectorAll('.layer-row') : [];
    const sizer = lp ? lp.shadowRoot.querySelector('.vl-sizer') : null;
    return {
      rowCount: rows.length,
      firstRowName: rows.length ? rows[0].dataset.layerName : null,
      sizerHeight: sizer ? sizer.style.height : null,
      badge: lp ? lp.shadowRoot.querySelector('.badge').textContent : null,
      paletteRows: pp ? pp.shadowRoot.querySelectorAll('.color-row, .group-header').length : 0,
    };
  })()`) as Promise<{
    rowCount: number;
    firstRowName: string | null;
    sizerHeight: string | null;
    badge: string | null;
    paletteRows: number;
  }>;
}

async function main(): Promise<void> {
  const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1500, height: 1000 } });
  let ok = true;
  const fail = (msg: string): void => {
    console.error(`  FAIL: ${msg}`);
    ok = false;
  };
  try {
    const page = await browser.newPage();
    page.on('dialog', (d) => {
      d.dismiss().catch(() => {});
    });
    page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`));
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem('pathogen-lang:userId', 'e2e-inspector-virtualization');
      } catch {
        /* ignore */
      }
    });

    console.log(`→ Loading scratch workspace with ${LAYERS} layers`);
    await page.goto(`http://localhost:3000/workspace/scratch?state=${encodeState(wideProgram(LAYERS))}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Poll for first render (CSP breaks waitForFunction).
    let ready = false;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const paths = (await page.evaluate(`(() => {
        ${findInShadowSrc}
        const iframe = findInShadow('iframe');
        return iframe && iframe.contentDocument ? iframe.contentDocument.querySelectorAll('path').length : 0;
      })()`)) as number;
      if (paths >= LAYERS) {
        ready = true;
        break;
      }
    }
    if (!ready) {
      fail('timed out waiting for first render — is the dev server running with a current build?');
      return;
    }
    await new Promise((r) => setTimeout(r, 500));

    // 1. Closed inspector: the gate must have deferred everything.
    const closed = await inspectorProbe(page);
    console.log(`  closed: ${JSON.stringify(closed)}`);
    if (closed.rowCount !== 0) fail(`closed inspector rendered ${closed.rowCount} rows (expected 0 — gate broken)`);

    // 2. Open: bounded window + full-height sizer + full-count badge.
    // The compiled program has LAYERS explicit layers plus the implicit
    // default layer, so row totals are LAYERS + 1.
    // eslint-disable-next-line n/no-unsupported-features/node-builtins -- browser context, not Node
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('toggle-inspector')));
    await new Promise((r) => setTimeout(r, 800));
    const open = await inspectorProbe(page);
    console.log(`  open:   ${JSON.stringify(open)}`);
    if (open.rowCount === 0 || open.rowCount > 100) {
      fail(`open inspector rendered ${open.rowCount} rows (expected a bounded window)`);
    }
    if (open.sizerHeight !== `${(LAYERS + 1) * ROW_H}px`) {
      fail(`sizer height ${open.sizerHeight} (expected ${(LAYERS + 1) * ROW_H}px)`);
    }
    if (open.badge !== String(LAYERS + 1)) fail(`badge ${open.badge} (expected ${LAYERS + 1})`);
    if (open.firstRowName !== 'wide0') fail(`first row ${open.firstRowName} (expected wide0)`);
    // The palette panel sits below the layers list's ~56000px sizer, so at
    // scrollTop 0 its window is legitimately empty.
    if (open.paletteRows !== 0) {
      fail(`palette rendered ${open.paletteRows} rows above the fold (expected 0 — it is 56000px down)`);
    }

    // 3. Scroll the shared shell scroller deep into the layers list. This
    // environment never delivers native scroll events (see header comment),
    // so fall back level by level and report which one responded.
    const scrollResult = (await page.evaluate(`(async () => {
      ${findInShadowSrc}
      const ip = findInShadow('inspector-panel');
      const shell = ip.shadowRoot.querySelector('.inspector');
      const lp = ip.shadowRoot.querySelector('layers-panel');
      const firstRow = () => lp.shadowRoot.querySelector('.layer-row')?.dataset.layerName ?? null;
      const before = firstRow();
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      shell.scrollTop = 20000;
      await wait(400);
      if (firstRow() !== before) return { via: 'native scroll event', name: firstRow() };
      shell.dispatchEvent(new Event('scroll'));
      await wait(400);
      if (firstRow() !== before) return { via: 'synthetic scroll event (listener OK, rAF stalled)', name: firstRow() };
      lp._virtual.refresh();
      if (firstRow() !== before) return { via: 'manual refresh (listener OR rAF dead in this env)', name: firstRow() };
      return { via: 'none', name: firstRow() };
    })()`)) as { via: string; name: string | null };
    console.log(`  scrolled via ${scrollResult.via}: first row ${scrollResult.name}`);
    const firstIdx = scrollResult.name?.startsWith('wide') ? parseInt(scrollResult.name.slice(4), 10) : -1;
    if (firstIdx < 400) fail(`after deep scroll, first row is ${scrollResult.name} (expected a deep slice)`);
    if (scrollResult.via === 'none') fail('window did not move even with a manual refresh');
    if (scrollResult.via.startsWith('manual')) {
      console.log('  NOTE: scroll listener could not be exercised in this environment — covered by jsdom tests');
    }

    // 3b. Scroll past the layers list entirely: the palette should window in
    // and the layers slice should clamp to empty.
    const deep = (await page.evaluate(`(() => {
      ${findInShadowSrc}
      const ip = findInShadow('inspector-panel');
      const shell = ip.shadowRoot.querySelector('.inspector');
      const lp = ip.shadowRoot.querySelector('layers-panel');
      const pp = ip.shadowRoot.querySelector('palette-panel');
      shell.scrollTop = 60000;
      shell.dispatchEvent(new Event('scroll'));
      lp._virtual.refresh();
      pp._virtual.refresh();
      return {
        layerRows: lp.shadowRoot.querySelectorAll('.layer-row').length,
        paletteRows: pp.shadowRoot.querySelectorAll('.color-row, .group-header').length,
        paletteBadge: pp.shadowRoot.querySelector('.badge').textContent,
      };
    })()`)) as { layerRows: number; paletteRows: number; paletteBadge: string };
    console.log(`  deep scroll (60000px): ${JSON.stringify(deep)}`);
    if (deep.paletteRows === 0 || deep.paletteRows > 120) {
      fail(`palette rendered ${deep.paletteRows} rows at depth (expected a bounded window)`);
    }
    if (deep.layerRows > 40) fail(`layers rendered ${deep.layerRows} rows past its end (expected ~0)`);
    // stroke + fill per layer, implicit default layer included.
    if (deep.paletteBadge !== String(2 * (LAYERS + 1))) {
      fail(`palette badge ${deep.paletteBadge} (expected ${2 * (LAYERS + 1)} color rows)`);
    }

    // Reset scroll for the eye-toggle step so a windowed row is present.
    await page.evaluate(`(() => {
      ${findInShadowSrc}
      const ip = findInShadow('inspector-panel');
      const shell = ip.shadowRoot.querySelector('.inspector');
      const lp = ip.shadowRoot.querySelector('layers-panel');
      const pp = ip.shadowRoot.querySelector('palette-panel');
      shell.scrollTop = 20000;
      lp._virtual.refresh();
      pp._virtual.refresh();
    })()`);

    // 4. Eye toggle on a windowed row: patched in place, survives the store echo.
    const toggled = (await page.evaluate(`(() => {
      ${findInShadowSrc}
      const lp = findInShadow('layers-panel');
      const row = lp.shadowRoot.querySelector('.layer-row');
      const name = row.dataset.layerName;
      row.querySelector('.eye-btn').click();
      return { name, titleAfterClick: row.querySelector('.eye-btn').getAttribute('title') };
    })()`)) as { name: string; titleAfterClick: string };
    await new Promise((r) => setTimeout(r, 600)); // let the store round-trip echo back
    const settled = (await page.evaluate(`(() => {
      ${findInShadowSrc}
      const lp = findInShadow('layers-panel');
      const row = lp.shadowRoot.querySelector('.layer-row[data-layer-name="${toggled.name}"]');
      const iframe = findInShadow('iframe');
      const hidden = iframe && iframe.contentDocument
        ? iframe.contentDocument.querySelectorAll('[style*="display: none"], [display="none"]').length
        : -1;
      return { title: row ? row.querySelector('.eye-btn').getAttribute('title') : null, hiddenEls: hidden };
    })()`)) as { title: string | null; hiddenEls: number };
    console.log(
      `  eye toggle on ${toggled.name}: after-click=${toggled.titleAfterClick}, settled=${JSON.stringify(settled)}`,
    );
    if (toggled.titleAfterClick !== 'Show layer') fail('eye did not patch synchronously on click');
    if (settled.title !== 'Show layer') fail('eye state reverted after the store echo');
    if (settled.hiddenEls === 0) fail('preview did not hide the toggled layer');
  } catch (e) {
    console.error('Unexpected:', e);
    ok = false;
  } finally {
    await browser.close();
  }
  if (!ok) {
    console.error('\n=== Verification FAILED ===');
    process.exit(1);
  }
  console.log('\n=== Verification PASSED ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

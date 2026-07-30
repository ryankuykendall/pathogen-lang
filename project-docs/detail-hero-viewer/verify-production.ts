// E2E verification of the B·2 live hero viewer on the real detail page.
// Prereqs: dev stack running (Pages :3000 + API :8787) and one local
// approval backfilled with an SVG via PUT /admin/approval/:id/svg.
// Run: npx tsx project-docs/detail-hero-viewer/verify-production.ts
import puppeteer, { type Page } from 'puppeteer';
import { mkdirSync } from 'fs';

const VIEWER_URL = 'http://localhost:3000/u/seed-dan/dan-diamond';
const FALLBACK_URL = 'http://localhost:3000/u/seed-alice/alice-circle';
const SHOTS = '/Users/ryan/claude-code-projects/svg-path-extended/project-docs/detail-hero-viewer/production-verify';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: string[] = [];
const record = (pass: boolean, label: string, detail = '') =>
  results.push(`${pass ? '✓' : '✗'} ${label}${detail ? `: ${detail}` : ''}`);

async function waitFor(page: Page, fn: string, tries = 60): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await page.evaluate(fn)) return true;
    await sleep(250);
  }
  return false;
}

// The 485-layer artwork carries per-layer drop-shadow filters — rasterizing
// it for a screenshot can exceed the CDP default timeout. Screenshots are
// informational; never let one abort the functional checks.
async function shot(page: Page, path: string): Promise<void> {
  try {
    await page.screenshot({ path: path as `${string}.png` });
  } catch (e) {
    record(false, `screenshot ${path.split('/').pop()}`, (e as Error).message.slice(0, 80));
  }
}

async function verifyViewer(theme: 'light' | 'dark', browser: puppeteer.Browser): Promise<void> {
  const page = await browser.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((t) => localStorage.setItem('pathogen-theme', t), theme);
  await page.goto(VIEWER_URL, { waitUntil: 'networkidle0' });

  // 1. Hydration replaced the static hero with the live viewer.
  const mounted = await waitFor(page, `!!document.querySelector('.detail-plate-stage.detail-hero-live mini-preview')`);
  record(mounted, `${theme}: viewer mounted (stage.detail-hero-live > mini-preview)`);
  if (!mounted) {
    record(false, `${theme}: page errors`, errors.join(' | ') || 'none');
    await page.close();
    return;
  }
  await sleep(800);

  const rest = await page.evaluate(() => {
    const out: Record<string, unknown> = {};
    const stage = document.querySelector('.detail-plate-stage.detail-hero-live')!;
    out.staticArtRemoved = !stage.querySelector('.detail-plate-art, .detail-plate-fallback');
    out.stagePadding = getComputedStyle(stage).paddingTop;
    const mp = stage.querySelector('mini-preview')!;
    const mpRect = mp.getBoundingClientRect();
    out.viewerSize = [Math.round(mpRect.width), Math.round(mpRect.height)];
    const iframe = mp.shadowRoot!.querySelector('#preview-frame') as HTMLIFrameElement;
    out.svgChildren = iframe?.contentDocument?.getElementById('preview-content')?.children.length ?? 0;
    const pill = mp.shadowRoot!.querySelector('pathogen-zoom-pill') as HTMLElement & { zoom: number };
    out.pillZoom = pill?.shadowRoot?.querySelector<HTMLInputElement>('#zoom-level')?.value;
    const fsBtn = document.querySelector('.detail-hero-fullscreen')!;
    out.fsBtnRestOpacity = getComputedStyle(fsBtn).opacity;
    out.inspectorBtnHidden =
      getComputedStyle(mp.shadowRoot!.querySelector('#inspector-open-btn')!).display === 'none';
    return out;
  });
  record(
    rest.staticArtRemoved === true && rest.stagePadding === '0px',
    `${theme}: frameless stage, static art removed`,
    `padding=${rest.stagePadding}`,
  );
  record(
    (rest.viewerSize as number[])[0] > 1000 && (rest.viewerSize as number[])[1] > 300,
    `${theme}: viewer geometry`,
    JSON.stringify(rest.viewerSize),
  );
  record((rest.svgChildren as number) > 0, `${theme}: SVG injected into sandboxed iframe`, `${rest.svgChildren} nodes`);
  record(rest.pillZoom === '100%', `${theme}: zoom pill at fit`, String(rest.pillZoom));
  record(rest.fsBtnRestOpacity === '0', `${theme}: fullscreen button hover-revealed (opacity 0 at rest)`);
  record(rest.inspectorBtnHidden === true, `${theme}: layers button hidden at rest`);

  // 2. Zoom via the shared pill.
  const zoom = await page.evaluate(() => {
    const mp = document.querySelector('mini-preview')!;
    const pillRoot = mp.shadowRoot!.querySelector('pathogen-zoom-pill')!.shadowRoot!;
    (pillRoot.querySelector('#zoom-in') as HTMLButtonElement).click();
    const after = (pillRoot.querySelector('#zoom-level') as HTMLInputElement).value;
    (pillRoot.querySelector('#zoom-fit') as HTMLButtonElement).click();
    const fit = (pillRoot.querySelector('#zoom-level') as HTMLInputElement).value;
    return { after, fit };
  });
  record(zoom.after === '150%' && zoom.fit === '100%', `${theme}: pill zoom in/fit`, JSON.stringify(zoom));

  // 3. Fullscreen: glass button → fixed viewport-fill overlay; layers appear.
  await page.evaluate(() => (document.querySelector('.detail-hero-fullscreen') as HTMLButtonElement).click());
  await sleep(300);
  const fs = await page.evaluate(() => {
    const mp = document.querySelector('mini-preview')!;
    const cs = getComputedStyle(mp);
    const rect = mp.getBoundingClientRect();
    return {
      hasClass: mp.classList.contains('fullscreen'),
      position: cs.position,
      size: [Math.round(rect.width), Math.round(rect.height)],
      inspectorBtnVisible:
        getComputedStyle(mp.shadowRoot!.querySelector('#inspector-open-btn')!).display !== 'none',
      glassBtnHidden:
        getComputedStyle(document.querySelector('.detail-hero-fullscreen')!).display === 'none',
    };
  });
  record(
    fs.hasClass && fs.position === 'fixed' && fs.size[0] === 1440 && fs.size[1] === 1000,
    `${theme}: viewport-fill fullscreen`,
    JSON.stringify(fs),
  );
  record(fs.inspectorBtnVisible, `${theme}: layers button visible in fullscreen`);
  record(fs.glassBtnHidden, `${theme}: page glass button hidden while fullscreen`);
  await shot(page, `${SHOTS}/viewer-fullscreen-${theme}.png`);

  // 4. Inspector opens with derived layers; visibility wiring reaches the iframe.
  await page.evaluate(() => {
    const mp = document.querySelector('mini-preview')!;
    (mp.shadowRoot!.querySelector('#inspector-open-btn') as HTMLButtonElement).click();
  });
  await sleep(600);
  const inspector = await page.evaluate(() => {
    const panel = document.body.querySelector('inspector-panel');
    if (!panel) return { present: false };
    const lp = panel.shadowRoot?.querySelector('layers-panel');
    const rows = lp?.shadowRoot?.querySelectorAll('.layer-row, [class*="layer"]').length ?? 0;
    panel.dispatchEvent(
      new CustomEvent('layer-visibility-change', { detail: { name: 'base', visible: false }, bubbles: true }),
    );
    const mp = document.querySelector('mini-preview')!;
    const iframe = mp.shadowRoot!.querySelector('#preview-frame') as HTMLIFrameElement;
    const baseEl = iframe.contentDocument!.querySelector('[data-layer-name="base"]') as HTMLElement | null;
    const hidden = baseEl ? baseEl.style.display === 'none' : false;
    panel.dispatchEvent(
      new CustomEvent('layer-visibility-change', { detail: { name: 'base', visible: true }, bubbles: true }),
    );
    const restored = baseEl ? baseEl.style.display === '' : false;
    return { present: true, rows, hidden, restored };
  });
  record(
    inspector.present === true && (inspector.rows as number) > 100,
    `${theme}: inspector panel with derived layers`,
    `rows≈${inspector.rows}`,
  );
  record(
    inspector.hidden === true && inspector.restored === true,
    `${theme}: layer toggle reaches sandboxed iframe`,
  );
  await shot(page, `${SHOTS}/viewer-inspector-${theme}.png`);

  // 5. Esc closes inspector first, second Esc exits fullscreen.
  await page.keyboard.press('Escape');
  await sleep(200);
  const afterEsc1 = await page.evaluate(() => ({
    panelGone: !document.body.querySelector('inspector-panel'),
    stillFullscreen: document.querySelector('mini-preview')!.classList.contains('fullscreen'),
  }));
  record(afterEsc1.panelGone && afterEsc1.stillFullscreen, `${theme}: first Esc closes inspector only`);
  await page.keyboard.press('Escape');
  await sleep(300);
  const afterEsc2 = await page.evaluate(() => {
    const mp = document.querySelector('mini-preview')!;
    const rect = mp.getBoundingClientRect();
    return { fullscreen: mp.classList.contains('fullscreen'), width: Math.round(rect.width) };
  });
  record(
    !afterEsc2.fullscreen && afterEsc2.width < 1440 && afterEsc2.width > 1000,
    `${theme}: second Esc exits fullscreen, layout restored`,
    JSON.stringify(afterEsc2),
  );

  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(200);
  await shot(page, `${SHOTS}/viewer-rest-${theme}.png`);
  if (errors.length) record(false, `${theme}: page errors`, errors.join(' | '));
  await page.close();
}

async function verifyFallback(browser: puppeteer.Browser): Promise<void> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(FALLBACK_URL, { waitUntil: 'networkidle0' });
  await sleep(1000);
  const fb = await page.evaluate(() => ({
    hasSwatch: !!document.querySelector('.detail-plate-fallback'),
    noViewer: !document.querySelector('mini-preview'),
    noFlag: !document.querySelector('[data-hero-vector]'),
    cropMarks: getComputedStyle(document.querySelector('.detail-plate-stage')!, '::before').content !== 'none',
  }));
  record(
    fb.hasSwatch && fb.noViewer && fb.noFlag && fb.cropMarks,
    `fallback: non-vector page untouched (static plate, crop marks, no viewer)`,
    JSON.stringify(fb),
  );
  await page.screenshot({ path: `${SHOTS}/fallback-static.png` as `${string}.png` });
  await page.close();
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 300000 });
  await verifyViewer('light', browser);
  await verifyViewer('dark', browser);
  await verifyFallback(browser);
  await browser.close();
  console.log(results.join('\n'));
  if (results.some((r) => r.startsWith('✗'))) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

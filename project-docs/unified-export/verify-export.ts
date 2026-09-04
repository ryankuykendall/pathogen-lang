/**
 * End-to-end verification for the unified Export workflow (SVG / PNG / PDF,
 * optional legend, syntax-highlighted code, brand watermark).
 * Drives the real playground UI (menu event → modal → settings → Download),
 * captures produced files via a showSaveFilePicker stub, and asserts on bytes.
 *
 * Cloned from project-docs/pdf-export/verify-pdf-export.ts (which remains as
 * a historical artifact and targets the pre-unification modal).
 *
 * Requires: wrangler pages dev on :3000 and the API worker on :8787.
 * Outputs: files + screenshots into project-docs/unified-export/verify/.
 * Run: npx tsx project-docs/unified-export/verify-export.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import puppeteer, { type Page } from 'puppeteer';

import { decodeJpeg, decodePng, listImages, loadPdf, pixelStats } from '../../scripts/lib/pdf-inspect';

const LOCAL_ORIGIN = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';
const OUT_DIR = join(process.cwd(), 'project-docs', 'unified-export', 'verify');

// 800 × 500 canvas → PNG 2× = 1600 × 1000. Includes text (outliner path),
// a comment + keyword-rich source (highlight classes), and a dark background
// (watermark contrast).
const MAIN_SOURCE = `define ViewBox(0, 0, 800, 500);

define default PathLayer('background') #{
  fill: #14101c;
}

layer('background').apply {
  rect(0, 0, 800, 500);
}

// concentric study
define PathLayer('rings') #{
  stroke: #f7b56e;
  stroke-width: 3;
  fill: #b384e0;
}

let rings = 2;
layer('rings').apply {
  circle(620, 120, 46);
  circle(200, 300, 80);
}
`;

// No full-canvas background layer — the transparency check reads a corner
// pixel, which must be covered ONLY by the workspace background (removed in
// transparent mode), not by drawn artwork.
const OPEN_CORNER_SOURCE = `define ViewBox(0, 0, 400, 300);

define default PathLayer('dot') #{
  fill: #b384e0;
  stroke: none;
}

layer('dot').apply {
  circle(200, 150, 60);
}
`;

function makeAnonId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_~-';
  let id = '';
  for (let i = 0; i < 21; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)];
  return id;
}

async function createWorkspace(source: string, ownerId: string, name: string): Promise<string> {
  const res = await fetch(`${DEV_API}/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': ownerId },
    body: JSON.stringify({ name, code: source }),
  });
  if (!res.ok) throw new Error(`workspace create failed: HTTP ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

/** Shadow-DOM-aware element runner: finds <export-modal> and evals fn body. */
const MODAL_EVAL_PREFIX = `
  function findModal(root) {
    var els = root.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      if (els[i].tagName === 'EXPORT-MODAL') return els[i];
      if (els[i].shadowRoot) {
        var m = findModal(els[i].shadowRoot);
        if (m) return m;
      }
    }
    return null;
  }
  var modal = findModal(document);
  if (!modal) return { error: 'modal not found' };
  var sr = modal.shadowRoot;
`;

async function inModal<T>(page: Page, body: string): Promise<T> {
  const result = (await page.evaluate(
    new Function(MODAL_EVAL_PREFIX + body) as unknown as () => T,
  )) as T & { error?: string };
  if (result && typeof result === 'object' && 'error' in (result as object) && (result as { error?: string }).error) {
    throw new Error(`modal eval failed: ${(result as { error: string }).error}`);
  }
  return result;
}

async function waitFor(page: Page, body: string, timeoutMs = 30_000, label = 'condition'): Promise<void> {
  const start = Date.now();
  // Poll with evaluate (CSP blocks waitForFunction in this app)
  for (;;) {
    const ok = await page.evaluate(new Function(body) as unknown as () => boolean);
    if (ok) return;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

const PREVIEW_READY = `
  function findIframe(root) {
    var direct = root.querySelector('iframe#preview-frame');
    if (direct) return direct;
    var els = root.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      if (els[i].shadowRoot) {
        var f = findIframe(els[i].shadowRoot);
        if (f) return f;
      }
    }
    return null;
  }
  var iframe = findIframe(document);
  if (!iframe || !iframe.contentDocument) return false;
  return iframe.contentDocument.querySelectorAll('path, rect, circle, text').length > 0;
`;

// String-form page scripts throughout: tsx's esbuild transform injects a
// __name helper into serialized function-form evaluate bodies, which is
// undefined in the page (same gotcha as security-browser-audit.ts).
async function installSaveStub(page: Page): Promise<void> {
  await page.evaluate(`
    window.__saved = null;
    window.__pickerCalls = 0;
    window.__rejectPicker = false;
    window.showSaveFilePicker = async (opts) => {
      window.__pickerCalls++;
      if (window.__rejectPicker) {
        const e = new Error('The user aborted a request.');
        e.name = 'AbortError';
        throw e;
      }
      return {
        createWritable: async () => ({
          write: async (blob) => {
            const buf = new Uint8Array(await blob.arrayBuffer());
            let binary = '';
            for (let i = 0; i < buf.length; i += 8192) {
              binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 8192)));
            }
            window.__saved = { name: opts.suggestedName, b64: btoa(binary) };
          },
          close: async () => {},
        }),
      };
    };
  `);
}

async function download(page: Page): Promise<{ name: string; bytes: Buffer }> {
  await page.evaluate(`window.__saved = null;`);
  await inModal(page, `sr.querySelector('.download-btn').click(); return { ok: true };`);
  const start = Date.now();
  for (;;) {
    const saved = (await page.evaluate(`window.__saved`)) as { name: string; b64: string } | null;
    if (saved) return { name: saved.name, bytes: Buffer.from(saved.b64, 'base64') };
    if (Date.now() - start > 60_000) {
      const status = await inModal<{ text: string }>(page, `return { text: (sr.querySelector('.export-status') || {}).textContent || '' };`);
      throw new Error(`download timed out; status="${status.text}"`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

function pngInfo(png: Buffer): { w: number; h: number; colorType: number } {
  if (png.subarray(0, 8).toString('latin1') !== '\x89PNG\r\n\x1a\n') throw new Error('not a PNG');
  return { w: png.readUInt32BE(16), h: png.readUInt32BE(20), colorType: png[25] };
}

/** Alpha of the pixel at (2,2), decoded by the page itself. */
async function cornerAlpha(page: Page, png: Buffer): Promise<number> {
  return (await page.evaluate(`(async () => {
    const img = new Image();
    img.src = 'data:image/png;base64,${png.toString('base64')}';
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(2, 2, 1, 1).data[3];
  })()`)) as number;
}

/** Concatenate FlateDecode-inflatable PDF content streams (see pdf-export harness). */
function decodedStreams(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  let out = '';
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end === -1) continue;
    try {
      out += `${inflateSync(pdf.subarray(start, end)).toString('latin1')}\n`;
    } catch {
      // DCTDecode image or false `stream` match — skip.
    }
  }
  return out;
}

function imageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Subtype\s*\/Image/g) || []).length;
}

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const WAIT_MODAL_OPEN = `
  function findModal(root) {
    var els = root.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      if (els[i].tagName === 'EXPORT-MODAL') return els[i];
      if (els[i].shadowRoot) {
        var m = findModal(els[i].shadowRoot);
        if (m) return m;
      }
    }
    return null;
  }
  var modal = findModal(document);
  return !!(modal && modal.classList.contains('open'));
`;

async function openModal(page: Page): Promise<void> {
  await page.evaluate(`document.dispatchEvent(new CustomEvent('open-export', { bubbles: true, composed: true }));`);
  await waitFor(page, WAIT_MODAL_OPEN, 10_000, 'modal open');
}

async function closeModal(page: Page): Promise<void> {
  await inModal(page, `sr.querySelector('.close-btn').click(); return { ok: true };`);
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const ownerId = makeAnonId();
  const mainWs = await createWorkspace(MAIN_SOURCE, ownerId, 'unified-export-verify');
  console.log(`workspace: ${mainWs}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
    protocolTimeout: 180_000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  page.on('dialog', (d) => void d.dismiss());
  await page.evaluateOnNewDocument(`localStorage.setItem('${ANON_KEY}', '${ownerId}');`);

  await page.goto(`${LOCAL_ORIGIN}/workspace/${mainWs}`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await waitFor(page, PREVIEW_READY, 60_000, 'preview compile');
  await installSaveStub(page);

  // --- 1. Overflow menu: single Export item, no Export with Legend ---
  const menu = (await page.evaluate(`(() => {
    function findEl(root, tag) {
      var els = root.querySelectorAll('*');
      for (var i = 0; i < els.length; i++) {
        if (els[i].tagName === tag) return els[i];
        if (els[i].shadowRoot) {
          var m = findEl(els[i].shadowRoot, tag);
          if (m) return m;
        }
      }
      return null;
    }
    var bc = findEl(document, 'APP-BREADCRUMB');
    if (!bc || typeof bc.getOverflowMenuHtml !== 'function') return { error: 'breadcrumb not found' };
    var html = bc.getOverflowMenuHtml();
    return {
      hasExport: html.indexOf('data-action="export"') !== -1,
      hasLegacyLegend: html.indexOf('export-legend') !== -1 || html.indexOf('Export with Legend') !== -1,
      hasLegacyFile: html.indexOf('export-file') !== -1,
      tooltip: (html.match(/data-action="export" title="([^"]+)"/) || [])[1] || '',
    };
  })()`)) as { error?: string; hasExport: boolean; hasLegacyLegend: boolean; hasLegacyFile: boolean; tooltip: string };
  if (menu.error) throw new Error(menu.error);
  check('menu has single Export item', menu.hasExport && !menu.hasLegacyLegend && !menu.hasLegacyFile);
  check('Export tooltip mentions formats + shortcut', /SVG, PNG, or PDF/.test(menu.tooltip) && /Ctrl\+Shift\+E/.test(menu.tooltip), menu.tooltip);

  // --- 2. Ctrl+Shift+E opens the modal ---
  await page.evaluate(
    `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'E', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));`,
  );
  await waitFor(page, WAIT_MODAL_OPEN, 10_000, 'modal open via Ctrl+Shift+E');
  check('Ctrl+Shift+E opens the Export modal', true);

  // Regression: re-opening while already open must not duplicate document
  // listeners — the arrow-key legend nudge is relative, so a leaked
  // duplicate would move the legend 2× per press.
  await page.evaluate(
    `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'E', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));`,
  );
  await new Promise((r) => setTimeout(r, 300));
  await inModal(page, `sr.querySelector('#include-legend').click(); return { ok: true };`);
  const readLegendX = async (): Promise<number> => {
    const t = await inModal<{ t: string }>(
      page,
      `return { t: sr.querySelector('.preview-area svg #pathogen-legend').getAttribute('transform') };`,
    );
    return parseFloat(/translate\((-?[\d.]+)/.exec(t.t)![1]);
  };
  const snapStep = await inModal<{ v: number }>(page, `return { v: parseInt(sr.querySelector('#legend-snap').value, 10) || 1 };`);
  const xBefore = await readLegendX();
  // Nudge LEFT — the default bottom-right placement sits near the right-edge
  // clamp, so a rightward nudge would be clamp-truncated and mask a duplicate.
  await page.evaluate(
    `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));`,
  );
  const xAfter = await readLegendX();
  check(
    'double-open does not duplicate listeners (arrow nudges exactly one step)',
    Math.abs(xBefore - xAfter - snapStep.v) < 0.01,
    `moved ${xAfter - xBefore}, snap=${snapStep.v}`,
  );

  // Regression: the legend must never leave the canvas — outside the viewBox
  // it would be silently cut off in the downloaded file. Hammer ArrowRight/
  // ArrowDown far past the edge and assert the clamp holds.
  for (let i = 0; i < 80; i++) {
    await page.evaluate(
      `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }));
       document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true }));`,
    );
  }
  const clamped = await inModal<{ transform: string; legendW: number; legendH: number; canvasW: number; canvasH: number }>(
    page,
    `var legend = sr.querySelector('.preview-area svg #pathogen-legend');
     var box = legend.getBBox();
     var vb = sr.querySelector('.preview-area svg').getAttribute('viewBox');
     return {
       transform: legend.getAttribute('transform'),
       legendW: box.width, legendH: box.height,
       canvasW: ${'800'}, canvasH: ${'500'},
     };`,
  );
  const tm = /translate\((-?[\d.]+),\s*(-?[\d.]+)\)/.exec(clamped.transform)!;
  const lx = parseFloat(tm[1]);
  const ly = parseFloat(tm[2]);
  check(
    'legend clamps inside the canvas under arrow-key hammering',
    lx >= 0 && ly >= 0 && lx + clamped.legendW <= clamped.canvasW + 2 && ly + clamped.legendH <= clamped.canvasH + 2,
    `pos=(${lx}, ${ly}) size=(${Math.round(clamped.legendW)}×${Math.round(clamped.legendH)}) canvas=800×500`,
  );

  // Shared-controller zoom: the pill's shadow-DOM buttons drive the
  // PanZoomController; a button zoom applies immediately (baked viewBox).
  const pillZoomIn = `sr.querySelector('pathogen-zoom-pill').shadowRoot.querySelector('#zoom-in').click(); return { ok: true };`;
  const pillZoomFit = `sr.querySelector('pathogen-zoom-pill').shadowRoot.querySelector('#zoom-fit').click(); return { ok: true };`;
  const readZoomState = `
    var svg = sr.querySelector('.preview-area svg');
    var vb = svg.getAttribute('viewBox').split(' ').map(Number);
    var pill = sr.querySelector('pathogen-zoom-pill');
    return {
      vbW: vb[2],
      pct: pill.shadowRoot.querySelector('#zoom-level').value,
      inlineTransform: svg.style.transform || '',
    };`;

  await inModal(page, pillZoomIn);
  const zoomedState = await inModal<{ vbW: number; pct: string; inlineTransform: string }>(page, readZoomState);
  check(
    'pill zoom-in narrows the baked viewBox to canvas/1.5 and reads 150%',
    Math.abs(zoomedState.vbW - 800 / 1.5) < 0.5 && zoomedState.pct === '150%',
    `vbW=${zoomedState.vbW} pct=${zoomedState.pct}`,
  );

  // Regression (Ryan, 2026-07-23): baked zoom renders into the ELEMENT box —
  // if the element is artwork-sized, magnified content stays confined to a
  // small window no matter the zoom (with rounded corners it was also
  // corner-clipped). The element must fill the preview pane so the zoom
  // window IS the pane, and must carry no radius.
  const zoomedGeom = await inModal<{ radius: string; svgW: number; svgH: number; areaW: number; areaH: number; padL: number; padT: number }>(
    page,
    `var svg = sr.querySelector('.preview-area svg');
     var area = sr.querySelector('.preview-area');
     var cs = getComputedStyle(area);
     var r = svg.getBoundingClientRect();
     var a = area.getBoundingClientRect();
     return {
       radius: getComputedStyle(svg).borderRadius,
       svgW: r.width, svgH: r.height, areaW: a.width, areaH: a.height,
       padL: parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight),
       padT: parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom),
     };`,
  );
  check(
    'zoom window is the whole pane (svg fills preview area, radius 0)',
    zoomedGeom.radius === '0px' &&
      Math.abs(zoomedGeom.svgW - (zoomedGeom.areaW - zoomedGeom.padL)) < 4 &&
      Math.abs(zoomedGeom.svgH - (zoomedGeom.areaH - zoomedGeom.padT)) < 4,
    `svg=${Math.round(zoomedGeom.svgW)}×${Math.round(zoomedGeom.svgH)} area=${Math.round(zoomedGeom.areaW)}×${Math.round(zoomedGeom.areaH)} radius=${zoomedGeom.radius}`,
  );
  await inModal(page, pillZoomFit);
  const fitState = await inModal<{ vbW: number; pct: string }>(page, readZoomState);
  check('pill Fit restores the full viewBox at 100%', fitState.vbW === 800 && fitState.pct === '100%', `vbW=${fitState.vbW}`);

  // Pan gesture goes through the controller (Pointer events — synthetic
  // MouseEvents are ignored by design). Zoom in first so pan is enabled.
  await inModal(page, pillZoomIn);
  const vbBeforePan = await inModal<{ x: number }>(
    page,
    `return { x: Number(sr.querySelector('.preview-area svg').getAttribute('viewBox').split(' ')[0]) };`,
  );
  await inModal(
    page,
    `var area = sr.querySelector('.preview-area');
     var rect = area.getBoundingClientRect();
     var cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
     var opts = { bubbles: true, cancelable: true, composed: true, pointerId: 7, clientX: cx, clientY: cy };
     area.dispatchEvent(new PointerEvent('pointerdown', opts));
     for (var i = 1; i <= 3; i++) {
       area.dispatchEvent(new PointerEvent('pointermove', Object.assign({}, opts, { clientX: cx - i * 30, clientY: cy })));
     }
     area.dispatchEvent(new PointerEvent('pointerup', opts));
     return { ok: true };`,
  );
  await new Promise((r) => setTimeout(r, 200)); // > bakeDelayMs (72)
  const vbAfterPan = await inModal<{ x: number }>(
    page,
    `return { x: Number(sr.querySelector('.preview-area svg').getAttribute('viewBox').split(' ')[0]) };`,
  );
  check('pointer drag pans (viewBox origin moved, baked)', vbAfterPan.x > vbBeforePan.x + 1, `x ${vbBeforePan.x} → ${vbAfterPan.x}`);

  // Legend targets veto panning (shouldStartPan): a pointerdown on the legend
  // must not start a controller gesture.
  const vbBeforeLegend = vbAfterPan.x;
  await inModal(
    page,
    `var legend = sr.querySelector('.preview-area svg #pathogen-legend');
     var r = legend.getBoundingClientRect();
     var opts = { bubbles: true, cancelable: true, composed: true, pointerId: 8, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
     legend.dispatchEvent(new PointerEvent('pointerdown', opts));
     legend.dispatchEvent(new PointerEvent('pointermove', Object.assign({}, opts, { clientX: r.x + r.width / 2 - 60 })));
     legend.dispatchEvent(new PointerEvent('pointerup', opts));
     return { ok: true };`,
  );
  await new Promise((r) => setTimeout(r, 200));
  const vbAfterLegend = await inModal<{ x: number }>(
    page,
    `return { x: Number(sr.querySelector('.preview-area svg').getAttribute('viewBox').split(' ')[0]) };`,
  );
  check('pointerdown on the legend does NOT pan (predicate veto)', Math.abs(vbAfterLegend.x - vbBeforeLegend) < 0.5);

  // Mid-gesture download must not leak the controller's inline transform into
  // the exported bytes (the _prepareExportClone force-bake + strip).
  await inModal(
    page,
    `var area = sr.querySelector('.preview-area');
     var rect = area.getBoundingClientRect();
     var opts = { bubbles: true, cancelable: true, composed: true, pointerId: 9, clientX: rect.x + 60, clientY: rect.y + 60 };
     area.dispatchEvent(new PointerEvent('pointerdown', opts));
     area.dispatchEvent(new PointerEvent('pointermove', Object.assign({}, opts, { clientX: rect.x + 120, clientY: rect.y + 90 })));
     return { ok: true };`,
  );
  const midGestureSvg = await download(page);
  const midGestureText = midGestureSvg.bytes.toString('utf8');
  const vbAttr = /viewBox="([^"]+)"/.exec(midGestureText)?.[1];
  check(
    'mid-gesture download is byte-clean (no inline transform, full viewBox)',
    !/style="[^"]*transform/.test(midGestureText) && !/will-change/.test(midGestureText) && vbAttr === '0 0 800 500',
    `viewBox=${vbAttr}`,
  );
  await inModal(
    page,
    `var area = sr.querySelector('.preview-area');
     area.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true, pointerId: 9 }));
     return { ok: true };`,
  );
  await inModal(page, pillZoomFit);

  await closeModal(page);

  // --- 3. Default modal state ---
  await openModal(page);
  const state = await inModal<{
    title: string;
    activeFormat: string;
    legendHidden: boolean;
    snapHidden: boolean;
    switchOn: boolean;
    btnLabel: string;
    legendInPreview: boolean;
    watermarkText: string;
  }>(
    page,
    `return {
      title: sr.querySelector('.form-header h2').textContent,
      activeFormat: (sr.querySelector('.format-toggle button.active') || {}).dataset.format || '',
      legendHidden: sr.querySelector('.legend-settings').hidden,
      snapHidden: sr.querySelector('.snap-chip').hidden,
      switchOn: sr.querySelector('#include-legend').classList.contains('active'),
      btnLabel: sr.querySelector('.download-btn').textContent,
      legendInPreview: !!sr.querySelector('.preview-area svg #pathogen-legend'),
      watermarkText: (sr.querySelector('.preview-area svg #pathogen-watermark') || {}).textContent || '(missing)',
    };`,
  );
  check('modal is titled "Export"', state.title === 'Export', state.title);
  check('format defaults to SVG', state.activeFormat === 'svg' && /SVG/.test(state.btnLabel), state.btnLabel);
  check('legend defaults OFF (fields hidden, switch off, snap hidden)', state.legendHidden && !state.switchOn && state.snapHidden);
  check(
    'preview shows watermark, no legend',
    !state.legendInPreview && state.watermarkText.includes('Created in') && state.watermarkText.includes('pathogen.studio'),
    state.watermarkText,
  );

  // Regression (2026-07-23): an eslint-autofix once rewrote the layer
  // visibility check from `=== false` to a falsy test, hiding every layer
  // (fresh workspaces have an empty visibility map) — the modal snapshot
  // cloned display:none paths and every preview/export went blank. Assert
  // the snapshot carries VISIBLE artwork geometry.
  const artwork = await inModal<{ total: number; visible: number }>(
    page,
    `var paths = sr.querySelectorAll('.preview-area svg #preview-layers [data-layer-name]');
     var visible = 0;
     paths.forEach(function (p) { if (p.style.display !== 'none') visible++; });
     return { total: paths.length, visible: visible };`,
  );
  check('modal snapshot contains visible artwork layers', artwork.total > 0 && artwork.visible === artwork.total, `${artwork.visible}/${artwork.total} visible`);
  // Illustrative artifact only — macOS graphics-stack flakiness can hang
  // Page.captureScreenshot; never let that kill the check run (same guard as
  // the pdf-export harness).
  try {
    await page.screenshot({ path: join(OUT_DIR, 'modal-default.png') });
  } catch (err) {
    console.warn('screenshot skipped (environmental):', (err as Error).message?.slice(0, 80));
  }

  // --- 4. SVG export, legend off: watermark embedded, no legend ---
  const svgOff = await download(page);
  const svgOffText = svgOff.bytes.toString('utf8');
  check('legend-off SVG filename has no -with-legend suffix', svgOff.name === 'unified-export-verify.svg', svgOff.name);
  check(
    'legend-off SVG carries watermark, no legend group',
    svgOffText.includes('pathogen-watermark') && svgOffText.includes('pathogen.studio') && !svgOffText.includes('pathogen-legend'),
  );
  check('legend-off SVG embeds fonts (@font-face data URI)', svgOffText.includes('@font-face') && svgOffText.includes('data:font'));
  writeFileSync(join(OUT_DIR, 'export-legend-off.svg'), svgOff.bytes);

  // --- 5. Legend ON + syntax highlighting ---
  await inModal(page, `sr.querySelector('#include-legend').click(); return { ok: true };`);
  const legendState = await inModal<{ legendHidden: boolean; snapHidden: boolean; highlightOn: boolean; kwTspans: number; watermarkGone: boolean }>(
    page,
    `return {
      legendHidden: sr.querySelector('.legend-settings').hidden,
      snapHidden: sr.querySelector('.snap-chip').hidden,
      highlightOn: sr.querySelector('#legend-highlight').checked,
      kwTspans: sr.querySelectorAll('.preview-area svg #pathogen-legend tspan[fill="#6d3aa6"]').length,
      watermarkGone: !sr.querySelector('.preview-area svg #pathogen-watermark'),
    };`,
  );
  check('legend toggle reveals fields + snap controls', !legendState.legendHidden && !legendState.snapHidden);
  check('highlighting defaults ON with colored keyword tspans in preview', legendState.highlightOn && legendState.kwTspans > 0, `${legendState.kwTspans} kw tspans`);
  check('watermark removed while legend is on', legendState.watermarkGone);
  try {
    await page.screenshot({ path: join(OUT_DIR, 'modal-legend-highlight.png') });
  } catch (err) {
    console.warn('screenshot skipped (environmental):', (err as Error).message?.slice(0, 80));
  }

  const svgOn = await download(page);
  const svgOnText = svgOn.bytes.toString('utf8');
  check(
    'legend-on SVG has legend + highlighted fills, no watermark group',
    svgOnText.includes('pathogen-legend') &&
      svgOnText.includes('fill="#6d3aa6"') &&
      svgOnText.includes('fill="#9087a0"') &&
      !svgOnText.includes('pathogen-watermark'),
  );
  writeFileSync(join(OUT_DIR, 'export-legend-highlight.svg'), svgOn.bytes);

  // --- 6. Highlighting off: monochrome code block ---
  await inModal(page, `sr.querySelector('#legend-highlight').click(); return { ok: true };`);
  const svgMono = await download(page);
  const svgMonoText = svgMono.bytes.toString('utf8');
  check('highlight-off SVG has no palette fills', svgMonoText.includes('pathogen-legend') && !svgMonoText.includes('fill="#6d3aa6"'));
  await inModal(page, `sr.querySelector('#legend-highlight').click(); return { ok: true };`); // back on

  // --- 7. PNG export (legend on) ---
  await inModal(page, `sr.querySelector('.format-toggle button[data-format="png"]').click(); return { ok: true };`);
  const pngSummary = await inModal<{ text: string; btn: string }>(
    page,
    `return { text: sr.querySelector('#png-summary').textContent, btn: sr.querySelector('.download-btn').textContent };`,
  );
  check('PNG summary shows 2× dimensions', /1,?600/.test(pngSummary.text) && /1,?000/.test(pngSummary.text), pngSummary.text);
  check('download button reads PNG', /PNG/.test(pngSummary.btn), pngSummary.btn);

  const png2x = await download(page);
  const info2x = pngInfo(png2x.bytes);
  check('PNG magic bytes + 2× dimensions', info2x.w === 1600 && info2x.h === 1000, `${info2x.w}×${info2x.h}`);
  check('PNG filename', png2x.name === 'unified-export-verify.png', png2x.name);
  const alphaOpaque = await cornerAlpha(page, png2x.bytes);
  check('default PNG is opaque at the corner', alphaOpaque === 255, `alpha=${alphaOpaque}`);
  writeFileSync(join(OUT_DIR, 'export-2x.png'), png2x.bytes);

  // Custom width
  await inModal(
    page,
    `var sel = sr.querySelector('#png-scale'); sel.value = 'custom'; sel.dispatchEvent(new Event('change'));
     var w = sr.querySelector('#png-width'); w.value = '3200'; w.dispatchEvent(new Event('input'));
     return { ok: true };`,
  );
  const pngCustom = await download(page);
  const infoCustom = pngInfo(pngCustom.bytes);
  check('custom-width PNG is 3200×2000', infoCustom.w === 3200 && infoCustom.h === 2000, `${infoCustom.w}×${infoCustom.h}`);

  // Oversize width errors in the summary before any download
  await inModal(
    page,
    `var w = sr.querySelector('#png-width'); w.value = '20000'; w.dispatchEvent(new Event('input')); return { ok: true };`,
  );
  const oversize = await inModal<{ text: string; isError: boolean }>(
    page,
    `var el = sr.querySelector('#png-summary'); return { text: el.textContent, isError: el.classList.contains('error') };`,
  );
  check('oversize PNG width shows inline error', oversize.isError && /16,?384/.test(oversize.text), oversize.text);
  await inModal(
    page,
    `var sel = sr.querySelector('#png-scale'); sel.value = '2'; sel.dispatchEvent(new Event('change')); return { ok: true };`,
  );

  // --- 9. PDF export, legend off: watermark survives outlining, vector mode ---
  await inModal(page, `sr.querySelector('#include-legend').click(); return { ok: true };`); // legend off
  await inModal(page, `sr.querySelector('.format-toggle button[data-format="pdf"]').click(); return { ok: true };`);
  const pdfVector = await download(page);
  check('PDF magic bytes', pdfVector.bytes.subarray(0, 5).toString('latin1') === '%PDF-');
  const vectorStreams = decodedStreams(pdfVector.bytes);
  check('legend-off vector PDF has no text-showing ops (all outlined)', !/\bTj\b|\bTJ\b/.test(vectorStreams));
  const curveOps = (vectorStreams.match(/ c\n| c /g) || []).length;
  check('legend-off vector PDF contains outline curves (watermark glyphs)', curveOps > 20, `${curveOps} curve ops`);
  writeFileSync(join(OUT_DIR, 'export-legend-off-vector.pdf'), pdfVector.bytes);

  // --- 10. PDF raster mode keeps the watermark vector ---
  await inModal(page, `sr.querySelector('.artwork-toggle button[data-artwork="raster"]').click(); return { ok: true };`);
  const pdfRaster = await download(page);
  const rasterStreams = decodedStreams(pdfRaster.bytes);
  const rasterCurves = (rasterStreams.match(/ c\n| c /g) || []).length;
  check('raster PDF embeds exactly one image', imageCount(pdfRaster.bytes) === 1, `${imageCount(pdfRaster.bytes)} images`);
  check('raster PDF still carries vector watermark outlines', rasterCurves > 20, `${rasterCurves} curve ops`);
  writeFileSync(join(OUT_DIR, 'export-legend-off-raster.pdf'), pdfRaster.bytes);

  // --- 10b. Raster pixel truth: the embedded JPEG must contain real artwork ---
  // Regression guard for the 2026-08-18 black-page export: every structural
  // check above passed while the embedded image was 100% black. MAIN_SOURCE
  // has a dark background, so assert variation, not lightness.
  {
    const images = listImages(await loadPdf(pdfRaster.bytes));
    check('raster PDF image is DCTDecode', images.length === 1 && images[0].filter === 'DCTDecode', images.map((i) => i.filter).join(','));
    const stats = pixelStats(decodeJpeg(images[0].bytes));
    check(
      'raster artwork pixels are not uniform/black',
      !stats.uniform && stats.pctBlack < 0.99 && stats.maxLuminance - stats.minLuminance > 40,
      `uniform=${stats.uniform} black=${(stats.pctBlack * 100).toFixed(1)}% lumRange=${(stats.maxLuminance - stats.minLuminance).toFixed(0)}`,
    );
  }

  // --- 10c. Cover sheet + raster: both embedded JPEGs carry real pixels ---
  await inModal(page, `sr.querySelector('#pdf-cover-sheet').click(); return { ok: true };`);
  const pdfCover = await download(page);
  {
    const doc = await loadPdf(pdfCover.bytes);
    check('cover PDF has 2 pages', doc.getPageCount() === 2, `${doc.getPageCount()} pages`);
    const images = listImages(doc).sort((a, b) => a.width - b.width);
    check('cover PDF embeds preview + artwork images', images.length === 2, `${images.length} images`);
    if (images.length === 2) {
      const preview = pixelStats(decodeJpeg(images[0].bytes));
      const artwork = pixelStats(decodeJpeg(images[1].bytes));
      check(
        'cover preview pixels non-uniform',
        !preview.uniform && preview.maxLuminance - preview.minLuminance > 40,
        `uniform=${preview.uniform} lumRange=${(preview.maxLuminance - preview.minLuminance).toFixed(0)}`,
      );
      check(
        'cover artwork raster pixels non-uniform',
        !artwork.uniform && artwork.pctBlack < 0.99 && artwork.maxLuminance - artwork.minLuminance > 40,
        `uniform=${artwork.uniform} black=${(artwork.pctBlack * 100).toFixed(1)}%`,
      );
    }
  }
  writeFileSync(join(OUT_DIR, 'export-cover-raster.pdf'), pdfCover.bytes);
  await inModal(page, `sr.querySelector('#pdf-cover-sheet').click(); return { ok: true };`); // cover off again

  // --- 10d. Failure injection: single-shot draws fail → tiled full-res succeeds ---
  // SwiftShader cannot lose a real GPU context, so the failure paths are
  // exercised by patching the verification/attempt seams on the prototype
  // (no shipped test hooks). 24 in wide × 800×500 viewBox → 7200×4500 raster.
  await inModal(page, `var w = sr.querySelector('#pdf-art-w'); w.value = '24'; w.dispatchEvent(new Event('input')); return { ok: true };`);
  await page.evaluate(`
    (function () {
      var proto = customElements.get('export-modal').prototype;
      window.__origAttempt = proto._attemptRasterDraw;
      window.__origVerify = proto._verifyCanvasDraw;
      proto._attemptRasterDraw = function (img, w, h, opts) {
        if (Math.max(w, h) > 3000) return { canvas: null, verdict: 'wiped' };
        return window.__origAttempt.call(this, img, w, h, opts);
      };
    })();
  `);
  const pdfTiled = await download(page);
  {
    const images = listImages(await loadPdf(pdfTiled.bytes)).sort((a, b) => b.width - a.width);
    const art = images[0];
    check('tiled fallback keeps the full 300 DPI raster', art.width === 7200 && art.height === 4500, `${art.width}×${art.height}`);
    const stats = pixelStats(decodeJpeg(art.bytes));
    check(
      'tiled raster pixels non-uniform',
      !stats.uniform && stats.maxLuminance - stats.minLuminance > 40,
      `uniform=${stats.uniform} lumRange=${(stats.maxLuminance - stats.minLuminance).toFixed(0)}`,
    );
  }

  // --- 10e. Failure injection: verification fails above 3000px → size ladder engages ---
  await page.evaluate(`
    (function () {
      var proto = customElements.get('export-modal').prototype;
      proto._attemptRasterDraw = window.__origAttempt;
      proto._verifyCanvasDraw = function (ctx, w, h, opts) {
        if (Math.max(w, h) > 3000) return 'wiped';
        return window.__origVerify.call(this, ctx, w, h, opts);
      };
    })();
  `);
  const pdfLadder = await download(page);
  {
    const images = listImages(await loadPdf(pdfLadder.bytes)).sort((a, b) => b.width - a.width);
    const art = images[0];
    // 7200×4500 ladder: 5091 (fails) → 3600 (fails) → 2546 (first ≤3000).
    check('ladder produced a reduced raster within [2048, 3000]', art.width <= 3000 && art.width >= 2048, `${art.width}×${art.height}`);
    const stats = pixelStats(decodeJpeg(art.bytes));
    check(
      'reduced raster pixels non-uniform',
      !stats.uniform && stats.maxLuminance - stats.minLuminance > 40,
      `uniform=${stats.uniform} lumRange=${(stats.maxLuminance - stats.minLuminance).toFixed(0)}`,
    );
  }
  const ladderStatus = await inModal<{ text: string }>(page, `return { text: sr.querySelector('.export-status').textContent };`);
  check('reduced-DPI notice shown', /DPI instead of 300 DPI/.test(ladderStatus.text), ladderStatus.text);

  // --- 10f. Failure injection: everything fails → loud error, no file ---
  await page.evaluate(`
    (function () {
      var proto = customElements.get('export-modal').prototype;
      proto._verifyCanvasDraw = function () { return 'wiped'; };
    })();
  `);
  await page.evaluate(`window.__saved = null;`);
  await inModal(page, `sr.querySelector('.download-btn').click(); return { ok: true };`);
  {
    const start = Date.now();
    let statusText = '';
    let isError = false;
    while (Date.now() - start < 60_000) {
      const s = await inModal<{ text: string; err: boolean }>(
        page,
        `var el = sr.querySelector('.export-status'); return { text: el.textContent, err: el.classList.contains('error') };`,
      );
      statusText = s.text;
      isError = s.err;
      if (isError) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    check('all-fail raster export raises a red error', isError && /exceeds what your browser can rasterize/.test(statusText), statusText);
    const savedAfterFail = await page.evaluate(`window.__saved`);
    check('all-fail raster export writes no file', savedAfterFail === null);
  }

  // --- 10g. PNG path: same verification + ladder (user-reported blank 4× PNG class) ---
  await page.evaluate(`
    (function () {
      var proto = customElements.get('export-modal').prototype;
      proto._verifyCanvasDraw = function (ctx, w, h, opts) {
        if (Math.max(w, h) > 3000) return 'wiped';
        return window.__origVerify.call(this, ctx, w, h, opts);
      };
    })();
  `);
  await inModal(page, `sr.querySelector('.format-toggle button[data-format="png"]').click(); return { ok: true };`);
  await inModal(
    page,
    `var sel = sr.querySelector('#png-scale'); sel.value = 'custom'; sel.dispatchEvent(new Event('change'));
     var w = sr.querySelector('#png-width'); w.value = '6000'; w.dispatchEvent(new Event('input'));
     return { ok: true };`,
  );
  const pngLadder = await download(page);
  const infoLadder = pngInfo(pngLadder.bytes);
  // 6000×3750 ladder: 4243 (fails) → 3000 (first ≤3000).
  check('PNG ladder reduced the 6000px request to 3000×1875', infoLadder.w === 3000 && infoLadder.h === 1875, `${infoLadder.w}×${infoLadder.h}`);
  {
    const stats = pixelStats(decodePng(pngLadder.bytes));
    check(
      'reduced PNG pixels non-blank',
      !stats.uniform && stats.pctTransparent < 0.99,
      `uniform=${stats.uniform} transparent=${(stats.pctTransparent * 100).toFixed(1)}%`,
    );
  }
  const pngStatus = await inModal<{ text: string }>(page, `return { text: sr.querySelector('.export-status').textContent };`);
  check('PNG reduced-size notice shown', /instead of 6,000/.test(pngStatus.text), pngStatus.text);

  // Restore the real methods and the state section 11 expects (PDF selected).
  await page.evaluate(`
    (function () {
      var proto = customElements.get('export-modal').prototype;
      proto._attemptRasterDraw = window.__origAttempt;
      proto._verifyCanvasDraw = window.__origVerify;
    })();
  `);
  await inModal(page, `var sel = sr.querySelector('#png-scale'); sel.value = '2'; sel.dispatchEvent(new Event('change')); return { ok: true };`);
  await inModal(page, `sr.querySelector('.format-toggle button[data-format="pdf"]').click(); return { ok: true };`);

  // --- 11. Picker-cancel skips the export ---
  await page.evaluate(`window.__rejectPicker = true; window.__saved = null;`);
  await inModal(page, `sr.querySelector('.download-btn').click(); return { ok: true };`);
  await new Promise((r) => setTimeout(r, 1500));
  const savedAfterCancel = await page.evaluate(`window.__saved`);
  check('cancelled save picker produces no file', savedAfterCancel === null);
  await page.evaluate(`window.__rejectPicker = false;`);

  // --- 12. Transparent PNG on an open-corner workspace ---
  const cornerWs = await createWorkspace(OPEN_CORNER_SOURCE, ownerId, 'unified-export-verify-corner');
  await page.goto(`${LOCAL_ORIGIN}/workspace/${cornerWs}`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await waitFor(page, PREVIEW_READY, 60_000, 'corner preview compile');
  await installSaveStub(page);
  await openModal(page);
  await inModal(page, `sr.querySelector('.format-toggle button[data-format="png"]').click(); return { ok: true };`);

  const pngOpaque = await download(page);
  const alphaBg = await cornerAlpha(page, pngOpaque.bytes);
  check('workspace background renders opaque by default', alphaBg === 255, `alpha=${alphaBg}`);

  await inModal(page, `sr.querySelector('#png-transparent').click(); return { ok: true };`);
  const pngTrans = await download(page);
  const infoTrans = pngInfo(pngTrans.bytes);
  check('transparent PNG is RGBA', infoTrans.colorType === 6, `colorType=${infoTrans.colorType}`);
  const alphaTrans = await cornerAlpha(page, pngTrans.bytes);
  check('transparent PNG has alpha-0 corner', alphaTrans === 0, `alpha=${alphaTrans}`);
  writeFileSync(join(OUT_DIR, 'export-transparent.png'), pngTrans.bytes);

  // --- 12b. Transparent / semi-transparent workspace background → PDF bleed fill ---
  // The PDF paints the bleed+margin rect with the workspace background so
  // trimmed posters are edge-to-edge. A fully transparent background
  // (oklch … / 0%) used to resolve to #000000 and paint the whole band solid
  // black (real user report, 2026-07-29); it must skip the fill instead —
  // paper stays white. A semi-transparent background must flatten over white,
  // not paint at full strength. The bleed fill is the only `re` followed by
  // `f` in the page stream: svg2pdf draws rects as m/l/h paths and emits `re`
  // only for clips (`re W n`), so jsPDF's doc.rect fill is unambiguous.
  const setWorkspaceBackground = async (value: string): Promise<void> => {
    await page.evaluate(`
      (function() {
        function findFooter(root) {
          var els = root.querySelectorAll('*');
          for (var i = 0; i < els.length; i++) {
            if (els[i].tagName === 'PLAYGROUND-FOOTER') return els[i];
            if (els[i].shadowRoot) {
              var f = findFooter(els[i].shadowRoot);
              if (f) return f;
            }
          }
          return null;
        }
        var footer = findFooter(document);
        var bg = footer && footer.shadowRoot.querySelector('#bg');
        if (!bg) throw new Error('footer #bg not found');
        bg.dispatchEvent(new CustomEvent('color-change', { detail: { value: '${value}' } }));
      })();
    `);
  };
  // `18.` = the bleed rect's x/top inset: bleed.x = trim.x − bleedPt = SLUG_PT
  // (0.25 in × 72 = 18 pt) whenever print prep is on — an invariant of
  // pdf-page-layout.ts independent of margins, unit, and page size. Update if
  // SLUG_PT ever changes.
  const bleedFillRe = /([\d.]+(?: [\d.]+ [\d.]+)?) (g|rg)\n18\. [\d.]+ [\d.]+ -[\d.]+ re\nf\n/;
  const bgCase = async (bg: string): Promise<string> => {
    // Full reload each time — the modal snapshots workspace state on open().
    await page.goto(`${LOCAL_ORIGIN}/workspace/${mainWs}`, { waitUntil: 'networkidle2', timeout: 60_000 });
    await waitFor(page, PREVIEW_READY, 60_000, 'preview recompile for background case');
    await installSaveStub(page);
    await setWorkspaceBackground(bg);
    await openModal(page);
    await inModal(page, `sr.querySelector('.format-toggle button[data-format="pdf"]').click(); return { ok: true };`);
    return decodedStreams((await download(page)).bytes);
  };

  const zeroAlphaStreams = await bgCase('oklch(75% 75% 180 / 0%)');
  check('transparent workspace background → no bleed fill (no black band)', !/re\nf\n/.test(zeroAlphaStreams));
  // ` c` curve ops come only from the artwork's circle() calls via svg2pdf —
  // crop-mark doc.line() segments are straight `l` ops and always present, so
  // they must not satisfy this check.
  check('transparent-background PDF still draws the artwork', / c\n/.test(zeroAlphaStreams));

  const semiAlphaStreams = await bgCase('oklch(75% 75% 180 / 25%)');
  const semiFill = bleedFillRe.exec(semiAlphaStreams);
  const semiChannels = semiFill ? semiFill[1].split(' ').map(parseFloat) : [];
  check('semi-transparent background → bleed fill present', !!semiFill, semiFill ? `${semiFill[1]} ${semiFill[2]}` : 'no fill op');
  check(
    'semi-transparent bleed fill flattened over white (all channels ≥ 0.7)',
    semiChannels.length > 0 && semiChannels.every((c) => c >= 0.7),
    semiChannels.join(', '),
  );
  // The clone's #preview-bg rect must be stripped for PDF: left in, it would
  // re-composite the raw semi-transparent color on top of the already-
  // flattened page fill (deeper tint inside the artwork than in the margins).
  // MAIN_SOURCE draws exactly one full-canvas path itself (the background
  // layer's rect(0,0,800,500)); #preview-bg would be a second one.
  const fullCanvasEdges = (semiAlphaStreams.match(/800\. 0\. l\n/g) || []).length;
  check('background painted once — #preview-bg stripped, no double composite', fullCanvasEdges === 1, `${fullCanvasEdges} full-canvas paths`);

  // --- 13. Standalone bundle registers the zoom pill (the VS Code webview
  // path: a bare page that loads ONLY pan-zoom.global.js — no playground
  // modules, no theme.css). Styles must come from adoptedStyleSheets.
  const barePage = await browser.newPage();
  await barePage.setContent('<!DOCTYPE html><html><body></body></html>');
  await barePage.addScriptTag({ path: join(process.cwd(), 'dist', 'pan-zoom.global.js') });
  const pillStandalone = (await barePage.evaluate(`(() => {
    if (!customElements.get('pathogen-zoom-pill')) return { registered: false };
    const pill = document.createElement('pathogen-zoom-pill');
    document.body.appendChild(pill);
    const level = pill.shadowRoot.querySelector('#zoom-level');
    return {
      registered: true,
      level: level ? level.value : '(missing)',
      styled: pill.shadowRoot.adoptedStyleSheets.length > 0 || !!pill.shadowRoot.querySelector('style'),
      radius: getComputedStyle(pill).borderRadius,
      hasDefaults: typeof window.PathogenPanZoom.DEFAULTS === 'object' && window.PathogenPanZoom.DEFAULTS.maxZoom === 20,
    };
  })()`)) as { registered: boolean; level?: string; styled?: boolean; radius?: string; hasDefaults?: boolean };
  check(
    'pan-zoom.global.js alone registers a styled pill (VS Code webview path)',
    pillStandalone.registered === true &&
      pillStandalone.level === '100%' &&
      pillStandalone.styled === true &&
      pillStandalone.radius === '999px' &&
      pillStandalone.hasDefaults === true,
    JSON.stringify(pillStandalone),
  );
  await barePage.close();

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    for (const f of failed) console.log(`  FAILED: ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

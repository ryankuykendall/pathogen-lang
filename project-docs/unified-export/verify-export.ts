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

const LOCAL_ORIGIN = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';
const OUT_DIR = join(process.cwd(), 'project-docs', 'unified-export', 'verify');

// 800 × 500 canvas → PNG 2× = 1600 × 1000. Includes text (outliner path),
// a comment + keyword-rich source (highlight classes), and a dark background
// (watermark contrast).
const MAIN_SOURCE = `define ViewBox(0, 0, 800, 500);

define default PathLayer('background') \${
  fill: #14101c;
}

layer('background').apply {
  rect(0, 0, 800, 500);
}

// concentric study
define PathLayer('rings') \${
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

define default PathLayer('dot') \${
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
  await page.evaluate(
    `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));`,
  );
  const xAfter = await readLegendX();
  check(
    'double-open does not duplicate listeners (arrow nudges exactly one step)',
    Math.abs(xAfter - xBefore - snapStep.v) < 0.01,
    `moved ${xAfter - xBefore}, snap=${snapStep.v}`,
  );
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
      snapHidden: sr.querySelector('.snap-group').hidden,
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
  await page.screenshot({ path: join(OUT_DIR, 'modal-default.png') });

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
      snapHidden: sr.querySelector('.snap-group').hidden,
      highlightOn: sr.querySelector('#legend-highlight').checked,
      kwTspans: sr.querySelectorAll('.preview-area svg #pathogen-legend tspan[fill="#6d3aa6"]').length,
      watermarkGone: !sr.querySelector('.preview-area svg #pathogen-watermark'),
    };`,
  );
  check('legend toggle reveals fields + snap controls', !legendState.legendHidden && !legendState.snapHidden);
  check('highlighting defaults ON with colored keyword tspans in preview', legendState.highlightOn && legendState.kwTspans > 0, `${legendState.kwTspans} kw tspans`);
  check('watermark removed while legend is on', legendState.watermarkGone);
  await page.screenshot({ path: join(OUT_DIR, 'modal-legend-highlight.png') });

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

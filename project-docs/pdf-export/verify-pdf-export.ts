/**
 * End-to-end verification for the Export-with-Legend PDF feature.
 * Drives the real playground UI (menu event → modal → format/settings → Download),
 * captures the produced files via a showSaveFilePicker stub, and asserts on bytes.
 *
 * Requires: wrangler pages dev on :3000 and the API worker on :8787.
 * Outputs: PDFs/SVG + screenshots into project-docs/pdf-export/verify/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import puppeteer, { type Page } from 'puppeteer';

const LOCAL_ORIGIN = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';
const OUT_DIR = join(process.cwd(), 'project-docs', 'pdf-export', 'verify');

const MAIN_SOURCE = `define ViewBox(0, 0, 800, 500);

define default PathLayer('background') \${
  fill: #14101c;
}

layer('background').apply {
  rect(0, 0, 800, 500);
}

define PathLayer('rings') \${
  stroke: #f7b56e;
  stroke-width: 3;
  fill: #b384e0;
}

layer('rings').apply {
  circle(620, 120, 46);
  circle(200, 300, 80);
}

define TextLayer('labels') \${}

let title = &{
  text(0, 36)\`Aurora Waves\`
} << \${ font-size: 36; font-family: Raleway; fill: #f6e9da; };

layer('labels').apply {
  title.project(40, 40).draw();
}
`;

// svg2pdf can't parse oklch() — the normalization pass must convert paints to
// sRGB hex or every fill silently renders black (found via a real user export).
const OKLCH_SOURCE = `define ViewBox(0, 0, 400, 300);

define default PathLayer('background') \${
  fill: oklch(0.25 0.05 300);
  stroke: none;
}

layer('background').apply {
  rect(0, 0, 400, 300);
}

define PathLayer('dots') \${
  fill: oklch(0.75 0.15 340);
  stroke: oklch(0.85 0.1 90);
  stroke-width: 2;
}

layer('dots').apply {
  circle(100, 150, 50);
  circle(300, 150, 50);
}
`;

// Trips _isArtworkComplex via the >1.5M-char d-length threshold (loop
// commands merge into one path element, so the node-count route is
// impractical to compile). 25k float-coordinate circles ≈ 1.59M chars
// (measured; integer coordinates compress to ~0.7M and DON'T trip it).
const COMPLEX_SOURCE = `define ViewBox(0, 0, 800, 500);

define default PathLayer('background') \${
  fill: #ffffff;
  stroke: none;
}

layer('background').apply {
  rect(0, 0, 800, 500);
}

define PathLayer('field') \${
  stroke: #445566;
  stroke-width: 0.3;
  fill: none;
}

layer('field').apply {
  for (i in 0..25000) {
    circle(calc((i % 160) * 5.13 + 2.07), calc(floor(i / 160) * 5.13 + 2.07), 2.5);
  }
}
`;

// Mirrors the real-user failure scale: a huge canvas whose raster hits the
// 8192px cap (the data-URL image path blew the regex stack at this size).
const BIG_CANVAS_SOURCE = `define ViewBox(0, 0, 8200, 10000);

define default PathLayer('background') \${
  fill: #ddd;
  stroke: none;
}

layer('background').apply {
  rect(0, 0, 8200, 10000);
}

define PathLayer('rings') \${
  stroke: #222222;
  stroke-width: 12;
  fill: none;
}

layer('rings').apply {
  circle(4100, 5000, 1200);
  circle(4100, 5000, 2200);
  circle(4100, 5000, 3200);
}
`;

// Dense micro-segment artwork (stays under the complexity heuristic so
// Vector remains the default) for the Detail decimation + Precision checks.
const DENSE_SOURCE = `define ViewBox(0, 0, 800, 500);

define default PathLayer('background') \${
  fill: #ffffff;
  stroke: none;
}

layer('background').apply {
  rect(0, 0, 800, 500);
}

define PathLayer('dense') \${
  stroke: #333333;
  stroke-width: 0.5;
  fill: none;
}

layer('dense').apply {
  M 100 250
  for (i in 0..4000) {
    l 0.05 calc(sin(i * 0.7) * 0.04)
  }
  L 700 250
}

let arrow = @{
  m 0 0 l 10 5 l -10 5 z
};

let arrowMarker = Marker('arrowhead', 10, 10) {|m|
  m.append(arrow, \${ fill: #333333; });
};

define PathLayer('pointer') \${
  stroke: #333333;
  stroke-width: 2;
  fill: none;
  marker-end: arrowMarker;
}

layer('pointer').apply {
  M 100 400 L 300 420
}
`;

const MASK_SOURCE = `define ViewBox(0, 0, 200, 200);

define default PathLayer('background') \${
  fill: #ffffff;
}

layer('background').apply {
  rect(0, 0, 200, 200);
}

let fullRect = @{ m 0 0 l 200 0 l 0 200 l -200 0 z };
let circleShape = @{ m 100 50 a 50 50 0 1 1 0 100 a 50 50 0 1 1 0 -100 };

let m = Mask('circle-reveal');
m.append(fullRect, \${ fill: black; });
m.append(circleShape, \${ fill: white; });

define PathLayer('drawing') \${ mask: m.id; stroke: #333333; stroke-width: 2; }
layer('drawing').apply {
  for (i in 0..20) {
    M 0 calc(i * 10)
    L 200 calc(i * 10)
  }
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

/** Shadow-DOM-aware element runner: finds export-legend-modal and evals fn body. */
const MODAL_EVAL_PREFIX = `
  function findModal(root) {
    var els = root.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      if (els[i].tagName === 'EXPORT-LEGEND-MODAL') return els[i];
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
    window.showSaveFilePicker = async (opts) => ({
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
    });
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

function mediaBoxAll(pdf: Buffer): [number, number][] {
  const text = pdf.toString('latin1');
  return [...text.matchAll(/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [
    parseFloat(m[1]),
    parseFloat(m[2]),
  ]);
}

function imageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Subtype\s*\/Image/g) || []).length;
}

function mediaBox(pdf: Buffer): [number, number] {
  const text = pdf.toString('latin1');
  const m = /MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text);
  if (!m) throw new Error('no MediaBox found');
  return [parseFloat(m[1]), parseFloat(m[2])];
}

/** Inflate every FlateDecode stream and concatenate the decoded content. */
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
      out += inflateSync(pdf.subarray(start, end)).toString('latin1');
    } catch {
      out += raw.slice(start, end); // uncompressed stream
    }
  }
  return out;
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
      if (els[i].tagName === 'EXPORT-LEGEND-MODAL') return els[i];
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
  await page.evaluate(`document.dispatchEvent(new CustomEvent('export-legend', { bubbles: true, composed: true }));`);
  await waitFor(page, WAIT_MODAL_OPEN, 10_000, 'modal open');
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const ownerId = makeAnonId();
  const mainWs = await createWorkspace(MAIN_SOURCE, ownerId, 'pdf-export-verify');
  const maskWs = await createWorkspace(MASK_SOURCE, ownerId, 'pdf-export-verify-mask');
  const oklchWs = await createWorkspace(OKLCH_SOURCE, ownerId, 'pdf-export-verify-oklch');
  const bigWs = await createWorkspace(BIG_CANVAS_SOURCE, ownerId, 'pdf-export-verify-big');
  const denseWs = await createWorkspace(DENSE_SOURCE, ownerId, 'pdf-export-verify-dense');
  const complexWs = await createWorkspace(COMPLEX_SOURCE, ownerId, 'pdf-export-verify-complex');
  console.log(`workspaces: ${mainWs}, ${maskWs}, ${oklchWs}, ${bigWs}, ${denseWs}, ${complexWs}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
    protocolTimeout: 180_000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  page.on('dialog', (d) => void d.dismiss());
  await page.evaluateOnNewDocument(`localStorage.setItem('${ANON_KEY}', '${ownerId}');`);

  // --- Main workspace ---
  await page.goto(`${LOCAL_ORIGIN}/workspace/${mainWs}`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await waitFor(page, PREVIEW_READY, 60_000, 'preview compile');
  await installSaveStub(page);
  await openModal(page);

  // Footer check in the live preview SVG
  const footer = await inModal<{ text: string }>(
    page,
    `var brand = sr.querySelector('.preview-area svg .legend-brand') || sr.querySelector('.preview-area svg text.legend-brand');
     return { text: brand ? brand.textContent : '(missing)' };`,
  );
  check('footer reads "Created in pathogen.studio"', footer.text.includes('Created in') && footer.text.includes('pathogen.studio'), footer.text);

  // Switch to PDF, keep Match-artwork defaults, screenshot both themes
  await inModal(page, `sr.querySelector('.format-toggle button[data-format="pdf"]').click(); return { ok: true };`);
  const summary = await inModal<{ text: string; btn: string; hidden: boolean }>(
    page,
    `return {
      text: sr.querySelector('#pdf-summary').textContent,
      btn: sr.querySelector('.download-btn').textContent,
      hidden: sr.querySelector('.pdf-settings').hidden,
    };`,
  );
  check('PDF settings visible + button label', !summary.hidden && summary.btn.includes('PDF'), summary.btn.trim());
  check('match-mode summary present', summary.text.includes('Artwork 800 × 500'), summary.text);

  // Illustrative artifacts only — no check() depends on these. macOS graphics
  // stack flakiness can hang Page.captureScreenshot; never let that kill the
  // check run.
  try {
    await page.screenshot({ path: join(OUT_DIR, 'modal-pdf-light.png'), captureBeyondViewport: false });
    await page.evaluate(`document.documentElement.setAttribute('data-theme', 'dark');`);
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: join(OUT_DIR, 'modal-pdf-dark.png'), captureBeyondViewport: false });
  } catch (err) {
    console.warn('theme screenshots skipped (environmental):', (err as Error).message?.slice(0, 80));
  }
  await page.evaluate(`document.documentElement.setAttribute('data-theme', 'light');`);

  // A) Match-artwork PDF (24in wide, 0.5in margins, print prep on)
  const pdfA = await download(page);
  writeFileSync(join(OUT_DIR, 'match-24in.pdf'), pdfA.bytes);
  check('A: filename', pdfA.name.endsWith('-with-legend.pdf'), pdfA.name);
  check('A: %PDF header', pdfA.bytes.subarray(0, 5).toString() === '%PDF-');
  {
    const [w, h] = mediaBox(pdfA.bytes);
    // artwork 24×15in + 1in margins = trim 25×16in = 1800×1152pt; +2*(9+18) slug/bleed = 1854×1206
    check('A: MediaBox 1854×1206', Math.abs(w - 1854) < 1 && Math.abs(h - 1206) < 1, `${w}×${h}`);
    // jsPDF declares (but never uses) the standard-14 fonts in Resources; the
    // fidelity guarantee is no embedded font programs AND no text operators.
    check('A: no embedded font programs', !pdfA.bytes.toString('latin1').includes('/FontFile'));
    const content = decodedStreams(pdfA.bytes);
    check('A: no BT text operators', !/\bBT\b/.test(content));
    check('A: has vector path ops', /\bre\b|\bc\b|\bl\b/.test(content));
  }

  // A2) Manual raster mode: artwork becomes an image, legend stays vector
  await inModal(page, `sr.querySelector('.artwork-toggle button[data-artwork="raster"]').click(); return { ok: true };`);
  const pdfA2 = await download(page);
  writeFileSync(join(OUT_DIR, 'raster-mode.pdf'), pdfA2.bytes);
  const a2Status = await inModal<{ text: string }>(page, `return { text: sr.querySelector('.export-status').textContent };`);
  check('A2: raster mode → image XObject', /\/Subtype\s*\/Image/.test(pdfA2.bytes.toString('latin1')));
  check('A2: raster notice shown', a2Status.text.includes('raster'), a2Status.text);
  check('A2: still no font programs', !pdfA2.bytes.toString('latin1').includes('/FontFile'));
  await inModal(page, `sr.querySelector('.artwork-toggle button[data-artwork="vector"]').click(); return { ok: true };`);

  // B) SVG export unchanged + new footer + embedded Baumans
  await inModal(page, `sr.querySelector('.format-toggle button[data-format="svg"]').click(); return { ok: true };`);
  const svgB = await download(page);
  writeFileSync(join(OUT_DIR, 'export.svg'), svgB.bytes);
  const svgText = svgB.bytes.toString('utf8');
  check('B: SVG filename', svgB.name.endsWith('-with-legend.svg'), svgB.name);
  check('B: xml header', svgText.startsWith('<?xml'));
  check('B: footer text', svgText.includes('Created in') && svgText.includes('pathogen.studio'));
  check('B: Baumans embedded', svgText.includes('@font-face') && svgText.includes('Baumans'));
  check('B: still has live <text>', svgText.includes('<text'));

  // C) A4 landscape preset PDF
  await inModal(page, `sr.querySelector('.format-toggle button[data-format="pdf"]').click(); return { ok: true };`);
  await inModal(
    page,
    `var sel = sr.querySelector('#pdf-page-size'); sel.value = 'a4'; sel.dispatchEvent(new Event('change'));
     sr.querySelector('.orient-toggle button[data-orient="landscape"]').click();
     return { orientHidden: sr.querySelector('#pdf-orient-row').hidden };`,
  );
  const pdfC = await download(page);
  writeFileSync(join(OUT_DIR, 'a4-landscape.pdf'), pdfC.bytes);
  {
    const [w, h] = mediaBox(pdfC.bytes);
    check('C: A4 landscape MediaBox ≈ 895.9×649.3', Math.abs(w - 895.89) < 1 && Math.abs(h - 649.28) < 1, `${w}×${h}`);
  }

  // D) Margin too large → error surfaced, no download
  await inModal(
    page,
    `var sel = sr.querySelector('#pdf-page-size'); sel.value = 'letter'; sel.dispatchEvent(new Event('change'));
     var m = sr.querySelector('#pdf-margin'); m.value = '6'; m.dispatchEvent(new Event('input'));
     return { summary: sr.querySelector('#pdf-summary').textContent };`,
  );
  const dSummary = await inModal<{ text: string; cls: string }>(
    page,
    `var s = sr.querySelector('#pdf-summary'); return { text: s.textContent, cls: s.className };`,
  );
  check('D: summary shows margin error', dSummary.text.includes('Margins are too large') && dSummary.cls.includes('error'), dSummary.text);
  await page.evaluate(`window.__saved = null;`);
  await inModal(page, `sr.querySelector('.download-btn').click(); return { ok: true };`);
  await new Promise((r) => setTimeout(r, 1500));
  const dSaved = await page.evaluate(`window.__saved`);
  const dStatus = await inModal<{ text: string }>(page, `return { text: sr.querySelector('.export-status').textContent };`);
  check('D: no file produced + status error', dSaved === null && dStatus.text.includes('Margins are too large'), dStatus.text);
  // restore margin for later runs
  await inModal(page, `var m = sr.querySelector('#pdf-margin'); m.value = '0.5'; m.dispatchEvent(new Event('input')); return { ok: true };`);

  // --- Mask workspace: raster fallback ---
  await page.goto(`${LOCAL_ORIGIN}/workspace/${maskWs}`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await waitFor(page, PREVIEW_READY, 60_000, 'mask preview compile');
  await installSaveStub(page);
  await openModal(page);
  await inModal(page, `sr.querySelector('.format-toggle button[data-format="pdf"]').click(); return { ok: true };`);
  const pdfE = await download(page);
  writeFileSync(join(OUT_DIR, 'mask-raster.pdf'), pdfE.bytes);
  const eStatus = await inModal<{ text: string }>(page, `return { text: sr.querySelector('.export-status').textContent };`);
  check('E: raster notice shown', eStatus.text.includes('raster'), eStatus.text);
  check('E: PDF contains an image XObject', /\/Subtype\s*\/Image/.test(pdfE.bytes.toString('latin1')));
  check('E: no embedded font programs', !pdfE.bytes.toString('latin1').includes('/FontFile'));
  check('E: no BT text operators', !/\bBT\b/.test(decodedStreams(pdfE.bytes)));

  // --- OKLCH workspace: paint normalization must keep colors ---
  await page.goto(`${LOCAL_ORIGIN}/workspace/${oklchWs}`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await waitFor(page, PREVIEW_READY, 60_000, 'oklch preview compile');
  await installSaveStub(page);
  await openModal(page);
  await inModal(page, `sr.querySelector('.format-toggle button[data-format="pdf"]').click(); return { ok: true };`);
  const pdfF = await download(page);
  writeFileSync(join(OUT_DIR, 'oklch-colors.pdf'), pdfF.bytes);
  {
    const content = decodedStreams(pdfF.bytes);
    // Fill (rg) and stroke (RG) color operators.
    const paints = [...content.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) (rg|RG)/g)].map((m) =>
      [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])] as [number, number, number],
    );
    // A chromatic paint has real channel spread; all-black/gray output has none.
    // Expect ≥3: purple background, pink dot fill, yellow dot stroke.
    const chromatic = paints.filter((c) => Math.max(...c) - Math.min(...c) > 0.1);
    check('F: PDF has chromatic paints (oklch survived)', chromatic.length >= 3, `${paints.length} paint ops, ${chromatic.length} chromatic`);
    check('F: not all-black artwork', chromatic.length > 0);
  }

  // --- Big-canvas workspace: print-resolution raster must not crash ---
  await page.goto(`${LOCAL_ORIGIN}/workspace/${bigWs}`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await waitFor(page, PREVIEW_READY, 60_000, 'big-canvas preview compile');
  await installSaveStub(page);
  await openModal(page);
  await inModal(
    page,
    `sr.querySelector('.format-toggle button[data-format="pdf"]').click();
     sr.querySelector('.artwork-toggle button[data-artwork="raster"]').click();
     return { summary: sr.querySelector('#pdf-summary').textContent };`,
  );
  const pdfG = await download(page);
  writeFileSync(join(OUT_DIR, 'big-raster.pdf'), pdfG.bytes);
  const gRaw = pdfG.bytes.toString('latin1');
  check('G: big raster export completes (no stack overflow)', pdfG.bytes.length > 10_000, `${(pdfG.bytes.length / 1e6).toFixed(1)} MB`);
  check('G: JPEG image XObject (DCTDecode)', /\/DCTDecode/.test(gRaw));
  check('G: legend still vector (no BT, no FontFile)', !gRaw.includes('/FontFile') && !/\bBT\b/.test(decodedStreams(pdfG.bytes)));

  // --- Dense workspace: Detail decimation + per-export Precision ---
  await page.goto(`${LOCAL_ORIGIN}/workspace/${denseWs}`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await waitFor(page, PREVIEW_READY, 60_000, 'dense preview compile');
  await installSaveStub(page);
  await openModal(page);

  const densePathD = (svgBytes: Buffer): string => {
    const text = svgBytes.toString('utf8');
    const tag = text.match(/<path[^>]*data-layer-name="dense"[^>]*>/)?.[0] ?? '';
    return tag.match(/ d="([^"]+)"/)?.[1] ?? '';
  };
  const markerPathD = (svgBytes: Buffer): string => {
    const markerEl = svgBytes.toString('utf8').match(/<marker[\s\S]*?<\/marker>/)?.[0] ?? '';
    return markerEl.match(/ d="([^"]+)"/)?.[1] ?? '';
  };

  // H5 control: defaults (Precision = Match) — artwork d untouched
  const svgControl = await download(page);
  const dControl = densePathD(svgControl.bytes);
  check('H: control SVG has the dense path', dControl.length > 1000);

  const svgControl2 = await download(page);
  check('H: Precision=Match is byte-stable', densePathD(svgControl2.bytes) === dControl);

  // H3: Precision = 2 → absolute commands, ≤2 decimals, legend text intact
  await inModal(
    page,
    `var p = sr.querySelector('#export-precision'); p.value = '2'; p.dispatchEvent(new Event('change')); return { ok: true };`,
  );
  const svgTrimmed = await download(page);
  const dTrimmed = densePathD(svgTrimmed.bytes);
  check('H: precision-trimmed d is absolute', / L /.test(dTrimmed) && !/ l /.test(dTrimmed), dTrimmed.slice(0, 40));
  {
    const overlong = (dTrimmed.match(/-?\d+\.\d{3,}/g) || []).length;
    check('H: precision-trimmed d has ≤2 decimals', overlong === 0, `${overlong} overlong tokens`);
    check('H: d changed vs control', dTrimmed !== dControl);
    check('H: legend still live text in SVG', svgTrimmed.bytes.toString('utf8').includes('pathogen.studio'));
    // Defs-scoped geometry (marker arrowhead) must never be optimized — it
    // lives in its own coordinate system.
    const markerControl = markerPathD(svgControl.bytes);
    check('H: marker path untouched by precision pass', markerControl.length > 0 && markerPathD(svgTrimmed.bytes) === markerControl, markerControl);
  }

  // H1: PDF Detail Full vs Standard (Precision back to Match for isolation)
  await inModal(
    page,
    `var p = sr.querySelector('#export-precision'); p.value = 'match'; p.dispatchEvent(new Event('change'));
     sr.querySelector('.format-toggle button[data-format="pdf"]').click();
     return {
       detail: sr.querySelector('#pdf-detail').value,
       rowHidden: sr.querySelector('#pdf-detail-row').hidden,
     };`,
  ).then((r) => {
    const v = r as { detail: string; rowHidden: boolean };
    check('H: non-complex artwork defaults Detail=Full, row visible', v.detail === 'full' && !v.rowHidden, v.detail);
  });

  const countLineOps = (pdf: Buffer): number => (decodedStreams(pdf).match(/ l\n/g) || []).length;

  const pdfFull = await download(page);
  writeFileSync(join(OUT_DIR, 'dense-full.pdf'), pdfFull.bytes);
  const fullOps = countLineOps(pdfFull.bytes);

  await inModal(
    page,
    `var d = sr.querySelector('#pdf-detail'); d.value = 'standard'; d.dispatchEvent(new Event('change')); return { ok: true };`,
  );
  const pdfStd = await download(page);
  writeFileSync(join(OUT_DIR, 'dense-standard.pdf'), pdfStd.bytes);
  const stdOps = countLineOps(pdfStd.bytes);
  const hStatus = await inModal<{ text: string }>(page, `return { text: sr.querySelector('.export-status').textContent };`);
  check('H: Standard culls line ops vs Full', stdOps > 0 && stdOps < fullOps, `${fullOps} → ${stdOps}`);
  check('H: reduction notice shown', hStatus.text.includes('Detail: removed'), hStatus.text);
  check('H: Standard PDF smaller than Full', pdfStd.bytes.length < pdfFull.bytes.length, `${pdfFull.bytes.length} → ${pdfStd.bytes.length}`);

  // H4: floatPrecision — no 17-digit float artifacts in the content stream
  check('H: no overlong floats in PDF stream', !/\d\.\d{7,}/.test(decodedStreams(pdfStd.bytes)));

  // H2: Detail row hides in Raster mode
  await inModal(
    page,
    `sr.querySelector('.artwork-toggle button[data-artwork="raster"]').click();
     return { hidden: sr.querySelector('#pdf-detail-row').hidden };`,
  ).then((r) => check('H: Detail row hidden in Raster mode', (r as { hidden: boolean }).hidden));

  // --- Section I: cover sheet ---
  // Fresh navigation to the dense (non-complex) workspace for clean defaults.
  await page.goto(`${LOCAL_ORIGIN}/workspace/${denseWs}`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await waitFor(page, PREVIEW_READY, 60_000, 'dense preview recompile');
  await installSaveStub(page);
  await openModal(page);
  await inModal(
    page,
    `sr.querySelector('.format-toggle button[data-format="pdf"]').click();
     return { cover: sr.querySelector('#pdf-cover-sheet').checked };`,
  ).then((r) => check('I: cover defaults OFF for non-complex artwork', !(r as { cover: boolean }).cover));

  // Force cover ON, vector, full detail → two pages, Letter + poster
  await inModal(
    page,
    `sr.querySelector('#pdf-cover-sheet').checked = true;
     sr.querySelector('#pdf-cover-sheet').dispatchEvent(new Event('change'));
     var d = sr.querySelector('#pdf-detail'); d.value = 'full'; d.dispatchEvent(new Event('change'));
     return { ok: true };`,
  );
  const pdfI = await download(page);
  writeFileSync(join(OUT_DIR, 'cover-vector.pdf'), pdfI.bytes);
  {
    const boxes = mediaBoxAll(pdfI.bytes);
    check('I: cover ON → two pages', boxes.length === 2, JSON.stringify(boxes));
    check('I: page 1 is Letter', boxes.length === 2 && Math.abs(boxes[0][0] - 612) < 1 && Math.abs(boxes[0][1] - 792) < 1);
    check('I: page 2 is the artwork page', boxes.length === 2 && Math.abs(boxes[1][0] - 1854) < 1 && Math.abs(boxes[1][1] - 1206) < 1);
    check('I: exactly one image (the cover preview)', imageCount(pdfI.bytes) === 1);
    const raw = pdfI.bytes.toString('latin1');
    check('I: document stays font-free', !raw.includes('/FontFile') && !/\bBT\b/.test(decodedStreams(pdfI.bytes)));
    check('I: no overlong floats with cover', !/\d\.\d{7,}/.test(decodedStreams(pdfI.bytes)));
    const iStatus = await inModal<{ text: string }>(page, `return { text: sr.querySelector('.export-status').textContent };`);
    check('I: cover notice shown', iStatus.text.includes('Cover sheet added'), iStatus.text);
  }

  // Cover + Standard detail + long creator: the reduction numbers make the
  // Artwork manifest value long, and the creator overflows the meta line —
  // the previously untested width-bounding path (values truncate, no clip).
  await inModal(
    page,
    `var n = sr.querySelector('#legend-name');
     n.value = 'An Extraordinarily Long Workspace Title That Would Overflow The Cover Page Without Width Bounding';
     n.dispatchEvent(new Event('input'));
     var c = sr.querySelector('#legend-creator');
     c.value = 'Jane Smith, Senior Generative Designer and Creative Technologist, Acme Creative Studios International LLC';
     c.dispatchEvent(new Event('input'));
     var d = sr.querySelector('#pdf-detail'); d.value = 'standard'; d.dispatchEvent(new Event('change'));
     return { ok: true };`,
  );
  const pdfIlong = await download(page);
  writeFileSync(join(OUT_DIR, 'cover-long-values.pdf'), pdfIlong.bytes);
  {
    const boxes = mediaBoxAll(pdfIlong.bytes);
    const status = await inModal<{ text: string }>(page, `return { text: sr.querySelector('.export-status').textContent };`);
    check('I: cover + Standard detail + long creator exports cleanly', boxes.length === 2 && imageCount(pdfIlong.bytes) === 1, JSON.stringify(boxes));
    check('I: reduction + cover notices coexist', status.text.includes('Detail: removed') && status.text.includes('Cover sheet added'), status.text);
  }
  await inModal(
    page,
    `var c = sr.querySelector('#legend-creator'); c.value = ''; c.dispatchEvent(new Event('input'));
     var d = sr.querySelector('#pdf-detail'); d.value = 'full'; d.dispatchEvent(new Event('change'));
     return { ok: true };`,
  );

  // Units = cm → A4 cover
  await inModal(
    page,
    `var u = sr.querySelector('#pdf-unit'); u.value = 'cm'; u.dispatchEvent(new Event('change')); return { ok: true };`,
  );
  const pdfIcm = await download(page);
  {
    const boxes = mediaBoxAll(pdfIcm.bytes);
    check('I: cm units → A4 cover', boxes.length === 2 && Math.abs(boxes[0][0] - 595.28) < 1 && Math.abs(boxes[0][1] - 841.89) < 1, JSON.stringify(boxes[0]));
  }
  await inModal(
    page,
    `var u = sr.querySelector('#pdf-unit'); u.value = 'in'; u.dispatchEvent(new Event('change')); return { ok: true };`,
  );

  // Toggle OFF → single page (back-compat)
  await inModal(
    page,
    `sr.querySelector('#pdf-cover-sheet').checked = false;
     sr.querySelector('#pdf-cover-sheet').dispatchEvent(new Event('change'));
     return { ok: true };`,
  );
  const pdfIoff = await download(page);
  check('I: cover OFF → single page', mediaBoxAll(pdfIoff.bytes).length === 1);

  // Cover + Raster artwork → 2 pages, 2 images (preview + artwork raster)
  await inModal(
    page,
    `sr.querySelector('#pdf-cover-sheet').checked = true;
     sr.querySelector('#pdf-cover-sheet').dispatchEvent(new Event('change'));
     sr.querySelector('.artwork-toggle button[data-artwork="raster"]').click();
     return { ok: true };`,
  );
  const pdfIraster = await download(page);
  writeFileSync(join(OUT_DIR, 'cover-raster.pdf'), pdfIraster.bytes);
  check('I: cover + raster → two pages, two images', mediaBoxAll(pdfIraster.bytes).length === 2 && imageCount(pdfIraster.bytes) === 2, `${imageCount(pdfIraster.bytes)} images`);

  // Complex workspace: cover defaults ON (same flag also defaults Raster)
  await page.goto(`${LOCAL_ORIGIN}/workspace/${complexWs}`, { waitUntil: 'networkidle2', timeout: 120_000 });
  await waitFor(page, PREVIEW_READY, 120_000, 'complex preview compile');
  await installSaveStub(page);
  await openModal(page);
  await inModal(
    page,
    `sr.querySelector('.format-toggle button[data-format="pdf"]').click();
     return {
       cover: sr.querySelector('#pdf-cover-sheet').checked,
       raster: sr.querySelector('.artwork-toggle button[data-artwork="raster"]').classList.contains('active'),
     };`,
  ).then((r) => {
    const v = r as { cover: boolean; raster: boolean };
    check('I: complex artwork defaults cover ON (+ raster corroboration)', v.cover && v.raster, JSON.stringify(v));
  });

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

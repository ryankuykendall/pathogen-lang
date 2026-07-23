/**
 * Shoots the blog post assets for the unified-export launch post using the
 * real Meridian Bloom sample (post30).
 *
 * Produces:
 *   website/blog-static/unified-export-modal.png       (default state: format toggle, legend off, watermark)
 *   website/blog-static/unified-export-legend.png      (legend on, syntax-highlighted code card detail)
 *   website/blog-static/unified-export-png.png         (PNG settings panel)
 *   project-docs/unified-export/verify/meridian-bloom-poster.pdf
 *
 * Requires wrangler pages dev (:3000) + API worker (:8787).
 * Run: npx tsx project-docs/unified-export/shoot-blog-assets.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Page } from 'puppeteer';

const LOCAL_ORIGIN = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';
const ROOT = process.cwd();
const OUT_VERIFY = join(ROOT, 'project-docs', 'unified-export', 'verify');
const OUT_BLOG = join(ROOT, 'website', 'blog-static');

// The committed sample uses the CLI-only relative-path @font form. The
// playground resolves fonts by family name via Google Fonts, so swap to the
// named form for the workspace used in the screenshots.
const SOURCE = readFileSync(join(ROOT, 'website', 'blog', 'samples', 'post30', 'meridian-bloom.pathogen'), 'utf8')
  .replace('@font "../../../../fonts/Baumans/Baumans-Regular.ttf";', '@font "Baumans";')
  .replaceAll('Baumans-Regular', 'Baumans');

function makeAnonId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_~-';
  let id = '';
  for (let i = 0; i < 21; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)];
  return id;
}

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
  const result = (await page.evaluate(new Function(MODAL_EVAL_PREFIX + body) as unknown as () => T)) as T & {
    error?: string;
  };
  if (result && typeof result === 'object' && (result as { error?: string }).error) {
    throw new Error(`modal eval failed: ${(result as { error: string }).error}`);
  }
  return result;
}

async function waitFor(page: Page, body: string, timeoutMs: number, label: string): Promise<void> {
  const start = Date.now();
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

async function main(): Promise<void> {
  mkdirSync(OUT_VERIFY, { recursive: true });
  const ownerId = makeAnonId();

  const res = await fetch(`${DEV_API}/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': ownerId },
    body: JSON.stringify({ name: 'Meridian Bloom', code: SOURCE }),
  });
  if (!res.ok) throw new Error(`workspace create failed: HTTP ${res.status}`);
  const { id } = (await res.json()) as { id: string };
  console.log(`workspace: ${id}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
    protocolTimeout: 180_000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
  page.on('dialog', (d) => void d.dismiss());
  await page.evaluateOnNewDocument(`localStorage.setItem('${ANON_KEY}', '${ownerId}');`);

  await page.goto(`${LOCAL_ORIGIN}/workspace/${id}`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await waitFor(page, PREVIEW_READY, 60_000, 'preview compile');

  // Save-stub so a Download click hands us bytes.
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

  await page.evaluate(`document.dispatchEvent(new CustomEvent('open-export', { bubbles: true, composed: true }));`);
  await waitFor(page, WAIT_MODAL_OPEN, 10_000, 'modal open');
  await new Promise((r) => setTimeout(r, 800)); // fonts settle

  // --- Shot 1: default state (format toggle, legend OFF, watermark in preview)
  await page.screenshot({ path: join(OUT_BLOG, 'unified-export-modal.png'), captureBeyondViewport: false });
  console.log('shot: unified-export-modal.png');

  // --- Shot 2: PNG settings panel (legend still off, matching the alt text)
  await inModal(
    page,
    `sr.querySelector('.format-toggle button[data-format="png"]').click();
     return { summary: sr.querySelector('#png-summary').textContent };`,
  ).then((r) => console.log('png summary:', (r as { summary: string }).summary));
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: join(OUT_BLOG, 'unified-export-png.png'), captureBeyondViewport: false });
  console.log('shot: unified-export-png.png');

  // --- Shot 3: legend ON, highlighted code (back on SVG format)
  await inModal(
    page,
    `sr.querySelector('.format-toggle button[data-format="svg"]').click();
     sr.querySelector('#include-legend').click();
     var c = sr.querySelector('#legend-creator'); c.value = 'Ryan Kuykendall'; c.dispatchEvent(new Event('input'));
     var d = sr.querySelector('#legend-description');
     d.value = 'Six rings of petals around a warm center — a study in radial rhythm.';
     d.dispatchEvent(new Event('input'));
     return { ok: true };`,
  );
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: join(OUT_BLOG, 'unified-export-legend.png'), captureBeyondViewport: false });
  console.log('shot: unified-export-legend.png');

  // --- Shot 4: legend card close-up — the syntax-highlighted source must be
  // LEGIBLE (content-review Must-Fix 1: the "same purple in every format"
  // claim needs visible evidence). Download the legend-on SVG, render it at
  // native canvas size in a fresh page, and clip-screenshot the card.
  await inModal(page, `sr.querySelector('.download-btn').click(); return { ok: true };`);
  {
    const start = Date.now();
    let saved: { name: string; b64: string } | null = null;
    while (!saved) {
      saved = (await page.evaluate(`window.__saved`)) as { name: string; b64: string } | null;
      if (!saved && Date.now() - start > 90_000) throw new Error('SVG download timed out');
      if (!saved) await new Promise((r) => setTimeout(r, 300));
    }
    const svgPath = join(OUT_VERIFY, 'meridian-bloom-legend.svg');
    writeFileSync(svgPath, Buffer.from(saved.b64, 'base64'));

    const detailPage = await browser.newPage();
    await detailPage.setViewport({ width: 1000, height: 1400, deviceScaleFactor: 2 });
    await detailPage.goto(`file://${svgPath}`, { waitUntil: 'networkidle0', timeout: 30_000 });
    await detailPage.evaluate(`document.fonts ? document.fonts.ready : Promise.resolve()`);
    await new Promise((r) => setTimeout(r, 500));
    const rect = (await detailPage.evaluate(`(() => {
      const svg = document.querySelector('svg');
      svg.style.width = '900px';
      svg.style.height = '1200px';
      const card = document.querySelector('#pathogen-legend .legend-bg');
      const r = card.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    })()`)) as { x: number; y: number; w: number; h: number };
    await detailPage.screenshot({
      path: join(OUT_BLOG, 'unified-export-legend-detail.png'),
      clip: { x: rect.x - 16, y: rect.y - 16, width: rect.w + 32, height: rect.h + 32 },
    });
    await detailPage.close();
    console.log('shot: unified-export-legend-detail.png');
    await page.evaluate(`window.__saved = null;`);
  }

  // --- Poster PDF for the verify trail (legend on, Match-artwork defaults)
  await inModal(page, `sr.querySelector('.format-toggle button[data-format="pdf"]').click(); return { ok: true };`);
  await inModal(page, `sr.querySelector('.download-btn').click(); return { ok: true };`);
  const start = Date.now();
  let saved: { name: string; b64: string } | null = null;
  while (!saved) {
    saved = (await page.evaluate(`window.__saved`)) as { name: string; b64: string } | null;
    if (!saved && Date.now() - start > 90_000) throw new Error('PDF download timed out');
    if (!saved) await new Promise((r) => setTimeout(r, 300));
  }
  writeFileSync(join(OUT_VERIFY, 'meridian-bloom-poster.pdf'), Buffer.from(saved.b64, 'base64'));
  console.log(`pdf saved: ${saved.name}`);

  await browser.close();
  console.log('assets written: unified-export-modal.png, unified-export-legend.png, unified-export-png.png');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

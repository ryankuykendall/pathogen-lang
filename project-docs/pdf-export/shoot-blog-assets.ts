/**
 * Re-shoots the blog post assets for print-ready-pdf-export using the real
 * Orbital Study sample (content-review Must-Fix 1: one artwork everywhere,
 * production-quality workspace name, reproducible numbers).
 *
 * Produces:
 *   website/blog-static/pdf-export-modal.png      (modal, light theme, PDF settings)
 *   website/blog-static/pdf-export-poster.png     (rendered PDF page)
 *   website/blog-static/pdf-export-cropmarks.png  (corner detail: bleed + crop marks)
 *   project-docs/pdf-export/verify/orbital-24in.pdf
 *
 * Requires wrangler pages dev (:3000) + API worker (:8787).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Page } from 'puppeteer';

const LOCAL_ORIGIN = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';
const ROOT = process.cwd();
const OUT_VERIFY = join(ROOT, 'project-docs', 'pdf-export', 'verify');
const OUT_BLOG = join(ROOT, 'website', 'blog-static');

// The committed sample uses the CLI-only relative-path @font form (per post27
// precedent). The playground resolves fonts by family name via Google Fonts,
// so swap to the named form for the workspace used in the screenshots.
const SOURCE = readFileSync(join(ROOT, 'website', 'blog', 'samples', 'post29', 'orbital-study.pathogen'), 'utf8')
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

async function main(): Promise<void> {
  mkdirSync(OUT_VERIFY, { recursive: true });
  const ownerId = makeAnonId();

  const res = await fetch(`${DEV_API}/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': ownerId },
    body: JSON.stringify({ name: 'Orbital Study', code: SOURCE }),
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
  await page.setViewport({ width: 1600, height: 1000 });
  page.on('dialog', (d) => void d.dismiss());
  await page.evaluateOnNewDocument(`localStorage.setItem('${ANON_KEY}', '${ownerId}');`);

  await page.goto(`${LOCAL_ORIGIN}/workspace/${id}`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await waitFor(page, PREVIEW_READY, 60_000, 'preview compile');

  // Save-stub so the Download click hands us the PDF bytes.
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

  await page.evaluate(`document.dispatchEvent(new CustomEvent('export-legend', { bubbles: true, composed: true }));`);
  await waitFor(page, WAIT_MODAL_OPEN, 10_000, 'modal open');

  // Fill creator + description so the legend reads like a real export.
  await inModal(
    page,
    `var c = sr.querySelector('#legend-creator'); c.value = 'Ryan Kuykendall'; c.dispatchEvent(new Event('input'));
     var d = sr.querySelector('#legend-description');
     d.value = 'Concentric orbits with a Baumans title, sized for a 24-inch print.';
     d.dispatchEvent(new Event('input'));
     sr.querySelector('.format-toggle button[data-format="pdf"]').click();
     sr.querySelector('.form-scroll').scrollTop = 220;
     return { summary: sr.querySelector('#pdf-summary').textContent };`,
  ).then((r) => console.log('summary:', (r as { summary: string }).summary));

  await new Promise((r) => setTimeout(r, 800)); // fonts settle
  await page.screenshot({ path: join(OUT_BLOG, 'pdf-export-modal.png'), captureBeyondViewport: false });
  console.log('modal screenshot saved');

  // Download the PDF (Match artwork defaults: 24 in wide → 24×30, page 25×31).
  await inModal(page, `sr.querySelector('.download-btn').click(); return { ok: true };`);
  const start = Date.now();
  let saved: { name: string; b64: string } | null = null;
  while (!saved) {
    saved = (await page.evaluate(`window.__saved`)) as { name: string; b64: string } | null;
    if (!saved && Date.now() - start > 90_000) throw new Error('PDF download timed out');
    if (!saved) await new Promise((r) => setTimeout(r, 300));
  }
  const pdfPath = join(OUT_VERIFY, 'orbital-24in.pdf');
  writeFileSync(pdfPath, Buffer.from(saved.b64, 'base64'));
  console.log(`pdf saved: ${saved.name}`);

  // Render the PDF page via Quick Look at high resolution (the 0.5pt crop-mark
  // hairlines need ~190 px/in to survive), then derive the two blog images.
  execFileSync('qlmanage', ['-t', '-s', '6000', '-o', OUT_VERIFY, pdfPath], { stdio: 'ignore' });
  const rendered = `${pdfPath}.png`;

  // Full page (scaled down for the blog).
  execFileSync('sips', ['-Z', '1400', rendered, '--out', join(OUT_BLOG, 'pdf-export-poster.png')], { stdio: 'ignore' });

  // Corner detail: tight top-left crop (crop marks + bleed + margin anatomy),
  // upscaled 2× so the hairlines read at blog display size. Note sips treats a
  // (0,0) cropOffset as "unset" and center-crops — use (1,1).
  execFileSync('sips', ['-c', '400', '475', '--cropOffset', '1', '1', rendered, '--out', '/tmp/pdf-corner-raw.png'], { stdio: 'ignore' });
  execFileSync('sips', ['-z', '800', '950', '/tmp/pdf-corner-raw.png', '--out', join(OUT_BLOG, 'pdf-export-cropmarks.png')], { stdio: 'ignore' });

  await browser.close();
  console.log('assets written: pdf-export-modal.png, pdf-export-poster.png, pdf-export-cropmarks.png');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

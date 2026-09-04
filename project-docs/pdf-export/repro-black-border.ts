/**
 * J-only repro for the transparent-background black bleed fill.
 * Extracted from project-docs/pdf-export/verify-pdf-export.ts — run against
 * the currently built playground to confirm red (pre-fix) / green (post-fix).
 */
import { inflateSync } from 'node:zlib';
import puppeteer, { type Page } from 'puppeteer';

const LOCAL_ORIGIN = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';

const MAIN_SOURCE = `define ViewBox(0, 0, 800, 500);

define default PathLayer('background') #{
  fill: #14101c;
}

layer('background').apply {
  rect(0, 0, 800, 500);
}

define PathLayer('rings') #{
  stroke: #f7b56e;
  stroke-width: 3;
  fill: #b384e0;
}

layer('rings').apply {
  circle(620, 120, 46);
  circle(200, 300, 80);
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
  return ((await res.json()) as { id: string }).id;
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

async function download(page: Page): Promise<Buffer> {
  await page.evaluate(`window.__saved = null;`);
  await inModal(page, `sr.querySelector('.download-btn').click(); return { ok: true };`);
  const start = Date.now();
  for (;;) {
    const saved = (await page.evaluate(`window.__saved`)) as { b64: string } | null;
    if (saved) return Buffer.from(saved.b64, 'base64');
    if (Date.now() - start > 60_000) throw new Error('download timed out');
    await new Promise((r) => setTimeout(r, 300));
  }
}

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
      /* not a FlateDecode content stream */
    }
  }
  return out;
}

async function main(): Promise<void> {
  const ownerId = makeAnonId();
  const ws = await createWorkspace(MAIN_SOURCE, ownerId, 'black-border-repro');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'], protocolTimeout: 180_000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  page.on('dialog', (d) => void d.dismiss());
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') console.log(`[page ${msg.type()}]`, msg.text().slice(0, 200));
  });
  page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 300)));
  page.on('response', (res) => {
    if (res.status() >= 400) console.log('[http]', res.status(), res.url().slice(0, 150));
  });
  await page.evaluateOnNewDocument(`localStorage.setItem('${ANON_KEY}', '${ownerId}');`);

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

  const runCase = async (bg: string): Promise<string> => {
    await page.goto(`${LOCAL_ORIGIN}/workspace/${ws}`, { waitUntil: 'networkidle2', timeout: 60_000 });
    await waitFor(page, PREVIEW_READY, 60_000, 'preview compile');
    await installSaveStub(page);
    await setWorkspaceBackground(bg);
    await page.evaluate(`document.dispatchEvent(new CustomEvent('open-export', { bubbles: true, composed: true }));`);
    await waitFor(page, WAIT_MODAL_OPEN, 10_000, 'modal open');
    await inModal(page, `sr.querySelector('.format-toggle button[data-format="pdf"]').click(); return { ok: true };`);
    return decodedStreams(await download(page));
  };

  const bleedFillRe = /([\d.]+(?: [\d.]+ [\d.]+)?) (g|rg)\n18\. [\d.]+ [\d.]+ -[\d.]+ re\nf\n/;

  const zero = await runCase('oklch(75% 75% 180 / 0%)');
  const zeroFill = bleedFillRe.exec(zero);
  console.log('zero-alpha bleed fill:', zeroFill ? `${zeroFill[1]} ${zeroFill[2]}` : '(none)');
  console.log('  no re/f fill present:', !/re\nf\n/.test(zero) ? 'PASS' : 'FAIL');

  const semi = await runCase('oklch(75% 75% 180 / 25%)');
  const semiFill = bleedFillRe.exec(semi);
  const channels = semiFill ? semiFill[1].split(' ').map(parseFloat) : [];
  console.log('semi-alpha bleed fill:', semiFill ? `${semiFill[1]} ${semiFill[2]}` : '(none)');
  console.log('  fill present:', semiFill ? 'PASS' : 'FAIL');
  console.log('  flattened over white (all >= 0.7):', channels.length > 0 && channels.every((c) => c >= 0.7) ? 'PASS' : 'FAIL');

  await browser.close();
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

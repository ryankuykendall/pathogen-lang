// Repro for the 2026-09-05 report: vector-mode PDF export of a large SVG
// fails with "Maximum call stack size exceeded". Drives the export modal the
// way verify-pdf-export.ts does, but calls _downloadPdf directly so the
// failing stack frame comes back instead of a status message.
//   npx tsx project-docs/pdf-export/verify/huge-vector-repro.ts <variant> [n]
import puppeteer, { type Page } from 'puppeteer';

const LOCAL_ORIGIN = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';
const variant = process.argv[2] ?? 'giant';
const n = Number(process.argv[3] ?? (variant === 'giant' ? 60000 : variant === 'gradient' ? 4000 : 4000));

const SOURCES: Record<string, string> = {
  // a rasterized gradient fill on a big canvas: the preview carries it as a
  // multi-megabyte data-URI <image>, which vector mode hands to svg2pdf/jsPDF
  gradient: `define ViewBox(0, 0, ${n}, ${n});\nlet wheel = ConicGradient('wheel', ${Math.round(n / 2)}, ${Math.round(n / 2)}) {|g|\n  g.stop(0, #f00);\n  g.stop(0.5, #0f0);\n  g.stop(1, #00f);\n};\ndefine default PathLayer('art') #{ fill: wheel; stroke: none; }\nrect(0, 0, ${n}, ${n});`,
  // one path with n line segments (a multi-megabyte d attribute)
  // rows × cols line segments (a multi-megabyte d attribute); each loop
  // stays under the evaluator's 32,000-iteration cap
  giant: `define ViewBox(0, 0, 800, 500);\ndefine default PathLayer('art') #{ stroke: #333; fill: none; stroke-width: 0.5; }\nfor (row in 0..${Math.ceil(n / 2000) - 1}) {\n  for (col in 0..1999) {\n    M calc(col * 0.39 + 5) calc(row * 15 + 10)\n    l 0.2 8\n  }\n}`,
  // n separate layers, each a small circle (many elements)
  many: `define ViewBox(0, 0, 800, 500);\nfor (i in 1..${n}) {\n  let pl = PathLayer(\`p-\${i}\`) #{ stroke: #333; fill: none; stroke-width: 0.5; };\n  pl.apply {\n    circle(calc((i % 80) * 10 + 5), calc(floor(i / 80) * 10 + 5), 3);\n  }\n}`,
};

function makeAnonId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_~-';
  let id = '';
  for (let i = 0; i < 21; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)];
  return id;
}

const MODAL_PREFIX = `
  function findModal(root) { var els = root.querySelectorAll('*'); for (var i = 0; i < els.length; i++) { if (els[i].tagName === 'EXPORT-MODAL') return els[i]; if (els[i].shadowRoot) { var m = findModal(els[i].shadowRoot); if (m) return m; } } return null; }
  var modal = findModal(document); if (!modal) return { error: 'modal not found' }; var sr = modal.shadowRoot;
`;
async function inModal<T>(page: Page, body: string): Promise<T> {
  return (await page.evaluate(`(function(){${MODAL_PREFIX}${body}})()`)) as T;
}
async function waitFor(page: Page, body: string, timeoutMs: number, label: string): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (await page.evaluate(`(function(){${body}})()`)) return;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 400));
  }
}
const FIND_IFRAME = `
  function findIframe(root) { var direct = root.querySelector('iframe#preview-frame'); if (direct) return direct; var els = root.querySelectorAll('*'); for (var i = 0; i < els.length; i++) { if (els[i].shadowRoot) { var f = findIframe(els[i].shadowRoot); if (f) return f; } } return null; }
  var iframe = findIframe(document);
`;
const PREVIEW_READY = `${FIND_IFRAME} if (!iframe || !iframe.contentDocument) return false; var ps = iframe.contentDocument.querySelectorAll('path[d]'); if (ps.length === 0) return false; var longest = 0; for (var i = 0; i < ps.length; i++) longest = Math.max(longest, ps[i].getAttribute('d').length); return ${variant === 'giant' ? `longest > ${n * 10}` : variant === 'gradient' ? `!!iframe.contentDocument.querySelector('image')` : `ps.length >= ${Math.floor(n / 2)}`};`;
const PREVIEW_SIZE = `${FIND_IFRAME} if (!iframe || !iframe.contentDocument) return -1; var svg = iframe.contentDocument.querySelector('svg'); return svg ? svg.outerHTML.length : -1;`;

async function main(): Promise<void> {
  const source = SOURCES[variant];
  if (!source) throw new Error(`unknown variant ${variant}`);
  const ownerId = makeAnonId();
  const res = await fetch(`${DEV_API}/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': ownerId },
    body: JSON.stringify({ name: `huge-vector-${variant}`, code: source }),
  });
  if (!res.ok) throw new Error(`workspace create failed: HTTP ${res.status} ${await res.text()}`);
  const { id } = (await res.json()) as { id: string };
  const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox'], protocolTimeout: 300000 });
  const page = await browser.newPage();
  page.on('dialog', (d) => void d.dismiss());
  await page.setViewport({ width: 1400, height: 900 });
  await page.evaluateOnNewDocument(`localStorage.setItem('${ANON_KEY}', '${ownerId}');`);
  await page.goto(`${LOCAL_ORIGIN}/workspace/${id}`, { waitUntil: 'networkidle2', timeout: 60000 });
  const t0 = Date.now();
  await waitFor(page, PREVIEW_READY, 180000, 'preview compile');
  console.log(`compiled in ${Math.round((Date.now() - t0) / 1000)}s`);
  const svgLen = await page.evaluate(`(function(){${PREVIEW_SIZE}})()`);
  console.log(`preview svg chars: ${svgLen}`);
  await page.evaluate(`document.dispatchEvent(new CustomEvent('open-export', { bubbles: true, composed: true }));`);
  await waitFor(page, `${MODAL_PREFIX.replace("return { error: 'modal not found' }", 'return false')} return modal.classList.contains('open') && !!sr.querySelector('.download-btn');`, 30000, 'modal open');
  await inModal(page, `sr.querySelector('button[data-format="pdf"]').click(); return { ok: true };`);
  await new Promise((r) => setTimeout(r, 300));
  await inModal(page, `var b = sr.querySelector('.artwork-toggle button[data-artwork="vector"]'); if (b) b.click(); var d = sr.querySelector('#pdf-detail'); if (d) { d.value = '${process.env.DETAIL ?? 'full'}'; d.dispatchEvent(new Event('change')); } return { ok: true };`);
  const t1 = Date.now();
  const result = await inModal<{ ok?: boolean; size?: number; err?: string; stack?: string }>(
    page,
    `return modal._downloadPdf(sr.querySelector('.download-btn')).then(function (b) { return { ok: true, size: b.size }; }).catch(function (e) { return { err: String(e && e.message), stack: String(e && e.stack).slice(0, 2500) }; });`,
  );
  console.log(`export took ${Math.round((Date.now() - t1) / 1000)}s`);
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(String(e.message)); process.exit(1); });

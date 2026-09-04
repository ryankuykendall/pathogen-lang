// Diagnose the blank-artwork report: is the WORKSPACE preview compiled, and
// what does the export modal's snapshot contain?
import puppeteer from 'puppeteer';

const LOCAL_ORIGIN = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';

const SOURCE = `define ViewBox(0, 0, 400, 200);

define default PathLayer('bg') #{
  fill: #f5f5f5;
  stroke: none;
}

layer('bg').apply {
  rect(0, 0, 400, 200);
}

define PathLayer('dots') #{
  fill: #b384e0;
  stroke: none;
}

layer('dots').apply {
  circle(100, 100, 40);
  circle(300, 100, 40);
}
`;

function makeAnonId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_~-';
  let id = '';
  for (let i = 0; i < 21; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)];
  return id;
}

async function main(): Promise<void> {
  const ownerId = makeAnonId();
  const res = await fetch(`${DEV_API}/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': ownerId },
    body: JSON.stringify({ name: 'blank-debug', code: SOURCE }),
  });
  const { id } = (await res.json()) as { id: string };

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warn') console.log(`[page ${m.type()}]`, m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 400)));
  await page.evaluateOnNewDocument(`localStorage.setItem('${ANON_KEY}', '${ownerId}');`);
  await page.goto(`${LOCAL_ORIGIN}/workspace/${id}`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 6000));

  const state = (await page.evaluate(`(() => {
    function findIframe(root) {
      var direct = root.querySelector('iframe#preview-frame');
      if (direct) return direct;
      var els = root.querySelectorAll('*');
      for (var i = 0; i < els.length; i++) {
        if (els[i].shadowRoot) { var f = findIframe(els[i].shadowRoot); if (f) return f; }
      }
      return null;
    }
    var iframe = findIframe(document);
    if (!iframe || !iframe.contentDocument) return { iframe: false };
    var doc = iframe.contentDocument;
    var preview = doc.getElementById('preview');
    return {
      iframe: true,
      paths: doc.querySelectorAll('path').length,
      layersHtml: (doc.getElementById('preview-layers') || {}).innerHTML?.slice(0, 300) || '(missing)',
      previewAttrs: preview ? preview.outerHTML.slice(0, preview.outerHTML.indexOf('>') + 1) : '(no preview)',
    };
  })()`)) as Record<string, unknown>;
  console.log('WORKSPACE PREVIEW:', JSON.stringify(state, null, 2));

  await page.evaluate(`document.dispatchEvent(new CustomEvent('open-export', { bubbles: true, composed: true }));`);
  await new Promise((r) => setTimeout(r, 800));

  const modalState = (await page.evaluate(`(() => {
    function findModal(root) {
      var els = root.querySelectorAll('*');
      for (var i = 0; i < els.length; i++) {
        if (els[i].tagName === 'EXPORT-MODAL') return els[i];
        if (els[i].shadowRoot) { var m = findModal(els[i].shadowRoot); if (m) return m; }
      }
      return null;
    }
    var modal = findModal(document);
    var sr = modal.shadowRoot;
    var svg = sr.querySelector('.preview-area svg');
    if (!svg) return { svg: false };
    return {
      svg: true,
      paths: svg.querySelectorAll('path').length,
      children: Array.from(svg.children).map((c) => c.tagName + '#' + (c.id || '') ).join(', '),
      html: svg.outerHTML.slice(0, 600),
    };
  })()`)) as Record<string, unknown>;
  console.log('MODAL SNAPSHOT:', JSON.stringify(modalState, null, 2));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

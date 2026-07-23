// Visual probe for the zoom-parity pass: the export modal at ~500% should
// now look like the primary preview (transform-mode magnification filling
// the pane, glass pill bottom-center) instead of a clipped window.
// Run: npx tsx project-docs/unified-export/probe-parity-zoom.ts
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const LOCAL_ORIGIN = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';
const OUT = join(process.cwd(), 'project-docs', 'unified-export', 'verify');

const SOURCE = `define ViewBox(0, 0, 800, 200);

define default PathLayer('bg') \${
  fill: #f5f5f5;
  stroke: none;
}

layer('bg').apply {
  rect(0, 0, 800, 200);
}

define PathLayer('weave') \${
  stroke: #22222d;
  stroke-width: 0.4;
  fill: #ffffaa;
}

layer('weave').apply {
  for (i in 0..40) {
    circle(calc(20 + i * 19), calc(100 + sin(i * 0.7) * 60), calc(8 + (i % 5) * 6));
  }
}
`;

const FIND = `
  function findModal(root) {
    var els = root.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      if (els[i].tagName === 'EXPORT-MODAL') return els[i];
      if (els[i].shadowRoot) { var m = findModal(els[i].shadowRoot); if (m) return m; }
    }
    return null;
  }
  var modal = findModal(document);
  var sr = modal ? modal.shadowRoot : null;
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
    body: JSON.stringify({ name: 'parity-zoom-probe', code: SOURCE }),
  });
  const { id } = (await res.json()) as { id: string };

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument(`localStorage.setItem('${ANON_KEY}', '${ownerId}');`);
  await page.goto(`${LOCAL_ORIGIN}/workspace/${id}`, { waitUntil: 'networkidle2', timeout: 60_000 });
  // Poll for the compiled preview instead of a fixed sleep (a cold compile
  // can outlive 5s and leave the modal snapshotting a blank canvas).
  for (let i = 0; i < 120; i++) {
    const ready = await page.evaluate(`(() => {
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
      if (!iframe || !iframe.contentDocument) return false;
      return iframe.contentDocument.querySelectorAll('path, circle').length > 1;
    })()`);
    if (ready) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  await page.evaluate(`document.dispatchEvent(new CustomEvent('open-export', { bubbles: true, composed: true }));`);
  await new Promise((r) => setTimeout(r, 800));

  // Zoom to ~506% (1.5^4) via the pill.
  for (let i = 0; i < 4; i++) {
    await page.evaluate(
      `(() => { ${FIND} sr.querySelector('pathogen-zoom-pill').shadowRoot.querySelector('#zoom-in').click(); })()`,
    );
    await new Promise((r) => setTimeout(r, 150));
  }
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: join(OUT, 'probe-parity-500pct.png') });

  // Legend on at fit — pill + snap chip cluster over full-bleed preview.
  await page.evaluate(
    `(() => { ${FIND} sr.querySelector('pathogen-zoom-pill').shadowRoot.querySelector('#zoom-fit').click(); })()`,
  );
  await page.evaluate(`(() => { ${FIND} sr.querySelector('#include-legend').click(); })()`);
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: join(OUT, 'probe-parity-pill-chip.png') });

  await browser.close();
  console.log('parity probes written to verify/');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

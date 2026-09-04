// Visual probe for the zoom-clip + legend-clamp fixes on a wide flat canvas
// (mirrors the user-reported 800×200 workspace with a long source listing).
// Run: npx tsx project-docs/unified-export/probe-zoom-clamp.ts
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const LOCAL_ORIGIN = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';
const OUT = join(process.cwd(), 'project-docs', 'unified-export', 'verify');

const SOURCE = `define ViewBox(0, 0, 800, 200);

define default PathLayer('bg') #{
  fill: #f5f5f5;
  stroke: none;
}

layer('bg').apply {
  rect(0, 0, 800, 200);
}

// Long enough listing that the legend card is taller than the canvas
define PathLayer('weave') #{
  stroke: #22222d;
  stroke-width: 0.4;
  fill: #ffffaa;
}

layer('weave').apply {
  for (i in 0..40) {
    circle(calc(20 + i * 19), calc(100 + sin(i * 0.7) * 60), calc(8 + (i % 5) * 6));
  }
  for (i in 0..30) {
    rect(calc(10 + i * 26), calc(40 + (i % 7) * 18), 14, 14);
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
    body: JSON.stringify({ name: 'zoom-clamp-probe', code: SOURCE }),
  });
  const { id } = (await res.json()) as { id: string };

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  await page.evaluateOnNewDocument(`localStorage.setItem('${ANON_KEY}', '${ownerId}');`);
  await page.goto(`${LOCAL_ORIGIN}/workspace/${id}`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 5000));

  await page.evaluate(`document.dispatchEvent(new CustomEvent('open-export', { bubbles: true, composed: true }));`);
  await new Promise((r) => setTimeout(r, 800));

  // Legend on (oversized vs the 200-unit-tall canvas), then zoom to ~250%.
  await page.evaluate(`(() => { ${FIND} sr.querySelector('#include-legend').click(); })()`);
  await new Promise((r) => setTimeout(r, 400));
  for (let i = 0; i < 2; i++) {
    await page.evaluate(`(() => { ${FIND} sr.querySelector('.zoom-in').click(); })()`);
  }
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: join(OUT, 'probe-zoomed-square-corners.png') });

  // Try to hammer the legend off-canvas, then fit to show the clamped result.
  for (let i = 0; i < 60; i++) {
    await page.evaluate(
      `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true }));
       document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }));`,
    );
  }
  await page.evaluate(`(() => { ${FIND} sr.querySelector('.zoom-fit').click(); })()`);
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: join(OUT, 'probe-clamped-at-fit.png') });

  await browser.close();
  console.log('probe screenshots written to verify/');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import puppeteer from 'puppeteer';

const LOCAL_ORIGIN = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';

function makeAnonId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_~-';
  let id = '';
  for (let i = 0; i < 21; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)];
  return id;
}

const SOURCE = `define ViewBox(0, 0, 400, 300);
define default PathLayer('dot') \${ fill: #b384e0; stroke: none; }
layer('dot').apply { circle(200, 150, 60); }
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

async function main(): Promise<void> {
  const ownerId = makeAnonId();
  const res = await fetch(`${DEV_API}/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': ownerId },
    body: JSON.stringify({ name: 'switch-probe', code: SOURCE }),
  });
  const { id } = (await res.json()) as { id: string };

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', (m) => console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.evaluateOnNewDocument(`localStorage.setItem('${ANON_KEY}', '${ownerId}');`);
  await page.goto(`${LOCAL_ORIGIN}/workspace/${id}`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 4000));

  await page.evaluate(`document.dispatchEvent(new CustomEvent('open-export', { bubbles: true, composed: true }));`);
  await new Promise((r) => setTimeout(r, 500));

  const before = await page.evaluate(`(() => { ${FIND} return sr.querySelector('#include-legend').outerHTML; })()`);
  console.log('before:', before);

  await page.evaluate(`(() => { ${FIND} sr.querySelector('#include-legend').click(); })()`);
  await new Promise((r) => setTimeout(r, 300));

  const after = await page.evaluate(`(() => { ${FIND} return sr.querySelector('#include-legend').outerHTML; })()`);
  console.log('after:', after);

  const bg = await page.evaluate(`(() => { ${FIND}
    var el = sr.querySelector('#include-legend');
    return getComputedStyle(el).background;
  })()`);
  console.log('computed bg:', bg);

  const rect = (await page.evaluate(`(() => { ${FIND}
    var r = sr.querySelector('.legend-toggle-row').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`)) as { x: number; y: number; w: number; h: number };
  await page.screenshot({
    path: 'project-docs/unified-export/verify/switch-row.png',
    clip: { x: rect.x - 8, y: rect.y - 8, width: rect.w + 16, height: rect.h + 16 },
  });

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });

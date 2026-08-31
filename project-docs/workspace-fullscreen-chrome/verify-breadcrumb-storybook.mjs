// Spot-checks: breadcrumb Refresh still appears for random programs (shared
// predicate refactor), and the storybook entries still render.
import puppeteer from 'puppeteer';

const CODE = [
  'define ViewBox(0, 0, 200, 200);',
  'for (i in 1..8) {',
  '  let px = randomRange(20, 180);',
  '  let py = randomRange(20, 180);',
  '  circle(px, py, 8);',
  '}',
].join('\n');
const state = Buffer.from(encodeURIComponent(JSON.stringify({ code: CODE }))).toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: 'new' });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('pathogen-user-id', 'verify-agent-anon'); } catch {}
  });
  await page.goto(`http://localhost:3000/pathogen/workspace/scratch?state=${encodeURIComponent(state)}`,
    { waitUntil: 'networkidle2', timeout: 60000 });

  let refreshShown = false;
  for (let i = 0; i < 40 && !refreshShown; i++) {
    refreshShown = await page.evaluate(() => {
      const bc = document.querySelector('app-shell')?.shadowRoot?.querySelector('app-breadcrumb');
      const btn = bc?.shadowRoot?.querySelector('#refresh-btn');
      return Boolean(btn && getComputedStyle(btn).display !== 'none');
    });
    if (!refreshShown) await sleep(500);
  }
  console.log(`${refreshShown ? 'PASS' : 'FAIL'}  breadcrumb refresh button visible (random program)`);

  for (const comp of ['svg-preview-pane', 'code-editor-pane']) {
    await page.goto(`http://localhost:3000/pathogen/storybook/${comp}`, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(1500);
    const ok = await page.evaluate((tag) => {
      const sb = document.querySelector('app-shell')?.shadowRoot?.querySelector('storybook-detail-view');
      const el = sb?.shadowRoot?.querySelector(`#demo-container ${tag}`);
      return Boolean(el && el.shadowRoot && el.shadowRoot.childElementCount > 0);
    }, comp);
    console.log(`${ok ? 'PASS' : 'FAIL'}  storybook renders ${comp}`);
  }
} finally {
  await browser.close();
}

// Captures the fullscreen status chip: "Ready" (light) and sticky "Error" (dark).
import puppeteer from 'puppeteer';
const enc = (code) => encodeURIComponent(Buffer.from(encodeURIComponent(JSON.stringify({ code }))).toString('base64'));
const GOOD = 'define ViewBox(0, 0, 200, 200);\nfor (i in 1..8) {\n  let px = randomRange(20, 180);\n  let py = randomRange(20, 180);\n  circle(px, py, 8);\n}';
const BAD = 'let x = 5\ncircle(100, 100, 50);';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PANE = `document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view')?.shadowRoot?.querySelector('svg-preview-pane')`;
const browser = await puppeteer.launch({ headless: 'new' });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('pathogen-user-id', 'verify-agent-anon'); } catch {} });

  await page.goto(`http://localhost:3000/pathogen/workspace/scratch?state=${enc(GOOD)}`, { waitUntil: 'networkidle2' });
  await sleep(3000);
  await page.evaluate(`${PANE}.shadowRoot.querySelector('#fullscreen-toggle').click()`);
  await sleep(400);
  await page.evaluate(`${PANE}.shadowRoot.querySelector('#refresh-btn').click()`);
  await sleep(500); // inside the 1500ms "Ready" window
  await page.screenshot({ path: 'project-docs/workspace-fullscreen-chrome/chip-ready-light.png' });

  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.goto(`http://localhost:3000/pathogen/workspace/scratch?state=${enc(BAD)}`, { waitUntil: 'networkidle2' });
  await sleep(3000);
  await page.evaluate(`${PANE}.shadowRoot.querySelector('#fullscreen-toggle').click()`);
  await sleep(400);
  await page.screenshot({ path: 'project-docs/workspace-fullscreen-chrome/chip-error-dark.png' });
} finally { await browser.close(); }
console.log('screenshots written');

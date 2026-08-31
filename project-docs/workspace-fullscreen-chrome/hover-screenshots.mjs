// Captures the hovered export button over busy artwork, light + dark.
import puppeteer from 'puppeteer';
const CODE = 'define ViewBox(0, 0, 200, 200);\nfor (i in 1..40) {\n  let px = randomRange(10, 190);\n  let py = randomRange(10, 190);\n  line(px, py, randomRange(10, 190), randomRange(10, 190));\n}';
const enc = encodeURIComponent(Buffer.from(encodeURIComponent(JSON.stringify({ code: CODE }))).toString('base64'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PANE = `document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view')?.shadowRoot?.querySelector('svg-preview-pane')`;
const browser = await puppeteer.launch({ headless: 'new' });
try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('pathogen-user-id', 'verify-agent-anon'); } catch {} });
    if (theme === 'dark') await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await page.goto(`http://localhost:3000/pathogen/workspace/scratch?state=${enc}`, { waitUntil: 'networkidle2' });
    await sleep(3000);
    await page.evaluate(`${PANE}.shadowRoot.querySelector('#fullscreen-toggle').click()`);
    await sleep(500);
    const r = await page.evaluate(`(() => { const b = ${PANE}.shadowRoot.querySelector('#export-btn').getBoundingClientRect(); return { x: b.x + b.width/2, y: b.y + b.height/2 }; })()`);
    await page.mouse.move(r.x, r.y);
    await sleep(300);
    await page.screenshot({ path: `project-docs/workspace-fullscreen-chrome/hover-fix-${theme}.png`, clip: { x: 1600 - 220, y: 0, width: 220, height: 220 } });
    await page.close();
  }
} finally { await browser.close(); }
console.log('written');

import puppeteer from 'puppeteer';

const CODE = "let a = 1;\nM 0 0";
const state = Buffer.from(encodeURIComponent(JSON.stringify({ code: CODE }))).toString('base64');
const url = `http://localhost:3000/pathogen/workspace/scratch?state=${encodeURIComponent(state)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: 'new' });
try {
  const page = await browser.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text().slice(0, 120)));
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + String(e).slice(0, 200)));
  const resp = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  console.log('status:', resp.status(), 'final-url:', page.url());
  await sleep(3000);
  const info = await page.evaluate(() => ({
    title: document.title,
    topTags: [...document.body.children].map((c) => c.tagName.toLowerCase()),
    appShellChildren: [...(document.querySelector('app-shell')?.shadowRoot?.children ?? [])].map((c) => c.tagName.toLowerCase()),
    hasWorkspace: Boolean(document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view')),
  }));
  console.log(JSON.stringify(info, null, 1));
  console.log('console:', JSON.stringify(logs.slice(0, 10), null, 1));
} finally {
  await browser.close();
}

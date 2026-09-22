import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
page.on('dialog', (d) => d.dismiss().catch(() => {}));
for (const route of ['/', '/spa.html', '/playground']) {
  try {
    const resp = await page.goto('http://localhost:3000' + route, { waitUntil: 'networkidle2', timeout: 30000 });
    const info = await page.evaluate(() => ({
      url: location.pathname,
      hasLang: typeof window.PathogenLang !== 'undefined',
      scripts: [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')).slice(0, 8),
      editors: !!document.querySelector('pathogen-editor, .cm-editor, code-editor'),
    }));
    console.log(route, '->', resp.status(), JSON.stringify(info));
  } catch (e) {
    console.log(route, '-> ERROR', String(e).slice(0, 80));
  }
}
await browser.close();

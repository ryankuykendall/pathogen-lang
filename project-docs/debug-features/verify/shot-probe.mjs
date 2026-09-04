import puppeteer from 'puppeteer';
const t0 = Date.now();
const log = (m) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`);
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], protocolTimeout: 20000 });
log('launched');
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30" viewBox="0 0 40 30"><path d="M 0 0 h 40 v 30" fill="none" stroke="black"/></svg>';
for (const [name, html] of [['plain', '<html><body><p>hi</p></body></html>'], ['svg', `<html><body style="margin:0;background:#fff">${svg}</body></html>`]]) {
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 40, height: 30, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    log(`${name}: content set`);
    await page.screenshot({ path: `${process.argv[2]}/probe-${name}.png`, clip: { x: 0, y: 0, width: 40, height: 30 } });
    log(`${name}: screenshot ok`);
    await page.close();
  } catch (e) { log(`${name}: FAIL ${e.message.split('\n')[0]}`); }
}
await browser.close(); log('closed');

import puppeteer from 'puppeteer';
const t0 = Date.now();
const log = (m) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`);
for (const [name, opts] of [
  ['new+disable-gpu', { headless: true, args: ['--no-sandbox', '--disable-gpu'] }],
  ['shell', { headless: 'shell', args: ['--no-sandbox'] }],
]) {
  const browser = await puppeteer.launch({ ...opts, protocolTimeout: 15000 });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 40, height: 30, deviceScaleFactor: 1 });
    await page.setContent('<html><body><p>hi</p></body></html>', { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${process.argv[2]}/probe2-${name}.png`, clip: { x: 0, y: 0, width: 40, height: 30 } });
    log(`${name}: screenshot ok`);
  } catch (e) { log(`${name}: FAIL ${e.message.split('\n')[0]}`); }
  await browser.close();
}

// Verify the inspector opens in the BBWP artifact the user is testing
// (which lacks pathogen-metadata in its SVG).

import puppeteer from 'puppeteer';

const URL = 'http://localhost:3001/website/bbwp/2026-04-15-15:42:38--color-system--lightdark-conic.mw.html';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 20000 });
  await page.waitForSelector('mini-workspace', { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 1000));

  // Step 1: open glass-bar → click fullscreen
  await page.evaluate(() => {
    const mw = document.querySelector('mini-workspace');
    mw.shadowRoot.querySelector('#summary').click();
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => {
    const mw = document.querySelector('mini-workspace');
    mw.shadowRoot.querySelector('#fullscreen-btn').click();
  });
  await new Promise((r) => setTimeout(r, 600));

  const fsState = await page.evaluate(() => {
    const mw = document.querySelector('mini-workspace');
    const mp = mw.shadowRoot.querySelector('mini-preview');
    return {
      mpFullscreen: mp.classList.contains('fullscreen'),
      isPreviewFullscreen: mw._isPreviewFullscreen,
      hasMetadata: mw._inspectorMetadata !== null,
    };
  });
  console.log('after fullscreen:', JSON.stringify(fsState, null, 2));

  // Step 2: click inspector button in mini-preview
  await page.evaluate(() => {
    const mw = document.querySelector('mini-workspace');
    const mp = mw.shadowRoot.querySelector('mini-preview');
    const btn = mp.shadowRoot.querySelector('#inspector-open-btn');
    console.log('clicking inspector-open-btn:', !!btn, btn && getComputedStyle(btn).display);
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 800));

  const insp = await page.evaluate(() => {
    const mw = document.querySelector('mini-workspace');
    const ip = mw.shadowRoot.querySelector('inspector-panel');
    return {
      inspectorInDOM: !!ip,
      inspectorOpen: mw._inspectorOpen,
      inspectorClasses: ip?.className || '',
      inspectorBounds: ip?.getBoundingClientRect().toJSON() ?? null,
    };
  });
  console.log('after inspector click:', JSON.stringify(insp, null, 2));

  await page.screenshot({ path: '/tmp/mw-verify/bbwp-fullscreen-inspector.png' });
  console.log('wrote /tmp/mw-verify/bbwp-fullscreen-inspector.png');
  await browser.close();
})();

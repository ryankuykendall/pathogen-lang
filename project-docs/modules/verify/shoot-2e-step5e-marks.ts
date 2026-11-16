// 2e step 5e, piece 2: the re-review marks in <source-files>, from its storybook story
// ("A re-review's marks"), in light and dark, on the dev site (localhost:3000).
//
//   npm run build:playground:dev
//   npx tsx project-docs/modules/verify/shoot-2e-step5e-marks.ts

import puppeteer from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const OUT = 'project-docs/modules/verify';
const pause = async (ms: number): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms));
};

const DEEP = `
  window.__deep = (sel, root = document) => {
    const found = root.querySelector(sel);
    if (found) return found;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) { const f = window.__deep(sel, el.shadowRoot); if (f) return f; }
    }
    return null;
  };`;

const browser = await puppeteer.launch({ headless: true, args: ['--window-size=1200,800'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
  for (const theme of ['light', 'dark'] as const) {
    await page.goto(`${PAGES_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(`localStorage.setItem('pathogen-theme', '${theme}')`);
    await page.goto(`${PAGES_URL}/storybook/source-files`, { waitUntil: 'domcontentloaded' });
    let clicked = false;
    for (let i = 0; i < 60 && !clicked; i++) {
      clicked = (await page.evaluate(`(() => { ${DEEP}
        const view = __deep('storybook-detail-view'); const root = view?.shadowRoot;
        const tab = root && [...root.querySelectorAll('.story-tab')].find((b) => b.textContent.includes('re-review'));
        if (!tab) return false; tab.click(); return true; })()`)) as boolean;
      if (!clicked) await pause(250);
    }
    await pause(1500);
    const box = (await page.evaluate(`(() => { ${DEEP}
      const el = __deep('source-files'); const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`)) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    await page.screenshot({
      path: `${OUT}/2e-step5e-marks-${theme}.png`,
      clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 },
    });
  }
  await page.evaluate(`localStorage.setItem('pathogen-theme', 'light')`);
} finally {
  await Promise.race([browser.close(), pause(10_000)]);
}
console.log('shot');

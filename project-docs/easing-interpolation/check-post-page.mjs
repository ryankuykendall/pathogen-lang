// Renders the served blog post headless and confirms every mini-workspace
// drew its SVG preview. Run from the repo root with dev:website on :3000:
//   node project-docs/easing-interpolation/check-post-page.mjs
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1200, height: 900 } });
try {
  const page = await browser.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.goto('http://localhost:3000/blog/easing-with-lambdas', { waitUntil: 'domcontentloaded', timeout: 30000 });
  let result = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    result = await page.evaluate(() => {
      const deepAll = (root, sel, out = []) => {
        for (const el of root.querySelectorAll('*')) {
          if (el.matches(sel)) out.push(el);
          if (el.shadowRoot) deepAll(el.shadowRoot, sel, out);
        }
        return out;
      };
      const mws = deepAll(document, 'mini-workspace');
      const svgs = mws.map((mw) => deepAll(mw.shadowRoot ?? mw, 'svg').filter((s) => s.querySelector('path')).length);
      const title = document.querySelector('h1')?.textContent?.trim();
      return { count: mws.length, svgs, title };
    });
    if (result.count === 6 && result.svgs.every((n) => n > 0)) break;
  }
  console.log(JSON.stringify(result));
  await page.screenshot({ path: 'project-docs/easing-interpolation/blog-post-top.png', clip: { x: 0, y: 0, width: 1200, height: 900 } });
  console.log('screenshot: project-docs/easing-interpolation/blog-post-top.png');
} finally {
  await browser.close();
}

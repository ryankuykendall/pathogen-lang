// Images in the docs, checked in a browser (docs/CLAUDE.md "Images";
// scripts/lib/doc-images.ts, playground/utils/doc-image-css.ts).
//
// No published page has an image yet, so this renders two test figures with
// the docs build's own renderer and puts them in the two places docs show:
//   - the static docs page: this build's website/docs-static/index.html, served
//     in place of :3000/docs with :3000's real response headers;
//   - the workspace's docs panel, on :3000/workspace/scratch, as served.
// The images under /docs/images/ come from tmp/doc-images/fixture/.
//
// Each place is checked in four themes (light, dark, and the system setting
// both ways):
//   - the figure isn't inside a <p>, and has no side margins;
//   - the version for the theme shows and the other doesn't;
//   - its height is kept for it before it loads, from width and height;
//   - it loads at its full size and doesn't overflow;
//   - the hidden version isn't fetched.
// Screenshots go to project-docs/docs-images/, for the design review.
//
// Needs: npm run dev:stack running, then npm run build:docs and
// npm run build:playground:dev.
//   npx tsx project-docs/docs-images/verify-doc-images.ts

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Marked } from 'marked';
import puppeteer from 'puppeteer';
import type { Browser, Page } from 'puppeteer';

import { docImageRenderer } from '../../scripts/lib/doc-images';

const PAGES_URL = 'http://localhost:3000';
const OUT = 'project-docs/docs-images';
const FIXTURE = 'tmp/doc-images/fixture';
const FRESH_PAGE = 'website/docs-static/index.html';

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

async function waitFor<T>(what: string, probe: () => Promise<T | null>, timeout = 20_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await probe();
    if (value !== null && value !== undefined) return value;
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

/** Three test images: one with a dark version beside it, one without. */
async function makeFixture(browser: Browser): Promise<void> {
  mkdirSync(FIXTURE, { recursive: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 640, height: 360, deviceScaleFactor: 1 });
  const cards: [string, string, string, string][] = [
    ['sample.png', '#fbf6ee', '#3a2f4a', 'Light version'],
    ['sample.dark.png', '#1a1424', '#f6e9da', 'Dark version'],
    ['single.png', '#dfe9f5', '#21364d', 'One version, both themes'],
  ];
  for (const [name, bg, ink, label] of cards) {
    await page.setContent(
      `<body style="margin:0"><div style="width:640px;height:360px;background:${bg};color:${ink};` +
        `font:600 36px system-ui;display:grid;place-items:center">${label}</div></body>`,
    );
    writeFileSync(join(FIXTURE, name), await page.screenshot({ type: 'png' }));
  }
  await page.close();
}

// What the figures look like in the page, read without loading anything.
const READ = (root: string) => `(() => {
  const root = ${root};
  return [...root.querySelectorAll('figure.doc-figure')].map((f) => ({
    parent: f.parentElement.tagName,
    marginLeft: getComputedStyle(f).marginLeft,
    marginRight: getComputedStyle(f).marginRight,
    roomWidth: f.parentElement.clientWidth,
    caption: f.querySelector('figcaption') ? f.querySelector('figcaption').textContent : null,
    imgs: [...f.querySelectorAll('img')].map((i) => ({
      src: i.getAttribute('src'),
      display: getComputedStyle(i).display,
      width: i.getBoundingClientRect().width,
      height: i.getBoundingClientRect().height,
      attrWidth: Number(i.getAttribute('width')),
      attrHeight: Number(i.getAttribute('height')),
      natural: i.naturalWidth,
      complete: i.complete,
    })),
  }));
})()`;

// Load the shown images now (headless Chrome here doesn't scroll lazy images in).
const LOAD_SHOWN = (root: string) => `(() => {
  const root = ${root};
  for (const i of root.querySelectorAll('img.doc-image')) if (getComputedStyle(i).display !== 'none') i.loading = 'eager';
  return true;
})()`;

const SHOWN_LOADED = (root: string) => `(() => {
  const root = ${root};
  const shown = [...root.querySelectorAll('img.doc-image')].filter((i) => getComputedStyle(i).display !== 'none');
  return shown.length > 0 && shown.every((i) => i.complete && i.naturalWidth > 0) ? true : null;
})()`;

type Theme = 'light' | 'dark' | 'system-light' | 'system-dark';
const THEMES: Theme[] = ['light', 'dark', 'system-light', 'system-dark'];
const isDark = (theme: Theme) => theme === 'dark' || theme === 'system-dark';

async function setTheme(page: Page, theme: Theme): Promise<void> {
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: isDark(theme) ? 'dark' : 'light' }]);
}

/** The checks for one place in one theme, on figures already in the page. */
async function checkFigures(page: Page, where: string, root: string, theme: Theme, requested: string[]): Promise<void> {
  const label = `${where}, ${theme}`;
  const before = (await page.evaluate(READ(root))) as any[];
  check(`${label}: both figures are in the page`, before.length === 2, before.length);
  if (before.length !== 2) return;
  const [pair, single] = before;

  check(
    `${label}: no figure is inside a <p>`,
    before.every((f) => f.parent !== 'P'),
    before.map((f) => f.parent),
  );
  check(
    `${label}: the figures have no side margins`,
    before.every((f) => f.marginLeft === '0px' && f.marginRight === '0px'),
    before.map((f) => [f.marginLeft, f.marginRight]),
  );
  check(`${label}: the caption is under the first image`, pair.caption === 'A caption under the image', pair.caption);

  const want = isDark(theme) ? '/docs/images/sample.dark.png' : '/docs/images/sample.png';
  const shown = pair.imgs.filter((i: any) => i.display !== 'none').map((i: any) => i.src);
  check(`${label}: the pair shows ${want.split('/').pop()} only`, shown.length === 1 && shown[0] === want, pair.imgs);
  const singleShown = single.imgs.filter((i: any) => i.display !== 'none');
  check(`${label}: the image with one version shows`, singleShown.length === 1, single.imgs);

  // Before loading: the box already has the image's shape.
  const boxes = [...pair.imgs, ...single.imgs].filter((i: any) => i.display !== 'none');
  check(
    `${label}: before loading, each image's box has its shape (width × height ÷ width)`,
    boxes.every((i: any) => i.width > 0 && Math.abs(i.height - (i.width * i.attrHeight) / i.attrWidth) < 1.5),
    boxes.map((i: any) => ({ w: i.width, h: i.height, attr: [i.attrWidth, i.attrHeight], complete: i.complete })),
  );

  requested.length = 0;
  await page.evaluate(LOAD_SHOWN(root));
  await waitFor(`${label}: the shown images to load`, async () => page.evaluate(SHOWN_LOADED(root)));
  const after = (await page.evaluate(READ(root))) as any[];
  const loaded = after.flatMap((f) => f.imgs).filter((i: any) => i.display !== 'none');
  check(
    `${label}: each shown image loads at its full size`,
    loaded.every((i: any) => i.natural === i.attrWidth),
    loaded.map((i: any) => [i.src, i.natural, i.attrWidth]),
  );
  check(
    `${label}: no image is wider than its room`,
    after.every((f) => f.imgs.every((i: any) => i.width <= f.roomWidth + 0.5)),
    after.map((f) => [f.roomWidth, f.imgs.map((i: any) => i.width)]),
  );
  const hidden = isDark(theme) ? 'sample.png' : 'sample.dark.png';
  check(`${label}: the hidden version isn't fetched`, !requested.includes(hidden), requested);
}

const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1280, height: 1300 } });
try {
  await makeFixture(browser);

  const used = new Set<string>();
  const problems: string[] = [];
  const figures = new Marked({
    gfm: true,
    breaks: false,
    renderer: docImageRenderer('fixture.md', FIXTURE, used, problems),
  }).parse(
    '![A sample with a light and a dark version](images/sample.png "A caption under the image")\n\n' +
      '![A sample with one version](images/single.png)\n',
  ) as string;
  check('the test figures render without problems', problems.length === 0, problems);

  // :3000's real headers for /docs, kept on the page served in its place.
  const real = await fetch(`${PAGES_URL}/docs`);
  const headers: Record<string, string> = {};
  real.headers.forEach((value, key) => {
    if (!['content-length', 'content-encoding', 'transfer-encoding'].includes(key)) headers[key] = value;
  });
  console.log(`(:3000/docs answers ${real.status}; its CSP: ${real.headers.get('content-security-policy') ?? 'none'})`);
  const freshPage = readFileSync(FRESH_PAGE, 'utf8');

  const page = await browser.newPage();
  page.on('dialog', (d) => void d.accept());
  const requested: string[] = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.origin === PAGES_URL && (url.pathname === '/docs' || url.pathname === '/docs/')) {
      void req.respond({ status: 200, headers, body: freshPage });
    } else if (url.origin === PAGES_URL && url.pathname.startsWith('/docs/images/')) {
      const name = url.pathname.slice('/docs/images/'.length);
      requested.push(name);
      void req.respond({ status: 200, contentType: 'image/png', body: readFileSync(join(FIXTURE, name)) });
    } else {
      void req.continue();
    }
  });

  for (const theme of THEMES) {
    // The stored choice: light or dark, or none for the system setting. It's set
    // on a first load and read by the page's own script on the second.
    const stored = theme === 'light' || theme === 'dark' ? theme : null;
    await setTheme(page, theme);
    const setStored = stored
      ? `try { localStorage.setItem('pathogen-theme', '${stored}'); } catch (e) {}`
      : `try { localStorage.removeItem('pathogen-theme'); } catch (e) {}`;

    // 1. The static docs page.
    await page.goto(`${PAGES_URL}/docs`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(setStored);
    await page.goto(`${PAGES_URL}/docs`, { waitUntil: 'networkidle2' });
    await page.evaluate(
      `document.querySelector('.doc-section h1').insertAdjacentHTML('afterend', ${JSON.stringify(figures)})`,
    );
    const active = await page.evaluate(`document.documentElement.getAttribute('data-active-theme')`);
    check(
      `static page, ${theme}: the page's theme is ${isDark(theme) ? 'dark' : 'light'}`,
      active === (isDark(theme) ? 'dark' : 'light'),
      active,
    );
    await checkFigures(page, 'static page', `document.querySelector('.doc-section')`, theme, requested);
    if (theme === 'light' || theme === 'dark') {
      const clip = (await page.evaluate(`(() => {
        const figs = [...document.querySelectorAll('.doc-section figure.doc-figure')];
        const top = figs[0].getBoundingClientRect(), bottom = figs[figs.length - 1].getBoundingClientRect();
        const h1 = document.querySelector('.doc-section h1').getBoundingClientRect();
        return { x: top.left - 24, y: h1.top - 16, width: top.width + 48, height: bottom.bottom - h1.top + 40 };
      })()`)) as { x: number; y: number; width: number; height: number };
      await page.screenshot({ path: join(OUT, `static-${theme}.png`) as `${string}.png`, clip });
    }

    // 2. The workspace's docs panel.
    await page.goto(`${PAGES_URL}/workspace/scratch`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const PANEL = `document.querySelector('app-shell').shadowRoot.querySelector('workspace-view').shadowRoot.querySelector('docs-panel')`;
    await waitFor('the docs panel', async () =>
      page.evaluate(
        `(() => { try { return ${PANEL}.shadowRoot.querySelector('#doc-syntax') ? true : null; } catch (e) { return null; } })()`,
      ),
    );
    await page.evaluate(`(() => {
      const panel = ${PANEL};
      panel.style.transition = 'none';
      panel.open();
      panel.shadowRoot.querySelector('#doc-syntax').insertAdjacentHTML('afterbegin', ${JSON.stringify(figures)});
    })()`);
    const appTheme = await page.evaluate(`document.documentElement.getAttribute('data-active-theme')`);
    check(
      `docs panel, ${theme}: the playground's theme is ${isDark(theme) ? 'dark' : 'light'}`,
      appTheme === (isDark(theme) ? 'dark' : 'light'),
      appTheme,
    );
    await checkFigures(page, 'docs panel', `${PANEL}.shadowRoot.querySelector('#doc-syntax')`, theme, requested);
    if (theme === 'light' || theme === 'dark') {
      const panel = await page.evaluateHandle(PANEL);
      await (panel as any).screenshot({ path: join(OUT, `panel-${theme}.png`) });
    }
  }
  await page.close();
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks pass.');
process.exit(failures ? 1 : 0);

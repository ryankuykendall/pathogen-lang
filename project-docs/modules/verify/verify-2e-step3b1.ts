// 2e, step 3b-1 (note 58): <source-files>, the shared read-only viewer, in the
// served playground's storybook (/storybook/source-files), light and dark:
// - CodeMirror loads, and switching files swaps the document;
// - the list in the tree's order; the file line with the copy icon in its cell;
// - one file: the copy icon floating;
// - narrow (380 px): the menu, and the sheet over a scrim, fixed to the window;
// - copying puts the file shown on the clipboard and says "Copied";
// - the editor follows a theme change.
//
//   npm run dev:stack            (and npm run build:playground:dev after a change)
//   npx tsx project-docs/modules/verify/verify-2e-step3b1.ts

import puppeteer from 'puppeteer';

import type { ElementHandle, Page } from 'puppeteer';

const APP = 'http://localhost:3000';
const SHOTS = 'project-docs/modules/verify';
const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 600)}`}`);
  if (!ok) failures++;
};

const DEEP = `(sel) => {
  const walk = (root) => {
    const f = root.querySelector(sel);
    if (f) return f;
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) { const g = walk(el.shadowRoot); if (g) return g; }
    return null;
  };
  return walk(document);
}`;

/** Open story `index` and return its viewer, once CodeMirror has loaded in it. */
async function story(page: Page, index: number): Promise<ElementHandle> {
  await page.evaluate(`(${DEEP})('.story-tab[data-story="${index}"]').click()`);
  for (let i = 0; i < 60; i++) {
    await pause(100);
    const handle = (await page.evaluateHandle(`(${DEEP})('source-files')`)).asElement() as ElementHandle | null;
    if (handle && (await handle.evaluate((el) => !!el.shadowRoot!.querySelector('.cm-editor')))) return handle;
  }
  throw new Error(`story ${index}: no viewer with an editor`);
}

const browser = await puppeteer.launch({ headless: 'shell' });
await browser
  .defaultBrowserContext()
  .overridePermissions(APP, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
const page = await browser.newPage();
await page.setViewport({ width: 1320, height: 1000 });
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));

let lastBg = '';
for (const theme of ['light', 'dark']) {
  await page.evaluateOnNewDocument((t) => localStorage.setItem('pathogen-theme', t), theme);
  await page.goto(`${APP}/storybook/source-files`, { waitUntil: 'networkidle2' });
  await pause(1500);

  const one = await story(page, 0);
  const oneShape = await one.evaluate((el) => ({
    list: !!el.shadowRoot!.querySelector('.list'),
    float: el.shadowRoot!.querySelector('.cell.float .cp')?.getAttribute('aria-label'),
  }));
  check(
    `[${theme}] one file: CodeMirror, no list, the copy icon floating`,
    !oneShape.list && oneShape.float === 'Copy main.pathogen',
    oneShape,
  );
  await page.screenshot({ path: `${SHOTS}/2e-step3b1-one-${theme}.png` });

  const several = await story(page, 1);
  // The file line's cell: the line's full height, a border on its left, flush right (v14).
  const cell = await several.evaluate((el) => {
    const line = el.shadowRoot!.querySelector('.path') as HTMLElement;
    const c = el.shadowRoot!.querySelector('.path .cell') as HTMLElement;
    const l = line.getBoundingClientRect();
    const r = c.getBoundingClientRect();
    return {
      lineHeight: Math.round(l.height),
      cellHeight: Math.round(r.height),
      width: Math.round(r.width),
      flush: Math.round(l.right - r.right),
      border: getComputedStyle(c).borderLeftWidth,
    };
  });
  // The cell fills the line down to its 1 px bottom border, as the tab bar's cells do.
  check(
    `[${theme}] the copy cell: a 34 px line, the cell its full height, 38 px wide, flush right, a 1 px border on its left`,
    cell.lineHeight === 34 && cell.cellHeight === 33 && cell.width === 38 && cell.flush === 0 && cell.border === '1px',
    cell,
  );
  const rows = await several.evaluate((el) =>
    [...el.shadowRoot!.querySelectorAll('.list .row')].map((r) => r.textContent?.trim()),
  );
  check(
    `[${theme}] the list in the tree's order, pathogen.json last`,
    JSON.stringify(rows) ===
      JSON.stringify(['demos', 'gears.pathogen', 'parts', 'gears.pathogen', 'kit.pathogen', 'main.pathogen', 'pathogen.json']),
    rows,
  );

  // Switching files swaps the document.
  await several.evaluate((el) =>
    (el.shadowRoot!.querySelector('[data-path="parts/gears.pathogen"]') as HTMLElement).click(),
  );
  await pause(200);
  const swapped = await several.evaluate((el) => ({
    line: el.shadowRoot!.querySelector('.cm-line')?.textContent,
    path: el.shadowRoot!.querySelector('.path .p')?.textContent,
  }));
  check(
    `[${theme}] a click on a module shows it in the editor`,
    swapped.line === '// A gear: a star outline with a round hub.' && swapped.path === 'parts/gears.pathogen',
    swapped,
  );

  // Copying: the clipboard gets the file shown, then "Copied".
  await several.evaluate((el) => (el.shadowRoot!.querySelector('.path .cp') as HTMLElement).click());
  await pause(300);
  const clip = (await page.evaluate(`navigator.clipboard.readText().catch((e) => 'read failed: ' + e.message)`)) as string;
  const tip = await several.evaluate((el) => el.shadowRoot!.querySelector('.tip')?.textContent);
  check(
    `[${theme}] copying puts the file shown on the clipboard, then says so`,
    clip.startsWith('// A gear: a star outline') && tip === 'Copied parts/gears.pathogen',
    { clip: clip.slice(0, 60), tip },
  );
  await page.screenshot({ path: `${SHOTS}/2e-step3b1-several-${theme}.png` });
  lastBg = await several.evaluate(
    (el) => getComputedStyle(el.shadowRoot!.querySelector('.cm-editor') as HTMLElement).backgroundColor,
  );

  const main = await story(page, 3);
  const badge = await main.evaluate(
    (el) => el.shadowRoot!.querySelector('[data-path="demos/gears.pathogen"] .badge-main')?.textContent,
  );
  check(`[${theme}] a main that isn't main.pathogen has its badge`, badge === 'main', badge);

  // Narrow: the menu, then the sheet, fixed to the window.
  const narrow = await story(page, 4);
  check(`[${theme}] at 380 px the list is a menu`, await narrow.evaluate((el) => !!el.shadowRoot!.querySelector('.menu')));
  await narrow.evaluate((el) => (el.shadowRoot!.querySelector('.menu') as HTMLElement).click());
  await pause(200);
  const sheet = await narrow.evaluate((el) => {
    const s = el.shadowRoot!.querySelector('.sheet') as HTMLElement | null;
    const r = s?.getBoundingClientRect();
    return s
      ? { bottom: Math.round(r!.bottom), left: Math.round(r!.left), rows: s.querySelectorAll('[data-path]').length }
      : null;
  });
  check(
    `[${theme}] the menu opens the files as a sheet at the window's bottom`,
    !!sheet && sheet.bottom === 1000 && sheet.left === 0 && sheet.rows === 5,
    sheet,
  );
  await page.screenshot({ path: `${SHOTS}/2e-step3b1-sheet-${theme}.png` });
  await narrow.evaluate((el) =>
    (el.shadowRoot!.querySelector('.sheet [data-path="demos/gears.pathogen"]') as HTMLElement).click(),
  );
  await pause(200);
  const after = await narrow.evaluate((el) => ({
    sheet: !!el.shadowRoot!.querySelector('.sheet'),
    p: el.shadowRoot!.querySelector('.menu .p')?.textContent,
  }));
  check(`[${theme}] a pick opens the file and closes the sheet`, !after.sheet && after.p === 'demos/gears.pathogen', after);
}

// The editor follows a theme change, live: the GitHub theme's background.
const several = await story(page, 1);
await page.evaluate(`document.documentElement.setAttribute('data-active-theme', 'light')`);
await pause(300);
const lightBg = await several.evaluate(
  (el) => getComputedStyle(el.shadowRoot!.querySelector('.cm-editor') as HTMLElement).backgroundColor,
);
check('a theme change reaches the editor, live', lastBg !== lightBg, { dark: lastBg, light: lightBg });

await browser.close();
console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

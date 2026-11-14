// Phase 2d, step 9c (note 52; mockup v7 screen W, approved 2026-11-09): the
// blog's mini-workspace gets Background and Grid, in the served playground.
// 1. The storybook's embed with color variables (a desktop):
//    - the bar: the variable chips, then Background, Grid, Reset;
//    - Grid draws on the canvas under the drawing, its size beside it;
//    - Background's popover (not cut off by the bar): a swatch, a hex value,
//      a bad hex marked, Default; Esc closes it, the keyboard back on it;
//    - Reset puts back a variable, the background and the grid;
//    - nothing is written to storage;
//    - the "Background and Grid" story, light and dark.
// 2. A published post's embed, on a desktop and on a phone (390 px, touch):
//    the bar opens, Background works, the popover is whole, nothing scrolls
//    sideways.
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/verify-2d-step9c.ts

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const SHOTS = 'project-docs/modules/verify';
const POST = 'color-literals';

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 1400)}`}`);
  if (!ok) failures++;
};

async function waitFor<T>(what: string, probe: () => Promise<T | null | false>, ms = 30_000): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const value = await probe();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(`  (timed out waiting for ${what})`);
  return null;
}

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const FIND = `
  window.__find = (sel) => {
    const walk = (root) => {
      const hit = root.querySelector(sel);
      if (hit) return hit;
      for (const el of root.querySelectorAll('*')) {
        const inner = el.shadowRoot ? walk(el.shadowRoot) : null;
        if (inner) return inner;
      }
      return null;
    };
    return walk(document);
  };
  window.__mw = () => window.__find('mini-workspace');
  window.__mwRoot = () => window.__mw().shadowRoot;
  window.__frame = () => window.__mwRoot().querySelector('mini-preview').shadowRoot.querySelector('iframe')?.contentDocument;
  window.__deepAt = (x, y) => {
    let el = document.elementFromPoint(x, y);
    while (el?.shadowRoot) {
      const inner = el.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    return el;
  };
`;

/** The canvas as the embed's frame draws it. */
async function canvas(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(`(() => {
    const doc = window.__frame();
    const bg = doc?.getElementById('preview-bg');
    const grid = doc?.getElementById('preview-grid');
    const pattern = doc?.getElementById('grid-pattern');
    return {
      bg: bg?.getAttribute('fill') ?? null,
      grid: grid ? grid.style.display : null,
      gridBox: grid ? [grid.getAttribute('x'), grid.getAttribute('y'), grid.getAttribute('width'), grid.getAttribute('height')].join(' ') : null,
      cell: pattern?.getAttribute('width') ?? null,
      vars: doc ? doc.documentElement.getAttribute('style') : null,
    };
  })()`) as Promise<Record<string, unknown>>;
}

async function centre(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const at = (await page.evaluate(`(() => {
    const el = window.__mwRoot().querySelector('${selector}');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`)) as { x: number; y: number } | null;
  if (!at) throw new Error(`nothing at ${selector}`);
  return at;
}

async function press(page: Page, selector: string, touch = false): Promise<void> {
  const at = await centre(page, selector);
  if (touch) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
  await pause(300);
}

/** Open the embed's bar and wait for it to finish opening (its overflow opens then). */
async function openBar(page: Page, touch = false): Promise<void> {
  await press(page, '#summary', touch);
  await waitFor('the bar', async () => page.evaluate(`window.__mw().classList.contains('bar-fully-open')`));
}

/** The popover whole: its own middle and its swatches are what's on screen there. */
async function popoverWhole(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(`(() => {
    const pop = window.__mwRoot().querySelector('#bg-popover');
    const r = pop.getBoundingClientRect();
    const at = (x, y) => !!window.__deepAt(x, y)?.closest?.('#bg-popover');
    return {
      open: !pop.hidden,
      inView: r.left >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
      centre: at(r.left + r.width / 2, r.top + r.height / 2),
      bottom: at(r.left + r.width / 2, r.bottom - 6),
    };
  })()`) as Promise<Record<string, unknown>>;
}

const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1320, height: 900 } });
try {
  const page = await browser.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.evaluateOnNewDocument(FIND);
  await page.evaluateOnNewDocument(
    `try { if (!localStorage.getItem('pathogen-theme')) localStorage.setItem('pathogen-theme', 'light'); } catch {}`,
  );

  // ---------- 1. The storybook's embed with colour variables ----------
  await page.goto(`${PAGES_URL}/storybook/mini-workspace`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the stories', async () => page.evaluate(`!!window.__find('.story-tab[data-story="3"]')`));
  await page.evaluate(`window.__find('.story-tab[data-story="3"]').click()`);
  await waitFor('the embed’s frame', async () => page.evaluate(`!!window.__frame()?.getElementById('preview-bg')`));
  await pause(500);
  const storageBefore = (await page.evaluate(`JSON.stringify(Object.keys(localStorage).sort())`)) as string;
  await openBar(page);

  const bar = (await page.evaluate(`(() => {
    const inner = window.__mwRoot().querySelector('.glass-bar-inner');
    return {
      order: [...inner.children].map((c) => c.id || c.className).filter((x) => x !== 'glass-divider'),
      chips: window.__mwRoot().querySelectorAll('#chip-group .chip').length,
      reset: window.__mwRoot().querySelector('#canvas-reset').getAttribute('data-tip'),
    };
  })()`)) as { order: string[]; chips: number; reset: string };
  check(
    'the bar: the variable chips, then Background, Grid and Reset; Reset says what it puts back',
    JSON.stringify(bar.order.slice(1, 5)) === '["chip-group","bg-control","grid-control","canvas-reset"]' &&
      bar.chips === 3 &&
      bar.reset === 'Reset the variables, the background and the grid',
    bar,
  );

  // Grid.
  let c = await canvas(page);
  check('the grid starts off', c.grid === 'none', c);
  await press(page, '#grid-btn');
  c = await canvas(page);
  const sizeShown = (await page.evaluate(`!window.__mwRoot().querySelector('#grid-size').hidden`)) as boolean;
  check(
    'Grid draws on the canvas (the drawing’s 200 × 200), 20 px, its size beside it',
    c.grid === 'block' && c.gridBox === '0 0 200 200' && c.cell === '20' && sizeShown,
    { c, sizeShown },
  );
  await page.evaluate(`(() => {
    const size = window.__mwRoot().querySelector('#grid-size');
    size.value = '50';
    size.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  c = await canvas(page);
  check('its size changes the grid', c.cell === '50', c);

  // Background.
  await press(page, '#bg-btn');
  const whole = await popoverWhole(page);
  check(
    'Background opens its popover, whole: not cut off by the bar',
    whole.open === true && whole.inView === true && whole.centre === true && whole.bottom === true,
    whole,
  );
  await press(page, '.swatch[data-color="#4b5563"]');
  c = await canvas(page);
  check('a swatch colours the canvas behind the drawing', c.bg === '#4b5563', c);
  await page.screenshot({ path: `${SHOTS}/2d-step9c-background-light.png` });
  // Headless Chrome has no Cmd+A here: the field's text is selected directly, then typed over.
  const selectHex = (): Promise<unknown> => page.evaluate(`window.__mwRoot().querySelector('#bg-hex').select()`);
  await press(page, '#bg-hex');
  await selectHex();
  await page.keyboard.type('#123456');
  await page.keyboard.press('Enter');
  await pause(200);
  c = await canvas(page);
  const afterHex = c.bg;
  await selectHex();
  await page.keyboard.type('nope');
  await page.keyboard.press('Enter');
  await pause(200);
  c = await canvas(page);
  const invalid = await page.evaluate(`window.__mwRoot().querySelector('#bg-hex').getAttribute('aria-invalid')`);
  check(
    'a hex value colours it; a bad one is marked and changes nothing',
    afterHex === '#123456' && c.bg === '#123456' && invalid === 'true',
    { afterHex, c, invalid },
  );
  await press(page, '#bg-default');
  c = await canvas(page);
  check('Default puts back the embed’s own (transparent)', c.bg === 'transparent', c);
  await page.keyboard.press('Escape');
  await pause(200);
  const afterEsc = (await page.evaluate(`(() => {
    let el = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    return { open: !window.__mwRoot().querySelector('#bg-popover').hidden, focused: el?.id ?? null };
  })()`)) as { open: boolean; focused: string | null };
  check(
    'Esc closes the popover, and the keyboard is back on Background',
    !afterEsc.open && afterEsc.focused === 'bg-btn',
    afterEsc,
  );

  // Reset: a variable changed, a background, the grid.
  await page.evaluate(`(() => {
    const input = window.__mwRoot().querySelector('#chip-group pathogen-color-input[data-var="--ring-color"]');
    input.dispatchEvent(new CustomEvent('color-change', { bubbles: true, composed: true, detail: { value: '#00ff00' } }));
  })()`);
  await press(page, '#bg-btn');
  await press(page, '.swatch[data-color="#000000"]');
  await page.keyboard.press('Escape');
  c = await canvas(page);
  const before = { ...c };
  await press(page, '#canvas-reset');
  c = await canvas(page);
  check(
    'Reset puts back the variable, the background and the grid',
    String(before.vars).includes('--ring-color: #00ff00') &&
      String(c.vars).includes('--ring-color: #e63946') &&
      c.bg === 'transparent' &&
      c.grid === 'none',
    { before, after: c },
  );
  const storageAfter = (await page.evaluate(`JSON.stringify(Object.keys(localStorage).sort())`)) as string;
  check('nothing was written to storage', storageAfter === storageBefore, { storageBefore, storageAfter });

  // The "Background and Grid" story, light and dark.
  await page.evaluate(`window.__find('.story-tab[data-story="4"]').click()`);
  await waitFor('the story’s frame', async () =>
    page.evaluate(`window.__frame()?.getElementById('preview-bg')?.getAttribute('fill') === '#4b5563'`),
  );
  await pause(600);
  await page.screenshot({ path: `${SHOTS}/2d-step9c-story-light.png` });
  await page.evaluate(`localStorage.setItem('pathogen-theme', 'dark')`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitFor('the stories', async () => page.evaluate(`!!window.__find('.story-tab[data-story="4"]')`));
  await page.evaluate(`window.__find('.story-tab[data-story="4"]').click()`);
  await waitFor('the story’s frame', async () =>
    page.evaluate(`window.__frame()?.getElementById('preview-bg')?.getAttribute('fill') === '#4b5563'`),
  );
  await pause(600);
  c = await canvas(page);
  await page.screenshot({ path: `${SHOTS}/2d-step9c-story-dark.png` });
  check('the story (dark): the grid on, the background slate', c.grid === 'block' && c.bg === '#4b5563', c);
  await page.evaluate(`localStorage.setItem('pathogen-theme', 'light')`);

  // ---------- 2. A published post's embed ----------
  await page.goto(`${PAGES_URL}/blog/${POST}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the post’s embed', async () => page.evaluate(`!!window.__frame()?.getElementById('preview-bg')`));
  await page.evaluate(`window.__mw().scrollIntoView({ block: 'center' })`);
  await pause(500);
  await openBar(page);
  await press(page, '#bg-btn');
  await press(page, '.swatch[data-color="#e5e7eb"]');
  c = await canvas(page);
  await page.screenshot({ path: `${SHOTS}/2d-step9c-blog-light.png` });
  check('a post’s embed: Background colours its canvas', c.bg === '#e5e7eb', c);

  // Background pressed at once, while the bar is still unfolding: it opens, whole, once the bar has
  // (the code review's case; the bar clips what hangs below it until then).
  await press(page, '#summary');
  await page.evaluate(`(() => {
    window.__mwRoot().querySelector('#summary').click();
    window.__mwRoot().querySelector('#bg-btn').click();
  })()`);
  const openedEarly = (await page.evaluate(`!window.__mwRoot().querySelector('#bg-popover').hidden`)) as boolean;
  await waitFor('the popover', async () => page.evaluate(`!window.__mwRoot().querySelector('#bg-popover').hidden`));
  await pause(200);
  const afterUnfold = await popoverWhole(page);
  check(
    'pressed while the bar unfolds, Background opens once it has, whole',
    !openedEarly && afterUnfold.open === true && afterUnfold.centre === true && afterUnfold.bottom === true,
    { openedEarly, afterUnfold },
  );
  await page.keyboard.press('Escape');

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(`${PAGES_URL}/blog/${POST}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the post’s embed', async () => page.evaluate(`!!window.__frame()?.getElementById('preview-bg')`));
  await page.evaluate(`window.__mw().scrollIntoView({ block: 'start' })`);
  await pause(500);
  await openBar(page, true);
  await page.evaluate(
    `window.__mwRoot().querySelector('#bg-btn').scrollIntoView({ inline: 'center', block: 'nearest' })`,
  );
  await pause(200);
  await press(page, '#bg-btn', true);
  const phoneWhole = await popoverWhole(page);
  const sideways = (await page.evaluate(`document.documentElement.scrollWidth - window.innerWidth`)) as number;
  await page.screenshot({ path: `${SHOTS}/2d-step9c-blog-phone-light.png` });
  check(
    'on a phone: the bar opens, the popover is whole and on screen, nothing scrolls sideways',
    phoneWhole.open === true && phoneWhole.inView === true && phoneWhole.centre === true && sideways <= 0,
    { phoneWhole, sideways },
  );
  await press(page, '.swatch[data-color="#4b5563"]', true);
  c = await canvas(page);
  check('on a phone, a tapped swatch colours the canvas', c.bg === '#4b5563', c);

  check('no page errors', pageErrors.length === 0, pageErrors);
} finally {
  await browser.close();
}
console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

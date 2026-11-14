// Phase 2d, step 9b (note 52; mockup v7 screen M; docs/workspace-files.md
// "On a phone"): narrow screens, in the served playground.
// 1. A phone, 390 px, touch, with taps:
//    - Files starts closed; the breadcrumb has no id or size, and Snapshot is
//      its icon;
//    - Files opens the tree as a drawer from the left, the rest dimmed, every
//      row's ⋮ shown, nothing draggable;
//    - a row's ⋮ is an action sheet (its path, the same items, Cancel); the +
//      has no Upload folder…;
//    - tapping a file opens it and closes the drawer; a tap on the dimming
//      closes it;
//    - the chip's list is a sheet from the foot, the screen's width, with
//      Open in the editor on every row;
//    - nothing scrolls sideways.
// 2. 760 px with a mouse: the same rule (not the touch rule): the drawer, the
//    sheet, Esc closing each in turn; Upload folder… is there.
// 3. Back to a desktop: the tree starts open, rows drag, menus are popovers;
//    narrowing the window with the tree open closes it.
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/verify-2d-step9b.ts

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';
const SHOTS = 'project-docs/modules/verify';
const ownerId = Array.from(
  { length: 21 },
  () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)],
).join('');

const GEARS =
  'module;\n\nexport fn gear(center, radius, teeth) {\n  star(center.x, center.y, radius, radius - 6, teeth);\n  circle(center.x, center.y, radius * 0.3);\n}\n';
const KIT = 'module;\n\nexport const size = 28;\n';
const MAIN =
  'import { gear } from "./parts/gears.pathogen";\n\ndefine ViewBox(0, 0, 200, 100);\ngear(Point(55, 50), 40, 12);\ngear(Point(150, 50), 28, 8);\n';
const TRY =
  'import { gear } from "./parts/gears.pathogen";\n\ndefine ViewBox(0, 0, 200, 100);\ngear(Point(100, 50), 40, 6);\n';
const FILES: Record<string, string> = {
  'main.pathogen': MAIN,
  'try-sizes.pathogen': TRY,
  'parts/gears.pathogen': GEARS,
  'parts/kit.pathogen': KIT,
};

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 1400)}`}`);
  if (!ok) failures++;
};

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${DEV_API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-User-Id': ownerId, Connection: 'close' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

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
  window.__tree = () => window.__find('file-tree').shadowRoot;
  window.__crumb = () => window.__find('app-breadcrumb').shadowRoot;
  window.__chip = () => window.__find('program-chip').shadowRoot;
  window.__main = () => window.__find('playground-main');
  window.__rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  window.__shown = (el) => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
`;

const storeGet = async (page: Page, key: string): Promise<unknown> =>
  page.evaluate(`import('/state/store.js').then((m) => m.store.get('${key}'))`);

/** The centre of an element: `root` is an expression for a (shadow) root. */
async function centre(page: Page, root: string, selector: string): Promise<{ x: number; y: number }> {
  const at = (await page.evaluate(`(() => {
    const el = (${root}).querySelector('${selector}');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`)) as { x: number; y: number } | null;
  if (!at) throw new Error(`nothing at ${selector}`);
  return at;
}

/** A tap (touch) or a click (mouse), as the run uses. */
async function press(page: Page, touch: boolean, root: string, selector: string): Promise<void> {
  const at = await centre(page, root, selector);
  if (touch) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
  await pause(350);
}

async function screenRules(page: Page): Promise<{ width: number; narrow: boolean; touch: boolean }> {
  return page.evaluate(`({
    width: window.innerWidth,
    narrow: matchMedia('(max-width: 800px)').matches,
    touch: matchMedia('(hover: none)').matches,
  })`) as Promise<{ width: number; narrow: boolean; touch: boolean }>;
}

async function treeState(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(`(() => {
    const tree = window.__find('file-tree');
    const root = tree.shadowRoot;
    const main = window.__main();
    const scrim = main.shadowRoot.querySelector('.drawer-scrim');
    const rows = [...root.querySelectorAll('[role="treeitem"]')];
    const menu = root.querySelector('.menu');
    return {
      filesOpen: null,
      tree: window.__rect(tree),
      treeShown: window.__shown(tree),
      position: getComputedStyle(tree).position,
      main: window.__rect(main),
      scrim: window.__shown(scrim),
      close: window.__shown(root.querySelector('.close-files')),
      hint: window.__shown(root.querySelector('.drawer-hint')) ? root.querySelector('.drawer-hint').textContent : null,
      draggable: rows.filter((r) => r.hasAttribute('draggable')).length,
      dotsShown: rows.filter((r) => r.querySelector('.row-menu') && getComputedStyle(r.querySelector('.row-menu')).visibility === 'visible').length,
      dotsTotal: rows.filter((r) => r.querySelector('.row-menu')).length,
      menu: menu.hidden ? null : {
        sheet: menu.classList.contains('sheet'),
        rect: window.__rect(menu),
        head: menu.querySelector('.menu-head')?.textContent ?? null,
        labels: [...menu.querySelectorAll('[role="menuitem"] .label')].map((l) => l.textContent),
        cancel: menu.querySelector('.menu-cancel')?.textContent ?? null,
      },
    };
  })()`) as Promise<Record<string, unknown>>;
}

async function chipState(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(`(() => {
    const root = window.__chip();
    const list = root.querySelector('.list');
    return {
      open: !list.hidden,
      rect: window.__rect(list),
      scrim: window.__shown(root.querySelector('.scrim')),
      opensShown: [...root.querySelectorAll('.prow .open')].filter((b) => getComputedStyle(b).visibility === 'visible').length,
      rows: root.querySelectorAll('.prow').length,
    };
  })()`) as Promise<Record<string, unknown>>;
}

async function load(page: Page, id: string): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the drawing', async () =>
    page.evaluate(`(() => {
      const doc = window.__find('svg-preview-pane')?.shadowRoot.querySelector('iframe')?.contentDocument;
      return (doc?.querySelectorAll('#preview-layers path') ?? []).length > 0;
    })()`),
  );
  await waitFor('the tree', async () => page.evaluate(`!!window.__tree()?.querySelector('[role="treeitem"]')`));
  await pause(500);
}

const made: string[] = [];
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.on('dialog', (d) => void d.accept());
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.evaluateOnNewDocument(FIND);
  // Every frame runs this, the sandboxed preview iframe too, whose storage is off-limits.
  await page.evaluateOnNewDocument(
    `try {
      localStorage.setItem(${JSON.stringify(ANON_KEY)}, ${JSON.stringify(ownerId)});
      if (!localStorage.getItem('pathogen-theme')) localStorage.setItem('pathogen-theme', 'light');
    } catch {}`,
  );
  const created = (await api('POST', '/workspace', {
    name: '9b narrow',
    files: Object.fromEntries(Object.entries(FILES).map(([p, text]) => [p, { text }])),
    entryPoints: ['main.pathogen', 'try-sizes.pathogen'],
  })) as { id: string };
  made.push(created.id);

  // ---------- 1. A phone ----------
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await load(page, created.id);
  const phone = await screenRules(page);
  check(
    'the phone run: 390 px, the narrow rule and the touch rule apply',
    phone.width === 390 && phone.narrow && phone.touch,
    phone,
  );

  let t = await treeState(page);
  const crumb = (await page.evaluate(`(() => {
    const root = window.__crumb();
    const snap = root.querySelector('#snapshot-btn');
    return {
      id: window.__shown(root.querySelector('.workspace-id')),
      size: window.__shown(root.querySelector('.workspace-size')),
      snapLabel: window.__shown(snap.querySelector('span')),
      snapName: snap.getAttribute('aria-label'),
    };
  })()`)) as Record<string, unknown>;
  check(
    'Files starts closed; the breadcrumb has no id or size, and Snapshot is its icon, named "Snapshot"',
    (await storeGet(page, 'filesOpen')) === false &&
      t.treeShown === false &&
      crumb.id === false &&
      crumb.size === false &&
      crumb.snapLabel === false &&
      crumb.snapName === 'Snapshot',
    { t, crumb },
  );
  await page.screenshot({ path: `${SHOTS}/2d-step9b-phone-light.png` });

  await press(page, true, 'window.__crumb()', '#files-toggle');
  t = await treeState(page);
  const main = t.main as { top: number };
  const tree = t.tree as { left: number; top: number; width: number; bottom: number };
  check(
    'Files opens a drawer: from the left, under the breadcrumb, at most 320 px, over a dimmed screen, with its × and its line',
    (await storeGet(page, 'filesOpen')) === true &&
      t.position === 'fixed' &&
      tree.left === 0 &&
      Math.abs(tree.top - main.top) <= 1 &&
      tree.width <= 320 &&
      Math.abs(tree.bottom - 844) <= 1 &&
      t.scrim === true &&
      t.close === true &&
      t.hint === 'Tap a file to open it; the drawer closes. Every row has its ⋮.',
    t,
  );
  check(
    'in the drawer every row’s ⋮ shows, and nothing is draggable',
    t.dotsShown === t.dotsTotal && (t.dotsTotal as number) > 0 && t.draggable === 0,
    t,
  );
  await page.screenshot({ path: `${SHOTS}/2d-step9b-phone-files-light.png` });

  // A row's ⋮: an action sheet.
  await press(page, true, 'window.__tree()', '[data-path="parts/kit.pathogen"] .row-menu');
  t = await treeState(page);
  const menu = t.menu as {
    sheet: boolean;
    rect: { left: number; right: number; bottom: number };
    head: string;
    labels: string[];
    cancel: string;
  } | null;
  check(
    'a row’s ⋮ is an action sheet at the foot of the screen: its path, the same items, Cancel',
    !!menu &&
      menu.sheet &&
      menu.rect.left === 8 &&
      Math.abs(menu.rect.right - (390 - 8)) <= 1 &&
      menu.rect.bottom <= 844 &&
      menu.rect.bottom >= 844 - 16 &&
      menu.head === 'parts/kit.pathogen' &&
      JSON.stringify(menu.labels) === '["Rename…","Move to…","Duplicate","Delete…"]' &&
      menu.cancel === 'Cancel',
    t.menu,
  );
  await page.screenshot({ path: `${SHOTS}/2d-step9b-phone-row-menu-light.png` });
  await press(page, true, 'window.__tree()', '.menu-cancel');
  t = await treeState(page);
  check(
    'Cancel closes the sheet, and the drawer stays',
    t.menu === null && (await storeGet(page, 'filesOpen')) === true,
    t,
  );

  // The +: no Upload folder… on a touch screen.
  await press(page, true, 'window.__tree()', '.add');
  t = await treeState(page);
  check(
    'the + is a sheet too, with Upload files… and no Upload folder…',
    !!t.menu &&
      (t.menu as { sheet: boolean }).sheet &&
      (t.menu as { labels: string[] }).labels.includes('Upload files…') &&
      !(t.menu as { labels: string[] }).labels.includes('Upload folder…'),
    t.menu,
  );
  await press(page, true, 'window.__tree()', '.menu-cancel');

  // Tapping a file opens it and closes the drawer.
  await press(page, true, 'window.__tree()', '[data-path="try-sizes.pathogen"]');
  check(
    'tapping a file opens it, and the drawer closes',
    (await storeGet(page, 'openFile')) === 'try-sizes.pathogen' && (await storeGet(page, 'filesOpen')) === false,
    { open: await storeGet(page, 'openFile'), filesOpen: await storeGet(page, 'filesOpen') },
  );

  // The dimming closes it.
  await press(page, true, 'window.__crumb()', '#files-toggle');
  await page.touchscreen.tap(370, 600);
  await pause(350);
  check('a tap on the dimming closes the drawer', (await storeGet(page, 'filesOpen')) === false);

  // The chip's list: a sheet.
  await press(page, true, 'window.__chip()', '.pick');
  const c = await chipState(page);
  const cr = c.rect as { left: number; right: number; bottom: number; width: number };
  check(
    'the program list is a sheet from the foot, the screen’s width, Open in the editor on every row, the rest dimmed',
    c.open === true &&
      cr.left === 0 &&
      Math.abs(cr.width - 390) <= 1 &&
      Math.abs(cr.bottom - 844) <= 1 &&
      c.opensShown === c.rows &&
      (c.rows as number) === 2 &&
      c.scrim === true,
    c,
  );
  await page.screenshot({ path: `${SHOTS}/2d-step9b-phone-programs-light.png` });
  await page.touchscreen.tap(200, 150);
  await pause(350);
  check('a tap on the dimming closes the list', (await chipState(page)).open === false);
  const sideways = (await page.evaluate(`document.documentElement.scrollWidth - window.innerWidth`)) as number;
  check('nothing scrolls sideways', sideways <= 0, sideways);

  // A new program made in the drawer opens, and the drawer closes, as choosing a file does (the code review's case).
  await press(page, true, 'window.__crumb()', '#files-toggle');
  await press(page, true, 'window.__tree()', '.add');
  await press(page, true, 'window.__tree()', '[role="menuitem"][data-action="new-program"]');
  await page.keyboard.type('shapes');
  await page.keyboard.press('Enter');
  await pause(700);
  check(
    'a new program made in the drawer opens, and the drawer closes',
    (await storeGet(page, 'openFile')) === 'shapes.pathogen' && (await storeGet(page, 'filesOpen')) === false,
    { open: await storeGet(page, 'openFile'), filesOpen: await storeGet(page, 'filesOpen') },
  );

  // The list's sheet over an error: the main broken, its panel over the editor. The sheet's dimming
  // must cover the panel (the list sits in a stacking context at z-index 10; the code review's case).
  await press(page, true, `window.__find('editor-tabs').shadowRoot`, '[role="tab"][data-path="main.pathogen"]');
  await page.evaluate(`(() => {
    const view = window.__find('code-editor-pane')._editor;
    view.dispatch({ changes: { from: view.state.doc.length, insert: 'circle(60, nope, 10);\\n' } });
  })()`);
  await waitFor('the error panel', async () =>
    page.evaluate(
      `window.__find('workspace-view').shadowRoot.querySelector('error-panel').classList.contains('visible')`,
    ),
  );
  await press(page, true, 'window.__chip()', '.pick');
  const overPanel = await page.evaluate(`(() => {
    const r = window.__find('workspace-view').shadowRoot.querySelector('error-panel').getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + Math.min(20, r.height / 2);
    let el = document.elementFromPoint(x, y);
    while (el?.shadowRoot) {
      const inner = el.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    return { tag: el?.tagName ?? null, cls: typeof el?.className === 'string' ? el.className : null };
  })()`);
  await page.screenshot({ path: `${SHOTS}/2d-step9b-phone-programs-over-error-light.png` });
  check(
    'with an error showing, the list’s dimming covers the error panel',
    (overPanel as { cls: string | null }).cls === 'scrim',
    overPanel,
  );
  await page.touchscreen.tap(200, 150);
  await pause(300);
  // The main as it was.
  await page.evaluate(`(() => {
    const view = window.__find('code-editor-pane')._editor;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: ${JSON.stringify(MAIN)} } });
  })()`);
  await waitFor('the main draws again', async () => (await storeGet(page, 'compilationStatus')) !== 'error');
  await waitFor('the save', async () => (await storeGet(page, 'saveStatus')) === 'saved');

  // Dark: the drawer.
  await page.evaluate(`localStorage.setItem('pathogen-theme', 'dark')`);
  await load(page, created.id);
  await press(page, true, 'window.__crumb()', '#files-toggle');
  await page.screenshot({ path: `${SHOTS}/2d-step9b-phone-files-dark.png` });
  await press(page, true, 'window.__tree()', '[data-path="parts/kit.pathogen"] .row-menu');
  await page.screenshot({ path: `${SHOTS}/2d-step9b-phone-row-menu-dark.png` });
  await page.evaluate(`localStorage.setItem('pathogen-theme', 'light')`);

  // ---------- 2. 760 px with a mouse ----------
  await page.setViewport({ width: 760, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await load(page, created.id);
  const mid = await screenRules(page);
  check(
    'the 760 px run: the narrow rule applies, the touch rule doesn’t',
    mid.width === 760 && mid.narrow && !mid.touch,
    mid,
  );
  check('at 760 px Files starts closed', (await storeGet(page, 'filesOpen')) === false);
  await press(page, false, 'window.__crumb()', '#files-toggle');
  t = await treeState(page);
  check(
    'at 760 px with a mouse: the drawer, every ⋮ shown, nothing draggable (the narrow rule alone)',
    t.position === 'fixed' && t.scrim === true && t.dotsShown === t.dotsTotal && t.draggable === 0,
    t,
  );
  await press(page, false, 'window.__tree()', '.add');
  t = await treeState(page);
  check(
    'the + is a sheet, and with a mouse Upload folder… is there',
    !!t.menu &&
      (t.menu as { sheet: boolean }).sheet &&
      (t.menu as { labels: string[] }).labels.includes('Upload folder…'),
    t.menu,
  );
  await page.screenshot({ path: `${SHOTS}/2d-step9b-760-light.png` });
  await page.keyboard.press('Escape');
  await pause(250);
  t = await treeState(page);
  const afterFirstEsc = { menu: t.menu, filesOpen: await storeGet(page, 'filesOpen') };
  await page.keyboard.press('Escape');
  await pause(250);
  check(
    'Esc closes the sheet first, then the drawer',
    afterFirstEsc.menu === null && afterFirstEsc.filesOpen === true && (await storeGet(page, 'filesOpen')) === false,
    { afterFirstEsc, filesOpen: await storeGet(page, 'filesOpen') },
  );
  const focusedId = async (): Promise<string | null> =>
    page.evaluate(`(() => {
      let el = document.activeElement;
      while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
      return el?.id ?? null;
    })()`) as Promise<string | null>;
  check(
    'dismissed, the drawer hands the keyboard back to Files',
    (await focusedId()) === 'files-toggle',
    await focusedId(),
  );

  // The docs open too: Esc closes the docs only; the next Esc closes the drawer (the code review's case).
  // A click on Files would close the docs first (a click outside them does), so Files is pressed
  // from the keyboard, as a keyboard user has both open.
  await press(page, false, `window.__find('editor-tabs').shadowRoot`, '.docs');
  const docsOpen = async (): Promise<boolean> =>
    page.evaluate(
      `window.__find('workspace-view').shadowRoot.querySelector('docs-panel').classList.contains('open')`,
    ) as Promise<boolean>;
  await waitFor('the docs', docsOpen);
  await page.evaluate(`window.__crumb().querySelector('#files-toggle').focus()`);
  await page.keyboard.press('Enter');
  await pause(300);
  const bothOpen = (await docsOpen()) && (await storeGet(page, 'filesOpen')) === true;
  await page.keyboard.press('Escape');
  await pause(300);
  const afterDocsEsc = { docs: await docsOpen(), filesOpen: await storeGet(page, 'filesOpen') };
  await page.keyboard.press('Escape');
  await pause(300);
  check(
    'with the docs open, Esc closes the docs and leaves the drawer; the next Esc closes the drawer',
    bothOpen &&
      afterDocsEsc.docs === false &&
      afterDocsEsc.filesOpen === true &&
      (await storeGet(page, 'filesOpen')) === false,
    { bothOpen, afterDocsEsc, filesOpen: await storeGet(page, 'filesOpen') },
  );

  // ---------- 3. Back to a desktop ----------
  await page.setViewport({ width: 1320, height: 860, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await load(page, created.id);
  const wide = await screenRules(page);
  t = await treeState(page);
  check(
    'a desktop: the tree starts open beside the editor, rows drag, no × or line',
    wide.width === 1320 &&
      !wide.narrow &&
      (await storeGet(page, 'filesOpen')) === true &&
      t.position !== 'fixed' &&
      (t.draggable as number) > 0 &&
      t.close === false &&
      t.hint === null,
    { wide, t },
  );
  await press(page, false, 'window.__tree()', '.add');
  t = await treeState(page);
  check(
    'a desktop’s + is a popover, with no Cancel',
    !!t.menu && !(t.menu as { sheet: boolean }).sheet && (t.menu as { cancel: string | null }).cancel === null,
    t.menu,
  );
  await page.keyboard.press('Escape');
  await page.setViewport({ width: 700, height: 860, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await pause(500);
  t = await treeState(page);
  check(
    'narrowing the window with the tree open closes it, rather than open a drawer over the editor',
    (await storeGet(page, 'filesOpen')) === false && t.treeShown === false && t.draggable === 0,
    { filesOpen: await storeGet(page, 'filesOpen'), t },
  );

  check('no page errors', pageErrors.length === 0, pageErrors);
} finally {
  for (const id of made) await api('DELETE', `/workspace/${id}`).catch(() => undefined);
  await browser.close();
}
console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

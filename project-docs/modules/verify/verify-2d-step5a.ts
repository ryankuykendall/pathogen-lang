// Phase 2d, step 5a (note 52; mockup v6 screen G): the program chip. In the
// served playground: beside the zoom controls, centred with them, only with two
// programs or more; its list (pathogen.json's order, no libraries, the check on
// the one shown); a row shows its program, Open in the editor leaves the
// preview alone; the keyboard; a program that gains `module;` leaves the list
// and pathogen.json (the one shown hands the preview back to the main) and goes
// back at the end without it; the main as a library lights the chip; the
// thumbnail is the main's only (Set Thumbnail waits, and the automatic one
// isn't taken with another program shown; a control shows the check sees one
// taken); fullscreen, a narrow window, light, dark, and the storybook.
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/verify-2d-step5a.ts

import puppeteer from 'puppeteer';

import type { HTTPRequest, Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';
const SHOTS = 'project-docs/modules/verify';
const ownerId = Array.from(
  { length: 21 },
  () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)],
).join('');

const FILES: Record<string, string> = {
  'main.pathogen':
    'import { gear } from "./parts/gears.pathogen";\n\ndefine ViewBox(0, 0, 200, 100);\ngear(55, 50, 40);\ngear(150, 50, 28);\n',
  'demos/gears.pathogen':
    'import { gear } from "../parts/gears.pathogen";\n\ndefine ViewBox(0, 0, 200, 100);\ngear(40, 50, 22);\ngear(100, 50, 22);\ngear(160, 50, 22);\n',
  'try-sizes.pathogen': 'define ViewBox(0, 0, 200, 100);\ncircle(60, 50, 12);\ncircle(140, 50, 30);\n',
  'parts/gears.pathogen': 'module;\n\nexport fn gear(cx, cy, r) {\n  circle(cx, cy, r);\n  circle(cx, cy, r * 0.3);\n}\n',
  'parts/kit.pathogen': 'module;\n\nexport const size = 12;\n',
};
const ENTRY = ['main.pathogen', 'demos/gears.pathogen', 'try-sizes.pathogen'];

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 900)}`}`);
  if (!ok) failures++;
};

async function api(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${DEV_API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-User-Id': ownerId, Connection: 'close' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

async function waitFor<T>(what: string, probe: () => Promise<T | null | false>, ms = 30_000): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const value = await probe();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 200));
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
`;

const CHIP = `window.__find('program-chip').shadowRoot`;
const TABS = `window.__find('editor-tabs').shadowRoot`;
const CRUMB = `window.__find('app-breadcrumb').shadowRoot`;

interface ChipState {
  shown: boolean;
  name: string;
  title: string;
  alert: string | null;
  open: boolean;
  count: string;
  rows: { path: string; name: string; sub: string; error: boolean; on: boolean; badge: boolean }[];
  focused: { path: string | null; open: boolean } | null;
}

async function chipState(page: Page): Promise<ChipState> {
  return page.evaluate(`(() => {
    const host = window.__find('program-chip');
    const r = host.shadowRoot;
    const active = r.activeElement;
    return {
      shown: !host.hidden && getComputedStyle(host).display !== 'none',
      name: r.querySelector('.pick .name').textContent,
      title: r.querySelector('.pick').title,
      alert: r.querySelector('.pick-err')?.title ?? null,
      open: !r.querySelector('.list').hidden,
      count: r.querySelector('.head .cnt').textContent,
      rows: [...r.querySelectorAll('.prow')].map((row) => ({
        path: row.dataset.path,
        name: row.querySelector('.nm').textContent,
        sub: (row.querySelector('.p') ?? row.querySelector('.e')).textContent,
        error: row.classList.contains('err'),
        on: row.classList.contains('on'),
        badge: !!row.querySelector('.badge'),
      })),
      focused: active ? { path: active.closest('.prow')?.dataset.path ?? null, open: active.classList.contains('open') } : null,
    };
  })()`) as never;
}

const storeGet = async (page: Page, key: string): Promise<unknown> =>
  page.evaluate(`import('/state/store.js').then((m) => m.store.get('${key}'))`);

const drawn = async (page: Page): Promise<string> =>
  page.evaluate(`(() => {
    const doc = window.__find('svg-preview-pane').shadowRoot.querySelector('iframe')?.contentDocument;
    return [...(doc?.querySelectorAll('#preview-layers path') ?? [])].map((p) => p.getAttribute('d')).join(' ');
  })()`) as Promise<string>;

const openTab = async (page: Page): Promise<string | null> =>
  page.evaluate(`window.__find('code-editor-pane').activePath`) as Promise<string | null>;

async function rectIn(page: Page, rootExpr: string, selector: string): Promise<{ x: number; y: number; w: number; h: number; top: number; bottom: number; left: number; right: number }> {
  const r = (await page.evaluate(`(() => {
    const el = (${rootExpr}).querySelector('${selector}');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height, top: b.top, bottom: b.bottom, left: b.left, right: b.right };
  })()`)) as { x: number; y: number; w: number; h: number; top: number; bottom: number; left: number; right: number } | null;
  if (!r) throw new Error(`nothing at ${selector}`);
  return r;
}

async function click(page: Page, rootExpr: string, selector: string): Promise<void> {
  const { x, y } = await rectIn(page, rootExpr, selector);
  await page.mouse.click(x, y);
  await pause(300);
}

async function waitDrawn(page: Page, includes: string, ms = 20_000): Promise<string | null> {
  return waitFor(`a drawing with ${includes}`, async () => {
    const d = await drawn(page);
    return d.includes(includes) ? d : null;
  }, ms);
}

async function open(page: Page, id: string): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the drawing', async () => ((await drawn(page)).length > 0 ? true : null));
  await waitFor('the chip', async () => ((await chipState(page)).shown ? true : null), 10_000);
  await pause(500);
}

/** Type at the end (or the start) of the open file. */
async function typeIn(page: Page, text: string, at: 'start' | 'end' = 'end'): Promise<void> {
  // CodeMirror loads from a CDN: the first keystroke of a run can come before it has.
  await waitFor('the editor', async () =>
    page.evaluate(`!!window.__find('workspace-view').shadowRoot.querySelector('code-editor-pane')._editor`),
  );
  await page.evaluate(`(() => {
    const pane = window.__find('workspace-view').shadowRoot.querySelector('code-editor-pane');
    pane.focusEditor();
    pane._editor.dispatch({ selection: { anchor: ${at === 'start' ? '0' : 'pane._editor.state.doc.length'} } });
  })()`);
  await page.keyboard.type(text);
}

async function setTheme(page: Page, theme: string): Promise<void> {
  await page.evaluate(`localStorage.setItem('pathogen-theme', '${theme}')`);
  await page.evaluateOnNewDocument((t: string) => localStorage.setItem('pathogen-theme', t), theme);
}

const made: string[] = [];
const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1320, height: 860 } });
try {
  const page = await browser.newPage();
  page.on('dialog', (d) => void d.accept());
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.evaluateOnNewDocument(FIND);
  await page.evaluateOnNewDocument(
    (key: string, value: string) => {
      localStorage.setItem(key, value);
      localStorage.setItem('pathogen-theme', 'light');
    },
    ANON_KEY,
    ownerId,
  );
  // Every thumbnail upload, to see when one is (and isn't) taken.
  const uploads: string[] = [];
  page.on('request', (req: HTTPRequest) => {
    if (req.method() !== 'GET' && req.method() !== 'OPTIONS' && /\/workspace\/[^/]+\/thumbnail/.test(req.url())) uploads.push(req.url());
  });
  const create = async (name: string, files: Record<string, string>, entryPoints: string[]): Promise<string> => {
    const created = await api('POST', '/workspace', {
      name,
      files: Object.fromEntries(Object.entries(files).map(([p, text]) => [p, { text }])),
      entryPoints,
    });
    made.push(created.id as string);
    return created.id as string;
  };
  const id = await create('5a program chip', FILES, ENTRY);
  const oneId = await create('5a one program', { 'main.pathogen': 'define ViewBox(0, 0, 100, 100);\ncircle(50, 50, 30);\n' }, ['main.pathogen']);

  // 1. The chip: beside the zoom controls, centred with them, naming the main.
  await open(page, id);
  const mainDrawn = await drawn(page);
  let c = await chipState(page);
  check(
    'the chip names the program shown, main, and says what it does',
    c.shown && c.name === 'main' && c.title === 'Showing main.pathogen. Choose a program' && c.alert === null && !c.open,
    c,
  );
  const pill = await rectIn(page, `window.__find('svg-preview-pane').shadowRoot`, 'pathogen-zoom-pill');
  const chipBox = await rectIn(page, CHIP, '.pick');
  const preview = (await page.evaluate(`(() => { const b = window.__find('svg-preview-pane').getBoundingClientRect(); return { left: b.left, right: b.right, bottom: b.bottom }; })()`)) as { left: number; right: number; bottom: number };
  const groupMid = (pill.left + chipBox.right) / 2;
  const previewMid = (preview.left + preview.right) / 2;
  check(
    'beside the zoom controls, the two centred together at the bottom of the preview',
    chipBox.left > pill.right &&
      chipBox.left - pill.right <= 12 &&
      Math.abs(chipBox.y - pill.y) <= 2 &&
      Math.abs(groupMid - previewMid) <= 2 &&
      preview.bottom - chipBox.bottom <= 20,
    { pill, chipBox, preview, groupMid, previewMid },
  );
  await page.screenshot({ path: `${SHOTS}/2d-step5a-closed-light.png` });

  // 2. The list: pathogen.json's order, no libraries, the check on main, the count.
  await click(page, CHIP, '.pick');
  c = await chipState(page);
  check(
    'the list opens upward: Programs 3, in pathogen.json’s order, no libraries, the check on main',
    c.open &&
      c.count === '3' &&
      JSON.stringify(c.rows.map((r) => [r.path, r.name, r.sub, r.on])) ===
        JSON.stringify([
          ['main.pathogen', 'main', 'main.pathogen', true],
          ['demos/gears.pathogen', 'gears', 'demos/gears.pathogen', false],
          ['try-sizes.pathogen', 'try-sizes', 'try-sizes.pathogen', false],
        ]),
    c,
  );
  const listBox = await rectIn(page, CHIP, '.list');
  check('it sits above the chip, inside the preview', listBox.bottom <= chipBox.top && listBox.left >= preview.left, { listBox, chipBox });
  // Hover a row: Open in the editor.
  const gearsRow = await rectIn(page, CHIP, '.prow[data-path="demos/gears.pathogen"]');
  await page.mouse.move(gearsRow.x - 40, gearsRow.y);
  await pause(250);
  const openVisible = (await page.evaluate(
    `getComputedStyle(${CHIP}.querySelector('.prow[data-path="demos/gears.pathogen"] .open')).visibility`,
  )) as string;
  await page.screenshot({ path: `${SHOTS}/2d-step5a-open-light.png` });
  check('hovering a row shows its Open in the editor', openVisible === 'visible', openVisible);

  // 3. Open in the editor: the file opens, the preview stays on main.
  await click(page, CHIP, '.prow[data-path="demos/gears.pathogen"] .open');
  await pause(500);
  c = await chipState(page);
  check(
    'Open in the editor opens demos/gears.pathogen; the preview and the chip stay on main',
    (await openTab(page)) === 'demos/gears.pathogen' && !c.open && c.name === 'main' && (await drawn(page)) === mainDrawn,
    { open: await openTab(page), chip: c.name },
  );

  // 4. A row shows its program: the preview, the chip, the check.
  await click(page, CHIP, '.pick');
  await click(page, CHIP, '.prow[data-path="try-sizes.pathogen"] .show');
  const tryDrawn = await waitFor('try-sizes drawn', async () => {
    const d = await drawn(page);
    return d.length > 0 && d !== mainDrawn ? d : null;
  });
  c = await chipState(page);
  check(
    'a row shows its program: try-sizes in the preview, the chip names it, the list closed',
    !!tryDrawn && c.name === 'try-sizes' && !c.open && (await storeGet(page, 'shownProgram')) === 'try-sizes.pathogen',
    { chip: c.name, open: c.open },
  );
  check('the editor still shows demos/gears.pathogen', (await openTab(page)) === 'demos/gears.pathogen');

  // 5. Set Thumbnail waits while another program is shown, and says why.
  const thumbItem = async () =>
    page.evaluate(`(() => {
      const b = ${CRUMB}.querySelector('[data-action="set-thumbnail"]');
      return b ? { disabled: b.disabled, why: b.querySelector('small')?.textContent ?? null } : null;
    })()`) as Promise<{ disabled: boolean; why: string | null } | null>;
  const waiting = await thumbItem();
  check('Set Thumbnail is off with try-sizes shown: "Show the main first"', !!waiting && waiting.disabled && waiting.why === 'Show the main first', waiting);

  // 6. The keyboard: Up opens on the program shown, Down moves, Enter shows, Escape goes back.
  await page.evaluate(`${CHIP}.querySelector('.pick').focus()`);
  await page.keyboard.press('ArrowUp');
  c = await chipState(page);
  const firstFocus = c.focused;
  await page.keyboard.press('ArrowDown');
  const wrapped = (await chipState(page)).focused;
  await page.keyboard.press('Escape');
  c = await chipState(page);
  const afterEscape = { open: c.open, onChip: (await page.evaluate(`${CHIP}.activeElement?.classList.contains('pick') ?? false`)) as boolean };
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await waitDrawn(page, mainDrawn.slice(0, 30));
  c = await chipState(page);
  check(
    'from the keyboard: Up opens on the program shown, Down wraps to main, Escape back to the chip, Home and Enter show main',
    firstFocus?.path === 'try-sizes.pathogen' &&
      wrapped?.path === 'main.pathogen' &&
      !afterEscape.open &&
      afterEscape.onChip &&
      c.name === 'main' &&
      (await drawn(page)) === mainDrawn,
    { firstFocus, wrapped, afterEscape, chip: c.name },
  );
  const ready = await waitFor('Set Thumbnail on', async () => ((await thumbItem())?.disabled === false ? true : null), 5000);
  check('with main shown again, Set Thumbnail is on', !!ready, await thumbItem());

  // 7. A press outside closes the list.
  await click(page, CHIP, '.pick');
  await page.mouse.click(500, 300);
  await pause(200);
  check('a press outside closes the list', !(await chipState(page)).open);

  // 7b. With the docs open too, Escape closes only the list; the next Escape closes the docs.
  // (The docs lie over the preview, so the list is opened from the keyboard, as Tab reaches the chip.)
  await click(page, TABS, '.docs');
  await pause(400);
  const docsOpen = async () =>
    (await page.evaluate(`window.__find('docs-panel').classList.contains('open')`)) as boolean;
  const docsBefore = await docsOpen();
  await page.evaluate(`${CHIP}.querySelector('.pick').focus()`);
  await page.keyboard.press('ArrowUp');
  const listOpened = (await chipState(page)).open;
  await page.keyboard.press('Escape');
  await pause(300);
  const afterFirst = { list: (await chipState(page)).open, docs: await docsOpen() };
  await page.keyboard.press('Escape');
  await pause(300);
  check(
    'with the docs open, Escape closes the list and leaves the docs; the next Escape closes the docs',
    docsBefore && listOpened && !afterFirst.list && afterFirst.docs && !(await docsOpen()),
    { docsBefore, listOpened, afterFirst, docsAfter: await docsOpen() },
  );

  // 8. try-sizes shown, then module; typed at its top: it leaves the list and pathogen.json, and the preview goes back to main.
  await click(page, CHIP, '.pick');
  await click(page, CHIP, '.prow[data-path="try-sizes.pathogen"] .show');
  await waitFor('try-sizes drawn', async () => ((await drawn(page)) === tryDrawn ? true : null));
  await page.evaluate(`window.__find('file-tree').shadowRoot.querySelector('[data-path="try-sizes.pathogen"]').click()`);
  await pause(400);
  await typeIn(page, 'module;\n', 'start');
  await waitFor('try-sizes out of the list', async () =>
    !((await storeGet(page, 'workspaceEntryPoints')) as string[]).includes('try-sizes.pathogen') ? true : null,
  );
  await waitDrawn(page, mainDrawn.slice(0, 30));
  c = await chipState(page);
  check(
    'try-sizes gains module;: out of the list and pathogen.json, and the preview back on main',
    JSON.stringify(await storeGet(page, 'workspaceEntryPoints')) === JSON.stringify(['main.pathogen', 'demos/gears.pathogen']) &&
      JSON.stringify(c.rows.map((r) => r.path)) === JSON.stringify(['main.pathogen', 'demos/gears.pathogen']) &&
      c.name === 'main' &&
      (await storeGet(page, 'shownProgram')) === null &&
      (await drawn(page)) === mainDrawn,
    { entry: await storeGet(page, 'workspaceEntryPoints'), rows: c.rows.map((r) => r.path), chip: c.name },
  );
  const savedOut = await waitFor('the list saved', async () => {
    const w = await api('GET', `/workspace/${id}`);
    return JSON.stringify(w.entryPoints) === JSON.stringify(['main.pathogen', 'demos/gears.pathogen']) ? w : null;
  }, 45_000);
  check('the server holds the list without it', savedOut !== null);
  // Take module; out again: back at the end.
  await page.evaluate(`(() => {
    const view = window.__find('code-editor-pane')._editor;
    view.dispatch({ changes: { from: 0, to: 'module;\\n'.length, insert: '' } });
  })()`);
  await waitFor('try-sizes back', async () =>
    ((await storeGet(page, 'workspaceEntryPoints')) as string[]).includes('try-sizes.pathogen') ? true : null,
  );
  check(
    'module; taken out: try-sizes goes back, at the end; the preview stays on main',
    JSON.stringify(await storeGet(page, 'workspaceEntryPoints')) ===
      JSON.stringify(['main.pathogen', 'demos/gears.pathogen', 'try-sizes.pathogen']) && (await chipState(page)).name === 'main',
    await storeGet(page, 'workspaceEntryPoints'),
  );

  // 9. The main gains module;: it stays first, its row says why, the chip lights.
  await page.evaluate(`window.__find('file-tree').shadowRoot.querySelector('[data-path="main.pathogen"]').click()`);
  await pause(400);
  await typeIn(page, 'module;\n', 'start');
  await waitFor('the chip lit', async () => ((await chipState(page)).alert !== null ? true : null), 5000);
  await click(page, CHIP, '.pick');
  c = await chipState(page);
  await page.screenshot({ path: `${SHOTS}/2d-step5a-main-library-light.png` });
  check(
    'the main gains module;: still first, its row says why, the chip’s red dot says so, Set Thumbnail waits',
    c.rows[0]?.path === 'main.pathogen' &&
      c.rows[0].error &&
      c.rows[0].sub === "A module now, so it can't draw as the main" &&
      c.alert === "main.pathogen: A module now, so it can't draw as the main" &&
      (await thumbItem())?.why === 'The main is a module now',
    { rows: c.rows, alert: c.alert, thumb: await thumbItem() },
  );
  await page.keyboard.press('Escape');
  await page.evaluate(`(() => {
    const view = window.__find('code-editor-pane')._editor;
    view.dispatch({ changes: { from: 0, to: 'module;\\n'.length, insert: '' } });
  })()`);
  await waitFor('the chip clear', async () => ((await chipState(page)).alert === null ? true : null), 5000);
  check('module; out of the main again: no red dot', (await chipState(page)).alert === null);

  // 10. The automatic thumbnail is the main's only. Typed (so it's due), try-sizes shown, the view left: none taken.
  await typeIn(page, '// due\n');
  await click(page, CHIP, '.pick');
  await click(page, CHIP, '.prow[data-path="try-sizes.pathogen"] .show');
  await waitFor('try-sizes drawn', async () => ((await drawn(page)) === tryDrawn ? true : null));
  uploads.length = 0;
  await page.evaluate(`import('/utils/router.js').then((m) => m.navigateTo('/workspaces'))`);
  await pause(4000);
  const withOther = uploads.length;
  // Control: back, main shown (the workspace opens on it), typed, left: one is taken.
  await open(page, id);
  await typeIn(page, '// due again\n');
  await pause(600);
  uploads.length = 0;
  await page.evaluate(`import('/utils/router.js').then((m) => m.navigateTo('/workspaces'))`);
  await waitFor('a thumbnail upload', async () => (uploads.length > 0 ? true : null), 15_000);
  check(
    'the automatic thumbnail isn’t taken with try-sizes shown; with main shown it is (the control)',
    withOther === 0 && uploads.length > 0,
    { withOther, withMain: uploads.length },
  );

  // 11. One program: no chip.
  await page.goto(`${PAGES_URL}/workspace/${oneId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the drawing', async () => ((await drawn(page)).length > 0 ? true : null));
  await pause(500);
  check('a workspace with one program has no chip', !(await chipState(page)).shown);

  // 12. Fullscreen: the chip is there; Escape closes its list and leaves fullscreen alone.
  await open(page, id);
  await page.evaluate(`window.__find('svg-preview-pane').shadowRoot.querySelector('#fullscreen-toggle').click()`);
  await pause(500);
  const isFull = async () => (await page.evaluate(`window.__find('svg-preview-pane').classList.contains('fullscreen')`)) as boolean;
  const fullBefore = await isFull();
  await click(page, CHIP, '.pick');
  await page.keyboard.press('Escape');
  await pause(300);
  c = await chipState(page);
  await page.screenshot({ path: `${SHOTS}/2d-step5a-fullscreen-light.png` });
  check('fullscreen: the chip is there; Escape closes its list and stays in fullscreen', fullBefore && c.shown && !c.open && (await isFull()), {
    fullBefore,
    chip: c.shown,
    open: c.open,
    after: await isFull(),
  });
  await page.keyboard.press('Escape');
  await pause(300);

  // 13. A narrow window (the panes stack): the chip and its list stay inside the preview.
  await page.setViewport({ width: 700, height: 900 });
  await open(page, id);
  await click(page, CHIP, '.pick');
  const narrowPreview = (await page.evaluate(`(() => { const b = window.__find('svg-preview-pane').getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; })()`)) as { left: number; right: number; top: number; bottom: number };
  const narrowList = await rectIn(page, CHIP, '.list');
  const paneScroll = (await page.evaluate(`(() => { const p = window.__find('svg-preview-pane'); return { h: p.scrollHeight - p.clientHeight, w: p.scrollWidth - p.clientWidth }; })()`)) as { h: number; w: number };
  await page.screenshot({ path: `${SHOTS}/2d-step5a-narrow-light.png` });
  check(
    'at 700 px the list fits inside the preview, and the preview doesn’t scroll',
    narrowList.top >= narrowPreview.top && narrowList.left >= narrowPreview.left && narrowList.right <= narrowPreview.right && paneScroll.h <= 0 && paneScroll.w <= 0,
    { narrowPreview, narrowList, paneScroll },
  );
  // 13b. A phone's width: the zoom controls and the chip fit side by side (the chip's name shortens).
  await page.setViewport({ width: 390, height: 844 });
  await open(page, id);
  await page.keyboard.press('Escape');
  const phone = (await page.evaluate(`(() => {
    const p = window.__find('svg-preview-pane');
    const b = p.getBoundingClientRect();
    const pill = p.shadowRoot.querySelector('pathogen-zoom-pill').getBoundingClientRect();
    const chip = window.__find('program-chip').getBoundingClientRect();
    return { w: p.scrollWidth - p.clientWidth, left: b.left, right: b.right, pillLeft: pill.left, chipRight: chip.right, overlap: pill.right > chip.left };
  })()`)) as { w: number; left: number; right: number; pillLeft: number; chipRight: number; overlap: boolean };
  await page.screenshot({ path: `${SHOTS}/2d-step5a-phone-light.png` });
  check(
    'at 390 px the zoom controls and the chip fit in the preview, side by side, and it doesn’t scroll sideways',
    phone.w <= 0 && phone.pillLeft >= phone.left && phone.chipRight <= phone.right && !phone.overlap,
    phone,
  );
  await page.setViewport({ width: 1320, height: 860 });

  // 14. Dark: the list open.
  await setTheme(page, 'dark');
  await open(page, id);
  await click(page, CHIP, '.pick');
  await page.screenshot({ path: `${SHOTS}/2d-step5a-open-dark.png` });
  await page.keyboard.press('Escape');

  // 15. The storybook: six chip stories, dark then light.
  for (const theme of ['dark', 'light']) {
    await setTheme(page, theme);
    await page.goto(`${PAGES_URL}/storybook/program-chip`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitFor('the story', async () =>
      page.evaluate(`!!window.__find('.story-tab')?.getRootNode().querySelector('program-chip')?.shadowRoot?.querySelector('.pick')`),
    );
    const stories = (await page.evaluate(
      `[...window.__find('.story-tab').parentElement.querySelectorAll('.story-tab')].map((b) => b.textContent.trim())`,
    )) as string[];
    for (const [i, name] of [[2, 'library'], [3, 'error']] as const) {
      await page.evaluate(`window.__find('.story-tab[data-story="${i}"]')?.click()`);
      await pause(500);
      await page.screenshot({ path: `${SHOTS}/2d-step5a-story-${name}-${theme}.png` });
    }
    // The list measures its room from the box that clips it (the story's stage), not the chip's own row.
    const rowsFit = (await page.evaluate(`(() => {
      const rows = window.__find('.story-tab').getRootNode().querySelector('program-chip').shadowRoot.querySelector('.rows');
      return rows.scrollHeight <= rows.clientHeight + 1;
    })()`)) as boolean;
    check(`in the story, the list shows its three programs without scrolling (${theme})`, rowsFit);
    // Six since 5a; 5b adds its own after them.
    check(`the storybook: six chip stories (${theme})`, stories.length >= 6, stories);
  }

  check('no page errors', pageErrors.length === 0, pageErrors);
} finally {
  await browser.close();
  for (const id of made) await api('DELETE', `/workspace/${id}`);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

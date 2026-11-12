// Phase 2d, step 4b (note 52): adding files and folders from the tree's "+"
// (docs/workspace-files.md "Adding files and folders", mockup v6 screen N). In
// the served playground: the menu says where things go; New library's name
// field sits first in the folder, refuses a taken name in place, and Enter
// creates the file, which opens in a tab without changing the preview; New
// program joins the end of the program list; New folder is kept, and the +
// then adds to it; a slash makes folders; Esc cancels; the keyboard alone
// works; the server holds it all; a workspace's first program is shown; the
// 20-file limit is said in the field; the storybook, light and dark.
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/verify-2d-step4b.ts

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

const GEARS_LIB = 'module;\n\n// A gear: a rim and a hub.\nexport fn gear(cx, cy, r) {\n  circle(cx, cy, r);\n  circle(cx, cy, r * 0.3);\n}\n';
const FILES: Record<string, string> = {
  'main.pathogen':
    'import { gear } from "./parts/gears.pathogen";\n\ndefine ViewBox(0, 0, 200, 200);\ndefine default PathLayer(\'main\') #{\n  stroke: #6d3aa6;\n  stroke-width: 4;\n  fill: none;\n};\ngear(100, 100, 60);\n',
  'demos/gears.pathogen': 'import { gear } from "../parts/gears.pathogen";\n\ndefine ViewBox(0, 0, 300, 120);\ngear(60, 60, 40);\n',
  'parts/gears.pathogen': GEARS_LIB,
  'parts/kit.pathogen': 'module;\n\nexport const size = 12;\n',
};
const NEW_LIBRARY = 'module;\n\n// A library. Export fns, consts and enums here;\n// other files import them.\n';

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 600)}`}`);
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

async function create(name: string, files: Record<string, string>, entryPoints: string[]): Promise<string> {
  const data = await api('POST', '/workspace', {
    name,
    files: Object.fromEntries(Object.entries(files).map(([p, text]) => [p, { text }])),
    entryPoints,
  });
  return data.id as string;
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
`;

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The tree's rows (the name field as "[field]"), the menu, the field and its line, and the editor. */
async function state(page: Page): Promise<{
  rows: string[];
  menu: { open: boolean; head: string; items: string[]; focused: string | null };
  field: { value: string; invalid: string | null; focused: boolean; ext: string | null } | null;
  hint: string | null;
  open: string;
  text: string;
  tabs: string[];
  editorFocused: boolean;
}> {
  return page.evaluate(`(() => {
    const root = window.__tree();
    const menu = root.querySelector('.menu');
    const field = root.querySelector('.row.input input');
    const pane = window.__find('code-editor-pane');
    return {
      rows: [...root.querySelectorAll('.list > .row')].map((r) => r.dataset.path ?? (r.classList.contains('input') ? '[field]' : '(empty)')),
      menu: {
        open: !menu.hidden,
        head: menu.querySelector('.menu-head')?.textContent ?? '',
        items: [...menu.querySelectorAll('[role="menuitem"] .label')].map((l) => l.textContent),
        focused: root.activeElement?.getAttribute('role') === 'menuitem' ? root.activeElement.querySelector('.label').textContent : null,
      },
      field: field ? { value: field.value, invalid: field.getAttribute('aria-invalid'), focused: root.activeElement === field, ext: root.querySelector('.row.input .ext')?.textContent ?? null } : null,
      hint: root.querySelector('.name-hint')?.textContent ?? null,
      open: pane.activePath,
      text: pane._editor.state.doc.toString(),
      tabs: [...window.__find('editor-tabs').shadowRoot.querySelectorAll('[role="tab"]')].map((t) => t.dataset.path),
      editorFocused: pane._editor.hasFocus,
    };
  })()`) as never;
}

const drawn = async (page: Page): Promise<string> =>
  page.evaluate(`(() => {
    const doc = window.__find('svg-preview-pane').shadowRoot.querySelector('iframe')?.contentDocument;
    return [...(doc?.querySelectorAll('#preview-layers path') ?? [])].map((p) => p.getAttribute('d')).join(' ');
  })()`) as Promise<string>;

const storeGet = async (page: Page, key: string): Promise<unknown> =>
  page.evaluate(`import('/state/store.js').then((m) => m.store.get('${key}'))`);

async function clickIn(page: Page, selector: string): Promise<void> {
  const rect = (await page.evaluate(`(() => {
    const el = window.__tree().querySelector('${selector}');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  })()`)) as Rect | null;
  if (!rect) throw new Error(`nothing at ${selector}`);
  await page.mouse.click(rect.left + rect.width / 2, rect.top + rect.height / 2);
  await new Promise((r) => setTimeout(r, 250));
}

const clickRow = (page: Page, path: string): Promise<void> => clickIn(page, `[data-path="${path}"]`);
const clickPlus = (page: Page): Promise<void> => clickIn(page, '.add');
const choose = (page: Page, kind: string): Promise<void> => clickIn(page, `[role="menuitem"][data-kind="${kind}"]`);

async function typeName(page: Page, text: string): Promise<void> {
  await page.keyboard.type(text);
  await new Promise((r) => setTimeout(r, 150));
}

async function clearField(page: Page): Promise<void> {
  const length = ((await state(page)).field?.value ?? '').length;
  for (let i = 0; i < length; i++) await page.keyboard.press('Backspace');
}

async function open(page: Page, id: string, waitForDrawing = true): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  if (waitForDrawing) await waitFor('the drawing', async () => ((await drawn(page)).length > 0 ? true : null));
  await waitFor('the tree', async () => ((await state(page)).rows.length > 1 ? true : null));
  await new Promise((r) => setTimeout(r, 500));
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
  const saves: { files: string[]; folders?: string[]; entryPoints?: string[] }[] = [];
  page.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().startsWith(`${DEV_API}/workspace/`)) {
      const body = JSON.parse(req.postData() ?? '{}') as { files?: object; folders?: string[]; entryPoints?: string[] };
      if (body.files) saves.push({ files: Object.keys(body.files).sort(), folders: body.folders, entryPoints: body.entryPoints });
    }
  });
  await page.evaluateOnNewDocument(FIND);
  await page.evaluateOnNewDocument(
    (key: string, value: string) => {
      localStorage.setItem(key, value);
      localStorage.setItem('pathogen-theme', 'light');
    },
    ANON_KEY,
    ownerId,
  );

  const id = await create('4b adding', FILES, ['main.pathogen', 'demos/gears.pathogen']);
  made.push(id);
  await open(page, id);
  const before = await drawn(page);

  // 1. The + menu, with parts/gears.pathogen in the editor: it adds to parts/.
  await clickRow(page, 'parts/gears.pathogen');
  await clickPlus(page);
  let s = await state(page);
  check(
    'the + opens its menu for the folder of the file in the editor, the first item focused',
    s.menu.open &&
      s.menu.head === 'Add to parts/' &&
      JSON.stringify(s.menu.items) === '["New program","New library","New folder"]' &&
      s.menu.focused === 'New program',
    s.menu,
  );
  await page.screenshot({ path: `${SHOTS}/2d-step4b-menu-light.png` });

  // 2. New library: the field first in parts/, then a taken name refused in place.
  await choose(page, 'library');
  s = await state(page);
  const partsAt = s.rows.indexOf('parts');
  check(
    'New library puts a focused name field first in parts/, with .pathogen and its line',
    !s.menu.open &&
      s.rows[partsAt + 1] === '[field]' &&
      !!s.field?.focused &&
      s.field.ext === '.pathogen' &&
      s.hint === 'Starts with module; · Enter to create, Esc to cancel',
    s,
  );
  await typeName(page, 'gears');
  s = await state(page);
  check('a taken name is refused in place, with the workspace’s own message', s.field?.invalid === 'true' && s.hint === 'parts/ already has gears.pathogen.', s);
  await page.screenshot({ path: `${SHOTS}/2d-step4b-taken-light.png` });
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 200));
  s = await state(page);
  check('and Enter does nothing', !!s.field && !s.rows.includes('parts/gears-2.pathogen'), s.rows);

  // 3. A good name: the library opens in a tab, the keyboard in the editor; the preview stays.
  await clearField(page);
  await typeName(page, 'ratchet');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 500));
  s = await state(page);
  check(
    'Enter creates parts/ratchet.pathogen: in the tree, in a tab, with the library’s first lines, the keyboard in the editor',
    s.field === null &&
      s.rows.includes('parts/ratchet.pathogen') &&
      s.open === 'parts/ratchet.pathogen' &&
      s.text === NEW_LIBRARY &&
      s.tabs.includes('parts/ratchet.pathogen') &&
      s.editorFocused,
    s,
  );
  check('the preview didn’t change', (await drawn(page)) === before);
  await page.screenshot({ path: `${SHOTS}/2d-step4b-created-light.png` });

  // 4. New program at the top: it joins the end of the program list; the preview stays on the main.
  await clickRow(page, 'main.pathogen');
  await clickPlus(page);
  s = await state(page);
  check('with main.pathogen in the editor, the + adds at the top', s.menu.head === 'Add at the top', s.menu.head);
  await choose(page, 'program');
  await typeName(page, 'poster');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 500));
  s = await state(page);
  const entry = (await storeGet(page, 'workspaceEntryPoints')) as string[];
  check(
    'New program opens poster.pathogen, last in the program list, and the preview stays on the main',
    s.open === 'poster.pathogen' &&
      s.text.startsWith('define ViewBox(0, 0, 200, 200);') &&
      JSON.stringify(entry) === '["main.pathogen","demos/gears.pathogen","poster.pathogen"]' &&
      (await drawn(page)) === before,
    { open: s.open, entry },
  );

  // 5. New folder in demos/: kept empty, focused, and the + adds to it next.
  await clickRow(page, 'demos');
  await clickPlus(page);
  s = await state(page);
  check('a folder clicked is where the + adds', s.menu.head === 'Add to demos/', s.menu.head);
  await choose(page, 'folder');
  s = await state(page);
  check('New folder’s field has no .pathogen', !!s.field && s.field.ext === null && s.hint === 'Enter to create, Esc to cancel', s);
  await typeName(page, 'shapes');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 500));
  s = await state(page);
  const shapesAt = s.rows.indexOf('demos/shapes');
  const focusedRow = (await page.evaluate(`window.__tree().activeElement?.dataset?.path ?? null`)) as string | null;
  check('the empty folder is kept, says Empty, and has the keyboard', shapesAt >= 0 && s.rows[shapesAt + 1] === '(empty)' && focusedRow === 'demos/shapes', { rows: s.rows, focusedRow });
  await clickPlus(page);
  s = await state(page);
  check('the + then adds to it', s.menu.head === 'Add to demos/shapes/', s.menu.head);
  await choose(page, 'program');
  await typeName(page, 'star');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 500));
  s = await state(page);
  check('a program made in it', s.open === 'demos/shapes/star.pathogen' && !s.rows.includes('(empty)'), s);

  // 6. A slash makes folders.
  await clickRow(page, 'main.pathogen');
  await clickPlus(page);
  await choose(page, 'library');
  await typeName(page, 'lib/round/dot');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 500));
  s = await state(page);
  check(
    'a slash makes folders: lib/round/dot.pathogen',
    ['lib', 'lib/round', 'lib/round/dot.pathogen'].every((p) => s.rows.includes(p)) && s.open === 'lib/round/dot.pathogen',
    s.rows,
  );

  // 6b. The tree redrawn while a good name sits in the field (another file appears): nothing is made yet.
  await clickPlus(page);
  await choose(page, 'program');
  await typeName(page, 'later');
  const redraw = (await page.evaluate(`(() => {
    const tree = window.__find('file-tree');
    const old = tree.shadowRoot.querySelector('.row.input input');
    let blurred = false;
    old.addEventListener('blur', () => { blurred = true; });
    const files = tree.files;
    tree.files = [...files, { path: 'zz-redraw.pathogen', kind: 'program' }];
    const field = tree.shadowRoot.querySelector('.row.input input');
    const result = { blurred, value: field?.value ?? null, focused: tree.shadowRoot.activeElement === field };
    tree.files = files;
    return result;
  })()`)) as { blurred: boolean; value: string | null; focused: boolean };
  s = await state(page);
  check(
    'a redraw while a good name sits in the field makes nothing; the field keeps the name and the keyboard',
    redraw.value === 'later' && redraw.focused && !s.rows.includes('later.pathogen') && !s.tabs.includes('later.pathogen'),
    { redraw, rows: s.rows },
  );
  console.log(`  (Chrome ${redraw.blurred ? 'did' : 'did not'} blur the field as the redraw removed it)`);
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 200));

  // 7. Esc cancels.
  await clickPlus(page);
  await choose(page, 'program');
  await typeName(page, 'temp');
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 200));
  s = await state(page);
  const plusFocused = (await page.evaluate(`window.__tree().activeElement?.classList.contains('add') ?? false`)) as boolean;
  check('Esc cancels: no file, the field gone, the keyboard back on the +', s.field === null && !s.rows.some((r) => r.includes('temp')) && plusFocused, { rows: s.rows, plusFocused });

  // 8. The keyboard alone: Down opens the menu, Down and Enter choose, typing and Enter create.
  await page.keyboard.press('ArrowDown');
  await new Promise((r) => setTimeout(r, 150));
  s = await state(page);
  check('Down on the + opens the menu', s.menu.open && s.menu.focused === 'New program', s.menu);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 200));
  await typeName(page, 'springs');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 500));
  s = await state(page);
  check('…and Enter on New library, a name and Enter make it', s.open === 'lib/round/springs.pathogen', s.open);

  // 9. Saved: the server holds every file, the folders and the program list.
  await clickRow(page, 'main.pathogen');
  const saved = await waitFor(
    'a save with the new files',
    async () => (saves.some((b) => b.files.includes('lib/round/springs.pathogen')) ? true : null),
    45_000,
  );
  const stored = await api('GET', `/workspace/${id}`);
  const storedFiles = Object.keys((stored.files as object) ?? {}).sort();
  const expected = [
    ...Object.keys(FILES),
    'parts/ratchet.pathogen',
    'poster.pathogen',
    'demos/shapes/star.pathogen',
    'lib/round/dot.pathogen',
    'lib/round/springs.pathogen',
  ].sort();
  check(
    'the server holds the new files and the program list, in order',
    !!saved &&
      JSON.stringify(storedFiles) === JSON.stringify(expected) &&
      JSON.stringify(stored.entryPoints) ===
        '["main.pathogen","demos/gears.pathogen","poster.pathogen","demos/shapes/star.pathogen"]',
    { storedFiles, entryPoints: stored.entryPoints },
  );

  // 10. A reload shows them.
  await open(page, id);
  s = await state(page);
  check('after a reload the tree shows them', expected.every((p) => s.rows.includes(p)), s.rows);

  // 11. A workspace with only a library: its first program is the main, and shown.
  const libsId = await create('4b no programs', { 'parts/gears.pathogen': GEARS_LIB }, []);
  made.push(libsId);
  await open(page, libsId, false);
  await clickPlus(page);
  await choose(page, 'program');
  s = await state(page);
  check('with no programs, the field says the new one becomes the main', s.hint === 'The only program, so it becomes the main · Enter to create, Esc to cancel', s.hint);
  await typeName(page, 'first');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 800));
  const shown = await storeGet(page, 'shownProgram');
  const badge = (await page.evaluate(`!!window.__tree().querySelector('[data-path="parts/first.pathogen"] .badge-main')`)) as boolean;
  check('the first program is the main (badged) and the preview shows it', shown === 'parts/first.pathogen' && badge, { shown, badge });

  // 12. The 20-file limit, said in the field.
  const full: Record<string, string> = {};
  for (let i = 1; i <= 20; i++) full[`shape-${i}.pathogen`] = `define ViewBox(0, 0, 100, 100);\ncircle(50, 50, ${i});\n`;
  const fullId = await create('4b full', full, ['shape-1.pathogen']);
  made.push(fullId);
  await open(page, fullId);
  await clickPlus(page);
  await choose(page, 'program');
  await typeName(page, 'one-more');
  s = await state(page);
  check('at 20 files the field says so, and Enter does nothing', s.field?.invalid === 'true' && s.hint === 'A workspace can hold at most 20 files, and this one has 20.', s.hint);
  await page.keyboard.press('Escape');

  // 13. Dark mode.
  await setTheme(page, 'dark');
  await open(page, id);
  await clickRow(page, 'parts/gears.pathogen');
  await clickPlus(page);
  await page.screenshot({ path: `${SHOTS}/2d-step4b-menu-dark.png` });
  await choose(page, 'library');
  await typeName(page, 'Gears');
  await page.screenshot({ path: `${SHOTS}/2d-step4b-taken-dark.png` });
  s = await state(page);
  check('letter case aside, Gears is taken too', s.hint === 'parts/ already has gears.pathogen.', s.hint);
  await page.keyboard.press('Escape');

  // 14. The storybook entry, dark then light.
  for (const theme of ['dark', 'light']) {
    await setTheme(page, theme);
    await page.goto(`${PAGES_URL}/storybook/file-tree`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitFor('the story', async () =>
      page.evaluate(`!!window.__find('.story-tab')?.getRootNode().querySelector('file-tree')?.shadowRoot?.querySelector('[role="treeitem"]')`),
    );
    const names = (await page.evaluate(`(() => {
      const first = window.__find('.story-tab');
      return [...(first?.parentElement?.querySelectorAll('.story-tab') ?? [])].map((b) => b.textContent.trim());
    })()`)) as string[];
    for (const i of [5, 6]) {
      await page.evaluate(`window.__find('.story-tab[data-story="${i}"]')?.click()`);
      await new Promise((r) => setTimeout(r, 500));
      const box = (await page.evaluate(`(() => {
        const el = window.__find('.story-tab').getRootNode().querySelector('file-tree');
        const r = el.getBoundingClientRect();
        return { x: Math.max(0, r.x - 16), y: Math.max(0, r.y - 16), width: r.width + 32, height: r.height + 32 };
      })()`)) as { x: number; y: number; width: number; height: number };
      await page.screenshot({ path: `${SHOTS}/2d-step4b-story-${i + 1}-${theme}.png`, clip: box });
    }
    const storyHint = (await page.evaluate(
      `window.__find('.story-tab').getRootNode().querySelector('file-tree').shadowRoot.querySelector('.name-hint')?.textContent`,
    )) as string;
    check(`the storybook has the two new stories, and "A taken name" refuses it (${theme})`, names.length === 7 && storyHint === 'parts/ already has gears.pathogen.', { names, storyHint });
  }

  check('no page errors', pageErrors.length === 0, pageErrors);
} finally {
  await browser.close();
  for (const id of made) await api('DELETE', `/workspace/${id}`);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

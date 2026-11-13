// Phase 2d, step 4c-1 (note 52): each file's and folder's own menu (mockup v6
// screen E, v7 screen F). In the served playground: the ⋮ shows on hover and
// opens the row's menu, and so does a right-click; Set as main moves the main
// (its badge, pathogen.json open in the editor following) and leaves the
// preview alone; Duplicate makes the copy beside it; a folder's New module
// names it in that folder; Delete… asks first (the files and their importers,
// Cancel focused, Escape cancels), then deletes: the tab closes, the editor
// shows a neighbour, an import of it breaks, and a new file with its name
// starts with no undo history; a folder's Delete… takes its tabs; the server
// holds the result; the storybook, light and dark.
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/verify-2d-step4c1.ts

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

const FILES: Record<string, string> = {
  'main.pathogen':
    'import { gear } from "./parts/gears.pathogen";\nimport { size } from "./parts/kit.pathogen";\n\ndefine ViewBox(0, 0, 200, 200);\ndefine default PathLayer(\'main\') #{\n  stroke: #6d3aa6;\n  stroke-width: 4;\n  fill: none;\n};\ngear(100, 100, size * 5);\n',
  'try-sizes.pathogen': 'define ViewBox(0, 0, 200, 200);\ncircle(60, 100, 20);\ncircle(140, 100, 40);\n',
  'demos/gears.pathogen': 'import { gear } from "../parts/gears.pathogen";\n\ndefine ViewBox(0, 0, 300, 120);\ngear(60, 60, 40);\n',
  'parts/gears.pathogen': 'module;\n\nexport fn gear(cx, cy, r) {\n  circle(cx, cy, r);\n  circle(cx, cy, r * 0.3);\n}\n',
  'parts/kit.pathogen': 'module;\n\nexport const size = 12;\n',
};
const ENTRY = ['main.pathogen', 'demos/gears.pathogen', 'try-sizes.pathogen'];
const NEW_LIBRARY = 'module;\n\n// Export fns, consts and enums here, for other files to import.\n';

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 700)}`}`);
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

async function state(page: Page): Promise<{
  rows: string[];
  menu: { open: boolean; head: string; items: string[] };
  badges: string[];
  focusedRow: string | null;
  open: string;
  text: string;
  tabs: string[];
}> {
  return page.evaluate(`(() => {
    const root = window.__tree();
    const menu = root.querySelector('.menu');
    const pane = window.__find('code-editor-pane');
    return {
      rows: [...root.querySelectorAll('[role="treeitem"]')].map((r) => r.dataset.path),
      menu: {
        open: !menu.hidden,
        head: menu.querySelector('.menu-head')?.textContent ?? '',
        items: [...menu.querySelectorAll('[role="menuitem"] .label')].map((l) => l.textContent),
      },
      badges: [...root.querySelectorAll('.badge-main')].map((b) => b.closest('[role="treeitem"]').dataset.path),
      focusedRow: root.activeElement?.getAttribute('role') === 'treeitem' ? root.activeElement.dataset.path : null,
      open: pane.activePath,
      text: pane._editor.state.doc.toString(),
      tabs: [...window.__find('editor-tabs').shadowRoot.querySelectorAll('[role="tab"]')].map((t) => t.dataset.path),
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

async function rectOf(page: Page, selector: string): Promise<Rect> {
  const rect = (await page.evaluate(`(() => {
    const el = window.__tree().querySelector('${selector}');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  })()`)) as Rect | null;
  if (!rect) throw new Error(`nothing at ${selector}`);
  return rect;
}

async function clickIn(page: Page, selector: string, button: 'left' | 'right' = 'left'): Promise<void> {
  const rect = await rectOf(page, selector);
  await page.mouse.click(rect.left + rect.width / 2, rect.top + rect.height / 2, { button });
  await new Promise((r) => setTimeout(r, 250));
}

const clickRow = (page: Page, path: string): Promise<void> => clickIn(page, `[role="treeitem"][data-path="${path}"]`);

/** Open a row's menu with its ⋮ (hovering the row first, as a mouse would). */
async function rowMenu(page: Page, path: string): Promise<void> {
  const row = await rectOf(page, `[role="treeitem"][data-path="${path}"]`);
  await page.mouse.move(row.left + 20, row.top + row.height / 2);
  await new Promise((r) => setTimeout(r, 100));
  await clickIn(page, `[role="treeitem"][data-path="${path}"] .row-menu`);
}

const choose = (page: Page, action: string): Promise<void> => clickIn(page, `[role="menuitem"][data-action="${action}"]`);

/** The confirmation dialog, if one is up. */
async function dialog(page: Page): Promise<{
  title: string;
  message: string;
  items: string[];
  warning: string | null;
  confirm: string;
  cancelFocused: boolean;
} | null> {
  return page.evaluate(`(() => {
    const host = document.querySelector('confirm-dialog');
    if (!host) return null;
    const root = host.shadowRoot;
    return {
      title: root.querySelector('h2').textContent,
      message: root.querySelector('.message').textContent,
      items: [...root.querySelectorAll('li')].map((li) => li.textContent),
      warning: root.querySelector('.warning')?.textContent ?? null,
      confirm: root.querySelector('.confirm').textContent,
      cancelFocused: root.activeElement === root.querySelector('.cancel'),
    };
  })()`) as never;
}

async function clickDialog(page: Page, selector: string): Promise<void> {
  await page.evaluate(`document.querySelector('confirm-dialog').shadowRoot.querySelector('${selector}').click()`);
  await new Promise((r) => setTimeout(r, 400));
}

async function open(page: Page, id: string): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the drawing', async () => ((await drawn(page)).length > 0 ? true : null));
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
  await page.evaluateOnNewDocument(FIND);
  await page.evaluateOnNewDocument(
    (key: string, value: string) => {
      localStorage.setItem(key, value);
      localStorage.setItem('pathogen-theme', 'light');
    },
    ANON_KEY,
    ownerId,
  );

  const created = await api('POST', '/workspace', {
    name: '4c-1 menus',
    files: Object.fromEntries(Object.entries(FILES).map(([p, text]) => [p, { text }])),
    entryPoints: ENTRY,
  });
  const id = created.id as string;
  made.push(id);
  await open(page, id);
  const before = await drawn(page);

  // 1. The ⋮: hidden until the row is hovered; it opens the row's menu.
  const hidden = (await page.evaluate(
    `getComputedStyle(window.__tree().querySelector('[data-path="try-sizes.pathogen"] .row-menu')).visibility`,
  )) as string;
  await rowMenu(page, 'try-sizes.pathogen');
  let s = await state(page);
  check(
    'a program’s ⋮ shows on hover and opens Set as main, Duplicate, Delete… (with 4c-2’s Rename… and Move to…)',
    hidden === 'hidden' &&
      s.menu.open &&
      JSON.stringify(s.menu.items) === '["Set as main","Rename…","Move to…","Duplicate","Delete…"]',
    { hidden, menu: s.menu },
  );
  await page.screenshot({ path: `${SHOTS}/2d-step4c1-row-menu-light.png` });
  await page.keyboard.press('Escape');

  // 2. A right-click on a folder opens its menu: the + items for it, then Delete….
  await clickIn(page, '[role="treeitem"][data-path="parts"]', 'right');
  s = await state(page);
  check(
    'a right-click on a folder opens its menu',
    s.menu.open &&
      s.menu.head === 'Add to parts/' &&
      JSON.stringify(s.menu.items) === '["New program","New module","New folder","Rename…","Move to…","Delete…"]',
    s.menu,
  );
  await page.screenshot({ path: `${SHOTS}/2d-step4c1-folder-menu-light.png` });

  // 3. Its New module names it in parts/.
  await choose(page, 'new-library');
  await page.keyboard.type('springs');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 500));
  s = await state(page);
  check('the folder’s New module makes parts/springs.pathogen', s.open === 'parts/springs.pathogen' && s.text === NEW_LIBRARY, s.open);

  // 4. Set as main, with pathogen.json open: the badge moves, the JSON follows, the preview stays.
  await clickRow(page, 'pathogen.json');
  await rowMenu(page, 'try-sizes.pathogen');
  await choose(page, 'set-main');
  await new Promise((r) => setTimeout(r, 400));
  s = await state(page);
  const entry = (await storeGet(page, 'workspaceEntryPoints')) as string[];
  const json = `${JSON.stringify({ entryPoints: ['try-sizes.pathogen', 'main.pathogen', 'demos/gears.pathogen'] }, null, 2)}\n`;
  check(
    'Set as main puts try-sizes first, badges it, and pathogen.json in the editor follows',
    JSON.stringify(entry) === '["try-sizes.pathogen","main.pathogen","demos/gears.pathogen"]' &&
      JSON.stringify(s.badges) === '["try-sizes.pathogen"]' &&
      s.open === 'pathogen.json' &&
      s.text === json,
    { entry, badges: s.badges, text: s.text },
  );
  check('the preview still shows what it showed', (await drawn(page)) === before);
  await rowMenu(page, 'try-sizes.pathogen');
  s = await state(page);
  check(
    'the main’s own menu has no Set as main',
    JSON.stringify(s.menu.items) === '["Rename…","Move to…","Duplicate","Delete…"]',
    s.menu.items,
  );
  await page.keyboard.press('Escape');

  // 5. Duplicate: the copy beside it, at the end of the program list, the keyboard on it; nothing opens.
  await rowMenu(page, 'demos/gears.pathogen');
  await choose(page, 'duplicate');
  await new Promise((r) => setTimeout(r, 400));
  s = await state(page);
  const entry2 = (await storeGet(page, 'workspaceEntryPoints')) as string[];
  check(
    'Duplicate makes demos/gears-2.pathogen, last in the program list, with the keyboard on it',
    s.rows.includes('demos/gears-2.pathogen') && entry2.at(-1) === 'demos/gears-2.pathogen' && s.focusedRow === 'demos/gears-2.pathogen' && s.open === 'pathogen.json',
    { rows: s.rows, entry2, focused: s.focusedRow, open: s.open },
  );

  // 6. Delete… on a library the main imports, open and edited: the question, then Escape.
  await clickRow(page, 'parts/kit.pathogen');
  await page.evaluate(`(() => {
    const pane = window.__find('code-editor-pane');
    pane.focusEditor();
    const view = pane._editor;
    view.dispatch({ selection: { anchor: view.state.doc.length } });
  })()`);
  await page.keyboard.type('// edited before the delete');
  await rowMenu(page, 'parts/kit.pathogen');
  await choose(page, 'delete');
  await new Promise((r) => setTimeout(r, 300));
  let d = await dialog(page);
  check(
    'Delete… asks first: the file, the file that imports it, Cancel focused',
    !!d &&
      d.title === 'Delete kit.pathogen?' &&
      d.message === 'This deletes parts/kit.pathogen.' &&
      d.warning === 'main.pathogen imports it. It’ll show an error at that import until you change it.' &&
      d.confirm === 'Delete' &&
      d.cancelFocused,
    d,
  );
  await page.screenshot({ path: `${SHOTS}/2d-step4c1-delete-light.png` });
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 300));
  d = await dialog(page);
  s = await state(page);
  check('Escape cancels: nothing deleted, the keyboard back on the row', d === null && s.rows.includes('parts/kit.pathogen') && s.focusedRow === 'parts/kit.pathogen', { d, focused: s.focusedRow });

  // 7. Delete it: the tab closes, the editor shows a neighbour, the main's import breaks.
  await rowMenu(page, 'parts/kit.pathogen');
  await choose(page, 'delete');
  await new Promise((r) => setTimeout(r, 300));
  await clickDialog(page, '.confirm');
  await new Promise((r) => setTimeout(r, 800));
  s = await state(page);
  const status = await storeGet(page, 'compilationStatus');
  check(
    'deleted: gone from the tree and the tabs; the editor shows a tab that’s left',
    !s.rows.includes('parts/kit.pathogen') && !s.tabs.includes('parts/kit.pathogen') && s.open !== 'parts/kit.pathogen' && s.tabs.includes(s.open),
    { rows: s.rows, tabs: s.tabs, open: s.open },
  );
  check('the main, which imported it, now shows an error', status === 'error', status);
  const toast = (await page.evaluate(`window.__find('app-toast')?.shadowRoot?.textContent ?? ''`)) as string;
  check('a message says what was deleted', toast.includes('Deleted parts/kit.pathogen.'), toast.slice(0, 200));

  // 8. A new file with its name starts without its undo history.
  await clickIn(page, '.add');
  await choose(page, 'new-library');
  await page.keyboard.type('kit');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 500));
  s = await state(page);
  const undone = (await page.evaluate(`import('https://esm.sh/@codemirror/commands@6').then((m) => m.undo(window.__find('code-editor-pane')._editor))`)) as boolean;
  s = await state(page);
  check(
    'a new parts/kit.pathogen starts afresh: its text, and nothing to undo',
    s.open === 'parts/kit.pathogen' && s.text === NEW_LIBRARY && undone === false,
    { open: s.open, text: s.text, undone },
  );

  // 8b. Shift+F10 on a row opens its menu (a Mac sends no contextmenu for it).
  await page.evaluate(`window.__tree().querySelector('[role="treeitem"][data-path="parts/gears.pathogen"]').focus()`);
  await page.keyboard.down('Shift');
  await page.keyboard.press('F10');
  await page.keyboard.up('Shift');
  await new Promise((r) => setTimeout(r, 200));
  s = await state(page);
  check(
    'Shift+F10 on a row opens its menu',
    s.menu.open && JSON.stringify(s.menu.items) === '["Rename…","Move to…","Duplicate","Delete…"]',
    s.menu,
  );
  await page.keyboard.press('Escape');

  // 8c. The workspace changes while Delete…'s question is open (here, a file that imports it
  //     appears): nothing is deleted, and a message says why.
  await rowMenu(page, 'parts/gears.pathogen');
  await choose(page, 'delete');
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(`import('/state/store.js').then(({ store }) => store.update({
    workspaceFiles: { ...store.get('workspaceFiles'), 'late.pathogen': 'import { gear } from "./parts/gears.pathogen";\\n' },
  }))`);
  await clickDialog(page, '.confirm');
  await new Promise((r) => setTimeout(r, 500));
  s = await state(page);
  const lateToast = (await page.evaluate(`window.__find('app-toast')?.shadowRoot?.textContent ?? ''`)) as string;
  check(
    'a question answered after the workspace changed deletes nothing, and says why',
    s.rows.includes('parts/gears.pathogen') && lateToast.includes('Nothing was deleted'),
    { rows: s.rows, toast: lateToast.slice(0, 200) },
  );
  await page.evaluate(`import('/state/store.js').then(({ store }) => {
    const { 'late.pathogen': _late, ...rest } = store.get('workspaceFiles');
    store.update({ workspaceFiles: rest });
  })`);
  await new Promise((r) => setTimeout(r, 300));

  // 9. A folder's Delete…: the files in it, and its tabs go.
  await clickRow(page, 'parts/gears.pathogen');
  await rowMenu(page, 'parts');
  await choose(page, 'delete');
  await new Promise((r) => setTimeout(r, 300));
  d = await dialog(page);
  check(
    'a folder’s Delete… names its files, and the files that import them',
    !!d &&
      d.title === 'Delete parts/?' &&
      d.message === 'This deletes the folder and the 3 files in it:' &&
      JSON.stringify(d.items) === '["gears.pathogen","kit.pathogen","springs.pathogen"]' &&
      d.confirm === 'Delete the folder and 3 files' &&
      (d.warning ?? '').startsWith('demos/gears-2.pathogen, demos/gears.pathogen and main.pathogen import them.'),
    d,
  );
  await clickDialog(page, '.confirm');
  await new Promise((r) => setTimeout(r, 800));
  s = await state(page);
  check('the folder and its tabs are gone', !s.rows.some((r) => r.startsWith('parts')) && !s.tabs.some((t) => t.startsWith('parts/')), { rows: s.rows, tabs: s.tabs });

  // 10. The server holds the result.
  await clickRow(page, 'main.pathogen');
  const stored = await waitFor(
    'the deletes saved',
    async () => {
      const w = await api('GET', `/workspace/${id}`);
      const files = Object.keys((w.files as object) ?? {}).sort();
      return files.includes('parts/gears.pathogen') ? null : w;
    },
    45_000,
  );
  const storedFiles = Object.keys((stored?.files as object) ?? {}).sort();
  check(
    'the server holds the files left and the program list',
    JSON.stringify(storedFiles) === '["demos/gears-2.pathogen","demos/gears.pathogen","main.pathogen","try-sizes.pathogen"]' &&
      JSON.stringify(stored?.entryPoints) === '["try-sizes.pathogen","main.pathogen","demos/gears.pathogen","demos/gears-2.pathogen"]',
    { storedFiles, entryPoints: stored?.entryPoints },
  );

  // 11. Dark mode: a row's menu and the question.
  await setTheme(page, 'dark');
  await open(page, id);
  await rowMenu(page, 'demos');
  await page.screenshot({ path: `${SHOTS}/2d-step4c1-folder-menu-dark.png` });
  await choose(page, 'delete');
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: `${SHOTS}/2d-step4c1-delete-dark.png` });
  await clickDialog(page, '.cancel');

  // 12. The storybook entries, dark then light.
  for (const theme of ['dark', 'light']) {
    await setTheme(page, theme);
    await page.goto(`${PAGES_URL}/storybook/file-tree`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitFor('the story', async () =>
      page.evaluate(`!!window.__find('.story-tab')?.getRootNode().querySelector('file-tree')?.shadowRoot?.querySelector('[role="treeitem"]')`),
    );
    const treeStories = (await page.evaluate(
      `[...window.__find('.story-tab').parentElement.querySelectorAll('.story-tab')].map((b) => b.textContent.trim())`,
    )) as string[];
    await page.evaluate(`window.__find('.story-tab[data-story="7"]')?.click()`);
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({ path: `${SHOTS}/2d-step4c1-story-tree-${theme}.png` });
    await page.goto(`${PAGES_URL}/storybook/confirm-dialog`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitFor('the dialog story', async () =>
      page.evaluate(`!!window.__find('.story-tab')?.getRootNode().querySelector('confirm-dialog')`),
    );
    const dialogStories = (await page.evaluate(
      `[...window.__find('.story-tab').parentElement.querySelectorAll('.story-tab')].map((b) => b.textContent.trim())`,
    )) as string[];
    await page.screenshot({ path: `${SHOTS}/2d-step4c1-story-dialog-${theme}.png` });
    // Nine tree stories in 4c-1; 4c-2 added Renaming a folder and Move to….
    check(`the storybook: eleven tree stories and three dialog stories (${theme})`, treeStories.length === 11 && dialogStories.length === 3, { treeStories, dialogStories });
  }

  check('no page errors', pageErrors.length === 0, pageErrors);
} finally {
  await browser.close();
  for (const id of made) await api('DELETE', `/workspace/${id}`);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

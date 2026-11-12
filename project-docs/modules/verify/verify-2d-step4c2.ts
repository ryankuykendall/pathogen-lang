// Phase 2d, step 4c-2 (note 52): Rename… and Move to… (mockup v7 screen F,
// states 2, 3, 5 and 6), and the toast's Undo. In the served playground:
// the menus offer them; Rename… turns the row into a field with a line that
// counts what changes; a renamed file keeps its tab and its undo history; the
// imports rewritten in the open file, a kept file and the renamed file's
// importers never enter their undo history (undoing everything there leaves
// the import pointing at the new name) and are marked in the editor; a folder's
// rename takes its tabs; the toast's Undo puts names, imports and tabs back;
// Move to… lists the folders (the one it's in can't be chosen) and says what
// a move updates; an Undo after a later change does nothing and says why; the
// server holds the result; renaming the main keeps it the main; light, dark,
// and the storybook.
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/verify-2d-step4c2.ts

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
    '// Two gears that mesh.\nimport { gear } from "./parts/gears.pathogen";\nimport { size } from "./parts/kit.pathogen";\n\ndefine ViewBox(0, 0, 200, 200);\ndefine default PathLayer(\'main\') #{\n  stroke: #6d3aa6;\n  stroke-width: 4;\n  fill: none;\n};\ngear(100, 100, size * 5);\n',
  'try-sizes.pathogen': 'import { size } from "./parts/kit.pathogen";\n\ndefine ViewBox(0, 0, 200, 200);\ncircle(100, 100, size * 4);\n',
  'demos/gears.pathogen': 'import { gear } from "../parts/gears.pathogen";\n\ndefine ViewBox(0, 0, 300, 120);\ngear(60, 60, 40);\n',
  'parts/gears.pathogen': 'module;\n\nexport fn gear(cx, cy, r) {\n  circle(cx, cy, r);\n  circle(cx, cy, r * 0.3);\n}\n',
  'parts/kit.pathogen': 'module;\nimport { gear } from "./gears.pathogen";\n\nexport const size = 12;\n',
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
  window.__tree = () => window.__find('file-tree').shadowRoot;
`;

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface State {
  rows: string[];
  menu: { open: boolean; head: string; items: string[]; disabled: string[]; foot: string; focused: string | null };
  field: { value: string; selected: string; hint: string } | null;
  focusedRow: string | null;
  open: string;
  text: string;
  tabs: string[];
  marked: number[];
}

async function state(page: Page): Promise<State> {
  return page.evaluate(`(() => {
    const root = window.__tree();
    const menu = root.querySelector('.menu');
    const pane = window.__find('code-editor-pane');
    const input = root.querySelector('.row.input input');
    const view = pane._editor;
    const lines = [...view.dom.querySelectorAll('.cm-line')];
    return {
      rows: [...root.querySelectorAll('[role="treeitem"]')].map((r) => r.dataset.path),
      menu: {
        open: !menu.hidden,
        head: menu.querySelector('.menu-head')?.textContent ?? '',
        items: [...menu.querySelectorAll('[role="menuitem"] .label')].map((l) => l.textContent),
        disabled: [...menu.querySelectorAll('[role="menuitem"][aria-disabled="true"] .label')].map((l) => l.textContent),
        foot: menu.querySelector('.menu-foot:not([hidden])')?.textContent ?? '',
        focused: root.activeElement?.getAttribute('role') === 'menuitem' ? root.activeElement.querySelector('.label').textContent : null,
      },
      field: input
        ? {
            value: input.value,
            selected: input.value.slice(input.selectionStart, input.selectionEnd),
            hint: root.querySelector('.name-hint').textContent,
          }
        : null,
      focusedRow: root.activeElement?.getAttribute('role') === 'treeitem' ? root.activeElement.dataset.path : null,
      open: pane.activePath,
      text: view.state.doc.toString(),
      tabs: [...window.__find('editor-tabs').shadowRoot.querySelectorAll('[role="tab"]')].map((t) => t.dataset.path),
      marked: lines.flatMap((l, i) => (l.classList.contains('cm-changed-line') ? [i + 1] : [])),
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

async function clickIn(page: Page, selector: string): Promise<void> {
  const rect = await rectOf(page, selector);
  await page.mouse.click(rect.left + rect.width / 2, rect.top + rect.height / 2);
  await pause(250);
}

const clickRow = (page: Page, path: string): Promise<void> => clickIn(page, `[role="treeitem"][data-path="${path}"]`);

async function rowMenu(page: Page, path: string): Promise<void> {
  const row = await rectOf(page, `[role="treeitem"][data-path="${path}"]`);
  await page.mouse.move(row.left + 20, row.top + row.height / 2);
  await pause(100);
  await clickIn(page, `[role="treeitem"][data-path="${path}"] .row-menu`);
}

const choose = (page: Page, action: string): Promise<void> => clickIn(page, `[role="menuitem"][data-action="${action}"]`);

/** Type at the end of the file in the editor. */
async function typeAtEnd(page: Page, text: string): Promise<void> {
  await page.evaluate(`(() => {
    const pane = window.__find('code-editor-pane');
    pane.focusEditor();
    const view = pane._editor;
    view.dispatch({ selection: { anchor: view.state.doc.length } });
  })()`);
  await page.keyboard.type(text);
  await pause(300);
}

/** Undo in the editor until there's nothing left: how many steps it took. */
const undoAll = async (page: Page): Promise<number> =>
  page.evaluate(`import('https://esm.sh/@codemirror/commands@6').then((m) => {
    const view = window.__find('code-editor-pane')._editor;
    let n = 0;
    while (n < 200 && m.undo(view)) n++;
    return n;
  })`) as Promise<number>;

/** The text of every toast showing. */
const toasts = async (page: Page): Promise<string[]> =>
  page.evaluate(`[...(window.__find('app-toast')?.shadowRoot?.querySelectorAll('.toast') ?? [])].map((t) => t.textContent)`) as Promise<
    string[]
  >;

/** Click Undo on the toast that says `says`. False when there's none. */
const clickUndo = async (page: Page, says: string): Promise<boolean> => {
  const clicked = (await page.evaluate(`(() => {
    const toast = [...(window.__find('app-toast')?.shadowRoot?.querySelectorAll('.toast') ?? [])].find((t) => t.textContent.includes(${JSON.stringify(says)}));
    const action = toast?.querySelector('.action');
    if (!action) return false;
    action.click();
    return true;
  })()`)) as boolean;
  await pause(600);
  return clicked;
};

async function open(page: Page, id: string): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the drawing', async () => ((await drawn(page)).length > 0 ? true : null));
  await waitFor('the tree', async () => ((await state(page)).rows.length > 1 ? true : null));
  await pause(500);
}

async function setTheme(page: Page, theme: string): Promise<void> {
  await page.evaluate(`localStorage.setItem('pathogen-theme', '${theme}')`);
  await page.evaluateOnNewDocument((t: string) => localStorage.setItem('pathogen-theme', t), theme);
}

const lineOf = (text: string, needle: string): string => text.split('\n').find((l) => l.includes(needle)) ?? '(none)';

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
    name: '4c-2 rename and move',
    files: Object.fromEntries(Object.entries(FILES).map(([p, text]) => [p, { text }])),
    entryPoints: ENTRY,
  });
  const id = created.id as string;
  made.push(id);
  await open(page, id);
  const before = await drawn(page);

  // 1. The menus offer Rename… and Move to….
  await rowMenu(page, 'try-sizes.pathogen');
  let s = await state(page);
  check(
    'a program’s menu: Set as main, Rename…, Move to…, Duplicate, Delete…',
    JSON.stringify(s.menu.items) === '["Set as main","Rename…","Move to…","Duplicate","Delete…"]',
    s.menu.items,
  );
  await page.keyboard.press('Escape');
  await rowMenu(page, 'parts');
  s = await state(page);
  check(
    'a folder’s menu: the + items, then Rename…, Move to…, Delete…',
    JSON.stringify(s.menu.items) === '["New program","New library","New folder","Rename…","Move to…","Delete…"]',
    s.menu.items,
  );
  await page.keyboard.press('Escape');

  // 2. Typing in three files: gears (to be renamed), kit (kept; it imports gears), main (open; it imports gears).
  await clickRow(page, 'parts/gears.pathogen');
  await typeAtEnd(page, '// typed in gears');
  await clickRow(page, 'parts/kit.pathogen');
  await typeAtEnd(page, '// typed in kit');
  await clickRow(page, 'main.pathogen');
  await typeAtEnd(page, '// typed in main');
  const tabsBefore = (await state(page)).tabs;

  // 3. Rename… on parts/gears.pathogen: the field holds "gears", selected; the line counts the files whose imports change.
  await rowMenu(page, 'parts/gears.pathogen');
  await choose(page, 'rename');
  s = await state(page);
  check('Rename… turns the row into a field holding its name, selected', s.field?.value === 'gears' && s.field.selected === 'gears', s.field);
  await page.keyboard.type('cogs');
  await pause(200);
  s = await state(page);
  check(
    'the line counts the files whose imports change',
    s.field?.hint === 'Updates the imports in 3 files · Enter to rename, Esc to cancel',
    s.field,
  );
  await page.screenshot({ path: `${SHOTS}/2d-step4c2-rename-file-light.png` });
  await page.keyboard.press('Enter');
  await pause(800);
  s = await state(page);
  const tabsFollow = tabsBefore.map((t) => (t === 'parts/gears.pathogen' ? 'parts/cogs.pathogen' : t));
  check(
    'renamed: the row and its tab follow, in its place, and the keyboard is on the row',
    s.rows.includes('parts/cogs.pathogen') &&
      !s.rows.includes('parts/gears.pathogen') &&
      JSON.stringify(s.tabs) === JSON.stringify(tabsFollow) &&
      s.focusedRow === 'parts/cogs.pathogen',
    { rows: s.rows, tabs: s.tabs, tabsFollow, focused: s.focusedRow },
  );
  check(
    'main.pathogen, open: its import rewritten, what you typed kept, the line marked',
    s.open === 'main.pathogen' &&
      lineOf(s.text, 'import { gear }') === 'import { gear } from "./parts/cogs.pathogen";' &&
      s.text.includes('// typed in main') &&
      JSON.stringify(s.marked) === '[2]',
    { open: s.open, line: lineOf(s.text, 'import { gear }'), marked: s.marked },
  );
  const toast1 = await toasts(page);
  check(
    'the toast names the files it changed, with Undo',
    toast1.some((t) => t.includes('Renamed parts/gears.pathogen to cogs.pathogen, and updated the imports in') && t.includes('Undo')),
    toast1,
  );
  await waitFor('the compile', async () => ((await storeGet(page, 'compilationStatus')) !== 'compiling' ? true : null));
  await pause(400);
  check(
    'the preview still draws what it drew, with no error',
    (await storeGet(page, 'compilationStatus')) !== 'error' && (await drawn(page)) === before,
    await storeGet(page, 'compilationStatus'),
  );

  // 4. Undo everything in main: what you typed goes; the rewritten import stays.
  let steps = await undoAll(page);
  s = await state(page);
  check(
    'undoing everything in main.pathogen leaves the import at the new name',
    steps > 0 && !s.text.includes('// typed in main') && lineOf(s.text, 'import { gear }').includes('./parts/cogs.pathogen'),
    { steps, line: lineOf(s.text, 'import { gear }'), typed: s.text.includes('// typed in main') },
  );

  // 5. The same in kit, a file kept while another was shown.
  await clickRow(page, 'parts/kit.pathogen');
  s = await state(page);
  const kitHad = s.text.includes('// typed in kit') && lineOf(s.text, 'import { gear }').includes('./cogs.pathogen');
  check('kit.pathogen, kept while renamed, shows its rewritten import marked', JSON.stringify(s.marked) === '[2]', s.marked);
  steps = await undoAll(page);
  s = await state(page);
  check(
    'kit.pathogen, kept: its import rewritten, and undoing everything leaves it',
    kitHad && steps > 0 && !s.text.includes('// typed in kit') && lineOf(s.text, 'import { gear }') === 'import { gear } from "./cogs.pathogen";',
    { kitHad, steps, line: lineOf(s.text, 'import { gear }') },
  );

  // 6. The renamed file kept its own undo history.
  await clickRow(page, 'parts/cogs.pathogen');
  s = await state(page);
  const cogsHad = s.text.includes('// typed in gears');
  steps = await undoAll(page);
  s = await state(page);
  check('cogs.pathogen kept what was typed in gears.pathogen, and its undo history', cogsHad && steps > 0 && !s.text.includes('// typed in gears'), { cogsHad, steps });

  // 7. Rename… on a folder: the line counts the files it moves; Enter; the tabs follow; main's lines are marked.
  await clickRow(page, 'main.pathogen');
  await rowMenu(page, 'parts');
  await choose(page, 'rename');
  await page.keyboard.type('machines');
  await pause(200);
  s = await state(page);
  check(
    'a folder’s line: the files it moves, and the files whose imports change',
    // parts/ holds cogs and kit; main, try-sizes and demos/gears import them.
    s.field?.hint === 'Moves its 2 files, and updates the imports in 3 files · Enter to rename, Esc to cancel',
    s.field,
  );
  await page.screenshot({ path: `${SHOTS}/2d-step4c2-rename-folder-light.png` });
  await page.keyboard.press('Enter');
  await pause(800);
  s = await state(page);
  check(
    'the folder and its tabs follow; main’s two import lines are marked',
    !s.rows.some((r) => r.startsWith('parts')) &&
      s.rows.includes('machines/cogs.pathogen') &&
      s.tabs.includes('machines/cogs.pathogen') &&
      s.tabs.includes('machines/kit.pathogen') &&
      s.focusedRow === 'machines' &&
      JSON.stringify(s.marked) === '[2,3]' &&
      lineOf(s.text, 'import { size }') === 'import { size } from "./machines/kit.pathogen";',
    { rows: s.rows, tabs: s.tabs, focused: s.focusedRow, marked: s.marked, line: lineOf(s.text, 'import { size }') },
  );
  await page.screenshot({ path: `${SHOTS}/2d-step4c2-after-renaming-light.png` });

  // 8. The toast's Undo: names, imports and tabs back together.
  const undid = await clickUndo(page, 'Renamed parts/ to machines/');
  s = await state(page);
  check(
    'the toast’s Undo puts the folder, the tabs and the imports back',
    undid &&
      s.rows.includes('parts/cogs.pathogen') &&
      !s.rows.some((r) => r.startsWith('machines')) &&
      s.tabs.includes('parts/kit.pathogen') &&
      lineOf(s.text, 'import { size }') === 'import { size } from "./parts/kit.pathogen";',
    { undid, rows: s.rows, tabs: s.tabs, line: lineOf(s.text, 'import { size }') },
  );

  // 9a. Move to… opened with the mouse opens under the pointer, at rest: the keyboard stays on
  //     its first item until the pointer moves.
  await rowMenu(page, 'parts/kit.pathogen');
  await choose(page, 'move');
  await pause(300);
  s = await state(page);
  check('a menu opening under a pointer at rest keeps the keyboard on its first item', s.menu.focused === 'The top of the workspace', s.menu);
  await page.keyboard.press('Escape');
  await pause(150);

  // 9. Move to… on parts/kit.pathogen, from the keyboard (the pointer out of the way): the
  //    folders, the one it's in can't be chosen, and what the focused one would do.
  await page.mouse.move(5, 850);
  await page.evaluate(`window.__tree().querySelector('[role="treeitem"][data-path="parts/kit.pathogen"]').focus()`);
  await page.keyboard.down('Shift');
  await page.keyboard.press('F10');
  await page.keyboard.up('Shift');
  await pause(150);
  await page.keyboard.press('ArrowDown'); // Rename… → Move to…
  await page.keyboard.press('Enter');
  await pause(200);
  s = await state(page);
  const topFoot = s.menu.foot;
  await page.keyboard.press('ArrowDown');
  await pause(150);
  s = await state(page);
  // The pointer over an item gives it the keyboard, and the line follows it.
  const topItem = await rectOf(page, '[role="menuitem"][data-folder=""]');
  await page.mouse.move(topItem.left + 30, topItem.top + topItem.height / 2);
  await pause(150);
  const hovered = await state(page);
  await page.mouse.move(5, 850);
  await page.keyboard.press('ArrowDown');
  await pause(150);
  check(
    'the pointer over a folder gives it the keyboard, and the line follows',
    hovered.menu.foot === topFoot,
    { foot: hovered.menu.foot, topFoot },
  );
  check(
    'Move to… lists the top and the folders; parts/ is where it is',
    s.menu.head === 'Move kit.pathogen to' &&
      JSON.stringify(s.menu.items) === '["The top of the workspace","demos/","parts/"]' &&
      JSON.stringify(s.menu.disabled) === '["parts/"]',
    s.menu,
  );
  check(
    'its last line says what the focused folder would do',
    topFoot === 'Moving it to the top updates the imports in main.pathogen and try-sizes.pathogen, and kit.pathogen’s own.' &&
      s.menu.foot === 'Moving it to demos/ updates the imports in main.pathogen and try-sizes.pathogen, and kit.pathogen’s own.',
    { topFoot, foot: s.menu.foot },
  );
  await page.screenshot({ path: `${SHOTS}/2d-step4c2-move-to-light.png` });
  await page.keyboard.press('Enter');
  await pause(800);
  s = await state(page);
  check(
    'moved with Enter: the row, the tab and the keyboard follow; main’s import is rewritten',
    s.rows.includes('demos/kit.pathogen') &&
      s.tabs.includes('demos/kit.pathogen') &&
      s.focusedRow === 'demos/kit.pathogen' &&
      lineOf(s.text, 'import { size }') === 'import { size } from "./demos/kit.pathogen";',
    { rows: s.rows, tabs: s.tabs, focused: s.focusedRow, line: lineOf(s.text, 'import { size }') },
  );

  // 10. A later change (a new folder) takes the move's Undo back: its toast goes.
  const offered = (await toasts(page)).some((t) => t.includes('Moved parts/kit.pathogen to demos/'));
  await clickIn(page, '.add');
  await choose(page, 'new-folder');
  await page.keyboard.type('spare');
  await page.keyboard.press('Enter');
  await pause(700);
  const late = await toasts(page);
  const lateUndo = await clickUndo(page, 'Moved parts/kit.pathogen to demos/');
  s = await state(page);
  check(
    'a later change withdraws the toast with Undo',
    offered && !lateUndo && !late.some((t) => t.includes('Moved parts/kit.pathogen')) && s.rows.includes('demos/kit.pathogen'),
    { offered, lateUndo, late, rows: s.rows },
  );

  // 11. Rename the main: it stays the main.
  await rowMenu(page, 'main.pathogen');
  await choose(page, 'rename');
  await page.keyboard.type('first');
  await page.keyboard.press('Enter');
  await pause(800);
  const entry = (await storeGet(page, 'workspaceEntryPoints')) as string[];
  s = await state(page);
  check(
    'the main, renamed, is still the main, and still open',
    entry[0] === 'first.pathogen' && s.open === 'first.pathogen' && (await drawn(page)) === before,
    { entry, open: s.open },
  );

  // 12. The server holds it all: the new paths, their texts, the folders and the program list.
  await clickRow(page, 'try-sizes.pathogen');
  const stored = await waitFor(
    'the renames saved',
    async () => {
      const w = await api('GET', `/workspace/${id}`);
      return 'first.pathogen' in ((w.files as object) ?? {}) ? w : null;
    },
    45_000,
  );
  const files = (stored?.files ?? {}) as Record<string, { text?: string }>;
  const textOf = (p: string): string => files[p]?.text ?? '';
  check(
    'the server holds the files at their new paths, with the imports rewritten',
    JSON.stringify(Object.keys(files).sort()) ===
      '["demos/gears.pathogen","demos/kit.pathogen","first.pathogen","parts/cogs.pathogen","try-sizes.pathogen"]' &&
      lineOf(textOf('first.pathogen'), 'import { size }') === 'import { size } from "./demos/kit.pathogen";' &&
      lineOf(textOf('demos/kit.pathogen'), 'import { gear }') === 'import { gear } from "../parts/cogs.pathogen";' &&
      lineOf(textOf('demos/gears.pathogen'), 'import { gear }') === 'import { gear } from "../parts/cogs.pathogen";' &&
      JSON.stringify(stored?.entryPoints) === '["first.pathogen","demos/gears.pathogen","try-sizes.pathogen"]' &&
      JSON.stringify(stored?.folders ?? []).includes('spare'),
    {
      files: Object.keys(files),
      first: lineOf(textOf('first.pathogen'), 'import { size }'),
      kit: lineOf(textOf('demos/kit.pathogen'), 'import { gear }'),
      entryPoints: stored?.entryPoints,
      folders: stored?.folders,
    },
  );

  // 12b. Leaving Rename…'s field with a click on another row: that row opens, and the rename lands.
  await rowMenu(page, 'demos/gears.pathogen');
  await choose(page, 'rename');
  await page.keyboard.type('gears-demo');
  await clickRow(page, 'first.pathogen');
  await pause(600);
  s = await state(page);
  check(
    'a click on another row while renaming: that row opens, and the rename lands',
    s.open === 'first.pathogen' && s.rows.includes('demos/gears-demo.pathogen') && !s.rows.includes('demos/gears.pathogen') && s.field === null,
    { open: s.open, rows: s.rows, field: s.field },
  );

  // 12c. The editor's language services follow a move: its import graph (completion, hover,
  //      go-to) is built from the file's new folder. Moves that change what `./` means:
  //      demos/kit → the top while kept, then → parts/ while open.
  const graphErrors = async (): Promise<number | null> =>
    page.evaluate(`import('/services/workspace-modules.js').then((m) => {
      const g = m.currentOpenFileModules();
      return g ? g.loadErrors.length : null;
    })`) as Promise<number | null>;
  const settled = async (): Promise<number | null> => {
    await pause(400);
    return waitFor('the graph', async () => {
      const n = await graphErrors();
      return n === null ? null : { n };
    }).then((r) => r?.n ?? null);
  };
  // The control: an import that reaches nothing shows as a load error.
  await clickRow(page, 'demos/kit.pathogen');
  await page.evaluate(`(() => {
    const view = window.__find('code-editor-pane')._editor;
    view.dispatch({ changes: { from: 'module;\\n'.length, insert: 'import { x } from "./nope.pathogen";\\n' } });
  })()`);
  const controlErrors = await settled();
  await undoAll(page);
  await clickRow(page, 'first.pathogen');
  await rowMenu(page, 'demos/kit.pathogen');
  await choose(page, 'move');
  await clickIn(page, '[role="menuitem"][data-folder=""]');
  await pause(600);
  await clickRow(page, 'kit.pathogen');
  const keptMoved = await settled();
  s = await state(page);
  const keptLine = lineOf(s.text, 'import { gear }');
  await rowMenu(page, 'kit.pathogen');
  await choose(page, 'move');
  await clickIn(page, '[role="menuitem"][data-folder="parts"]');
  await pause(600);
  const openMoved = await settled();
  s = await state(page);
  await waitFor('the compile', async () => ((await storeGet(page, 'compilationStatus')) !== 'compiling' ? true : null));
  const status = await storeGet(page, 'compilationStatus');
  check(
    'the editor’s import graph follows a moved file, kept or open (and sees a bad import)',
    (controlErrors ?? 0) > 0 &&
      keptMoved === 0 &&
      keptLine === 'import { gear } from "./parts/cogs.pathogen";' &&
      openMoved === 0 &&
      s.open === 'parts/kit.pathogen' &&
      lineOf(s.text, 'import { gear }') === 'import { gear } from "./cogs.pathogen";' &&
      status !== 'error',
    { controlErrors, keptMoved, keptLine, openMoved, open: s.open, line: lineOf(s.text, 'import { gear }'), status },
  );

  // 13. Dark mode: Rename…'s field on a folder, and Move to….
  await setTheme(page, 'dark');
  await open(page, id);
  await rowMenu(page, 'parts');
  await choose(page, 'rename');
  await page.keyboard.type('machines');
  await pause(200);
  await page.screenshot({ path: `${SHOTS}/2d-step4c2-rename-folder-dark.png` });
  await page.keyboard.press('Escape');
  await pause(200);
  s = await state(page);
  check('Escape leaves the name as it was, with the keyboard on the row', s.field === null && s.rows.includes('parts') && s.focusedRow === 'parts', { field: s.field, focused: s.focusedRow });
  await rowMenu(page, 'parts/kit.pathogen');
  await choose(page, 'move');
  await page.screenshot({ path: `${SHOTS}/2d-step4c2-move-to-dark.png` });
  await page.keyboard.press('Escape');

  // 14. The storybook: Renaming a folder and Move to…, dark then light.
  for (const theme of ['dark', 'light']) {
    await setTheme(page, theme);
    await page.goto(`${PAGES_URL}/storybook/file-tree`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitFor('the story', async () =>
      page.evaluate(`!!window.__find('.story-tab')?.getRootNode().querySelector('file-tree')?.shadowRoot?.querySelector('[role="treeitem"]')`),
    );
    const stories = (await page.evaluate(
      `[...window.__find('.story-tab').parentElement.querySelectorAll('.story-tab')].map((b) => b.textContent.trim())`,
    )) as string[];
    check(`the storybook has eleven tree stories (${theme})`, stories.length === 11 && stories.includes('Move to…'), stories);
    for (const [index, name] of [['9', 'rename'], ['10', 'move']]) {
      await page.evaluate(`window.__find('.story-tab[data-story="${index}"]')?.click()`);
      await pause(500);
      await page.screenshot({ path: `${SHOTS}/2d-step4c2-story-${name}-${theme}.png` });
    }
  }

  check('no page errors', pageErrors.length === 0, pageErrors);
} finally {
  await browser.close();
  for (const id of made) await api('DELETE', `/workspace/${id}`);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

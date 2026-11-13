// Phase 2d, step 6a (note 52; mockup v6 screen U; docs/workspace-files.md
// "Uploading files"): uploads, in the served playground:
// - the + menu's Upload files… and Upload folder…;
// - files picked for parts/: the question about a taken name beside its row,
//   Keep both; the toast says what went in and lists what didn't, and why; the
//   new rows flash; nothing opens; the server holds them; the toast's Undo;
// - Replace of the file open in the editor: the new text, a fresh undo
//   history, and the Undo putting the old text back;
// - a file with Windows line ends and a byte-order mark; a 900 KB file saved;
// - Upload folder… (the folders inside it kept, .DS_Store left out);
// - files dropped on a folder (lit, with its label) and on the editor (nothing);
// - Escape on the question; the file limit; a workspace switch while asking;
// - dark, and the storybook.
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/verify-2d-step6a.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';
const SHOTS = 'project-docs/modules/verify';
const FIXTURES = resolve('tmp/2d-step6a/fixtures');
const ownerId = Array.from(
  { length: 21 },
  () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)],
).join('');

const KIT = 'module;\n\nexport const size = 12;\n';
const FILES: Record<string, string> = {
  'main.pathogen':
    'import { gear } from "./parts/gears.pathogen";\n\ndefine ViewBox(0, 0, 200, 100);\ngear(55, 50, 40);\n',
  'try-sizes.pathogen': 'define ViewBox(0, 0, 200, 100);\ncircle(60, 50, 12);\n',
  'parts/gears.pathogen': 'module;\n\nexport fn gear(cx, cy, r) {\n  circle(cx, cy, r);\n}\n',
  'parts/labels.pathogen': 'module;\n\nexport const label = "a";\n',
  'parts/kit.pathogen': KIT,
};
const ENTRY = ['main.pathogen', 'try-sizes.pathogen'];

// Fixtures: what the picker and the drop hand over.
const fixture = (name: string, text: string | Buffer): string => {
  const path = resolve(FIXTURES, name);
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, text);
  return path;
};
const SPRINGS = 'define ViewBox(0, 0, 200, 100);\ncircle(100, 50, 30);\n';
const LABELS_NEW = 'module;\n\nexport const label = "b";\n';
const KIT_NEW = 'module;\n// from the computer\nexport const size = 20;\n';
const springs = fixture('pick/springs.pathogen', SPRINGS);
const labels = fixture('pick/labels.pathogen', LABELS_NEW);
const cities = fixture('pick/cities.csv', 'a,b\n1,2\n');
const font = fixture('pick/Raleway-Bold.ttf', Buffer.from([0, 1, 0, 0, 0, 16]));
// A module, so the program list stays as the checks below expect; its name has a space (fitted: my-gear).
const badName = fixture('pick/my gear.pathogen', 'module;\n\nexport const gear = 1;\n');
const kitNew = fixture('replace/kit.pathogen', KIT_NEW);
const BOM = String.fromCharCode(0xfeff);
const crlf = fixture('crlf/windows.pathogen', `${BOM}define ViewBox(0, 0, 200, 100);\r\ncircle(10, 10, 5);\r\n`);
const BIG_TEXT = `define ViewBox(0, 0, 200, 100);\ncircle(10, 10, 5);\n${'// a long note to fill the file up to about 900 KB\n'.repeat(18000)}`;
const big = fixture('big/big.pathogen', BIG_TEXT);
const shapesDir = resolve(FIXTURES, 'folder/shapes');
fixture('folder/shapes/star.pathogen', SPRINGS);
fixture('folder/shapes/round/dot.pathogen', SPRINGS);
fixture('folder/shapes/.DS_Store', 'x');

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
    await new Promise((r) => setTimeout(r, 150));
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
  window.__toasts = [];
  document.addEventListener('show-toast', (e) => window.__toasts.push({
    type: e.detail.type, title: e.detail.title, message: e.detail.message ?? null, items: e.detail.items ?? [], undo: !!e.detail.action,
  }));
`;

const TREE = `window.__find('file-tree').shadowRoot`;
const WV = `window.__find('workspace-view')`;

const storeGet = async (page: Page, key: string): Promise<unknown> =>
  page.evaluate(`import('/state/store.js').then((m) => m.store.get('${key}'))`);

const files = async (page: Page): Promise<Record<string, string>> =>
  (await storeGet(page, 'workspaceFiles')) as Record<string, string>;

const editorText = async (page: Page): Promise<string> =>
  page.evaluate(`${WV}.shadowRoot.querySelector('code-editor-pane')._editor.state.doc.toString()`) as Promise<string>;

const openPath = async (page: Page): Promise<string | null> =>
  page.evaluate(`window.__find('code-editor-pane').activePath`) as Promise<string | null>;

const lastToast = async (
  page: Page,
): Promise<{ type: string; title: string; message: string | null; items: string[]; undo: boolean } | null> =>
  page.evaluate(`window.__toasts.at(-1) ?? null`) as never;

async function rectIn(
  page: Page,
  rootExpr: string,
  selector: string,
): Promise<{ x: number; y: number; top: number; bottom: number; left: number; right: number }> {
  const r = (await page.evaluate(`(() => {
    const el = (${rootExpr}).querySelector('${selector}');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, top: b.top, bottom: b.bottom, left: b.left, right: b.right };
  })()`)) as { x: number; y: number; top: number; bottom: number; left: number; right: number } | null;
  if (!r) throw new Error(`nothing at ${selector}`);
  return r;
}

/** A real click (the picker opens only on one). */
async function click(page: Page, rootExpr: string, selector: string): Promise<void> {
  const { x, y } = await rectIn(page, rootExpr, selector);
  await page.mouse.click(x, y);
  await pause(250);
}

async function open(page: Page, id: string): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the tree', async () => page.evaluate(`!!${TREE}?.querySelector('[data-path="main.pathogen"]')`));
  await waitFor('the editor', async () =>
    page.evaluate(`!!${WV}.shadowRoot.querySelector('code-editor-pane')._editor`),
  );
  await pause(600);
}

/** Open a file, as the tree does. */
async function openFile(page: Page, path: string): Promise<void> {
  await page.evaluate(
    `${WV}.shadowRoot.dispatchEvent(new CustomEvent('open-file', { detail: { path: ${JSON.stringify(path)} }, bubbles: true, composed: true }))`,
  );
  await waitFor(`${path} open`, async () => ((await openPath(page)) === path ? true : null));
}

/** The + (for the folder of the file in the editor), Upload files… or Upload folder…, and the picker given these paths. */
async function pick(
  page: Page,
  item: 'upload-files' | 'upload-folder',
  paths: string[],
  opener = '.add',
): Promise<void> {
  await click(page, TREE, opener);
  const [chooser] = await Promise.all([
    page.waitForFileChooser({ timeout: 5000 }),
    click(page, TREE, `[data-action="${item}"]`),
  ]);
  await chooser.accept(paths);
}

interface Prompt {
  open: boolean;
  text: string;
  note: string;
  focused: string | null;
  left: number;
  top: number;
}

async function prompt(page: Page): Promise<Prompt> {
  return page.evaluate(`(() => {
    const p = ${TREE}.querySelector('clash-prompt');
    const r = p.shadowRoot;
    const b = p.getBoundingClientRect();
    return {
      open: !p.hidden,
      text: r.querySelector('#q')?.textContent ?? '',
      note: r.querySelector('#note')?.textContent ?? '',
      focused: r.activeElement?.textContent ?? null,
      left: b.left,
      top: b.top,
    };
  })()`) as Promise<Prompt>;
}

const waitPrompt = async (page: Page): Promise<boolean> =>
  !!(await waitFor('the question', async () => ((await prompt(page)).open ? true : null), 10_000));

async function answer(page: Page, choice: 'replace' | 'keep-both' | 'skip'): Promise<void> {
  await page.evaluate(
    `${TREE}.querySelector('clash-prompt').shadowRoot.querySelector('[data-choice="${choice}"]').click()`,
  );
  await pause(400);
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
      if (!localStorage.getItem('pathogen-theme')) localStorage.setItem('pathogen-theme', 'light');
    },
    ANON_KEY,
    ownerId,
  );
  const create = async (name: string, wsFiles: Record<string, string>, entryPoints: string[]): Promise<string> => {
    const created = await api('POST', '/workspace', {
      name,
      files: Object.fromEntries(Object.entries(wsFiles).map(([p, text]) => [p, { text }])),
      entryPoints,
    });
    made.push(created.id as string);
    return created.id as string;
  };
  const id = await create('6a uploads', FILES, ENTRY);
  const otherId = await create('6a other', { 'main.pathogen': 'circle(50, 50, 20);\n' }, ['main.pathogen']);

  // 1. The + menu.
  await open(page, id);
  await openFile(page, 'parts/gears.pathogen');
  await click(page, TREE, '.add');
  const items = (await page.evaluate(
    `[...${TREE}.querySelectorAll('[role="menuitem"]')].map((i) => [i.querySelector('.label').textContent, i.querySelector('small')?.textContent ?? ''])`,
  )) as string[][];
  check(
    'the + menu: New program, New module, New folder, then Upload files… and Upload folder…, with their lines',
    JSON.stringify(items) ===
      JSON.stringify([
        ['New program', 'A file that draws'],
        ['New module', ''],
        ['New folder', ''],
        ['Upload files…', 'Or drop them on the tree'],
        ['Upload folder…', 'Keeps the folders inside it'],
      ]),
    items,
  );
  await page.screenshot({ path: `${SHOTS}/2d-step6a-menu-light.png` });
  await page.keyboard.press('Escape');

  // 2. Files picked for parts/: a taken name asks, beside its row.
  const previewBefore = (await storeGet(page, 'renderedCode')) as string;
  await pick(page, 'upload-files', [springs, labels, cities, font, badName]);
  check('a taken name asks', await waitPrompt(page));
  const p = await prompt(page);
  const labelsRow = await rectIn(page, TREE, '[data-path="parts/labels.pathogen"]');
  const treeRight = (await page.evaluate(`window.__find('file-tree').getBoundingClientRect().right`)) as number;
  check(
    'the question: "labels.pathogen is already in parts/.", the keyboard on Keep both, beside its row to the right of the tree',
    p.text === 'labels.pathogen is already in parts/.' &&
      p.note.startsWith('Keep both adds it as labels-2.pathogen.') &&
      p.focused === 'Keep both' &&
      p.left > treeRight &&
      Math.abs(p.top - (labelsRow.top - 6)) < 4,
    { p, labelsRow, treeRight },
  );
  await page.screenshot({ path: `${SHOTS}/2d-step6a-clash-light.png` });

  // 3. Keep both: one change, its toast, the new rows flashing, nothing opened.
  await answer(page, 'keep-both');
  let toast = await lastToast(page);
  let f = await files(page);
  const flashing = (await page.evaluate(
    `[...${TREE}.querySelectorAll('.row.flash')].map((r) => r.dataset.path)`,
  )) as string[];
  check(
    'Keep both: springs, labels-2 and my-gear (its name fitted) go in; the toast says so, with Undo, the name changed and the two left out with why',
    'parts/springs.pathogen' in f &&
      f['parts/labels-2.pathogen'] === LABELS_NEW &&
      f['parts/labels.pathogen'] === FILES['parts/labels.pathogen'] &&
      'parts/my-gear.pathogen' in f &&
      toast?.title === 'Added 3 files to parts/: springs.pathogen, labels-2.pathogen and my-gear.pathogen.' &&
      toast.message === 'Some names were changed to fit the name rules, and some files weren’t added:' &&
      toast.undo &&
      JSON.stringify(toast.items) ===
        JSON.stringify([
          'my gear.pathogen → my-gear.pathogen',
          'cities.csv: workspaces hold .pathogen files for now; data files come later.',
          'Raleway-Bold.ttf: the playground can\'t load font files yet. Use the Google Fonts family instead: @font "Raleway" 700;',
        ]),
    { toast, files: Object.keys(f) },
  );
  check(
    'the new rows flash; nothing opened (three files); springs (a program) is last in the list; the preview unchanged',
    JSON.stringify(flashing.sort()) ===
      JSON.stringify(['parts/labels-2.pathogen', 'parts/my-gear.pathogen', 'parts/springs.pathogen']) &&
      (await openPath(page)) === 'parts/gears.pathogen' &&
      JSON.stringify(await storeGet(page, 'workspaceEntryPoints')) ===
        JSON.stringify(['main.pathogen', 'try-sizes.pathogen', 'parts/springs.pathogen']) &&
      (await storeGet(page, 'renderedCode')) === previewBefore,
    { flashing, open: await openPath(page) },
  );
  await page.screenshot({ path: `${SHOTS}/2d-step6a-added-light.png` });
  const saved = await waitFor(
    'the upload saved',
    async () => {
      const w = await api('GET', `/workspace/${id}`);
      return 'parts/springs.pathogen' in ((w.files as object) ?? {}) ? w : null;
    },
    45_000,
  );
  check(
    'the server holds the new files and the program list',
    ((saved?.files ?? {}) as Record<string, { text: string }>)['parts/labels-2.pathogen']?.text === LABELS_NEW &&
      JSON.stringify(saved?.entryPoints) ===
        JSON.stringify(['main.pathogen', 'try-sizes.pathogen', 'parts/springs.pathogen']),
    saved?.entryPoints,
  );

  // 4. The toast's Undo (its own upload: the toast stays 9 seconds, and the save above takes longer).
  const listBefore = JSON.stringify(await storeGet(page, 'workspaceEntryPoints'));
  await openFile(page, 'main.pathogen');
  await pick(page, 'upload-files', [springs]);
  await waitFor('springs at the top', async () => ('springs.pathogen' in (await files(page)) ? true : null), 10_000);
  const openedOne = await openPath(page);
  await page.evaluate(`window.__find('app-toast').shadowRoot.querySelector('.toast:last-child .action').click()`);
  await pause(400);
  f = await files(page);
  check(
    'one file at the top opens in a tab; the toast’s Undo takes it out again, its tab too, and the list is as it was',
    openedOne === 'springs.pathogen' &&
      !('springs.pathogen' in f) &&
      (await openPath(page)) !== 'springs.pathogen' &&
      JSON.stringify(await storeGet(page, 'workspaceEntryPoints')) === listBefore &&
      (await lastToast(page))?.title === 'Undone. The files are as they were before the upload.',
    { openedOne, open: await openPath(page), files: Object.keys(f) },
  );

  // 5. Replace the file open in the editor.
  await openFile(page, 'parts/kit.pathogen');
  await pick(page, 'upload-files', [kitNew]);
  check('kit.pathogen asks too', await waitPrompt(page));
  await answer(page, 'replace');
  toast = await lastToast(page);
  check(
    'Replace: the tab stays and shows the new text; the toast says Replaced, with Undo',
    (await openPath(page)) === 'parts/kit.pathogen' &&
      (await editorText(page)) === KIT_NEW &&
      (await files(page))['parts/kit.pathogen'] === KIT_NEW &&
      toast?.title === 'Replaced kit.pathogen.' &&
      toast.undo,
    { toast, text: await editorText(page) },
  );
  await page.evaluate(`${WV}.shadowRoot.querySelector('code-editor-pane').focusEditor()`);
  await page.keyboard.down('Meta');
  await page.keyboard.press('z');
  await page.keyboard.up('Meta');
  await pause(200);
  check(
    'a fresh undo history: Cmd-Z doesn’t bring the old text back',
    (await editorText(page)) === KIT_NEW,
    await editorText(page),
  );
  await page.evaluate(`window.__find('app-toast').shadowRoot.querySelector('.toast:last-child .action').click()`);
  await pause(400);
  check(
    'the toast’s Undo puts the old text back, in the editor too',
    (await editorText(page)) === KIT && (await files(page))['parts/kit.pathogen'] === KIT,
    await editorText(page),
  );

  // 6. A file with Windows line ends and a byte-order mark: kept as the editor keeps text.
  await openFile(page, 'main.pathogen');
  await pick(page, 'upload-files', [crlf]);
  await waitFor('windows.pathogen', async () => ('windows.pathogen' in (await files(page)) ? true : null));
  const windowsText = (await files(page))['windows.pathogen'] ?? '';
  check(
    'one file goes in at the top, opens in a tab, with \\n line ends and no byte-order mark',
    windowsText === 'define ViewBox(0, 0, 200, 100);\ncircle(10, 10, 5);\n' &&
      (await openPath(page)) === 'windows.pathogen',
    { windowsText, open: await openPath(page) },
  );

  // 7. A 900 KB file goes in and is saved whole.
  await pick(page, 'upload-files', [big]);
  await waitFor('big.pathogen', async () => ('big.pathogen' in (await files(page)) ? true : null), 20_000);
  const bigSaved = await waitFor(
    'big.pathogen saved',
    async () => {
      const w = await api('GET', `/workspace/${id}`);
      const text = ((w.files ?? {}) as Record<string, { text?: string }>)['big.pathogen']?.text;
      return text !== undefined ? text : null;
    },
    60_000,
  );
  check('a 900 KB file is saved whole', bigSaved === BIG_TEXT, { length: bigSaved?.length, expected: BIG_TEXT.length });

  // 8. Upload folder…: the folders inside it kept; .DS_Store left out without a word.
  let folderPicked = true;
  try {
    await pick(page, 'upload-folder', [shapesDir]);
  } catch (err) {
    folderPicked = false;
    console.log(`  (the picker didn't take a folder here: ${(err as Error).message})`);
  }
  if (folderPicked) {
    const got = await waitFor(
      'the folder',
      async () => ('shapes/round/dot.pathogen' in (await files(page)) ? true : null),
      10_000,
    );
    const shapes = Object.keys(await files(page))
      .filter((path) => path.startsWith('shapes/'))
      .sort();
    check(
      'Upload folder…: shapes/star.pathogen and shapes/round/dot.pathogen, no .DS_Store',
      !!got && JSON.stringify(shapes) === JSON.stringify(['shapes/round/dot.pathogen', 'shapes/star.pathogen']),
      shapes,
    );
  }

  // 9. A file dropped from the computer on a file in parts/: parts/ lit while it's dragged over, with its label.
  const dropOn = async (selectorPath: string, type: string, name: string, text: string): Promise<boolean> =>
    page.evaluate(`(() => {
      const row = ${TREE}.querySelector('[data-path="${selectorPath}"]');
      const b = row.getBoundingClientRect();
      const dt = new DataTransfer();
      dt.items.add(new File([${JSON.stringify(text)}], ${JSON.stringify(name)}));
      const e = new DragEvent('${type}', { bubbles: true, composed: true, cancelable: true, dataTransfer: dt, clientX: b.left + 30, clientY: b.top + 8 });
      row.dispatchEvent(e);
      return e.defaultPrevented;
    })()`) as Promise<boolean>;
  await dropOn('parts/gears.pathogen', 'dragenter', 'ratchet.pathogen', SPRINGS);
  await dropOn('parts/gears.pathogen', 'dragover', 'ratchet.pathogen', SPRINGS);
  const lit = (await page.evaluate(`({
    folder: ${TREE}.querySelector('[data-path="parts"]').classList.contains('drop'),
    inside: ${TREE}.querySelector('[data-path="parts/kit.pathogen"]').classList.contains('in-drop'),
    label: ${TREE}.querySelector('.drop-label').hidden ? null : ${TREE}.querySelector('.drop-label').textContent,
  })`)) as { folder: boolean; inside: boolean; label: string | null };
  check(
    // With the count since 6b (your answer, 2026-11-13).
    'files dragged over a file in parts/ light parts/ and its rows; the label says "Drop 1 item to add to parts/"',
    lit.folder && lit.inside && lit.label === 'Drop 1 item to add to parts/',
    lit,
  );
  await page.screenshot({ path: `${SHOTS}/2d-step6a-drop-light.png` });
  const dropped = await dropOn('parts/gears.pathogen', 'drop', 'ratchet.pathogen', SPRINGS);
  await waitFor(
    'ratchet.pathogen',
    async () => ('parts/ratchet.pathogen' in (await files(page)) ? true : null),
    10_000,
  );
  check(
    'dropped: parts/ratchet.pathogen goes in and opens; the lights go out',
    dropped &&
      (await openPath(page)) === 'parts/ratchet.pathogen' &&
      !((await page.evaluate(`${TREE}.querySelector('[data-path="parts"]').classList.contains('drop')`)) as boolean),
    await openPath(page),
  );

  // 10. A file dropped on the editor: nothing happens (no file opened by the browser, no text pasted).
  const before = await editorText(page);
  const editorDrop = (await page.evaluate(`(() => {
    const content = ${WV}.shadowRoot.querySelector('code-editor-pane').shadowRoot.querySelector('.cm-content');
    const dt = new DataTransfer();
    dt.items.add(new File(['M 9 9'], 'stray.pathogen'));
    const over = new DragEvent('dragover', { bubbles: true, composed: true, cancelable: true, dataTransfer: dt });
    content.dispatchEvent(over);
    const drop = new DragEvent('drop', { bubbles: true, composed: true, cancelable: true, dataTransfer: dt });
    content.dispatchEvent(drop);
    return { over: over.defaultPrevented, drop: drop.defaultPrevented };
  })()`)) as { over: boolean; drop: boolean };
  await pause(600);
  check(
    'a file dropped on the editor: the browser doesn’t open it, and nothing is pasted or added',
    editorDrop.over &&
      editorDrop.drop &&
      (await editorText(page)) === before &&
      !('stray.pathogen' in (await files(page))),
    editorDrop,
  );

  // 11. Escape on the question skips that file, and nothing else hears it.
  await openFile(page, 'main.pathogen');
  const count = Object.keys(await files(page)).length;
  await click(page, TREE, '[data-path="parts"] .row-menu');
  const [chooser] = await Promise.all([
    page.waitForFileChooser({ timeout: 5000 }),
    click(page, TREE, '[data-action="upload-files"]'),
  ]);
  await chooser.accept([labels]);
  await waitPrompt(page);
  await page.keyboard.press('Escape');
  await pause(400);
  check(
    'Escape skips it: the question goes, nothing is added',
    !(await prompt(page)).open && Object.keys(await files(page)).length === count,
    { open: (await prompt(page)).open, count, now: Object.keys(await files(page)).length },
  );

  // 12. The file limit: the whole upload is refused before anything is added.
  const many = Array.from({ length: 20 - count + 1 }, (_, i) => fixture(`many/f${i}.pathogen`, SPRINGS));
  await pick(page, 'upload-files', many);
  await pause(800);
  toast = await lastToast(page);
  check(
    'more files than the limit: refused whole, with the limit and the count',
    Object.keys(await files(page)).length === count &&
      toast?.type === 'error' &&
      toast.title === 'Nothing was added' &&
      toast.message === `A workspace can hold at most 20 files: this one has ${count}, and the upload would make 21.`,
    toast,
  );

  // 13. A workspace switch while it asks: the question goes, and nothing is added anywhere.
  await pick(page, 'upload-files', [labels, springs]);
  await waitPrompt(page);
  await page.evaluate(`import('/utils/router.js').then((m) => m.navigateTo('/workspace/${otherId}'))`);
  await waitFor('the other workspace', async () => ((await storeGet(page, 'workspaceId')) === otherId ? true : null));
  await pause(800);
  const otherFiles = Object.keys(await files(page));
  check(
    'a switch while it asks: the question goes, and the other workspace gets nothing',
    !(await prompt(page)).open && JSON.stringify(otherFiles) === JSON.stringify(['main.pathogen']),
    { open: (await prompt(page)).open, otherFiles },
  );
  const first = await api('GET', `/workspace/${id}`);
  check(
    'and the first workspace got nothing either (no springs at the top)',
    !('springs.pathogen' in ((first.files as object) ?? {})),
    Object.keys((first.files as object) ?? {}),
  );

  // 14. Dark: the question.
  await setTheme(page, 'dark');
  await open(page, id);
  await openFile(page, 'parts/gears.pathogen');
  await pick(page, 'upload-files', [labels]);
  await waitPrompt(page);
  await page.screenshot({ path: `${SHOTS}/2d-step6a-clash-dark.png` });
  await answer(page, 'skip');
  await setTheme(page, 'light');

  // 15. The storybook: the question's two stories, and the toast's list.
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    await page.goto(`${PAGES_URL}/storybook/clash-prompt`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitFor('the story', async () =>
      page.evaluate(
        `!!window.__find('.story-tab')?.getRootNode().querySelector('clash-prompt')?.shadowRoot?.querySelector('#q')`,
      ),
    );
    const stories = (await page.evaluate(
      `[...window.__find('.story-tab').parentElement.querySelectorAll('.story-tab')].map((b) => b.textContent.trim())`,
    )) as string[];
    await page.evaluate(`window.__find('.story-tab[data-story="1"]')?.click()`);
    await pause(400);
    await page.screenshot({ path: `${SHOTS}/2d-step6a-story-clash-${theme}.png` });
    check(
      `the storybook: the clash prompt’s two stories (${theme})`,
      JSON.stringify(stories) === '["One taken name","Three taken names"]',
      stories,
    );
    await page.goto(`${PAGES_URL}/storybook/app-toast`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitFor('the toast story', async () => page.evaluate(`!!window.__find('.story-tab')`));
    await page.evaluate(
      `[...window.__find('.story-tab').parentElement.querySelectorAll('.story-tab')].find((b) => b.textContent.includes('With a list'))?.click()`,
    );
    await pause(500);
    // The story's own toast, not the app's (the page has both): every toast's list counted.
    const listed = (await page.evaluate(`(() => {
      let n = 0;
      const walk = (root) => {
        for (const el of root.querySelectorAll('*')) {
          if (el.localName === 'app-toast') n += el.shadowRoot.querySelectorAll('.items li').length;
          if (el.shadowRoot) walk(el.shadowRoot);
        }
      };
      walk(document);
      return n;
    })()`)) as number;
    await page.screenshot({ path: `${SHOTS}/2d-step6a-story-toast-${theme}.png` });
    check(`the toast’s story lists the files left out (${theme})`, listed === 2, listed);
  }

  check('no page errors', pageErrors.length === 0, pageErrors);
} finally {
  await browser.close();
  for (const wsId of made) await api('DELETE', `/workspace/${wsId}`);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

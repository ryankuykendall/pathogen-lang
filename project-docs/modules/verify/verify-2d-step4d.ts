// Phase 2d, step 4d (note 52; mockup v11, note 57): no file open. In the
// served playground: every tab closes, and the editor's zero-state takes the
// editor's place (the file crumb goes, Copy Code and Format Document are off);
// what was typed is saved, and keys pressed with no file open reach no file;
// Open main brings the main back with its undo history; deleting the only
// open file leads here, the preview back on the main; with Files off, Show
// files; with no program, New program (the tree shown first) makes one, which
// the preview shows; with no files, "No files yet", and the tree stays, also
// after a reload (no main.pathogen made up); a scratch link keeps its last
// tab; a workspace switch from here shows the editor while the next loads,
// then opens its main; light, dark, and the storybook.
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/verify-2d-step4d.ts

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
    'import { gear } from "./parts/gears.pathogen";\n\ndefine ViewBox(0, 0, 200, 200);\ndefine default PathLayer(\'main\') #{\n  stroke: #6d3aa6;\n  stroke-width: 4;\n  fill: none;\n};\ngear(100, 100, 60);\n',
  'try-sizes.pathogen': 'define ViewBox(0, 0, 200, 200);\ncircle(60, 100, 20);\ncircle(140, 100, 40);\n',
  'parts/gears.pathogen': 'module;\n\nexport fn gear(cx, cy, r) {\n  circle(cx, cy, r);\n  circle(cx, cy, r * 0.3);\n}\n',
  'parts/kit.pathogen': 'module;\n\nexport const size = 12;\n',
};
const ENTRY = ['main.pathogen', 'try-sizes.pathogen'];

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

interface State {
  open: string | null;
  tabs: string[];
  closeButtons: number;
  zero: { shown: boolean; heading: string; text: string; buttons: string[] } | null;
  editorHidden: boolean;
  crumbFile: string | null;
  copyCode: { disabled: boolean; title: string };
  treeShown: boolean;
  filesToggle: boolean;
  rows: string[];
  fieldFocused: boolean;
  text: string;
}

async function state(page: Page): Promise<State> {
  return page.evaluate(`(() => {
    const pane = window.__find('code-editor-pane');
    const zeroEl = pane.shadowRoot.querySelector('editor-zero-state');
    const zr = zeroEl?.shadowRoot;
    const tabsRoot = window.__find('editor-tabs').shadowRoot;
    const crumb = window.__find('app-breadcrumb').shadowRoot;
    const copy = crumb.querySelector('#copy-code');
    const tree = window.__find('file-tree');
    const input = tree.shadowRoot.querySelector('.row.input input');
    return {
      open: pane.activePath,
      tabs: [...tabsRoot.querySelectorAll('[role="tab"]')].map((t) => t.dataset.path),
      closeButtons: tabsRoot.querySelectorAll('[role="tab"] .close').length,
      zero: zeroEl ? {
        shown: !zeroEl.hidden,
        heading: zr.querySelector('h2')?.textContent ?? '',
        text: zr.querySelector('p')?.textContent ?? '',
        buttons: [...zr.querySelectorAll('button')].map((b) => b.textContent.trim()),
      } : null,
      editorHidden: pane.shadowRoot.querySelector('#editor-container').hidden,
      crumbFile: crumb.querySelector('.breadcrumb-file')?.textContent ?? null,
      copyCode: { disabled: !!copy?.disabled, title: copy?.title ?? '' },
      treeShown: tree.classList.contains('open') && getComputedStyle(tree).display !== 'none',
      filesToggle: !!crumb.querySelector('#files-toggle'),
      rows: [...tree.shadowRoot.querySelectorAll('[role="treeitem"]')].map((r) => r.dataset.path),
      fieldFocused: !!input && tree.shadowRoot.activeElement === input,
      text: pane._editor ? pane._editor.state.doc.toString() : '',
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

async function rectIn(page: Page, rootExpr: string, selector: string): Promise<{ x: number; y: number }> {
  const r = (await page.evaluate(`(() => {
    const el = (${rootExpr}).querySelector('${selector}');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  })()`)) as { x: number; y: number } | null;
  if (!r) throw new Error(`nothing at ${selector}`);
  return r;
}

async function click(page: Page, rootExpr: string, selector: string): Promise<void> {
  const { x, y } = await rectIn(page, rootExpr, selector);
  await page.mouse.click(x, y);
  await pause(300);
}

const TABS = `window.__find('editor-tabs').shadowRoot`;
const TREE = 'window.__tree()';
const ZERO = `window.__find('code-editor-pane').shadowRoot.querySelector('editor-zero-state').shadowRoot`;
const CRUMB = `window.__find('app-breadcrumb').shadowRoot`;

/** Close every tab with its ×, as a mouse would. */
async function closeAllTabs(page: Page): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const s = await state(page);
    if (s.tabs.length === 0) return;
    await page.evaluate(`(() => { const t = ${TABS}.querySelector('[role="tab"]'); t.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); })()`);
    await click(page, TABS, `[role="tab"][data-path="${s.tabs[0]}"] .close`);
  }
}

async function rowMenu(page: Page, path: string): Promise<void> {
  const row = await rectIn(page, TREE, `[role="treeitem"][data-path="${path}"]`);
  await page.mouse.move(row.x - 60, row.y);
  await pause(100);
  await click(page, TREE, `[role="treeitem"][data-path="${path}"] .row-menu`);
}

async function deleteEntry(page: Page, path: string): Promise<void> {
  await rowMenu(page, path);
  await click(page, TREE, '[role="menuitem"][data-action="delete"]');
  await pause(300);
  await page.evaluate(`document.querySelector('confirm-dialog').shadowRoot.querySelector('.confirm').click()`);
  await pause(700);
}

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
  const create = async (name: string, files: Record<string, string>, entryPoints: string[]): Promise<string> => {
    const created = await api('POST', '/workspace', {
      name,
      files: Object.fromEntries(Object.entries(files).map(([p, text]) => [p, { text }])),
      entryPoints,
    });
    made.push(created.id as string);
    return created.id as string;
  };
  const id = await create('4d no file open', FILES, ENTRY);
  const otherId = await create('4d another', { 'main.pathogen': 'define ViewBox(0, 0, 100, 100);\ncircle(50, 50, 30);\n' }, ['main.pathogen']);
  await open(page, id);
  const before = await drawn(page);

  // 1. Type in main, then close every tab: the zero-state, in the editor's place.
  await page.evaluate(`(() => {
    const pane = window.__find('code-editor-pane');
    pane.focusEditor();
    pane._editor.dispatch({ selection: { anchor: pane._editor.state.doc.length } });
  })()`);
  await page.keyboard.type('// typed before closing');
  await pause(300);
  let s = await state(page);
  check('every tab has a ×, the last one too', s.closeButtons === s.tabs.length && s.tabs.length > 0, s);
  await closeAllTabs(page);
  s = await state(page);
  check(
    'with every tab closed: the zero-state, which opens the main',
    s.open === null &&
      s.tabs.length === 0 &&
      s.editorHidden &&
      !!s.zero?.shown &&
      s.zero.heading === 'No file open' &&
      s.zero.text === "The workspace's main is main.pathogen. Open it, or click any file in the tree." &&
      JSON.stringify(s.zero.buttons) === '["Open main.pathogen"]',
    s,
  );
  check(
    'no file crumb; Copy Code is off and says why',
    s.crumbFile === null && s.copyCode.disabled && s.copyCode.title === 'No file open: open one to copy its code',
    { crumb: s.crumbFile, copy: s.copyCode },
  );
  await click(page, CRUMB, '.menu-btn');
  const format = (await page.evaluate(`(() => {
    const b = ${CRUMB}.querySelector('[data-action="format-document"]');
    return b ? { disabled: b.disabled, title: b.title } : null;
  })()`)) as { disabled: boolean; title: string } | null;
  check('Format Document is off, "No file open"', !!format && format.disabled && format.title === 'No file open', format);
  await page.keyboard.press('Escape');
  check('the preview still draws the main', (await drawn(page)) === before);
  await page.screenshot({ path: `${SHOTS}/2d-step4d-closed-light.png` });

  // 2. What was typed is the workspace's, and the server's; keys pressed now reach no file.
  const filesNow = (await storeGet(page, 'workspaceFiles')) as Record<string, string>;
  const savedTyped = await waitFor(
    'the typed text saved',
    async () => {
      const w = await api('GET', `/workspace/${id}`);
      const text = ((w.files as Record<string, { text: string }>) ?? {})['main.pathogen']?.text ?? '';
      return text.includes('// typed before closing') ? text : null;
    },
    45_000,
  );
  check('the typed text is in the workspace and on the server', filesNow['main.pathogen'].includes('// typed before closing') && savedTyped !== null, { savedTyped: !!savedTyped });
  await page.mouse.click(700, 600);
  await page.keyboard.type('zzz');
  await page.keyboard.press('Backspace');
  await pause(500);
  const filesAfterKeys = (await storeGet(page, 'workspaceFiles')) as Record<string, string>;
  check(
    'keys pressed with no file open change no file',
    JSON.stringify(filesAfterKeys) === JSON.stringify(filesNow) && (await storeGet(page, 'code')) === '',
    { code: await storeGet(page, 'code') },
  );

  // 3. Open main.pathogen: back with what was typed, and its undo history.
  await click(page, ZERO, 'button[data-action="open-main"]');
  s = await state(page);
  const undoSteps = (await page.evaluate(`import('https://esm.sh/@codemirror/commands@6').then((m) => {
    const view = window.__find('code-editor-pane')._editor;
    let n = 0;
    while (n < 200 && m.undo(view)) n++;
    return n;
  })`)) as number;
  const afterUndo = await state(page);
  check(
    'Open main.pathogen: the main, its typed text, and its undo history',
    s.open === 'main.pathogen' &&
      JSON.stringify(s.tabs) === '["main.pathogen"]' &&
      !s.zero?.shown &&
      s.text.includes('// typed before closing') &&
      s.crumbFile === 'main.pathogen' &&
      !s.copyCode.disabled &&
      undoSteps > 0 &&
      !afterUndo.text.includes('// typed before closing'),
    { open: s.open, tabs: s.tabs, zero: s.zero, undoSteps, crumb: s.crumbFile },
  );

  // 4. The only open file deleted, the program shown: the zero-state, the preview back on the main.
  await click(page, TREE, '[role="treeitem"][data-path="try-sizes.pathogen"]');
  await page.evaluate(`import('/state/store.js').then(({ store }) => store.set('shownProgram', 'try-sizes.pathogen'))`);
  await closeAllTabs(page);
  await click(page, TREE, '[role="treeitem"][data-path="try-sizes.pathogen"]');
  await deleteEntry(page, 'try-sizes.pathogen');
  s = await state(page);
  check(
    'deleting the only open file: the zero-state, and the preview back on the main',
    s.open === null && !!s.zero?.shown && (await storeGet(page, 'shownProgram')) === null && !s.rows.includes('try-sizes.pathogen'),
    { open: s.open, zero: s.zero, shown: await storeGet(page, 'shownProgram') },
  );

  // 5. Files off: Show files beside Open; Show files brings the tree back, with the keyboard.
  await click(page, CRUMB, '#files-toggle');
  s = await state(page);
  const hiddenView = s.zero;
  await click(page, ZERO, 'button[data-action="show-files"]');
  const treeFocused = (await page.evaluate(`window.__tree().activeElement?.getAttribute('role')`)) as string | null;
  s = await state(page);
  check(
    'Files off: Show files beside Open main.pathogen; it brings the tree back, with the keyboard',
    JSON.stringify(hiddenView?.buttons) === '["Open main.pathogen","Show files"]' && s.treeShown && treeFocused === 'treeitem',
    { hiddenView, treeShown: s.treeShown, treeFocused },
  );

  // 6. Delete the last program with no file open: "No program yet", New program.
  await deleteEntry(page, 'main.pathogen');
  s = await state(page);
  const noProgram = s.zero;
  const previewNoProgram = { status: await storeGet(page, 'compilationStatus'), drawn: await drawn(page) };
  check(
    'no program: "No program yet", why nothing draws, and New program',
    noProgram?.heading === 'No program yet' &&
      noProgram.text === 'Every file here is a library, so nothing draws. Start a program, or click a library in the tree to edit it.' &&
      JSON.stringify(noProgram.buttons) === '["New program"]',
    noProgram,
  );
  console.log(`  (the preview with no program: status ${String(previewNoProgram.status)}, ${previewNoProgram.drawn.length} characters of path drawn)`);
  await page.screenshot({ path: `${SHOTS}/2d-step4d-no-program-light.png` });

  // 7. New program with the tree hidden: the tree shows, its name field at the top level takes the keyboard.
  await click(page, CRUMB, '#files-toggle');
  await click(page, ZERO, 'button[data-action="new-program"]');
  s = await state(page);
  check('New program with Files off: the tree shows, its name field has the keyboard', s.treeShown && s.fieldFocused, s);
  await page.keyboard.type('poster');
  await page.keyboard.press('Enter');
  await pause(1200);
  s = await state(page);
  const entry = (await storeGet(page, 'workspaceEntryPoints')) as string[];
  // A new program starts with the canvas only: draw in it, and the preview shows it.
  await page.evaluate(`(() => {
    const pane = window.__find('code-editor-pane');
    pane.focusEditor();
    pane._editor.dispatch({ selection: { anchor: pane._editor.state.doc.length } });
  })()`);
  await page.keyboard.type('circle(100, 100, 40);');
  const posterDrawn = await waitFor('the poster drawn', async () => ((await drawn(page)).length > 0 ? drawn(page) : null), 15_000);
  check(
    'poster.pathogen: made, opened, the main, and the preview draws it',
    s.open === 'poster.pathogen' && entry[0] === 'poster.pathogen' && !s.zero?.shown && !!posterDrawn,
    { open: s.open, entry, posterDrawn },
  );

  // 8. Every file deleted: "No files yet"; the Files toggle and the tree stay.
  await deleteEntry(page, 'poster.pathogen');
  await deleteEntry(page, 'parts');
  s = await state(page);
  check(
    'every file deleted: "No files yet", with the tree and its Files toggle still there',
    s.zero?.heading === 'No files yet' &&
      s.zero.text === 'This workspace is empty, so nothing draws. Start a program, or add your own files with the + in the Files header.' &&
      s.filesToggle &&
      s.treeShown &&
      JSON.stringify(s.rows) === '["pathogen.json"]',
    s,
  );
  await page.screenshot({ path: `${SHOTS}/2d-step4d-no-files-light.png` });
  const emptied = await waitFor(
    'the empty workspace saved',
    async () => {
      const w = await api('GET', `/workspace/${id}`);
      return Object.keys((w.files as object) ?? {}).length === 0 ? w : null;
    },
    30_000,
  );
  check('the server holds the workspace with no files', emptied !== null, emptied);

  // 8b. Reloaded, the empty workspace opens on its zero-state: no main.pathogen it doesn't hold (review item 1).
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the empty workspace loaded', async () => ((await state(page)).zero?.shown ? true : null), 20_000);
  s = await state(page);
  const filesReloaded = (await storeGet(page, 'workspaceFiles')) as Record<string, string>;
  check(
    'reloaded with no files: "No files yet", no tab, and no file made',
    s.open === null &&
      s.tabs.length === 0 &&
      s.editorHidden &&
      s.zero?.heading === 'No files yet' &&
      Object.keys(filesReloaded).length === 0 &&
      JSON.stringify(s.rows) === '["pathogen.json"]',
    { s, filesReloaded },
  );
  // Show files there: the keyboard goes to the tree's one row.
  await click(page, CRUMB, '#files-toggle');
  await click(page, ZERO, 'button[data-action="show-files"]');
  const emptyTreeFocus = (await page.evaluate(`window.__tree().activeElement?.dataset.path ?? null`)) as string | null;
  check('Show files with no files: the keyboard on pathogen.json', emptyTreeFocus === 'pathogen.json', emptyTreeFocus);
  await pause(2500);
  const stillEmpty = await api('GET', `/workspace/${id}`);
  check('nothing was saved into it', Object.keys((stillEmpty.files as object) ?? {}).length === 0, stillEmpty.files);

  // 9. A workspace switch from the zero-state: while the next one loads (held back 2 s here), the
  // editor is back, on main.pathogen; then the next workspace's main opens (review item 2).
  await page.setRequestInterception(true);
  const holdBack = (req: HTTPRequest): void => {
    if (req.isInterceptResolutionHandled()) return;
    if (req.method() === 'GET' && req.url().startsWith(`${DEV_API}/workspace/${otherId}`)) {
      setTimeout(() => void req.continue(), 2000);
    } else void req.continue();
  };
  page.on('request', holdBack);
  await page.evaluate(`import('/utils/router.js').then((m) => m.navigateTo('/workspace/${otherId}'))`);
  await pause(700);
  s = await state(page);
  check(
    'while the next workspace loads: the editor on main.pathogen, not the old zero-state',
    s.open === 'main.pathogen' && !s.zero?.shown && !s.editorHidden && JSON.stringify(s.tabs) === '["main.pathogen"]',
    { open: s.open, zero: s.zero, editorHidden: s.editorHidden, tabs: s.tabs },
  );
  await waitFor('the other workspace', async () => ((await state(page)).text.includes('circle(50, 50, 30)') ? true : null), 20_000);
  page.off('request', holdBack);
  await page.setRequestInterception(false);
  s = await state(page);
  check(
    'a workspace switch from the zero-state: the next one opens its main, in the editor',
    s.open === 'main.pathogen' && !s.zero?.shown && !s.editorHidden && s.text.includes('circle(50, 50, 30)'),
    { open: s.open, zero: s.zero, text: s.text.slice(0, 60) },
  );

  // 10. A scratch link keeps its last tab.
  await page.goto(`${PAGES_URL}/workspace/scratch`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the scratch editor', async () => ((await state(page)).tabs.length > 0 ? true : null), 20_000);
  s = await state(page);
  check('a scratch link: its one tab has no ×, and no tree', s.tabs.length === 1 && s.closeButtons === 0 && !s.filesToggle, s);

  // 11. Dark mode: the zero-state with a main, and with no program.
  await setTheme(page, 'dark');
  await open(page, otherId);
  await closeAllTabs(page);
  await page.screenshot({ path: `${SHOTS}/2d-step4d-closed-dark.png` });

  // 12. The storybook: five zero-state stories, dark then light.
  for (const theme of ['dark', 'light']) {
    await setTheme(page, theme);
    await page.goto(`${PAGES_URL}/storybook/editor-zero-state`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitFor('the story', async () =>
      page.evaluate(`!!window.__find('.story-tab')?.getRootNode().querySelector('editor-zero-state')?.shadowRoot?.querySelector('h2')`),
    );
    const stories = (await page.evaluate(
      `[...window.__find('.story-tab').parentElement.querySelectorAll('.story-tab')].map((b) => b.textContent.trim())`,
    )) as string[];
    await page.evaluate(`window.__find('.story-tab[data-story="2"]')?.click()`);
    await pause(400);
    await page.screenshot({ path: `${SHOTS}/2d-step4d-story-${theme}.png` });
    check(`the storybook: five zero-state stories (${theme})`, stories.length === 5, stories);
  }

  check('no page errors', pageErrors.length === 0, pageErrors);
} finally {
  await browser.close();
  for (const id of made) await api('DELETE', `/workspace/${id}`);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

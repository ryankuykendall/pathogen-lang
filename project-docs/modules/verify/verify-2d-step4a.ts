// Phase 2d, step 4a (note 52): the file tree, read-only. In the served
// playground, the tree sits left of the editor (folders first, an empty folder
// says so, pathogen.json last with a lock); a click opens a file in a tab
// without changing the preview; folders fold; the keyboard works; Files in the
// breadcrumb hides and shows it; pathogen.json opens read-only (JSON colours,
// no Pathogen diagnostics, typing lights its line and shows the tip, Format
// Document leaves it alone, and no save ever sends it); a scratch link has no
// tree; the storybook entry, light and dark.
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/verify-2d-step4a.ts

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

const GEARS_LIB = `module;

// A gear: a rim and a hub.
export fn gear(cx, cy, r) {
  circle(cx, cy, r);
  circle(cx, cy, r * 0.3);
}
`;
const FILES: Record<string, string> = {
  'main.pathogen': `import { gear } from "./parts/gears.pathogen";

define ViewBox(0, 0, 200, 200);
define default PathLayer('main') #{
  stroke: #6d3aa6;
  stroke-width: 4;
  fill: none;
};
gear(100, 100, 60);
`,
  'try-sizes.pathogen': `define ViewBox(0, 0, 200, 200);
circle(60, 100, 20);
circle(140, 100, 40);
`,
  'demos/gears.pathogen': `import { gear } from "../parts/gears.pathogen";

define ViewBox(0, 0, 300, 120);
gear(60, 60, 40);
gear(200, 60, 50);
`,
  'parts/gears.pathogen': GEARS_LIB,
  'parts/kit.pathogen': 'module;\n\nexport const size = 12;\n',
};
const ENTRY = ['main.pathogen', 'demos/gears.pathogen', 'try-sizes.pathogen'];
const TREE_ORDER = [
  'demos',
  'demos/gears.pathogen',
  'examples',
  'parts',
  'parts/gears.pathogen',
  'parts/kit.pathogen',
  'main.pathogen',
  'try-sizes.pathogen',
  'pathogen.json',
];
const PROJECT_JSON = `{\n  "entryPoints": [\n    "main.pathogen",\n    "demos/gears.pathogen",\n    "try-sizes.pathogen"\n  ]\n}\n`;

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
  window.__rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };
`;

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface TreeState {
  open: boolean;
  rect: Rect | null;
  visibility: string;
  rows: string[];
  active: string[];
  headBottom: number | null;
  tabsBottom: number | null;
  editor: Rect | null;
}

async function treeState(page: Page): Promise<TreeState> {
  return page.evaluate(`(() => {
    const tree = window.__find('file-tree');
    const rows = [...tree.shadowRoot.querySelectorAll('[role="treeitem"]')];
    return {
      open: tree.classList.contains('open'),
      rect: window.__rect(tree),
      visibility: getComputedStyle(tree).visibility,
      rows: rows.map((r) => r.dataset.path),
      active: rows.filter((r) => r.getAttribute('aria-selected') === 'true').map((r) => r.dataset.path),
      headBottom: window.__rect(tree.shadowRoot.querySelector('.head'))?.bottom ?? null,
      tabsBottom: window.__rect(window.__find('editor-tabs'))?.bottom ?? null,
      editor: window.__rect(window.__find('code-editor-pane')),
    };
  })()`) as Promise<TreeState>;
}

/** The editor: its file, its text, its tabs, and whether its read-only line shows. */
async function editorState(page: Page): Promise<{
  open: string;
  text: string;
  tabs: string[];
  note: boolean;
  noteLit: boolean;
  tip: string | null;
  marks: number;
}> {
  return page.evaluate(`(() => {
    const pane = window.__find('code-editor-pane');
    const note = pane.shadowRoot.querySelector('.read-only-note');
    const tip = pane.shadowRoot.querySelector('.read-only-tip');
    return {
      open: pane.activePath,
      text: pane._editor.state.doc.toString(),
      tabs: [...window.__find('editor-tabs').shadowRoot.querySelectorAll('[role="tab"]')].map((t) => t.dataset.path),
      note: !note.hidden,
      noteLit: note.classList.contains('hl'),
      tip: tip.hidden ? null : tip.textContent,
      marks: pane.shadowRoot.querySelectorAll('.cm-error-line, .cm-error-char, .cm-lintRange, .cm-warning-line').length,
    };
  })()`) as Promise<{
    open: string;
    text: string;
    tabs: string[];
    note: boolean;
    noteLit: boolean;
    tip: string | null;
    marks: number;
  }>;
}

const drawn = async (page: Page): Promise<string> =>
  page.evaluate(`(() => {
    const doc = window.__find('svg-preview-pane').shadowRoot.querySelector('iframe')?.contentDocument;
    return [...(doc?.querySelectorAll('#preview-layers path') ?? [])].map((p) => p.getAttribute('d')).join(' ');
  })()`) as Promise<string>;

async function clickRow(page: Page, path: string): Promise<void> {
  const rect = (await page.evaluate(
    `window.__rect(window.__find('file-tree').shadowRoot.querySelector('[data-path="${path}"]'))`,
  )) as Rect;
  await page.mouse.click(rect.left + rect.width / 2, rect.top + rect.height / 2);
  await new Promise((r) => setTimeout(r, 300));
}

async function clickFiles(page: Page): Promise<void> {
  await page.evaluate(`window.__find('#files-toggle').click()`);
  await new Promise((r) => setTimeout(r, 450));
}

async function open(page: Page, id: string): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the drawing', async () => ((await drawn(page)).length > 0 ? true : null));
  await waitFor('the tree', async () => ((await treeState(page)).rows.length > 1 ? true : null));
  await new Promise((r) => setTimeout(r, 400));
}

async function setTheme(page: Page, theme: string): Promise<void> {
  await page.evaluate(`localStorage.setItem('pathogen-theme', '${theme}')`);
  await page.evaluateOnNewDocument((t: string) => localStorage.setItem('pathogen-theme', t), theme);
}

const near = (a: number | null, b: number | null, tolerance = 1.5): boolean =>
  a !== null && b !== null && Math.abs(a - b) <= tolerance;

const made: string[] = [];
const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1320, height: 860 } });
try {
  const page = await browser.newPage();
  page.on('dialog', (d) => void d.accept());
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  const savedFiles: string[][] = [];
  page.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().startsWith(`${DEV_API}/workspace/`)) {
      const body = JSON.parse(req.postData() ?? '{}') as { files?: Record<string, unknown> };
      if (body.files) savedFiles.push(Object.keys(body.files).sort());
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

  const created = await api('POST', '/workspace', {
    name: '4a tree',
    files: Object.fromEntries(Object.entries(FILES).map(([p, text]) => [p, { text }])),
    folders: ['examples'],
    entryPoints: ENTRY,
  });
  const id = created.id as string;
  made.push(id);
  await open(page, id);

  // 1. The tree: left of the editor, its rows in order, the main marked as the file in the editor.
  let tree = await treeState(page);
  check('the tree shows left of the editor, 248 px wide', tree.open && near(tree.rect?.width ?? 0, 248) && near(tree.rect?.right ?? 0, tree.editor?.left ?? -1), tree);
  check('folders first, then files; the empty folder; pathogen.json last', JSON.stringify(tree.rows) === JSON.stringify(TREE_ORDER), tree.rows);
  check('the file in the editor is marked', JSON.stringify(tree.active) === '["main.pathogen"]', tree.active);
  check('its header lines up with the tabs bar', near(tree.headBottom, tree.tabsBottom), tree);
  const emptyRow = (await page.evaluate(
    `window.__find('file-tree').shadowRoot.querySelector('.row.empty')?.textContent`,
  )) as string;
  check('an empty folder says so', emptyRow === 'Empty', emptyRow);
  const toggles = (await page.evaluate(
    `[...window.__find('#files-toggle').parentElement.querySelectorAll('button')].map((b) => [b.id, b.getAttribute('aria-pressed')])`,
  )) as string[][];
  check('Files sits before Console, pressed', JSON.stringify(toggles) === '[["files-toggle","true"],["console-toggle","false"]]', toggles);
  await page.screenshot({ path: `${SHOTS}/2d-step4a-tree-light.png` });

  // 2. A click opens the file in a tab; the preview stays on the program it shows.
  const before = await drawn(page);
  await clickRow(page, 'parts/gears.pathogen');
  let ed = await editorState(page);
  tree = await treeState(page);
  check(
    'clicking a library opens it in a tab, with its text',
    ed.open === 'parts/gears.pathogen' && ed.text === GEARS_LIB && JSON.stringify(ed.tabs) === '["main.pathogen","parts/gears.pathogen"]',
    ed,
  );
  check('the tree marks it, and the preview is unchanged', JSON.stringify(tree.active) === '["parts/gears.pathogen"]' && (await drawn(page)) === before, tree.active);

  // 3. Folding.
  await clickRow(page, 'parts');
  tree = await treeState(page);
  check('clicking a folder folds it', !tree.rows.includes('parts/kit.pathogen') && tree.rows.includes('parts'), tree.rows);
  await clickRow(page, 'parts');
  tree = await treeState(page);
  check('and again unfolds it', tree.rows.includes('parts/kit.pathogen'), tree.rows);

  // 4. The keyboard: Down to the next row, Enter opens it and hands the keyboard to the editor.
  await page.evaluate(`window.__find('file-tree').shadowRoot.querySelector('[data-path="parts/gears.pathogen"]').focus()`);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 300));
  ed = await editorState(page);
  const inEditor = (await page.evaluate(`window.__find('code-editor-pane')._editor.hasFocus`)) as boolean;
  check('Down then Enter opens the next file, and the editor has the keyboard', ed.open === 'parts/kit.pathogen' && inEditor, { ed, inEditor });

  // 5. pathogen.json: read-only, JSON colours, no Pathogen diagnostics.
  await clickRow(page, 'pathogen.json');
  await new Promise((r) => setTimeout(r, 400));
  ed = await editorState(page);
  check('pathogen.json opens with the entry points, and its read-only line', ed.open === 'pathogen.json' && ed.text === PROJECT_JSON && ed.note, ed);
  const tabLock = (await page.evaluate(
    `!!window.__find('editor-tabs').shadowRoot.querySelector('[data-path="pathogen.json"] .lock')`,
  )) as boolean;
  check('its tab has the lock', tabLock);
  // CodeMirror's light style leaves keys (propertyName) in the text colour and
  // makes strings red; One Dark colours keys coral (mockup v6, screen J).
  const jsonColours = async (): Promise<{ key: string | null; value: string | null; text: string }> =>
    page.evaluate(`(() => {
      const root = window.__find('code-editor-pane').shadowRoot;
      const spans = [...root.querySelectorAll('.cm-line span')];
      const colourOf = (text) => { const s = spans.find((el) => el.textContent === text); return s ? getComputedStyle(s).color : null; };
      return { key: colourOf('"entryPoints"'), value: colourOf('"main.pathogen"'), text: getComputedStyle(root.querySelector('.cm-line')).color };
    })()`) as Promise<{ key: string | null; value: string | null; text: string }>;
  const colours = await jsonColours();
  check(
    'strings are coloured, keys in the text colour (light)',
    !!colours.value && colours.value !== colours.text && (colours.key === null || colours.key === colours.text),
    colours,
  );
  await new Promise((r) => setTimeout(r, 600));
  ed = await editorState(page);
  check('no Pathogen diagnostics mark the JSON', ed.marks === 0, ed.marks);
  check('the preview still shows the main', (await drawn(page)) === before);
  await page.screenshot({ path: `${SHOTS}/2d-step4a-json-light.png` });

  // 6. Typing in it changes nothing, lights the line and shows the tip; both go after a moment.
  await page.evaluate(`window.__find('code-editor-pane').focusEditor()`);
  await page.keyboard.press('End');
  await page.keyboard.type('x');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Backspace');
  await new Promise((r) => setTimeout(r, 150));
  ed = await editorState(page);
  check(
    'typing leaves pathogen.json as it was, lights its line and shows the tip',
    ed.text === PROJECT_JSON && ed.noteLit && ed.tip === 'Read-only. Set as main changes this list',
    ed,
  );
  await page.screenshot({ path: `${SHOTS}/2d-step4a-typing-light.png` });
  await new Promise((r) => setTimeout(r, 2300));
  ed = await editorState(page);
  check('the highlight and the tip go after a moment', !ed.noteLit && ed.tip === null, ed);

  // An input method's composition (its beforeinput can't be cancelled) changes nothing either.
  const cdp = await page.createCDPSession();
  await cdp.send('Input.imeSetComposition', { text: 'あ', selectionStart: 1, selectionEnd: 1 });
  await new Promise((r) => setTimeout(r, 150));
  await cdp.send('Input.insertText', { text: 'あ' });
  await new Promise((r) => setTimeout(r, 400));
  ed = await editorState(page);
  check('an input method’s composition leaves pathogen.json as it was', ed.text === PROJECT_JSON, ed.text);
  const readonlyAttr = (await page.evaluate(
    `window.__find('code-editor-pane').shadowRoot.querySelector('.cm-content')?.getAttribute('aria-readonly')`,
  )) as string | null;
  check('its text box says it’s read-only to a screen reader', readonlyAttr === 'true', readonlyAttr);
  await new Promise((r) => setTimeout(r, 2300));

  // 7. Format Document (the ⋮ menu's event) leaves it alone.
  await page.evaluate(`document.dispatchEvent(new CustomEvent('format-document'))`);
  await new Promise((r) => setTimeout(r, 300));
  ed = await editorState(page);
  check('Format Document leaves pathogen.json alone', ed.text === PROJECT_JSON, ed.text);

  // 8. Back to the main: its text is intact; an edit saves without pathogen.json.
  await clickRow(page, 'main.pathogen');
  ed = await editorState(page);
  check('back on the main, its text is intact and the read-only line is gone', ed.text === FILES['main.pathogen'] && !ed.note, ed);
  // Typed at the end of the main; then clicking the tree takes the keyboard
  // out of the editor, and its blur flushes the save.
  await page.evaluate(`(() => {
    const pane = window.__find('code-editor-pane');
    pane.focusEditor();
    const view = pane._editor;
    view.dispatch({ selection: { anchor: view.state.doc.length } });
  })()`);
  await page.keyboard.type('circle(100, 100, 10);');
  await clickRow(page, 'pathogen.json');
  const saved = await waitFor('a save', async () => (savedFiles.length > 0 ? savedFiles : null), 40_000);
  check(
    'a save sends the workspace’s files and never pathogen.json',
    !!saved && saved.every((keys) => !keys.includes('pathogen.json')) && saved.some((keys) => keys.includes('main.pathogen')),
    saved,
  );
  const stored = await api('GET', `/workspace/${id}`);
  const storedMap = (stored.files as Record<string, { text?: string }>) ?? {};
  const storedFiles = Object.keys(storedMap).sort();
  check(
    'the server holds the five files, the edit in the main, no pathogen.json',
    JSON.stringify(storedFiles) === JSON.stringify(Object.keys(FILES).sort()) &&
      (storedMap['main.pathogen']?.text ?? '').endsWith('circle(100, 100, 10);'),
    { storedFiles, main: storedMap['main.pathogen']?.text },
  );
  await clickRow(page, 'main.pathogen');

  // 9. Files hides the tree and shows it again; the editor takes the room.
  const editorBefore = (await treeState(page)).editor!;
  await clickFiles(page);
  tree = await treeState(page);
  const pressed = (await page.evaluate(`window.__find('#files-toggle').getAttribute('aria-pressed')`)) as string;
  check(
    'Files hides the tree, and the editor takes its room',
    !tree.open && tree.visibility === 'hidden' && near(tree.rect?.width ?? -1, 0) && (tree.editor?.left ?? 999) < editorBefore.left - 100 && pressed === 'false',
    { tree, pressed },
  );
  await page.screenshot({ path: `${SHOTS}/2d-step4a-hidden-light.png` });
  await clickFiles(page);
  tree = await treeState(page);
  check('and shows it again', tree.open && near(tree.rect?.width ?? 0, 248), tree.rect);

  // 10. A reload: the tree is shown, the main open.
  await clickFiles(page);
  await open(page, id);
  tree = await treeState(page);
  check('after a reload the tree shows again, on the main', tree.open && JSON.stringify(tree.active) === '["main.pathogen"]', tree);

  // 11. At 700 px the tree stacks above the editor, its height capped (step 9 brings the drawer).
  await page.setViewport({ width: 700, height: 860 });
  await new Promise((r) => setTimeout(r, 500));
  tree = await treeState(page);
  check('at 700 px the tree sits above the editor, no taller than 30% of the window', tree.open && (tree.rect?.bottom ?? 999) <= (tree.editor?.top ?? 0) + 1 && (tree.rect?.height ?? 999) <= 860 * 0.3 + 1, tree);
  await page.screenshot({ path: `${SHOTS}/2d-step4a-narrow-light.png` });
  await page.setViewport({ width: 1320, height: 860 });

  // 12. A scratch link has no files: no Files, no tree.
  const state = (await page.evaluate(
    `import('/utils/url-state.js').then((m) => m.encodeState({ code: 'circle(100, 100, 40);' }))`,
  )) as string;
  await page.goto(`${PAGES_URL}/workspace/scratch?state=${state}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the drawing', async () => ((await drawn(page)).length > 0 ? true : null));
  const scratch = (await page.evaluate(
    `({ files: !!window.__find('#files-toggle'), tree: window.__find('file-tree')?.classList.contains('open') ?? false })`,
  )) as { files: boolean; tree: boolean };
  check('a scratch link has no Files and no tree', !scratch.files && !scratch.tree, scratch);

  // 13. Dark mode.
  await setTheme(page, 'dark');
  await open(page, id);
  await page.screenshot({ path: `${SHOTS}/2d-step4a-tree-dark.png` });
  await clickRow(page, 'pathogen.json');
  await new Promise((r) => setTimeout(r, 400));
  const dark = await jsonColours();
  check('in One Dark, keys and strings are coloured apart', !!dark.key && !!dark.value && dark.key !== dark.value, dark);
  await page.evaluate(`window.__find('code-editor-pane').focusEditor()`);
  await page.keyboard.type('x');
  await new Promise((r) => setTimeout(r, 150));
  await page.screenshot({ path: `${SHOTS}/2d-step4a-typing-dark.png` });

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
    for (const [i] of names.entries()) {
      await page.evaluate(`window.__find('.story-tab[data-story="${i}"]')?.click()`);
      await new Promise((r) => setTimeout(r, 400));
      const box = (await page.evaluate(`(() => {
        const el = window.__find('.story-tab').getRootNode().querySelector('file-tree');
        const r = el.getBoundingClientRect();
        return { x: Math.max(0, r.x - 16), y: Math.max(0, r.y - 16), width: r.width + 32, height: r.height + 32 };
      })()`)) as { x: number; y: number; width: number; height: number };
      await page.screenshot({ path: `${SHOTS}/2d-step4a-story-${i + 1}-${theme}.png`, clip: box });
    }
    check(`the storybook shows the five stories (${theme})`, names.length === 5, names);
  }
  const storyActive = (await page.evaluate(`(() => {
    window.__find('.story-tab[data-story="0"]')?.click();
    return new Promise((done) => setTimeout(() => {
      const tree = window.__find('.story-tab').getRootNode().querySelector('file-tree');
      tree.shadowRoot.querySelector('[data-path="parts/kit.pathogen"]').click();
      done(tree.active);
    }, 400));
  })()`)) as string;
  check('in the story, a click marks the file (as workspace-view does)', storyActive === 'parts/kit.pathogen', storyActive);

  check('no page errors', pageErrors.length === 0, pageErrors);
} finally {
  await browser.close();
  for (const id of made) await api('DELETE', `/workspace/${id}`);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

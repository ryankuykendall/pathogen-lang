// Phase 2d, step 6b (note 52; mockup v7 screen F, state 7; docs/workspace-files.md
// "Renaming, moving and deleting"): dragging a file or a folder within the tree,
// in the served playground:
// - kit.pathogen dragged onto demos/: the row dims, demos/ lights up, the label
//   says how many files' imports the move updates; dropped, it moves, with the
//   imports updated, the toast and its Undo, the row keeping the keyboard, saved;
// - the folder it's in already doesn't light; a refused folder says why, and a
//   drop there moves nothing; a folder can't go into itself;
// - a folder dragged; a file dragged to the top (empty space); a folded folder
//   opens when something is dropped on it;
// - Esc; a row dropped on the editor; the upload label's count;
// - dark, and the storybook.
//
// Headless Chrome starts a real drag from the mouse (dragstart, dragover and
// dragend are the browser's), but doesn't deliver the drop reliably, and its
// drag interception doesn't fire (probed: probe-2d-step6b-drag.ts). So the
// drop event is sent in the page, carrying what the drag carries, while the
// real drag is held; releasing the mouse then ends the real drag. Its other
// quirks, worked around here:
// - it ignores Esc during a drag, and its next drag breaks (Esc ends a drag as
//   a release without a drop does: check 4, and the unit tests);
// - after a release without a drop, a drag that starts near where that one
//   ended gets only its first dragover (a reload doesn't help): a throwaway
//   drag goes first (unstick). The same row's drag works as the first in a
//   fresh browser (probe-2d-step6b-drag.ts --from=parts/gears.pathogen);
// - it sometimes delivers its own drop after the one sent here: the tree ends
//   the drag at the first drop, so the second does nothing.
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/verify-2d-step6b.ts

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';
const SHOTS = 'project-docs/modules/verify';
const MOVE_TYPE = 'application/x-pathogen-path';
const ownerId = Array.from(
  { length: 21 },
  () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)],
).join('');

const FILES: Record<string, string> = {
  'main.pathogen':
    'import { gear } from "./parts/gears.pathogen";\n\ndefine ViewBox(0, 0, 200, 100);\ngear(55, 50, 40);\n',
  'try-sizes.pathogen':
    'import { size } from "./parts/kit.pathogen";\n\ndefine ViewBox(0, 0, 200, 100);\ncircle(60, 50, size);\n',
  'demos/gears.pathogen':
    'import { gear } from "../parts/gears.pathogen";\n\ndefine ViewBox(0, 0, 200, 100);\ngear(100, 50, 30);\n',
  'parts/gears.pathogen': 'module;\n\nexport fn gear(cx, cy, r) {\n  circle(cx, cy, r);\n}\n',
  'parts/kit.pathogen': 'module;\n\nimport { gear } from "./gears.pathogen";\n\nexport const size = 12;\n',
  'parts/labels.pathogen': 'module;\n\nexport const label = "a";\n',
};
const ENTRY = ['main.pathogen', 'try-sizes.pathogen', 'demos/gears.pathogen'];

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
  // The tree with rows: the storybook page has the app's own (empty) tree too.
  window.__tree = () => {
    const all = [];
    const walk = (root) => {
      for (const el of root.querySelectorAll('*')) {
        if (el.localName === 'file-tree') all.push(el);
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(document);
    const rows = (t) => t.shadowRoot.querySelectorAll('[role="treeitem"]').length;
    return all.filter((t) => rows(t) > 1).sort((a, b) => rows(b) - rows(a))[0] ?? null;
  };
  // What the browser itself sends (trusted), and what this check sends: a log for failures.
  window.__dragLog = [];
  for (const type of ['dragstart', 'dragover', 'drop', 'dragend']) {
    document.addEventListener(type, (e) => {
      const last = window.__dragLog.at(-1);
      const row = e.composedPath()[0]?.closest?.('[role="treeitem"]')?.dataset.path ?? e.composedPath()[0]?.className ?? '?';
      const entry = (e.isTrusted ? '' : 'sent:') + type + '@' + row;
      if (type === 'dragover' && last === entry) return;
      window.__dragLog.push(entry);
    }, true);
  }
  window.__toasts = [];
  document.addEventListener('show-toast', (e) => window.__toasts.push({
    type: e.detail.type, title: e.detail.title, undo: !!e.detail.action,
  }));
`;

const TREE = `window.__tree().shadowRoot`;
const WV = `window.__find('workspace-view')`;

const storeGet = async (page: Page, key: string): Promise<unknown> =>
  page.evaluate(`import('/state/store.js').then((m) => m.store.get('${key}'))`);

const files = async (page: Page): Promise<Record<string, string>> =>
  (await storeGet(page, 'workspaceFiles')) as Record<string, string>;

const editorText = async (page: Page): Promise<string> =>
  page.evaluate(`${WV}.shadowRoot.querySelector('code-editor-pane')._editor.state.doc.toString()`) as Promise<string>;

const lastToast = async (page: Page): Promise<{ type: string; title: string; undo: boolean } | null> =>
  page.evaluate(`window.__toasts.at(-1) ?? null`) as never;

interface Point {
  x: number;
  y: number;
}

/** A point on a row: on its name, left of the ⋮. */
const rowPoint = async (page: Page, path: string): Promise<Point> => {
  const r = (await page.evaluate(`(() => {
    const el = ${TREE}.querySelector('[data-path="${path}"]');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.left + 60, y: b.top + b.height / 2 };
  })()`)) as Point | null;
  if (!r) throw new Error(`no row ${path}`);
  return r;
};

/** Empty space in the tree, below the rows: the top of the workspace. */
const blankPoint = async (page: Page): Promise<Point> =>
  page.evaluate(`(() => {
    const list = ${TREE}.querySelector('.list').getBoundingClientRect();
    return { x: list.left + 60, y: list.bottom - 12 };
  })()`) as Promise<Point>;

/** Press on a row and move a little: the browser starts the drag. */
async function startDrag(page: Page, path: string): Promise<void> {
  const at = await rowPoint(page, path);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 4, at.y + 6, { steps: 3 });
  await pause(100);
}

async function dragTo(page: Page, to: Point): Promise<void> {
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await pause(300);
}

interface DragState {
  lit: string[];
  top: boolean;
  label: string | null;
  refused: boolean;
  dragging: string[];
}

const dragState = async (page: Page): Promise<DragState> =>
  page.evaluate(`(() => {
    const root = ${TREE};
    const label = root.querySelector('.drop-label');
    return {
      lit: [...root.querySelectorAll('.row.drop')].map((r) => r.dataset.path),
      top: root.querySelector('.list').classList.contains('drop-top'),
      label: label.hidden ? null : label.textContent,
      refused: label.classList.contains('refused'),
      dragging: [...root.querySelectorAll('.row.dragging')].map((r) => r.dataset.path),
    };
  })()`) as Promise<DragState>;

/** The drop, sent in the page where the pointer is (see the header), then the mouse released. */
async function drop(page: Page, at: Point, path: string, onEditor = false): Promise<void> {
  await page.evaluate(`(() => {
    const target = ${onEditor ? `${WV}.shadowRoot.querySelector('code-editor-pane').shadowRoot.querySelector('.cm-content')` : `${TREE}.elementFromPoint(${at.x}, ${at.y})`};
    const data = new DataTransfer();
    data.setData('${MOVE_TYPE}', ${JSON.stringify(path)});
    target.dispatchEvent(new DragEvent('drop', {
      bubbles: true, composed: true, cancelable: true, dataTransfer: data, clientX: ${at.x}, clientY: ${at.y},
    }));
  })()`);
  await page.mouse.up();
  await pause(400);
}

const focusedRow = async (page: Page): Promise<string | null> =>
  page.evaluate(`${TREE}.activeElement?.dataset?.path ?? null`) as Promise<string | null>;

const expanded = async (page: Page, path: string): Promise<string | null> =>
  page.evaluate(`${TREE}.querySelector('[data-path="${path}"]')?.getAttribute('aria-expanded') ?? null`) as Promise<
    string | null
  >;

/** The last toast's Undo. */
async function undo(page: Page): Promise<void> {
  const last = await lastToast(page);
  if (!last?.undo) throw new Error(`the last toast has no Undo: ${JSON.stringify(last)}`);
  await page.evaluate(`window.__find('app-toast').shadowRoot.querySelector('.toast:last-child .action').click()`);
  await pause(400);
}

const sameFiles = (a: Record<string, string>, b: Record<string, string>): boolean =>
  JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

/**
 * After a drag released without a drop, headless Chrome sends only the first
 * dragover of the next drag (a reload doesn't help). The drag after that one is
 * fine, so a throwaway drag goes first, dropped where kit.pathogen already is.
 */
async function unstick(page: Page): Promise<void> {
  await startDrag(page, 'parts/kit.pathogen');
  const at = await rowPoint(page, 'parts/labels.pathogen');
  await dragTo(page, at);
  await drop(page, at, 'parts/kit.pathogen');
}

/** The trusted (browser-sent) dragovers so far, by the row they landed on. */
const dragoversOn = async (page: Page): Promise<string[]> =>
  page.evaluate(
    `window.__dragLog.filter((e) => e.startsWith('dragover@')).map((e) => e.slice('dragover@'.length))`,
  ) as Promise<string[]>;

async function open(page: Page, id: string): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the tree', async () =>
    page.evaluate(`!!window.__tree()?.shadowRoot.querySelector('[data-path="main.pathogen"]')`),
  );
  await waitFor('the editor', async () =>
    page.evaluate(`!!${WV}.shadowRoot.querySelector('code-editor-pane')._editor`),
  );
  await pause(600);
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
  page.on('console', (msg) => {
    if (msg.type() === 'error' && msg.text().includes('story')) pageErrors.push(msg.text());
  });
  await page.evaluateOnNewDocument(FIND);
  await page.evaluateOnNewDocument(
    (key: string, value: string) => {
      localStorage.setItem(key, value);
      if (!localStorage.getItem('pathogen-theme')) localStorage.setItem('pathogen-theme', 'light');
    },
    ANON_KEY,
    ownerId,
  );
  const created = await api('POST', '/workspace', {
    name: '6b dragging',
    files: Object.fromEntries(Object.entries(FILES).map(([p, text]) => [p, { text }])),
    entryPoints: ENTRY,
  });
  const id = created.id as string;
  made.push(id);

  // 1. kit.pathogen dragged onto demos/: the row dims, demos/ lights, the label counts the files.
  await open(page, id);
  const editorBefore = await editorText(page);
  await startDrag(page, 'parts/kit.pathogen');
  await dragTo(page, await rowPoint(page, 'demos'));
  let s = await dragState(page);
  check(
    'a real drag: kit.pathogen dims, demos/ lights, the label "Move to demos/ · updates the imports in 2 files"',
    JSON.stringify(s.lit) === '["demos"]' &&
      s.label === 'Move to demos/ · updates the imports in 2 files' &&
      !s.refused &&
      JSON.stringify(s.dragging) === '["parts/kit.pathogen"]',
    s,
  );
  await page.screenshot({ path: `${SHOTS}/2d-step6b-drag-light.png` });

  // 2. Dropped: it moves, the imports follow, the toast with Undo, the row has the keyboard; the drag's end undims.
  await drop(page, await rowPoint(page, 'demos'), 'parts/kit.pathogen');
  let f = await files(page);
  s = await dragState(page);
  let toast = await lastToast(page);
  check(
    'dropped: demos/kit.pathogen, its own import and try-sizes’ updated; the toast says so, with Undo',
    'demos/kit.pathogen' in f &&
      !('parts/kit.pathogen' in f) &&
      f['demos/kit.pathogen'].includes('import { gear } from "../parts/gears.pathogen";') &&
      f['try-sizes.pathogen'].includes('import { size } from "./demos/kit.pathogen";') &&
      toast?.title ===
        'Moved parts/kit.pathogen to demos/, and updated the imports in demos/kit.pathogen and try-sizes.pathogen.' &&
      toast.undo,
    { toast, files: Object.keys(f), kit: f['demos/kit.pathogen'], sizes: f['try-sizes.pathogen'] },
  );
  check(
    'the moved row has the keyboard; the lights and the label are gone; no row dimmed; the editor unchanged',
    (await focusedRow(page)) === 'demos/kit.pathogen' &&
      s.lit.length === 0 &&
      s.label === null &&
      s.dragging.length === 0 &&
      (await editorText(page)) === editorBefore,
    { focused: await focusedRow(page), s },
  );
  const saved = await waitFor(
    'the move saved',
    async () => {
      const w = await api('GET', `/workspace/${id}`);
      return 'demos/kit.pathogen' in ((w.files as object) ?? {}) ? w : null;
    },
    45_000,
  );
  check('the server holds the move', saved !== null && !('parts/kit.pathogen' in ((saved.files as object) ?? {})));

  // 3. The toast's Undo (its own move: the toast stays 9 seconds, and the save above takes longer).
  await startDrag(page, 'demos/kit.pathogen');
  await dragTo(page, await rowPoint(page, 'parts'));
  await drop(page, await rowPoint(page, 'parts'), 'demos/kit.pathogen');
  // (Back in parts/, kit's import stays ../parts/gears.pathogen: it still reaches the same file.)
  let before = await files(page);
  await startDrag(page, 'parts/kit.pathogen');
  await dragTo(page, await rowPoint(page, 'demos'));
  await drop(page, await rowPoint(page, 'demos'), 'parts/kit.pathogen');
  const movedAgain = 'demos/kit.pathogen' in (await files(page));
  await undo(page);
  f = await files(page);
  check('the toast’s Undo puts kit.pathogen and the imports back as they were', movedAgain && sameFiles(f, before), {
    movedAgain,
    toast: await lastToast(page),
    kit: f['parts/kit.pathogen'],
    sizes: f['try-sizes.pathogen'],
  });

  // 4. Over the folder it's in already: nothing lights; released (no drop), nothing moves and the row undims.
  await page.evaluate('window.__dragLog = []');
  await startDrag(page, 'parts/kit.pathogen');
  await dragTo(page, await rowPoint(page, 'parts/gears.pathogen'));
  const home = await dragState(page);
  await dragTo(page, await rowPoint(page, 'parts'));
  const homeFolder = await dragState(page);
  await page.mouse.up();
  await pause(400);
  s = await dragState(page);
  const overRows = await dragoversOn(page);
  check(
    'over the folder it’s in (its row, a row in it): nothing lights, no label; released there, nothing moves, the row undims',
    // The browser's dragovers reached both rows (a drag that froze would pass the rest).
    overRows.includes('parts/gears.pathogen') &&
      overRows.includes('parts') &&
      home.lit.length === 0 &&
      !home.top &&
      home.label === null &&
      homeFolder.lit.length === 0 &&
      homeFolder.label === null &&
      s.dragging.length === 0 &&
      'parts/kit.pathogen' in (await files(page)),
    { home, homeFolder, s, overRows },
  );
  await unstick(page);

  // 5. (Esc: headless Chrome doesn't hear a key during a drag, and its drag breaks after one.
  // Esc ends a drag the way a release without a drop does (check 4): dragend, no drop. The
  // unit tests send that dragend: tests/playground-file-tree.test.ts, "Esc (…)".)

  // 6. Refused: demos/gears.pathogen over parts/ (which has a gears.pathogen).
  await page.evaluate('window.__dragLog = []');
  await startDrag(page, 'demos/gears.pathogen');
  await dragTo(page, await rowPoint(page, 'parts'));
  s = await dragState(page);
  check(
    'where it can’t go: nothing lights, and the label says why ("parts/ already has gears.pathogen.")',
    s.lit.length === 0 && s.label === 'parts/ already has gears.pathogen.' && s.refused,
    { s, log: await page.evaluate('window.__dragLog') },
  );
  await page.screenshot({ path: `${SHOTS}/2d-step6b-refused-light.png` });
  await drop(page, await rowPoint(page, 'parts'), 'demos/gears.pathogen');
  f = await files(page);
  check(
    'dropped there anyway: nothing moves',
    f['parts/gears.pathogen'] === FILES['parts/gears.pathogen'] &&
      f['demos/gears.pathogen'] === FILES['demos/gears.pathogen'],
    Object.keys(f),
  );

  // 7. A folder: parts/ into demos/; not into itself.
  before = await files(page);
  await startDrag(page, 'parts');
  await dragTo(page, await rowPoint(page, 'parts/labels.pathogen'));
  const intoItself = await dragState(page);
  await dragTo(page, await rowPoint(page, 'demos'));
  s = await dragState(page);
  check(
    'a folder: over a row inside it nothing lights; over demos/ the label counts the files whose imports change',
    intoItself.lit.length === 0 &&
      intoItself.label === null &&
      JSON.stringify(s.lit) === '["demos"]' &&
      // main, try-sizes and demos/gears; kit's ./gears import moves with it, unchanged.
      s.label === 'Move to demos/ · updates the imports in 3 files' &&
      JSON.stringify(s.dragging) === '["parts"]',
    { intoItself, s },
  );
  await drop(page, await rowPoint(page, 'demos'), 'parts');
  f = await files(page);
  check(
    'dropped: parts/ is in demos/, with every file, and the imports that name them follow',
    ['demos/parts/gears.pathogen', 'demos/parts/kit.pathogen', 'demos/parts/labels.pathogen'].every((p) => p in f) &&
      f['main.pathogen'].includes('"./demos/parts/gears.pathogen"') &&
      f['demos/gears.pathogen'].includes('"./parts/gears.pathogen"') &&
      (await focusedRow(page)) === 'demos/parts',
    { files: Object.keys(f), focused: await focusedRow(page) },
  );
  await undo(page);
  f = await files(page);
  check('and Undo puts parts/ back, with the imports as they were', sameFiles(f, before), Object.keys(f));

  // 8. To the top: demos/gears.pathogen dropped on empty space.
  before = await files(page);
  await page.evaluate('window.__dragLog = []');
  await startDrag(page, 'demos/gears.pathogen');
  await dragTo(page, await blankPoint(page));
  s = await dragState(page);
  check(
    'over empty space: the whole list lights, "Move to the top · updates the imports in 1 file"',
    s.top && s.lit.length === 0 && s.label === 'Move to the top · updates the imports in 1 file',
    s,
  );
  await drop(page, await blankPoint(page), 'demos/gears.pathogen');
  f = await files(page);
  check(
    'dropped: gears.pathogen at the top, its import updated, its place in the program list kept; demos/ stays, empty',
    f['gears.pathogen']?.includes('import { gear } from "./parts/gears.pathogen";') === true &&
      JSON.stringify(await storeGet(page, 'workspaceEntryPoints')) ===
        JSON.stringify(['main.pathogen', 'try-sizes.pathogen', 'gears.pathogen']) &&
      ((await storeGet(page, 'workspaceFolders')) as string[]).includes('demos'),
    { files: Object.keys(f), entry: await storeGet(page, 'workspaceEntryPoints'), toast: await lastToast(page) },
  );
  // Headless Chrome delivered its own drop here too, after the one sent: the tree ignored it.
  check(
    'a second drop in the same drag moves nothing (the last toast is the move’s, with Undo)',
    (await lastToast(page))?.undo === true,
    { toast: await lastToast(page), log: await page.evaluate('window.__dragLog') },
  );
  await undo(page);
  check('and Undo puts it back in demos/', sameFiles(await files(page), before));

  // 9. A folded folder opens when something is dropped on it.
  await page.evaluate(`${TREE}.querySelector('[data-path="demos"]').click()`);
  await pause(200);
  const folded = await expanded(page, 'demos');
  await startDrag(page, 'parts/labels.pathogen');
  await dragTo(page, await rowPoint(page, 'demos'));
  await drop(page, await rowPoint(page, 'demos'), 'parts/labels.pathogen');
  check(
    'dropped on a folded folder: it opens, and the moved row has the keyboard',
    folded === 'false' &&
      (await expanded(page, 'demos')) === 'true' &&
      (await focusedRow(page)) === 'demos/labels.pathogen',
    { folded, now: await expanded(page, 'demos'), focused: await focusedRow(page) },
  );
  await undo(page);

  // 10. A row dropped on the editor: nothing pasted, nothing moved.
  const editorAt = (await page.evaluate(`(() => {
    const b = ${WV}.shadowRoot.querySelector('code-editor-pane').getBoundingClientRect();
    return { x: b.left + 200, y: b.top + 120 };
  })()`)) as Point;
  const textBefore = await editorText(page);
  await startDrag(page, 'parts/kit.pathogen');
  await dragTo(page, editorAt);
  await drop(page, editorAt, 'parts/kit.pathogen', true);
  check(
    'a row dropped on the editor: nothing is pasted, nothing moves',
    (await editorText(page)) === textBefore && 'parts/kit.pathogen' in (await files(page)),
    { text: (await editorText(page)).slice(0, 200) },
  );

  // 11. The upload label's count (your answer, 2026-11-13): files dragged from the computer.
  const counted = (await page.evaluate(`(() => {
    const row = ${TREE}.querySelector('[data-path="parts/kit.pathogen"]');
    const b = row.getBoundingClientRect();
    const say = (n) => {
      const data = new DataTransfer();
      for (let i = 0; i < n; i++) data.items.add(new File(['M 0 0'], 'f' + i + '.pathogen'));
      row.dispatchEvent(new DragEvent('dragover', {
        bubbles: true, composed: true, cancelable: true, dataTransfer: data, clientX: b.left + 60, clientY: b.top + 8,
      }));
      return ${TREE}.querySelector('.drop-label').textContent;
    };
    const out = [say(2), say(1)];
    ${TREE}.querySelector('.drop-label').hidden = true;
    ${TREE}.querySelector('.list').dispatchEvent(new DragEvent('dragleave', { bubbles: true, composed: true }));
    return out;
  })()`)) as string[];
  check(
    'files dragged from the computer: "Drop 2 items to add to parts/", "Drop 1 item to add to parts/"',
    JSON.stringify(counted) === JSON.stringify(['Drop 2 items to add to parts/', 'Drop 1 item to add to parts/']),
    counted,
  );

  // 12. Dark.
  await setTheme(page, 'dark');
  await open(page, id);
  await startDrag(page, 'parts/kit.pathogen');
  await dragTo(page, await rowPoint(page, 'demos'));
  await page.screenshot({ path: `${SHOTS}/2d-step6b-drag-dark.png` });
  await dragTo(page, await rowPoint(page, 'parts/gears.pathogen'));
  await page.mouse.up();
  await pause(300);
  await unstick(page);
  await startDrag(page, 'demos/gears.pathogen');
  await dragTo(page, await rowPoint(page, 'parts'));
  const darkRefused = await dragState(page);
  await page.screenshot({ path: `${SHOTS}/2d-step6b-refused-dark.png` });
  await page.mouse.up();
  await pause(300);
  check('dark: the refused label shows', darkRefused.refused && darkRefused.label !== null, darkRefused);
  await setTheme(page, 'light');

  // 13. The storybook: the two drag stories.
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    const seen: DragState[] = [];
    for (const story of ['Dragging a file', 'Dragging where it can’t go']) {
      await page.goto(`${PAGES_URL}/storybook/file-tree`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await waitFor('the story', async () => page.evaluate(`!!window.__tree()`));
      const tabs = (await page.evaluate(`(() => {
        const tabs = [...window.__find('.story-tab').parentElement.querySelectorAll('.story-tab')];
        tabs.find((b) => b.textContent.includes(${JSON.stringify(story)}))?.click();
        return tabs.map((b) => b.textContent.trim());
      })()`)) as string[];
      if (!tabs.some((t) => t.includes(story))) console.log(`  (no story tab "${story}": ${JSON.stringify(tabs)})`);
      await pause(600);
      seen.push(await dragState(page));
      await page.screenshot({
        path: `${SHOTS}/2d-step6b-story-${story.startsWith('Dragging a') ? 'drag' : 'refused'}-${theme}.png`,
      });
    }
    check(
      `the storybook: "Dragging a file" lights demos/ with its label; "Dragging where it can’t go" says why (${theme})`,
      JSON.stringify(seen[0].lit) === '["demos"]' &&
        seen[0].label === 'Move to demos/ · updates the imports in 1 file' &&
        JSON.stringify(seen[0].dragging) === '["parts/kit.pathogen"]' &&
        seen[1].lit.length === 0 &&
        seen[1].refused &&
        seen[1].label === 'demos/ already has gears.pathogen.',
      seen,
    );
  }

  check('no page errors', pageErrors.length === 0, pageErrors);
} finally {
  for (const id of made) await api('DELETE', `/workspace/${id}`).catch(() => undefined);
  await browser.close();
}
console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

// Phase 2d, step 9a (note 52; mockup v7 screens K and X, v11 state 6;
// docs/workspace-files.md "The main"), in the served playground:
// - the ⋮ menu has no Copy URL; Format Document says it formats the file in
//   the editor; Copy Code's tooltip names that file;
// - deleting the last program: the status reads "No programs" and says why on
//   hover; the preview is blank, keeping only the inspector toggle; Export,
//   Snapshot and Set Thumbnail wait and say why (Copy SVG doesn't);
//   Ctrl/Cmd+Shift+E says why and opens nothing;
// - after a reload, the same;
// - the listing marks it, and the Workspaces page labels its card;
// - a new program brings everything back;
// - deleting the last program while its compile is still running: the
//   compile is dropped, and its drawing never lands.
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/verify-2d-step9a.ts

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

const MAIN = 'define ViewBox(0, 0, 200, 100);\ncircle(100, 50, 40);\n';
// Long enough to still be compiling while the tree's Delete… is answered.
const SLOW_MAIN = [
  'define ViewBox(0, 0, 200, 100);',
  'let total = 0;',
  'for (k in 0..<12) {',
  '  for (i in 0..<3000) {',
  '    for (j in 0..<1000) {',
  '      total = total + j;',
  '    }',
  '  }',
  '}',
  'circle(100, 50, 40);',
  '',
].join('\n');
const GEARS = 'module;\n\nexport fn gear(center, radius) {\n  circle(center.x, center.y, radius);\n}\n';

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 1200)}`}`);
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

async function create(name: string, files: Record<string, string>, entryPoints: string[]): Promise<string> {
  const created = (await api('POST', '/workspace', {
    name,
    files: Object.fromEntries(Object.entries(files).map(([p, text]) => [p, { text }])),
    entryPoints,
  })) as { id: string };
  return created.id;
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
  window.__pane = () => window.__find('svg-preview-pane');
`;

const storeGet = async (page: Page, key: string): Promise<unknown> =>
  page.evaluate(`import('/state/store.js').then((m) => m.store.get('${key}'))`);

const drawn = async (page: Page): Promise<string> =>
  page.evaluate(`(() => {
    const doc = window.__pane().shadowRoot.querySelector('iframe')?.contentDocument;
    return [...(doc?.querySelectorAll('#preview-layers path') ?? [])].map((p) => p.getAttribute('d')).join(' ');
  })()`) as Promise<string>;

/** A real click at an element's centre: `root` is an expression for a shadow root. */
async function click(page: Page, root: string, selector: string): Promise<void> {
  const at = (await page.evaluate(`(() => {
    const el = (${root}).querySelector('${selector}');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`)) as { x: number; y: number } | null;
  if (!at) throw new Error(`nothing at ${selector}`);
  await page.mouse.click(at.x, at.y);
  await pause(300);
}

/** Delete a file through its row's ⋮ and the confirmation. */
async function deleteFile(page: Page, path: string, before?: () => Promise<void>): Promise<void> {
  const row = (await page.evaluate(`(() => {
    const r = window.__tree().querySelector('[role="treeitem"][data-path="${path}"]').getBoundingClientRect();
    return { x: r.left + 20, y: r.top + r.height / 2 };
  })()`)) as { x: number; y: number };
  await page.mouse.move(row.x, row.y);
  await pause(100);
  await click(page, 'window.__tree()', `[role="treeitem"][data-path="${path}"] .row-menu`);
  await click(page, 'window.__tree()', '[role="menuitem"][data-action="delete"]');
  if (before) await before();
  await page.evaluate(`document.querySelector('confirm-dialog').shadowRoot.querySelector('.confirm').click()`);
}

/** The menu's items: action, disabled, the line under the name. */
async function menu(page: Page): Promise<{ action: string; disabled: boolean; why: string | null }[]> {
  await click(page, 'window.__crumb()', '.menu-btn');
  const open = (await page.evaluate(
    `window.__crumb().querySelector('.menu-dropdown').classList.contains('open')`,
  )) as boolean;
  if (!open) {
    const over = await page.evaluate(`(() => {
      const r = window.__crumb().querySelector('.menu-btn').getBoundingClientRect();
      let el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      while (el?.shadowRoot) {
        const inner = el.shadowRoot.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!inner || inner === el) break;
        el = inner;
      }
      return { tag: el?.tagName, cls: el?.className, text: el?.textContent?.slice(0, 80) };
    })()`);
    throw new Error(`the ⋮ menu didn’t open; at its button: ${JSON.stringify(over)}`);
  }
  const items =
    (await page.evaluate(`[...window.__crumb().querySelectorAll('.menu-dropdown [data-action]')].map((b) => ({
    action: b.dataset.action,
    disabled: b.disabled,
    why: b.querySelector('small')?.textContent ?? null,
  }))`)) as { action: string; disabled: boolean; why: string | null }[];
  return items;
}

const menuOpen = async (page: Page): Promise<boolean> =>
  page.evaluate(`window.__crumb().querySelector('.menu-dropdown').classList.contains('open')`) as Promise<boolean>;

/** Escape closes the menu; where it doesn't, that's said, and the button closes it. */
const escapeMisses: string[] = [];
async function closeMenu(page: Page, where: string): Promise<void> {
  await page.keyboard.press('Escape');
  await pause(200);
  if (await menuOpen(page)) {
    escapeMisses.push(where);
    await click(page, 'window.__crumb()', '.menu-btn');
  }
}

/** Dismiss every message: one sits over the ⋮ button. */
async function dismissToasts(page: Page): Promise<void> {
  await page.evaluate(
    `[...(window.__find('app-toast')?.shadowRoot?.querySelectorAll('.dismiss') ?? [])].forEach((b) => b.click())`,
  );
  await pause(400);
}

/** The empty state, read off the page. */
async function emptyState(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(`(() => {
    const pane = window.__pane();
    const root = pane.shadowRoot;
    const shown = (sel) => {
      const el = root.querySelector(sel);
      return !!el && getComputedStyle(el).display !== 'none';
    };
    const status = window.__crumb().querySelector('#compilation-status');
    const snap = window.__crumb().querySelector('#snapshot-btn');
    return {
      paneClass: pane.classList.contains('no-programs'),
      zoomAndChip: shown('#bottom-group'),
      fullscreen: shown('#fullscreen-toggle'),
      inspector: shown('#inspector-open-btn'),
      surface: getComputedStyle(root.querySelector('#preview-container')).visibility,
      status: status?.textContent ?? null,
      statusTitle: status?.title ?? null,
      snapshot: snap ? [snap.disabled, snap.title] : null,
    };
  })()`) as Promise<Record<string, unknown>>;
}

const toastText = async (page: Page): Promise<string> =>
  page.evaluate(`window.__find('app-toast')?.shadowRoot?.textContent ?? ''`) as Promise<string>;

const made: string[] = [];
const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1320, height: 860 } });
try {
  const page = await browser.newPage();
  page.on('dialog', (d) => void d.accept());
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  const consoleLines: string[] = [];
  page.on('console', (msg) => consoleLines.push(msg.text()));
  await page.evaluateOnNewDocument(FIND);
  await page.evaluateOnNewDocument(
    (key: string, value: string) => {
      localStorage.setItem(key, value);
      if (!localStorage.getItem('pathogen-theme')) localStorage.setItem('pathogen-theme', 'light');
    },
    ANON_KEY,
    ownerId,
  );

  const id = await create('9a no programs', { 'main.pathogen': MAIN, 'parts/gears.pathogen': GEARS }, [
    'main.pathogen',
  ]);
  made.push(id);
  await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the drawing', async () => ((await drawn(page)).length > 0 ? true : null));
  await waitFor('the tree', async () =>
    page.evaluate(`!!window.__tree()?.querySelector('[data-path="main.pathogen"]')`),
  );
  await pause(500);

  // 1. The menu (screen K): no Copy URL; Format Document's line; Copy Code's tooltip.
  const copyTitle = (await page.evaluate(`window.__crumb().querySelector('#copy-code').title`)) as string;
  check(
    'Copy Code’s tooltip names the file in the editor',
    copyTitle === 'Copy the code of main.pathogen, the file in the editor',
    copyTitle,
  );
  let items = await menu(page);
  await page.screenshot({ path: `${SHOTS}/2d-step9a-menu-light.png` });
  const byAction = (action: string) => items.find((i) => i.action === action);
  check(
    'the ⋮ menu: no Copy URL; Format Document says "The file in the editor"; Export ready',
    !byAction('copy-url') &&
      byAction('format-document')?.why === 'The file in the editor' &&
      byAction('export')?.disabled === false,
    items,
  );
  await closeMenu(page, 'with a program');

  // 2. Delete the last program.
  await deleteFile(page, 'main.pathogen');
  await waitFor('no programs', async () => (await storeGet(page, 'compilationStatus')) === 'no-programs');
  await pause(400);
  let s = await emptyState(page);
  check(
    'the status reads "No programs", and says why on hover',
    s.status === 'No programs' &&
      s.statusTitle === 'Nothing draws: the workspace has no program. Add one with the + in the Files header.',
    s,
  );
  check(
    'the preview is blank: no zoom, no chip, no fullscreen button, the drawing’s surface hidden; the inspector toggle stays',
    s.paneClass === true &&
      s.zoomAndChip === false &&
      s.fullscreen === false &&
      s.inspector === true &&
      s.surface === 'hidden' &&
      (await drawn(page)) === '',
    s,
  );
  const leftover = {
    renderedCode: await storeGet(page, 'renderedCode'),
    logs: await storeGet(page, 'logs'),
    layers: await storeGet(page, 'layers'),
  };
  check(
    'nothing of the deleted program is kept: no drawing, layers, logs or code for a snapshot',
    leftover.renderedCode === null &&
      JSON.stringify(leftover.logs) === '[]' &&
      JSON.stringify(leftover.layers) === '[]',
    leftover,
  );
  check(
    'Snapshot waits: "Add a program first: there’s nothing to keep"',
    JSON.stringify(s.snapshot) === JSON.stringify([true, "Add a program first: there's nothing to keep"]),
    s.snapshot,
  );
  await page.screenshot({ path: `${SHOTS}/2d-step9a-no-programs-light.png` });
  await dismissToasts(page);
  items = await menu(page);
  await page.screenshot({ path: `${SHOTS}/2d-step9a-no-programs-menu-light.png` });
  check(
    'the menu: Export and Set Thumbnail wait and say why; Copy SVG doesn’t',
    byAction('export')?.disabled === true &&
      byAction('export')?.why === "Add a program first: there's nothing to export" &&
      byAction('set-thumbnail')?.why === 'Add a program first' &&
      byAction('copy-svg')?.disabled === false,
    items,
  );
  await closeMenu(page, 'with no programs');

  // 3. The shortcut says why, and opens nothing.
  await page.keyboard.down('Meta');
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyE');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Meta');
  await pause(400);
  const toast = await toastText(page);
  const exportOpen = (await page.evaluate(`!!window.__find('export-modal')?.classList.contains('open')`)) as boolean;
  check(
    'Cmd+Shift+E: a message says why, and Export doesn’t open',
    toast.includes('Export waits for a program') && !exportOpen,
    { toast: toast.slice(0, 200), exportOpen },
  );

  // 4. A reload: the same.
  await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor(
    'no programs after a reload',
    async () => (await storeGet(page, 'compilationStatus')) === 'no-programs',
  );
  await pause(500);
  s = await emptyState(page);
  items = await menu(page);
  check(
    'after a reload: "No programs", the blank preview, Export waiting',
    s.status === 'No programs' && s.paneClass === true && byAction('export')?.disabled === true,
    { s, items },
  );
  await closeMenu(page, 'after a reload');

  // 5. The listing marks it; the Workspaces page labels its card.
  const listing = (await api('GET', '/workspaces')) as { id: string; noPrograms?: boolean }[];
  check('the listing marks it noPrograms', listing.find((w) => w.id === id)?.noPrograms === true, listing);
  await page.goto(`${PAGES_URL}/workspaces`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const label = await waitFor('the card’s label', async () =>
    page.evaluate(
      `window.__find('landing-view')?.shadowRoot.querySelector('.workspace-item[data-id="${id}"] .no-programs-badge')?.textContent ?? null`,
    ),
  );
  await pause(300);
  await page.screenshot({ path: `${SHOTS}/2d-step9a-cards-light.png` });
  check('the Workspaces page labels its card "No programs"', label === 'No programs', label);

  // 6. A new program brings it all back.
  await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('no programs', async () => (await storeGet(page, 'compilationStatus')) === 'no-programs');
  await pause(400);
  await click(page, 'window.__tree()', '.add');
  await click(page, 'window.__tree()', '[role="menuitem"][data-action="new-program"]');
  await page.keyboard.type('first');
  await page.keyboard.press('Enter');
  await waitFor('a drawing again', async () => (await storeGet(page, 'renderedCode')) !== null);
  // The breadcrumb redraws on each save and status change; a click across two redraws is lost.
  await waitFor(
    'the save and the compile to settle',
    async () =>
      (await storeGet(page, 'saveStatus')) === 'saved' && (await storeGet(page, 'compilationStatus')) === 'idle',
  );
  s = await emptyState(page);
  await dismissToasts(page);
  items = await menu(page);
  check(
    'a new program: the preview’s chrome, Export and Snapshot are back',
    s.paneClass === false &&
      s.zoomAndChip === true &&
      s.surface === 'visible' &&
      (s.snapshot as [boolean, string])[0] === false &&
      byAction('export')?.disabled === false &&
      (await storeGet(page, 'noPrograms')) === false,
    { s, items },
  );
  await closeMenu(page, 'after a new program');

  // 7. Delete the last program while it is still compiling: its drawing never lands.
  await page.evaluate(`localStorage.setItem('pathogen-theme', 'dark')`);
  const slowId = await create('9a slow', { 'main.pathogen': SLOW_MAIN, 'parts/gears.pathogen': GEARS }, [
    'main.pathogen',
  ]);
  made.push(slowId);
  await page.goto(`${PAGES_URL}/workspace/${slowId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the tree', async () =>
    page.evaluate(`!!window.__tree()?.querySelector('[data-path="main.pathogen"]')`),
  );
  let statusAtDelete: unknown = null;
  let linesAtDelete = 0;
  await deleteFile(page, 'main.pathogen', async () => {
    statusAtDelete = await storeGet(page, 'compilationStatus');
    linesAtDelete = consoleLines.length;
  });
  await pause(8000);
  const slowDrawn = await drawn(page);
  const slowStatus = await storeGet(page, 'compilationStatus');
  const cancelled = consoleLines.slice(linesAtDelete).some((l) => l.includes('cancelled superseded compile'));
  check(
    'deleted mid-compile: the running compile is cancelled, and its drawing never lands',
    statusAtDelete === 'compiling' && cancelled && slowDrawn === '' && slowStatus === 'no-programs',
    { statusAtDelete, cancelled, slowDrawn: slowDrawn.slice(0, 80), slowStatus },
  );
  await page.screenshot({ path: `${SHOTS}/2d-step9a-no-programs-dark.png` });

  // 8. Taking `module;` out of the only module, leaving code that fails: a program again at once.
  //    The error shows over the preview, and nothing waits (the code review's case).
  await page.mouse.click(5, 5);
  const gearsRow = (await page.evaluate(`(() => {
    const r = window.__tree().querySelector('[role="treeitem"][data-path="parts/gears.pathogen"]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`)) as { x: number; y: number };
  await page.mouse.click(gearsRow.x, gearsRow.y);
  await waitFor('gears in the editor', async () => (await storeGet(page, 'openFile')) === 'parts/gears.pathogen');
  // The flag as the compile starts: the list's own refresh comes 300 ms after typing, too late for it.
  await page.evaluate(`import('/state/store.js').then(({ store }) => {
    window.__atCompile = null;
    store.subscribe('compilationStatus', () => {
      if (store.get('compilationStatus') === 'compiling' && window.__atCompile === null) {
        window.__atCompile = store.get('noPrograms');
      }
    });
  })`);
  await page.evaluate(`(() => {
    const view = window.__find('code-editor-pane')._editor;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'define ViewBox(0, 0, 200, 100);\\ncircle(60, nope, 10);\\n' } });
  })()`);
  await waitFor('the error', async () => (await storeGet(page, 'compilationStatus')) === 'error');
  await pause(500);
  s = await emptyState(page);
  const panelShown = (await page.evaluate(
    `window.__find('workspace-view').shadowRoot.querySelector('error-panel').classList.contains('visible')`,
  )) as boolean;
  const atCompile = await page.evaluate('window.__atCompile');
  check('a module made a program: what waited is back as its compile starts', atCompile === false, atCompile);
  check(
    'a module made a program that fails: the error shows, the preview is back, nothing says "No programs"',
    (await storeGet(page, 'noPrograms')) === false &&
      s.paneClass === false &&
      s.zoomAndChip === true &&
      s.status === 'Error' &&
      panelShown,
    { s, panelShown },
  );

  check('Escape closed the ⋮ menu every time', escapeMisses.length === 0, escapeMisses);
  check('no page errors', pageErrors.length === 0, pageErrors);
} finally {
  for (const id of made) await api('DELETE', `/workspace/${id}`).catch(() => undefined);
  await browser.close();
}
console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

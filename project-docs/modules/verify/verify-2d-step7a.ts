// Phase 2d, step 7a (note 52; mockup v6 screen E, state 4; docs/workspace-files.md
// "Errors in other files"): the error panel and opening a file at a line, in
// the served playground:
// - main calls gear() with 2 teeth, which fails in parts/gears.pathogen: the
//   panel names gears, "Line 5: …", then "called from main.pathogen line 4";
//   main is marked at the call;
// - a real click on "Line 5" opens gears at line 5, marked, with the keyboard
//   in the editor; the step opens main at line 4; the heading opens gears;
//   the keyboard (Enter on a focused link) does too;
// - a link to a file gone since opens nothing;
// - fixed: the panel goes; the console's entries are links (another file's
//   and the program's own line);
// - the main as a module of exports (it compiles): the panel's note, and its
//   link opens try-sizes' menu on Set as main; set, the note goes;
// - a scratch link: no file names, and "Line N" moves the cursor;
// - dark, and the storybook.
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/verify-2d-step7a.ts

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

const GEARS = [
  'module;',
  '',
  'export fn gear(center, radius, teeth) {',
  '  log(teeth);',
  "  assert(teeth >= 3, 'a gear needs at least 3 teeth');",
  '  circle(center.x, center.y, radius);',
  '}',
  '',
].join('\n');
const MAIN_BROKEN =
  'import { gear } from "./parts/gears.pathogen";\n\ndefine ViewBox(0, 0, 200, 100);\ngear(Point(55, 50), 40, 2);\n';
const MAIN_FIXED =
  'import { gear } from "./parts/gears.pathogen";\n\ndefine ViewBox(0, 0, 200, 100);\ngear(Point(55, 50), 40, 12);\nlog("drawn");\n';
const FILES: Record<string, string> = {
  'main.pathogen': MAIN_BROKEN,
  'try-sizes.pathogen': 'define ViewBox(0, 0, 200, 100);\ncircle(60, 50, 12);\n',
  'parts/gears.pathogen': GEARS,
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
  document.addEventListener('show-toast', (e) => window.__toasts.push({ title: e.detail.title, message: e.detail.message ?? null }));
  // Every element of a kind, inside shadow roots too (the storybook has two panels).
  window.__all = (name) => {
    const all = [];
    const walk = (root) => {
      for (const el of root.querySelectorAll('*')) {
        if (el.localName === name) all.push(el);
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(document);
    return all;
  };
`;

const WV = `window.__find('workspace-view')`;
const PANEL = `${WV}.shadowRoot.querySelector('error-panel').shadowRoot`;
const PANE = `${WV}.shadowRoot.querySelector('code-editor-pane')`;

interface PanelState {
  visible: boolean;
  headings: string[];
  errors: string[];
  links: string[];
}

const panelState = async (page: Page): Promise<PanelState> =>
  page.evaluate(`(() => {
    const host = ${WV}.shadowRoot.querySelector('error-panel');
    const root = host.shadowRoot;
    return {
      visible: host.classList.contains('visible'),
      headings: [...root.querySelectorAll('.who')].map((h) => h.textContent),
      // Each error's own words, then its steps, " | " between.
      errors: [...root.querySelectorAll('.error, .note')].map((e) =>
        [
          [...e.childNodes].filter((n) => !n.classList?.contains('step')).map((n) => n.textContent).join(''),
          ...[...e.querySelectorAll('.step')].map((s) => s.textContent),
        ].join(' | '),
      ),
      links: [...root.querySelectorAll('button.link')].map((b) => b.textContent),
    };
  })()`) as Promise<PanelState>;

interface EditorAt {
  open: string | null;
  line: number;
  column: number;
  marked: number[];
  focused: boolean;
}

/** The file in the editor, the cursor's line and column, the marked lines, and whether it has the keyboard. */
const editorAt = async (page: Page): Promise<EditorAt> =>
  page.evaluate(`(() => {
    const pane = ${PANE};
    const view = pane._editor;
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    const lines = [...pane.shadowRoot.querySelectorAll('.cm-content > .cm-line')];
    return {
      open: pane.activePath,
      line: line.number,
      column: head - line.from + 1,
      marked: lines.flatMap((l, i) => (l.classList.contains('cm-error-line') ? [i + 1] : [])),
      focused: view.hasFocus,
    };
  })()`) as Promise<EditorAt>;

/** A real click on the panel's link with this text. */
async function clickLink(page: Page, text: string, root = PANEL): Promise<void> {
  const at = (await page.evaluate(`(() => {
    const b = [...${root}.querySelectorAll('button')].find((x) => x.textContent === ${JSON.stringify(text)});
    if (!b) return null;
    b.scrollIntoView({ block: 'nearest' });
    const r = b.getBoundingClientRect();
    return { x: r.left + Math.min(12, r.width / 2), y: r.top + r.height / 2 };
  })()`)) as { x: number; y: number } | null;
  if (!at) throw new Error(`no link "${text}"`);
  await page.mouse.click(at.x, at.y);
  await pause(400);
}

/** Replace the open file's text, as typing would (the editor's own transaction). */
async function setText(page: Page, text: string): Promise<void> {
  await page.evaluate(`(() => {
    const view = ${PANE}._editor;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: ${JSON.stringify(text)} } });
  })()`);
}

async function openFile(page: Page, path: string): Promise<void> {
  await page.evaluate(
    `${WV}.shadowRoot.dispatchEvent(new CustomEvent('open-file', { detail: { path: ${JSON.stringify(path)} }, bubbles: true, composed: true }))`,
  );
  await waitFor(`${path} open`, async () => ((await editorAt(page)).open === path ? true : null));
}

async function open(page: Page, id: string): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the editor', async () => page.evaluate(`!!${PANE}?._editor`));
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
    name: '7a errors',
    files: Object.fromEntries(Object.entries(FILES).map(([p, text]) => [p, { text }])),
    entryPoints: ENTRY,
  });
  const id = created.id as string;
  made.push(id);

  // 1. The panel: gears' error, under its name, with the step back to main; main marked at the call.
  await open(page, id);
  let panel = await waitFor('the panel', async () => {
    const p = await panelState(page);
    return p.visible && p.headings.length > 0 ? p : null;
  });
  check(
    'the panel: "parts/gears.pathogen", then "Line 5: assertion failed: …", then "called from main.pathogen line 4"',
    JSON.stringify(panel?.headings) === '["parts/gears.pathogen"]' &&
      JSON.stringify(panel?.errors) ===
        JSON.stringify(['Line 5: assertion failed: a gear needs at least 3 teeth | called from main.pathogen line 4']) &&
      JSON.stringify(panel?.links) === JSON.stringify(['parts/gears.pathogen', 'Line 5', 'main.pathogen line 4']),
    panel,
  );
  let at = await editorAt(page);
  check('main, in the editor, is marked at the call (line 4)', at.open === 'main.pathogen' && JSON.stringify(at.marked) === '[4]', at);
  await page.screenshot({ path: `${SHOTS}/2d-step7a-panel-light.png` });
  const placed = async (): Promise<{ panel: number[]; editor: number[]; tree: number[] }> =>
    page.evaluate(`(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; };
      return {
        panel: box(${WV}.shadowRoot.querySelector('error-panel')),
        editor: box(${PANE}),
        tree: box(window.__find('file-tree')),
      };
    })()`) as Promise<{ panel: number[]; editor: number[]; tree: number[] }>;
  let where = await placed();
  check(
    'the panel sits over the editor, right of the tree (v6 screen E), 12 px in from each side',
    where.panel[0] === where.editor[0] + 12 && where.panel[1] === where.editor[1] - 12 && where.panel[0] > where.tree[1],
    where,
  );
  await page.evaluate(`import('/state/store.js').then((m) => m.store.set('filesOpen', false))`);
  await pause(400);
  where = await placed();
  check('with Files off, it follows the editor to the left edge', where.panel[0] === where.editor[0] + 12, where);
  await page.evaluate(`import('/state/store.js').then((m) => m.store.set('filesOpen', true))`);
  await pause(400);

  // 2. "Line 5": gears opens at line 5, marked, with the keyboard.
  await clickLink(page, 'Line 5');
  at = await editorAt(page);
  check(
    'a click on "Line 5" opens parts/gears.pathogen at line 5, col 3, marked there, with the keyboard in the editor',
    at.open === 'parts/gears.pathogen' && at.line === 5 && at.column === 3 && JSON.stringify(at.marked) === '[5]' && at.focused,
    at,
  );
  await page.screenshot({ path: `${SHOTS}/2d-step7a-opened-light.png` });
  panel = await panelState(page);
  check('the panel stays as it was', JSON.stringify(panel.headings) === '["parts/gears.pathogen"]', panel);

  // 3. The step back: main at line 4.
  await clickLink(page, 'main.pathogen line 4');
  at = await editorAt(page);
  check(
    '"called from main.pathogen line 4" opens main at line 4, marked',
    at.open === 'main.pathogen' && at.line === 4 && JSON.stringify(at.marked) === '[4]' && at.focused,
    at,
  );

  // 4. The heading; and the keyboard (Enter on a focused link).
  await clickLink(page, 'parts/gears.pathogen');
  at = await editorAt(page);
  check('the heading opens gears at its error’s line', at.open === 'parts/gears.pathogen' && at.line === 5, at);
  await openFile(page, 'main.pathogen');
  await page.evaluate(`[...${PANEL}.querySelectorAll('button')].find((b) => b.textContent === 'Line 5').focus()`);
  await page.keyboard.press('Enter');
  await pause(400);
  at = await editorAt(page);
  check('Enter on a focused link opens it too', at.open === 'parts/gears.pathogen' && at.line === 5 && at.focused, at);

  // 5. A file gone since: nothing opens.
  await page.evaluate(
    `${PANEL}.querySelector('button.link').dispatchEvent(new CustomEvent('open-file', { bubbles: true, composed: true, detail: { path: 'parts/gone.pathogen', line: 3, focusEditor: true } }))`,
  );
  await pause(300);
  at = await editorAt(page);
  const gone = (await page.evaluate('window.__toasts.at(-1) ?? null')) as { title: string; message: string } | null;
  check(
    'a link to a file gone since opens nothing, and a toast says why',
    at.open === 'parts/gears.pathogen' &&
      gone?.title === 'Couldn’t open it' &&
      gone.message === 'parts/gone.pathogen isn’t in the workspace now.',
    { at, gone },
  );

  // 5b. The chip shows try-sizes: main's errors go at once (not when try-sizes' compile is back),
  // and come back when main is shown again.
  await page.evaluate(
    `${WV}.shadowRoot.dispatchEvent(new CustomEvent('show-program', { detail: { path: 'try-sizes.pathogen' }, bubbles: true, composed: true }))`,
  );
  const atOnce = await panelState(page);
  await pause(800);
  await page.evaluate(
    `${WV}.shadowRoot.dispatchEvent(new CustomEvent('show-program', { detail: { path: 'main.pathogen' }, bubbles: true, composed: true }))`,
  );
  const back = await waitFor('main’s errors back', async () => {
    const p = await panelState(page);
    return p.headings.includes('parts/gears.pathogen') ? p : null;
  });
  check(
    'the chip shows try-sizes: main’s errors leave the panel at once; shown again, they come back',
    !atOnce.visible && back !== null,
    { atOnce, back },
  );

  // 6. Fixed: the panel goes; the console's places are links.
  await openFile(page, 'main.pathogen');
  await setText(page, MAIN_FIXED);
  panel = (await waitFor('the panel gone', async () => {
    const p = await panelState(page);
    return p.visible ? null : p;
  })) as PanelState;
  check('fixed: the panel goes', panel !== null && !panel.visible, panel);
  await page.evaluate(`${WV}.shadowRoot.querySelector('console-pane').open()`);
  await pause(300);
  const places = (await page.evaluate(
    `[...${WV}.shadowRoot.querySelector('console-pane').shadowRoot.querySelectorAll('log-entry')].map((e) => e.shadowRoot.querySelector('.line')?.tagName + ' ' + e.shadowRoot.querySelector('.line')?.textContent)`,
  )) as string[];
  check(
    'the console: "parts/gears.pathogen line 4:" and "Line 5:", each a button',
    JSON.stringify(places) === JSON.stringify(['BUTTON parts/gears.pathogen line 4:', 'BUTTON Line 5:']),
    places,
  );
  await page.screenshot({ path: `${SHOTS}/2d-step7a-console-light.png` });
  const consoleRoot = (i: number): string =>
    `${WV}.shadowRoot.querySelector('console-pane').shadowRoot.querySelectorAll('log-entry')[${i}].shadowRoot`;
  await clickLink(page, 'parts/gears.pathogen line 4:', consoleRoot(0));
  at = await editorAt(page);
  check('the console’s gears entry opens gears at line 4', at.open === 'parts/gears.pathogen' && at.line === 4, at);
  await clickLink(page, 'Line 5:', consoleRoot(1));
  at = await editorAt(page);
  check('the console’s own line opens the program shown (main) at line 5', at.open === 'main.pathogen' && at.line === 5, at);
  await page.evaluate(`${WV}.shadowRoot.querySelector('console-pane').close()`);

  // 7. The main as a module of exports: it compiles, and draws nothing; the panel's note says why.
  await setText(page, 'module;\n\nexport const size = 12;\n');
  panel = (await waitFor('the note', async () => {
    const p = await panelState(page);
    return p.headings.includes('The main') ? p : null;
  })) as PanelState;
  check(
    'the main a module: "The main", "A module can’t draw as the main. Take out module;, or set another program as main."',
    panel !== null &&
      JSON.stringify(panel.headings) === '["The main"]' &&
      JSON.stringify(panel.errors) ===
        JSON.stringify(["A module can't draw as the main. Take out module;, or set another program as main."]) &&
      JSON.stringify(panel.links) === '["set another program as main"]',
    panel,
  );
  const status = (await page.evaluate(`import('/state/store.js').then((m) => m.store.get('compilationStatus'))`)) as string;
  check('…while its compile worked (so a working compile doesn’t take the note away)', status !== 'error', status);
  await page.screenshot({ path: `${SHOTS}/2d-step7a-module-main-light.png` });
  await page.evaluate(`import('/state/store.js').then((m) => m.store.set('filesOpen', false))`);
  await pause(200);
  await clickLink(page, 'set another program as main');
  const menu = (await page.evaluate(`(() => {
    const tree = window.__find('file-tree');
    const root = tree.shadowRoot;
    const m = root.querySelector('[role="menu"]');
    return {
      treeOpen: tree.classList.contains('open'),
      menuOpen: !!m && !m.hidden,
      label: m?.getAttribute('aria-label') ?? null,
      focused: root.activeElement?.querySelector('.label')?.textContent ?? null,
    };
  })()`)) as { treeOpen: boolean; menuOpen: boolean; label: string | null; focused: string | null };
  check(
    'its link: Files shown, try-sizes’ menu open, the keyboard on Set as main',
    menu.treeOpen && menu.menuOpen && menu.label === 'try-sizes.pathogen' && menu.focused === 'Set as main',
    menu,
  );
  await page.screenshot({ path: `${SHOTS}/2d-step7a-set-main-light.png` });
  await page.keyboard.press('Enter');
  panel = (await waitFor('the note gone', async () => {
    const p = await panelState(page);
    return p.headings.includes('The main') ? null : p;
  }, 5000)) as PanelState;
  const entry = (await page.evaluate(`import('/state/store.js').then((m) => m.store.get('workspaceEntryPoints'))`)) as string[];
  check(
    'Set as main: try-sizes is the main, and the note goes',
    entry[0] === 'try-sizes.pathogen' && panel !== null && !panel.headings.includes('The main'),
    { entry, panel },
  );

  // 8. A scratch link: one file, no names; "Line 2" moves the cursor.
  const state = (await page.evaluate(
    `import('/utils/url-state.js').then((m) => m.encodeState({ code: 'define ViewBox(0, 0, 100, 100);\\nlet a = 1;\\n\\ncircle(a, nope, 3);\\n' }))`,
  )) as string;
  await page.goto(`${PAGES_URL}/workspace/scratch?state=${state}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the editor', async () => page.evaluate(`!!${PANE}?._editor`));
  panel = (await waitFor('the scratch error', async () => {
    const p = await panelState(page);
    return p.visible ? p : null;
  })) as PanelState;
  check(
    'a scratch link: no file’s name, "Line 4: Undefined variable: nope"',
    panel !== null &&
      panel.headings.length === 0 &&
      JSON.stringify(panel.errors) === '["Line 4: Undefined variable: nope"]',
    panel,
  );
  await clickLink(page, 'Line 4');
  at = await editorAt(page);
  check('…and "Line 4" moves the cursor to line 4, col 11', at.line === 4 && at.column === 11 && at.focused, at);

  // 8b. A plain message: a workspace that isn't there. It stays after the compile that follows.
  await page.goto(`${PAGES_URL}/workspace/no-such-workspace-7a`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const notFound = await waitFor('the message', async () => {
    const m = (await page.evaluate(`${WV}.shadowRoot.querySelector('error-panel').message`)) as string;
    return m.includes('not found') ? m : null;
  });
  await pause(2500);
  const still = (await page.evaluate(`${WV}.shadowRoot.querySelector('error-panel').message`)) as string;
  check('"Workspace not found" shows, and is still there a moment later', notFound !== null && still === notFound, {
    notFound,
    still,
  });

  // 9. Dark: the panel, in a workspace as it started.
  await setTheme(page, 'dark');
  const darkCreated = await api('POST', '/workspace', {
    name: '7a errors dark',
    files: Object.fromEntries(Object.entries(FILES).map(([p, text]) => [p, { text }])),
    entryPoints: ENTRY,
  });
  made.push(darkCreated.id as string);
  await open(page, darkCreated.id as string);
  await waitFor('the panel (dark)', async () => ((await panelState(page)).headings.length > 0 ? true : null));
  await pause(400);
  await page.screenshot({ path: `${SHOTS}/2d-step7a-panel-dark.png` });
  await setTheme(page, 'light');

  // 10. The storybook: the panel's three new stories.
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    await page.goto(`${PAGES_URL}/storybook/error-panel`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitFor('the story', async () => page.evaluate(`!!window.__find('.story-tab')`));
    const seen: string[][] = [];
    for (const story of ['An error in another file', 'Errors in two files', 'The main is a module']) {
      await page.evaluate(
        `[...window.__find('.story-tab').parentElement.querySelectorAll('.story-tab')].find((b) => b.textContent.includes(${JSON.stringify(story)}))?.click()`,
      );
      await pause(400);
      const headings = (await page.evaluate(
        `window.__all('error-panel').flatMap((p) => [...p.shadowRoot.querySelectorAll('.who')].map((h) => h.textContent))`,
      )) as string[];
      seen.push(headings);
      const slug = story.toLowerCase().replace(/[^a-z]+/g, '-');
      await page.screenshot({ path: `${SHOTS}/2d-step7a-story-${slug}-${theme}.png` });
    }
    check(
      `the storybook: the three panel stories (${theme})`,
      JSON.stringify(seen) ===
        JSON.stringify([['parts/gears.pathogen'], ['main.pathogen', 'parts/gears.pathogen'], ['main.pathogen', 'The main']]),
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

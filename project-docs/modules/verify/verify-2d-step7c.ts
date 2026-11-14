// Phase 2d, step 7c (note 52; mockup v6 screen G, state 5; docs/workspace-files.md
// "Errors in other files"): red dots in the file tree, in the served playground:
// - try-sizes (not shown) fails in parts/gears.pathogen: dots on both, from
//   the compile in the background; hovering says where; the preview is main's;
// - fixed: the dots go;
// - the main shown fails in its own code: a dot on main;
// - parts/gears.pathogen renamed while its dot shows: the dot goes with it;
// - parts/ folded: the folder takes the dot;
// - the main a module: its dot says so;
// - dark, and the storybook.
// (Typing: verify-2d-step5b.ts counts module; readings per keystroke.)
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/verify-2d-step7c.ts

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
  "  assert(teeth >= 3, 'a gear needs at least 3 teeth');",
  '  circle(center.x, center.y, radius);',
  '}',
  '',
].join('\n');
const MAIN = 'define ViewBox(0, 0, 200, 100);\ncircle(50, 50, 30);\n';
const TRY_BROKEN =
  'import { gear } from "./parts/gears.pathogen";\n\ndefine ViewBox(0, 0, 200, 100);\ngear(Point(60, 50), 30, 2);\n';
const TRY_FIXED =
  'import { gear } from "./parts/gears.pathogen";\n\ndefine ViewBox(0, 0, 200, 100);\ngear(Point(60, 50), 30, 12);\n';
const FILES: Record<string, string> = {
  'main.pathogen': MAIN,
  'try-sizes.pathogen': TRY_BROKEN,
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
  // The tree with the most rows (the storybook has the app's own too).
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
    return all.sort((a, b) => rows(b) - rows(a))[0] ?? null;
  };
`;

const WV = `window.__find('workspace-view')`;
const PANE = `${WV}.shadowRoot.querySelector('code-editor-pane')`;

/** Each row with a red dot, and what hovering its icon says. */
const dots = async (page: Page): Promise<Record<string, string>> =>
  page.evaluate(`Object.fromEntries(
    [...window.__tree().shadowRoot.querySelectorAll('.row.has-error')].map((r) => [r.dataset.path, r.querySelector('.icon').getAttribute('title')]),
  )`) as Promise<Record<string, string>>;

const waitDots = async (page: Page, what: string, want: (d: Record<string, string>) => boolean, ms = 20_000) =>
  waitFor(
    what,
    async () => {
      const d = await dots(page);
      return want(d) ? d : null;
    },
    ms,
  );

const storeGet = async (page: Page, key: string): Promise<unknown> =>
  page.evaluate(`import('/state/store.js').then((m) => m.store.get('${key}'))`);

async function openFile(page: Page, path: string): Promise<void> {
  await page.evaluate(
    `${WV}.shadowRoot.dispatchEvent(new CustomEvent('open-file', { detail: { path: ${JSON.stringify(path)} }, bubbles: true, composed: true }))`,
  );
  await waitFor(`${path} open`, async () => ((await page.evaluate(`${PANE}.activePath`)) === path ? true : null));
}

async function setText(page: Page, text: string): Promise<void> {
  await page.evaluate(`(() => {
    const view = ${PANE}._editor;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: ${JSON.stringify(text)} } });
  })()`);
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
  const create = async (name: string): Promise<string> => {
    const created = await api('POST', '/workspace', {
      name,
      files: Object.fromEntries(Object.entries(FILES).map(([p, text]) => [p, { text }])),
      entryPoints: ENTRY,
    });
    made.push(created.id as string);
    return created.id as string;
  };
  const id = await create('7c red dots');

  // 1. try-sizes, not shown, fails in gears: dots on both, from the compile in the background.
  await open(page, id);
  let d = await waitDots(page, 'the dots', (x) => Object.keys(x).length === 2);
  check(
    'try-sizes (not shown) fails in parts/gears.pathogen: a dot on each, saying where',
    d !== null &&
      d['try-sizes.pathogen'] === 'Error in parts/gears.pathogen line 4' &&
      d['parts/gears.pathogen'] === 'try-sizes.pathogen fails here, line 4',
    d,
  );
  const shown = (await storeGet(page, 'shownProgram')) as string | null;
  check(
    'the preview still shows main, and the panel has nothing',
    (shown ?? 'main.pathogen') === 'main.pathogen' &&
      !(await page.evaluate(`${WV}.shadowRoot.querySelector('error-panel').classList.contains('visible')`)),
    shown,
  );
  // The row's text ends with the reason, hidden from the eye: a screen reader reads it with the name.
  const spoken = (await page.evaluate(
    `window.__tree().shadowRoot.querySelector('[data-path="try-sizes.pathogen"] .err-note')?.textContent ?? null`,
  )) as string | null;
  check('the row says so to a screen reader', spoken === ', Error in parts/gears.pathogen line 4', spoken);
  await page.screenshot({ path: `${SHOTS}/2d-step7c-dots-light.png` });

  // 2. parts/gears.pathogen renamed while its dot shows: the dot goes with it at once.
  await page.evaluate(
    `${WV}.shadowRoot.dispatchEvent(new CustomEvent('rename-entry', { detail: { path: 'parts/gears.pathogen', name: 'cogs' }, bubbles: true, composed: true }))`,
  );
  d = await dots(page);
  check(
    'renamed to parts/cogs.pathogen: its dot goes with it, and try-sizes’ says the new name',
    d['parts/cogs.pathogen'] === 'try-sizes.pathogen fails here, line 4' &&
      d['try-sizes.pathogen'] === 'Error in parts/cogs.pathogen line 4' &&
      !('parts/gears.pathogen' in d),
    d,
  );

  // 3. parts/ folded: the folder takes the dot.
  await page.evaluate(`window.__tree().shadowRoot.querySelector('[data-path="parts"]').click()`);
  await pause(200);
  d = await dots(page);
  check(
    'parts/ folded: the folder takes a dot, "A file in it has an error"',
    d.parts === 'A file in it has an error',
    d,
  );
  await page.evaluate(`window.__tree().shadowRoot.querySelector('[data-path="parts"]').click()`);

  // 4. Fixed: the dots go.
  await openFile(page, 'try-sizes.pathogen');
  await setText(page, TRY_FIXED.replace('./parts/gears.pathogen', './parts/cogs.pathogen'));
  d = await waitDots(page, 'the dots gone', (x) => Object.keys(x).length === 0);
  check('try-sizes fixed: the dots go', d !== null, d);

  // 5. The main shown fails in its own code: a dot on main.
  await openFile(page, 'main.pathogen');
  await setText(page, 'define ViewBox(0, 0, 200, 100);\ncircle(50, nope, 30);\n');
  d = await waitDots(page, 'main’s dot', (x) => 'main.pathogen' in x);
  check(
    'the main shown fails in its own code: a dot on main, "Error in main.pathogen line 2"',
    d?.['main.pathogen'] === 'Error in main.pathogen line 2',
    d,
  );

  // 6. The main a module: its dot says so.
  await setText(page, 'module;\n\nexport const size = 12;\n');
  d = await waitDots(
    page,
    'the module main’s dot',
    (x) => x['main.pathogen'] === "A module now, so it can't draw as the main",
  );
  check('the main a module: its dot says "A module now, so it can’t draw as the main"', d !== null, d);
  await setText(page, MAIN);
  d = await waitDots(page, 'no dots', (x) => Object.keys(x).length === 0);
  check('module; out again: no dot', d !== null, d);

  // (Typing: verify-2d-step5b.ts counts module; readings per keystroke, with a control; the dots
  // read the cached programs-to-draw list, and it's run again with this step.)

  // 8. Dark.
  await setTheme(page, 'dark');
  const darkId = await create('7c red dots dark');
  await open(page, darkId);
  await waitDots(page, 'the dots (dark)', (x) => Object.keys(x).length === 2);
  await pause(300);
  await page.screenshot({ path: `${SHOTS}/2d-step7c-dots-dark.png` });
  await setTheme(page, 'light');

  // 9. The storybook's Red dots story.
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    await page.goto(`${PAGES_URL}/storybook/file-tree`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitFor('the story', async () => page.evaluate(`!!window.__find('.story-tab')`));
    await page.evaluate(
      `[...window.__find('.story-tab').parentElement.querySelectorAll('.story-tab')].find((b) => b.textContent.includes('Red dots'))?.click()`,
    );
    await pause(500);
    d = await dots(page);
    await page.screenshot({ path: `${SHOTS}/2d-step7c-story-${theme}.png` });
    check(
      `the storybook: "Red dots" marks try-sizes and parts/gears.pathogen (${theme})`,
      JSON.stringify(Object.keys(d).sort()) === JSON.stringify(['parts/gears.pathogen', 'try-sizes.pathogen']),
      d,
    );
  }

  check('no page errors', pageErrors.length === 0, pageErrors);
} finally {
  for (const id of made) await api('DELETE', `/workspace/${id}`).catch(() => undefined);
  await browser.close();
}
console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

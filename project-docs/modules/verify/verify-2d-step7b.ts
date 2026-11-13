// Phase 2d, step 7b (note 52; docs/workspace-files.md "Errors in other files"):
// Cmd+click on a name you imported opens the file it comes from, at its
// declaration, in the served playground. Real clicks with Meta held:
// - gear(…)'s call: parts/gears.pathogen at `fn gear`;
// - a namespace's member (g.size): at `size`;
// - the import's path: the file, at its top;
// - a name declared in main itself: the cursor jumps within main, as before;
// - a click without Cmd: nothing opens.
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/verify-2d-step7b.ts

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

const GEARS = 'module;\n\nexport fn gear(cx, cy, r) {\n  circle(cx, cy, r);\n}\n\nexport const size = 4;\n';
const MAIN =
  'import { gear } from "./parts/gears.pathogen";\nimport * as g from "./parts/gears.pathogen";\n\ndefine ViewBox(0, 0, 200, 100);\nlet here = 30;\ngear(here, 50, 20);\ncircle(120, 50, g.size * 5);\n';
const FILES: Record<string, string> = { 'main.pathogen': MAIN, 'parts/gears.pathogen': GEARS };

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
`;

const WV = `window.__find('workspace-view')`;
const PANE = `${WV}.shadowRoot.querySelector('code-editor-pane')`;

interface EditorAt {
  open: string | null;
  line: number;
  column: number;
  focused: boolean;
}

const editorAt = async (page: Page): Promise<EditorAt> =>
  page.evaluate(`(() => {
    const pane = ${PANE};
    const view = pane._editor;
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    return { open: pane.activePath, line: line.number, column: head - line.from + 1, focused: view.hasFocus };
  })()`) as Promise<EditorAt>;

/** Where `needle` (its `nth` occurrence, plus `into` characters) is on screen in the editor. */
async function spotOf(page: Page, needle: string, into = 1, nth = 0): Promise<{ x: number; y: number }> {
  const at = (await page.evaluate(`(() => {
    const view = ${PANE}._editor;
    const text = view.state.doc.toString();
    let from = -1;
    for (let i = 0; i <= ${nth}; i++) from = text.indexOf(${JSON.stringify(needle)}, from + 1);
    if (from < 0) return null;
    const c = view.coordsAtPos(from + ${into});
    return c ? { x: c.left + 1, y: (c.top + c.bottom) / 2 } : null;
  })()`)) as { x: number; y: number } | null;
  if (!at) throw new Error(`no "${needle}" in the editor`);
  return at;
}

/** A real click there, with Cmd held (or not). */
async function clickAt(page: Page, at: { x: number; y: number }, cmd: boolean): Promise<void> {
  if (cmd) await page.keyboard.down('Meta');
  await page.mouse.click(at.x, at.y);
  if (cmd) await page.keyboard.up('Meta');
  await pause(400);
}

async function openMain(page: Page): Promise<void> {
  await page.evaluate(
    `${WV}.shadowRoot.dispatchEvent(new CustomEvent('open-file', { detail: { path: 'main.pathogen' }, bubbles: true, composed: true }))`,
  );
  await waitFor('main open', async () => ((await editorAt(page)).open === 'main.pathogen' ? true : null));
  await pause(200);
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
    name: '7b cmd-click',
    files: Object.fromEntries(Object.entries(FILES).map(([p, text]) => [p, { text }])),
    entryPoints: ['main.pathogen'],
  });
  const id = created.id as string;
  made.push(id);
  await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the editor', async () => page.evaluate(`!!${PANE}?._editor`));
  // The open file's import graph (the language services read it) is built after a load.
  await pause(1500);

  // 1. gear(…)'s call.
  await clickAt(page, await spotOf(page, 'gear(here', 1), true);
  let at = await editorAt(page);
  check(
    'Cmd+click on gear(…) opens parts/gears.pathogen at `fn gear` (line 3, col 11), with the keyboard',
    at.open === 'parts/gears.pathogen' && at.line === 3 && at.column === 11 && at.focused,
    at,
  );
  await page.screenshot({ path: `${SHOTS}/2d-step7b-cmd-click-light.png` });

  // 2. A namespace's member.
  await openMain(page);
  await clickAt(page, await spotOf(page, 'g.size', 3), true);
  at = await editorAt(page);
  check(
    'Cmd+click on g.size opens gears at `size` (line 7, col 14)',
    at.open === 'parts/gears.pathogen' && at.line === 7 && at.column === 14,
    at,
  );

  // 3. The import's path.
  await openMain(page);
  await clickAt(page, await spotOf(page, './parts/gears.pathogen', 4), true);
  at = await editorAt(page);
  check(
    'Cmd+click on the import’s path opens gears at its top',
    at.open === 'parts/gears.pathogen' && at.line === 1,
    at,
  );

  // 4. A name declared in main: a jump within main, as before.
  await openMain(page);
  await clickAt(page, await spotOf(page, 'here,', 1), true);
  at = await editorAt(page);
  check(
    'Cmd+click on a name declared in main jumps within main, to `let here` (line 5)',
    at.open === 'main.pathogen' && at.line === 5,
    at,
  );

  // 5. Without Cmd: a click is a click.
  await clickAt(page, await spotOf(page, 'gear(here', 1), false);
  at = await editorAt(page);
  check(
    'a click without Cmd opens nothing: the cursor goes there, in main',
    at.open === 'main.pathogen' && at.line === 6,
    at,
  );

  check('no page errors', pageErrors.length === 0, pageErrors);
} finally {
  for (const id of made) await api('DELETE', `/workspace/${id}`).catch(() => undefined);
  await browser.close();
}
console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

// Phase 2d, step 8 (note 52; note 42's questions, answered 2026-11-13;
// docs/workspace-files.md "Copy Debug Info"): the capture, in the served
// playground, from real clicks on both places it's offered:
// - main calls gear(), which fails in parts/gears.pathogen; try-sizes (not
//   shown) fails in its own code; parts/labels.pathogen is a module nobody
//   imports;
// - the error panel's button: the heading (program shown, the main; the file
//   open), the error with its step and its numbered excerpt, try-sizes' error
//   with its lines, the files (gears first, then main), labels listed by name
//   only, and the note for an assistant;
// - the ⋮ menu's item gives the same report;
// - fixed: logs name their file;
// - the main a module: the note says why it draws nothing.
// The first capture is kept as project-docs/modules/verify/2d-step8-capture.md.
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/verify-2d-step8.ts

import { writeFileSync } from 'node:fs';

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
  'import { gear } from "./parts/gears.pathogen";\n\ndefine ViewBox(0, 0, 200, 100);\ngear(Point(55, 50), 40, 12);\n';
const TRY = 'define ViewBox(0, 0, 200, 100);\nlet r = 12;\ncircle(60, nope, r);\n';
const FILES: Record<string, string> = {
  'main.pathogen': MAIN_BROKEN,
  'try-sizes.pathogen': TRY,
  'parts/gears.pathogen': GEARS,
  'parts/labels.pathogen': 'module;\n\nexport const label = "a";\n',
};

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 1200)}`}`);
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

// The clipboard's write is caught on the page (headless Chrome's clipboard needs a permission).
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
  window.__copied = [];
  if (navigator.clipboard) navigator.clipboard.writeText = async (text) => { window.__copied.push(text); };
`;

const WV = `window.__find('workspace-view')`;
const PANE = `${WV}.shadowRoot.querySelector('code-editor-pane')`;

/** A real click on an element (a selector within a shadow root expression). */
async function click(page: Page, root: string, selector: string): Promise<void> {
  const at = (await page.evaluate(`(() => {
    const el = (${root}).querySelector('${selector}');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`)) as { x: number; y: number } | null;
  if (!at) throw new Error(`nothing at ${selector}`);
  await page.mouse.click(at.x, at.y);
  await pause(400);
}

const lastCopy = async (page: Page): Promise<string> => (await page.evaluate('window.__copied.at(-1) ?? ""')) as string;

/** A section of the capture: from its heading to the next one. */
function section(capture: string, heading: string): string {
  const start = capture.indexOf(`## ${heading}`);
  if (start < 0) return '';
  const next = capture.indexOf('\n## ', start + 1);
  return capture.slice(start, next === -1 ? undefined : next);
}

async function setText(page: Page, text: string): Promise<void> {
  await page.evaluate(`(() => {
    const view = ${PANE}._editor;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: ${JSON.stringify(text)} } });
  })()`);
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
    name: '8 debug capture',
    files: Object.fromEntries(Object.entries(FILES).map(([p, text]) => [p, { text }])),
    entryPoints: ['main.pathogen', 'try-sizes.pathogen'],
  });
  const id = created.id as string;
  made.push(id);
  await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the editor', async () => page.evaluate(`!!${PANE}?._editor`));
  // The panel, and try-sizes' compile in the background (its row's error).
  await waitFor('the panel', async () =>
    page.evaluate(`${WV}.shadowRoot.querySelector('error-panel').classList.contains('visible')`),
  );
  await waitFor('try-sizes’ error', async () =>
    page.evaluate(
      `!!window.__find('file-tree').shadowRoot.querySelector('[data-path="try-sizes.pathogen"].has-error')`,
    ),
  );

  // 1. The error panel's button.
  await click(page, `${WV}.shadowRoot.querySelector('error-panel').shadowRoot`, '.capture-btn');
  const capture = await lastCopy(page);
  writeFileSync(`${SHOTS}/2d-step8-capture.md`, capture);
  check(
    'the heading: the program shown (the main), the file open',
    capture.includes('**Program shown:** main.pathogen (the main)') &&
      capture.includes('**File open in the editor:** main.pathogen'),
    capture.slice(0, 400),
  );
  const errors = section(capture, 'Errors');
  check(
    'the error: parts/gears.pathogen line 5, col 3, its words, "called from main.pathogen line 4", and its numbered lines, line 5 marked',
    errors.includes(
      '### parts/gears.pathogen line 5, col 3\nassertion failed: a gear needs at least 3 teeth\n  called from main.pathogen line 4',
    ) && errors.includes(">  5 |   assert(teeth >= 3, 'a gear needs at least 3 teeth');"),
    errors,
  );
  const others = section(capture, 'Errors in other programs');
  check(
    'try-sizes’ error: one line, in the program list’s words, with its lines around',
    others.includes('- try-sizes.pathogen: Error in try-sizes.pathogen line 3') &&
      others.includes('>  3 | circle(60, nope, r);'),
    others,
  );
  const files = section(capture, 'Files');
  const headings = files.split('\n').filter((l) => l.startsWith('### '));
  check(
    'the files: gears (the error’s) first, then main; labels and try-sizes by name only',
    JSON.stringify(headings) ===
      JSON.stringify([
        '### parts/gears.pathogen (module, 8 lines)',
        '### main.pathogen (the program shown, 5 lines)',
      ]) &&
      files.includes('- parts/labels.pathogen: module, 4 lines') &&
      files.includes('- try-sizes.pathogen: program, 4 lines') &&
      !files.includes('export const label'),
    { headings, files: files.slice(-300) },
  );
  const note = section(capture, 'For an assistant reading this');
  check(
    'the note for an assistant: the docs’ link, no code',
    note.includes('https://pathogen.studio/docs') && !note.includes('`'),
    note,
  );
  check(
    'the panel says it copied',
    (await page.evaluate(
      `${WV}.shadowRoot.querySelector('error-panel').shadowRoot.querySelector('.capture-btn').textContent`,
    )) === 'Copied!',
  );

  // 2. The ⋮ menu's item: the same report (but its time).
  await click(page, `window.__find('app-breadcrumb').shadowRoot`, '.menu-btn');
  await click(page, `window.__find('app-breadcrumb').shadowRoot`, '[data-action="copy-debug-info"]');
  const fromMenu = await lastCopy(page);
  const timeless = (s: string): string => s.replace(/\*\*Timestamp:\*\* \S+/, '');
  check('the ⋮ menu’s Copy Debug Info copies the same report', timeless(fromMenu) === timeless(capture), {
    length: [fromMenu.length, capture.length],
  });

  // 3. Fixed: the logs name their file.
  await setText(page, MAIN_FIXED);
  await waitFor(
    'the panel gone',
    async () => !(await page.evaluate(`${WV}.shadowRoot.querySelector('error-panel').classList.contains('visible')`)),
  );
  await click(page, `window.__find('app-breadcrumb').shadowRoot`, '.menu-btn');
  await click(page, `window.__find('app-breadcrumb').shadowRoot`, '[data-action="copy-debug-info"]');
  const fixed = await lastCopy(page);
  check(
    'fixed: no error in the program shown; the log names its file and line',
    section(fixed, 'Errors').includes('(none in the program shown)') &&
      section(fixed, 'Log Output').includes('[parts/gears.pathogen line 4] teeth: 12'),
    { errors: section(fixed, 'Errors'), logs: section(fixed, 'Log Output') },
  );

  // 3b. Broken again: the last good run's log isn't carried as this one's.
  await setText(page, MAIN_BROKEN);
  await waitFor('the panel back', async () =>
    page.evaluate(`${WV}.shadowRoot.querySelector('error-panel').classList.contains('visible')`),
  );
  await click(page, `${WV}.shadowRoot.querySelector('error-panel').shadowRoot`, '.capture-btn');
  const brokenAgain = await lastCopy(page);
  check(
    'broken again: no log output from the last good run, and it says why there’s none',
    section(brokenAgain, 'Log Output').includes('(none: the compile stopped at the error') &&
      !section(brokenAgain, 'Log Output').includes('teeth: 12'),
    section(brokenAgain, 'Log Output'),
  );

  // 4. The main a module: the note says why it draws nothing.
  await setText(page, 'module;\n\nexport const size = 12;\n');
  await waitFor('the module note', async () =>
    page.evaluate(
      `[...${WV}.shadowRoot.querySelector('error-panel').shadowRoot.querySelectorAll('.who')].some((h) => h.textContent === 'The main')`,
    ),
  );
  await click(page, `${WV}.shadowRoot.querySelector('error-panel').shadowRoot`, '.capture-btn');
  const moduleMain = await lastCopy(page);
  check(
    'the main a module: the capture’s note says why it draws nothing',
    section(moduleMain, 'Errors').includes(
      "**Note:** The main, main.pathogen, is a module: a module can't draw as the main.",
    ),
    section(moduleMain, 'Errors'),
  );

  check('no page errors', pageErrors.length === 0, pageErrors);
} finally {
  for (const id of made) await api('DELETE', `/workspace/${id}`).catch(() => undefined);
  await browser.close();
}
console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

// Phase 3a, step 6 (note 81): the playground's engine with data files, in the
// served playground against the dev API.
// - A workspace whose main imports data/gears.json and a 2.5 MB data/big.json,
//   which the load sends `deferred`: it opens editable (big.json read by its
//   hash) and draws the gears.
// - data/gears.json is never a program: its tree row isn't one.
// - Editing gears.json redraws the main.
// - A JSON mistake in it is placed in the error panel at its file and line.
// - Fixed again, autosave saves, and the program list is still just the main
//   (typing in a data file used to add it, and every save was refused).
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/verify-3a-step6.ts

import { writeFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';
const RESULTS = 'project-docs/modules/verify/verify-3a-step6-results.json';
const ownerId = Array.from(
  { length: 21 },
  () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)],
).join('');

const MAIN = [
  'import gears from "./data/gears.json";',
  'import big from "./data/big.json";',
  '',
  'define ViewBox(0, 0, 200, 100);',
  'for (gear in gears) {',
  '  circle(gear.x, 50, gear.r);',
  '}',
  'log(big.length);',
  '',
].join('\n');
const GEARS = '[{ "x": 50, "r": 10 }, { "x": 150, "r": 20 }]';
const GEARS_EDITED = '[{ "x": 50, "r": 30 }]';
const GEARS_BROKEN = '[\n  { "x": 50, "r": 30 }\n  { "x": 150, "r": 20 }\n]';
const BIG = `[${Array.from({ length: 1_250_000 }, (_, i) => i % 10).join(',')}]`; // 2.5 MB: past the load's 2 MB

const results: { check: string; ok: boolean; detail?: unknown }[] = [];
let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 800)}`}`);
  results.push({ check: label, ok, ...(ok ? {} : { detail }) });
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

const pause = async (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

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
  window.__paths = () => {
    const out = [];
    const walk = (root) => {
      for (const p of root.querySelectorAll('path')) out.push(p.getAttribute('d') || '');
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) walk(el.shadowRoot);
        if (el.tagName === 'IFRAME') { try { if (el.contentDocument) walk(el.contentDocument); } catch (e) {} }
      }
    };
    walk(document);
    return out;
  };
`;

const WV = `window.__find('workspace-view')`;
const PANE = `${WV}.shadowRoot.querySelector('code-editor-pane')`;
const TREE = `window.__find('file-tree').shadowRoot`;

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

async function setText(page: Page, text: string): Promise<void> {
  await page.evaluate(`(() => {
    const view = ${PANE}._editor;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: ${JSON.stringify(text)} } });
  })()`);
}

const drawn = async (page: Page, start: string): Promise<boolean> =>
  ((await page.evaluate('window.__paths()')) as string[]).some((d) => d.replace(/\s+/g, ' ').includes(start));

const panelText = async (page: Page): Promise<string> =>
  (await page.evaluate(`(() => {
    const panel = ${WV}.shadowRoot.querySelector('error-panel');
    if (!panel || !panel.classList.contains('visible')) return '';
    return [...panel.shadowRoot.querySelectorAll(':not(style)')]
      .filter((n) => n.children.length === 0)
      .map((n) => n.textContent)
      .join(' ')
      .replace(/\\s+/g, ' ')
      .trim();
  })()`)) as string;

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
    name: '3a step 6 data',
    files: {
      'main.pathogen': { text: MAIN },
      'data/gears.json': { text: GEARS },
      'data/big.json': { text: BIG },
    },
    entryPoints: ['main.pathogen'],
  });
  const id = created.id as string;
  check('the dev API creates a workspace with data files', typeof id === 'string', created);
  made.push(id);

  const loaded = await api('GET', `/workspace/${id}`);
  const loadedFiles = loaded.files as Record<string, { deferred?: boolean }>;
  check('the load sends big.json by hash (deferred)', loadedFiles['data/big.json']?.deferred === true, loadedFiles);

  await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the editor', async () => page.evaluate(`!!${PANE}?._editor`));

  // 1. It opens editable and draws the gears from the data file.
  // circle(50, 50, 10) as the preview writes it: relative arcs.
  const gearsDrawn = await waitFor('the gears drawn', async () => drawn(page, 'M 40 50 a 10 10'), 40_000);
  check('the main draws the gears from data/gears.json', gearsDrawn === true, {
    panel: await panelText(page),
    paths: ((await page.evaluate('window.__paths()')) as string[]).filter((d) => d.startsWith('M ')),
  });
  const readOnly = (await page.evaluate(
    `document.body.innerText.includes("can't edit") || ${WV}.shadowRoot.textContent.includes("can't edit")`,
  )) as boolean;
  check('no "files this version can’t edit" message: big.json was read by its hash', !readOnly);

  // 2. The data file's tree row isn't a program.
  const rowClass = (await page.evaluate(
    `${TREE}.querySelector('.row.file[data-path="data/gears.json"]')?.className ?? null`,
  )) as string | null;
  check('data/gears.json’s row is not a program', rowClass !== null && !rowClass.split(' ').includes('program'), rowClass);

  // 3. Editing the data file redraws the main.
  await click(page, TREE, '.row.file[data-path="data/gears.json"]');
  await waitFor('gears.json in the editor', async () =>
    page.evaluate(`${PANE}._editor.state.doc.toString() === ${JSON.stringify(GEARS)}`),
  );
  await setText(page, GEARS_EDITED);
  const redrawn = await waitFor('the edited gear drawn', async () => drawn(page, 'M 20 50 a 30 30'), 20_000);
  check('editing gears.json redraws the main with the new radius', redrawn === true, await page.evaluate('window.__paths()'));

  // 4. A JSON mistake is placed at its file and line.
  await setText(page, GEARS_BROKEN);
  const mistake = await waitFor('the JSON mistake in the panel', async () => {
    const text = await panelText(page);
    return text.includes('data/gears.json') ? text : null;
  });
  check(
    'a JSON mistake shows in the error panel at data/gears.json line 3, imported from the main',
    /data\/gears\.json Line 3\b/.test(mistake ?? '') && (mistake ?? '').includes('main.pathogen line 1'),
    mistake,
  );

  // 5. Fixed again: autosave saves, and the program list is still the main alone.
  await setText(page, GEARS_EDITED);
  await waitFor('the panel to close', async () => (await panelText(page)) === '', 20_000);
  const saved = await waitFor(
    'autosave to save gears.json',
    async () => {
      const now = await api('GET', `/workspace/${id}`);
      const files = now.files as Record<string, { text?: string }>;
      return files['data/gears.json']?.text === GEARS_EDITED ? now : null;
    },
    75_000,
  );
  check('autosave saved the edited data file', saved !== null);
  check(
    'the program list is still just the main (typing in a data file doesn’t add it)',
    JSON.stringify(saved?.entryPoints) === JSON.stringify(['main.pathogen']),
    saved?.entryPoints,
  );
  const saveError = (await page.evaluate(`${WV}.shadowRoot.textContent.includes('isn\\'t a .pathogen file')`)) as boolean;
  check('no refused save', !saveError);
  check('no page errors', pageErrors.length === 0, pageErrors);
} catch (err) {
  check('the run', false, (err as Error).message);
} finally {
  for (const id of made) await api('DELETE', `/workspace/${id}`).catch(() => undefined);
  await browser.close();
}

writeFileSync(RESULTS, `${JSON.stringify({ date: new Date().toISOString(), results }, null, 2)}\n`);
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exitCode = failures ? 1 : 0;

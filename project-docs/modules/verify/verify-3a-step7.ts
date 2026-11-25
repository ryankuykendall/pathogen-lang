// Phase 3a, step 7 (note 82): the playground's UI for data files, in the
// served playground against the dev API, in both themes.
// 7a (mockups v2 1a, 1b):
// - a data file's tab keeps its extension, has the braces and no lock; its
//   tree row has the braces;
// - the editor highlights its JSON, offers no completions, and marks a JSON
//   mistake as you type, with the message, even in a file no program imports;
// - Format Document is off while it's open.
// Screenshots go to project-docs/modules/verify/3a-step7/.
//
//   npm run dev:stack   (then npm run build:playground:dev after a change)
//   npx tsx project-docs/modules/verify/verify-3a-step7.ts

import { mkdirSync, writeFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';
const SHOTS = 'project-docs/modules/verify/3a-step7';
const RESULTS = 'project-docs/modules/verify/verify-3a-step7-results.json';
const ownerId = Array.from(
  { length: 21 },
  () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)],
).join('');

const MAIN = [
  'import { gear } from "./parts/gears.pathogen";',
  'import gears from "./data/gears.json";',
  '',
  'define ViewBox(0, 0, 200, 100);',
  'for (g in gears) {',
  '  gear(g.x, g.y, g.radius, g.teeth);',
  '}',
  '',
].join('\n');
const GEARS_MODULE = [
  'module;',
  '',
  'export fn gear(x, y, radius, teeth) {',
  '  circle(x, y, radius);',
  '  circle(x, y, radius / 3);',
  '}',
  '',
].join('\n');
const GEARS = [
  '[',
  '  { "name": "drive", "x": 55, "y": 50, "radius": 40, "teeth": 12 },',
  '  { "name": "idler", "x": 150, "y": 50, "radius": 28, "teeth": 8 }',
  ']',
  '',
].join('\n');
const SIZES = '{ "small": 10, "large": 40 }\n';
// Minified, on one line: about 4 MB.
const BIG = `[${Array.from({ length: 200_000 }, (_, i) => `{"x":${i},"y":${i * 2}}`).join(',')}]`;

mkdirSync(SHOTS, { recursive: true });
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
`;

const WV = `window.__find('workspace-view')`;
const PANE = `${WV}.shadowRoot.querySelector('code-editor-pane')`;
const TREE = `window.__find('file-tree').shadowRoot`;
const TABS = `window.__find('editor-tabs').shadowRoot`;
const CRUMB = `window.__find('app-breadcrumb').shadowRoot`;

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

async function openFile(page: Page, path: string, text: string): Promise<void> {
  // A click while the workspace is still loading (a large data file read by hash) is overtaken by the load.
  await waitFor('the load', async () => page.evaluate(`!${WV}._loadingWorkspace`));
  for (let attempt = 0; attempt < 2; attempt++) {
    await click(page, TREE, `.row.file[data-path="${path}"]`);
    const open = await waitFor(
      `${path} in the editor`,
      async () => page.evaluate(`${PANE}._editor.state.doc.toString() === ${JSON.stringify(text)}`),
      8_000,
    );
    if (open) return;
  }
}

async function shot(page: Page, name: string, theme: string): Promise<void> {
  await pause(500);
  await page.screenshot({ path: `${SHOTS}/${name}-${theme}.png` });
}

const made: string[] = [];
const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1320, height: 860 } });
try {
  const created = await api('POST', '/workspace', {
    name: 'Gear studies',
    files: {
      'main.pathogen': { text: MAIN },
      'parts/gears.pathogen': { text: GEARS_MODULE },
      'data/gears.json': { text: GEARS },
      'data/sizes.json': { text: SIZES },
      'data/big.json': { text: BIG },
    },
    entryPoints: ['main.pathogen'],
  });
  const id = created.id as string;
  made.push(id);

  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    page.on('dialog', (d) => void d.accept());
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    await page.evaluateOnNewDocument(FIND);
    await page.evaluateOnNewDocument(
      (key: string, value: string, chosen: string) => {
        localStorage.setItem(key, value);
        localStorage.setItem('pathogen-theme', chosen);
      },
      ANON_KEY,
      ownerId,
      theme,
    );
    await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitFor('the editor', async () => page.evaluate(`!!${PANE}?._editor`));
    await waitFor('the tree', async () => page.evaluate(`!!${TREE}.querySelector('[data-path="data/gears.json"]')`));
    const say = (label: string): string => `${label} (${theme})`;

    // 1. The tree row and the tab.
    const rowClass = (await page.evaluate(
      `${TREE}.querySelector('.row.file[data-path="data/gears.json"]').className`,
    )) as string;
    check(say('data/gears.json’s tree row is a data row'), rowClass === 'row file data' || rowClass.startsWith('row file data '), rowClass);
    await openFile(page, 'data/gears.json', GEARS);
    const tab = (await page.evaluate(`(() => {
      const t = ${TABS}.querySelector('[data-path="data/gears.json"]');
      return t ? { label: t.querySelector('.label').textContent, className: t.className, lock: !!t.querySelector('.lock') } : null;
    })()`)) as { label: string; className: string; lock: boolean } | null;
    check(
      say('its tab keeps .json, has the data kind, and no lock'),
      tab?.label === 'gears.json' && tab.className.split(' ').includes('data') && !tab.lock,
      tab,
    );

    // 2. JSON highlighted: its strings and numbers are tokens of their own.
    const tokens = (await page.evaluate(`(() => {
      const line = ${PANE}.shadowRoot.querySelectorAll('.cm-line')[1];
      return [...line.querySelectorAll('span')].map((s) => [s.textContent, getComputedStyle(s).color]);
    })()`)) as [string, string][];
    const stringColor = tokens.find(([t]) => t === '"drive"')?.[1];
    const numberColor = tokens.find(([t]) => t === '55')?.[1];
    check(
      say('the JSON is highlighted: a string and a number in colors of their own'),
      stringColor !== undefined && numberColor !== undefined && stringColor !== numberColor,
      tokens.slice(0, 8),
    );
    await shot(page, '1a-tree-editor', theme);

    // 3. No Pathogen completions in a data file.
    await page.evaluate(`(() => {
      const view = ${PANE}._editor;
      view.focus();
      view.dispatch({ selection: { anchor: view.state.doc.length } });
    })()`);
    await page.keyboard.type('cir', { delay: 40 });
    await pause(600);
    const completions = (await page.evaluate(
      `!!${PANE}.shadowRoot.querySelector('.cm-tooltip-autocomplete')`,
    )) as boolean;
    check(say('typing in it offers no Pathogen completions'), !completions);
    await setText(page, GEARS);

    // 4. Format Document is off.
    await click(page, CRUMB, '.menu-btn');
    const format = (await page.evaluate(`(() => {
      const b = ${CRUMB}.querySelector('[data-action="format-document"]');
      return b ? { disabled: b.disabled, text: b.textContent.replace(/\\s+/g, ' ').trim() } : null;
    })()`)) as { disabled: boolean; text: string } | null;
    check(
      say('Format Document is off, and says why'),
      format?.disabled === true && format.text.includes('It formats Pathogen code'),
      format,
    );
    await page.keyboard.press('Escape');
    await pause(300);

    // 5. A JSON mistake, marked as you type, with its message: in gears.json, which
    //    the main imports (the panel says it too), and in sizes.json, which no program imports.
    await setText(page, GEARS.replace('12 },', '12 }'));
    const mark = await waitFor('the mistake’s mark', async () =>
      page.evaluate(`(() => {
        const m = ${PANE}.shadowRoot.querySelector('.cm-error-char');
        return m ? { title: m.getAttribute('title'), line: m.closest('.cm-line') ? [...${PANE}.shadowRoot.querySelectorAll('.cm-line')].indexOf(m.closest('.cm-line')) + 1 : null } : null;
      })()`),
    );
    check(
      say('a mistake in gears.json is marked at line 3, with the message on hover'),
      (mark as { title: string; line: number } | null)?.title === 'expected , or ] after an array item' &&
        (mark as { line: number }).line === 3,
      mark,
    );
    await waitFor('the panel', async () =>
      page.evaluate(`${WV}.shadowRoot.querySelector('error-panel').classList.contains('visible')`),
    );
    await shot(page, '1b-json-error', theme);
    await setText(page, GEARS);
    await waitFor('the mark to clear', async () =>
      page.evaluate(`!${PANE}.shadowRoot.querySelector('.cm-error-char')`),
    );

    await openFile(page, 'data/sizes.json', SIZES);
    await setText(page, '{ "small": 10 "large": 40 }\n');
    const unimported = await waitFor('the mark in sizes.json', async () =>
      page.evaluate(`${PANE}.shadowRoot.querySelector('.cm-error-char')?.getAttribute('title') ?? null`),
    );
    check(
      say('a mistake in sizes.json, which no program imports, is marked too'),
      unimported === "expected , or } after a key's value",
      unimported,
    );
    await setText(page, SIZES);

    // 6. A minified 4 MB file: shown plain, and a keystroke stays quick.
    await openFile(page, 'data/big.json', BIG);
    const keystroke = (await page.evaluate(`(() => {
      const view = ${PANE}._editor;
      const times = [];
      for (let i = 0; i < 5; i++) {
        const t = performance.now();
        view.dispatch({ changes: { from: 1, insert: ' ' } });
        times.push(performance.now() - t);
      }
      // Highlighting would put each token in a span with a class of the theme's (ͼ…).
      const spans = [...${PANE}.shadowRoot.querySelector('.cm-line').querySelectorAll('span')].map((s) => s.className);
      return { worst: Math.max(...times), tokens: spans.filter((c) => /ͼ/.test(c)).length, spans: spans.slice(0, 5) };
    })()`)) as { worst: number; tokens: number; spans: string[] };
    check(
      say(`a minified 4 MB file is shown plain, a keystroke ${keystroke.worst.toFixed(1)} ms at worst`),
      keystroke.tokens === 0 && keystroke.worst < 100,
      keystroke,
    );
    await setText(page, BIG);
    await pause(1500);
    check(say('no page errors'), pageErrors.length === 0, pageErrors);
    await page.close();
  }
} catch (err) {
  check('the run', false, (err as Error).message);
} finally {
  for (const id of made) await api('DELETE', `/workspace/${id}`).catch(() => undefined);
  await browser.close();
}

writeFileSync(RESULTS, `${JSON.stringify({ date: new Date().toISOString(), results }, null, 2)}\n`);
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exitCode = failures ? 1 : 0;

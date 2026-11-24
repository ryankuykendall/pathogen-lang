// 3a mockups v3 (note 75): the New data file dialog made lighter, as you asked
// on 2026-11-24 ("a compound element: the text field on the left and the
// extension selection as a select/dropdown (almost suffix like) on the right.
// When the user clicks on the extension drop down, we can use progressive
// disclosure to provide hints about the contents of the files"). Only the
// dialog's states; the rest of v2 (../mockups-3a-data-files-v2/) stands.
//
//   2b  the dialog: one field, the name and the extension after it as a dropdown
//   2c  the dropdown open: each extension with what it holds
//   2d  a name that's taken
//
// As v2: a workspace on the dev playground, with the data files, their tabs and
// the editor's JSON put into the page; the dialog's frame is the playground's
// own confirm-dialog (the Delete… question), and the field and the list are put
// into its body, styled from the theme's tokens and the tree menu's own rules
// (file-tree.css .menu). Each state is shot light and dark.
//
//   npm run dev:stack   (the dev server and the dev API, built with build:playground:dev)
//   npx tsx project-docs/modules/mockups-3a-data-files-v3/shoot.ts

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const root = process.cwd();
const DIR = join(root, 'project-docs', 'modules', 'mockups-3a-data-files-v3');
const GEARS_MODULE = join(root, 'project-docs', 'modules', 'mockups-2f-vscode-chip', 'gears-project', 'parts', 'gears.pathogen');
const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ownerId = Array.from(
  { length: 21 },
  () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)],
).join('');

const GEARS_JSON = `[
  { "name": "drive", "x": 55, "y": 50, "radius": 40, "teeth": 12 },
  { "name": "idler", "x": 150, "y": 50, "radius": 28, "teeth": 8 }
]
`;
// What the dev API stores (it can't hold the data file yet): the table inline, so the preview draws.
const MAIN_STORED = `// Two gears, from the table in data/gears.json.
let gears = [
  { name: "drive", x: 55, y: 50, radius: 40, teeth: 12 },
  { name: "idler", x: 150, y: 50, radius: 28, teeth: 8 },
];

define ViewBox(0, 0, 200, 100);

for (gear in gears) {
  star(gear.x, gear.y, gear.radius, gear.radius - 6, gear.teeth);
  circle(gear.x, gear.y, gear.radius * 0.3);
}
`;

const icon = (body: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
/** Every data file: the braces pathogen.json already has. */
const DATA_ICON = icon(
  '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/>',
);
const CHEVRON = icon('<path d="m6 9 6 6 6-6"/>');
const CHECK = icon('<path d="M20 6 9 17l-5-5"/>');

// ── The extensions, and what each holds (shown only in the open list) ──
const TYPES = [
  { ext: '.json', hint: 'JSON: tables, lists and settings' },
  { ext: '.geojson', hint: 'GeoJSON: places and shapes on a map' },
  { ext: '.topojson', hint: 'TopoJSON: maps with shared borders' },
  { ext: '.fold', hint: 'FOLD: origami crease patterns' },
];

const FORM_CSS = `
  dialog { width: min(400px, calc(100vw - 32px)); }
  .body { display: grid; gap: 6px; }
  .compound {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: stretch;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    background: var(--bg-primary, #fff);
  }
  .compound:focus-within { outline: 2px solid var(--focus-ring, rgba(148, 97, 196, 0.5)); outline-offset: 1px; }
  .compound.problem { border-color: var(--error-color, #ef4444); }
  .compound input {
    min-width: 0;
    padding: 8px 10px;
    border: none;
    background: transparent;
    color: var(--text-primary, #1a1a2e);
    font: 14px var(--font-mono, monospace);
    outline: none;
  }
  .ext-button {
    display: grid;
    grid-auto-flow: column;
    align-items: center;
    gap: 4px;
    padding: 0 8px 0 10px;
    border: none;
    border-left: 1px solid var(--border-color, #e2e8f0);
    border-radius: 0 7px 7px 0;
    background: var(--bg-secondary, #f8fafc);
    color: var(--text-secondary, #64748b);
    font: 14px var(--font-mono, monospace);
    cursor: pointer;
  }
  .ext-button svg { width: 14px; height: 14px; }
  .ext-button[aria-expanded="true"] { color: var(--text-primary, #1a1a2e); background: var(--bg-tertiary, rgba(0, 0, 0, 0.05)); }
  .hint { margin: 0; font-size: 12.5px; color: var(--text-secondary, #64748b); }
  .hint code { font-family: var(--font-mono, monospace); color: var(--text-primary, #1a1a2e); }
  .hint.problem { color: var(--error-color, #ef4444); }
  .confirm:disabled { opacity: 0.45; cursor: default; }
  /* The list: the tree menu's own look (file-tree.css .menu). */
  .ext-list {
    position: fixed;
    z-index: 1;
    width: 300px;
    box-sizing: border-box;
    margin: 0;
    padding: 6px;
    list-style: none;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 12px;
    background: var(--bg-elevated, #fff);
    box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.18));
    font-family: var(--font-sans, system-ui, sans-serif);
  }
  .ext-list [role="option"] {
    display: grid;
    grid-template-columns: 16px 1fr;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border-radius: 6px;
    font-size: 13px;
    color: var(--text-primary, #1a1a2e);
  }
  .ext-list [role="option"].active { background: var(--bg-tertiary, rgba(0, 0, 0, 0.05)); }
  .ext-list .check { width: 14px; height: 14px; color: var(--accent-color, #9461c4); }
  .ext-list .check svg { width: 14px; height: 14px; display: block; }
  .ext-list code { font: 500 13px var(--font-mono, monospace); }
  .ext-list small { display: block; margin-top: 1px; font-size: 11.5px; color: var(--text-tertiary, #9087a0); }
`;
const FORM_HTML = `
  <div class="compound">
    <input id="data-name" spellcheck="false" autocomplete="off" aria-label="File name" aria-describedby="data-hint">
    <button type="button" class="ext-button" aria-haspopup="listbox" aria-expanded="false" aria-label="Extension: .json"><span class="ext">.json</span>${CHEVRON}</button>
  </div>
  <p class="hint" id="data-hint"></p>
`;
const LIST_HTML = `<ul class="ext-list" role="listbox" aria-label="Extension">${TYPES.map(
  (t, i) =>
    `<li role="option" aria-selected="${i === 0}" class="${i === 0 ? 'active' : ''}"><span class="check">${i === 0 ? CHECK : ''}</span><span><code>${t.ext}</code><small>${t.hint}</small></span></li>`,
).join('')}</ul>`;

const FIND = `window.__find = (sel) => { const walk = (r) => { const hit = r.querySelector(sel); if (hit) return hit; for (const el of r.querySelectorAll('*')) { const inner = el.shadowRoot ? walk(el.shadowRoot) : null; if (inner) return inner; } return null; }; return walk(document); };`;

const MOCK = `
window.__mock = {
  addFiles(files) {
    const tree = __find('file-tree');
    const extra = files.map((f) => ({ path: f.path, kind: 'program' }));
    tree.files = [...tree.files.filter((f) => !extra.some((e) => e.path === f.path)), ...extra];
    this.patchTree(files);
  },
  patchTree(files) {
    const tree = __find('file-tree');
    for (const f of files) {
      const row = tree.shadowRoot.querySelector('.row[data-path="' + f.path + '"]');
      if (!row) continue;
      row.classList.remove('program');
      row.classList.add('data');
      row.querySelector('.icon').innerHTML = f.icon;
    }
  },
  setTabs(items, active) {
    const tabs = __find('editor-tabs');
    tabs.items = items.map((i) => ({ path: i.path, kind: i.kind === 'data' ? 'program' : i.kind, name: i.name, hint: null }));
    tabs.active = active;
    for (const i of items) {
      if (i.kind !== 'data') continue;
      const tab = tabs.shadowRoot.querySelector('.tab[data-path="' + i.path + '"]');
      if (!tab) continue;
      tab.classList.remove('program');
      tab.classList.add('data');
      tab.querySelector('.icon').innerHTML = i.icon;
    }
    __find('file-tree').active = active;
  },
  setCrumb(path) {
    const crumb = __find('app-breadcrumb').shadowRoot.querySelector('.breadcrumb-file');
    if (!crumb) return;
    const slash = path.lastIndexOf('/');
    crumb.title = path;
    crumb.innerHTML = (slash >= 0 ? '<span class="dir">' + path.slice(0, slash + 1) + '</span>' : '') + path.slice(slash + 1);
  },
  setJson(text) {
    const pane = __find('code-editor-pane');
    const cm = pane._cmModules;
    pane._editor.setState(cm.state.EditorState.create({ doc: text, extensions: [...pane._readOnlyExtensions(), ...pane._errorHighlight.extension] }));
    pane._updateEditorTheme();
  },
  // New data file…: the real confirm-dialog, shown modal, with the field in its body.
  dataDialog(css, html) {
    document.querySelector('confirm-dialog')?.remove();
    const dlg = document.createElement('confirm-dialog');
    document.body.append(dlg);
    dlg.ask({ title: 'New data file', message: '', confirmLabel: 'Create' });
    const root = dlg.shadowRoot;
    root.querySelector('style').insertAdjacentHTML('afterend', '<style>' + css + '</style>');
    root.querySelector('.body').innerHTML = html;
  },
  dataName(name, folder, taken) {
    const root = document.querySelector('confirm-dialog').shadowRoot;
    const field = root.querySelector('#data-name');
    field.value = name;
    const ext = root.querySelector('.ext-button .ext').textContent;
    const hint = root.querySelector('#data-hint');
    const box = root.querySelector('.compound');
    const create = root.querySelector('.confirm');
    if (taken) {
      // The tree's own words for a taken name (workspace-edits.ts).
      hint.className = 'hint problem';
      hint.textContent = folder + ' already has ' + name + ext + '.';
      box.classList.add('problem');
      field.setAttribute('aria-invalid', 'true');
      create.disabled = true;
    } else {
      hint.className = 'hint';
      hint.innerHTML = 'Adds <code></code>';
      hint.querySelector('code').textContent = folder + name + ext;
      box.classList.remove('problem');
      field.removeAttribute('aria-invalid');
      create.disabled = false;
    }
    field.focus();
    field.setSelectionRange(name.length, name.length);
  },
  // The extension's list, opened under its button, its right edge on the field's.
  openList(html) {
    const root = document.querySelector('confirm-dialog').shadowRoot;
    const button = root.querySelector('.ext-button');
    button.setAttribute('aria-expanded', 'true');
    root.querySelector('.body').insertAdjacentHTML('beforeend', html);
    const list = root.querySelector('.ext-list');
    const at = root.querySelector('.compound').getBoundingClientRect();
    list.style.top = (at.bottom + 4) + 'px';
    list.style.left = (at.right - list.getBoundingClientRect().width) + 'px';
    button.focus();
  },
};
`;

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function api(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${DEV_API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-User-Id': ownerId, Connection: 'close' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

async function newPage(theme: string): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1320, height: 860, deviceScaleFactor: 1 });
  page.on('dialog', (d) => void d.accept());
  // about:blank (closePage's last stop) can't use localStorage: not an error of the page's.
  page.on('pageerror', (e) => {
    if (page.url() !== 'about:blank') errors.push(`${theme}: ${String(e)}`);
  });
  await page.evaluateOnNewDocument('window.__name = (f) => f;');
  await page.evaluateOnNewDocument(FIND);
  await page.evaluateOnNewDocument(MOCK);
  await page.evaluateOnNewDocument(
    (owner: string, t: string) => {
      localStorage.setItem('pathogen-lang:userId', owner);
      localStorage.setItem('pathogen-theme', t);
    },
    ownerId,
    theme,
  );
  return page;
}

async function poll(page: Page, expr: string, tries = 150): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await page.evaluate(expr)) return true;
    await wait(200);
  }
  return false;
}

/** Close a page once its requests have finished (a page closed mid-request has crashed the dev API's Wrangler). */
async function closePage(page: Page): Promise<void> {
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 15_000 }).catch(() => {});
  await page.goto('about:blank').catch(() => {});
  await page.close();
}

async function shot(page: Page, name: string, theme: string): Promise<void> {
  await page.screenshot({ path: join(DIR, `${name}-${theme}.png`) });
  shots.push(`${name}-${theme}.png`);
}

const DATA_FILES = [
  { path: 'data/gears.json', icon: DATA_ICON },
  { path: 'data/sizes.json', icon: DATA_ICON },
];

const errors: string[] = [];
const shots: string[] = [];
const browser = await puppeteer.launch({ headless: 'shell' });
let id = '';
try {
  const created = await api('POST', '/workspace', {
    name: 'Gear studies',
    files: {
      'main.pathogen': { text: MAIN_STORED },
      'parts/gears.pathogen': { text: readFileSync(GEARS_MODULE, 'utf8') },
    },
    entryPoints: ['main.pathogen'],
  });
  id = created.id as string;

  for (const theme of ['light', 'dark']) {
    const page = await newPage(theme);
    await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (!(await poll(page, `!!(window.__find && window.__find('code-editor-pane')?._editor)`))) {
      throw new Error('the editor never loaded');
    }
    await poll(page, `!!window.__find('app-breadcrumb')?.shadowRoot?.querySelector('#files-toggle')`);
    const open = await page.evaluate(
      `window.__find('app-breadcrumb').shadowRoot.querySelector('#files-toggle').getAttribute('aria-pressed') === 'true'`,
    );
    if (!open) await page.evaluate(`window.__find('app-breadcrumb').shadowRoot.querySelector('#files-toggle').click()`);
    if (!(await poll(page, `!!window.__find('file-tree')?.shadowRoot?.querySelector('[data-path="main.pathogen"]')`))) {
      throw new Error('the tree never showed main.pathogen');
    }
    await wait(3500);

    await page.evaluate((f: unknown) => (window as any).__mock.addFiles(f), DATA_FILES);
    await page.evaluate(
      (svg: string) =>
        (window as any).__mock.setTabs(
          [
            { path: 'main.pathogen', name: 'main', kind: 'program', icon: '' },
            { path: 'data/gears.json', name: 'gears.json', kind: 'data', icon: svg },
          ],
          'data/gears.json',
        ),
      DATA_ICON,
    );
    await page.evaluate(() => (window as any).__mock.setCrumb('data/gears.json'));
    await page.evaluate((text: string) => (window as any).__mock.setJson(text), GEARS_JSON);
    await page.evaluate((f: unknown) => (window as any).__mock.patchTree(f), DATA_FILES);
    await wait(300);

    // 2b. The dialog: the name, and the extension after it.
    await page.evaluate(
      (css: string, html: string) => {
        (window as any).__mock.dataDialog(css, html);
        (window as any).__mock.dataName('trips', 'data/', false);
      },
      FORM_CSS,
      FORM_HTML,
    );
    await wait(300);
    await shot(page, '2b-new-data-dialog', theme);

    // 2c. The extension's list open: each one with what it holds.
    await page.evaluate((html: string) => (window as any).__mock.openList(html), LIST_HTML);
    await wait(200);
    await shot(page, '2c-extension-list', theme);

    // 2d. A name that's taken (the list closed again).
    await page.evaluate(() => {
      const root = document.querySelector('confirm-dialog')!.shadowRoot!;
      root.querySelector('.ext-list')?.remove();
      root.querySelector('.ext-button')!.setAttribute('aria-expanded', 'false');
      (window as any).__mock.dataName('gears', 'data/', true);
    });
    await wait(200);
    await shot(page, '2d-name-taken', theme);
    await closePage(page);
  }
} finally {
  if (id) await api('DELETE', `/workspace/${id}`).catch((e) => errors.push(String(e)));
  await browser.close();
}
if (errors.length) console.error(errors.join('\n'));
console.log(`ok: ${shots.length} screenshots`);

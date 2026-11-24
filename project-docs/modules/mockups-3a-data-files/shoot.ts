// 3a mockups (note 72): data files in a workspace, as the drafted docs say
// (docs/workspace-files.md "Data files", docs/data-import.md "In the editor").
// As 2g's did, the script opens a workspace on the dev playground and puts the
// proposals into the real page: the dev API holds .pathogen files only today,
// so the data files, their tabs, the editor's JSON, the tooltips, the menus and
// the messages are added to the page after it loads. Each state is shot light
// and dark.
//
//   npm run dev:stack   (the dev server and the dev API, built with build:playground:dev)
//   npx tsx project-docs/modules/mockups-3a-data-files/shoot.ts
//
// What's real: the workspace (main.pathogen and parts/gears.pathogen), the tree,
// tabs and editor components (their own markup and CSS), the editor's JSON
// highlighting (the read-only pathogen.json state's), its error mark (the
// compile's own setError), the error panel (showSections), the toast
// (show-toast), the save pill, and the New Workspace page's import card (its
// own render, from a made-up plan). What's made up: everything a data file
// adds, and the stored main.pathogen, which holds the table inline so the
// preview draws the two gears the import would.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const root = process.cwd();
const DIR = join(root, 'project-docs', 'modules', 'mockups-3a-data-files');
const GEARS_MODULE = join(root, 'project-docs', 'modules', 'mockups-2f-vscode-chip', 'gears-project', 'parts', 'gears.pathogen');
const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ownerId = Array.from(
  { length: 21 },
  () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)],
).join('');

// ── The files ──
const GEARS_JSON = `[
  { "name": "drive", "x": 55, "y": 50, "radius": 40, "teeth": 12 },
  { "name": "idler", "x": 150, "y": 50, "radius": 28, "teeth": 8 }
]
`;
// The comma after the first item is missing: the reader stops at line 3, col 3.
const GEARS_JSON_BROKEN = `[
  { "name": "drive", "x": 55, "y": 50, "radius": 40, "teeth": 12 }
  { "name": "idler", "x": 150, "y": 50, "radius": 28, "teeth": 8 }
]
`;
const TRIPS_JSON = `[
  { "from": "Ballard", "to": "Fremont", "minutes": 14, "path": [[47.668, -122.384], [47.651, -122.350]] },
  { "from": "Fremont", "to": "Capitol Hill", "minutes": 19, "path": [[47.651, -122.350], [47.623, -122.320]] },
  { "from": "Capitol Hill", "to": "Pioneer Square", "minutes": 11, "path": [[47.623, -122.320], [47.602, -122.334]] },
  { "from": "Pioneer Square", "to": "Georgetown", "minutes": 16, "path": [[47.602, -122.334], [47.548, -122.321]] },
  { "from": "Georgetown", "to": "Columbia City", "minutes": 13, "path": [[47.548, -122.321], [47.560, -122.287]] },
  { "from": "Columbia City", "to": "Beacon Hill", "minutes": 9, "path": [[47.560, -122.287], [47.579, -122.311]] },
  { "from": "Beacon Hill", "to": "Ballard", "minutes": 31, "path": [[47.579, -122.311], [47.668, -122.384]] }
]
`;
// What main.pathogen says with 3a (line 2 is the import the error panel names).
const MAIN_SHOWN = `// Two gears, from the table in data/gears.json.
import gears from "./data/gears.json";

define ViewBox(0, 0, 200, 100);

for (gear in gears) {
  star(gear.x, gear.y, gear.radius, gear.radius - 6, gear.teeth);
  circle(gear.x, gear.y, gear.radius * 0.3);
}
`;
// The same, being typed: completion after `gear.` on the last line of the loop.
const MAIN_TYPING = `// Two gears, from the table in data/gears.json.
import gears from "./data/gears.json";

define ViewBox(0, 0, 200, 100);

for (gear in gears) {
  star(gear.x, gear.y, gear.radius, gear.radius - 6, gear.teeth);
  circle(gear.x, gear.y, gear.
}
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

// ── Icons: the tree's own wrapper (playground/utils/file-icons.ts) ──
const icon = (body: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
/** JSON: the braces pathogen.json already has. */
const JSON_ICON = icon(
  '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/>',
);
/** Text (proposed): the program's page, with lines of text where the program has its wave. */
const TEXT_ICON = icon('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>');
const iconFor = (path: string): string => (path.endsWith('.txt') ? TEXT_ICON : JSON_ICON);

// ── The proposals' words ──
const HOVER_HTML =
  '<strong>gears</strong> — <em>imported data</em><br><br><code>data/gears.json</code> · an array of 2 objects: name, x, y, radius, teeth';
const COMPLETIONS = [
  { label: 'name', detail: 'string' },
  { label: 'x', detail: 'number' },
  { label: 'y', detail: 'number' },
  { label: 'radius', detail: 'number' },
  { label: 'teeth', detail: 'number' },
];
const JSON_ERROR = 'expected , or ] after an array item';
const NEW_DATA_ITEM = {
  label: 'New data file',
  detail: 'JSON or text',
};
const NAME_HINT = 'Starts as [] · Enter to create, Esc to cancel';
const UPLOAD_TOAST = {
  type: 'success',
  title: 'Added 2 files to data/: gears.json and profile.txt.',
  message: 'Not added:',
  items: [
    'trips.json: 6.2 MB, more than the 5 MB a data file can be in a workspace.',
    'notes.md: a workspace holds .pathogen files and data files (.json, .geojson, .topojson, .fold and .txt).',
  ],
};
const SAVE_REFUSED =
  'data/trips.json is 5.4 MB, more than the 5 MB a data file can be in a workspace. Your edits are kept in the editor but not saved.';

// ── In the page: find through shadow roots, and the mock's helpers ──
const FIND = `window.__find = (sel) => { const walk = (r) => { const hit = r.querySelector(sel); if (hit) return hit; for (const el of r.querySelectorAll('*')) { const inner = el.shadowRoot ? walk(el.shadowRoot) : null; if (inner) return inner; } return null; }; return walk(document); };`;

const MOCK = `
window.__mock = {
  // Data files in the tree: added as files, then given their own class and icon.
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
  // The tabs: a data file's keeps its extension.
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
    const tree = __find('file-tree');
    tree.active = active;
  },
  // The breadcrumb's file crumb.
  setCrumb(path) {
    const bc = __find('app-breadcrumb').shadowRoot;
    const crumb = bc.querySelector('.breadcrumb-file');
    if (!crumb) return;
    const slash = path.lastIndexOf('/');
    crumb.title = path;
    crumb.innerHTML = (slash >= 0 ? '<span class="dir">' + path.slice(0, slash + 1) + '</span>' : '') + path.slice(slash + 1);
  },
  // The editor: JSON with pathogen.json's highlighting (and the error mark), or Pathogen.
  setEditor(text, mode, cursor) {
    const pane = __find('code-editor-pane');
    const cm = pane._cmModules;
    const extensions = mode === 'json'
      ? [...pane._readOnlyExtensions(), ...pane._errorHighlight.extension]
      : pane._buildExtensions();
    const config = { doc: text, extensions };
    if (cursor !== undefined) config.selection = { anchor: cursor };
    pane._editor.setState(cm.state.EditorState.create(config));
    pane._updateEditorTheme();
  },
  editorView() {
    return __find('code-editor-pane')._editor;
  },
  markError(line, column) {
    const pane = __find('code-editor-pane');
    pane._errorHighlight.setError(pane._editor, { line, column });
  },
  // A tooltip inside the editor, so the editor's theme styles it.
  tooltip(className, html, pos, place) {
    const view = this.editorView();
    for (const old of view.dom.querySelectorAll('.mock-tip')) old.remove();
    const at = view.coordsAtPos(pos);
    const tip = document.createElement('div');
    tip.className = 'cm-tooltip mock-tip ' + className;
    tip.style.position = 'fixed';
    tip.style.left = (at.left + (place.dx || 0)) + 'px';
    tip.style.top = '0px';
    tip.innerHTML = html;
    view.dom.appendChild(tip);
    const h = tip.getBoundingClientRect().height;
    tip.style.top = (place.above ? at.top - h - 2 : at.bottom + 3) + 'px';
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

async function newPage(theme: string, phone: boolean, tall = false): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport(
    phone
      ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { width: 1320, height: tall ? 1100 : 860, deviceScaleFactor: 1 },
  );
  page.on('dialog', (d) => void d.accept());
  page.on('pageerror', (e) => errors.push(`${theme}: ${String(e)}`));
  // tsx names functions with a helper the page doesn't have.
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

/** The workspace, loaded and drawn, with the tree shown. */
async function openWorkspace(page: Page, id: string): Promise<void> {
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
  // The breadcrumb redraws as "Ready" fades; the page settles after that.
  await wait(3500);
}

const DATA_FILES = [
  { path: 'data/gears.json', icon: JSON_ICON },
  { path: 'data/profile.txt', icon: TEXT_ICON },
];

/** The workspace with its data files, and a file open. */
async function withDataFiles(
  page: Page,
  opts: {
    files?: { path: string; icon: string }[];
    open: string;
    text: string;
    mode: 'json' | 'pathogen';
    cursor?: number;
    mainOnly?: boolean;
  },
): Promise<void> {
  const files = opts.files ?? DATA_FILES;
  await page.evaluate((f: { path: string; icon: string }[]) => (window as any).__mock.addFiles(f), files);
  // main and gears.json stay open throughout (not before the upload); another data file opens beside them.
  const tabs = [
    { path: 'main.pathogen', name: 'main', kind: 'program', icon: '' },
    ...(opts.mainOnly ? [] : [{ path: 'data/gears.json', name: 'gears.json', kind: 'data', icon: JSON_ICON }]),
  ];
  if (!tabs.some((t) => t.path === opts.open)) {
    tabs.push({ path: opts.open, name: opts.open.slice(opts.open.lastIndexOf('/') + 1), kind: 'data', icon: iconFor(opts.open) });
  }
  await page.evaluate(
    (t: unknown[], active: string) => (window as any).__mock.setTabs(t, active),
    tabs,
    opts.open,
  );
  await page.evaluate((p: string) => (window as any).__mock.setCrumb(p), opts.open);
  await page.evaluate(
    (text: string, mode: string, cursor: number | undefined) => (window as any).__mock.setEditor(text, mode, cursor),
    opts.text,
    opts.mode,
    opts.cursor,
  );
  await page.evaluate((f: { path: string; icon: string }[]) => (window as any).__mock.patchTree(f), files);
  await wait(300);
}

async function shot(page: Page, name: string, theme: string): Promise<void> {
  await page.screenshot({ path: join(DIR, `${name}-${theme}.png`) });
  shots.push(`${name}-${theme}.png`);
}

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
    // 1a. The tree, the gears.json tab, and the editor holding JSON.
    {
      const page = await newPage(theme, false);
      await openWorkspace(page, id);
      await withDataFiles(page, { open: 'data/gears.json', text: GEARS_JSON, mode: 'json' });
      await shot(page, '1a-tree-editor', theme);

      // 1b. A comma missing: the mark at line 3, the error under the data file, the dots.
      await page.evaluate((text: string) => (window as any).__mock.setEditor(text, 'json'), GEARS_JSON_BROKEN);
      await page.evaluate(() => (window as any).__mock.markError(3, 3));
      await page.evaluate((message: string) => {
        const panel = (window as any).__find('error-panel');
        panel.showSections(
          [
            {
              heading: 'data/gears.json',
              file: 'data/gears.json',
              errors: [{ line: 3, column: 3, text: message, steps: [{ kind: 'imported from', file: 'main.pathogen', line: 2 }] }],
            },
          ],
          1,
        );
        const tree = (window as any).__find('file-tree');
        tree.errors = new Map([
          ['data/gears.json', `Line 3: ${message}`],
          ['main.pathogen', 'Stopped at data/gears.json line 3'],
        ]);
      }, JSON_ERROR);
      await page.evaluate((f: unknown) => (window as any).__mock.patchTree(f), DATA_FILES);
      await wait(300);
      await shot(page, '1b-json-error', theme);
      await page.close();
    }

    // 1c. main.pathogen, hovering the imported name.
    {
      const page = await newPage(theme, false);
      await openWorkspace(page, id);
      await withDataFiles(page, { open: 'main.pathogen', text: MAIN_SHOWN, mode: 'pathogen' });
      const pos = MAIN_SHOWN.indexOf('import gears') + 'import '.length;
      await page.evaluate(
        (html: string, at: number) =>
          (window as any).__mock.tooltip('cm-tooltip-hover', `<div class="cm-hover-tooltip">${html}</div>`, at, {
            above: false,
          }),
        HOVER_HTML,
        pos,
      );
      await wait(200);
      await shot(page, '1c-hover', theme);

      // 1d. Completion after `gear.`: the keys of the table's objects.
      const cursor = MAIN_TYPING.indexOf('circle(gear.x, gear.y, gear.') + 'circle(gear.x, gear.y, gear.'.length;
      await page.evaluate(
        (text: string, at: number) => {
          (window as any).__mock.setEditor(text, 'pathogen', at);
          (window as any).__mock.editorView().focus();
        },
        MAIN_TYPING,
        cursor,
      );
      await wait(200);
      const items = COMPLETIONS.map(
        (c, i) =>
          `<li role="option"${i === 0 ? ' aria-selected="true"' : ''}><div class="cm-completionIcon cm-completionIcon-property" aria-hidden="true"></div><span class="cm-completionLabel">${c.label}</span><span class="cm-completionDetail">${c.detail}</span></li>`,
      ).join('');
      await page.evaluate(
        (html: string, at: number) =>
          (window as any).__mock.tooltip('cm-tooltip-autocomplete', `<ul role="listbox" aria-expanded="true">${html}</ul>`, at, {
            above: false,
            dx: -22,
          }),
        items,
        cursor,
      );
      await wait(200);
      await shot(page, '1d-completion', theme);
      await page.close();
    }

    // 2a. The + menu with New data file; 2b. its name field.
    {
      const page = await newPage(theme, false);
      await openWorkspace(page, id);
      await withDataFiles(page, { open: 'data/gears.json', text: GEARS_JSON, mode: 'json' });
      await page.evaluate(() => {
        const tree = (window as any).__find('file-tree');
        tree._setFocusPath('data');
        tree.shadowRoot.querySelector('.add').click();
      });
      await wait(300);
      await page.evaluate(
        (item: { label: string; detail: string }, svg: string) => {
          const tree = (window as any).__find('file-tree');
          const menu = tree.shadowRoot.querySelector('.menu');
          const library = menu.querySelector('[data-action="new-library"]');
          library.insertAdjacentHTML(
            'afterend',
            `<button type="button" role="menuitem" tabindex="-1" data-action="new-data"><span class="icon">${svg}</span><span><span class="label">${item.label}</span><small>${item.detail}</small></span></button>`,
          );
          menu.querySelector('[data-action="new-data"]').focus();
        },
        NEW_DATA_ITEM,
        JSON_ICON,
      );
      await wait(200);
      await shot(page, '2a-plus-menu', theme);
      await page.keyboard.press('Escape');
      await wait(200);
      await page.evaluate(
        (svg: string, hint: string) => {
          const tree = (window as any).__find('file-tree');
          // In data/, where 2a's menu adds.
          tree._startNaming('program', 'data');
          const row = tree.shadowRoot.querySelector('.row.input');
          row.classList.remove('program');
          row.classList.add('data');
          row.querySelector('.icon').innerHTML = svg;
          row.querySelector('.field .ext')?.remove();
          const field = row.querySelector('input');
          field.value = 'trips.json';
          field.style.width = `${field.value.length + 1}ch`;
          field.setAttribute('aria-label', 'New data file name');
          tree.shadowRoot.querySelector('#name-hint').textContent = hint;
          field.focus();
          field.setSelectionRange(field.value.length, field.value.length);
        },
        JSON_ICON,
        NAME_HINT,
      );
      await page.evaluate((f: unknown) => (window as any).__mock.patchTree(f), DATA_FILES);
      await wait(200);
      await shot(page, '2b-name-field', theme);
      // Esc: the field never makes a file.
      await page.keyboard.press('Escape');
      await page.close();
    }

    // 3a. The upload's message; 3b. a save refused for size.
    {
      const page = await newPage(theme, false);
      await openWorkspace(page, id);
      await withDataFiles(page, { open: 'main.pathogen', text: MAIN_SHOWN, mode: 'pathogen', mainOnly: true });
      await page.evaluate((detail: Record<string, unknown>) => {
        const tree = (window as any).__find('file-tree');
        tree.flash(['data/gears.json', 'data/profile.txt']);
        document.dispatchEvent(
          new CustomEvent('show-toast', {
            detail: { ...detail, duration: 600_000, action: { label: 'Undo', onSelect: () => {} } },
          }),
        );
      }, UPLOAD_TOAST);
      // The flash draws the rows again: the data files get their icons back.
      await page.evaluate((f: unknown) => (window as any).__mock.patchTree(f), DATA_FILES);
      await wait(400);
      await shot(page, '3a-upload-message', theme);
      await page.close();
    }
    {
      const page = await newPage(theme, false);
      await openWorkspace(page, id);
      const files = [...DATA_FILES, { path: 'data/trips.json', icon: JSON_ICON }];
      await withDataFiles(page, { files, open: 'data/trips.json', text: TRIPS_JSON, mode: 'json' });
      await page.evaluate((message: string) => {
        const bc = (window as any).__find('app-breadcrumb').shadowRoot;
        const pill = bc.querySelector('.save-status');
        pill.className = 'save-status error';
        pill.textContent = `Error: ${message}`;
        pill.title = message;
      }, SAVE_REFUSED);
      await wait(200);
      await shot(page, '3b-save-refused', theme);

      // 3c. An alternative: the pill says only "Not saved", and an error toast says why. The
      // toast shows two lines of its message, so the docs' sentence is split: the file and its
      // size in the title, the limit and what happens to the edits below.
      await page.evaluate((message: string) => {
        const bc = (window as any).__find('app-breadcrumb').shadowRoot;
        const pill = bc.querySelector('.save-status');
        pill.textContent = 'Not saved';
        pill.title = message;
        document.dispatchEvent(
          new CustomEvent('show-toast', {
            detail: {
              type: 'error',
              title: 'Not saved: data/trips.json is 5.4 MB',
              message: 'A data file can be up to 5 MB in a workspace. Your edits stay in the editor.',
              duration: 600_000,
            },
          }),
        );
      }, SAVE_REFUSED);
      await wait(400);
      await shot(page, '3c-save-refused-toast', theme);

      // 3d. The toast closed: the breadcrumb's save status still reads "Not saved" (the toast
      // sits over it while open).
      await page.evaluate(() => {
        (window as any).__find('app-toast')?.remove();
      });
      await wait(200);
      await shot(page, '3d-not-saved-status', theme);
      await page.close();
    }

    // 1e. On a phone: the tree's panel with the data files.
    {
      const page = await newPage(theme, true);
      await openWorkspace(page, id);
      await withDataFiles(page, { open: 'data/gears.json', text: GEARS_JSON, mode: 'json' });
      await shot(page, '1e-tree-phone', theme);
      await page.close();
    }

    // 4a. A project with data files, on the New Workspace page.
    {
      const page = await newPage(theme, false, true);
      await page.goto(`${PAGES_URL}/workspace/new`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await poll(page, `!!window.__find('new-workspace-view')?.shadowRoot?.querySelector('.import-section')`, 100);
      await wait(400);
      await page.evaluate(
        (json: string, text: string) => {
          const view = (window as any).__find('new-workspace-view');
          view.formData.name = 'gear-studies';
          view._projectName = 'gear-studies';
          view._project = {
            kind: 'plan',
            plan: {
              ok: true,
              title: 'gear-studies/',
              name: 'gear-studies',
              what: '7 files in 2 folders',
              files: {},
              folders: [],
              entryPoints: ['main.pathogen', 'try-sizes.pathogen'],
              modules: ['parts/gears.pathogen'],
              list: 'listed',
              unlisted: [],
              generated: null,
              renamed: [],
              leftOut: [{ name: 'data/trips.json', reason: '82 MB, more than the 5 MB a data file can be in a workspace.' }],
              dropped: [],
            },
          };
          view.render();
          const root = view.shadowRoot;
          root
            .querySelector('style')
            .insertAdjacentHTML('afterend', '<style>.project-files li.data svg { color: var(--text-tertiary); }</style>');
          const module = root.querySelector('.project-files li.module');
          for (const [path, svg] of [
            ['data/gears.json', json],
            ['data/profile.txt', text],
          ]) {
            const row = module.cloneNode(true) as HTMLElement;
            row.className = 'data';
            row.querySelector('svg')!.outerHTML = svg;
            const code = row.querySelector('code')!;
            code.innerHTML = code.innerHTML.replace('parts/', 'data/').replace('gears.pathogen', path.slice(5));
            row.querySelector('.kind')!.textContent = 'data';
            root.querySelector('.project-files').appendChild(row);
          }
          (document.activeElement as HTMLElement | null)?.blur();
        },
        JSON_ICON,
        TEXT_ICON,
      );
      await wait(300);
      await shot(page, '4a-import-project', theme);
      await page.close();
    }
  }
} finally {
  if (id) await api('DELETE', `/workspace/${id}`).catch((e) => errors.push(String(e)));
  await browser.close();
}
if (errors.length) console.error(errors.join('\n'));
console.log(`ok: ${shots.length} screenshots`);

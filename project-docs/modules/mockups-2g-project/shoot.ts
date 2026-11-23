// 2g mockups v1 (note 68): the owner's answers to note 67, drawn on the real
// playground. The script opens a workspace on the dev server, puts the proposed
// markup into the page (the ⋮ menu, the new-workspace page, the Export modal's
// title, the Snapshot popover), and shoots each state, light and dark.
// Nothing here changes the playground's code: the proposals are the strings below.
//
//   npm run dev:stack   (the dev server and the dev API, already built with build:playground:dev)
//   npx tsx project-docs/modules/mockups-2g-project/shoot.ts
//
// Shots: <state>-<theme>.png in this folder.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const root = process.cwd();
const DIR = join(root, 'project-docs', 'modules', 'mockups-2g-project');
const GEARS = join(root, 'project-docs', 'modules', 'mockups-2f-vscode-chip', 'gears-project');
const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ownerId = Array.from(
  { length: 21 },
  () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)],
).join('');

// ── Icons: the file tree's (playground/utils/file-icons.ts) and Material Symbols' folder_zip (weight 300) ──
const icon = (body: string): string =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const PROGRAM = icon(
  '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 16c1.4-2.6 2.6-2.6 4 0s2.6 2.6 4 0"/>',
);
const MODULE = icon('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>');
const FOLDER = icon('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>');
const FOLDER_ZIP_PATH =
  'M640-480v-80h80v80h-80Zm0 80h-80v-80h80v80Zm0 80v-80h80v80h-80ZM447.38-640l-80-80H172.31q-5.39 0-8.85 3.46t-3.46 8.85v455.38q0 5.39 3.46 8.85t8.85 3.46H560v-80h80v80h147.69q5.39 0 8.85-3.46t3.46-8.85v-375.38q0-5.39-3.46-8.85t-8.85-3.46H640v80h-80v-80H447.38ZM172.31-180Q142-180 121-201q-21-21-21-51.31v-455.38Q100-738 121-759q21-21 51.31-21h219.61l80 80h315.77Q818-700 839-679q21 21 21 51.31v375.38Q860-222 839-201q-21 21-51.31 21H172.31ZM160-240v-480 480Z';
const zipIcon = (size: number, cls: string): string =>
  `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 -960 960 960" aria-hidden="true"><path fill="currentColor" d="${FOLDER_ZIP_PATH}"/></svg>`;

// ── 1. Download source, in the ⋮ menu (answer 1) ──
const DOWNLOAD_ITEM = `<button data-action="download-source">${zipIcon(16, 'menu-icon')}<span>Download source<small>A .zip of every file</small></span></button>`;
const COPY_SVG_NAMED = `<span>Copy SVG<small>The program shown: try-sizes</small></span>`;

// What the download holds: drawn beside the menu, as a note on the shot.
const ZIP_NOTE = `
<div id="mock-zip-note" style="position: fixed; right: 16px; top: 150px; width: 300px; z-index: 5000;
  background: var(--bg-elevated); color: var(--text-primary); border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md); box-shadow: var(--shadow-lg); padding: 12px 14px; font: 13px/1.45 var(--font-sans);">
  <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center; font-weight: 600;">
    ${zipIcon(18, 'z')}<span>Gear-studies.zip</span>
  </div>
  <div style="margin: 6px 0 8px; color: var(--text-secondary); font-size: 12px;">What the download holds (a note on the mockup, not part of the page)</div>
  <pre style="margin: 0; font: 12px/1.6 var(--font-mono); color: var(--text-primary);">Gear-studies/
├── pathogen.json
├── main.pathogen
├── try-sizes.pathogen
├── demos/
│   └── train.pathogen
└── parts/
    └── gears.pathogen</pre>
  <div style="margin-top: 8px; color: var(--text-secondary); font-size: 12px;">Each file as the editor holds it, edits not saved yet included. pathogen.json is the one the workspace shows.</div>
</div>`;

// ── 2. Import a project on the new-workspace page (answer 3) ──
const IMPORT_CSS = `
.import-lead { margin: 0 0 0.75rem; font-size: 0.875rem; color: var(--text-secondary, #666); }
.drop-zone { display: grid; justify-items: center; align-content: center; min-height: 6.5rem; box-sizing: border-box; gap: 0.625rem; padding: 1.25rem 1rem;
  border: 1px dashed var(--border-strong, #bbb); border-radius: var(--radius-md, 6px); background: var(--bg-secondary, #f5f5f5); }
.drop-buttons { display: grid; grid-auto-flow: column; gap: 0.75rem; }
.drop-zone .hint { margin: 0; font-size: 0.75rem; color: var(--text-tertiary, #999); }
.drop-zone.dragging { border: 2px dashed var(--accent-color); background: var(--accent-subtle); padding: calc(1.25rem - 1px) calc(1rem - 1px); }
.drop-zone[hidden] { display: none; }
.drop-zone.dragging .drop-buttons { display: none; }
.drop-zone .drop-now { display: none; font-size: 0.875rem; font-weight: 500; color: var(--accent-color); }
.drop-zone.dragging .drop-now { display: block; }
.drop-zone.dragging .hint { display: none; }
.secondary-btn .zip { vertical-align: -3px; margin-right: 0.375rem; }
.project-card { border: 1px solid var(--border-color, #e0e0e0); border-radius: var(--radius-md, 6px); overflow: hidden; }
.project-head { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 0.5rem;
  padding: 0.625rem 0.75rem; background: var(--bg-secondary, #f5f5f5); border-bottom: 1px solid var(--border-color, #e0e0e0); font-size: 0.875rem; }
.project-head .what { color: var(--text-secondary); font-size: 0.8125rem; margin-left: 0.25rem; font-weight: 400; }
.project-head b { font-weight: 600; }
.linkish { background: none; border: 0; padding: 0; color: var(--accent-color); font: inherit; font-size: 0.8125rem; cursor: pointer; }
.project-files { list-style: none; margin: 0; padding: 0.375rem 0; }
.project-files li { display: grid; grid-template-columns: auto 1fr; column-gap: 0.5rem; align-items: center; padding: 0.3125rem 0.75rem; font-size: 0.8125rem; color: var(--text-primary); }
.project-files li svg { color: var(--text-secondary); }
.project-files li.module svg { color: var(--text-tertiary); }
.project-files .p { display: grid; grid-auto-flow: column; justify-content: start; align-items: center; gap: 0.5rem; min-width: 0; }
.project-files code { font-family: var(--font-mono, monospace); font-size: 0.8125rem; overflow-wrap: anywhere; }
.project-files .kind { color: var(--text-tertiary); font-size: 0.75rem; }
.project-files .note { grid-column: 2; color: var(--text-secondary); font-size: 0.75rem; }
.badge-main { padding: 1px 7px; border-radius: 999px; font-size: 10px; font-weight: 600; letter-spacing: 0.02em; line-height: 15px;
  background: var(--secondary-accent-subtle, rgba(148, 97, 196, 0.16)); color: var(--secondary-accent-text, #5e3590); }
.project-foot { padding: 0.5rem 0.75rem 0.625rem; border-top: 1px solid var(--border-subtle, #eee); font-size: 0.75rem; color: var(--text-secondary); }
.project-foot code { font-family: var(--font-mono, monospace); font-size: 0.72rem; }
.project-head svg { color: var(--text-secondary); }
.left-out { margin-top: 0.75rem; padding: 0.625rem 0.75rem; border-radius: var(--radius-md, 6px); border: 1px solid var(--warning-border);
  background: var(--warning-bg); font-size: 0.8125rem; color: var(--text-primary); }
.left-out .head { font-weight: 600; margin-bottom: 0.25rem; }
.left-out ul { margin: 0; padding-left: 1.125rem; }
.left-out li { margin: 0.1875rem 0; overflow-wrap: anywhere; }
.left-out code { font-family: var(--font-mono, monospace); font-size: 0.78rem; }
.refused { margin-top: 0.75rem; padding: 0.625rem 0.75rem; border-radius: var(--radius-md, 6px); border: 1px solid var(--error-border);
  background: var(--error-bg); color: var(--error-text, var(--error-color)); font-size: 0.8125rem; }
`;

const importIdle = (phone: boolean): string => `
<div class="form-section import-section">
  <h2>Or import a project</h2>
  <p class="import-lead">${
    phone
      ? 'A .zip made by Download source, or of a project folder from the CLI or VS Code.'
      : 'A project folder from the CLI or VS Code, or a .zip made by Download source.'
  } Its files, folders and program list come in as they are.</p>
  ${phone ? '<button type="button" class="secondary-btn">Choose .zip…</button>' : ''}
  <div class="drop-zone"${phone ? ' hidden' : ''}>
    <div class="drop-buttons">
      ${phone ? '' : '<button type="button" class="secondary-btn">Choose folder…</button>'}
      <button type="button" class="secondary-btn">Choose .zip…</button>
    </div>
    ${phone ? '' : '<span class="hint">or drop a folder or a .zip here</span>'}
    <span class="drop-now">Drop to import this project</span>
  </div>
</div>`;

interface Row {
  path: string;
  kind: 'program' | 'module';
  main?: boolean;
  note?: string;
}

const headIcon = (title: string): string => (title.endsWith('/') ? FOLDER : zipIcon(18, 'z'));

const card = (title: string, what: string, rows: Row[], foot: string): string => `
<div class="project-card">
  <div class="project-head">${headIcon(title)}<span><b>${title}</b><span class="what">${what}</span></span><button type="button" class="linkish">Choose another…</button></div>
  <ul class="project-files">
    ${rows
      .map(
        (r) => `<li class="${r.kind}">${r.kind === 'module' ? MODULE : PROGRAM}<span class="p"><code>${r.path}</code>${
          r.main ? '<span class="badge-main">main</span>' : ''
        }${r.kind === 'module' ? '<span class="kind">module</span>' : ''}</span>${r.note ? `<span class="note">${r.note}</span>` : ''}</li>`,
      )
      .join('')}
  </ul>
  <div class="project-foot">${foot}</div>
</div>`;

const GEARS_ROWS: Row[] = [
  { path: 'main.pathogen', kind: 'program', main: true },
  { path: 'demos/train.pathogen', kind: 'program' },
  { path: 'try-sizes.pathogen', kind: 'program' },
  { path: 'sketch.pathogen', kind: 'program', note: 'Not in pathogen.json’s list: it joins the end.' },
  { path: 'parts/gears.pathogen', kind: 'module' },
];

const importPicked = `
<div class="form-section import-section">
  <h2>Import a project</h2>
  ${card('gears.zip', '5 files in 2 folders', GEARS_ROWS, 'The main and the program list come from its <code>pathogen.json</code>. Imports between its files work as they did in the folder.')}
</div>`;

const importLeftOut = `
<div class="form-section import-section">
  <h2>Import a project</h2>
  ${card('gears/', '5 files in 2 folders', GEARS_ROWS, 'The main and the program list come from its <code>pathogen.json</code>. Imports between its files work as they did in the folder.')}
  <div class="left-out">
    <div class="head">Not added:</div>
    <ul>
      <li><code>README.md</code>: workspaces hold .pathogen files for now.</li>
      <li><code>fonts/Inter-Regular.ttf</code>: the playground can’t load font files yet. Use the Google Fonts family instead: <code>@font "Inter" 400;</code></li>
      <li><code>out/main.svg</code>: workspaces hold .pathogen files for now.</li>
      <li><code>pathogen.json</code> lists <code>notes.pathogen</code>, which isn’t in the project, so the program list leaves it out.</li>
    </ul>
  </div>
</div>`;

const importNoProjectFile = `
<div class="form-section import-section">
  <h2>Import a project</h2>
  ${card(
    'gears/',
    '5 files in 2 folders',
    [
      { path: 'main.pathogen', kind: 'program', main: true },
      { path: 'demos/train.pathogen', kind: 'program' },
      { path: 'sketch.pathogen', kind: 'program' },
      { path: 'try-sizes.pathogen', kind: 'program' },
      { path: 'parts/gears.pathogen', kind: 'module' },
    ],
    'No <code>pathogen.json</code>: <code>main.pathogen</code> is the main, and the other programs follow by name. Use Set as main to choose another.',
  )}
</div>`;

const importRefused = `
<div class="form-section import-section">
  <h2>Import a project</h2>
  <div class="project-card">
    <div class="project-head">${FOLDER}<span><b>gear-catalog/</b><span class="what">34 .pathogen files in 6 folders</span></span><button type="button" class="linkish">Choose another…</button></div>
  </div>
  <div class="refused" role="alert">A workspace holds at most 20 files, and this project has 34. Nothing was added. To bring part of it in, import a folder holding fewer files.</div>
</div>`;

// ── 3. The program named (answer 4; the naming is question 4 of note 68) ──
const SNAPSHOT_PROGRAM_LINE = `<div class="sub" style="margin-top: 6px;">Of <b>try-sizes</b>, the program shown</div>`;

// ── The page helpers ──
const FIND = `window.__find = (sel) => { const walk = (r) => { const hit = r.querySelector(sel); if (hit) return hit; for (const el of r.querySelectorAll('*')) { const inner = el.shadowRoot ? walk(el.shadowRoot) : null; if (inner) return inner; } return null; }; return walk(document); };`;
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

/**
 * `tall`: the new-workspace page scrolls inside its own view, so a full-page shot
 * stops at the window; a taller window shows the whole form.
 */
async function newPage(theme: string, phone: boolean, tall = false): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport(
    phone
      ? { width: 390, height: tall ? 1000 : 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { width: 1320, height: tall ? 1240 : 860, deviceScaleFactor: 1 },
  );
  page.on('dialog', (d) => void d.accept());
  page.on('pageerror', (e) => errors.push(`${theme}: ${String(e)}`));
  await page.evaluateOnNewDocument(FIND);
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

async function openWorkspace(page: Page, id: string): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  for (let i = 0; i < 150; i++) {
    const ready = await page.evaluate(
      `(() => { const c = window.__find && window.__find('program-chip'); return !!c && !c.hidden && !!c.shadowRoot?.querySelector('.pick .name')?.textContent; })()`,
    );
    if (ready) break;
    await wait(200);
  }
  await wait(800);
}

/** Show a program through the chip, as the owner would. */
async function showProgram(page: Page, path: string): Promise<void> {
  await page.evaluate(`window.__find('program-chip').shadowRoot.querySelector('.pick').click()`);
  await wait(300);
  await page.evaluate(
    `window.__find('program-chip').shadowRoot.querySelector('.prow[data-path="${path}"] .show').click()`,
  );
  await wait(1500);
}

/** Open the ⋮ menu and put the proposals in it. */
async function openMenu(page: Page, opts: { download: boolean; namedCopySvg: boolean }): Promise<void> {
  await page.evaluate(`window.__find('app-breadcrumb').shadowRoot.querySelector('.menu-btn').click()`);
  await wait(300);
  await page.evaluate(
    (download: string | null, copySvg: string | null) => {
      const menu = (window as unknown as { __find: (s: string) => Element }).__find('app-breadcrumb').shadowRoot!;
      if (download) {
        const after = menu.querySelector('[data-action="copy-workspace"]')!;
        after.insertAdjacentHTML('afterend', download);
      }
      if (copySvg) menu.querySelector('[data-action="copy-svg"] span')!.outerHTML = copySvg;
    },
    opts.download ? DOWNLOAD_ITEM : null,
    opts.namedCopySvg ? COPY_SVG_NAMED : null,
  );
  await wait(150);
}

async function shot(page: Page, name: string, theme: string, fullPage = false): Promise<void> {
  await page.screenshot({ path: join(DIR, `${name}-${theme}.png`), fullPage, captureBeyondViewport: fullPage });
  shots.push(`${name}-${theme}.png`);
}

/** The new-workspace page, blank mode, with the import section (or a state of it) in place. */
async function newWorkspacePage(page: Page, sectionHtml: string, opts: { name?: string; dragging?: boolean; hideTemplate?: boolean; subtitle?: string; disableSubmit?: boolean }): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/new`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  for (let i = 0; i < 100; i++) {
    const ready = await page.evaluate(`!!window.__find('new-workspace-view')?.shadowRoot?.querySelector('.actions')`);
    if (ready) break;
    await wait(150);
  }
  await wait(400);
  await page.evaluate(
    (css: string, html: string, o: { name?: string; dragging?: boolean; hideTemplate?: boolean; subtitle?: string; disableSubmit?: boolean }) => {
      const view = (window as unknown as { __find: (s: string) => Element }).__find('new-workspace-view').shadowRoot!;
      view.querySelector('style')!.insertAdjacentHTML('afterend', `<style>${css}</style>`);
      const sections = view.querySelectorAll('.form-section');
      const template = sections[1];
      template.insertAdjacentHTML('afterend', html);
      if (o.hideTemplate) template.remove();
      if (o.dragging) view.querySelector('.drop-zone')!.classList.add('dragging');
      if (o.name !== undefined) (view.querySelector('#name') as HTMLInputElement).value = o.name;
      if (o.subtitle) view.querySelector('.subtitle')!.textContent = o.subtitle;
      if (o.disableSubmit) (view.querySelector('.primary-btn') as HTMLButtonElement).disabled = true;
      (document.activeElement as HTMLElement | null)?.blur();
    },
    IMPORT_CSS,
    sectionHtml,
    opts,
  );
  await wait(200);
}

const errors: string[] = [];
const shots: string[] = [];
const browser = await puppeteer.launch({ headless: 'shell' });
let id = '';
try {
  const read = (p: string) => readFileSync(join(GEARS, p), 'utf8');
  const files: Record<string, string> = {
    'main.pathogen': read('main.pathogen'),
    'demos/train.pathogen': read('demos/train.pathogen'),
    'try-sizes.pathogen': read('try-sizes.pathogen'),
    'parts/gears.pathogen': read('parts/gears.pathogen'),
  };
  const created = await api('POST', '/workspace', {
    name: 'Gear studies',
    files: Object.fromEntries(Object.entries(files).map(([p, text]) => [p, { text }])),
    entryPoints: ['main.pathogen', 'demos/train.pathogen', 'try-sizes.pathogen'],
  });
  id = created.id as string;

  for (const theme of ['light', 'dark']) {
    // 1. The ⋮ menu with Download source; then what the .zip holds.
    {
      const page = await newPage(theme, false);
      await openWorkspace(page, id);
      await openMenu(page, { download: true, namedCopySvg: false });
      await shot(page, '1a-menu', theme);
      await page.evaluate(`window.__find('app-breadcrumb').shadowRoot.querySelector('.menu-btn').click()`);
      // The bar redraws when "Ready" fades; the note is shown after that, as the menu's own feedback.
      await wait(3500);
      await page.evaluate(
        (note: string) => {
          const bc = (window as unknown as { __find: (s: string) => Element }).__find('app-breadcrumb') as unknown as {
            showOverflowFeedback: (m: string) => void;
          };
          bc.showOverflowFeedback('Downloaded Gear-studies.zip');
          document.body.insertAdjacentHTML('beforeend', note);
        },
        ZIP_NOTE,
      );
      await wait(300);
      await shot(page, '1b-downloaded', theme);
      await page.close();
    }
    {
      const page = await newPage(theme, true);
      await openWorkspace(page, id);
      await openMenu(page, { download: true, namedCopySvg: false });
      await shot(page, '1c-menu-phone', theme);
      await page.close();
    }

    // 2. The new-workspace page.
    {
      const page = await newPage(theme, false, true);
      await newWorkspacePage(page, importIdle(false), {});
      await shot(page, '2a-new', theme, true);
      await newWorkspacePage(page, importIdle(false), { dragging: true });
      await shot(page, '2b-dragging', theme, true);
      await newWorkspacePage(page, importPicked, { name: 'gears', hideTemplate: true, subtitle: 'Create a workspace from a project' });
      await shot(page, '2c-picked', theme, true);
      await newWorkspacePage(page, importLeftOut, { name: 'gears', hideTemplate: true, subtitle: 'Create a workspace from a project' });
      await shot(page, '2d-left-out', theme, true);
      await newWorkspacePage(page, importNoProjectFile, { name: 'gears', hideTemplate: true, subtitle: 'Create a workspace from a project' });
      await shot(page, '2e-no-pathogen-json', theme, true);
      await newWorkspacePage(page, importRefused, { name: 'gear-catalog', hideTemplate: true, subtitle: 'Create a workspace from a project', disableSubmit: true });
      await shot(page, '2f-refused', theme, true);
      await page.close();
    }
    {
      const page = await newPage(theme, true, true);
      await newWorkspacePage(page, importIdle(true), {});
      await shot(page, '2g-new-phone', theme, true);
      await newWorkspacePage(page, importPicked, { name: 'gears', hideTemplate: true, subtitle: 'Create a workspace from a project' });
      await shot(page, '2h-picked-phone', theme, true);
      await page.close();
    }

    // 3. The program named, with try-sizes in the preview.
    {
      const page = await newPage(theme, false);
      await openWorkspace(page, id);
      await showProgram(page, 'try-sizes.pathogen');
      await openMenu(page, { download: true, namedCopySvg: true });
      await shot(page, '3a-copy-svg', theme);
      await page.evaluate(`window.__find('app-breadcrumb').shadowRoot.querySelector('[data-action="export"]').click()`);
      for (let i = 0; i < 50; i++) {
        const open = await page.evaluate(`!!window.__find('export-modal')?.shadowRoot?.querySelector('.form-header h2')`);
        if (open) break;
        await wait(150);
      }
      await wait(1500);
      await page.evaluate(`window.__find('export-modal').shadowRoot.querySelector('.form-header h2').textContent = 'Export try-sizes'`);
      await shot(page, '3b-export', theme);
      await page.keyboard.press('Escape');
      await wait(400);
      await page.evaluate(`(() => { const m = window.__find('export-modal'); if (m && m.shadowRoot.querySelector('.close-btn')) m.shadowRoot.querySelector('.close-btn').click(); })()`);
      await wait(400);
      await page.evaluate(`window.__find('app-breadcrumb').shadowRoot.querySelector('#snapshot-btn').click()`);
      await wait(800);
      await page.evaluate(
        (line: string) => {
          const pop = document.querySelector('snapshot-popover') as unknown as {
            setState: (s: unknown) => void;
            shadowRoot: ShadowRoot;
          };
          // Keep the card image the controller already drew.
          const thumb = pop.shadowRoot.querySelector('img')?.getAttribute('src') ?? null;
          pop.setState({ kind: 'naming', thumbUrl: thumb, name: 'Gear studies #1', stale: null });
          pop.shadowRoot.querySelector('.row input')!.insertAdjacentHTML('afterend', line);
          (document.activeElement as HTMLElement | null)?.blur();
        },
        SNAPSHOT_PROGRAM_LINE,
      );
      await wait(1200);
      await shot(page, '3c-snapshot', theme);
      await page.close();
    }
  }
} finally {
  if (id) await api('DELETE', `/workspace/${id}`).catch((e) => errors.push(String(e)));
  await browser.close();
}
if (errors.length) console.error(errors.join('\n'));
console.log(`ok: ${shots.length} screenshots`);

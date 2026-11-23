// 2g mockups v2 (note 69): the owner's answers to note 68, on the states that
// change from v1 (../mockups-2g-project/, kept as it was):
// - the menu item is "Download workspace" (1a, 1b, 1c, 3a), and the import's
//   lead names it (2a, 2g);
// - a folder with no pathogen.json shows the one the workspace will write (2e);
// - a pathogen.json that can't be read stops the import (2i, new).
// As in v1, the script opens a workspace on the dev playground, puts the
// proposed markup into the real page, and shoots each state, light and dark.
//
//   npm run dev:stack   (the dev server and the dev API, built with build:playground:dev)
//   npx tsx project-docs/modules/mockups-2g-project-v2/shoot.ts

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import puppeteer from 'puppeteer';

import { parseProjectFile } from '../../../src/host/project';
import { projectFileText } from '../../../src/workspace/files';

import type { Page } from 'puppeteer';

const root = process.cwd();
const DIR = join(root, 'project-docs', 'modules', 'mockups-2g-project-v2');
const GEARS = join(root, 'project-docs', 'modules', 'mockups-2f-vscode-chip', 'gears-project');
const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ownerId = Array.from(
  { length: 21 },
  () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)],
).join('');

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Icons: the file tree's (playground/utils/file-icons.ts) and Material Symbols' folder_zip (weight 300) ──
const icon = (body: string): string =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const PROGRAM = icon(
  '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 16c1.4-2.6 2.6-2.6 4 0s2.6 2.6 4 0"/>',
);
const MODULE = icon('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>');
const JSON_ICON = icon(
  '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/>',
);
const FOLDER = icon('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>');
const FOLDER_ZIP_PATH =
  'M640-480v-80h80v80h-80Zm0 80h-80v-80h80v80Zm0 80v-80h80v80h-80ZM447.38-640l-80-80H172.31q-5.39 0-8.85 3.46t-3.46 8.85v455.38q0 5.39 3.46 8.85t8.85 3.46H560v-80h80v80h147.69q5.39 0 8.85-3.46t3.46-8.85v-375.38q0-5.39-3.46-8.85t-8.85-3.46H640v80h-80v-80H447.38ZM172.31-180Q142-180 121-201q-21-21-21-51.31v-455.38Q100-738 121-759q21-21 51.31-21h219.61l80 80h315.77Q818-700 839-679q21 21 21 51.31v375.38Q860-222 839-201q-21 21-51.31 21H172.31ZM160-240v-480 480Z';
const zipIcon = (size: number, cls: string): string =>
  `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 -960 960 960" aria-hidden="true"><path fill="currentColor" d="${FOLDER_ZIP_PATH}"/></svg>`;

// ── 1. Download workspace, in the ⋮ menu (answer on note 68: the name) ──
const DOWNLOAD_ITEM = `<button data-action="download-workspace">${zipIcon(16, 'menu-icon')}<span>Download workspace<small>A .zip of every file</small></span></button>`;
const COPY_SVG_NAMED = `<span>Copy SVG<small>The program shown: try-sizes</small></span>`;

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

// ── 2. Import a project on the new-workspace page ──
const IMPORT_CSS = `
.import-lead { margin: 0 0 0.75rem; font-size: 0.875rem; color: var(--text-secondary, #666); }
.drop-zone { display: grid; justify-items: center; align-content: center; min-height: 6.5rem; box-sizing: border-box; gap: 0.625rem; padding: 1.25rem 1rem;
  border: 1px dashed var(--border-strong, #bbb); border-radius: var(--radius-md, 6px); background: var(--bg-secondary, #f5f5f5); }
.drop-zone[hidden] { display: none; }
.drop-buttons { display: grid; grid-auto-flow: column; gap: 0.75rem; }
.drop-zone .hint { margin: 0; font-size: 0.75rem; color: var(--text-tertiary, #999); }
.drop-zone .drop-now { display: none; }
.project-card { border: 1px solid var(--border-color, #e0e0e0); border-radius: var(--radius-md, 6px); overflow: hidden; }
.project-head { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 0.5rem;
  padding: 0.625rem 0.75rem; background: var(--bg-secondary, #f5f5f5); border-bottom: 1px solid var(--border-color, #e0e0e0); font-size: 0.875rem; }
.project-head .what { color: var(--text-secondary); font-size: 0.8125rem; margin-left: 0.25rem; font-weight: 400; }
.project-head b { font-weight: 600; }
.project-head svg { color: var(--text-secondary); }
.linkish { background: none; border: 0; padding: 0; color: var(--accent-color); font: inherit; font-size: 0.8125rem; cursor: pointer; }
.project-files { list-style: none; margin: 0; padding: 0.375rem 0; }
.project-files li { display: grid; grid-template-columns: auto 1fr; column-gap: 0.5rem; align-items: center; padding: 0.3125rem 0.75rem; font-size: 0.8125rem; color: var(--text-primary); }
.project-files li svg { color: var(--text-secondary); }
.project-files li.module svg, .project-files li.json svg { color: var(--text-tertiary); }
.project-files .p { display: grid; grid-auto-flow: column; justify-content: start; align-items: center; gap: 0.5rem; min-width: 0; }
.project-files code { font-family: var(--font-mono, monospace); font-size: 0.8125rem; overflow-wrap: anywhere; }
.project-files .kind { color: var(--text-tertiary); font-size: 0.75rem; }
.project-files .new { padding: 1px 7px; border-radius: 999px; font-size: 10px; font-weight: 600; line-height: 15px;
  background: var(--accent-subtle); color: var(--accent-color); }
.badge-main { padding: 1px 7px; border-radius: 999px; font-size: 10px; font-weight: 600; letter-spacing: 0.02em; line-height: 15px;
  background: var(--secondary-accent-subtle, rgba(148, 97, 196, 0.16)); color: var(--secondary-accent-text, #5e3590); }
.project-foot { padding: 0.5rem 0.75rem 0.625rem; border-top: 1px solid var(--border-subtle, #eee); font-size: 0.75rem; color: var(--text-secondary); }
.project-foot code { font-family: var(--font-mono, monospace); font-size: 0.72rem; }
.project-foot pre { margin: 0.5rem 0; padding: 0.5rem 0.625rem; border-radius: var(--radius-sm, 4px); background: var(--bg-secondary, #f5f5f5);
  border: 1px solid var(--border-subtle, #eee); font: 0.75rem/1.5 var(--font-mono, monospace); color: var(--text-primary); overflow-x: auto; }
.refused { margin-top: 0.75rem; padding: 0.625rem 0.75rem; border-radius: var(--radius-md, 6px); border: 1px solid var(--error-border);
  background: var(--error-bg); color: var(--error-text, var(--error-color)); font-size: 0.8125rem; }
.refused p { margin: 0; }
.refused p + p { margin-top: 0.375rem; }
.refused code, .refused .said { font-family: var(--font-mono, monospace); font-size: 0.78rem; overflow-wrap: anywhere; }
`;

const importIdle = (phone: boolean): string => `
<div class="form-section import-section">
  <h2>Or import a project</h2>
  <p class="import-lead">${
    phone
      ? 'A .zip made by Download workspace, or of a project folder from the CLI or VS Code.'
      : 'A project folder from the CLI or VS Code, or a .zip made by Download workspace.'
  } Its files, folders and program list come in as they are.</p>
  ${phone ? '<button type="button" class="secondary-btn">Choose .zip…</button>' : ''}
  <div class="drop-zone"${phone ? ' hidden' : ''}>
    <div class="drop-buttons">
      <button type="button" class="secondary-btn">Choose folder…</button>
      <button type="button" class="secondary-btn">Choose .zip…</button>
    </div>
    <span class="hint">or drop a folder or a .zip here</span>
  </div>
</div>`;

interface Row {
  path: string;
  kind: 'program' | 'module' | 'json';
  main?: boolean;
}

const rowIcon = (kind: Row['kind']): string => (kind === 'module' ? MODULE : kind === 'json' ? JSON_ICON : PROGRAM);

// Answer 2 on note 68, and "on import, the web app should offer to generate a 'pathogen.json' file":
// the file the workspace will write, from the workspace's one writer.
const GENERATED_LIST = ['main.pathogen', 'demos/train.pathogen', 'sketch.pathogen', 'try-sizes.pathogen'];
const GENERATED_TEXT = projectFileText(GENERATED_LIST);

const importNoProjectFile = `
<div class="form-section import-section">
  <h2>Import a project</h2>
  <div class="project-card">
    <div class="project-head">${FOLDER}<span><b>gears/</b><span class="what">5 files in 2 folders</span></span><button type="button" class="linkish">Choose another…</button></div>
    <ul class="project-files">
      ${(
        [
          { path: 'main.pathogen', kind: 'program', main: true },
          { path: 'demos/train.pathogen', kind: 'program' },
          { path: 'sketch.pathogen', kind: 'program' },
          { path: 'try-sizes.pathogen', kind: 'program' },
          { path: 'parts/gears.pathogen', kind: 'module' },
        ] as Row[]
      )
        .map(
          (r) => `<li class="${r.kind}">${rowIcon(r.kind)}<span class="p"><code>${r.path}</code>${
            r.main ? '<span class="badge-main">main</span>' : ''
          }${r.kind === 'module' ? '<span class="kind">module</span>' : ''}</span></li>`,
        )
        .join('')}
      <li class="json">${JSON_ICON}<span class="p"><code>pathogen.json</code><span class="new">new</span></span></li>
    </ul>
    <div class="project-foot">
      This folder has no <code>pathogen.json</code>, so the workspace writes one. <code>main.pathogen</code> is the main, and the other programs follow by name:
      <pre>${esc(GENERATED_TEXT.trimEnd())}</pre>
      Use Set as main in the workspace to choose another main.
    </div>
  </div>
</div>`;

// Answer 3 on note 68: "notify the user that they have a malformed pathogen.json file, and ask them to fix it before uploading".
const parsed = parseProjectFile('{ "main": "main.pathogen" }\n', 'gears');
if (parsed.ok) throw new Error('expected the old "main" key to be refused');
const MALFORMED_MESSAGE = parsed.message;

const importMalformed = `
<div class="form-section import-section">
  <h2>Import a project</h2>
  <div class="project-card">
    <div class="project-head">${FOLDER}<span><b>gears/</b><span class="what">5 files in 2 folders</span></span><button type="button" class="linkish">Choose another…</button></div>
  </div>
  <div class="refused" role="alert">
    <p>This project’s <code>pathogen.json</code> can’t be read, so nothing was added. Fix the file, then choose the folder again:</p>
    <p class="said">${esc(MALFORMED_MESSAGE)}</p>
  </div>
</div>`;

// ── The page helpers (as in v1) ──
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

/** `tall`: the new-workspace page scrolls inside its own view, so a taller window shows the whole form. */
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

async function showProgram(page: Page, path: string): Promise<void> {
  await page.evaluate(`window.__find('program-chip').shadowRoot.querySelector('.pick').click()`);
  await wait(300);
  await page.evaluate(
    `window.__find('program-chip').shadowRoot.querySelector('.prow[data-path="${path}"] .show').click()`,
  );
  await wait(1500);
}

async function openMenu(page: Page, opts: { namedCopySvg: boolean }): Promise<void> {
  await page.evaluate(`window.__find('app-breadcrumb').shadowRoot.querySelector('.menu-btn').click()`);
  await wait(300);
  await page.evaluate(
    (download: string, copySvg: string | null) => {
      const menu = (window as unknown as { __find: (s: string) => Element }).__find('app-breadcrumb').shadowRoot!;
      menu.querySelector('[data-action="copy-workspace"]')!.insertAdjacentHTML('afterend', download);
      if (copySvg) menu.querySelector('[data-action="copy-svg"] span')!.outerHTML = copySvg;
    },
    DOWNLOAD_ITEM,
    opts.namedCopySvg ? COPY_SVG_NAMED : null,
  );
  await wait(150);
}

async function shot(page: Page, name: string, theme: string): Promise<void> {
  await page.screenshot({ path: join(DIR, `${name}-${theme}.png`) });
  shots.push(`${name}-${theme}.png`);
}

async function newWorkspacePage(
  page: Page,
  sectionHtml: string,
  opts: { name?: string; hideTemplate?: boolean; subtitle?: string; disableSubmit?: boolean },
): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/new`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  for (let i = 0; i < 100; i++) {
    const ready = await page.evaluate(`!!window.__find('new-workspace-view')?.shadowRoot?.querySelector('.actions')`);
    if (ready) break;
    await wait(150);
  }
  await wait(400);
  await page.evaluate(
    (css: string, html: string, o: { name?: string; hideTemplate?: boolean; subtitle?: string; disableSubmit?: boolean }) => {
      const view = (window as unknown as { __find: (s: string) => Element }).__find('new-workspace-view').shadowRoot!;
      view.querySelector('style')!.insertAdjacentHTML('afterend', `<style>${css}</style>`);
      const template = view.querySelectorAll('.form-section')[1];
      template.insertAdjacentHTML('afterend', html);
      if (o.hideTemplate) template.remove();
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
  const FROM_PROJECT = 'Create a workspace from a project';

  for (const theme of ['light', 'dark']) {
    {
      const page = await newPage(theme, false);
      await openWorkspace(page, id);
      await openMenu(page, { namedCopySvg: false });
      await shot(page, '1a-menu', theme);
      await page.evaluate(`window.__find('app-breadcrumb').shadowRoot.querySelector('.menu-btn').click()`);
      // The bar redraws when "Ready" fades; the feedback is shown after that.
      await wait(3500);
      await page.evaluate((note: string) => {
        const bc = (window as unknown as { __find: (s: string) => Element }).__find('app-breadcrumb') as unknown as {
          showOverflowFeedback: (m: string) => void;
        };
        bc.showOverflowFeedback('Downloaded Gear-studies.zip');
        document.body.insertAdjacentHTML('beforeend', note);
      }, ZIP_NOTE);
      await wait(300);
      await shot(page, '1b-downloaded', theme);
      await page.close();
    }
    {
      const page = await newPage(theme, true);
      await openWorkspace(page, id);
      await openMenu(page, { namedCopySvg: false });
      await shot(page, '1c-menu-phone', theme);
      await page.close();
    }
    {
      const page = await newPage(theme, false, true);
      await newWorkspacePage(page, importIdle(false), {});
      await shot(page, '2a-new', theme);
      await newWorkspacePage(page, importNoProjectFile, { name: 'gears', hideTemplate: true, subtitle: FROM_PROJECT });
      await shot(page, '2e-no-pathogen-json', theme);
      await newWorkspacePage(page, importMalformed, {
        name: 'gears',
        hideTemplate: true,
        subtitle: FROM_PROJECT,
        disableSubmit: true,
      });
      await shot(page, '2i-malformed', theme);
      await page.close();
    }
    {
      const page = await newPage(theme, true, true);
      await newWorkspacePage(page, importIdle(true), {});
      await shot(page, '2g-new-phone', theme);
      await page.close();
    }
    {
      const page = await newPage(theme, false);
      await openWorkspace(page, id);
      await showProgram(page, 'try-sizes.pathogen');
      await openMenu(page, { namedCopySvg: true });
      await shot(page, '3a-copy-svg', theme);
      await page.close();
    }
  }
} finally {
  if (id) await api('DELETE', `/workspace/${id}`).catch((e) => errors.push(String(e)));
  await browser.close();
}
if (errors.length) console.error(errors.join('\n'));
console.log(`ok: ${shots.length} screenshots`);

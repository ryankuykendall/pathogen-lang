/**
 * 2f: the program chip in VS Code's preview, as shipped (docs/projects.md
 * "The preview in VS Code"; project-docs/modules/66-phase-2f-plan.md).
 * Requires `npm run build:vscode` first. Drives:
 *   A. the extension host's side from out/, with the library from the bundled
 *      server/node_modules, as preview.ts loads it: the project, the list,
 *      and each program drawn small on the real drawing thread
 *      (out/programs-thread.js + out/programs-worker.js);
 *   B. the real webview page (out/webview-html.js) under its real CSP in
 *      headless Chrome, with the bundled compiler/ scripts (the chip comes
 *      with compiler/pan-zoom.global.js), fed the messages the host sends.
 * Screenshots in VS Code's Dark Modern and Light Modern go to 2f-preview/,
 * to compare with the approved mockup (mockups-2f-vscode-chip/).
 *
 * Run from the repo root: node project-docs/modules/verify/verify-2f-preview.mjs
 * Writes verify-2f-preview-results.json beside this script; exits 1 on a failure.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const ext = join(root, 'packages', 'vscode-pathogen');
const require = createRequire(import.meta.url);
const shots = join(here, '2f-preview');
mkdirSync(shots, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  — ${detail}`}`);
};

// ── The project: a copy of the mockup's gears-project ─────────────────────────
mkdirSync(join(root, 'tmp'), { recursive: true });
const scratch = mkdtempSync(join(root, 'tmp', 'verify-2f-'));
const project = join(scratch, 'gears-project');
cpSync(join(here, '..', 'mockups-2f-vscode-chip', 'gears-project'), project, { recursive: true });
const at = (p) => join(project, ...p.split('/'));
const read = (p) => readFileSync(at(p), 'utf8');

// ── A. The extension host's side, as shipped ──────────────────────────────────
const bundled = createRequire(join(ext, 'server', 'node_modules', '_resolve.js'));
const paths = { lib: bundled.resolve('pathogen-lang'), node: bundled.resolve('pathogen-lang/node') };
const libs = { lib: bundled('pathogen-lang'), node: bundled('pathogen-lang/node') };
const { readProject, ProgramChoices, programRows, chipAlert, projectPath } = require(
  join(ext, 'out', 'preview-programs.js'),
);
const { previewModules } = require(join(ext, 'out', 'preview-modules.js'));
const { DrawingThread } = require(join(ext, 'out', 'programs-thread.js'));

// The module edited (state 3 of the mockup), and try-sizes broken (state 6), in open tabs.
const editedGears = read('parts/gears.pathogen').replace('toothDepth = 6', 'toothDepth = 10');
const brokenTry = read('try-sizes.pathogen').replace('20 + i * 10, Teeth.Standard', '20 + i * 10');
const open = new Map([
  [at('parts/gears.pathogen'), editedGears],
  [at('try-sizes.pathogen'), brokenTry],
]);
const texts = {
  open: (p) => open.get(p),
  read: (p) => {
    if (open.has(p)) return open.get(p);
    try {
      return readFileSync(p, 'utf8');
    } catch {
      return undefined;
    }
  },
};

const found = await readProject(at('sketch.pathogen'), libs, texts);
check(
  'A1 gears-project is a project with a main: the main, then entryPoints in order',
  found &&
    found.main === at('main.pathogen') &&
    JSON.stringify(found.listed.map((f) => projectPath(project, f))) ===
      JSON.stringify(['main.pathogen', 'demos/train.pathogen', 'try-sizes.pathogen']),
  JSON.stringify(found && { main: found.main, listed: found.listed }),
);

const choices = new ProgramChoices(libs.lib.isModuleSource, texts);
const shown = choices.show(at('parts/gears.pathogen'), editedGears, found, true);
check(
  "A2 the preview button on a module's tab shows the main",
  shown.kind === 'program' && shown.path === at('main.pathogen'),
);

// Every program drawn small on the real thread, sketch (not listed) as the file being edited.
const thread = new DrawingThread(join(ext, 'out', 'programs-worker.js'), paths);
const drawn = new Map();
try {
  for (const program of [...found.listed, at('sketch.pathogen')]) {
    drawn.set(program, await thread.draw(program, [...open]));
  }
} finally {
  thread.dispose();
}
const miniatureOk = (p) => /^data:image\/svg\+xml;charset=utf-8,/.test(drawn.get(at(p))?.miniature ?? '');
check(
  "A3 the programs drawn small on the drawing thread: miniatures, and the broken one its row's words",
  miniatureOk('main.pathogen') &&
    miniatureOk('demos/train.pathogen') &&
    miniatureOk('sketch.pathogen') &&
    drawn.get(at('try-sizes.pathogen')).error === 'Error in try-sizes.pathogen line 13',
  JSON.stringify([...drawn].map(([p, d]) => [projectPath(project, p), d.error, d.miniature?.length ?? null])),
);
const mainSvg = decodeURIComponent(drawn.get(at('main.pathogen')).miniature.split(',').slice(1).join(','));
check(
  "A4 main's miniature is drawn with the module's unsaved edit (toothDepth = 10)",
  mainSvg.includes('<rect x="0" y="0" width="200" height="120" fill="#ffffff"/>'),
  mainSvg.slice(0, 200),
);

const rowOf = (file) => {
  const d = drawn.get(file);
  return d && { ...d, updating: false };
};
// State 3/5/6 together: main shown, the module being edited (dots), sketch joining the list, try-sizes broken.
const listFor = (editingFile, editingProgram) => {
  const { items } = programRows(found, at('main.pathogen'), editingFile, editingProgram, rowOf);
  const shownPath = 'main.pathogen';
  return {
    type: 'programs',
    items,
    shown: shownPath,
    editing: projectPath(project, editingFile),
    alert: chipAlert(items, shownPath),
  };
};
const programsModule = listFor(at('parts/gears.pathogen'), null);
const programsSketch = listFor(at('sketch.pathogen'), at('sketch.pathogen'));
check(
  "A5 the rows: dots on the programs that import the module, the broken row's words, the red dot",
  JSON.stringify(programsModule.items.map((i) => [i.path, i.uses, i.error])) ===
    JSON.stringify([
      ['main.pathogen', 'import', null],
      ['demos/train.pathogen', 'import', null],
      ['try-sizes.pathogen', 'import', 'Error in try-sizes.pathogen line 13'],
    ]) && programsModule.alert === 'Another program has an error',
  JSON.stringify(programsModule.items.map((i) => [i.path, i.uses, i.error, i.note])),
);
check(
  'A6 a program not in pathogen.json joins the end while you edit it, said so',
  programsSketch.items.at(-1).path === 'sketch.pathogen' && programsSketch.items.at(-1).note === 'not in pathogen.json',
  JSON.stringify(programsSketch.items.at(-1)),
);

const mainImports = await previewModules(libs, at('main.pathogen'), read('main.pathogen'), (p) => open.get(p));
const mainUpdate = {
  type: 'update',
  seq: 1,
  uri: 'file:///main.pathogen',
  source: read('main.pathogen'),
  fontIds: [],
  notices: [],
  errors: [],
  modules: JSON.parse(JSON.stringify(mainImports.message)),
};

// ── B. The real webview page, real CSP, bundled scripts ───────────────────────
const TYPES = { '.js': 'text/javascript', '.html': 'text/html' };
const { getWebviewContent } = require(join(ext, 'out', 'webview-html.js'));
let page = '';
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(page);
    return;
  }
  try {
    const body = readFileSync(join(ext, url.pathname));
    res.writeHead(200, { 'content-type': TYPES[extname(url.pathname)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
page = getWebviewContent(
  `${base}/compiler/index.global.js`,
  `${base}/compiler/pan-zoom.global.js`,
  base,
  'verifynonce',
);

// VS Code's Dark Modern and Light Modern, as the webview's --vscode-* variables (the mockup's values).
const THEMES = {
  dark: {
    '--vscode-editor-background': '#1f1f1f',
    '--vscode-editor-foreground': '#cccccc',
    '--vscode-foreground': '#cccccc',
    '--vscode-descriptionForeground': '#9d9d9d',
    '--vscode-titleBar-activeBackground': '#181818',
    '--vscode-panel-border': '#2b2b2b',
    '--vscode-focusBorder': '#0078d4',
    '--vscode-button-background': '#0078d4',
    '--vscode-button-foreground': '#ffffff',
    '--vscode-button-border': '#3c3c3c',
    '--vscode-input-border': '#3c3c3c',
    '--vscode-editorWidget-background': '#202020',
    '--vscode-widget-shadow': 'rgba(0, 0, 0, 0.36)',
    '--vscode-list-hoverBackground': '#2a2d2e',
    '--vscode-errorForeground': '#f85149',
    '--vscode-font-family': '-apple-system, BlinkMacSystemFont, sans-serif',
    '--vscode-editor-font-family': 'Menlo, Monaco, monospace',
  },
  light: {
    '--vscode-editor-background': '#ffffff',
    '--vscode-editor-foreground': '#3b3b3b',
    '--vscode-foreground': '#3b3b3b',
    '--vscode-descriptionForeground': '#616161',
    '--vscode-titleBar-activeBackground': '#f8f8f8',
    '--vscode-panel-border': '#e5e5e5',
    '--vscode-focusBorder': '#005fb8',
    '--vscode-button-background': '#005fb8',
    '--vscode-button-foreground': '#ffffff',
    '--vscode-button-border': '#d4d4d4',
    '--vscode-input-border': '#cecece',
    '--vscode-editorWidget-background': '#f8f8f8',
    '--vscode-widget-shadow': 'rgba(0, 0, 0, 0.16)',
    '--vscode-list-hoverBackground': '#f2f2f2',
    '--vscode-errorForeground': '#d1242f',
    '--vscode-font-family': '-apple-system, BlinkMacSystemFont, sans-serif',
    '--vscode-editor-font-family': 'Menlo, Monaco, monospace',
  },
};

const browser = await puppeteer.launch({ headless: 'shell' });
try {
  for (const [themeName, theme] of Object.entries(THEMES)) {
    const tab = await browser.newPage();
    await tab.setViewport({ width: 720, height: 560, deviceScaleFactor: 2 });
    const pageErrors = [];
    tab.on('pageerror', (e) => pageErrors.push(String(e && e.message)));
    await tab.evaluateOnNewDocument((vars) => {
      window.__posted = [];
      window.__csp = [];
      window.acquireVsCodeApi = () => ({ postMessage: (m) => window.__posted.push(m), getState() {}, setState() {} });
      document.addEventListener('securitypolicyviolation', (e) =>
        window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
      );
      // VS Code sets its theme's variables on the page's root element.
      document.addEventListener('DOMContentLoaded', () => {
        for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
      });
    }, theme);
    await tab.goto(base, { waitUntil: 'load' });
    await tab.waitForFunction(() => window.__posted.some((m) => m.type === 'ready'), { timeout: 10000 });
    const send = (msg) => tab.evaluate((m) => window.postMessage(m, '*'), msg);
    const posted = () => tab.evaluate(() => window.__posted);
    const waitStatus = (text) =>
      tab.waitForFunction((t) => document.getElementById('status').textContent === t, { timeout: 15000 }, text);
    const T = themeName === 'dark' ? 'B' : 'C';

    await send(mainUpdate);
    await waitStatus('Compiled');
    const hiddenAlone = await tab.evaluate(() => document.getElementById('program-chip').hidden);
    await send({
      type: 'programs',
      items: [programsModule.items[0]],
      shown: 'main.pathogen',
      editing: 'main.pathogen',
      alert: null,
    });
    const hiddenOne = await tab.evaluate(() => document.getElementById('program-chip').hidden);
    await send(programsModule);
    const geometry = await tab.evaluate(() => {
      const pill = document.getElementById('zoom-pill').getBoundingClientRect();
      const c = document.getElementById('program-chip');
      const pick = c.shadowRoot.querySelector('.pick').getBoundingClientRect();
      return {
        hidden: c.hidden,
        defined: Boolean(customElements.get('program-chip')),
        name: c.shadowRoot.querySelector('.pick .name').textContent,
        dot: c.shadowRoot.querySelector('.pick-err')?.title ?? null,
        pillRight: pill.right,
        chipLeft: pick.left,
        pillMid: (pill.top + pill.bottom) / 2,
        chipMid: (pick.top + pick.bottom) / 2,
        pillHeight: pill.height,
        chipHeight: pick.height,
        pickBg: getComputedStyle(c.shadowRoot.querySelector('.pick')).backgroundColor,
      };
    });
    check(
      `${T}1b [${themeName}] the chip and the zoom controls are one height, 34 px, as in the playground (2026-11-23)`,
      geometry.pillHeight === 34 && geometry.chipHeight === 34,
      JSON.stringify({ pill: geometry.pillHeight, chip: geometry.chipHeight }),
    );
    check(
      `${T}1 [${themeName}] the chip: hidden with fewer than two programs, then beside the zoom controls, naming the program shown, with the red dot`,
      hiddenAlone &&
        hiddenOne &&
        geometry.defined &&
        !geometry.hidden &&
        geometry.name === 'main' &&
        geometry.dot === 'Another program has an error' &&
        geometry.chipLeft > geometry.pillRight &&
        Math.abs(geometry.pillMid - geometry.chipMid) < 3,
      JSON.stringify({ hiddenAlone, hiddenOne, ...geometry }),
    );
    const widgetBg = themeName === 'dark' ? 'rgb(32, 32, 32)' : 'rgb(248, 248, 248)';
    check(`${T}2 [${themeName}] the chip takes VS Code's colours`, geometry.pickBg === widgetBg, geometry.pickBg);
    await tab.screenshot({ path: join(shots, `closed-${themeName}.png`) });

    // A press-and-drag that starts on the chip is the chip's, not a pan of the drawing.
    const viewBefore = await tab.$eval('#preview', (el) => el.getAttribute('viewBox'));
    const pickBox = await tab.evaluate(() => {
      const r = document.getElementById('program-chip').shadowRoot.querySelector('.pick').getBoundingClientRect();
      return { x: r.left + 8, y: r.top + r.height / 2 };
    });
    await tab.mouse.move(pickBox.x, pickBox.y);
    await tab.mouse.down();
    await tab.mouse.move(pickBox.x - 120, pickBox.y - 80, { steps: 6 });
    await tab.mouse.up();
    await new Promise((r) => setTimeout(r, 400));
    const viewAfter = await tab.$eval('#preview', (el) => el.getAttribute('viewBox'));
    check(
      `${T}3 [${themeName}] dragging from the chip doesn't pan the drawing`,
      viewBefore === viewAfter,
      `${viewBefore} → ${viewAfter}`,
    );
    // That press was also a click: it opened the list.
    const list = await tab.evaluate(async () => {
      const c = document.getElementById('program-chip');
      if (!c.isOpen) c.shadowRoot.querySelector('.pick').click();
      const root = c.shadowRoot;
      const imgs = [...root.querySelectorAll('.prow img')];
      await Promise.all(
        imgs.map((img) => (img.complete ? null : new Promise((r) => img.addEventListener('load', r, { once: true })))),
      );
      const l = root.querySelector('.list').getBoundingClientRect();
      const pick = root.querySelector('.pick').getBoundingClientRect();
      return {
        open: c.isOpen,
        upward: l.bottom <= pick.top + 1,
        position: getComputedStyle(root.querySelector('.list')).position,
        rows: [...root.querySelectorAll('.prow')].map((r) => ({
          name: r.querySelector('.nm').textContent,
          sub: (r.querySelector('.p') ?? r.querySelector('.e')).textContent,
          dot: r.querySelector('.udot')?.title ?? null,
          img: r.querySelector('img') ? r.querySelector('img').naturalWidth > 0 : null,
          check: Boolean(r.querySelector('.chk')),
        })),
      };
    });
    const nbsp = String.fromCodePoint(0xa0);
    check(
      `${T}4 [${themeName}] the list opens upward: each program with its miniature, name and path; the dots; the broken row`,
      list.open &&
        list.upward &&
        list.position === 'absolute' &&
        JSON.stringify(list.rows.map((r) => [r.name, r.sub.replace(nbsp, ' '), r.img, r.check])) ===
          JSON.stringify([
            ['main', 'main.pathogen', true, true],
            ['train', 'demos/train.pathogen', true, false],
            ['try-sizes', 'Error in try-sizes.pathogen line 13', null, false],
          ]) &&
        list.rows.every((r) => r.dot === 'Uses parts/gears.pathogen, the file you’re editing'),
      JSON.stringify(list),
    );
    check(
      `${T}5 [${themeName}] opening the list tells the host`,
      (await posted()).some((m) => m.type === 'programList' && m.open === true),
    );
    await tab.screenshot({ path: join(shots, `list-module-${themeName}.png`) });

    // Choose a program; Open in the editor.
    await tab.evaluate(() => {
      const root = document.getElementById('program-chip').shadowRoot;
      root.querySelector('.prow[data-path="demos/train.pathogen"] .open').click();
    });
    await tab.evaluate(() => {
      const c = document.getElementById('program-chip');
      c.shadowRoot.querySelector('.pick').click();
      c.shadowRoot.querySelector('.prow[data-path="try-sizes.pathogen"] .show').click();
    });
    const asks = (await posted()).filter((m) => m.type === 'openFile' || m.type === 'showProgram');
    check(
      `${T}6 [${themeName}] a row chosen and Open in the editor go to the host`,
      JSON.stringify(asks) ===
        JSON.stringify([
          { type: 'openFile', path: 'demos/train.pathogen' },
          { type: 'showProgram', path: 'try-sizes.pathogen' },
        ]) && (await posted()).some((m) => m.type === 'programList' && m.open === false),
      JSON.stringify(asks),
    );

    // State 5: a program not in pathogen.json, in a narrow panel: still a popover, no dimming.
    await send(programsSketch);
    await tab.setViewport({ width: 520, height: 560, deviceScaleFactor: 2 });
    // The mouse off the list, so no row is hovered.
    await tab.mouse.move(2, 2);
    const narrow = await tab.evaluate(() => {
      const c = document.getElementById('program-chip');
      c.shadowRoot.querySelector('.pick').click();
      const root = c.shadowRoot;
      return {
        open: c.isOpen,
        position: getComputedStyle(root.querySelector('.list')).position,
        scrim: getComputedStyle(root.querySelector('.scrim')).display,
        last: root.querySelector('.prow:last-child .p').textContent,
        // Open in the editor shows on hover, or always on a screen without hover (a phone), not because the panel is narrow.
        openVisible: getComputedStyle(root.querySelector('.prow:not(:focus-within) .open')).visibility,
        noHover: matchMedia('(hover: none)').matches,
      };
    });
    check(
      `${T}7 [${themeName}] a narrow panel keeps the list a popover (no sheet, no dimming); the unlisted note`,
      narrow.open &&
        narrow.position === 'absolute' &&
        narrow.scrim === 'none' &&
        narrow.openVisible === (narrow.noHover ? 'visible' : 'hidden') &&
        narrow.last === 'sketch.pathogen · not in pathogen.json',
      JSON.stringify(narrow),
    );
    await tab.screenshot({ path: join(shots, `list-unlisted-narrow-${themeName}.png`) });

    // State 7: the main can't be shown. The host sends the CLI's message as the update's error.
    writeFileSync(at('pathogen.json'), '{ "entryPoints": ["poster.pathogen", "main.pathogen"] }');
    const broken = await readProject(at('parts/gears.pathogen'), libs, texts);
    writeFileSync(
      at('pathogen.json'),
      '{"entryPoints":["main.pathogen","demos/train.pathogen","try-sizes.pathogen"]}\n',
    );
    await tab.setViewport({ width: 720, height: 560, deviceScaleFactor: 2 });
    await send({
      type: 'update',
      seq: 2,
      uri: 'problem:x',
      source: '',
      fontIds: [],
      notices: [],
      errors: [broken.mainProblem.message],
    });
    const brokenList = programRows(broken, null, at('parts/gears.pathogen'), null, rowOf);
    await send({
      type: 'programs',
      items: brokenList.items,
      shown: 'poster.pathogen',
      editing: 'parts/gears.pathogen',
      alert: chipAlert(brokenList.items, 'poster.pathogen'),
    });
    await waitStatus('Error');
    const errorText = await tab.$eval('.error', (el) => el.textContent);
    const firstRow = await tab.evaluate(() => {
      const c = document.getElementById('program-chip');
      if (!c.isOpen) c.shadowRoot.querySelector('.pick').click();
      const row = c.shadowRoot.querySelector('.prow');
      return {
        name: row.querySelector('.nm').textContent,
        sub: row.querySelector('.e')?.textContent ?? null,
        badge: Boolean(row.querySelector('.badge')),
      };
    });
    check(
      `${T}8 [${themeName}] a main that doesn't exist: the CLI's message; its row "Not found", with the main badge`,
      errorText.includes("The main of gears-project, poster.pathogen, doesn't exist") &&
        firstRow.name === 'poster' &&
        firstRow.sub === 'Not found' &&
        firstRow.badge,
      JSON.stringify({ errorText, firstRow }),
    );
    await tab.screenshot({ path: join(shots, `missing-main-${themeName}.png`) });

    const csp = await tab.evaluate(() => window.__csp);
    check(
      `${T}9 [${themeName}] no CSP violations, no page errors (miniatures are data: URLs)`,
      csp.length === 0 && pageErrors.length === 0,
      JSON.stringify({ csp, pageErrors }),
    );
    await tab.close();
  }
} finally {
  await browser.close();
  server.close();
  rmSync(scratch, { recursive: true, force: true });
}

writeFileSync(join(here, 'verify-2f-preview-results.json'), `${JSON.stringify(results, null, 2)}\n`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);

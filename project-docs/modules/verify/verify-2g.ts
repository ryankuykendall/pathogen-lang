// Phase 2g (note 70): export and import a project, in the served playground
// against the dev API, signed in (Snapshot needs a session):
// - with try-sizes shown: Copy SVG's line, Export's title and the Snapshot
//   panel name it; Download workspace sits under Copy Workspace;
// - an edit not saved yet in one file, then another tab: Download workspace
//   saves Gears-2g.zip holding the edit; unzipped, the CLI compiles the folder
//   as it compiles the saved workspace's main;
// - the New Workspace page: Or import a project; the downloaded .zip comes
//   back as a workspace with the same files, folders and program list; the
//   unzipped folder through Choose folder… too; a project whose names don't
//   fit and whose pathogen.json names a missing file; a malformed
//   pathogen.json (Create off); a .zip dropped on the drop area; a drop that
//   misses it stopped; a touch screen offers Choose .zip… only.
// Screenshots, light and dark: project-docs/modules/verify/2g/.
//
//   npm run dev:stack            (and npm run build:playground:dev after a change)
//   npx tsx project-docs/modules/verify/verify-2g.ts

import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import puppeteer from 'puppeteer';

import { writeZip } from '../../../playground/services/zip';

import type { Page } from 'puppeteer';

const ROOT = process.cwd();
const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const SHOTS = join(ROOT, 'project-docs', 'modules', 'verify', '2g');
const WORK = join(ROOT, 'tmp', '2g', 'verify');
const DOWNLOADS = join(WORK, 'downloads');
const USER_ID = `verify2g-${randomUUID().slice(0, 8)}`;
const TOKEN = `verify2g-${randomUUID()}`;
const COOKIE = `pathogen_session=${TOKEN}`;
const GEARS_DIR = join(ROOT, 'project-docs', 'modules', 'mockups-2f-vscode-chip', 'gears-project');
const gears = (p: string): string => readFileSync(join(GEARS_DIR, p), 'utf8');
const FILES: Record<string, string> = {
  'main.pathogen': gears('main.pathogen'),
  'demos/train.pathogen': gears('demos/train.pathogen'),
  'try-sizes.pathogen': gears('try-sizes.pathogen'),
  'parts/gears.pathogen': gears('parts/gears.pathogen'),
};
const ENTRY_POINTS = ['main.pathogen', 'demos/train.pathogen', 'try-sizes.pathogen'];
const UNSAVED = '// an edit not saved yet\n';
/** main.pathogen after the edit: it ends in a newline, so Enter at its end opens a line, then the edit is typed. */
const MAIN_EDITED = `${FILES['main.pathogen']}\n${UNSAVED.trimEnd()}`;
/** An object's JSON with its keys in order, to compare two objects whatever order they were built in. */
const sortedJson = (o: Record<string, unknown>): string => JSON.stringify(o, Object.keys(o).sort());

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 900)}`}`);
  if (!ok) failures++;
};

function d1(sql: string): void {
  execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'svg-path-extended-users', '--local', '--persist-to=../.wrangler/state', '--command', sql],
    { cwd: 'api', stdio: ['pipe', 'pipe', 'inherit'] },
  );
}

async function api(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${DEV_API}${path}`, {
    method,
    headers: { Cookie: COOKIE, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const DEEP = `
  window.__deep = (sel, root = document) => {
    const found = root.querySelector(sel);
    if (found) return found;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) { const f = window.__deep(sel, el.shadowRoot); if (f) return f; }
    }
    return null;
  };`;
async function poll<T>(page: Page, src: string, ms = 20_000): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const value = (await page.evaluate(`(async () => { ${DEEP} ${src} })()`)) as T;
    if (value) return value;
    await pause(150);
  }
  return null;
}
const ev = async <T>(page: Page, src: string): Promise<T> =>
  (await page.evaluate(`(async () => { ${DEEP} ${src} })()`)) as T;
const view = `__deep('new-workspace-view').shadowRoot`;

async function newPage(theme: string, opts: { touch?: boolean } = {}): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport(
    opts.touch
      ? { width: 390, height: 1000, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { width: 1320, height: 1100, deviceScaleFactor: 1 },
  );
  page.on('pageerror', (e) => errors.push(`${theme}: ${String(e)}`));
  page.on('dialog', (d) => void d.accept());
  await page.setCookie({ name: 'pathogen_session', value: TOKEN, domain: 'localhost', path: '/' });
  await page.evaluateOnNewDocument((t: string) => localStorage.setItem('pathogen-theme', t), theme);
  return page;
}

async function openWorkspace(page: Page, slugId: string): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/${slugId}`, { waitUntil: 'domcontentloaded' });
  await poll(page, `const c = __deep('program-chip'); return c && !c.hidden && c.shadowRoot?.querySelector('.pick .name')?.textContent ? 1 : null;`, 30_000);
  await pause(800);
}

async function showProgram(page: Page, path: string): Promise<void> {
  await ev(page, `__deep('program-chip').shadowRoot.querySelector('.pick').click(); return 1;`);
  await pause(300);
  await ev(page, `__deep('program-chip').shadowRoot.querySelector('.prow[data-path="${path}"] .show').click(); return 1;`);
  await poll(page, `return import('/state/store.js').then(({ store }) => store.get('renderedFiles')?.program === '${path}' ? 1 : null);`, 20_000);
  await pause(500);
}

async function openMenu(page: Page): Promise<void> {
  await ev(page, `__deep('app-breadcrumb').shadowRoot.querySelector('.menu-btn').click(); return 1;`);
  await pause(250);
}

async function newWorkspacePage(page: Page): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/new`, { waitUntil: 'domcontentloaded' });
  await poll(page, `return ${view}?.querySelector('.import-section') ? 1 : null;`, 20_000);
  await pause(300);
}

/** Pick a file or a folder with the page's own picker, then wait for the card (or the refusal). */
async function pickWith(page: Page, button: 'zip' | 'folder', paths: string[]): Promise<void> {
  const [chooser] = await Promise.all([
    page.waitForFileChooser({ timeout: 5000 }),
    ev(page, `${view}.querySelector('[data-project="${button}"]').click(); return 1;`),
  ]);
  await chooser.accept(paths);
  await poll(
    page,
    `const r = ${view}; const what = r.querySelector('.project-head .what')?.textContent; return (what && what !== 'Reading…') || r.querySelector('.refused') ? 1 : null;`,
  );
  await pause(250);
}

const cardRows = (page: Page): Promise<string[]> =>
  ev(page, `return [...${view}.querySelectorAll('.project-files li')].map((li) => [...li.querySelectorAll('code, .badge-main, .kind, .new, .note')].map((n) => n.textContent.trim()).join(' '));`);
const notAdded = (page: Page): Promise<string[]> =>
  ev(page, `return [...${view}.querySelectorAll('.left-out li')].map((li) => li.textContent.replace(/\\s+/g, ' ').trim());`);

async function shot(page: Page, name: string, theme: string, fullPage = false): Promise<void> {
  await page.screenshot({ path: join(SHOTS, `${name}-${theme}.png`), fullPage });
}

const zipBytes = (entries: { path: string; text?: string }[]): Uint8Array =>
  writeZip(entries.map((e) => (e.text === undefined ? { path: e.path } : { path: e.path, bytes: new TextEncoder().encode(e.text) })));

// ---------- setup ----------

rmSync(WORK, { recursive: true, force: true });
mkdirSync(DOWNLOADS, { recursive: true });
mkdirSync(SHOTS, { recursive: true });
const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${USER_ID}', '${USER_ID}@example.invalid', '${USER_ID}@example.invalid', '${USER_ID}', 'Verify 2g', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${TOKEN}', '${USER_ID}', ${now}, ${now + 3_600_000});`,
);

// A project whose names don't fit, and whose pathogen.json names a file it doesn't have.
const MESSY = join(WORK, 'messy.zip');
writeFileSync(
  MESSY,
  zipBytes([
    { path: 'my gears/' },
    { path: 'my gears/pathogen.json', text: '{ "entryPoints": ["main program.pathogen", "notes.pathogen"] }\n' },
    { path: 'my gears/main program.pathogen', text: 'import { gear, Teeth } from "./gear parts/gears.pathogen";\ndefine ViewBox(0, 0, 200, 120);\ngear(Point(70, 60), 40, Teeth.Standard);\n' },
    { path: 'my gears/gear parts/gears.pathogen', text: gears('parts/gears.pathogen') },
    { path: 'my gears/README.md', text: '# my gears\n' },
    { path: 'my gears/fonts/Inter-Regular.ttf', text: 'not a font' },
  ]),
);
const MALFORMED = join(WORK, 'gears.zip');
writeFileSync(
  MALFORMED,
  zipBytes([
    { path: 'gears/pathogen.json', text: '{ "main": "main.pathogen" }\n' },
    { path: 'gears/main.pathogen', text: FILES['main.pathogen'] },
    { path: 'gears/parts/gears.pathogen', text: FILES['parts/gears.pathogen'] },
  ]),
);

const errors: string[] = [];
const made: string[] = [];
const browser = await puppeteer.launch({ headless: 'shell', args: ['--window-size=1400,1100'] });
try {
  const created = (await (
    await api('POST', '/workspace', {
      name: 'Gears 2g',
      files: Object.fromEntries(Object.entries(FILES).map(([p, text]) => [p, { text }])),
      folders: ['drafts'],
      entryPoints: ENTRY_POINTS,
    })
  ).json()) as { id: string; slug: string };
  made.push(created.id);
  const slugId = `${created.slug}--${created.id}`;

  for (const theme of ['light', 'dark']) {
    const page = await newPage(theme);
    await openWorkspace(page, slugId);
    await showProgram(page, 'try-sizes.pathogen');

    // The menu: Download workspace under Copy Workspace; Copy SVG names the program shown.
    await openMenu(page);
    const menu = await ev<{ order: string[]; copySvg: string; download: string }>(
      page,
      `const r = __deep('app-breadcrumb').shadowRoot;
       return { order: [...r.querySelectorAll('.menu-dropdown [data-action]')].map((b) => b.dataset.action),
         copySvg: r.querySelector('[data-action="copy-svg"] small')?.textContent ?? '',
         download: r.querySelector('[data-action="download-workspace"]')?.textContent.trim() ?? '' };`,
    );
    const at = menu.order.indexOf('copy-workspace');
    check(`${theme}: Download workspace follows Copy Workspace`, menu.order[at + 1] === 'download-workspace', menu.order);
    check(`${theme}: its line reads "A .zip of every file"`, menu.download === 'Download workspaceA .zip of every file', menu.download);
    check(`${theme}: Copy SVG reads "The program shown: try-sizes"`, menu.copySvg === 'The program shown: try-sizes', menu.copySvg);
    await shot(page, 'menu', theme);
    await openMenu(page);

    // Export names the program.
    await ev(page, `__deep('app-breadcrumb').shadowRoot.querySelector('.menu-btn').click(); return 1;`);
    await pause(200);
    await ev(page, `__deep('app-breadcrumb').shadowRoot.querySelector('[data-action="export"]').click(); return 1;`);
    const exportTitle = await poll<string>(page, `const h = __deep('export-modal')?.shadowRoot?.querySelector('.form-header h2'); return h && __deep('export-modal').classList.contains('open') ? h.textContent : null;`);
    check(`${theme}: Export's title is "Export try-sizes"`, exportTitle === 'Export try-sizes', exportTitle);
    await pause(1200);
    await shot(page, 'export', theme);
    await ev(page, `__deep('export-modal').close(); return 1;`);
    await pause(300);

    // The Snapshot panel names it.
    await poll(page, `const b = __deep('#snapshot-btn'); return b && !b.disabled ? 1 : null;`);
    await ev(page, `__deep('#snapshot-btn').click(); return 1;`);
    const snapshotLine = await poll<string>(page, `return document.querySelector('snapshot-popover')?.shadowRoot.querySelector('.program-shown')?.textContent ?? null;`);
    check(`${theme}: the Snapshot panel reads "Of try-sizes, the program shown"`, snapshotLine === 'Of try-sizes, the program shown', snapshotLine);
    await pause(1200);
    await shot(page, 'snapshot', theme);
    await ev(page, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return 1;`);
    await pause(300);
    await page.close();
  }

  // ---------- Download workspace, with an edit not saved yet ----------
  {
    const page = await newPage('light');
    const cdp = await page.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: resolve(DOWNLOADS) });
    await openWorkspace(page, slugId);
    // Type at the end of main.pathogen, the file open, then open try-sizes in another tab.
    await ev(page, `__deep('.cm-content').focus(); return 1;`);
    await page.keyboard.down('Meta');
    await page.keyboard.press('End');
    await page.keyboard.up('Meta');
    await page.keyboard.press('Enter');
    await page.keyboard.type(UNSAVED.trimEnd());
    await pause(200);
    await ev(page, `__deep('#files-toggle').click(); return 1;`);
    await poll(page, `return __deep('file-tree')?.shadowRoot.querySelector('[data-path="try-sizes.pathogen"]') ? 1 : null;`);
    await ev(page, `__deep('file-tree').shadowRoot.querySelector('[data-path="try-sizes.pathogen"]').click(); return 1;`);
    await poll(page, `return import('/state/store.js').then(({ store }) => store.get('openFile') === 'try-sizes.pathogen' ? 1 : null);`);
    await openMenu(page);
    await ev(page, `__deep('app-breadcrumb').shadowRoot.querySelector('[data-action="download-workspace"]').click(); return 1;`);
    const feedback = await poll<string>(page, `return __deep('app-breadcrumb').shadowRoot.querySelector('.overflow-feedback.visible')?.textContent ?? null;`, 5000);
    check('the menu says "Downloaded Gears-2g.zip"', feedback === 'Downloaded Gears-2g.zip', feedback);
    await shot(page, 'downloaded', 'light');
    const zipPath = join(DOWNLOADS, 'Gears-2g.zip');
    for (let i = 0; i < 50 && !existsSync(zipPath); i++) await pause(100);
    check('Gears-2g.zip is saved', existsSync(zipPath), readdirSync(DOWNLOADS));
    await page.close();

    execFileSync('unzip', ['-q', '-o', zipPath, '-d', join(WORK, 'unzipped')]);
    const folder = join(WORK, 'unzipped', 'Gears-2g');
    const listed = execFileSync('unzip', ['-Z1', zipPath]).toString().trim().split('\n');
    check(
      'the .zip holds one folder: pathogen.json, the files, the empty folder',
      JSON.stringify(listed) ===
        JSON.stringify([
          'Gears-2g/',
          'Gears-2g/pathogen.json',
          'Gears-2g/demos/',
          'Gears-2g/demos/train.pathogen',
          'Gears-2g/drafts/',
          'Gears-2g/main.pathogen',
          'Gears-2g/parts/',
          'Gears-2g/parts/gears.pathogen',
          'Gears-2g/try-sizes.pathogen',
        ]),
      listed,
    );
    const mainText = readFileSync(join(folder, 'main.pathogen'), 'utf8');
    check('main.pathogen holds the edit not saved yet', mainText === MAIN_EDITED, mainText.slice(-80));
    check(
      "pathogen.json is the workspace's",
      readFileSync(join(folder, 'pathogen.json'), 'utf8') === `${JSON.stringify({ entryPoints: ENTRY_POINTS }, null, 2)}\n`,
    );
    const cli = spawnSync('npx', ['tsx', join(ROOT, 'src', 'cli.ts'), 'Gears-2g'], {
      cwd: join(WORK, 'unzipped'),
      encoding: 'utf-8',
      env: { ...process.env, PATHOGEN_OFFLINE: '1' },
    });
    const original = spawnSync('npx', ['tsx', join(ROOT, 'src', 'cli.ts'), GEARS_DIR], { encoding: 'utf-8', env: { ...process.env, PATHOGEN_OFFLINE: '1' } });
    check('`pathogen-lang Gears-2g` compiles the main, as the project it came from', cli.status === 0 && cli.stdout === original.stdout && cli.stdout.startsWith('M '), {
      status: cli.status,
      stderr: cli.stderr.slice(0, 300),
    });
  }

  // ---------- the New Workspace page ----------
  const zipPath = join(DOWNLOADS, 'Gears-2g.zip');
  for (const theme of ['light', 'dark']) {
    const page = await newPage(theme);
    await newWorkspacePage(page);
    const idle = await ev<{ heading: string; buttons: string[] }>(
      page,
      `const r = ${view}; return { heading: r.querySelector('.import-section h2').textContent, buttons: [...r.querySelectorAll('.drop-buttons button')].map((b) => b.textContent) };`,
    );
    check(`${theme}: the page offers "Or import a project"`, idle.heading === 'Or import a project' && idle.buttons.join('|') === 'Choose folder…|Choose .zip…', idle);
    await shot(page, 'new', theme, true);

    // The downloaded .zip comes back in.
    await pickWith(page, 'zip', [zipPath]);
    const rows = await cardRows(page);
    check(
      `${theme}: the card lists the programs in order, the main badged, then the module`,
      JSON.stringify(rows) ===
        JSON.stringify(['main.pathogen main', 'demos/train.pathogen', 'try-sizes.pathogen', 'parts/gears.pathogen module']),
      rows,
    );
    const name = await ev<string>(page, `return ${view}.querySelector('#name').value;`);
    check(`${theme}: the name is filled in from the .zip`, name === 'Gears-2g', name);
    await shot(page, 'picked-zip', theme, true);

    if (theme === 'light') {
      await ev(page, `${view}.querySelector('.primary-btn').click(); return 1;`);
      const newId = await poll<string>(page, `const m = location.pathname.match(/^\\/workspace\\/(?:.*--)?([^/]+)$/); return m && m[1] !== 'new' ? m[1] : null;`);
      check('Create Workspace opens the new workspace', !!newId, newId);
      if (newId) {
        made.push(newId);
        const got = (await (await api('GET', `/workspace/${newId}`)).json()) as {
          files: Record<string, { text: string }>;
          folders: string[];
          entryPoints: string[];
        };
        const texts = Object.fromEntries(Object.entries(got.files).map(([p, f]) => [p, f.text]));
        check(
          'it holds the same files (the edit included), the empty folder and the program list',
          sortedJson(texts) === sortedJson({ ...FILES, 'main.pathogen': MAIN_EDITED }) &&
            JSON.stringify(got.folders) === '["drafts"]' &&
            JSON.stringify(got.entryPoints) === JSON.stringify(ENTRY_POINTS),
          { files: Object.keys(texts), folders: got.folders, entryPoints: got.entryPoints },
        );
        await poll(page, `const c = __deep('program-chip'); return c && !c.hidden ? 1 : null;`, 30_000);
        const openFile = await ev<string>(page, `return import('/state/store.js').then(({ store }) => store.get('openFile'));`);
        check('the new workspace opens on its main', openFile === 'main.pathogen', openFile);
        await pause(1000);
        await shot(page, 'created', theme);
      }
      await newWorkspacePage(page);

      // The unzipped folder through Choose folder….
      await pickWith(page, 'folder', [join(WORK, 'unzipped', 'Gears-2g')]);
      const folderTitle = await ev<string>(page, `return ${view}.querySelector('.project-head b')?.textContent ?? '';`);
      const folderWhat = await ev<string>(page, `return ${view}.querySelector('.project-head .what')?.textContent ?? '';`);
      check('Choose folder… reads the folder (its empty folder isn\'t handed over)', folderTitle === 'Gears-2g/' && folderWhat === '4 files in 2 folders', { folderTitle, folderWhat });
      await ev(page, `${view}.querySelector('[data-project="again"]').click(); return 1;`);
      await pause(200);
    } else {
      await ev(page, `${view}.querySelector('[data-project="again"]').click(); return 1;`);
      await pause(200);
    }

    // Names that don't fit, a file left out, an entry naming a missing file.
    await pickWith(page, 'zip', [MESSY]);
    const messyRows = await cardRows(page);
    const messyNotAdded = await notAdded(page);
    check(
      `${theme}: renamed files keep their main; the card lists them`,
      JSON.stringify(messyRows) === JSON.stringify(['main-program.pathogen main', 'gear-parts/gears.pathogen module']),
      messyRows,
    );
    check(
      `${theme}: the names changed, and what isn't added, are listed`,
      JSON.stringify(messyNotAdded) ===
        JSON.stringify([
          'gear parts/gears.pathogen → gear-parts/gears.pathogen',
          'main program.pathogen → main-program.pathogen',
          'README.md: workspaces hold .pathogen files for now.',
          'fonts/Inter-Regular.ttf: the playground can’t load font files yet. Use the Google Fonts family instead: @font "Inter" 400;'.replace('can’t', "can't"),
          'pathogen.json lists notes.pathogen, which isn’t in the project, so the program list leaves it out.',
        ]),
      messyNotAdded,
    );
    await shot(page, 'picked-messy', theme, true);
    await ev(page, `${view}.querySelector('[data-project="again"]').click(); return 1;`);
    await pause(200);

    // A pathogen.json that can't be read.
    await pickWith(page, 'zip', [MALFORMED]);
    const refused = await ev<{ lead: string; said: string; disabled: boolean }>(
      page,
      `const r = ${view}; return { lead: r.querySelector('.refused p').textContent, said: r.querySelector('.refused .said')?.textContent ?? '', disabled: r.querySelector('.primary-btn').disabled };`,
    );
    check(
      `${theme}: a malformed pathogen.json stops it, with the CLI's message, and Create is off`,
      refused.lead === 'This project’s pathogen.json can’t be read, so nothing was added. Fix the file, then choose the .zip again:' &&
        refused.said.startsWith('pathogen.json (gears.zip): "main" is now "entryPoints"') &&
        refused.disabled,
      refused,
    );
    await shot(page, 'malformed', theme, true);
    await ev(page, `${view}.querySelector('[data-project="again"]').click(); return 1;`);
    await pause(200);

    // A .zip dropped on the drop area, and a drop that misses it.
    const zipB64 = readFileSync(zipPath).toString('base64');
    const drop = await ev<{ stray: boolean; light: boolean }>(
      page,
      `const r = ${view};
       const bytes = Uint8Array.from(atob('${zipB64}'), (c) => c.charCodeAt(0));
       const make = () => { const dt = new DataTransfer(); dt.items.add(new File([bytes], 'Gears-2g.zip', { type: 'application/zip' })); return dt; };
       const stray = new DragEvent('drop', { bubbles: true, cancelable: true, composed: true, dataTransfer: make() });
       r.querySelector('h1').dispatchEvent(stray);
       const zone = r.querySelector('.drop-zone');
       zone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, composed: true, dataTransfer: make() }));
       zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, composed: true, dataTransfer: make() }));
       const lit = zone.classList.contains('dragging');
       zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, composed: true, dataTransfer: make() }));
       return { stray: stray.defaultPrevented, light: lit };`,
    );
    check(`${theme}: a drop that misses the drop area is stopped`, drop.stray, drop);
    check(`${theme}: the drop area lights up under a dragged file`, drop.light, drop);
    await poll(page, `const what = ${view}.querySelector('.project-head .what')?.textContent; return what && what !== 'Reading…' ? 1 : null;`);
    const droppedTitle = await ev<string>(page, `return ${view}.querySelector('.project-head b')?.textContent ?? '';`);
    check(`${theme}: a dropped .zip is read`, droppedTitle === 'Gears-2g.zip', droppedTitle);
    await page.close();

    // A touch screen: Choose .zip… only, no drop area.
    const phone = await newPage(theme, { touch: true });
    await newWorkspacePage(phone);
    const touch = await ev<{ buttons: string[]; zone: boolean; lead: string }>(
      phone,
      `const r = ${view}; return { buttons: [...r.querySelectorAll('.import-section button')].map((b) => b.textContent), zone: !!r.querySelector('.drop-zone'), lead: r.querySelector('.import-lead').textContent };`,
    );
    check(
      `${theme}: a touch screen offers Choose .zip… only`,
      touch.buttons.join('|') === 'Choose .zip…' && !touch.zone && touch.lead.startsWith('A .zip made by Download workspace'),
      touch,
    );
    await shot(phone, 'new-phone', theme, true);
    await phone.close();
  }
} finally {
  for (const id of made) await api('DELETE', `/workspace/${id}`).catch((e) => errors.push(String(e)));
  d1(`DELETE FROM sessions WHERE user_id = '${USER_ID}'; DELETE FROM users WHERE id = '${USER_ID}';`);
  await browser.close();
}
if (errors.length) {
  console.log(`page errors:\n${errors.join('\n')}`);
  failures += errors.length;
}
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);

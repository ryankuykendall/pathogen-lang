// Phase 3a, step 8a (note 85): data files come in through an upload and a
// project's import, in the served playground against the dev API, signed in,
// in both themes (docs/workspace-files.md "Uploading files" and "A workspace
// from a project"; mockup v2 4a):
// - Upload files… offers data files; sizes.json goes in and opens in a tab,
//   and stays out of the program list; a data file over 5 MB and a .txt are
//   left out, each with the docs' reason;
// - the New Workspace page lists the data files after the module, with the
//   braces, and the files left out under "Not added"; Create Workspace makes a
//   workspace holding them, whose main draws from its data file.
// Screenshots: project-docs/modules/verify/3a-step8a/.
//
//   npm run dev:stack   (then npm run build:playground:dev after a change)
//   npx tsx project-docs/modules/verify/verify-3a-step8a.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import puppeteer from 'puppeteer';

import { writeZip } from '../../../playground/services/zip';

import type { Page } from 'puppeteer';

const ROOT = process.cwd();
const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const SHOTS = join(ROOT, 'project-docs', 'modules', 'verify', '3a-step8a');
const RESULTS = join(ROOT, 'project-docs', 'modules', 'verify', 'verify-3a-step8a-results.json');
const WORK = join(ROOT, 'tmp', 'phase3', 'step8a');
const USER_ID = `verify3a8-${randomUUID().slice(0, 8)}`;
const TOKEN = `verify3a8-${randomUUID()}`;
const COOKIE = `pathogen_session=${TOKEN}`;
const MB = 1024 * 1024;

const MAIN = [
  'import { gear } from "./parts/gears.pathogen";',
  'import gears from "./data/gears.json";',
  '',
  'define ViewBox(0, 0, 200, 100);',
  'for (g in gears) {',
  '  gear(g.x, g.y, g.r);',
  '}',
  '',
].join('\n');
const GEARS_MODULE = ['module;', '', 'export fn gear(x, y, r) {', '  circle(x, y, r);', '}', ''].join('\n');
const GEARS = '[\n  { "x": 50, "y": 50, "r": 10 },\n  { "x": 130, "y": 50, "r": 25 }\n]\n';
const SIZES = '[4, 6, 8]\n';
/** A data file just over 6.2 MB: `6.2 MB` in the message (sizes round up to a tenth). */
const TRIPS = `[${'0,'.repeat(Math.floor((6.2 * MB - 1024) / 2))}0]`;
const HOLDS = 'a workspace holds .pathogen files and data files (.json, .geojson, .topojson and .fold).';

const results: { check: string; ok: boolean; detail?: unknown }[] = [];
let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 900)}`}`);
  results.push({ check: label, ok, ...(ok ? {} : { detail }) });
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
const VIEW = `__deep('new-workspace-view').shadowRoot`;
const TREE = `__deep('file-tree').shadowRoot`;
const store = (key: string): string => `import('/state/store.js').then(({ store }) => store.get('${key}'))`;

async function newPage(theme: string): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1320, height: 1100, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => void d.accept());
  await page.setCookie({ name: 'pathogen_session', value: TOKEN, domain: 'localhost', path: '/' });
  await page.evaluateOnNewDocument((t: string) => {
    localStorage.setItem('pathogen-theme', t);
    const w = window as unknown as { __toasts: unknown[] };
    w.__toasts = [];
    document.addEventListener('show-toast', (e) => w.__toasts.push((e as CustomEvent).detail));
  }, theme);
  return { page, errors };
}

/** A real click (a picker opens only on one). */
async function click(page: Page, root: string, selector: string): Promise<void> {
  const at = await ev<{ x: number; y: number } | null>(
    page,
    `const el = ${root}.querySelector('${selector}'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`,
  );
  if (!at) throw new Error(`nothing at ${selector}`);
  await page.mouse.click(at.x, at.y);
  await pause(300);
}

async function openWorkspace(page: Page, id: string): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded' });
  await poll(page, `return ${TREE}?.querySelector('[data-path="data/gears.json"]') ? 1 : null;`, 30_000);
  await poll(page, `return __deep('workspace-view') && !__deep('workspace-view')._loadingWorkspace ? 1 : null;`);
  await pause(600);
}

const drawn = async (page: Page, start: string): Promise<boolean> =>
  !!(await poll(
    page,
    `return window.__paths().some((d) => d.replace(/\\s+/g, ' ').includes(${JSON.stringify(start)})) ? 1 : null;`,
    30_000,
  ));

async function shot(page: Page, name: string, theme: string, fullPage = false): Promise<void> {
  await pause(400);
  await page.screenshot({ path: join(SHOTS, `${name}-${theme}.png`), fullPage });
}

// ---------- setup ----------

rmSync(WORK, { recursive: true, force: true });
mkdirSync(join(WORK, 'upload'), { recursive: true });
mkdirSync(SHOTS, { recursive: true });
const upload = {
  sizes: join(WORK, 'upload', 'sizes.json'),
  trips: join(WORK, 'upload', 'trips.json'),
  profile: join(WORK, 'upload', 'profile.txt'),
};
writeFileSync(upload.sizes, SIZES);
writeFileSync(upload.trips, TRIPS);
writeFileSync(upload.profile, 'name: gears\n');
const ZIP = join(WORK, 'Gear-studies.zip');
const text = (t: string): Uint8Array => new TextEncoder().encode(t);
writeFileSync(
  ZIP,
  writeZip([
    { path: 'Gear-studies/' },
    { path: 'Gear-studies/pathogen.json', bytes: text('{ "entryPoints": ["main.pathogen"] }\n') },
    { path: 'Gear-studies/main.pathogen', bytes: text(MAIN) },
    { path: 'Gear-studies/try-sizes.pathogen', bytes: text('import sizes from "./data/sizes.json";\nfor (s in sizes) circle(50, 50, s);\n') },
    { path: 'Gear-studies/parts/gears.pathogen', bytes: text(GEARS_MODULE) },
    { path: 'Gear-studies/data/gears.json', bytes: text(GEARS) },
    { path: 'Gear-studies/data/sizes.json', bytes: text(SIZES) },
    { path: 'Gear-studies/data/trips.json', bytes: text(TRIPS) },
    { path: 'Gear-studies/data/profile.txt', bytes: text('name: gears\n') },
  ]),
);
// Past what a create can send (24 MB): six data files of 4.5 MB.
const BIG_BYTES = Math.floor(4.5 * MB);
const BIG_NAMES = Array.from({ length: 6 }, (_, i) => `data/big${i}.json`);
const bigText = (i: number): string => `[${String(i).padEnd(BIG_BYTES - 2, ' ')}]`;
const BIG_ZIP = join(WORK, 'Big-studies.zip');
writeFileSync(
  BIG_ZIP,
  writeZip([
    { path: 'Big-studies/main.pathogen', bytes: text(MAIN) },
    { path: 'Big-studies/parts/gears.pathogen', bytes: text(GEARS_MODULE) },
    { path: 'Big-studies/data/gears.json', bytes: text(GEARS) },
    ...BIG_NAMES.map((p, i) => ({ path: `Big-studies/${p}`, bytes: text(bigText(i)) })),
  ]),
);
const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${USER_ID}', '${USER_ID}@example.invalid', '${USER_ID}@example.invalid', '${USER_ID}', 'Verify 3a 8a', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${TOKEN}', '${USER_ID}', ${now}, ${now + 3_600_000});`,
);

const made: string[] = [];
const browser = await puppeteer.launch({ headless: 'shell', args: ['--window-size=1400,1100'] });
try {
  for (const theme of ['light', 'dark']) {
    const say = (label: string): string => `${theme}: ${label}`;
    const { page, errors } = await newPage(theme);

    // ---------- 1. Upload files… ----------
    const created = (await (
      await api('POST', '/workspace', {
        name: `Uploads 3a ${theme}`,
        files: {
          'main.pathogen': { text: MAIN },
          'parts/gears.pathogen': { text: GEARS_MODULE },
          'data/gears.json': { text: GEARS },
        },
        entryPoints: ['main.pathogen'],
      })
    ).json()) as { id: string };
    made.push(created.id);
    await openWorkspace(page, created.id);
    // The + adds to the folder of the file in the editor: data/.
    await click(page, TREE, '.row.file[data-path="data/gears.json"]');
    await poll(page, `return ${store('openFile')}.then((f) => f === 'data/gears.json' ? 1 : null);`);
    const accept = await ev<string>(page, `return ${TREE}.querySelector('.pick-files').accept;`);
    check(say('Upload files…’s picker offers .pathogen and data files'), accept === '.pathogen,.json,.geojson,.topojson,.fold', accept);
    await click(page, TREE, '.add');
    const [chooser] = await Promise.all([
      page.waitForFileChooser({ timeout: 5000 }),
      click(page, TREE, '[data-action="upload-files"]'),
    ]);
    await chooser.accept([upload.sizes, upload.trips, upload.profile]);
    const row = await poll<string>(page, `const r = ${TREE}.querySelector('.row.file[data-path="data/sizes.json"]'); return r ? r.className : null;`);
    check(say('data/sizes.json is in the tree, a data row'), !!row && row.split(' ').includes('data'), row);
    const toast = await poll<{ title: string; message?: string; items?: string[] }>(
      page,
      `return window.__toasts.find((t) => (t.title + ' ' + (t.message || '')).includes('sizes.json')) || null;`,
    );
    check(
      say('the message says what was added and what was left out, with the docs’ reasons'),
      !!toast &&
        toast.title === 'Added sizes.json to data/.' &&
        // In the order they were picked.
        JSON.stringify(toast.items) ===
          JSON.stringify([
            'trips.json: 6.2 MB, more than the 5 MB a data file can be in a workspace.',
            `profile.txt: ${HOLDS}`,
          ]),
      toast,
    );
    const open = await poll<string>(page, `return ${store('openFile')}.then((f) => f === 'data/sizes.json' ? f : null);`);
    check(say('the one file added opens in a tab'), open === 'data/sizes.json', open);
    await shot(page, 'upload', theme);
    // Saved, outside the program list (autosave: 5 s after the change, 30 s at least between saves).
    let last: { files: Record<string, { text?: string }>; entryPoints: string[] } | null = null;
    for (let i = 0; i < 90; i++) {
      last = (await (await api('GET', `/workspace/${created.id}`)).json()) as typeof last;
      if (last?.files?.['data/sizes.json']) break;
      await pause(500);
    }
    check(
      say('it saves, and stays out of the program list'),
      last?.files?.['data/sizes.json']?.text === SIZES && JSON.stringify(last.entryPoints) === '["main.pathogen"]',
      {
        files: last?.files ? Object.keys(last.files) : last,
        entryPoints: last?.entryPoints,
        saveStatus: await ev(page, `return ${store('saveStatus')};`),
        saveRefusal: await ev(page, `return ${store('saveRefusal')};`),
        crumb: await ev(page, `return __deep('app-breadcrumb')?.shadowRoot?.querySelector('.save-status')?.textContent ?? null;`),
      },
    );

    // ---------- 2. A project's import ----------
    await page.goto(`${PAGES_URL}/workspace/new`, { waitUntil: 'domcontentloaded' });
    await poll(page, `return ${VIEW}?.querySelector('.import-section') ? 1 : null;`);
    await pause(300);
    const [zipChooser] = await Promise.all([
      page.waitForFileChooser({ timeout: 5000 }),
      ev(page, `${VIEW}.querySelector('[data-project="zip"]').click(); return 1;`),
    ]);
    await zipChooser.accept([ZIP]);
    await poll(page, `const what = ${VIEW}.querySelector('.project-head .what')?.textContent; return what && what !== 'Reading…' ? 1 : null;`);
    await pause(300);
    const card = await ev<{ what: string; rows: string[]; icons: boolean; notAdded: string[] }>(
      page,
      `const r = ${VIEW}; return {
        what: r.querySelector('.project-head .what').textContent,
        rows: [...r.querySelectorAll('.project-files li')].map((li) => [...li.querySelectorAll('code, .badge-main, .kind, .new, .note')].map((n) => n.textContent.trim()).join(' ')),
        icons: [...r.querySelectorAll('.project-files li.data')].every((li) => !!li.querySelector('svg')),
        notAdded: [...r.querySelectorAll('.left-out li')].map((li) => li.textContent.replace(/\\s+/g, ' ').trim()),
      };`,
    );
    check(
      say('the card lists the programs, the module, then the data files with the braces'),
      card.what === '5 files in 2 folders' &&
        JSON.stringify(card.rows) ===
          JSON.stringify([
            'main.pathogen main',
            'try-sizes.pathogen Not in pathogen.json’s list: it joins the end.',
            'parts/gears.pathogen module',
            'data/gears.json data',
            'data/sizes.json data',
          ]) &&
        card.icons,
      card,
    );
    check(
      say('"Not added" gives each left out file the docs’ reason'),
      JSON.stringify(card.notAdded) ===
        JSON.stringify([
          `data/profile.txt: ${HOLDS}`,
          'data/trips.json: 6.2 MB, more than the 5 MB a data file can be in a workspace.',
        ]),
      card.notAdded,
    );
    await shot(page, 'import-card', theme, true);

    if (theme === 'light') {
      await ev(page, `${VIEW}.querySelector('.primary-btn').click(); return 1;`);
      const newId = await poll<string>(
        page,
        `const m = location.pathname.match(/^\\/workspace\\/(?:.*--)?([^/]+)$/); return m && m[1] !== 'new' ? m[1] : null;`,
      );
      check('Create Workspace opens the new workspace', !!newId, newId);
      if (newId) {
        made.push(newId);
        const got = (await (await api('GET', `/workspace/${newId}`)).json()) as {
          files: Record<string, { text?: string }>;
          entryPoints: string[];
        };
        check(
          'it holds the data files, outside the program list',
          got.files['data/gears.json']?.text === GEARS &&
            got.files['data/sizes.json']?.text === SIZES &&
            !('data/trips.json' in got.files) &&
            JSON.stringify(got.entryPoints) === '["main.pathogen","try-sizes.pathogen"]',
          { files: Object.keys(got.files), entryPoints: got.entryPoints },
        );
        // circle(50, 50, 10) as the preview writes it: relative arcs.
        check('its main draws the gears from data/gears.json', await drawn(page, 'M 40 50 a 10 10'));
        await shot(page, 'imported', theme);
      }

      // A project past the 24 MB a create can send: six data files of 4.5 MB, 27 MB.
      await page.goto(`${PAGES_URL}/workspace/new`, { waitUntil: 'domcontentloaded' });
      await poll(page, `return ${VIEW}?.querySelector('.import-section') ? 1 : null;`);
      await pause(300);
      const [bigChooser] = await Promise.all([
        page.waitForFileChooser({ timeout: 5000 }),
        ev(page, `${VIEW}.querySelector('[data-project="zip"]').click(); return 1;`),
      ]);
      await bigChooser.accept([BIG_ZIP]);
      await poll(page, `const what = ${VIEW}.querySelector('.project-head .what')?.textContent; return what && what !== 'Reading…' ? 1 : null;`);
      const bigWhat = await ev<string>(page, `return ${VIEW}.querySelector('.project-head .what').textContent;`);
      check('a 27 MB project lists its 9 files', bigWhat === '9 files in 2 folders', bigWhat);
      const started = Date.now();
      await ev(page, `${VIEW}.querySelector('.primary-btn').click(); return 1;`);
      const bigId = await poll<string>(
        page,
        `const m = location.pathname.match(/^\\/workspace\\/(?:.*--)?([^/]+)$/); return m && m[1] !== 'new' ? m[1] : null;`,
        120_000,
      );
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      const submitError = bigId
        ? null
        : await ev<string>(page, `return ${VIEW}?.querySelector('.error-message')?.textContent ?? null;`);
      check(`Create Workspace makes it, past the create's 24 MB (${seconds} s)`, !!bigId, submitError);
      if (bigId) {
        made.push(bigId);
        const got = (await (await api('GET', `/workspace/${bigId}`)).json()) as {
          files: Record<string, { text?: string; size?: number; deferred?: boolean }>;
          entryPoints: string[];
        };
        const sizes = BIG_NAMES.map((p) => got.files[p]?.size);
        check(
          'it holds every file, each whole, outside the program list',
          BIG_NAMES.every((p) => got.files[p]?.size === BIG_BYTES) &&
            got.files['data/gears.json']?.text === GEARS &&
            JSON.stringify(got.entryPoints) === '["main.pathogen"]',
          { files: Object.keys(got.files), sizes, entryPoints: got.entryPoints },
        );
        check('its main draws', await drawn(page, 'M 40 50 a 10 10'));
      }
    }
    check(say('no page errors'), errors.length === 0, errors);
    await page.close();
  }
} finally {
  for (const id of made) await api('DELETE', `/workspace/${id}`).catch(() => undefined);
  d1(`DELETE FROM sessions WHERE user_id = '${USER_ID}'; DELETE FROM users WHERE id = '${USER_ID}';`);
  await browser.close();
  writeFileSync(RESULTS, `${JSON.stringify({ ran: new Date().toISOString(), failures, results }, null, 2)}\n`);
}
console.log(failures === 0 ? 'All checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

// Phase 3a, step 8e (note 85; note 83's last row): one workspace with data
// files, round-tripped through every carrier, each copy compared file by file
// (by sha256) with the original. On the dev stack, signed in.
//
// The workspace: main.pathogen imports a module and two data files,
// data/a.json (1.5 MB) and data/b.json (1 MB: past the 2 MB of data an answer
// carries, so deferred), and has an empty folder. The carriers:
// - Download workspace: the .zip holds every file whole, and the CLI compiles
//   the unzipped folder (the CLI surface, with its data imports);
// - the .zip imported as a new workspace (the New Workspace page);
// - Copy Workspace;
// - a snapshot taken from the breadcrumb, then Start new workspace from it;
// - Upload files… of the unzipped data files into another workspace;
// - approved, then Open as new workspace from its public page.
//
//   npm run dev:stack   (then npm run build:playground:dev after a change)
//   npx tsx project-docs/modules/verify/verify-3a-step8e.ts

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const ROOT = process.cwd();
const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const WORK = join(ROOT, 'tmp', 'phase3', 'step8e');
const DOWNLOADS = join(WORK, 'downloads');
const RESULTS = 'project-docs/modules/verify/verify-3a-step8e-results.json';
const ADMIN_TOKEN = (readFileSync('api/.dev.vars', 'utf8').match(/^ADMIN_TOKEN=(.*)$/m)?.[1] ?? '').trim();
const MB = 1024 * 1024;
const pause = async (ms: number): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms));
};

const results: { check: string; ok: boolean; detail?: unknown }[] = [];
let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 900)}`}`);
  results.push({ check: label, ok, ...(ok ? {} : { detail }) });
  if (!ok) failures++;
};

const d1 = (sql: string): string =>
  execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'svg-path-extended-users', '--local', '--persist-to=../.wrangler/state', '--command', sql, '--json'],
    { cwd: 'api', stdio: ['pipe', 'pipe', 'inherit'] },
  ).toString();

const tag = randomUUID().slice(0, 8);
const OWNER = { id: `v3a8e-${tag}`, token: `v3a8e-${randomUUID()}`, handle: `v3a8e${tag}` };
const NAME = `Round trip ${tag}`;

async function api(
  who: 'owner' | 'admin-token',
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const url = who === 'admin-token' ? `${DEV_API}${path}?token=${encodeURIComponent(ADMIN_TOKEN)}` : `${DEV_API}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      ...(who === 'owner' ? { Cookie: `pathogen_session=${OWNER.token}` } : {}),
      'Content-Type': 'application/json',
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, ...((await res.json().catch(() => ({}))) as Record<string, unknown>) };
}

const MAIN = [
  'import { gear } from "./parts/gears.pathogen";',
  'import a from "./data/a.json";',
  'import b from "./data/b.json";',
  'define ViewBox(0, 0, 200, 100);',
  'gear(40, 50, a.r);',
  'gear(130, 50, b.r);',
  '',
].join('\n');
const GEARS = ['module;', '', 'export fn gear(x, y, r) {', '  circle(x, y, r);', '}', ''].join('\n');
const dataFile = (r: number, bytes: number): string => {
  const line = `    "${'x'.repeat(92)}",\n`;
  const lines = Math.floor((bytes - 40) / line.length);
  return `{\n  "r": ${r},\n  "pad": [\n${line.repeat(lines)}    "end"\n  ]\n}\n`;
};
const TEXTS: Record<string, string> = {
  'main.pathogen': MAIN,
  'parts/gears.pathogen': GEARS,
  'data/a.json': dataFile(10, Math.floor(1.5 * MB)),
  'data/b.json': dataFile(25, 1 * MB),
};
const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
const EXPECTED = Object.fromEntries(Object.entries(TEXTS).map(([p, t]) => [p, sha(t)]));
const sorted = (o: Record<string, string>): string => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));

/** A workspace's files as the server holds them, by path: each one's sha256. */
async function shasOf(id: string): Promise<Record<string, string>> {
  const got = (await api('owner', 'GET', `/workspace/${id}`)) as { files?: Record<string, { sha256: string }> };
  return Object.fromEntries(Object.entries(got.files ?? {}).map(([p, f]) => [p, f.sha256]));
}
const sameFiles = async (id: string): Promise<{ ok: boolean; got: Record<string, string> }> => {
  const got = await shasOf(id);
  return { ok: sorted(got) === sorted(EXPECTED), got };
};

const DEEP = `
  window.__deep = (sel, root = document) => {
    const found = root.querySelector(sel);
    if (found) return found;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) { const f = window.__deep(sel, el.shadowRoot); if (f) return f; }
    }
    return null;
  };`;
const ev = async <T>(page: Page, src: string): Promise<T> => (await page.evaluate(`(async () => { ${DEEP} ${src} })()`)) as T;
async function until<T>(page: Page, src: string, ms = 60_000): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const value = await ev<T | null>(page, src).catch(() => null);
    if (value) return value;
    await pause(250);
  }
  return null;
}
const VIEW = `__deep('new-workspace-view')?.shadowRoot`;
/** After Create Workspace: the new workspace's id from the address. */
const newId = async (page: Page): Promise<string | null> =>
  until<string>(
    page,
    `const m = location.pathname.match(/^\\/workspace\\/(?:.*--)?([^/]+)$/); return m && m[1] !== 'new' ? m[1] : null;`,
    120_000,
  );
async function openWorkspace(page: Page, slugId: string): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/${slugId}`, { waitUntil: 'domcontentloaded' });
  await until(page, `return __deep('workspace-view') && !__deep('workspace-view')._loadingWorkspace && __deep('#snapshot-btn') ? 1 : null;`);
  await pause(800);
}
async function openMenu(page: Page): Promise<void> {
  await ev(page, `__deep('app-breadcrumb').shadowRoot.querySelector('.menu-btn').click(); return 1;`);
  await pause(300);
}

if (!ADMIN_TOKEN) throw new Error('api/.dev.vars has no ADMIN_TOKEN');
rmSync(WORK, { recursive: true, force: true });
mkdirSync(DOWNLOADS, { recursive: true });
const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${OWNER.id}', '${OWNER.id}@example.invalid', '${OWNER.id}@example.invalid', '${OWNER.handle}', 'Verify 3a 8e', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${OWNER.token}', '${OWNER.id}', ${now}, ${now + 3_600_000});`,
);

const made: string[] = [];
const browser = await puppeteer.launch({ headless: 'shell', args: ['--window-size=1400,1000'] });
try {
  const created = await api('owner', 'POST', '/workspace', {
    name: NAME,
    files: Object.fromEntries(Object.entries(TEXTS).map(([p, text]) => [p, { text }])),
    folders: ['drafts'],
    entryPoints: ['main.pathogen'],
  });
  const id = created.id as string;
  const slugId = `${created.slug as string}--${id}`;
  made.push(id);
  const original = await sameFiles(id);
  check('the original holds its four files', original.ok, original.got);

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  page.on('dialog', (d) => void d.accept());
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setCookie({ name: 'pathogen_session', value: OWNER.token, domain: 'localhost', path: '/' });
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: resolve(DOWNLOADS) });

  // ---- 1. Download workspace ----
  await openWorkspace(page, slugId);
  await openMenu(page);
  await ev(page, `__deep('app-breadcrumb').shadowRoot.querySelector('[data-action="download-workspace"]').click(); return 1;`);
  const zipName = `${NAME.replace(/ /g, '-')}.zip`;
  const zipPath = join(DOWNLOADS, zipName);
  for (let i = 0; i < 100 && !existsSync(zipPath); i++) await pause(200);
  check('Download workspace saves the .zip', existsSync(zipPath), zipName);
  const unzipped = join(WORK, 'unzipped');
  execFileSync('unzip', ['-q', '-o', zipPath, '-d', unzipped]);
  const folder = join(unzipped, zipName.replace(/\.zip$/, ''));
  const inZip = Object.fromEntries(
    Object.keys(TEXTS).map((p) => [p, existsSync(join(folder, p)) ? sha(readFileSync(join(folder, p), 'utf8')) : 'missing']),
  );
  check(
    'the .zip holds every file whole, the empty folder and pathogen.json',
    sorted(inZip) === sorted(EXPECTED) && existsSync(join(folder, 'drafts')) && existsSync(join(folder, 'pathogen.json')),
    inZip,
  );
  const cli = spawnSync('npx', ['tsx', join(ROOT, 'src', 'cli.ts'), folder], {
    encoding: 'utf-8',
    env: { ...process.env, PATHOGEN_OFFLINE: '1' },
  });
  check(
    'the CLI compiles the unzipped folder, reading its data files (both circles)',
    cli.status === 0 && /[Aa] 10 10 /.test(cli.stdout) && /[Aa] 25 25 /.test(cli.stdout),
    { status: cli.status, stdout: cli.stdout.slice(0, 200), stderr: cli.stderr.slice(0, 300) },
  );

  // ---- 2. The .zip imported as a new workspace ----
  await page.goto(`${PAGES_URL}/workspace/new`, { waitUntil: 'domcontentloaded' });
  await until(page, `return ${VIEW}?.querySelector('.import-section') ? 1 : null;`);
  const [chooser] = await Promise.all([
    page.waitForFileChooser({ timeout: 5000 }),
    ev(page, `${VIEW}.querySelector('[data-project="zip"]').click(); return 1;`),
  ]);
  await chooser.accept([zipPath]);
  await until(page, `const w = ${VIEW}?.querySelector('.project-head .what')?.textContent; return w && w !== 'Reading…' ? 1 : null;`);
  await ev(page, `${VIEW}.querySelector('.primary-btn').click(); return 1;`);
  const imported = await newId(page);
  if (imported) made.push(imported);
  const importedFiles = imported ? await sameFiles(imported) : null;
  check('the .zip imported: the same files', !!importedFiles?.ok, importedFiles?.got ?? imported);

  // ---- 3. Copy Workspace ----
  await page.goto(`${PAGES_URL}/workspace/new?copyFrom=${id}`, { waitUntil: 'domcontentloaded' });
  await until(page, `const n = ${VIEW}?.querySelector('[name="name"]'); return n && n.value.endsWith('(Copy)') ? 1 : null;`);
  await ev(page, `${VIEW}.querySelector('.primary-btn').click(); return 1;`);
  const copied = await newId(page);
  if (copied) made.push(copied);
  const copiedFiles = copied ? await sameFiles(copied) : null;
  check('Copy Workspace: the same files', !!copiedFiles?.ok, copiedFiles?.got ?? copied);

  // ---- 4. A snapshot, then Start new workspace from it ----
  await page.evaluateOnNewDocument(() => {
    const w = window as unknown as { __made: string[] };
    w.__made = [];
    const realFetch = window.fetch.bind(window);
    window.fetch = async (url, init) => {
      const res = await realFetch(url, init);
      if (String(url).endsWith('/snapshots') && init?.method === 'POST') {
        const one = ((await res.clone().json().catch(() => null)) as { snapshot?: { id?: string } } | null)?.snapshot?.id;
        if (one) w.__made.push(one);
      }
      return res;
    };
  });
  await openWorkspace(page, slugId);
  await until(page, `const b = __deep('#snapshot-btn'); return b && !b.disabled ? 1 : null;`);
  await ev(page, `__deep('#snapshot-btn').click(); return 1;`);
  await until(page, `return document.querySelector('snapshot-popover')?.shadowRoot.querySelector('[data-act=save]') ? 1 : null;`);
  await ev(page, `document.querySelector('snapshot-popover').shadowRoot.querySelector('[data-act=save]').click(); return 1;`);
  const snapId = await until<string>(page, `return window.__made?.[0] ?? null;`);
  check('a snapshot is saved', !!snapId);
  const started = snapId
    ? await api('owner', 'POST', `/snapshot/${snapId}/workspace`, undefined, { 'X-Pathogen-Snapshot': '1' })
    : {};
  const fromSnapshot = started.id as string | undefined;
  if (fromSnapshot) made.push(fromSnapshot);
  const snapFiles = fromSnapshot ? await sameFiles(fromSnapshot) : null;
  check('Start new workspace from the snapshot: the same files', !!snapFiles?.ok, snapFiles?.got ?? started);

  // ---- 5. Upload files… of the unzipped data files ----
  const target = await api('owner', 'POST', '/workspace', {
    name: `Uploads ${tag}`,
    files: { 'main.pathogen': { text: MAIN }, 'parts/gears.pathogen': { text: GEARS } },
    folders: ['data'],
    entryPoints: ['main.pathogen'],
  });
  const targetId = target.id as string;
  made.push(targetId);
  await openWorkspace(page, `${target.slug as string}--${targetId}`);
  await until(page, `return __deep('file-tree')?.shadowRoot.querySelector('[data-path="data"]') ? 1 : null;`);
  // The tree's + adds to the folder of the file in the editor: the top. Upload, then compare.
  const tree = `__deep('file-tree').shadowRoot`;
  const rect = async (sel: string): Promise<{ x: number; y: number }> =>
    ev(page, `const r = ${tree}.querySelector('${sel}').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  const add = await rect('.add');
  await page.mouse.click(add.x, add.y);
  await pause(300);
  const item = await rect('[data-action="upload-files"]');
  const [uploadChooser] = await Promise.all([
    page.waitForFileChooser({ timeout: 5000 }),
    page.mouse.click(item.x, item.y),
  ]);
  await uploadChooser.accept([join(folder, 'data', 'a.json'), join(folder, 'data', 'b.json')]);
  let uploaded: Record<string, string> = {};
  // Autosave: 5 s after the change, 30 s at least between saves.
  for (let i = 0; i < 90; i++) {
    uploaded = await shasOf(targetId);
    if (uploaded['a.json'] && uploaded['b.json']) break;
    await pause(500);
  }
  check(
    'Upload files…: the data files arrive whole',
    uploaded['a.json'] === EXPECTED['data/a.json'] && uploaded['b.json'] === EXPECTED['data/b.json'],
    uploaded,
  );

  // ---- 6. Approved, then Open as new workspace ----
  await api('owner', 'POST', `/workspace/${id}/submit-for-review`);
  check(
    'approved through the admin route',
    (await api('admin-token', 'POST', `/admin/review/${id}`, { decision: 'approve' })).status === 200,
  );
  await page.goto(`${PAGES_URL}/workspace/new?fromHandle=${OWNER.handle}&fromSlug=${created.slug as string}`, {
    waitUntil: 'domcontentloaded',
  });
  await until(page, `const n = ${VIEW}?.querySelector('[name="name"]'); return n && n.value.endsWith('(Copy)') ? 1 : null;`);
  await ev(page, `${VIEW}.querySelector('.primary-btn').click(); return 1;`);
  const forked = await newId(page);
  if (forked) made.push(forked);
  const forkedFiles = forked ? await sameFiles(forked) : null;
  check('Open as new workspace: the same files', !!forkedFiles?.ok, forkedFiles?.got ?? forked);

  check('no page errors', errors.length === 0, errors);
} finally {
  for (const one of made) await api('owner', 'DELETE', `/workspace/${one}`);
  d1(`DELETE FROM sessions WHERE token = '${OWNER.token}'; DELETE FROM users WHERE id = '${OWNER.id}';`);
  await Promise.race([browser.close(), pause(10_000)]);
  writeFileSync(RESULTS, `${JSON.stringify({ ran: new Date().toISOString(), failures, results }, null, 2)}\n`);
}
console.log(failures === 0 ? 'All checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

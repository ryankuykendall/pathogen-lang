// 2e, step 3a (note 58): a snapshot keeps every file as the preview drew it,
// and which program drew it. In the served playground, signed in (snapshots
// need a session), against the dev API:
// - a module edited but not saved, then Snapshot: /files holds the edited
//   text, every other file, the folders, the program list and `program`;
//   the saved files went by hash, the edit as text (the request's `files`);
// - a snapshot of a program that isn't the main keeps that program;
// - an edit since the render: the panel names its line and file;
// - the snapshots page opens a snapshot of several files, image and code;
// - Start new workspace from it holds every file, the folders and the main.
//
//   npm run dev:stack            (and npm run build:playground:dev after a change)
//   npx tsx project-docs/modules/verify/verify-2e-step3a.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const SHOTS = 'project-docs/modules/verify';
const USER_ID = `verify2e3a-${randomUUID().slice(0, 8)}`;
const TOKEN = `verify2e3a-${randomUUID()}`;
const COOKIE = `pathogen_session=${TOKEN}`;

const MAIN =
  'import { gear } from "./parts/gears.pathogen";\ndefine ViewBox(0, 0, 200, 100);\ngear(Point(100, 50), 40);\n';
const GEARS = 'module;\n\nexport fn gear(at, r) {\n  circle(at.x, at.y, r);\n}\n';
const GEARS_EDITED = 'module;\n\nexport fn gear(at, r) {\n  circle(at.x, at.y, r * 0.5);\n}\n';
const DEMO =
  'import { gear } from "../parts/gears.pathogen";\ndefine ViewBox(0, 0, 300, 100);\ngear(Point(50, 50), 30);\ngear(Point(150, 50), 30);\n';

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 800)}`}`);
  if (!ok) failures++;
};

function d1(sql: string): void {
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'svg-path-extended-users',
      '--local',
      '--persist-to=../.wrangler/state',
      '--command',
      sql,
    ],
    { cwd: 'api', stdio: ['pipe', 'pipe', 'inherit'] },
  );
}

async function api(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${DEV_API}${path}`, {
    method,
    headers: { Cookie: COOKIE, 'Content-Type': 'application/json', 'X-Pathogen-Snapshot': '1' },
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
    const value = (await page.evaluate(`(() => { ${DEEP} ${src} })()`)) as T;
    if (value) return value;
    await pause(150);
  }
  return null;
}
const ev = async <T>(page: Page, src: string): Promise<T> => (await page.evaluate(`(() => { ${DEEP} ${src} })()`)) as T;
const storeDo = async (page: Page, src: string): Promise<unknown> =>
  page.evaluate(`import('/state/store.js').then(({ store }) => { ${src} })`);

/** Press Snapshot, wait for the panel's naming state, and return its warning text. */
async function openPanel(page: Page): Promise<string> {
  await poll(page, `const b = __deep('#snapshot-btn'); return b && !b.disabled ? 1 : null;`);
  await ev(page, `__deep('#snapshot-btn').click(); return 1;`);
  await poll(
    page,
    `const p = document.querySelector('snapshot-popover'); return p?.hasAttribute('open') && p.shadowRoot.querySelector('#name') ? 1 : null;`,
  );
  return (await ev<string>(
    page,
    `return document.querySelector('snapshot-popover').shadowRoot.querySelector('.msg.warn')?.textContent ?? '';`,
  )) as string;
}

/**
 * Records each snapshot upload's form in the page: its `files` field (Chrome
 * doesn't hand puppeteer a multipart body) and the answer's snapshot id.
 */
const RECORD_UPLOADS = `
  window.__uploads = [];
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, init) => {
    const res = await realFetch(url, init);
    if (String(url).endsWith('/snapshots') && init?.method === 'POST' && init.body instanceof FormData) {
      const files = init.body.get('files');
      const id = (await res.clone().json().catch(() => null))?.snapshot?.id ?? null;
      window.__uploads.push({ files: typeof files === 'string' ? files : null, code: init.body.has('code'), id });
    }
    return res;
  };`;

/** Save the open panel; returns the new snapshot's id and the `files` field it sent. */
async function save(page: Page): Promise<{ id: string; files: string | null }> {
  const before = await ev<number>(page, `return window.__uploads.length;`);
  await ev(
    page,
    `document.querySelector('snapshot-popover').shadowRoot.querySelector('[data-act=save]').click(); return 1;`,
  );
  await poll(page, `return window.__uploads.length > ${before} ? 1 : null;`);
  await poll(
    page,
    `return document.querySelector('snapshot-popover')?.shadowRoot.querySelector('.done .title') ? 1 : null;`,
  );
  const upload = await ev<{ files: string | null; id: string | null }>(page, `return window.__uploads[${before}];`);
  await ev(page, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return 1;`);
  return { id: upload?.id ?? '', files: upload?.files ?? null };
}

const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${USER_ID}', '${USER_ID}@example.invalid', '${USER_ID}@example.invalid', '${USER_ID}', 'Verify 2e3a', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${TOKEN}', '${USER_ID}', ${now}, ${now + 3_600_000});`,
);
const made: string[] = [];
const browser = await puppeteer.launch({ headless: 'shell', args: ['--window-size=1400,900'] });
try {
  const created = (await (
    await api('POST', '/workspace', {
      name: 'Gears 2e3a',
      files: {
        'main.pathogen': { text: MAIN },
        'parts/gears.pathogen': { text: GEARS },
        'demos/gears.pathogen': { text: DEMO },
      },
      folders: ['spare'],
      entryPoints: ['main.pathogen', 'demos/gears.pathogen'],
    })
  ).json()) as { id: string; slug: string };
  made.push(created.id);
  const slugId = `${created.slug}--${created.id}`;

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  page.on('dialog', async (d) => d.accept());
  await page.setCookie({ name: 'pathogen_session', value: TOKEN, domain: 'localhost', path: '/' });
  await page.evaluateOnNewDocument(() => localStorage.setItem('pathogen-theme', 'light'));
  await page.evaluateOnNewDocument(RECORD_UPLOADS);
  await page.goto(`${PAGES_URL}/workspace/${slugId}`, { waitUntil: 'domcontentloaded' });
  const rendered = await poll(
    page,
    `return import('/state/store.js').then(({ store }) => store.get('renderedFiles')?.program ?? null);`,
    30_000,
  );
  check('the first render records its files, drawn by the main', rendered === 'main.pathogen', rendered);

  // An edit to the module that isn't saved (autosave only hears the editor), then a render.
  await storeDo(
    page,
    `store.set('workspaceFiles', { ...store.get('workspaceFiles'), 'parts/gears.pathogen': ${JSON.stringify(GEARS_EDITED)} });`,
  );
  await ev(page, `__deep('#refresh-btn').click(); return 1;`);
  await poll(
    page,
    `return import('/state/store.js').then(({ store }) => store.get('renderedFiles')?.texts.get('parts/gears.pathogen') === ${JSON.stringify(GEARS_EDITED)} ? 1 : null);`,
  );
  const fresh = await openPanel(page);
  check('the panel shows no edited-since note right after the render', fresh === '', fresh);
  const first = await save(page);
  check('the snapshot is saved', first.id !== '', first);
  const sent = first.files
    ? (JSON.parse(first.files) as { files: Record<string, { text?: string; sha256?: string }>; program: string })
    : null;
  check(
    'the upload sent the saved files by hash and the edit as text, with the program',
    !!sent &&
      typeof sent.files['main.pathogen']?.sha256 === 'string' &&
      typeof sent.files['demos/gears.pathogen']?.sha256 === 'string' &&
      sent.files['parts/gears.pathogen']?.text === GEARS_EDITED &&
      sent.program === 'main.pathogen',
    sent ?? 'the request body could not be read',
  );
  const files = (await (await api('GET', `/snapshot/${first.id}/files`)).json()) as {
    files: Record<string, { text: string }>;
    folders: string[];
    entryPoints: string[];
    program: string;
  };
  check(
    '/files holds every file as drawn (the module edited), the folders, the program list and the program',
    files.files['parts/gears.pathogen']?.text === GEARS_EDITED &&
      files.files['main.pathogen']?.text === MAIN &&
      files.files['demos/gears.pathogen']?.text === DEMO &&
      JSON.stringify(files.folders) === JSON.stringify(['spare']) &&
      JSON.stringify(files.entryPoints) === JSON.stringify(['main.pathogen', 'demos/gears.pathogen']) &&
      files.program === 'main.pathogen',
    files,
  );

  // A program that isn't the main.
  await storeDo(page, `store.set('shownProgram', 'demos/gears.pathogen');`);
  await ev(page, `__deep('#refresh-btn').click(); return 1;`);
  await poll(
    page,
    `return import('/state/store.js').then(({ store }) => store.get('renderedFiles')?.program === 'demos/gears.pathogen' ? 1 : null);`,
  );
  await openPanel(page);
  const second = await save(page);
  const secondFiles = (await (await api('GET', `/snapshot/${second.id}/files`)).json()) as { program: string };
  check(
    'a snapshot of demos/gears.pathogen keeps that program',
    secondFiles.program === 'demos/gears.pathogen',
    secondFiles,
  );

  // An edit since the render, in a module: the panel names its line and file.
  await storeDo(
    page,
    `store.set('workspaceFiles', { ...store.get('workspaceFiles'), 'parts/gears.pathogen': ${JSON.stringify(`${GEARS_EDITED}// later\n`)} });`,
  );
  const stale = await openPanel(page);
  check(
    'an edit since the render: the panel names its line and file',
    stale.startsWith("You've edited line 6 of parts/gears.pathogen since this rendered."),
    stale,
  );
  await page.screenshot({ path: `${SHOTS}/2e-step3a-stale-module-light.png` });
  await page.evaluate(`document.documentElement.setAttribute('data-theme', 'dark')`);
  await pause(300);
  await page.screenshot({ path: `${SHOTS}/2e-step3a-stale-module-dark.png` });
  await page.evaluate(`document.documentElement.setAttribute('data-theme', 'light')`);
  await ev(page, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return 1;`);

  // The snapshots page opens a snapshot of several files.
  const snaps = (await (await api('GET', `/workspace/${created.id}/snapshots`)).json()) as {
    snapshots: { id: string; n: number }[];
  };
  const n = snaps.snapshots.find((s) => s.id === first.id)?.n;
  await page.goto(`${PAGES_URL}/workspace/${slugId}/snapshots/${n}`, { waitUntil: 'domcontentloaded' });
  const viewer = await poll<string>(
    page,
    `const mw = __deep('workspace-snapshots-view')?.shadowRoot.querySelector('mini-workspace');
     const ifr = mw?.shadowRoot?.querySelector('mini-preview')?.shadowRoot?.querySelector('iframe');
     return ifr?.contentDocument?.querySelector('path[d]') ? mw.shadowRoot.querySelector('source-files')?.shownText ?? 'no code' : null;`,
    20_000,
  );
  check('the snapshots page shows its image, with the drawing program’s code', viewer === MAIN, viewer);
  await page.screenshot({ path: `${SHOTS}/2e-step3a-snapshots-page-light.png` });

  // Start new workspace from it: every file, the folders, the main.
  const started = (await (await api('POST', `/snapshot/${first.id}/workspace`)).json()) as { id: string };
  made.push(started.id);
  const loaded = (await (await api('GET', `/workspace/${started.id}`)).json()) as {
    files: Record<string, { text: string }>;
    folders: string[];
    entryPoints: string[];
  };
  check(
    'Start new workspace holds every file as drawn, the folders and the program list',
    loaded.files['parts/gears.pathogen']?.text === GEARS_EDITED &&
      Object.keys(loaded.files).length === 3 &&
      JSON.stringify(loaded.folders) === JSON.stringify(['spare']) &&
      loaded.entryPoints[0] === 'main.pathogen',
    loaded,
  );

  // A scratch buffer, signed in: its snapshot still sends its one program as `code`.
  const SCRATCH = 'define ViewBox(0, 0, 100, 100);\ncircle(50, 50, 30);\n';
  const state = Buffer.from(encodeURIComponent(JSON.stringify({ code: SCRATCH }))).toString('base64');
  await page.goto(`${PAGES_URL}/workspace/scratch?state=${state}`, { waitUntil: 'domcontentloaded' });
  await poll(page, `const b = __deep('#snapshot-btn'); return b && !b.disabled ? 1 : null;`, 30_000);
  await ev(page, `__deep('#snapshot-btn').click(); return 1;`);
  await poll(
    page,
    `return document.querySelector('snapshot-popover')?.shadowRoot.querySelector('[data-act=save]') ? 1 : null;`,
  );
  await ev(
    page,
    `document.querySelector('snapshot-popover').shadowRoot.querySelector('[data-act=save]').click(); return 1;`,
  );
  const scratch = await poll<{ code: boolean; files: string | null; id: string | null }>(
    page,
    `return window.__uploads.find((u) => u.id) ?? null;`,
  );
  check('a scratch buffer’s snapshot still sends `code`', !!scratch && scratch.code && scratch.files === null, scratch);
  const scratchWs = (await (await api('GET', '/workspaces')).json()) as
    { id: string; name: string }[] | { workspaces?: { id: string }[] };
  const list = Array.isArray(scratchWs) ? scratchWs : (scratchWs.workspaces ?? []);
  for (const ws of list) if (!made.includes(ws.id)) made.push(ws.id);
} finally {
  await browser.close();
  for (const id of made) await api('DELETE', `/workspace/${id}`);
  d1(`DELETE FROM sessions WHERE user_id = '${USER_ID}'; DELETE FROM users WHERE id = '${USER_ID}';`);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

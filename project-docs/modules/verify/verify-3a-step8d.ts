// Phase 3a, step 8d (note 85): the owner's snapshots and Make public, with a
// data file a load leaves deferred. On the dev stack, signed in, a workspace
// whose main draws a circle from each of data/a.json (1.5 MB) and data/b.json
// (1 MB: past the 2 MB of data an answer carries, so deferred):
// - the workspace opens and draws both circles (the owner's load reads b.json by hash);
// - a snapshot taken from the breadcrumb is saved (b.json goes by its hash),
//   and its page's code panel shows b.json whole, as data, highlighted as JSON
//   (light and dark screenshots);
// - Make public on the Workspaces page passes its check (the main compiles
//   with b.json) and submits.
//
//   npm run dev:stack   (then npm run build:playground:dev after a change)
//   npx tsx project-docs/modules/verify/verify-3a-step8d.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const SHOTS = 'project-docs/modules/verify/3a-step8d';
const RESULTS = 'project-docs/modules/verify/verify-3a-step8d-results.json';
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
const OWNER = { id: `v3a8d-${tag}`, token: `v3a8d-${randomUUID()}`, handle: `v3a8d${tag}` };

async function api(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${DEV_API}${path}`, {
    method,
    headers: { Cookie: `pathogen_session=${OWNER.token}`, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, ...((await res.json().catch(() => ({}))) as Record<string, unknown>) };
}

const MAIN = [
  'import a from "./data/a.json";',
  'import b from "./data/b.json";',
  'define ViewBox(0, 0, 200, 100);',
  'circle(40, 50, a.r);',
  'circle(130, 50, b.r);',
  '',
].join('\n');
const dataFile = (r: number, bytes: number): string => {
  const line = `    "${'x'.repeat(92)}",\n`;
  const lines = Math.floor((bytes - 40) / line.length);
  return `{\n  "r": ${r},\n  "pad": [\n${line.repeat(lines)}    "end"\n  ]\n}\n`;
};
const A = dataFile(10, Math.floor(1.5 * MB));
const B = dataFile(25, 1 * MB);

const DEEP = `
  window.__deep = (sel, root = document) => {
    const found = root.querySelector(sel);
    if (found) return found;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) { const f = window.__deep(sel, el.shadowRoot); if (f) return f; }
    }
    return null;
  };
  window.__mw = () => __deep('workspace-snapshots-view')?.shadowRoot.querySelector('mini-workspace');
  window.__sf = () => __mw()?.shadowRoot.querySelector('source-files');
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

mkdirSync(SHOTS, { recursive: true });
const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${OWNER.id}', '${OWNER.id}@example.invalid', '${OWNER.id}@example.invalid', '${OWNER.handle}', 'Verify 3a 8d', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${OWNER.token}', '${OWNER.id}', ${now}, ${now + 3_600_000});`,
);

const made: string[] = [];
const browser = await puppeteer.launch({ headless: 'shell', args: ['--window-size=1400,900'] });
try {
  const created = await api('POST', '/workspace', {
    name: `Data snapshots ${tag}`,
    files: { 'main.pathogen': { text: MAIN }, 'data/a.json': { text: A }, 'data/b.json': { text: B } },
    entryPoints: ['main.pathogen'],
  });
  const id = created.id as string;
  const slugId = `${created.slug as string}--${id}`;
  made.push(id);

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.on('dialog', (d) => void d.accept());
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setCookie({ name: 'pathogen_session', value: OWNER.token, domain: 'localhost', path: '/' });
  await page.evaluateOnNewDocument(() => {
    const w = window as unknown as { __made: string[]; __toasts: string[] };
    w.__made = [];
    w.__toasts = [];
    document.addEventListener('show-toast', (e) => w.__toasts.push(String((e as CustomEvent).detail?.title ?? '')));
    const realFetch = window.fetch.bind(window);
    window.fetch = async (url, init) => {
      const res = await realFetch(url, init);
      if (String(url).endsWith('/snapshots') && init?.method === 'POST') {
        const made = ((await res.clone().json().catch(() => null)) as { snapshot?: { id?: string } } | null)?.snapshot?.id;
        if (made) w.__made.push(made);
      }
      return res;
    };
  });

  // 1. The workspace opens and draws from both data files.
  await page.goto(`${PAGES_URL}/workspace/${slugId}`, { waitUntil: 'domcontentloaded' });
  const drawn = await until<boolean>(
    page,
    `const ds = window.__paths().join(' '); return /[Aa] ?25 25 /.test(ds) && /[Aa] ?10 10 /.test(ds);`,
  );
  check('the workspace opens and draws both circles, b.json read by its hash', drawn === true);

  // 2. A snapshot, taken from the breadcrumb.
  await until(page, `const b = __deep('#snapshot-btn'); return b && !b.disabled ? 1 : null;`);
  await ev(page, `__deep('#snapshot-btn').click(); return 1;`);
  await until(page, `return document.querySelector('snapshot-popover')?.shadowRoot.querySelector('[data-act=save]') ? 1 : null;`);
  await ev(page, `document.querySelector('snapshot-popover').shadowRoot.querySelector('[data-act=save]').click(); return 1;`);
  const snapId = await until<string>(page, `return window.__made[0] ?? null;`);
  check('a snapshot is saved', !!snapId, await ev(page, `return document.querySelector('snapshot-popover')?.shadowRoot.textContent ?? null;`));
  const snapFiles = (await api('GET', `/snapshot/${snapId}/files`)) as { files?: Record<string, { deferred?: boolean; size?: number }> };
  check(
    'the snapshot holds b.json whole, and its files answer leaves it deferred',
    snapFiles.files?.['data/b.json']?.deferred === true && snapFiles.files['data/b.json'].size === Buffer.byteLength(B),
    snapFiles.files && Object.fromEntries(Object.entries(snapFiles.files).map(([p, f]) => [p, f.deferred ? 'deferred' : f.size])),
  );

  // 3. Its page: the code panel shows b.json whole, as data, highlighted.
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluateOnNewDocument((t: string) => localStorage.setItem('pathogen-theme', t), theme);
    await page.goto(`${PAGES_URL}/workspace/${slugId}/snapshots/1`, { waitUntil: 'domcontentloaded' });
    await until(page, `return __sf() ? 1 : null;`);
    await ev(page, `__mw().setAttribute('code-open', ''); return 1;`);
    await until(page, `return __sf()?.shadowRoot.querySelector('.row.file[data-path="data/b.json"]') ? 1 : null;`);
    await ev(page, `__sf().shadowRoot.querySelector('.row.file[data-path="data/b.json"]').click(); return 1;`);
    const shown = await until<{ cls: string; length: number; key: string | null; num: string | null }>(
      page,
      `const sf = __sf(); if (sf.open !== 'data/b.json' || !sf.shadowRoot.querySelector('.cm-line')) return null;
       const spans = [...sf.shadowRoot.querySelectorAll('.cm-line span')];
       const color = (t) => { const s = spans.find((x) => x.textContent === t); return s ? getComputedStyle(s).color : null; };
       return { cls: sf.shadowRoot.querySelector('.row.file[data-path="data/b.json"]').className, length: sf.shownText.length, key: color('"r"'), num: color('25') };`,
    );
    check(
      `${theme}: the snapshot's code panel shows b.json whole, as data, highlighted as JSON`,
      !!shown && shown.cls.split(' ').includes('data') && shown.length === B.length && !!shown.key && shown.key !== shown.num,
      shown,
    );
    await pause(500);
    await page.screenshot({ path: `${SHOTS}/snapshot-code-${theme}.png` });
  }

  // 4. Make public, from the Workspaces page: the check compiles the main with b.json.
  await page.goto(`${PAGES_URL}/workspaces`, { waitUntil: 'domcontentloaded' });
  const item = `__deep('landing-view')?.shadowRoot?.querySelector('.workspace-item[data-id="${id}"] [data-action="toggle-publish"]')`;
  await until(page, `return ${item} ? 1 : null;`);
  await ev(page, `window.__toasts.length = 0; ${item}.click(); return 1;`);
  const toasts = await until<string[]>(page, `return window.__toasts.length > 0 ? window.__toasts : null;`, 60_000);
  const after = await api('GET', `/workspace/${id}`);
  check(
    'Make public passes its check and submits',
    !!toasts?.includes('Thank you for sharing your workspace.') && after.publicationState === 'pending',
    { toasts, state: after.publicationState },
  );
  check('no page errors', errors.length === 0, errors);
} finally {
  for (const id of made) await api('DELETE', `/workspace/${id}`);
  d1(`DELETE FROM sessions WHERE token = '${OWNER.token}'; DELETE FROM users WHERE id = '${OWNER.id}';`);
  await Promise.race([browser.close(), pause(10_000)]);
  writeFileSync(RESULTS, `${JSON.stringify({ ran: new Date().toISOString(), failures, results }, null, 2)}\n`);
}
console.log(failures === 0 ? 'All checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

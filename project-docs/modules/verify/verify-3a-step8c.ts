// Phase 3a, step 8c (note 85): a public workspace's data files, for a visitor.
// On the dev stack, a workspace approved through the admin route, whose main
// draws a circle from each of data/a.json (1.5 MB) and data/b.json (1 MB, so
// deferred: source.json carries 2 MB of data):
// - View source, signed out: both data files listed with the braces, b.json
//   read from the API's approval route and shown whole, highlighted as JSON
//   (light and dark screenshots);
// - Open as new workspace, signed in: the copy holds b.json whole, and its
//   main draws both circles.
//
//   npm run dev:stack   (then npm run build:playground:dev after a change)
//   npx tsx project-docs/modules/verify/verify-3a-step8c.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const SHOTS = 'project-docs/modules/verify/3a-step8c';
const RESULTS = 'project-docs/modules/verify/verify-3a-step8c-results.json';
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
const OWNER = { id: `v3a8c-${tag}`, token: `v3a8c-${randomUUID()}`, handle: `v3a8c${tag}` };

async function api(who: 'owner' | 'admin-token', method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const url = who === 'admin-token' ? `${DEV_API}${path}?token=${encodeURIComponent(ADMIN_TOKEN)}` : `${DEV_API}${path}`;
  const res = await fetch(url, {
    method,
    headers: { ...(who === 'owner' ? { Cookie: `pathogen_session=${OWNER.token}` } : {}), 'Content-Type': 'application/json' },
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
/** A data file of about `bytes`, on lines of 100 characters (highlighted, unlike one long line). */
const dataFile = (r: number, bytes: number): string => {
  const line = `    "${'x'.repeat(92)}",\n`;
  const lines = Math.floor((bytes - 40) / line.length);
  return `{\n  "r": ${r},\n  "pad": [\n${line.repeat(lines)}    "end"\n  ]\n}\n`;
};
const A = dataFile(10, Math.floor(1.5 * MB));
const B = dataFile(25, 1 * MB);
const hasRadius = (d: string, r: number): boolean => new RegExp(`[Aa] ?${r} ${r} `).test(d.replace(/,/g, ' '));

const DEEP = `
  window.__deep = (sel, root = document) => {
    const found = root.querySelector(sel);
    if (found) return found;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) { const f = window.__deep(sel, el.shadowRoot); if (f) return f; }
    }
    return null;
  };
  window.__sf = () => document.querySelector('source-files');
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

if (!ADMIN_TOKEN) throw new Error('api/.dev.vars has no ADMIN_TOKEN');
mkdirSync(SHOTS, { recursive: true });
const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${OWNER.id}', '${OWNER.id}@example.invalid', '${OWNER.id}@example.invalid', '${OWNER.handle}', 'Verify 3a 8c', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${OWNER.token}', '${OWNER.id}', ${now}, ${now + 3_600_000});`,
);

const made: string[] = [];
const browser = await puppeteer.launch({ headless: true, args: ['--window-size=1440,1000'] });
try {
  const created = await api('owner', 'POST', '/workspace', {
    name: `Data gears ${tag}`,
    files: { 'main.pathogen': { text: MAIN }, 'data/a.json': { text: A }, 'data/b.json': { text: B } },
    entryPoints: ['main.pathogen'],
  });
  const id = created.id as string;
  const slug = created.slug as string;
  made.push(id);
  await api('owner', 'POST', `/workspace/${id}/submit-for-review`);
  check(
    'the setup: approved through the admin route',
    (await api('admin-token', 'POST', `/admin/review/${id}`, { decision: 'approve' })).status === 200,
  );
  const sourceJson = (await (await fetch(`${PAGES_URL}/u/${OWNER.handle}/${slug}/source.json`)).json()) as {
    workspaceId?: string;
    files: Record<string, { deferred?: boolean; text?: string }>;
  };
  check(
    'source.json names its workspace, carries a.json and leaves b.json deferred',
    sourceJson.workspaceId === id &&
      typeof sourceJson.files['data/a.json']?.text === 'string' &&
      sourceJson.files['data/b.json']?.deferred === true,
    { workspaceId: sourceJson.workspaceId, files: Object.keys(sourceJson.files ?? {}) },
  );

  // ---- View source, signed out ----
  for (const theme of ['light', 'dark'] as const) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.evaluateOnNewDocument((t: string) => localStorage.setItem('pathogen-theme', t), theme);
    await page.goto(`${PAGES_URL}/u/${OWNER.handle}/${slug}`, { waitUntil: 'domcontentloaded' });
    await ev(page, `const d = document.querySelector('details.detail-source-disclosure'); d.open = true; d.dispatchEvent(new Event('toggle')); return 1;`);
    const loaded = await until<{ rows: [string, string][]; pending: number }>(
      page,
      `const sf = __sf(); if (!sf || sf.files.some((f) => f.pending)) return null;
       return { rows: [...sf.shadowRoot.querySelectorAll('.row.file')].map((r) => [r.dataset.path, r.className]), pending: 0 };`,
    );
    const dataRows = (loaded?.rows ?? []).filter(([p]) => p?.startsWith('data/'));
    check(
      `${theme}: View source lists both data files as data`,
      dataRows.length === 2 && dataRows.every(([, cls]) => cls.split(' ').includes('data')),
      loaded,
    );
    await ev(page, `__sf().shadowRoot.querySelector('.row.file[data-path="data/b.json"]').click(); return 1;`);
    const shown = await until<{ length: number; key: string | null; num: string | null }>(
      page,
      `const sf = __sf(); if (sf.open !== 'data/b.json' || !sf.shadowRoot.querySelector('.cm-line')) return null;
       const spans = [...sf.shadowRoot.querySelectorAll('.cm-line span')];
       const color = (t) => { const s = spans.find((x) => x.textContent === t); return s ? getComputedStyle(s).color : null; };
       return { length: sf.shownText.length, key: color('"r"'), num: color('25') };`,
    );
    check(
      `${theme}: b.json, read by its hash, shows whole, highlighted as JSON`,
      shown?.length === B.length && !!shown.key && !!shown.num && shown.key !== shown.num,
      shown,
    );
    await ev(page, `document.querySelector('details.detail-source-disclosure').scrollIntoView({ block: 'start' }); return 1;`);
    await pause(600);
    await page.screenshot({ path: `${SHOTS}/view-source-${theme}.png` });
    check(`${theme}: no page errors`, errors.length === 0, errors);
    await page.close();
  }

  // ---- Open as new workspace, signed in ----
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.on('dialog', (d) => void d.accept());
  await page.setCookie({ name: 'pathogen_session', value: OWNER.token, domain: 'localhost', path: '/' });
  await page.goto(`${PAGES_URL}/workspace/new?fromHandle=${OWNER.handle}&fromSlug=${slug}`, {
    waitUntil: 'domcontentloaded',
  });
  await until(page, `const v = __deep('new-workspace-view')?.shadowRoot; const n = v?.querySelector('[name="name"]'); return n && n.value.endsWith('(Copy)') ? 1 : null;`);
  await ev(page, `__deep('new-workspace-view').shadowRoot.querySelector('.primary-btn').click(); return 1;`);
  const copyId = await until<string>(
    page,
    `const m = location.pathname.match(/^\\/workspace\\/(?:.*--)?([^/]+)$/); return m && m[1] !== 'new' ? m[1] : null;`,
  );
  check('Open as new workspace makes the copy', !!copyId, copyId);
  if (copyId) {
    made.push(copyId);
    const copy = (await api('owner', 'GET', `/workspace/${copyId}`)) as {
      files?: Record<string, { size?: number; text?: string }>;
    };
    check(
      'the copy holds both data files whole',
      copy.files?.['data/b.json']?.size === Buffer.byteLength(B) && copy.files?.['data/a.json']?.text === A,
      { b: copy.files?.['data/b.json']?.size, expected: Buffer.byteLength(B) },
    );
    const drawn = await until<string>(
      page,
      `const ds = window.__paths().join(' '); return /[Aa] ?25 25 /.test(ds) && /[Aa] ?10 10 /.test(ds) ? ds : null;`,
    );
    check('its main draws both circles', !!drawn && hasRadius(drawn, 25) && hasRadius(drawn, 10));
  }
} finally {
  for (const id of made) await api('owner', 'DELETE', `/workspace/${id}`);
  d1(`DELETE FROM sessions WHERE token = '${OWNER.token}'; DELETE FROM users WHERE id = '${OWNER.id}';`);
  await Promise.race([browser.close(), pause(10_000)]);
  writeFileSync(RESULTS, `${JSON.stringify({ ran: new Date().toISOString(), failures, results }, null, 2)}\n`);
}
console.log(failures === 0 ? 'All checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

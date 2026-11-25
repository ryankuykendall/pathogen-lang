// Phase 3a, step 8b (note 85): the review screen, Approve and the approval-SVG
// backfill read a submission's deferred data files by hash, as an admin, and
// compile them with the rest; never as empty. On the dev stack, as the seed
// admin (admin@seed.pathogen.studio, in the dev ADMIN_EMAILS) with a throwaway
// session; the ADMIN_TOKEN comes from api/.dev.vars (never printed).
//
// The workspace: a main that draws a circle from each of two data files,
// data/a.json (1.5 MB) and data/b.json (1 MB). An answer carries 2 MB of data
// in path order, so b.json comes deferred, and the drawing needs it.
//
//   npm run dev:stack   (then npm run build:playground:dev after a change)
//   npx tsx project-docs/modules/verify/verify-3a-step8b.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const RESULTS = 'project-docs/modules/verify/verify-3a-step8b-results.json';
const ADMIN_TOKEN = (readFileSync('api/.dev.vars', 'utf8').match(/^ADMIN_TOKEN=(.*)$/m)?.[1] ?? '').trim();
const SEED_ADMIN_EMAIL = 'admin@seed.pathogen.studio';
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

function wrangler(args: string[]): string {
  return execFileSync('npx', ['wrangler', ...args], { cwd: 'api', stdio: ['pipe', 'pipe', 'inherit'] }).toString();
}
const d1 = (sql: string): string =>
  wrangler(['d1', 'execute', 'svg-path-extended-users', '--local', '--persist-to=../.wrangler/state', '--command', sql, '--json']);

const tag = randomUUID().slice(0, 8);
const OWNER = { id: `v3a8b-${tag}`, token: `v3a8b-${randomUUID()}`, handle: `v3a8b${tag}` };
const ADMIN_SESSION = `v3a8b-admin-${randomUUID()}`;

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
const dataFile = (r: number, bytes: number): string => {
  const head = `{ "r": ${r}, "pad": "`;
  return `${head}${'x'.repeat(bytes - head.length - 3)}" }`;
};
const A = dataFile(10, Math.floor(1.5 * MB));
const B = dataFile(25, 1 * MB);
/** Whether path data draws a circle of radius r (absolute or relative arcs). */
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
  window.__view = () => __deep('admin-moderation-view');
  window.__q = (sel) => __view()?.shadowRoot.querySelector(sel);
  window.__card = (id) => __q('[data-action="approve"][data-id="' + id + '"]')?.closest('.card')
    ?? __q('[data-action="reject-start"][data-id="' + id + '"]')?.closest('.card');`;
const ev = async <T>(page: Page, src: string): Promise<T> => (await page.evaluate(`(() => { ${DEEP} ${src} })()`)) as T;
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
mkdirSync('project-docs/modules/verify/3a-step8b', { recursive: true });
const now = Date.now();
const seedAdmin = (
  JSON.parse(d1(`SELECT id FROM users WHERE email_lower = '${SEED_ADMIN_EMAIL}'`)) as { results: { id: string }[] }[]
)[0].results[0];
const adminId = seedAdmin?.id ?? `v3a8b-admin-${tag}`;
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${OWNER.id}', '${OWNER.id}@example.invalid', '${OWNER.id}@example.invalid', '${OWNER.handle}', '${OWNER.handle}', ${now}, ${now}); ` +
    (seedAdmin
      ? ''
      : `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${adminId}', '${SEED_ADMIN_EMAIL}', '${SEED_ADMIN_EMAIL}', 'v3a8badmin${tag}', 'Admin', ${now}, ${now}); `) +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${OWNER.token}', '${OWNER.id}', ${now}, ${now + 3_600_000}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${ADMIN_SESSION}', '${adminId}', ${now}, ${now + 3_600_000});`,
);

const made: string[] = [];
const browser = await puppeteer.launch({ headless: true, args: ['--window-size=1440,900'] });
try {
  const created = await api('owner', 'POST', '/workspace', {
    name: `Data gears ${tag}`,
    files: { 'main.pathogen': { text: MAIN }, 'data/a.json': { text: A }, 'data/b.json': { text: B } },
    entryPoints: ['main.pathogen'],
  });
  const id = created.id as string;
  made.push(id);
  await api('owner', 'POST', `/workspace/${id}/submit-for-review`);
  const source = await fetch(
    `${DEV_API}/admin/review/${id}/source?queue=review&token=${encodeURIComponent(ADMIN_TOKEN)}`,
  ).then((r) => r.json() as Promise<{ files: Record<string, { deferred?: boolean; text?: string }> }>);
  check(
    'the setup: the review source carries a.json and leaves b.json deferred',
    typeof source.files['data/a.json']?.text === 'string' && source.files['data/b.json']?.deferred === true,
    Object.fromEntries(Object.entries(source.files).map(([p, f]) => [p, f.deferred ? 'deferred' : typeof f.text])),
  );

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('dialog', (d) => void d.accept());
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.setCookie({ name: 'pathogen_session', value: ADMIN_SESSION, domain: 'localhost', path: '/' });
  await page.goto(`${PAGES_URL}/admin/moderation`, { waitUntil: 'domcontentloaded' });

  // The card: the drawing from both data files, b.json read by its hash; Approve on.
  const card = await until<{ ds: string[]; approve: boolean; why: string | null }>(
    page,
    `const c = __card('${id}'); if (!c) return null;
     const ds = [...c.querySelectorAll('.thumb svg path')].map((p) => p.getAttribute('d') ?? '');
     const why = c.querySelector('.why')?.textContent ?? null;
     if (ds.length === 0 && !why) return null;
     return { ds, approve: c.querySelector('[data-action="approve"]').disabled, why };`,
  );
  const ds = card?.ds.join(' ') ?? '';
  check(
    'the card draws both circles, the one from the deferred b.json among them, and Approve is on',
    !!card && hasRadius(ds, 10) && hasRadius(ds, 25) && !card.approve && card.why === null,
    card && { ...card, ds: card.ds.map((d) => d.slice(0, 120)) },
  );
  await page.screenshot({ path: 'project-docs/modules/verify/3a-step8b/review-card.png' });

  // Approve: the approved drawing is the one with b.json's circle.
  await ev(page, `__card('${id}').querySelector('[data-action="approve"]').click(); return 1;`);
  await until(page, `return __card('${id}') ? null : 1;`);
  const approval = await api('admin-token', 'GET', `/admin/approval/${id}`);
  const svg = await fetch(`${DEV_API}/approval-svg/${id}`).then((r) => (r.ok ? r.text() : ''));
  check(
    'Approve approves it with its drawing, both circles in the approved SVG',
    typeof approval.approvalSvgAt === 'string' && hasRadius(svg, 10) && hasRadius(svg, 25),
    { svgAt: approval.approvalSvgAt, svg: svg.slice(0, 400) },
  );

  // The backfill script (node), regenerating it: it reads b.json by hash as an admin too.
  let backfill = '';
  try {
    backfill = execFileSync('npx', ['tsx', 'scripts/backfill-approval-svgs.ts', '--only', id], {
      env: { ...process.env, ADMIN_TOKEN },
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();
  } catch (err) {
    backfill = `${(err as { stdout?: Buffer }).stdout?.toString() ?? ''}${(err as Error).message}`;
  }
  const again = await fetch(`${DEV_API}/approval-svg/${id}`).then((r) => (r.ok ? r.text() : ''));
  check(
    'the backfill script regenerates it from every file, b.json read by hash',
    /✓/.test(backfill) && !/✗/.test(backfill) && hasRadius(again, 25),
    backfill.split('\n').slice(-8),
  );
  check('no page errors', pageErrors.length === 0, pageErrors);
} finally {
  for (const id of made) await api('owner', 'DELETE', `/workspace/${id}`);
  d1(
    `DELETE FROM sessions WHERE token IN ('${OWNER.token}', '${ADMIN_SESSION}'); DELETE FROM users WHERE id = '${OWNER.id}';` +
      (seedAdmin ? '' : ` DELETE FROM users WHERE id = '${adminId}';`),
  );
  await Promise.race([browser.close(), pause(10_000)]);
  writeFileSync(RESULTS, `${JSON.stringify({ ran: new Date().toISOString(), failures, results }, null, 2)}\n`);
}

console.log(failures === 0 ? 'All checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

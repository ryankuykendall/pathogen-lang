// 2e step 5e, piece 4: the Approved tab's actions draw every file, and the screen's own
// colours follow the theme. On the dev stack (localhost:3000 and :8787), in full Chrome,
// as the seed admin.
// - A workspace of several files is approved; on the Approved tab, Regenerate stores a
//   preview of its main compiled with its imports (two gears, four circles), and Set
//   thumbnail opens the crop on the same drawing.
// - The modal on the Approved card shows every file.
// - Dark: the Reject outline, the error panel and the primary button's ink use the dark
//   colours (computed styles), with light and dark screenshots of the Pending tab.
//
// One throwaway owner and the seed admin (admin@seed.pathogen.studio) with a throwaway
// session. The ADMIN_TOKEN comes from api/.dev.vars (never printed). Everything made is
// deleted.
//
//   npm run dev:stack            (and npm run build:playground:dev after a change)
//   npx tsx project-docs/modules/verify/verify-2e-step5e-4.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const OUT = 'project-docs/modules/verify';
const ADMIN_TOKEN = (readFileSync('api/.dev.vars', 'utf8').match(/^ADMIN_TOKEN=(.*)$/m)?.[1] ?? '').trim();
const SEED_ADMIN_EMAIL = 'admin@seed.pathogen.studio';
const pause = async (ms: number): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms));
};

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 900)}`}`);
  if (!ok) failures++;
};

const d1 = (sql: string): string =>
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
      '--json',
    ],
    { cwd: 'api', stdio: ['pipe', 'pipe', 'inherit'] },
  ).toString();

const tag = randomUUID().slice(0, 8);
const OWNER = { id: `v2e5e4-${tag}`, token: `v2e5e4-${randomUUID()}`, handle: `v2e5e4${tag}` };
const ADMIN_SESSION = `v2e5e4-admin-${randomUUID()}`;

async function api(
  who: 'owner' | 'admin-token',
  method: string,
  path: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const url =
    who === 'admin-token' ? `${DEV_API}${path}?token=${encodeURIComponent(ADMIN_TOKEN)}` : `${DEV_API}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      ...(who === 'owner' ? { Cookie: `pathogen_session=${OWNER.token}` } : {}),
      'Content-Type': 'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, ...((await res.json().catch(() => ({}))) as Record<string, unknown>) };
}

const MAIN =
  'import { gear } from "./parts/gears.pathogen";\ndefine ViewBox(0, 0, 200, 100);\ngear(Point(55, 50), 40);\ngear(Point(140, 50), 30);\n';
const GEARS = 'module;\n\nexport fn gear(at, r) {\n  circle(at.x, at.y, r);\n  circle(at.x, at.y, r / 3);\n}\n';
const SEVERAL = {
  files: { 'main.pathogen': { text: MAIN }, 'parts/gears.pathogen': { text: GEARS } },
  folders: ['parts'],
  entryPoints: ['main.pathogen'],
};
const moves = (d: string | null | undefined): number => (d ?? '').match(/M/g)?.length ?? 0;

const DEEP = `
  window.__deep = (sel, root = document) => {
    const found = root.querySelector(sel);
    if (found) return found;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) { const f = window.__deep(sel, el.shadowRoot); if (f) return f; }
    }
    return null;
  };
  window.__q = (sel) => __deep('admin-moderation-view')?.shadowRoot.querySelector(sel);`;
const ev = async <T>(page: Page, src: string): Promise<T> => (await page.evaluate(`(() => { ${DEEP} ${src} })()`)) as T;
async function until<T>(page: Page, src: string, ms = 30_000): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const value = await ev<T | null>(page, src).catch(() => null);
    if (value) return value;
    await pause(200);
  }
  return null;
}

if (!ADMIN_TOKEN) throw new Error('api/.dev.vars has no ADMIN_TOKEN');
const now = Date.now();
const seedAdmin = (
  JSON.parse(d1(`SELECT id FROM users WHERE email_lower = '${SEED_ADMIN_EMAIL}'`)) as { results: { id: string }[] }[]
)[0].results[0];
const adminId = seedAdmin?.id ?? `v2e5e4-admin-${tag}`;
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${OWNER.id}', '${OWNER.id}@example.invalid', '${OWNER.id}@example.invalid', '${OWNER.handle}', '${OWNER.handle}', ${now}, ${now}); ` +
    (seedAdmin
      ? ''
      : `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${adminId}', '${SEED_ADMIN_EMAIL}', '${SEED_ADMIN_EMAIL}', 'v2e5e4admin${tag}', 'Admin', ${now}, ${now}); `) +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${OWNER.token}', '${OWNER.id}', ${now}, ${now + 3_600_000}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${ADMIN_SESSION}', '${adminId}', ${now}, ${now + 3_600_000});`,
);

const made: string[] = [];
const browser = await puppeteer.launch({ headless: true, args: ['--window-size=1440,900'] });
try {
  // Approved: several files, approved with no drawing (so Regenerate makes the first one).
  const created = await api('owner', 'POST', '/workspace', { name: `Gears ${tag}`, ...SEVERAL });
  const approved = created.id as string;
  made.push(approved);
  await api('owner', 'POST', `/workspace/${approved}/submit-for-review`);
  check(
    'the workspace is approved, with no drawing',
    (await api('admin-token', 'POST', `/admin/review/${approved}`, { decision: 'approve' })).status === 200,
  );
  // Pending: one more, for the Reject outline's colour.
  const pending = (await api('owner', 'POST', '/workspace', { name: `Rings ${tag}`, ...SEVERAL })).id as string;
  made.push(pending);
  await api('owner', 'POST', `/workspace/${pending}/submit-for-review`);

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('dialog', (d) => void d.accept());
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.setCookie({ name: 'pathogen_session', value: ADMIN_SESSION, domain: 'localhost', path: '/' });
  await page.goto(`${PAGES_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(`localStorage.setItem('pathogen-theme', 'light')`);
  await page.goto(`${PAGES_URL}/admin/moderation`, { waitUntil: 'domcontentloaded' });

  // ---- Regenerate draws every file ----
  await until(page, `const t = __q('.tab[data-tab="approved"]'); if (!t) return null; t.click(); return 1;`);
  await until(page, `return __q('[data-action="regenerate"][data-id="${approved}"]') ? 1 : null;`);
  await ev(page, `__q('[data-action="regenerate"][data-id="${approved}"]').click(); return 1;`);
  let preview = '';
  for (let i = 0; i < 150 && !preview; i++) {
    const res = await fetch(`${DEV_API}/approval-svg/${approved}`);
    if (res.ok) preview = await res.text();
    else await pause(200);
  }
  check(
    "Regenerate stores the main's drawing with its imports (two gears, four circles)",
    moves(preview.match(/ d="([^"]*)"/)?.[1]) === 4,
    preview.slice(0, 300),
  );

  // ---- Set thumbnail crops the same drawing ----
  await until(
    page,
    `const b = __q('[data-action="set-thumbnail"][data-id="${approved}"]'); return b && !b.disabled ? 1 : null;`,
  );
  await ev(page, `__q('[data-action="set-thumbnail"][data-id="${approved}"]').click(); return 1;`);
  const cropped = await until<string>(
    page,
    `const m = document.querySelector('thumbnail-crop-modal');
     if (!m?.classList.contains('open')) return null;
     return m.shadowRoot.querySelector('svg path[d]')?.getAttribute('d') ?? null;`,
  );
  check('Set thumbnail opens the crop on the same drawing', moves(cropped) === 4, cropped?.slice(0, 200));
  await ev(page, `document.querySelector('thumbnail-crop-modal').close(); return 1;`);

  // ---- The Approved card's modal shows every file ----
  await ev(page, `__q('[data-action="review-catalog"][data-id="${approved}"]').click(); return 1;`);
  const rows = await until<string[]>(
    page,
    `const sf = __q('.modal-main mini-workspace')?.shadowRoot.querySelector('source-files');
     const r = sf ? [...sf.shadowRoot.querySelectorAll('.row.file, .row.project')].map((x) => x.dataset.path) : [];
     return r.length ? r : null;`,
  );
  check(
    "the Approved card's modal shows every file",
    JSON.stringify(rows) === JSON.stringify(['parts/gears.pathogen', 'main.pathogen', 'pathogen.json']),
    rows,
  );
  await ev(page, `__q('.modal [data-action="close-modal"]').click(); return 1;`);

  // ---- The screen's colours, light and dark ----
  const colours = `const reject = __q('[data-action="reject-start"][data-id="${pending}"]');
     const approve = __q('[data-action="approve"][data-id="${pending}"]');
     if (!reject || !approve) return null;
     const probe = document.createElement('div'); probe.className = 'error'; __q('.content').append(probe);
     const out = { reject: getComputedStyle(reject).color, approveInk: getComputedStyle(approve).color,
       errorBg: getComputedStyle(probe).backgroundColor, errorInk: getComputedStyle(probe).color };
     probe.remove(); return out;`;
  const seen: Record<string, Record<string, string> | null> = {};
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate(`localStorage.setItem('pathogen-theme', '${theme}')`);
    await page.goto(`${PAGES_URL}/admin/moderation`, { waitUntil: 'domcontentloaded' });
    seen[theme] = await until<Record<string, string>>(page, colours);
    await until(
      page,
      `return __q('[data-action="approve"][data-id="${pending}"]')?.closest('.card').querySelector('.thumb svg path') ? 1 : null;`,
    );
    await pause(300);
    const box = await ev<{ x: number; y: number; width: number; height: number } | null>(
      page,
      `const r = __q('[data-action="approve"][data-id="${pending}"]')?.closest('.card').getBoundingClientRect();
       return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;`,
    );
    if (box) await page.screenshot({ path: `${OUT}/2e-step5e-colours-${theme}.png`, clip: box });
  }
  check(
    'light: the screen keeps its colours (Reject #b8302c, the error panel, the accent ink)',
    seen.light?.reject === 'rgb(184, 48, 44)' &&
      seen.light.errorBg === 'rgb(255, 245, 245)' &&
      seen.light.errorInk === 'rgb(168, 50, 50)' &&
      seen.light.approveInk === 'rgb(255, 250, 242)',
    seen.light,
  );
  check(
    'dark: Reject, the error panel and the Approve ink take the dark colours',
    seen.dark?.reject === 'rgb(248, 113, 113)' &&
      seen.dark.errorBg === 'rgba(239, 68, 68, 0.12)' &&
      seen.dark.errorInk === 'rgb(252, 165, 165)' &&
      seen.dark.approveInk === 'rgb(26, 20, 36)',
    seen.dark,
  );
  await page.evaluate(`localStorage.setItem('pathogen-theme', 'light')`);
} finally {
  for (const id of made) await api('owner', 'DELETE', `/workspace/${id}`);
  d1(
    `DELETE FROM sessions WHERE token IN ('${OWNER.token}', '${ADMIN_SESSION}'); DELETE FROM users WHERE id = '${OWNER.id}';` +
      (seedAdmin ? '' : ` DELETE FROM users WHERE id = '${adminId}';`),
  );
  await Promise.race([browser.close(), pause(10_000)]);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

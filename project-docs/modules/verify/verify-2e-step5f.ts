// 2e step 5f: the two admin tools that compiled a workspace's one text now compile its
// main with its imports. On the dev stack (localhost:3000 and :8787).
// - scripts/backfill-approval-svgs.ts, run for real (--only, --force) on an approval of
//   two files: its stored preview is the main's drawing with its imports (two gears,
//   four circles); --dry-run says how many files it read.
// - The admin thumbnail tool (/admin/thumbnails?token=…), in full Chrome: Auto-generate
//   on a workspace of two files, never given a thumbnail, uploads one.
//
// One throwaway owner (a session in the local D1). The ADMIN_TOKEN comes from
// api/.dev.vars and is passed to the script in its environment, never printed.
// Everything made is deleted.
//
//   npm run dev:stack            (and npm run build:playground:dev after a change)
//   npx tsx project-docs/modules/verify/verify-2e-step5f.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ADMIN_TOKEN = (readFileSync('api/.dev.vars', 'utf8').match(/^ADMIN_TOKEN=(.*)$/m)?.[1] ?? '').trim();
const pause = async (ms: number): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms));
};

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 900)}`}`);
  if (!ok) failures++;
};

const d1 = (sql: string): void => {
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
};

const tag = randomUUID().slice(0, 8);
const OWNER = { id: `v2e5f-${tag}`, token: `v2e5f-${randomUUID()}`, handle: `v2e5f${tag}` };

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

/** The backfill script, the token in its environment only; its output (which never holds the token). */
function backfill(args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync('npx', ['tsx', 'scripts/backfill-approval-svgs.ts', ...args], {
      env: { ...process.env, ADMIN_TOKEN },
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: Buffer; stderr?: Buffer };
    return { code: e.status ?? 1, out: `${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}` };
  }
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
  };`;
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
const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${OWNER.id}', '${OWNER.id}@example.invalid', '${OWNER.id}@example.invalid', '${OWNER.handle}', '${OWNER.handle}', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${OWNER.token}', '${OWNER.id}', ${now}, ${now + 3_600_000});`,
);

const made: string[] = [];
const browser = await puppeteer.launch({ headless: true, args: ['--window-size=1280,900'] });
try {
  // ---- The approval-SVG backfill ----
  const approved = (await api('owner', 'POST', '/workspace', { name: `Gears ${tag}`, ...SEVERAL })).id as string;
  made.push(approved);
  await api('owner', 'POST', `/workspace/${approved}/submit-for-review`);
  check(
    'an approval of two files, with no drawing',
    (await api('admin-token', 'POST', `/admin/review/${approved}`, { decision: 'approve' })).status === 200,
  );
  const dry = backfill(['--dry-run', '--only', approved]);
  check(
    'the dry run reads the main and its other file',
    dry.code === 0 && dry.out.includes('main.pathogen with 1 more file(s)') && !dry.out.includes(ADMIN_TOKEN),
    dry.out.slice(-600),
  );
  const run = backfill(['--only', approved, '--force']);
  check('the backfill runs', run.code === 0 && run.out.includes(`✓  ${approved}`), run.out.slice(-600));
  const preview = await (await fetch(`${DEV_API}/approval-svg/${approved}`)).text();
  check(
    "its preview is the main's drawing with its imports (two gears, four circles)",
    moves(preview.match(/ d="([^"]*)"/)?.[1]) === 4,
    preview.slice(0, 300),
  );

  // ---- The admin thumbnail tool ----
  const bare = (await api('owner', 'POST', '/workspace', { name: `Bare gears ${tag}`, ...SEVERAL })).id as string;
  made.push(bare);
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.goto(`${PAGES_URL}/admin/thumbnails?token=${encodeURIComponent(ADMIN_TOKEN)}`, {
    waitUntil: 'domcontentloaded',
  });
  const listed = await until(page, `return __deep('[data-action="generate"][data-id="${bare}"]') ? 1 : null;`);
  check('the tool lists the workspace of two files', listed === 1);
  await ev(page, `__deep('[data-action="generate"][data-id="${bare}"]').click(); return 1;`);
  const status = await until<string>(
    page,
    `const row = __deep('[data-action="open"][data-id="${bare}"]')?.closest('.workspace-row');
     return row?.querySelector('.status.done, .status.error')?.textContent ?? null;`,
  );
  const thumb = await fetch(`${DEV_API}/thumbnail/${bare}/256`);
  check(
    'Auto-generate compiles it from its main with its imports and uploads a thumbnail',
    status === 'Done' && thumb.status === 200 && (thumb.headers.get('content-type') ?? '').startsWith('image/'),
    { status, http: thumb.status },
  );
} finally {
  for (const id of made) await api('owner', 'DELETE', `/workspace/${id}`);
  d1(`DELETE FROM sessions WHERE token = '${OWNER.token}'; DELETE FROM users WHERE id = '${OWNER.id}';`);
  await Promise.race([browser.close(), pause(10_000)]);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

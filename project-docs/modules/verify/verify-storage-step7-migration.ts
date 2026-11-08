// Storage step 7 (note 50): scripts/migrate-workspace-files-kv.ts, end to end
// on the local dev stack, against records saved the way they were before
// phase 2. It seeds, into local KV, D1 and R2:
//   - workspace A and its approval, unedited since approval;
//   - workspace B, edited since its approval, with a re-review queue entry;
//   - a snapshot of A with a code.pathogen and no manifest.json;
// then runs the migration for each workspace (--only): a dry run, the write,
// and a dry run again, which must report everything "already". Then it reads
// the migrated records back through the real API (:8787) and Pages worker
// (:3000): the same code, an unchanged save skipped, the re-review queue,
// the detail page and source.json, and the snapshot's code. Everything is
// deleted after.
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/verify-storage-step7-migration.ts

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const PERSIST = '--persist-to=../.wrangler/state';
const BUCKET = 'svg-path-extended-thumbnails-preview';
const suffix = randomUUID().slice(0, 8);
const USER_ID = `verify7-${suffix}`;
const HANDLE = `verify7${suffix}`;
const TOKEN = `verify7-${randomUUID()}`;
const COOKIE = `pathogen_session=${TOKEN}`;
const WS_A = `v7a${suffix}${randomUUID().slice(0, 10)}`;
const WS_B = `v7b${suffix}${randomUUID().slice(0, 10)}`;
const SNAP = `v7s${suffix}${randomUUID().slice(0, 10)}`;
const CODE_A = 'define ViewBox(0, 0, 100, 100);\n// STEP7 unedited\ncircle(50, 50, 40);\n';
const CODE_B = 'define ViewBox(0, 0, 100, 100);\n// STEP7 approved\nrect(10, 10, 80, 80);\n';
const CODE_B_EDITED = `${CODE_B}// edited after approval\n`;
const SNAP_CODE = 'define ViewBox(0, 0, 100, 100);\n// STEP7 snapshot\ncircle(50, 50, 10);\n';
const ADMIN_TOKEN = (readFileSync('api/.dev.vars', 'utf8').match(/^ADMIN_TOKEN=(.*)$/m)?.[1] ?? '').replace(
  /^"(.*)"$/,
  '$1',
);

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 500)}`}`);
  if (!ok) failures++;
};
/** The hash a record saved before phase 2 carried: SHA-256, first 8 bytes, hex. */
const oldHash = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wrangler(args: string[]): string {
  return execFileSync('npx', ['wrangler', ...args], { cwd: 'api', encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
}
function kvPut(key: string, value: unknown): void {
  const file = join(process.cwd(), 'tmp', 'step7-seed', key.replace(/[^A-Za-z0-9_.-]/g, '_'));
  mkdirSync(join(process.cwd(), 'tmp', 'step7-seed'), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
  try {
    wrangler(['kv', 'key', 'put', '--binding=WORKSPACES', '--preview', 'true', '--local', PERSIST, key, `--path=${file}`]);
  } finally {
    rmSync(file, { force: true });
  }
}
function kvGet(key: string): string | null {
  try {
    const raw = wrangler(['kv', 'key', 'get', '--binding=WORKSPACES', '--preview', 'true', '--local', PERSIST, key]);
    return raw.trim() === 'Value not found' ? null : raw;
  } catch {
    return null;
  }
}
function r2Put(key: string, text: string, contentType: string): void {
  const file = join(process.cwd(), 'tmp', 'step7-seed', key.replace(/[^A-Za-z0-9_.-]/g, '_'));
  mkdirSync(join(process.cwd(), 'tmp', 'step7-seed'), { recursive: true });
  writeFileSync(file, text);
  try {
    wrangler(['r2', 'object', 'put', `${BUCKET}/${key}`, `--file=${file}`, `--content-type=${contentType}`, '--local', PERSIST]);
  } finally {
    rmSync(file, { force: true });
  }
}
function d1(sql: string): void {
  wrangler(['d1', 'execute', 'svg-path-extended-users', '--local', PERSIST, '--command', sql]);
}
function migrate(args: string[]): { status: number; out: string } {
  try {
    const out = execFileSync('npx', ['tsx', 'scripts/migrate-workspace-files-kv.ts', '--env', 'dev', ...args], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { status: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return { status: e.status ?? 1, out: e.stdout ?? '' };
  }
}
async function api(method: string, path: string, body?: unknown, admin = false): Promise<Response> {
  const url = admin ? `${DEV_API}${path}?token=${encodeURIComponent(ADMIN_TOKEN)}` : `${DEV_API}${path}`;
  return fetch(url, {
    method,
    headers: { Cookie: COOKIE, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function legacyWorkspace(id: string, slug: string, name: string, code: string): Record<string, unknown> {
  return {
    id,
    slug,
    userId: USER_ID,
    name,
    description: '',
    code,
    isPublic: true,
    preferences: {},
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    contentHash: oldHash(code),
    rev: 3,
    thumbnailAt: null,
    manualThumbnailAt: null,
    autoThumbnailAt: null,
  };
}
function legacyApproval(id: string, slug: string, name: string, code: string): Record<string, unknown> {
  return {
    workspaceId: id,
    userId: USER_ID,
    code,
    codeHash: oldHash(code),
    slug,
    name,
    description: '',
    manualThumbnailAt: null,
    autoThumbnailAt: null,
    approvedAt: '2026-10-02T00:00:00.000Z',
    approvedByUserId: 'admin',
    featuredAt: null,
    ownerHandle: HANDLE,
  };
}

if (!ADMIN_TOKEN) {
  console.error('api/.dev.vars has no ADMIN_TOKEN, so the dev API has no admin to act as.');
  process.exit(1);
}

// ─── Seed records saved before phase 2 ──────────────────────────────────
const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${USER_ID}', '${USER_ID}@example.invalid', '${USER_ID}@example.invalid', '${HANDLE}', 'Verify 7', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${TOKEN}', '${USER_ID}', ${now}, ${now + 3_600_000}); ` +
    `INSERT INTO snapshots (id, user_id, workspace_id, n, name, note, svg_bytes, code_bytes, created_at) VALUES ('${SNAP}', '${USER_ID}', '${WS_A}', 1, 'Step7 #1', '', 10, ${Buffer.byteLength(SNAP_CODE)}, ${now});`,
);
const rereviewBefore = kvGet('queue:rereview');
try {
  kvPut(`workspace:${WS_A}`, legacyWorkspace(WS_A, 'step7-unedited', 'Step7 Unedited', CODE_A));
  kvPut(`approval:${WS_A}`, legacyApproval(WS_A, 'step7-unedited', 'Step7 Unedited', CODE_A));
  kvPut(`workspace:${WS_B}`, legacyWorkspace(WS_B, 'step7-edited', 'Step7 Edited', CODE_B_EDITED));
  kvPut(`approval:${WS_B}`, legacyApproval(WS_B, 'step7-edited', 'Step7 Edited', CODE_B));
  kvPut(`user:${USER_ID}:workspaces`, [WS_A, WS_B]);
  const queue = rereviewBefore ? (JSON.parse(rereviewBefore) as unknown[]) : [];
  kvPut('queue:rereview', [
    ...queue,
    {
      workspaceId: WS_B,
      userId: USER_ID,
      code: CODE_B_EDITED,
      codeHash: oldHash(CODE_B_EDITED),
      name: 'Step7 Edited',
      description: '',
      slug: 'step7-edited',
      submittedAt: '2026-10-03T00:00:00.000Z',
    },
  ]);
  const snapPrefix = `snapshots/${WS_A}/${SNAP}/`;
  r2Put(`${snapPrefix}code.pathogen`, SNAP_CODE, 'text/plain; charset=utf-8');
  r2Put(`${snapPrefix}image.svg`, '<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml');
  check('seeded records saved the way they were before phase 2', true);

  // ─── The migration: dry run, write, dry run ────────────────────────────
  for (const id of [WS_A, WS_B]) {
    const dry = migrate(['--only', id]);
    check(`dry run for ${id === WS_A ? 'A' : 'B'} would migrate, with no errors`, dry.status === 0 && /migrated\s+[1-9]/.test(dry.out), dry.out);
    check(
      `its re-review check holds (${id === WS_A ? 'A' : 'B'})`,
      dry.out.includes('every approval answers the same before and after'),
      dry.out,
    );
    const written = migrate(['--only', id, '--write', '--backup-dir', `tmp/kv-backups/step7-verify-${suffix}`]);
    check(`the write for ${id === WS_A ? 'A' : 'B'} succeeds`, written.status === 0, written.out);
    const again = migrate(['--only', id]);
    check(
      `a second dry run finds ${id === WS_A ? 'A' : 'B'} already migrated`,
      again.status === 0 && /migrated\s+0/.test(again.out) && /already\s+[1-9]/.test(again.out),
      again.out,
    );
  }
  const migratedA = JSON.parse(kvGet(`workspace:${WS_A}`) ?? '{}') as Record<string, unknown>;
  check('the record holds a manifest, no `code`, and its rev unchanged', migratedA.code === undefined && migratedA.files !== undefined && migratedA.rev === 3, migratedA);

  // ─── Read back through the API and the Pages worker ───────────────────
  const loadedA = (await (await api('GET', `/workspace/${WS_A}`)).json()) as { code?: string };
  check('the API loads A with the same code', loadedA.code === CODE_A, loadedA);
  const savedA = (await (await api('PUT', `/workspace/${WS_A}`, { code: CODE_A, baseRev: 3 })).json()) as {
    skipped?: boolean;
  };
  check('an unchanged save of A is skipped', savedA.skipped === true, savedA);
  const rereview = (await (await api('GET', '/admin/queue/rereview', undefined, true)).json()) as {
    entries: { workspaceId: string; code?: string }[];
  };
  const entryB = rereview.entries.find((e) => e.workspaceId === WS_B);
  check('B is still in re-review, A is not', entryB?.code === CODE_B_EDITED && !rereview.entries.some((e) => e.workspaceId === WS_A), rereview.entries.map((e) => e.workspaceId));
  const savedB = (await (await api('PUT', `/workspace/${WS_B}`, { code: CODE_B_EDITED, baseRev: 3 })).json()) as {
    skipped?: boolean;
  };
  check('an unchanged save of B is skipped too', savedB.skipped === true, savedB);

  const pageA = await (await fetch(`${PAGES_URL}/u/${HANDLE}/step7-unedited`)).text();
  check('the detail page of A shows its approved code', pageA.includes(`<pre class="detail-source-code">${escapeHtml(CODE_A)}</pre>`));
  const pageB = await (await fetch(`${PAGES_URL}/u/${HANDLE}/step7-edited`)).text();
  check('the detail page of B shows the approved code, not the edit', pageB.includes(`<pre class="detail-source-code">${escapeHtml(CODE_B)}</pre>`));
  const jsonB = (await (await fetch(`${PAGES_URL}/u/${HANDLE}/step7-edited/source.json`)).json()) as { code?: string };
  check("B's source.json gives the approved code", jsonB.code === CODE_B, jsonB);

  const snapCode = await (await api('GET', `/snapshot/${SNAP}/code`)).text();
  check("the snapshot's code reads the same after it gained a manifest", snapCode === SNAP_CODE, snapCode);
} finally {
  for (const id of [WS_A, WS_B]) await api('DELETE', `/workspace/${id}`);
  d1(`DELETE FROM snapshots WHERE id = '${SNAP}'; DELETE FROM sessions WHERE user_id = '${USER_ID}'; DELETE FROM users WHERE id = '${USER_ID}';`);
  const rereviewAfter = kvGet('queue:rereview');
  check(
    'the re-review queue is as it was before the check',
    (rereviewAfter ?? '[]').trim() === (rereviewBefore ?? '[]').trim() ||
      JSON.stringify(JSON.parse(rereviewAfter ?? '[]')) === JSON.stringify(JSON.parse(rereviewBefore ?? '[]')),
    { before: rereviewBefore?.slice(0, 200), after: rereviewAfter?.slice(0, 200) },
  );
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

// Seed the local dev D1 + KV with mock users and workspaces so the
// publication/moderation features can be exercised end-to-end.
//
// All seed users have handles prefixed with `seed-` and emails on the
// `@seed.pathogen.studio` domain; the script deletes any pre-existing
// seed entries on each run before re-inserting, so it's safe to re-run.
//
// Aborts when PRODUCTION=1 in the API .dev.vars or when the wrangler
// command would target the remote production KV/D1.
//
// Usage:
//   npm run seed:dev                  # uses local D1 + preview KV
//   npm run seed:dev -- --reset-only  # delete seed rows without reinserting
//
// Run AFTER applying migrations 0001 and 0002 locally:
//   cd api && npx wrangler d1 migrations apply svg-path-extended-users --local
//

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_DIR = join(__dirname, '..', 'api');
// Shared local persistence path. Both `wrangler dev` invocations
// (Pages :3000, API :8787) write to and read from this same dir so
// admin actions show up on /explore and /featured without per-process
// state divergence. Path is relative to api/ because the wrangler calls
// below run with `cwd: API_DIR`.
const SHARED_PERSIST = '../.wrangler/state';

const ADMIN_EMAIL = 'admin@seed.pathogen.studio'; // must be in dev ADMIN_EMAILS
const SEED_HANDLE_PREFIX = 'seed-';
const SEED_EMAIL_DOMAIN = 'seed.pathogen.studio';

interface SeedUser {
  handle: string;
  displayName: string;
  email: string;
  verified: boolean;
  flagged: boolean;
  flagNotes?: string;
  workspaces: SeedWorkspace[];
}

interface SeedWorkspace {
  name: string;
  description: string;
  code: string;
  isPublic: boolean;
  // 'pending' — submit this workspace for first review; appears in
  //             /admin/moderation Pending tab.
  // 'rereview' — mark an approved workspace as having drifted code;
  //              appears in the Re-review tab. Only valid with isPublic=true.
  // Both queue entries carry frozen code (the same string as the seeded
  // workspace.code), so the admin can review them just like real
  // submissions.
  queue?: 'pending' | 'rereview';
}

// Sample programs use the same syntax conventions as
// playground/utils/examples.ts. All four should compile cleanly through
// the standard pipeline so the admin moderation UI can render them.

// Sample programs use the same syntax conventions as
// playground/utils/examples.ts. Expression statements (function calls,
// let, assignment) require trailing semicolons; block statements (for,
// fn, apply) do not. All four are CLI-verified to compile.

const SAMPLE_CODE_A = `// viewBox="0 0 200 200"
// A friendly circle
circle(100, 100, 60);
`;

const SAMPLE_CODE_B = `// viewBox="0 0 200 200"
// Hex-cluster of circles
let cx = 100;
let cy = 100;
for (i in 0..5) {
  let angle = calc(i / 6 * TAU());
  let px = calc(cx + cos(angle) * 45);
  let py = calc(cy + sin(angle) * 45);
  circle(px, py, 18);
}
circle(cx, cy, 15);
`;

const SAMPLE_CODE_C = `// viewBox="0 0 200 200"
// Star on a rounded frame
rect(20, 20, 160, 160);
star(100, 100, 5, 60, 28);
`;

const SAMPLE_CODE_D = `// viewBox="0 0 200 200"
// Diamond drawn from path commands
let cx = 100;
let cy = 100;
let size = 60;
M cx calc(cy - size)
L calc(cx + size) cy
L cx calc(cy + size)
L calc(cx - size) cy
Z
`;

const SEED_USERS: SeedUser[] = [
  {
    handle: 'seed-admin',
    displayName: 'Seed Admin',
    email: ADMIN_EMAIL,
    verified: true,
    flagged: false,
    workspaces: [
      { name: 'Admin Sketch', description: 'Admin scratch space', code: SAMPLE_CODE_A, isPublic: false },
    ],
  },
  {
    handle: 'seed-alice',
    displayName: 'Alice Verified',
    email: `alice@${SEED_EMAIL_DOMAIN}`,
    verified: true,
    flagged: false,
    workspaces: [
      // Approved + queue:rereview — simulates an owner editing their
      // approved workspace; appears on the admin Re-review tab while
      // /explore still serves the prior snapshot.
      { name: 'Alice Circle', description: 'A friendly blue circle', code: SAMPLE_CODE_A, isPublic: true, queue: 'rereview' },
      { name: 'Alice Cluster', description: 'Six circles in a hexagonal arrangement', code: SAMPLE_CODE_B, isPublic: true },
      // Private workspace submitted for first review.
      { name: 'Alice Draft', description: 'Work in progress, ready for review', code: SAMPLE_CODE_C, isPublic: false, queue: 'pending' },
    ],
  },
  {
    handle: 'seed-bob',
    displayName: 'Bob Verified',
    email: `bob@${SEED_EMAIL_DOMAIN}`,
    verified: true,
    flagged: false,
    workspaces: [
      // Approved + queue:rereview.
      { name: 'Bob Star', description: 'A golden star on a cream background', code: SAMPLE_CODE_C, isPublic: true, queue: 'rereview' },
      // Private submitted for first review.
      { name: 'Bob Kite', description: 'Diamond shape with magenta fill', code: SAMPLE_CODE_D, isPublic: false, queue: 'pending' },
    ],
  },
  {
    handle: 'seed-carol',
    displayName: 'Carol Verified',
    email: `carol@${SEED_EMAIL_DOMAIN}`,
    verified: true,
    flagged: false,
    workspaces: [
      { name: 'Carol Cluster', description: 'Hex-cluster of bright circles', code: SAMPLE_CODE_B, isPublic: true },
    ],
  },
  {
    handle: 'seed-dan',
    displayName: 'Dan Verified',
    email: `dan@${SEED_EMAIL_DOMAIN}`,
    verified: true,
    flagged: false,
    workspaces: [
      { name: 'Dan Diamond', description: 'A magenta kite', code: SAMPLE_CODE_D, isPublic: true },
      // Private submitted for first review.
      { name: 'Dan Star', description: 'Golden star awaiting review', code: SAMPLE_CODE_C, isPublic: false, queue: 'pending' },
    ],
  },
  {
    handle: 'seed-eve',
    displayName: 'Eve Unverified',
    email: `eve@${SEED_EMAIL_DOMAIN}`,
    verified: false,
    flagged: false,
    workspaces: [
      { name: 'Eve Sketch', description: "Eve's private scratchpad", code: SAMPLE_CODE_A, isPublic: false },
    ],
  },
  {
    handle: 'seed-frank',
    displayName: 'Frank Unverified',
    email: `frank@${SEED_EMAIL_DOMAIN}`,
    verified: false,
    flagged: false,
    workspaces: [
      { name: 'Frank Cluster', description: 'Hex circles', code: SAMPLE_CODE_B, isPublic: false },
      { name: 'Frank Star', description: 'Star draft', code: SAMPLE_CODE_C, isPublic: false },
    ],
  },
  {
    handle: 'seed-grace',
    displayName: 'Grace Unverified',
    email: `grace@${SEED_EMAIL_DOMAIN}`,
    verified: false,
    flagged: false,
    workspaces: [
      { name: 'Grace Diamond', description: 'Kite study', code: SAMPLE_CODE_D, isPublic: false },
    ],
  },
  {
    handle: 'seed-hank',
    displayName: 'Hank Flagged',
    email: `hank@${SEED_EMAIL_DOMAIN}`,
    verified: true,
    flagged: true,
    flagNotes: 'Seed test user — flagged for moderation testing.',
    workspaces: [
      { name: 'Hank Test', description: 'Flagged-user workspace test', code: SAMPLE_CODE_A, isPublic: false },
    ],
  },
  {
    handle: 'seed-ivy',
    displayName: 'Ivy Flagged',
    email: `ivy@${SEED_EMAIL_DOMAIN}`,
    verified: true,
    flagged: true,
    flagNotes: 'Seed test user — flagged for moderation testing.',
    workspaces: [
      { name: 'Ivy Cluster', description: 'Flagged user with public-ish workspace', code: SAMPLE_CODE_B, isPublic: false },
    ],
  },
];

function userId(handle: string): string {
  // Deterministic 32-hex from the handle so re-runs keep the same id (and
  // re-runs don't accumulate orphan KV entries from stale ids).
  let h = 0x811c9dc5;
  for (let i = 0; i < handle.length; i++) {
    h ^= handle.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  const seed = h.toString(16).padStart(8, '0');
  return (seed + seed + seed + seed).slice(0, 32);
}

function workspaceId(handle: string, slug: string): string {
  let h = 0x811c9dc5;
  const input = `${handle}:${slug}`;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  const seed = h.toString(16).padStart(8, '0');
  return (seed + seed + seed).slice(0, 21);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

async function hashContent(code: string): Promise<string> {
  const data = new TextEncoder().encode(code);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function d1Exec(sql: string, dryRun: boolean): void {
  if (dryRun) {
    console.log(`  [dry-run] d1: ${sql.slice(0, 80)}${sql.length > 80 ? '…' : ''}`);
    return;
  }
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'svg-path-extended-users',
      '--local',
      `--persist-to=${SHARED_PERSIST}`,
      '--command',
      sql,
    ],
    { cwd: API_DIR, stdio: ['pipe', 'inherit', 'inherit'] },
  );
}

function kvPut(key: string, value: string, dryRun: boolean): void {
  if (dryRun) {
    console.log(`  [dry-run] kv put ${key} (${value.length} bytes)`);
    return;
  }
  execFileSync(
    'npx',
    [
      'wrangler',
      'kv',
      'key',
      'put',
      '--binding=WORKSPACES',
      '--preview',
      'true',
      '--local',
      `--persist-to=${SHARED_PERSIST}`,
      key,
      value,
    ],
    { cwd: API_DIR, stdio: ['pipe', 'inherit', 'inherit'] },
  );
}

function kvDelete(key: string, dryRun: boolean): void {
  if (dryRun) {
    console.log(`  [dry-run] kv delete ${key}`);
    return;
  }
  try {
    execFileSync(
      'npx',
      [
        'wrangler',
        'kv',
        'key',
        'delete',
        '--binding=WORKSPACES',
        '--preview',
        'true',
        '--local',
        `--persist-to=${SHARED_PERSIST}`,
        key,
      ],
      { cwd: API_DIR, stdio: ['pipe', 'pipe', 'pipe'] },
    );
  } catch {
    // Missing key is fine.
  }
}

function deleteSeedRows(dryRun: boolean): void {
  console.log('\nDeleting existing seed rows...');
  d1Exec(
    `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE handle LIKE '${SEED_HANDLE_PREFIX}%');`,
    dryRun,
  );
  d1Exec(
    `DELETE FROM workspace_publication_states WHERE transitioned_by_user_id IN (SELECT id FROM users WHERE handle LIKE '${SEED_HANDLE_PREFIX}%');`,
    dryRun,
  );
  d1Exec(`DELETE FROM users WHERE handle LIKE '${SEED_HANDLE_PREFIX}%';`, dryRun);
  // Clear the moderation queues so re-running the seed produces a
  // deterministic starting state.
  kvDelete('queue:review', dryRun);
  kvDelete('queue:rereview', dryRun);
}

async function insertUser(u: SeedUser, dryRun: boolean): Promise<void> {
  const id = userId(u.handle);
  const now = Date.now();
  const verifiedAt = u.verified ? now : 'NULL';
  const flagged = u.flagged ? 1 : 0;
  const flagNotes = u.flagNotes ? `'${u.flagNotes.replace(/'/g, "''")}'` : 'NULL';
  const emailLower = u.email.toLowerCase();
  d1Exec(
    `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at, flagged, flag_notes) VALUES ('${id}', '${u.email}', '${emailLower}', '${u.handle}', '${u.displayName.replace(/'/g, "''")}', ${now}, ${verifiedAt}, ${flagged}, ${flagNotes});`,
    dryRun,
  );
  console.log(
    `  user ${u.handle.padEnd(14)} verified=${u.verified} flagged=${u.flagged} workspaces=${u.workspaces.length}`,
  );
}

interface PublicIndexEntry {
  id: string;
  slug: string;
  name: string;
  description: string;
  userId: string;
  updatedAt: string;
  thumbnailAt: string | null;
  approvedAt?: string;
}

interface ReviewQueueEntry {
  workspaceId: string;
  userId: string;
  code: string;
  codeHash: string;
  name: string;
  description: string;
  slug: string;
  submittedAt: string;
}

async function insertWorkspaces(
  u: SeedUser,
  dryRun: boolean,
  publicIndex: PublicIndexEntry[],
  reviewQueue: ReviewQueueEntry[],
  rereviewQueue: ReviewQueueEntry[],
): Promise<void> {
  const uid = userId(u.handle);
  const ids: string[] = [];
  const now = new Date().toISOString();
  for (const ws of u.workspaces) {
    const slug = slugify(ws.name);
    const wid = workspaceId(u.handle, slug);
    ids.push(wid);
    const contentHash = await hashContent(ws.code);
    const isPublic = !(u.flagged || !u.verified) && ws.isPublic;
    const record = {
      id: wid,
      slug,
      userId: uid,
      name: ws.name,
      description: ws.description,
      code: ws.code,
      isPublic,
      preferences: { width: 200, height: 200 },
      createdAt: now,
      updatedAt: now,
      contentHash,
      thumbnailAt: null,
      manualThumbnailAt: null,
      autoThumbnailAt: null,
    };
    kvPut(`workspace:${wid}`, JSON.stringify(record), dryRun);
    if (isPublic) {
      // Seed an approval record + an 'approved' state row so the workspace
      // is consistent with the Phase 2 moderation flow. Without these, a
      // fresh dev DB reports publicationState='unpublished' for entries
      // that the public index shows as visible.
      const approval = {
        workspaceId: wid,
        userId: uid,
        code: ws.code,
        codeHash: contentHash,
        slug,
        name: ws.name,
        description: ws.description,
        manualThumbnailAt: null,
        autoThumbnailAt: null,
        approvedAt: now,
        approvedByUserId: uid, // owner-attributed (seed has no admin actor yet)
        featuredAt: null,
        ownerHandle: u.handle,
      };
      kvPut(`approval:${wid}`, JSON.stringify(approval), dryRun);
      d1Exec(
        `INSERT INTO workspace_publication_states (workspace_id, state, transitioned_at, transitioned_by_user_id, code_hash, internal_notes) VALUES ('${wid}', 'approved', ${Date.now()}, '${uid}', '${contentHash}', 'seeded as approved');`,
        dryRun,
      );
      publicIndex.push({
        id: wid,
        slug,
        name: ws.name,
        description: ws.description,
        userId: uid,
        updatedAt: now,
        thumbnailAt: null,
        approvedAt: now,
        ownerHandle: u.handle,
      });
    }

    // Queue placement for moderation testing. Pending and re-review
    // entries carry the same frozen-code snapshot the admin UI would
    // approve; both can be cleared by approving/rejecting via the UI.
    if (ws.queue === 'pending' && u.verified && !u.flagged) {
      reviewQueue.push({
        workspaceId: wid,
        userId: uid,
        code: ws.code,
        codeHash: contentHash,
        name: ws.name,
        description: ws.description,
        slug,
        submittedAt: now,
      });
      // Append a 'pending' state row so the workspace's effective state
      // reflects the submission.
      d1Exec(
        `INSERT INTO workspace_publication_states (workspace_id, state, transitioned_at, transitioned_by_user_id, code_hash, internal_notes) VALUES ('${wid}', 'pending', ${Date.now()}, '${uid}', '${contentHash}', 'seeded pending submission');`,
        dryRun,
      );
    } else if (ws.queue === 'rereview' && isPublic) {
      // For re-review, simulate drift: the queue entry carries a slightly
      // mutated code variant (whitespace) so its hash differs from the
      // approval's. Visitors still see the approved snapshot; the admin
      // sees the (slightly different) drifted code.
      const driftedCode = ws.code + '\n// edited after approval — needs re-review\n';
      const driftedHash = await hashContent(driftedCode);
      rereviewQueue.push({
        workspaceId: wid,
        userId: uid,
        code: driftedCode,
        codeHash: driftedHash,
        name: ws.name,
        description: ws.description,
        slug,
        submittedAt: now,
      });
      // No state row appended per Phase 3 design — re-review uses queue
      // membership as the sole signal so effective state stays 'approved'.
    }
  }
  kvPut(`user:${uid}:workspaces`, JSON.stringify(ids), dryRun);
}

const program = new Command();
program
  .name('seed-dev-users')
  .description('Seed local dev D1 + KV with mock users and workspaces for moderation testing.')
  .option('--reset-only', 'Delete seed users without reinserting', false)
  .option('--dry-run', 'Print SQL/KV operations without executing', false)
  .action(async (opts: { resetOnly?: boolean; dryRun?: boolean }) => {
    const dryRun = Boolean(opts.dryRun);

    if (process.env.PRODUCTION) {
      throw new Error('Refusing to seed: PRODUCTION env var is set.');
    }

    console.log(dryRun ? '=== DRY RUN ===' : '=== Seeding local dev ===');
    console.log(`API dir: ${API_DIR}`);

    deleteSeedRows(dryRun);

    if (opts.resetOnly) {
      console.log('\n--reset-only: stopping after delete.');
      return;
    }

    console.log('\nInserting users + workspaces...');
    const publicIndex: PublicIndexEntry[] = [];
    const reviewQueue: ReviewQueueEntry[] = [];
    const rereviewQueue: ReviewQueueEntry[] = [];
    for (const u of SEED_USERS) {
      await insertUser(u, dryRun);
      await insertWorkspaces(u, dryRun, publicIndex, reviewQueue, rereviewQueue);
    }

    // Replace the public index with seed entries. (In dev this assumes a
    // fresh KV; if mixing with real workspaces, the index gets clobbered —
    // acceptable for a seed-only dev environment.)
    publicIndex.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
    kvPut('public:workspaces', JSON.stringify(publicIndex.slice(0, 100)), dryRun);

    // Write the moderation queues so the admin UI has demo content.
    // Order: newest-first by submittedAt so the queue listing shows the
    // most recent submission at the top of each tab.
    reviewQueue.sort((a, b) => (b.submittedAt > a.submittedAt ? 1 : -1));
    rereviewQueue.sort((a, b) => (b.submittedAt > a.submittedAt ? 1 : -1));
    kvPut('queue:review', JSON.stringify(reviewQueue), dryRun);
    kvPut('queue:rereview', JSON.stringify(rereviewQueue), dryRun);

    console.log(`\nDone. ${SEED_USERS.length} users seeded, ${publicIndex.length} public entries.`);
    console.log(`Pending review queue: ${reviewQueue.length}`);
    console.log(`Re-review queue: ${rereviewQueue.length}`);
    console.log('\nNext steps:');
    console.log('  - npm run dev:stack');
    console.log(`  - Visit /u/seed-alice for a verified user's profile`);
    console.log(`  - Sign in as ${ADMIN_EMAIL} (OTP code in API console) to act as admin`);
  });
program.parse();

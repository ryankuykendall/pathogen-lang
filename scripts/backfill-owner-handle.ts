// One-time backfill: populate `ownerHandle` on pre-Phase-4 approval
// records and `public:workspaces` index entries. Idempotent; safe to
// re-run. After Phase 4 lands, every new approval is born with
// `ownerHandle` baked in, so this script is only needed for legacy
// records (mostly local dev — production has no pre-Phase-4 approvals).
//
// Usage (defaults to dry-run + local state):
//   tsx scripts/backfill-owner-handle.ts            # dry-run, local
//   tsx scripts/backfill-owner-handle.ts --apply    # commit, local
//   PRODUCTION_CONFIRM=1 tsx scripts/backfill-owner-handle.ts --remote --apply
//
// Run from the repo root via `npm run backfill:owner-handle`. The
// underlying wrangler invocations happen in api/ so binding ids match.

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_DIR = join(__dirname, '..', 'api');

interface WorkspaceApproval {
  workspaceId: string;
  userId: string;
  slug: string;
  name: string;
  description: string;
  ownerHandle?: string;
  [key: string]: unknown;
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
  ownerHandle?: string;
}

function wrangler(args: string[]): string {
  return execFileSync('npx', ['wrangler', ...args], {
    cwd: API_DIR,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'inherit'],
  });
}

// Shared local persistence path; matches dev:stack and seed-dev-users.
const SHARED_PERSIST = '../.wrangler/state';

function kvFlags(remote: boolean): string[] {
  if (remote) return ['--binding=WORKSPACES', '--remote', '--preview', 'false'];
  return ['--binding=WORKSPACES', '--preview', 'true', '--local', `--persist-to=${SHARED_PERSIST}`];
}

function d1Flags(remote: boolean): string[] {
  const base = ['d1', 'execute', 'svg-path-extended-users'];
  return remote ? [...base, '--remote'] : [...base, '--local', `--persist-to=${SHARED_PERSIST}`];
}

function listKvKeys(flags: string[], prefix: string): string[] {
  const raw = wrangler(['kv', 'key', 'list', ...flags, '--prefix', prefix]);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((k: { name: string }) => k.name) : [];
  } catch {
    return [];
  }
}

function kvGet(flags: string[], key: string): string | null {
  try {
    const raw = wrangler(['kv', 'key', 'get', ...flags, key]);
    const trimmed = raw.trim();
    if (trimmed === 'Value not found' || !trimmed) return null;
    return raw;
  } catch {
    return null;
  }
}

function kvPut(flags: string[], key: string, value: string, dryRun: boolean): void {
  if (dryRun) {
    console.log(`  [dry-run] kv put ${key} (${value.length} bytes)`);
    return;
  }
  execFileSync('npx', ['wrangler', 'kv', 'key', 'put', ...flags, key, value], {
    cwd: API_DIR,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

function d1Query(flags: string[], sql: string): Record<string, unknown>[] {
  const raw = execFileSync('npx', ['wrangler', ...flags, '--command', sql, '--json'], {
    cwd: API_DIR,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  try {
    const parsed = JSON.parse(raw);
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    return Array.isArray(first?.results) ? (first.results as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

function lookupHandle(dFlags: string[], userId: string): string | null {
  const escaped = userId.replace(/'/g, "''");
  const rows = d1Query(dFlags, `SELECT handle FROM users WHERE id = '${escaped}' LIMIT 1;`);
  if (!rows.length) return null;
  const handle = rows[0].handle;
  return typeof handle === 'string' ? handle : null;
}

const program = new Command();
program
  .name('backfill-owner-handle')
  .description('Populate ownerHandle on legacy approval records + public:workspaces entries.')
  .option('--apply', 'actually write changes (default: dry-run)')
  .option('--remote', 'target production KV/D1 (default: local dev)')
  .action(async (opts: { apply?: boolean; remote?: boolean }) => {
    const dryRun = !opts.apply;
    const remote = Boolean(opts.remote);
    if (remote && process.env.PRODUCTION_CONFIRM !== '1') {
      console.warn(
        'Refusing to target --remote without PRODUCTION_CONFIRM=1. Set that env var to proceed.',
      );
      return;
    }
    const kFlags = kvFlags(remote);
    const dFlags = d1Flags(remote);
    console.log(
      `Backfilling ownerHandle — mode: ${remote ? 'remote' : 'local'}${dryRun ? ', dry-run' : ''}`,
    );

    // 1. Walk approval records; for any missing ownerHandle, look up the
    //    user's handle and write the augmented record back.
    const approvalKeys = listKvKeys(kFlags, 'approval:');
    console.log(`Scanning ${approvalKeys.length} approval records...`);
    const handleByUserId = new Map<string, string | null>();
    let approvalsBackfilled = 0;

    const allApprovals: WorkspaceApproval[] = [];
    for (const key of approvalKeys) {
      const raw = kvGet(kFlags, key);
      if (!raw) continue;
      let approval: WorkspaceApproval;
      try {
        approval = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!approval.ownerHandle) {
        if (!handleByUserId.has(approval.userId)) {
          handleByUserId.set(approval.userId, lookupHandle(dFlags, approval.userId));
        }
        const handle = handleByUserId.get(approval.userId) ?? null;
        if (handle) {
          approval.ownerHandle = handle;
          kvPut(kFlags, key, JSON.stringify(approval), dryRun);
          approvalsBackfilled++;
        } else {
          console.warn(`  approval:${approval.workspaceId} — no user row for userId=${approval.userId}; skipping`);
        }
      }
      allApprovals.push(approval);
    }

    // 2. Walk public:workspaces; add ownerHandle from each approval's
    //    record.
    const publicRaw = kvGet(kFlags, 'public:workspaces');
    let publicEntries: PublicIndexEntry[] = [];
    if (publicRaw) {
      try {
        publicEntries = JSON.parse(publicRaw) as PublicIndexEntry[];
      } catch {
        publicEntries = [];
      }
    }
    let publicBackfilled = 0;
    const approvalById = new Map(allApprovals.map((a) => [a.workspaceId, a]));
    for (const entry of publicEntries) {
      if (!entry.ownerHandle) {
        const apr = approvalById.get(entry.id);
        if (apr?.ownerHandle) {
          entry.ownerHandle = apr.ownerHandle;
          publicBackfilled++;
        }
      }
    }
    if (publicBackfilled > 0) {
      kvPut(kFlags, 'public:workspaces', JSON.stringify(publicEntries), dryRun);
    }

    console.log(`\nBackfill summary:`);
    console.log(`  approval records updated: ${approvalsBackfilled}`);
    console.log(`  public index entries updated: ${publicBackfilled}`);
    console.log(`  users skipped (no row): ${Array.from(handleByUserId.values()).filter((h) => h === null).length}`);
    if (dryRun) console.log(`\n(Dry run. Re-run with --apply to commit.)`);
  });
program.parse();

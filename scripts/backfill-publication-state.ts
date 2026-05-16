// One-time backfill: synthesize Phase 2 moderation records from pre-Phase-2
// workspaces. For every workspace with `isPublic: true` that has no
// existing `approval:{id}` KV record, write a snapshot approval record and
// append an 'approved' state row attributed to the owner. Then rebuild
// `public:workspaces` from the approval records.
//
// Idempotent: re-running is safe. Existing approval records are not
// overwritten, and existing state rows are not duplicated when the latest
// state for a workspace is already 'approved'.
//
// Usage (defaults to dry-run + local state):
//   tsx scripts/backfill-publication-state.ts            # dry-run, local
//   tsx scripts/backfill-publication-state.ts --apply    # actually write
//   tsx scripts/backfill-publication-state.ts --remote   # target prod
//
// Run from the api/ directory's wrangler so the binding ids match. Local
// runs require migration 0002 to be applied first.

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_DIR = join(__dirname, '..', 'api');

interface Workspace {
  id: string;
  slug: string;
  userId: string;
  name: string;
  description: string;
  code: string;
  isPublic: boolean;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
  thumbnailAt: string | null;
  manualThumbnailAt: string | null;
  autoThumbnailAt: string | null;
}

interface WorkspaceApproval {
  workspaceId: string;
  userId: string;
  code: string;
  codeHash: string;
  slug: string;
  name: string;
  description: string;
  manualThumbnailAt: string | null;
  autoThumbnailAt: string | null;
  approvedAt: string;
  approvedByUserId: string;
  featuredAt: string | null;
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

const PUBLIC_INDEX_CAP = 100;

function wrangler(args: string[]): string {
  return execFileSync('npx', ['wrangler', ...args], {
    cwd: API_DIR,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'inherit'],
  });
}

// Shared local persistence path so this script writes to the same KV/D1
// state directory the running `wrangler dev` processes use. Relative to
// api/ since wrangler runs there.
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

function d1Exec(flags: string[], sql: string, dryRun: boolean): void {
  if (dryRun) {
    console.log(`  [dry-run] d1: ${sql.slice(0, 100)}${sql.length > 100 ? '…' : ''}`);
    return;
  }
  execFileSync('npx', ['wrangler', ...flags, '--command', sql], {
    cwd: API_DIR,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

function d1Query(flags: string[], sql: string): unknown[] {
  const raw = execFileSync('npx', ['wrangler', ...flags, '--command', sql, '--json'], {
    cwd: API_DIR,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  try {
    const parsed = JSON.parse(raw);
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    return Array.isArray(first?.results) ? (first.results as unknown[]) : [];
  } catch {
    return [];
  }
}

const program = new Command();
program
  .name('backfill-publication-state')
  .description('Synthesize approval + state rows for pre-Phase-2 public workspaces.')
  .option('--apply', 'actually write changes (default: dry-run)')
  .option('--remote', 'target the production KV/D1 (default: local dev)')
  .action(async (opts: { apply?: boolean; remote?: boolean }) => {
    const dryRun = !opts.apply;
    const remote = Boolean(opts.remote);
    if (remote && process.env.PRODUCTION_CONFIRM !== '1') {
      console.warn(
        'Refusing to target --remote without PRODUCTION_CONFIRM=1 in env. ' +
          'Re-run with PRODUCTION_CONFIRM=1 npm run backfill:publication-state -- --remote --apply',
      );
      return;
    }
    const kFlags = kvFlags(remote);
    const dFlags = d1Flags(remote);
    console.log(`Backfilling publication state — mode: ${remote ? 'remote' : 'local'}${dryRun ? ', dry-run' : ''}`);

    // 1. List workspaces.
    const workspaceKeys = listKvKeys(kFlags, 'workspace:');
    console.log(`Scanning ${workspaceKeys.length} workspace records...`);

    // 2. For each existing approval, mark seen.
    const approvalKeys = new Set(listKvKeys(kFlags, 'approval:'));
    console.log(`${approvalKeys.size} approval records already present.`);

    // 3. Read the latest state row per workspace from D1 so we don't
    // re-append an 'approved' row for workspaces that are already there.
    const latestStateRows = d1Query(
      dFlags,
      `SELECT workspace_id, state
       FROM workspace_publication_states s1
       WHERE transitioned_at = (
         SELECT MAX(transitioned_at) FROM workspace_publication_states s2
         WHERE s2.workspace_id = s1.workspace_id
       )`,
    ) as { workspace_id: string; state: string }[];
    const stateByWorkspace = new Map(
      latestStateRows.map((r) => [r.workspace_id, r.state]),
    );

    let synthesized = 0;
    let skipped = 0;
    const publicEntries: PublicIndexEntry[] = [];
    const now = new Date().toISOString();

    // Slug uniqueness: pre-populate from existing approvals, then track
    // (userId, slug) we write this run so subsequent collisions in the
    // same pass also disambiguate.
    const claimedSlugs = new Set<string>();
    const userSlugKey = (userId: string, slug: string): string => `${userId}::${slug}`;
    for (const apprKey of approvalKeys) {
      const apprRaw = kvGet(kFlags, apprKey);
      if (!apprRaw) continue;
      try {
        const apr = JSON.parse(apprRaw) as WorkspaceApproval;
        claimedSlugs.add(userSlugKey(apr.userId, apr.slug));
      } catch {
        /* skip */
      }
    }

    for (const key of workspaceKeys) {
      const workspaceId = key.slice('workspace:'.length);
      const raw = kvGet(kFlags, key);
      if (!raw) continue;
      let workspace: Workspace;
      try {
        workspace = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!workspace.isPublic) continue;

      const hasApproval = approvalKeys.has(`approval:${workspaceId}`);
      const latestState = stateByWorkspace.get(workspaceId);
      const stateAlreadyApproved = latestState === 'approved';

      if (hasApproval && stateAlreadyApproved) {
        skipped++;
        // Still re-emit the public index entry so the rebuilt index has
        // it. Pull approvedAt from the approval record if present.
        const apprRaw = kvGet(kFlags, `approval:${workspaceId}`);
        if (apprRaw) {
          try {
            const apr = JSON.parse(apprRaw) as WorkspaceApproval;
            publicEntries.push({
              id: workspaceId,
              slug: apr.slug,
              name: apr.name,
              description: apr.description,
              userId: apr.userId,
              updatedAt: workspace.updatedAt,
              thumbnailAt: workspace.thumbnailAt,
              approvedAt: apr.approvedAt,
            });
          } catch {
            /* skip */
          }
        }
        continue;
      }

      // Synthesize an approval record. Use the workspace's `updatedAt` as
      // a stable approvedAt so ordering is deterministic on re-run.
      // Per-user slug uniqueness: append a workspaceId prefix when the
      // same user already has the slug. Track this run's writes too so we
      // disambiguate against in-progress work, not just KV state.
      const baseSlug = workspace.slug || 'workspace';
      let uniqueSlug = baseSlug;
      if (claimedSlugs.has(userSlugKey(workspace.userId, baseSlug))) {
        uniqueSlug = `${baseSlug}-${workspaceId.slice(0, 8)}`;
      }
      claimedSlugs.add(userSlugKey(workspace.userId, uniqueSlug));

      const approval: WorkspaceApproval = {
        workspaceId,
        userId: workspace.userId,
        code: workspace.code,
        codeHash: workspace.contentHash,
        slug: uniqueSlug,
        name: workspace.name,
        description: workspace.description || '',
        manualThumbnailAt: workspace.manualThumbnailAt,
        autoThumbnailAt: workspace.autoThumbnailAt,
        approvedAt: workspace.updatedAt || now,
        approvedByUserId: workspace.userId, // owner-attributed (pre-moderation)
        featuredAt: null,
      };
      if (!hasApproval) {
        kvPut(kFlags, `approval:${workspaceId}`, JSON.stringify(approval), dryRun);
      }

      if (!stateAlreadyApproved) {
        const sql = `INSERT INTO workspace_publication_states (workspace_id, state, transitioned_at, transitioned_by_user_id, code_hash, internal_notes) VALUES ('${workspaceId}', 'approved', ${Date.now()}, '${workspace.userId}', '${workspace.contentHash}', 'backfilled from isPublic:true');`;
        d1Exec(dFlags, sql, dryRun);
      }

      publicEntries.push({
        id: workspaceId,
        slug: approval.slug,
        name: approval.name,
        description: approval.description,
        userId: approval.userId,
        updatedAt: workspace.updatedAt,
        thumbnailAt: workspace.thumbnailAt,
        approvedAt: approval.approvedAt,
      });
      synthesized++;
    }

    // 4. Rebuild public:workspaces from the collected entries, sorted by
    // approvedAt descending, capped at PUBLIC_INDEX_CAP.
    publicEntries.sort((a, b) => {
      const aT = a.approvedAt ? new Date(a.approvedAt).getTime() : 0;
      const bT = b.approvedAt ? new Date(b.approvedAt).getTime() : 0;
      return bT - aT;
    });
    const capped = publicEntries.slice(0, PUBLIC_INDEX_CAP);
    kvPut(kFlags, 'public:workspaces', JSON.stringify(capped), dryRun);

    console.log(`\nBackfill summary:`);
    console.log(`  synthesized: ${synthesized}`);
    console.log(`  skipped (already approved): ${skipped}`);
    console.log(`  public index entries: ${capped.length}`);
    if (dryRun) console.log(`\n(Dry run. Re-run with --apply to commit.)`);
  });
program.parse();

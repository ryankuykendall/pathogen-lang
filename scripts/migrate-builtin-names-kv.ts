/**
 * KV migration for phase 0a step 5 (built-in names are a compile error):
 * rename every declaration of a built-in name in stored Pathogen source, so
 * saved workspaces keep compiling after the change ships.
 *
 * Source text lives in four key families of the WORKSPACES namespace:
 *   - workspace:{id}   Workspace.code (+ contentHash, rev)
 *   - approval:{id}    WorkspaceApproval.code (+ codeHash), frozen at approval
 *   - queue:review     ReviewQueueEntry[] (code + codeHash)
 *   - queue:rereview   ReviewQueueEntry[] (code + codeHash)
 * Workspace snapshots also keep code, in R2 (`THUMBNAILS` bucket,
 * snapshots/{workspaceId}/{snapshotId}/code.pathogen, rows in D1). They are a
 * record of what was drawn and are NOT rewritten: one restored as a new
 * workspace that declares a built-in shows the error, and F2 or the quick fix
 * renames it. Count them separately (a production read) to report them.
 *
 * The rename is scripts/lib/builtin-name-codemod.ts — the editors' quick fix,
 * accepted only when the renamed source parses under the new rules and
 * compiles to the same SVG, logged values and warnings as the original under
 * the evaluator BEFORE the change (--baseline, default cb0e299, the step 4
 * commit). Anything else is listed under `review` and left alone.
 *
 * Hashes: `contentHash` / `codeHash` are recomputed with website/api/utils.ts
 * hashContent's rule (SHA-256, first 8 bytes, hex). The rename is
 * deterministic, so `approval.codeHash === workspace.contentHash` holds after
 * the migration exactly when it held before. `rev` is bumped so a tab still
 * running the old bundle gets a 409 on its next autosave instead of
 * clobbering the migrated text. Each record is re-read just before its write
 * and skipped if it changed in between.
 *
 * Order (decision 22): dry run → the user's go-ahead → write with backups →
 * re-run the dry run right before the push (saves made in between can bring
 * a name back) → push.
 *
 * Usage:
 *   npx tsx scripts/migrate-builtin-names-kv.ts --env dev
 *   npx tsx scripts/migrate-builtin-names-kv.ts --env dev --write --backup-dir tmp/kv-backups/step5-dev
 *   npx tsx scripts/migrate-builtin-names-kv.ts --env prod --confirm --report tmp/step5/kv-prod-dry-run.json
 *   npx tsx scripts/migrate-builtin-names-kv.ts --env prod --confirm --write --backup-dir tmp/kv-backups/step5-prod
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

import { migrateSource } from './lib/builtin-name-codemod';
import { loadBaseline } from './lib/semantics-audit/baseline';

import type { CodemodOutcome, Rename } from './lib/builtin-name-codemod';
import type { PathogenModule } from './lib/semantics-audit/baseline';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = join(ROOT, 'api');

// ─── KV plumbing (same shape as migrate-style-opener-kv.ts) ─────────────

function wrangler(args: string[]): string {
  return execFileSync('npx', ['wrangler', ...args], { cwd: API_DIR, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
}

function buildKvFlags(env: 'dev' | 'prod'): string[] {
  if (env === 'dev') {
    // dev:stack persists to <root>/.wrangler/state; wrangler runs with cwd=api/.
    return ['--binding=WORKSPACES', '--preview', 'true', '--persist-to=../.wrangler/state'];
  }
  return ['--binding=WORKSPACES', '--remote', '--preview', 'false'];
}

function kvList(flags: string[], prefix: string): string[] {
  return (JSON.parse(wrangler(['kv', 'key', 'list', ...flags, `--prefix=${prefix}`])) as { name: string }[]).map(
    (k) => k.name,
  );
}

/**
 * A key's value, or null when the key doesn't exist. Any other failure (auth,
 * network) throws: treating it as "absent" would report a queue as unchanged
 * and blind the concurrent-write check.
 */
function kvGet(flags: string[], key: string): string | null {
  let raw: string;
  try {
    raw = wrangler(['kv', 'key', 'get', ...flags, key]);
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    if (`${e.stdout ?? ''}${e.stderr ?? ''}`.includes('Value not found')) return null;
    throw new Error(`reading ${key} failed: ${(e.stderr || e.message || String(err)).trim().split('\n')[0]}`);
  }
  return raw.trim() === 'Value not found' ? null : raw;
}

/** Write through a file (`--path`): a large record would overflow the command line. */
function kvPut(flags: string[], key: string, value: string): void {
  const file = join(ROOT, 'tmp', 'kv-put', `${key.replace(/[^A-Za-z0-9_.-]/g, '_')}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, value);
  try {
    execFileSync('npx', ['wrangler', 'kv', 'key', 'put', ...flags, key, `--path=${file}`], {
      cwd: API_DIR,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  } finally {
    rmSync(file, { force: true });
  }
}

/** Mirrors website/api/utils.ts hashContent: SHA-256, first 8 bytes, hex. */
function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
}

// ─── Records ────────────────────────────────────────────────────────────

interface Workspace {
  code: string;
  contentHash: string;
  rev?: number;
  updatedAt: string;
  [key: string]: unknown;
}

interface Approval {
  code: string;
  codeHash: string;
  [key: string]: unknown;
}

interface QueueEntry {
  workspaceId: string;
  code: string;
  codeHash: string;
  [key: string]: unknown;
}

type Outcome = 'migrated' | 'unchanged' | 'review' | 'skipped-concurrent-write' | 'error';

interface Ctx {
  flags: string[];
  oldLib: PathogenModule;
  write: boolean;
  backupDir: string | null;
  report: Record<string, { outcome: Outcome; renames?: Rename[]; detail?: string }>;
}

function backup(ctx: Ctx, key: string, raw: string): void {
  if (!ctx.backupDir) return;
  mkdirSync(ctx.backupDir, { recursive: true });
  writeFileSync(join(ctx.backupDir, `${key.replace(/[^A-Za-z0-9_.-]/g, '_')}.json`), raw);
}

function record(ctx: Ctx, key: string, outcome: Outcome, extra: { renames?: Rename[]; detail?: string } = {}): Outcome {
  ctx.report[key] = { outcome, ...extra };
  if (outcome === 'unchanged') return outcome;
  const renames = extra.renames?.map((r) => `${r.from}→${r.to}`).join(', ');
  console.log(`  ${outcome.padEnd(26)} ${key}${renames ? `  ${renames}` : ''}${extra.detail ? `  ${extra.detail}` : ''}`);
  return outcome;
}

function fromOutcome(ctx: Ctx, key: string, out: CodemodOutcome): Outcome | null {
  if (out.kind === 'none') return record(ctx, key, 'unchanged');
  if (out.kind === 'review') return record(ctx, key, 'review', { renames: out.renames, detail: out.reason });
  return null;
}

function note(out: CodemodOutcome): string {
  return out.kind === 'renamed' && out.note ? `  [${out.note}]` : '';
}

async function migrateWorkspace(ctx: Ctx, key: string): Promise<Outcome> {
  const raw = kvGet(ctx.flags, key);
  if (!raw) return record(ctx, key, 'error', { detail: 'KV value missing' });
  let ws: Workspace;
  try {
    ws = JSON.parse(raw);
  } catch (e) {
    return record(ctx, key, 'error', { detail: `JSON parse failed: ${(e as Error).message}` });
  }
  const out = await migrateSource(ws.code ?? '', ctx.oldLib, key);
  const done = fromOutcome(ctx, key, out);
  if (done || out.kind !== 'renamed') return done ?? 'error';
  if (!ctx.write) return record(ctx, key, 'migrated', { renames: out.renames, detail: `(dry run)${note(out)}` });
  const recheck = kvGet(ctx.flags, key);
  if (recheck !== raw) return record(ctx, key, 'skipped-concurrent-write');
  backup(ctx, key, raw);
  ws.code = out.text;
  ws.contentHash = hashContent(out.text);
  ws.rev = (ws.rev ?? 0) + 1;
  kvPut(ctx.flags, key, JSON.stringify(ws));
  return record(ctx, key, 'migrated', { renames: out.renames, detail: note(out).trim() || undefined });
}

async function migrateApproval(ctx: Ctx, key: string): Promise<Outcome> {
  const raw = kvGet(ctx.flags, key);
  // Listed keys exist; only `--only <id>` asks for one that may not (a workspace never approved).
  if (!raw) return record(ctx, key, 'unchanged');
  let approval: Approval;
  try {
    approval = JSON.parse(raw);
  } catch (e) {
    return record(ctx, key, 'error', { detail: `JSON parse failed: ${(e as Error).message}` });
  }
  const out = await migrateSource(approval.code ?? '', ctx.oldLib, key);
  const done = fromOutcome(ctx, key, out);
  if (done || out.kind !== 'renamed') return done ?? 'error';
  if (!ctx.write) return record(ctx, key, 'migrated', { renames: out.renames, detail: `(dry run)${note(out)}` });
  if (kvGet(ctx.flags, key) !== raw) return record(ctx, key, 'skipped-concurrent-write');
  backup(ctx, key, raw);
  approval.code = out.text;
  approval.codeHash = hashContent(out.text);
  kvPut(ctx.flags, key, JSON.stringify(approval));
  return record(ctx, key, 'migrated', { renames: out.renames, detail: note(out).trim() || undefined });
}

async function migrateQueue(ctx: Ctx, key: string): Promise<Outcome> {
  const raw = kvGet(ctx.flags, key);
  if (!raw) return record(ctx, key, 'unchanged');
  let entries: QueueEntry[];
  try {
    entries = JSON.parse(raw);
  } catch (e) {
    return record(ctx, key, 'error', { detail: `JSON parse failed: ${(e as Error).message}` });
  }
  if (!Array.isArray(entries)) return record(ctx, key, 'error', { detail: 'not an array' });
  const renames: Rename[] = [];
  const review: string[] = [];
  let changed = 0;
  for (const entry of entries) {
    const out = await migrateSource(entry.code ?? '', ctx.oldLib, `${key}~${entry.workspaceId}`);
    if (out.kind === 'renamed') {
      entry.code = out.text;
      entry.codeHash = hashContent(out.text);
      renames.push(...out.renames);
      changed++;
    } else if (out.kind === 'review') {
      review.push(`${entry.workspaceId}: ${out.reason}`);
    }
  }
  // One entry needing review holds the whole array back: queues are written whole.
  if (review.length) return record(ctx, key, 'review', { renames, detail: review.join('; ') });
  if (changed === 0) return record(ctx, key, 'unchanged');
  if (!ctx.write) return record(ctx, key, 'migrated', { renames, detail: `(dry run, ${changed} entries)` });
  // Queues are live arrays (submissions land between our read and write).
  if (kvGet(ctx.flags, key) !== raw) return record(ctx, key, 'skipped-concurrent-write');
  backup(ctx, key, raw);
  kvPut(ctx.flags, key, JSON.stringify(entries));
  return record(ctx, key, 'migrated', { renames, detail: `${changed} entries` });
}

// ─── CLI ────────────────────────────────────────────────────────────────

const program = new Command();
program
  .name('migrate-builtin-names-kv')
  .description('Rename declarations of built-in names in every stored workspace, approval, and review-queue source')
  .requiredOption('--env <env>', 'dev or prod')
  .option('--confirm', 'required for --env prod')
  .option('--write', 'write the renames (default: a dry run that writes nothing)')
  .option('--backup-dir <dir>', 'write every pre-image here before overwriting it (required with --write)')
  .option('--baseline <ref>', 'the commit whose evaluator decides "same output" (before step 5)', 'cb0e299')
  .option('--only <workspaceId>', 'migrate one workspace (its workspace: and approval: records only)')
  .option('--report <file>', 'write a JSON report of every record (it names workspace ids: keep it in tmp/)')
  .action(
    async (opts: {
      env: string;
      confirm?: boolean;
      write?: boolean;
      backupDir?: string;
      baseline: string;
      only?: string;
      report?: string;
    }) => {
      const env = opts.env as 'dev' | 'prod';
      if (env !== 'dev' && env !== 'prod') {
        console.error(`--env must be 'dev' or 'prod' (got: ${opts.env})`);
        process.exit(1);
      }
      if (env === 'prod' && !opts.confirm) {
        console.error('Refusing to read prod without --confirm');
        process.exit(1);
      }
      const write = Boolean(opts.write);
      if (write && !opts.backupDir) {
        console.error('A write run needs --backup-dir (KV has no versioning; every pre-image is saved there first)');
        process.exit(1);
      }
      const ctx: Ctx = {
        flags: buildKvFlags(env),
        oldLib: await loadBaseline(opts.baseline),
        write,
        backupDir: opts.backupDir ? join(process.cwd(), opts.backupDir) : null,
        report: {},
      };

      console.log(`Target environment: ${env.toUpperCase()}${write ? '' : ' (DRY RUN)'}; same-output check against ${opts.baseline}`);
      let workspaceKeys: string[];
      let approvalKeys: string[];
      let queueKeys: string[];
      if (opts.only) {
        workspaceKeys = [`workspace:${opts.only}`];
        approvalKeys = [`approval:${opts.only}`];
        queueKeys = [];
      } else {
        console.log('Listing KV keys...');
        workspaceKeys = kvList(ctx.flags, 'workspace:').filter((k) => !k.startsWith('workspace:thumbmeta:'));
        approvalKeys = kvList(ctx.flags, 'approval:');
        queueKeys = ['queue:review', 'queue:rereview'];
      }
      console.log(`${workspaceKeys.length} workspace, ${approvalKeys.length} approval, ${queueKeys.length} queue record(s)\n`);

      const counts: Record<Outcome, number> = {
        migrated: 0,
        unchanged: 0,
        review: 0,
        'skipped-concurrent-write': 0,
        error: 0,
      };
      for (const key of workspaceKeys) counts[await migrateWorkspace(ctx, key)]++;
      for (const key of approvalKeys) counts[await migrateApproval(ctx, key)]++;
      for (const key of queueKeys) counts[await migrateQueue(ctx, key)]++;

      console.log('\nSummary:');
      for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(26)} ${v}`);
      if (opts.report) {
        mkdirSync(dirname(opts.report), { recursive: true });
        writeFileSync(opts.report, JSON.stringify({ env, write, baseline: opts.baseline, counts, records: ctx.report }, null, 2));
        console.log(`Report: ${opts.report}`);
      }
      if (counts.error > 0 || counts.review > 0 || counts['skipped-concurrent-write'] > 0) process.exitCode = 2;
    },
  );
program.parse();

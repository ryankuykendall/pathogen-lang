/**
 * KV + R2 migration for phase 2 storage (step 7; project-docs/modules/
 * 48-storage-design-v2.md §8, 50-storage-decisions-and-plan.md): every
 * record saved before phase 2 keeps its one program as `code`; this moves
 * that text to a blob at files/{workspaceId}/{sha256} in the THUMBNAILS
 * bucket and rewrites the record as a manifest (main.pathogen, no folders,
 * entryPoints ["main.pathogen"]) with its hash in today's rule.
 *
 *   - workspace:{id}   contentHash regenerated; rev NOT bumped (note 48)
 *   - approval:{id}    codeHash regenerated; the blob goes under the workspace
 *   - queue:review, queue:rereview   each entry likewise, the array in one write
 *   - snapshots        (rows in D1) code.pathogen → a blob + manifest.json;
 *                      code.pathogen is kept, and deleted with the snapshot
 *
 * The transformation is scripts/lib/workspace-files-migration.ts, which uses
 * the API's own reader and hash and checks every result against it (the
 * migrated record reads back as the same manifest and hash). Across records,
 * it checks the re-review answer: for each approval, whether a save of its
 * workspace would queue a re-review must be the same before and after.
 *
 * Writes go blob first, record second, and each record is re-read just
 * before its write and skipped if it changed. A record that already holds
 * files is left alone (saves since the push convert records themselves).
 * Approvals and queue entries whose workspace no longer exists are reported
 * and left alone: migrated, their detail page couldn't read its source.
 *
 * Order at shipping (note 50): the new API Worker AND the new Pages worker
 * are live first (an old Pages worker answers 500 for a migrated approval),
 * the dry run, the user's go-ahead, the write with backups, then the dry run
 * again (everything "already").
 *
 * Usage:
 *   npx tsx scripts/migrate-workspace-files-kv.ts --env dev
 *   npx tsx scripts/migrate-workspace-files-kv.ts --env dev --only <workspaceId> --write --backup-dir tmp/kv-backups/files-dev
 *   npx tsx scripts/migrate-workspace-files-kv.ts --env prod --confirm --report tmp/step7/prod-dry-run.json
 *   npx tsx scripts/migrate-workspace-files-kv.ts --env prod --confirm --write --backup-dir tmp/kv-backups/files-prod
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

import {
  migrateQueue,
  migrateRecord,
  migrateSnapshotCode,
  rereviewWouldTrigger,
} from './lib/workspace-files-migration';

import type { BlobToWrite } from './lib/workspace-files-migration';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = join(ROOT, 'api');

type Env = 'dev' | 'prod';
type Rec = Record<string, unknown>;

// ─── Plumbing: KV, R2 and D1 through wrangler (cwd api/) ────────────────

function wrangler(args: string[]): string {
  return execFileSync('npx', ['wrangler', ...args], {
    cwd: API_DIR,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

interface Targets {
  kv: string[];
  r2Bucket: string;
  r2: string[];
  d1: string[];
}

function targets(env: Env): Targets {
  if (env === 'dev') {
    // dev:stack persists to <root>/.wrangler/state. Local R2 keeps the
    // API's objects under the preview bucket's name (checked 2026-11-08).
    const persist = '--persist-to=../.wrangler/state';
    return {
      kv: ['--binding=WORKSPACES', '--preview', 'true', '--local', persist],
      r2Bucket: 'svg-path-extended-thumbnails-preview',
      r2: ['--local', persist],
      d1: ['--local', persist],
    };
  }
  return {
    kv: ['--binding=WORKSPACES', '--remote', '--preview', 'false'],
    r2Bucket: 'svg-path-extended-thumbnails',
    r2: ['--remote'],
    d1: ['--remote'],
  };
}

function kvList(t: Targets, prefix: string): string[] {
  return (JSON.parse(wrangler(['kv', 'key', 'list', ...t.kv, `--prefix=${prefix}`])) as { name: string }[]).map(
    (k) => k.name,
  );
}

/** A key's value, or null when it doesn't exist. Any other failure throws. */
function kvGet(t: Targets, key: string): string | null {
  let raw: string;
  try {
    raw = wrangler(['kv', 'key', 'get', ...t.kv, key]);
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    if (`${e.stdout ?? ''}${e.stderr ?? ''}`.includes('Value not found')) return null;
    throw new Error(`reading ${key} failed: ${(e.stderr || e.message || String(err)).trim().split('\n')[0]}`);
  }
  return raw.trim() === 'Value not found' ? null : raw;
}

/** Write through a file (`--path`): a large record would overflow the command line. */
function kvPut(t: Targets, key: string, value: string): void {
  const file = join(ROOT, 'tmp', 'kv-put', `${key.replace(/[^A-Za-z0-9_.-]/g, '_')}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, value);
  try {
    wrangler(['kv', 'key', 'put', ...t.kv, key, `--path=${file}`]);
  } finally {
    rmSync(file, { force: true });
  }
}

/** Put text at an R2 key, from a file whose bytes are checked against `sha256` when given. */
function r2PutText(t: Targets, key: string, text: string, contentType: string, sha256?: string): void {
  const file = join(ROOT, 'tmp', 'r2-put', key.replace(/[^A-Za-z0-9_.-]/g, '_'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text, 'utf8');
  try {
    if (sha256 !== undefined) {
      const onDisk = createHash('sha256').update(readFileSync(file)).digest('hex');
      if (onDisk !== sha256) throw new Error(`the bytes for ${key} hash to ${onDisk}, not ${sha256}`);
    }
    const target = `${t.r2Bucket}/${key}`;
    wrangler(['r2', 'object', 'put', target, `--file=${file}`, `--content-type=${contentType}`, ...t.r2]);
  } finally {
    rmSync(file, { force: true });
  }
}

/**
 * An R2 object's text, or null when the object isn't there (R2's own "The
 * specified key does not exist.", as wrangler prints it; checked 2026-11-08).
 * Any other failure throws: read as "absent", a network error could make the
 * snapshot pass write a one-file manifest over a real one.
 */
function r2GetText(t: Targets, key: string): string | null {
  try {
    return wrangler(['r2', 'object', 'get', `${t.r2Bucket}/${key}`, '--pipe', ...t.r2]);
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    if (`${e.stdout ?? ''}${e.stderr ?? ''}`.includes('The specified key does not exist')) return null;
    throw new Error(`reading R2 ${key} failed: ${(e.stderr || e.message || String(err)).trim().split('\n')[0]}`);
  }
}

function d1Snapshots(t: Targets): { id: string; workspace_id: string }[] {
  const out = wrangler([
    'd1',
    'execute',
    'svg-path-extended-users',
    '--json',
    '--command',
    'SELECT id, workspace_id FROM snapshots ORDER BY workspace_id, n',
    ...t.d1,
  ]);
  const parsed = JSON.parse(out) as { results: { id: string; workspace_id: string }[] }[];
  return parsed[0]?.results ?? [];
}

// ─── The run ────────────────────────────────────────────────────────────

type Outcome = 'migrated' | 'already' | 'orphan' | 'skipped-concurrent-write' | 'error';

interface Ctx {
  t: Targets;
  write: boolean;
  backupDir: string | null;
  blobsWritten: Set<string>;
  report: Record<string, { outcome: Outcome; hash?: string; detail?: string }>;
}

function record(ctx: Ctx, key: string, outcome: Outcome, extra: { hash?: string; detail?: string } = {}): Outcome {
  ctx.report[key] = { outcome, ...extra };
  if (outcome !== 'already') {
    console.log(`  ${outcome.padEnd(26)} ${key}${extra.detail ? `  ${extra.detail}` : ''}`);
  }
  return outcome;
}

/**
 * Save a key's pre-image before overwriting it. An existing backup is never
 * replaced: a later run with the same folder (after `--only`, or a retry)
 * would otherwise swap the original for a half-migrated queue.
 */
function backup(ctx: Ctx, key: string, raw: string): void {
  if (!ctx.backupDir) return;
  mkdirSync(ctx.backupDir, { recursive: true });
  const file = join(ctx.backupDir, `${key.replace(/[^A-Za-z0-9_.-]/g, '_')}.json`);
  if (existsSync(file)) return;
  writeFileSync(file, raw);
}

function writeBlob(ctx: Ctx, blob: BlobToWrite): void {
  const key = `files/${blob.workspaceId}/${blob.sha256}`;
  if (ctx.blobsWritten.has(key)) return;
  r2PutText(ctx.t, key, blob.text, 'text/plain; charset=utf-8', blob.sha256);
  ctx.blobsWritten.add(key);
}

const program = new Command();
program
  .name('migrate-workspace-files-kv')
  .description('Move every stored program from before phase 2 into R2 blobs, and rewrite its record as a manifest')
  .requiredOption('--env <env>', 'dev or prod')
  .option('--confirm', 'required for --env prod (also for a dry run: it reads production)')
  .option('--write', 'write the blobs and records (default: a dry run that writes nothing)')
  .option('--backup-dir <dir>', 'write every pre-image here before overwriting it (required with --write)')
  .option('--only <workspaceId>', 'migrate one workspace: its record, approval, queue entries and snapshots')
  .option('--no-snapshots', 'leave snapshots alone')
  .option('--report <file>', 'write a JSON report of every record (it names workspace ids: keep it in tmp/)')
  .action(
    async (opts: {
      env: string;
      confirm?: boolean;
      write?: boolean;
      backupDir?: string;
      only?: string;
      snapshots: boolean;
      report?: string;
    }) => {
      const env = opts.env as Env;
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
        t: targets(env),
        write,
        backupDir: opts.backupDir ? join(process.cwd(), opts.backupDir) : null,
        blobsWritten: new Set(),
        report: {},
      };
      console.log(`Target environment: ${env.toUpperCase()}${write ? '' : ' (DRY RUN)'}`);
      const counts: Record<Outcome, number> = {
        migrated: 0,
        already: 0,
        orphan: 0,
        'skipped-concurrent-write': 0,
        error: 0,
      };
      const falseRereviews: string[] = [];

      // Workspaces: old and new kept for the re-review check.
      const workspaceKeys = opts.only
        ? [`workspace:${opts.only}`]
        : kvList(ctx.t, 'workspace:').filter((k) => !k.startsWith('workspace:thumbmeta:'));
      const before = new Map<string, Rec>();
      const after = new Map<string, Rec>();
      console.log(`Workspaces: ${workspaceKeys.length}`);
      for (const key of workspaceKeys) {
        const id = key.slice('workspace:'.length);
        const raw = kvGet(ctx.t, key);
        if (!raw) {
          counts[record(ctx, key, 'error', { detail: 'KV value missing' })]++;
          continue;
        }
        const ws = JSON.parse(raw) as Rec;
        before.set(id, ws);
        const result = await migrateRecord(ws, 'contentHash', id);
        if (result.kind === 'already') {
          after.set(id, ws);
          counts[record(ctx, key, 'already')]++;
          continue;
        }
        if (result.kind === 'error') {
          counts[record(ctx, key, 'error', { detail: result.message })]++;
          continue;
        }
        after.set(id, result.record);
        if (!write) {
          counts[record(ctx, key, 'migrated', { hash: result.hash, detail: '(dry run)' })]++;
          continue;
        }
        writeBlob(ctx, result.blob);
        if (kvGet(ctx.t, key) !== raw) {
          counts[record(ctx, key, 'skipped-concurrent-write')]++;
          after.set(id, ws);
          continue;
        }
        backup(ctx, key, raw);
        kvPut(ctx.t, key, JSON.stringify(result.record));
        counts[record(ctx, key, 'migrated', { hash: result.hash })]++;
      }

      // Approvals, with the re-review check against their workspace.
      const approvalKeys = opts.only ? [`approval:${opts.only}`] : kvList(ctx.t, 'approval:');
      console.log(`Approvals: ${approvalKeys.length}`);
      for (const key of approvalKeys) {
        const raw = kvGet(ctx.t, key);
        if (!raw) {
          if (!opts.only) counts[record(ctx, key, 'error', { detail: 'KV value missing' })]++;
          continue;
        }
        const approval = JSON.parse(raw) as Rec;
        const id = String(approval.workspaceId ?? key.slice('approval:'.length));
        const oldWs = before.get(id);
        if (!oldWs) {
          counts[record(ctx, key, 'orphan', { detail: 'its workspace record is missing; left as it is' })]++;
          continue;
        }
        const result = await migrateRecord(approval, 'codeHash', id);
        if (result.kind === 'error') {
          counts[record(ctx, key, 'error', { detail: result.message })]++;
          continue;
        }
        const newApproval = result.kind === 'migrate' ? result.record : approval;
        const wouldBefore = await rereviewWouldTrigger(approval, oldWs);
        const wouldAfter = await rereviewWouldTrigger(newApproval, after.get(id) ?? oldWs);
        if (wouldBefore !== wouldAfter) {
          falseRereviews.push(id);
          counts[record(ctx, key, 'error', { detail: `re-review answer changes (${wouldBefore} → ${wouldAfter})` })]++;
          continue;
        }
        if (result.kind === 'already') {
          counts[record(ctx, key, 'already')]++;
          continue;
        }
        const note = wouldBefore ? 'edited since approval' : 'unedited';
        if (!write) {
          counts[record(ctx, key, 'migrated', { hash: result.hash, detail: `(dry run; ${note})` })]++;
          continue;
        }
        writeBlob(ctx, result.blob);
        if (kvGet(ctx.t, key) !== raw) {
          counts[record(ctx, key, 'skipped-concurrent-write')]++;
          continue;
        }
        backup(ctx, key, raw);
        kvPut(ctx.t, key, JSON.stringify(result.record));
        counts[record(ctx, key, 'migrated', { hash: result.hash, detail: note })]++;
      }

      // Queues: entries for this workspace (--only), whose workspace still exists.
      for (const key of ['queue:review', 'queue:rereview']) {
        const raw = kvGet(ctx.t, key);
        if (!raw) continue;
        const entries = JSON.parse(raw) as (Rec & { workspaceId: string })[];
        if (!Array.isArray(entries)) {
          counts[record(ctx, key, 'error', { detail: 'not an array' })]++;
          continue;
        }
        const orphans = entries.filter(
          (e) => (!opts.only || e.workspaceId === opts.only) && e.files === undefined && !before.has(e.workspaceId),
        );
        for (const e of orphans) {
          const detail = 'its workspace record is missing; left as it is';
          counts[record(ctx, `${key}~${e.workspaceId}`, 'orphan', { detail })]++;
        }
        const out = await migrateQueue(
          entries,
          (e) => (!opts.only || e.workspaceId === opts.only) && before.has(e.workspaceId),
        );
        if (out.errors.length) {
          counts[record(ctx, key, 'error', { detail: out.errors.join('; ') })]++;
          continue;
        }
        if (out.changed === 0) {
          counts[record(ctx, key, 'already')]++;
          continue;
        }
        if (!write) {
          counts[record(ctx, key, 'migrated', { detail: `(dry run, ${out.changed} entries)` })]++;
          continue;
        }
        for (const blob of out.blobs) writeBlob(ctx, blob);
        if (kvGet(ctx.t, key) !== raw) {
          counts[record(ctx, key, 'skipped-concurrent-write')]++;
          continue;
        }
        backup(ctx, key, raw);
        kvPut(ctx.t, key, JSON.stringify(out.entries));
        counts[record(ctx, key, 'migrated', { detail: `${out.changed} entries` })]++;
      }

      // Snapshots: rows in D1, files in R2.
      if (opts.snapshots) {
        const rows = d1Snapshots(ctx.t).filter((r) => !opts.only || r.workspace_id === opts.only);
        console.log(`Snapshots: ${rows.length}`);
        for (const row of rows) {
          const prefix = `snapshots/${row.workspace_id}/${row.id}/`;
          const key = `snapshot:${row.id}`;
          let manifest: string | null;
          let code: string | null;
          try {
            manifest = r2GetText(ctx.t, `${prefix}manifest.json`);
            code = manifest === null ? r2GetText(ctx.t, `${prefix}code.pathogen`) : null;
          } catch (err) {
            counts[record(ctx, key, 'error', { detail: (err as Error).message })]++;
            continue;
          }
          if (manifest !== null) {
            counts[record(ctx, key, 'already')]++;
            continue;
          }
          if (code === null) {
            counts[record(ctx, key, 'error', { detail: 'it has neither a manifest.json nor a code.pathogen' })]++;
            continue;
          }
          const result = await migrateSnapshotCode(code, row.workspace_id);
          if ('error' in result) {
            counts[record(ctx, key, 'error', { detail: result.error })]++;
            continue;
          }
          if (!write) {
            counts[record(ctx, key, 'migrated', { detail: '(dry run)' })]++;
            continue;
          }
          writeBlob(ctx, result.blob);
          r2PutText(ctx.t, `${prefix}manifest.json`, result.manifestJson, 'application/json');
          counts[record(ctx, key, 'migrated')]++;
        }
      }

      console.log('\nSummary:');
      for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(26)} ${v}`);
      console.log(`  ${'blobs written'.padEnd(26)} ${ctx.blobsWritten.size}`);
      console.log(
        falseRereviews.length === 0
          ? '  re-review check           every approval answers the same before and after'
          : `  re-review check           CHANGED for ${falseRereviews.join(', ')}`,
      );
      if (opts.report) {
        mkdirSync(dirname(opts.report), { recursive: true });
        writeFileSync(
          opts.report,
          JSON.stringify({ env, write, counts, falseRereviews, records: ctx.report }, null, 2),
        );
        console.log(`Report: ${opts.report}`);
      }
      if (counts.error > 0 || counts['skipped-concurrent-write'] > 0) process.exitCode = 2;
    },
  );
program.parse();

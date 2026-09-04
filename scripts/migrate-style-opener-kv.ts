/**
 * One-off KV migration for the 2026-09 style-block opener change:
 * rewrite `${ … }` style blocks to `#{ … }` in every stored Pathogen source.
 *
 * Source text lives in four key families of the WORKSPACES namespace:
 *   - workspace:{id}   Workspace.code (+ contentHash, rev)
 *   - approval:{id}    WorkspaceApproval.code (+ codeHash), frozen at approval
 *   - queue:review     ReviewQueueEntry[] (code + codeHash)
 *   - queue:rereview   ReviewQueueEntry[] (code + codeHash)
 * Nothing in D1 or R2 holds source (D1's code_hash column is a history log).
 *
 * The rewrite is the tree-driven codemod from scripts/lib/legacy-style-opener.ts
 * (the FROZEN pre-change grammar decides which `${` are openers). As a second
 * opinion, the LIVE parser must not report more errors on the rewritten text
 * than the legacy parser reported on the original — otherwise the record is
 * left alone and listed under `error`.
 *
 * Hashes: `contentHash` / `codeHash` are recomputed with the same SHA-256
 * first-8-bytes rule as website/api/utils.ts hashContent, so the
 * `approval.codeHash === workspace.contentHash` re-review invariant holds
 * after migration exactly when it held before (the rewrite is deterministic).
 * `rev` is bumped so a tab still running the old bundle gets a 409 on its next
 * autosave (the existing "open in another tab" banner) instead of clobbering
 * the migrated text. `updatedAt` is left alone — it is re-read just before
 * each write and the record is skipped if an autosave landed in between.
 *
 * Idempotent: a record whose code already contains `#{` is skipped.
 *
 * Usage:
 *   tsx scripts/migrate-style-opener-kv.ts --env=dev --dry-run
 *   tsx scripts/migrate-style-opener-kv.ts --env=dev --backup-dir .kv-backups/dev
 *   tsx scripts/migrate-style-opener-kv.ts --env=prod --confirm --backup-dir .kv-backups/prod
 *   tsx scripts/migrate-style-opener-kv.ts --env=prod --confirm --only <workspaceId> --backup-dir …
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

import { parser as liveParser } from '../src/parser/pathogen.generated';
import { buildLegacyParser, rewriteSource } from './lib/legacy-style-opener';

import type { LRParser } from '@lezer/lr';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = join(ROOT, 'api');

// ─── KV plumbing (same shape as migrate-viewbox.ts) ─────────────────────

function wrangler(args: string[]): string {
  return execFileSync('npx', ['wrangler', ...args], { cwd: API_DIR, encoding: 'utf-8' });
}

function buildKvFlags(env: 'dev' | 'prod'): string[] {
  if (env === 'dev') {
    // dev:stack persists to <root>/.wrangler/state; wrangler runs with cwd=api/.
    return ['--binding=WORKSPACES', '--preview', 'true', '--persist-to=../.wrangler/state'];
  }
  return ['--binding=WORKSPACES', '--remote', '--preview', 'false'];
}

function kvList(flags: string[]): { name: string }[] {
  return JSON.parse(wrangler(['kv', 'key', 'list', ...flags])) as { name: string }[];
}

function kvGet(flags: string[], key: string): string | null {
  let raw: string;
  try {
    raw = wrangler(['kv', 'key', 'get', ...flags, key]);
  } catch {
    return null;
  }
  return raw.trim() === 'Value not found' ? null : raw;
}

function kvPut(flags: string[], key: string, value: string): void {
  execFileSync('npx', ['wrangler', 'kv', 'key', 'put', ...flags, key, value], {
    cwd: API_DIR,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

/** Mirrors website/api/utils.ts hashContent: SHA-256, first 8 bytes, hex. */
function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
}

// ─── Rewrite + second opinion ───────────────────────────────────────────

function errorCount(parser: LRParser, source: string): number {
  let n = 0;
  parser.parse(source).iterate({
    enter(node) {
      if (node.type.isError) n++;
    },
  });
  return n;
}

type CodeOutcome =
  | { kind: 'rewritten'; text: string; count: number }
  | { kind: 'no-legacy' }
  | { kind: 'already-migrated' }
  | { kind: 'parse-check-failed'; before: number; after: number };

function migrateCode(code: string, legacy: LRParser): CodeOutcome {
  const out = rewriteSource(code, legacy);
  if (out.kind === 'already-migrated') return { kind: 'already-migrated' };
  if (out.kind !== 'rewritten') return { kind: 'no-legacy' };
  const before = errorCount(legacy, code);
  const after = errorCount(liveParser, out.text);
  if (after > before) return { kind: 'parse-check-failed', before, after };
  return { kind: 'rewritten', text: out.text, count: out.offsets.length };
}

// ─── Records ────────────────────────────────────────────────────────────

interface Workspace {
  id: string;
  code: string;
  contentHash: string;
  rev?: number;
  updatedAt: string;
  [key: string]: unknown;
}

interface Approval {
  workspaceId: string;
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

type Outcome =
  | 'migrated'
  | 'skipped-no-legacy'
  | 'skipped-already-migrated'
  | 'skipped-concurrent-write'
  | 'skipped-parse-check-failed'
  | 'error';

interface Ctx {
  flags: string[];
  legacy: LRParser;
  dryRun: boolean;
  backupDir: string | null;
  report: Record<string, { outcome: Outcome; detail?: string; openers?: number }>;
}

function backup(ctx: Ctx, key: string, raw: string): void {
  if (!ctx.backupDir) return;
  mkdirSync(ctx.backupDir, { recursive: true });
  writeFileSync(join(ctx.backupDir, `${key.replace(/[^A-Za-z0-9_.-]/g, '_')}.json`), raw);
}

function record(ctx: Ctx, key: string, outcome: Outcome, extra: { detail?: string; openers?: number } = {}): Outcome {
  ctx.report[key] = { outcome, ...extra };
  const tag = outcome.padEnd(28);
  console.log(
    `  ${tag} ${key}${extra.openers ? `  (${extra.openers} opener${extra.openers === 1 ? '' : 's'})` : ''}${extra.detail ? `  ${extra.detail}` : ''}`,
  );
  return outcome;
}

function migrateWorkspace(ctx: Ctx, key: string): Outcome {
  const raw = kvGet(ctx.flags, key);
  if (!raw) return record(ctx, key, 'error', { detail: 'KV value missing' });
  let ws: Workspace;
  try {
    ws = JSON.parse(raw);
  } catch (e) {
    return record(ctx, key, 'error', { detail: `JSON parse failed: ${(e as Error).message}` });
  }
  const out = migrateCode(ws.code ?? '', ctx.legacy);
  if (out.kind === 'no-legacy') return record(ctx, key, 'skipped-no-legacy');
  if (out.kind === 'already-migrated') return record(ctx, key, 'skipped-already-migrated');
  if (out.kind === 'parse-check-failed') {
    return record(ctx, key, 'skipped-parse-check-failed', {
      detail: `live parser: ${out.after} errors after vs ${out.before} before`,
    });
  }
  if (ctx.dryRun) return record(ctx, key, 'migrated', { openers: out.count, detail: '(dry run)' });

  const recheck = kvGet(ctx.flags, key);
  if (recheck) {
    try {
      const fresh = JSON.parse(recheck) as Workspace;
      if (fresh.updatedAt !== ws.updatedAt) return record(ctx, key, 'skipped-concurrent-write');
    } catch {
      // keep the record we already parsed
    }
  }
  backup(ctx, key, raw);
  ws.code = out.text;
  ws.contentHash = hashContent(out.text);
  ws.rev = (ws.rev ?? 0) + 1;
  kvPut(ctx.flags, key, JSON.stringify(ws));
  return record(ctx, key, 'migrated', { openers: out.count });
}

function migrateApproval(ctx: Ctx, key: string): Outcome {
  const raw = kvGet(ctx.flags, key);
  if (!raw) return record(ctx, key, 'error', { detail: 'KV value missing' });
  let approval: Approval;
  try {
    approval = JSON.parse(raw);
  } catch (e) {
    return record(ctx, key, 'error', { detail: `JSON parse failed: ${(e as Error).message}` });
  }
  const out = migrateCode(approval.code ?? '', ctx.legacy);
  if (out.kind === 'no-legacy') return record(ctx, key, 'skipped-no-legacy');
  if (out.kind === 'already-migrated') return record(ctx, key, 'skipped-already-migrated');
  if (out.kind === 'parse-check-failed') {
    return record(ctx, key, 'skipped-parse-check-failed', {
      detail: `live parser: ${out.after} errors after vs ${out.before} before`,
    });
  }
  if (ctx.dryRun) return record(ctx, key, 'migrated', { openers: out.count, detail: '(dry run)' });
  if (kvGet(ctx.flags, key) !== raw) return record(ctx, key, 'skipped-concurrent-write');
  backup(ctx, key, raw);
  approval.code = out.text;
  approval.codeHash = hashContent(out.text);
  kvPut(ctx.flags, key, JSON.stringify(approval));
  return record(ctx, key, 'migrated', { openers: out.count });
}

function migrateQueue(ctx: Ctx, key: string): Outcome {
  const raw = kvGet(ctx.flags, key);
  if (!raw) return record(ctx, key, 'skipped-no-legacy', { detail: '(absent)' });
  let entries: QueueEntry[];
  try {
    entries = JSON.parse(raw);
  } catch (e) {
    return record(ctx, key, 'error', { detail: `JSON parse failed: ${(e as Error).message}` });
  }
  if (!Array.isArray(entries)) return record(ctx, key, 'error', { detail: 'not an array' });
  let changed = 0;
  let openers = 0;
  let failed: string | null = null;
  for (const entry of entries) {
    const out = migrateCode(entry.code ?? '', ctx.legacy);
    if (out.kind === 'rewritten') {
      entry.code = out.text;
      entry.codeHash = hashContent(out.text);
      changed++;
      openers += out.count;
    } else if (out.kind === 'parse-check-failed') {
      failed = `${entry.workspaceId}: live parser ${out.after} errors after vs ${out.before} before`;
    }
  }
  if (failed) return record(ctx, key, 'skipped-parse-check-failed', { detail: failed });
  if (changed === 0) return record(ctx, key, 'skipped-no-legacy');
  if (ctx.dryRun) return record(ctx, key, 'migrated', { openers, detail: `(dry run, ${changed} entries)` });
  // Queues are live arrays (submissions land between our read and write);
  // any change to the raw record since the read means skip, not overwrite.
  if (kvGet(ctx.flags, key) !== raw) return record(ctx, key, 'skipped-concurrent-write');
  backup(ctx, key, raw);
  kvPut(ctx.flags, key, JSON.stringify(entries));
  return record(ctx, key, 'migrated', { openers, detail: `${changed} entries` });
}

// ─── CLI ────────────────────────────────────────────────────────────────

const program = new Command();
program
  .name('migrate-style-opener-kv')
  .description(
    'Rewrite legacy style-block openers in every stored workspace, approval, and review-queue source (WORKSPACES KV)',
  )
  .requiredOption('--env <env>', 'dev or prod')
  .option('--confirm', 'required for --env=prod')
  .option('--dry-run', 'report what would change without writing')
  .option('--only <workspaceId>', 'migrate one workspace (its workspace: and approval: records only)')
  .option('--backup-dir <dir>', 'write every pre-image here before overwriting it (required unless --dry-run)')
  .option('--report <file>', 'write a JSON report of every record')
  .action(
    (opts: {
      env: string;
      confirm?: boolean;
      dryRun?: boolean;
      only?: string;
      backupDir?: string;
      report?: string;
    }) => {
      const env = opts.env as 'dev' | 'prod';
      if (env !== 'dev' && env !== 'prod') {
        console.error(`--env must be 'dev' or 'prod' (got: ${opts.env})`);
        process.exit(1);
      }
      if (env === 'prod' && !opts.confirm) {
        console.error('Refusing to run against prod without --confirm');
        process.exit(1);
      }
      const dryRun = Boolean(opts.dryRun);
      if (!dryRun && !opts.backupDir) {
        console.error('A write run needs --backup-dir (KV has no versioning; every pre-image is saved there first)');
        process.exit(1);
      }
      const ctx: Ctx = {
        flags: buildKvFlags(env),
        legacy: buildLegacyParser(),
        dryRun,
        backupDir: opts.backupDir ? join(process.cwd(), opts.backupDir) : null,
        report: {},
      };

      console.log(`Target environment: ${env.toUpperCase()}${dryRun ? ' (DRY RUN)' : ''}`);
      let keys: string[];
      if (opts.only) {
        keys = [`workspace:${opts.only}`, `approval:${opts.only}`];
      } else {
        console.log('Listing KV keys...');
        keys = kvList(ctx.flags).map((k) => k.name);
      }
      const workspaceKeys = keys.filter((k) => k.startsWith('workspace:') && !k.startsWith('workspace:thumbmeta:'));
      const approvalKeys = keys.filter((k) => k.startsWith('approval:'));
      const queueKeys = opts.only ? [] : ['queue:review', 'queue:rereview'].filter((k) => keys.includes(k));
      console.log(
        `${workspaceKeys.length} workspace, ${approvalKeys.length} approval, ${queueKeys.length} queue record(s)\n`,
      );

      const counts: Record<Outcome, number> = {
        migrated: 0,
        'skipped-no-legacy': 0,
        'skipped-already-migrated': 0,
        'skipped-concurrent-write': 0,
        'skipped-parse-check-failed': 0,
        error: 0,
      };
      for (const key of workspaceKeys) counts[migrateWorkspace(ctx, key)]++;
      for (const key of approvalKeys) counts[migrateApproval(ctx, key)]++;
      for (const key of queueKeys) counts[migrateQueue(ctx, key)]++;

      console.log('\nSummary:');
      for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(28)} ${v}`);
      if (opts.report) {
        writeFileSync(opts.report, JSON.stringify({ env, dryRun, counts, records: ctx.report }, null, 2));
        console.log(`Report: ${opts.report}`);
      }
      if (counts.error > 0 || counts['skipped-parse-check-failed'] > 0) process.exitCode = 2;
    },
  );
program.parse();

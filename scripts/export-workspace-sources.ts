/**
 * READ-ONLY: copy every stored Pathogen source out of the WORKSPACES KV
 * namespace into .pathogen files, so the semantics audit can compile them
 * (decision 22 in project-docs/modules/05-phase-0a-audit.md: stored code is
 * checked before a breaking change is pushed). This script has no write path:
 * it only lists and gets keys.
 *
 * Source lives in four key families (see migrate-style-opener-kv.ts):
 *   workspace:{id}, approval:{id}, queue:review, queue:rereview
 *
 * Usage:
 *   npx tsx scripts/export-workspace-sources.ts --env dev
 *   npx tsx scripts/export-workspace-sources.ts --env prod --confirm
 * then:
 *   npx tsx scripts/audit-semantics.ts --step 3 --probe-dir tmp/kv-sources/prod --only tmp/kv-sources/prod
 *
 * Files land in tmp/kv-sources/<env>/ (gitignored): user code never enters git.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = join(ROOT, 'api');

function wrangler(args: string[]): string {
  return execFileSync('npx', ['wrangler', ...args], { cwd: API_DIR, encoding: 'utf-8', maxBuffer: 1 << 28 });
}

function kvFlags(env: 'dev' | 'prod'): string[] {
  if (env === 'dev') return ['--binding=WORKSPACES', '--preview', 'true', '--persist-to=../.wrangler/state'];
  return ['--binding=WORKSPACES', '--remote', '--preview', 'false'];
}

function kvList(flags: string[], prefix: string): string[] {
  const keys = JSON.parse(wrangler(['kv', 'key', 'list', ...flags, `--prefix=${prefix}`])) as { name: string }[];
  return keys.map((k) => k.name);
}

function kvGet(flags: string[], key: string): string | null {
  try {
    const raw = wrangler(['kv', 'key', 'get', ...flags, key]);
    return raw.trim() === 'Value not found' ? null : raw;
  } catch {
    return null;
  }
}

/** A key as a file name: `workspace:abc` → `workspace--abc`. */
function fileName(key: string, suffix = ''): string {
  return `${key.replace(/[^A-Za-z0-9_-]+/g, '--')}${suffix}.pathogen`;
}

const program = new Command();
program
  .name('export-workspace-sources')
  .description('READ-ONLY: copy every stored Pathogen source in WORKSPACES KV into tmp/kv-sources/<env>/ for the semantics audit')
  .requiredOption('--env <env>', 'dev (local dev:stack state) or prod (remote)')
  .option('--confirm', 'required for --env prod')
  .option('--out <dir>', 'output folder (default tmp/kv-sources/<env>; emptied first)')
  .action((opts: { env: string; confirm?: boolean; out?: string }) => {
    const env = opts.env as 'dev' | 'prod';
    if (env !== 'dev' && env !== 'prod') {
      console.error(`--env must be 'dev' or 'prod' (got: ${opts.env})`);
      process.exit(1);
    }
    if (env === 'prod' && !opts.confirm) {
      console.error('Refusing to read prod without --confirm');
      process.exit(1);
    }
    const flags = kvFlags(env);
    const out = opts.out ?? join('tmp', 'kv-sources', env);
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });

    const counts = { workspace: 0, approval: 0, queueEntries: 0, empty: 0, unreadable: 0 };
    for (const prefix of ['workspace:', 'approval:']) {
      const keys = kvList(flags, prefix);
      console.log(`${prefix} ${keys.length} keys`);
      for (const key of keys) {
        const raw = kvGet(flags, key);
        let code: unknown;
        try {
          code = raw ? (JSON.parse(raw) as { code?: unknown }).code : undefined;
        } catch {
          code = undefined;
        }
        if (raw === null || code === undefined) {
          counts.unreadable++;
          console.log(`  unreadable ${key}`);
          continue;
        }
        if (typeof code !== 'string' || !code.trim()) {
          counts.empty++;
          continue;
        }
        writeFileSync(join(out, fileName(key)), code);
        counts[prefix === 'workspace:' ? 'workspace' : 'approval']++;
      }
    }
    for (const key of ['queue:review', 'queue:rereview']) {
      const raw = kvGet(flags, key);
      if (!raw) continue;
      let entries: { workspaceId?: string; code?: unknown }[] = [];
      try {
        entries = JSON.parse(raw);
      } catch {
        counts.unreadable++;
        continue;
      }
      if (!Array.isArray(entries)) continue;
      entries.forEach((entry, i) => {
        if (typeof entry.code !== 'string' || !entry.code.trim()) return;
        writeFileSync(join(out, fileName(key, `--${entry.workspaceId ?? i}`)), entry.code);
        counts.queueEntries++;
      });
    }
    console.log(
      `\nwrote ${counts.workspace} workspaces, ${counts.approval} approvals, ${counts.queueEntries} queue entries to ${out}` +
        ` (${counts.empty} empty, ${counts.unreadable} unreadable)`,
    );
  });
program.parse();

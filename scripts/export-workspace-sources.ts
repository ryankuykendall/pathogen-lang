/**
 * READ-ONLY: copy every stored Pathogen source out of the WORKSPACES KV
 * namespace (and, since phase 2, the files it names in the THUMBNAILS R2
 * bucket) into .pathogen files, so the semantics audit can compile them
 * (decision 22 in project-docs/modules/05-phase-0a-audit.md: stored code is
 * checked before a breaking change is pushed). This script has no write path:
 * it only lists and gets keys and objects.
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

/** Where a workspace's blobs are: local dev R2 keeps them under the preview bucket's name. */
function r2Target(env: 'dev' | 'prod'): { bucket: string; flags: string[] } {
  if (env === 'dev') {
    return { bucket: 'svg-path-extended-thumbnails-preview', flags: ['--local', '--persist-to=../.wrangler/state'] };
  }
  return { bucket: 'svg-path-extended-thumbnails', flags: ['--remote'] };
}

/**
 * An R2 object's text (a read: `wrangler r2 object get --pipe`), or why it
 * couldn't be read. Only R2's own answer means the object isn't there; any
 * other failure (a network error, a wrangler hiccup) is tried twice more and
 * then reported as such, never as a missing file. On 2026-11-23 a passing
 * failure was reported "not in R2" for a blob that was there (note 71).
 */
function r2Get(target: { bucket: string; flags: string[] }, key: string): { text: string } | { missing: true } | { error: string } {
  let last = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const text = execFileSync(
        'npx',
        ['wrangler', 'r2', 'object', 'get', `${target.bucket}/${key}`, '--pipe', ...target.flags],
        { cwd: API_DIR, encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] },
      );
      return { text };
    } catch (err) {
      last = String((err as { stderr?: unknown }).stderr ?? err);
      if (/The specified key does not exist/i.test(last)) return { missing: true };
    }
  }
  return { error: last.trim().split('\n').find((line) => line.trim() !== '') ?? 'unknown error' };
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

    // Since phase 2 a record may hold `files` (a manifest) with the text in R2
    // at files/{workspaceId}/{sha256} (project-docs/modules/48-storage-
    // design-v2.md). Their .pathogen files are read from R2 (one get each)
    // and written flat, as both readers of this folder expect: a record that
    // is just main.pathogen as `<key>.pathogen`, as before; one with several
    // files as `<key>--<path>.pathogen` each. (Imports between those don't
    // resolve in a flat folder; the declaration checks don't need them to.)
    const r2 = r2Target(env);
    const counts = { workspace: 0, approval: 0, queueEntries: 0, empty: 0, unreadable: 0, fromR2: 0 };
    const writeFiles = (key: string, workspaceId: string, files: unknown, suffix = ''): boolean => {
      if (typeof files !== 'object' || files === null) return false;
      const pathogen = Object.entries(files as Record<string, { sha256?: unknown }>).filter(
        ([path, entry]) => path.endsWith('.pathogen') && typeof entry.sha256 === 'string',
      );
      const justMain = pathogen.length === 1 && pathogen[0][0] === 'main.pathogen';
      if (pathogen.length === 0) console.log(`  no .pathogen files ${key}`);
      // `a/b.pathogen` and `a-b.pathogen` flatten to the same name; the second
      // gets its hash appended rather than overwriting the first.
      const used = new Set<string>();
      let wrote = false;
      for (const [path, entry] of pathogen) {
        const read = r2Get(r2, `files/${workspaceId}/${entry.sha256 as string}`);
        if (!('text' in read)) {
          counts.unreadable++;
          console.log(`  unreadable ${key} ${path} (${'missing' in read ? 'not in R2' : `couldn't be read: ${read.error}`})`);
          continue;
        }
        const text = read.text;
        if (!text.trim()) {
          counts.empty++;
          continue;
        }
        let pathSuffix = justMain ? '' : `--${path.replace(/\.pathogen$/, '').replace(/[^A-Za-z0-9_-]+/g, '--')}`;
        if (used.has(pathSuffix)) pathSuffix = `${pathSuffix}-${(entry.sha256 as string).slice(0, 8)}`;
        used.add(pathSuffix);
        writeFileSync(join(out, fileName(key, `${suffix}${pathSuffix}`)), text);
        counts.fromR2++;
        wrote = true;
      }
      return wrote;
    };
    for (const prefix of ['workspace:', 'approval:']) {
      const keys = kvList(flags, prefix);
      console.log(`${prefix} ${keys.length} keys`);
      for (const key of keys) {
        const raw = kvGet(flags, key);
        let code: unknown;
        let parsed: { code?: unknown; files?: unknown; workspaceId?: unknown } | undefined;
        try {
          parsed = raw ? (JSON.parse(raw) as typeof parsed) : undefined;
          code = parsed?.code;
        } catch {
          code = undefined;
        }
        if (parsed?.files !== undefined) {
          const workspaceId = prefix === 'workspace:' ? key.slice(prefix.length) : String(parsed.workspaceId ?? '');
          if (writeFiles(key, workspaceId, parsed.files)) counts[prefix === 'workspace:' ? 'workspace' : 'approval']++;
          continue;
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
      let entries: { workspaceId?: string; code?: unknown; files?: unknown }[] = [];
      try {
        entries = JSON.parse(raw);
      } catch {
        counts.unreadable++;
        continue;
      }
      if (!Array.isArray(entries)) continue;
      entries.forEach((entry, i) => {
        if (entry.files !== undefined) {
          const wrote = writeFiles(key, entry.workspaceId ?? '', entry.files, `--${entry.workspaceId ?? i}`);
          if (wrote) counts.queueEntries++;
          return;
        }
        if (typeof entry.code !== 'string' || !entry.code.trim()) return;
        writeFileSync(join(out, fileName(key, `--${entry.workspaceId ?? i}`)), entry.code);
        counts.queueEntries++;
      });
    }
    console.log(
      `\nwrote ${counts.workspace} workspaces, ${counts.approval} approvals, ${counts.queueEntries} queue entries to ${out}` +
        ` (${counts.fromR2} files read from R2; ${counts.empty} empty, ${counts.unreadable} unreadable)`,
    );
  });
program.parse();

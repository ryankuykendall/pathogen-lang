// One-time merge of the two divergent local wrangler state dirs
// (`api/.wrangler/state` and `.wrangler/state`) into the new shared
// path at repo-root `.wrangler/state`. After running this and
// restarting `dev:stack`, both the API worker and the Pages worker
// see the same KV + D1 + R2.
//
// Why this exists: prior versions of dev:stack started two
// `wrangler dev` processes that each maintained their own
// miniflare sqlite state under different paths. Admin writes (via
// the API on :8787) went to api/.wrangler/state; SSR reads (via
// Pages on :3000) went to .wrangler/state. Same KV namespace ID
// in wrangler.toml, separate state on disk. Production is fine —
// both projects share the real Cloudflare KV namespace.
//
// Usage: `tsx scripts/merge-wrangler-state.ts`
//   --dry-run     show what would be merged
//   --pick api    use api/.wrangler when both have the same key
//                 (default — the API side has been the source of
//                  truth during dev)
//   --pick root   prefer root .wrangler

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ROOT_STATE = join(ROOT, '.wrangler', 'state');
const API_STATE = join(ROOT, 'api', '.wrangler', 'state');

interface MergeOpts {
  dryRun: boolean;
  pick: 'api' | 'root';
}

function walk(dir: string, base: string = dir): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = full.slice(base.length + 1);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full, base));
    } else {
      out.push(rel);
    }
  }
  return out;
}

function merge(src: string, dst: string, opts: MergeOpts, label: string): void {
  if (!existsSync(src)) {
    console.log(`  (${label}: ${src} does not exist — nothing to merge)`);
    return;
  }
  const files = walk(src);
  let copied = 0;
  let skipped = 0;
  for (const rel of files) {
    const srcFile = join(src, rel);
    const dstFile = join(dst, rel);
    if (existsSync(dstFile)) {
      // Tie-break by `pick`.
      const preferSrc = (label === 'api' && opts.pick === 'api') || (label === 'root' && opts.pick === 'root');
      if (!preferSrc) {
        skipped++;
        continue;
      }
    }
    if (opts.dryRun) {
      console.log(`  [dry-run] copy ${label}/${rel}`);
    } else {
      mkdirSync(dirname(dstFile), { recursive: true });
      copyFileSync(srcFile, dstFile);
    }
    copied++;
  }
  console.log(`  ${label}: ${copied} copied, ${skipped} skipped (already in destination)`);
}

const program = new Command();
program
  .name('merge-wrangler-state')
  .option('--dry-run', 'show what would happen without copying', false)
  .option('--pick <side>', 'when both sides have a key, prefer "api" or "root"', 'api')
  .action((opts: { dryRun?: boolean; pick?: string }) => {
    const pick = opts.pick === 'root' ? 'root' : 'api';
    const dryRun = Boolean(opts.dryRun);
    console.log(`Merging local wrangler state into ${ROOT_STATE}`);
    console.log(`  Tie-breaker: prefer ${pick}`);
    if (dryRun) console.log('  (DRY RUN — no files copied)');
    console.log('');
    // 1. Lift everything from api/.wrangler/state into root .wrangler/state
    merge(API_STATE, ROOT_STATE, { dryRun, pick }, 'api');
    // 2. Anything in root that's missing in api after step 1 stays put.
    console.log('');
    console.log(dryRun ? '\nDone (dry run).' : '\nDone. Restart dev:stack so both wranglers load the merged state.');
  });
program.parse();

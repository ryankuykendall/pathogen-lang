// One-off migration: re-key workspaces from anonymous user IDs to a single
// authenticated user. Used after the email-OTP auth migration left old
// anonymous workspaces stranded.
//
// Usage:
//   tsx scripts/migrate-anonymous-workspaces.ts \
//     --target <authenticated-user-id> \
//     --source <anon-id-1>,<anon-id-2>,...  \
//     [--apply]                             # default is dry-run
//
// Reads/writes against the production WORKSPACES KV via `wrangler kv key
// get|put|list --binding=WORKSPACES --remote`. Run from `api/` so wrangler
// picks up the right binding from api/wrangler.toml.

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
  isPublic: boolean;
  code: string;
  preferences?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  contentHash: string;
  thumbnailAt: string | null;
}

function wrangler(args: string[]): string {
  return execFileSync('npx', ['wrangler', ...args], { cwd: API_DIR, encoding: 'utf-8' });
}

// Both `id` and `preview_id` are set on the WORKSPACES binding, so
// wrangler insists on disambiguation for writes (--preview false targets
// the prod namespace; reads are tolerant without it but we pass it
// uniformly for clarity).
const KV_FLAGS = ['--binding=WORKSPACES', '--remote', '--preview', 'false'];

function kvList(): { name: string }[] {
  // Wrangler can paginate, but we expect <1000 keys for this project.
  return JSON.parse(wrangler(['kv', 'key', 'list', ...KV_FLAGS]));
}

function kvGet(key: string): string | null {
  try {
    return wrangler(['kv', 'key', 'get', ...KV_FLAGS, key]);
  } catch {
    return null;
  }
}

function kvPut(key: string, value: string): void {
  execFileSync('npx', ['wrangler', 'kv', 'key', 'put', ...KV_FLAGS, key, value], {
    cwd: API_DIR,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

function kvDelete(key: string): void {
  execFileSync('npx', ['wrangler', 'kv', 'key', 'delete', ...KV_FLAGS, key], {
    cwd: API_DIR,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

interface Plan {
  target: string;
  sources: string[];
  // Workspaces whose `userId` we will rewrite, with the source they came from.
  workspaces: { id: string; ws: Workspace; from: string }[];
  // Existing target index (workspace IDs already on the target user).
  existingTargetIds: string[];
  // Combined list of workspace IDs that will end up on the target user.
  finalIds: string[];
  // Preferences keys to migrate (anon → target). Skipped if target already has prefs.
  preferenceMoves: { from: string; to: string }[];
  // Source-user index keys to delete after migration.
  obsoleteUserKeys: string[];
}

async function buildPlan(target: string, sources: string[]): Promise<Plan> {
  const allKeys = kvList().map((k) => k.name);
  const sourceSet = new Set(sources);

  // Read each source user's workspace list and gather workspace records.
  const workspaces: Plan['workspaces'] = [];
  const obsoleteUserKeys: string[] = [];
  const preferenceMoves: Plan['preferenceMoves'] = [];

  for (const source of sources) {
    const indexKey = `user:${source}:workspaces`;
    const indexJson = kvGet(indexKey);
    if (!indexJson) {
      console.warn(`  source ${source}: no workspace index — skipping`);
      continue;
    }
    const ids: string[] = JSON.parse(indexJson);
    for (const id of ids) {
      const wsJson = kvGet(`workspace:${id}`);
      if (!wsJson) {
        console.warn(`  ${source}: workspace ${id} missing from KV — skipping`);
        continue;
      }
      const ws: Workspace = JSON.parse(wsJson);
      workspaces.push({ id, ws, from: source });
    }
    obsoleteUserKeys.push(indexKey);

    const prefsKey = `user:${source}:preferences`;
    if (allKeys.includes(prefsKey)) {
      preferenceMoves.push({ from: prefsKey, to: `user:${target}:preferences` });
      obsoleteUserKeys.push(prefsKey);
    }
  }

  const targetIndexKey = `user:${target}:workspaces`;
  const existingTargetJson = kvGet(targetIndexKey);
  const existingTargetIds: string[] = existingTargetJson ? JSON.parse(existingTargetJson) : [];

  // Final order: keep target's existing workspaces first, then merge sources
  // in the order they were passed. De-dupe in case of overlap.
  const seen = new Set(existingTargetIds);
  const finalIds = [...existingTargetIds];
  for (const { id } of workspaces) {
    if (!seen.has(id)) {
      finalIds.push(id);
      seen.add(id);
    }
  }

  return {
    target,
    sources,
    workspaces,
    existingTargetIds,
    finalIds,
    preferenceMoves,
    obsoleteUserKeys,
  };
}

function printPlan(plan: Plan): void {
  console.log('\n=== Migration plan ===');
  console.log(`Target user:           ${plan.target}`);
  console.log(`Sources (${plan.sources.length}):           ${plan.sources.join(', ')}`);
  console.log(`Existing on target:    ${plan.existingTargetIds.length} workspaces`);
  console.log(`Source workspaces:     ${plan.workspaces.length}`);
  console.log(`Final on target:       ${plan.finalIds.length}`);
  console.log(`Preferences to move:   ${plan.preferenceMoves.length}`);
  console.log(`Obsolete keys to drop: ${plan.obsoleteUserKeys.length}`);

  // Group by source for readability.
  const bySource: Record<string, { id: string; name: string }[]> = {};
  for (const { id, ws, from } of plan.workspaces) {
    (bySource[from] ??= []).push({ id, name: ws.name });
  }
  console.log('\nWorkspaces by source:');
  for (const [src, items] of Object.entries(bySource)) {
    console.log(`  ${src} (${items.length}):`);
    for (const { id, name } of items.slice(0, 6)) {
      console.log(`    ${id.padEnd(22)} ${name}`);
    }
    if (items.length > 6) console.log(`    … ${items.length - 6} more`);
  }
}

function applyPlan(plan: Plan): void {
  console.log('\n=== Applying migration ===');

  // 1. Rewrite each workspace's userId.
  let n = 0;
  for (const { id, ws } of plan.workspaces) {
    const updated: Workspace = { ...ws, userId: plan.target };
    kvPut(`workspace:${id}`, JSON.stringify(updated));
    n++;
    if (n % 5 === 0 || n === plan.workspaces.length) {
      console.log(`  rewrote ${n}/${plan.workspaces.length} workspaces`);
    }
  }

  // 2. Write the merged index on the target user.
  kvPut(`user:${plan.target}:workspaces`, JSON.stringify(plan.finalIds));
  console.log(`  wrote target index (${plan.finalIds.length} workspaces)`);

  // 3. Move preferences if target doesn't already have one.
  const targetPrefsKey = `user:${plan.target}:preferences`;
  const existingTargetPrefs = kvGet(targetPrefsKey);
  for (const { from, to } of plan.preferenceMoves) {
    if (existingTargetPrefs) {
      console.log(`  skipping ${from} → ${to} (target already has preferences)`);
      continue;
    }
    const value = kvGet(from);
    if (value) {
      kvPut(to, value);
      console.log(`  moved preferences ${from} → ${to}`);
    }
  }

  // 4. Delete obsolete source-user keys (indices + preferences moved above).
  for (const key of plan.obsoleteUserKeys) {
    kvDelete(key);
    console.log(`  deleted ${key}`);
  }

  console.log('\nDone.');
}

const program = new Command();
program
  .name('migrate-anonymous-workspaces')
  .description('Re-key anonymous workspaces to an authenticated user (one-off post-auth migration).')
  .requiredOption('--target <id>', 'authenticated user ID (workspaces will be re-keyed to this)')
  .requiredOption('--source <ids>', 'comma-separated list of anonymous user IDs to drain')
  .option('--apply', 'actually write changes (default: dry-run)')
  .action(async (opts: { target: string; source: string; apply?: boolean }) => {
    const sources = opts.source.split(',').map((s) => s.trim()).filter(Boolean);
    if (sources.length === 0) throw new Error('--source must list at least one user ID');
    if (sources.includes(opts.target)) throw new Error('target cannot also appear in --source');

    console.log('Reading KV state from production...');
    const plan = await buildPlan(opts.target, sources);
    printPlan(plan);

    if (!opts.apply) {
      console.log('\n(Dry run. Re-run with --apply to commit changes.)');
      return;
    }

    applyPlan(plan);
  });
program.parse();

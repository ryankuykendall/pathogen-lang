import { execSync } from 'node:child_process';

import { Command } from 'commander';

const program = new Command();
program
  .name('backfill-public-index')
  .description('One-time script to build the public:workspaces KV index from existing workspace data')
  .requiredOption('--namespace-id <id>', 'KV namespace ID for WORKSPACES')
  .option('--dry-run', 'Print results without writing to KV', false)
  .action(async (opts) => {
    const { namespaceId, dryRun } = opts;

    console.log('Backfilling public workspace index...\n');
    console.log(`KV namespace: ${namespaceId}`);
    if (dryRun) console.log('DRY RUN — no writes will be made\n');

    // List all workspace keys
    console.log('Listing workspace keys...');
    let cursor: string | undefined;
    const allKeys: string[] = [];

    do {
      const args = ['wrangler', 'kv', 'key', 'list', '--namespace-id', namespaceId];
      if (cursor) args.push('--cursor', cursor);

      const result = execSync(args.join(' '), { encoding: 'utf-8' });
      const parsed = JSON.parse(result);

      for (const key of parsed) {
        if (key.name.startsWith('workspace:')) {
          allKeys.push(key.name);
        }
      }

      // Wrangler list returns result_info with cursor if more pages
      cursor = parsed.result_info?.cursor;
    } while (cursor);

    console.log(`Found ${allKeys.length} workspace keys\n`);

    // Read each workspace and filter for public ones
    interface IndexEntry {
      id: string;
      slug: string;
      name: string;
      description: string;
      userId: string;
      updatedAt: string;
      thumbnailAt: string | null;
    }

    const publicWorkspaces: IndexEntry[] = [];

    for (const key of allKeys) {
      try {
        const raw = execSync(`wrangler kv key get --namespace-id ${namespaceId} "${key}"`, { encoding: 'utf-8' });
        const ws = JSON.parse(raw);

        if (ws.isPublic) {
          publicWorkspaces.push({
            id: ws.id,
            slug: ws.slug || '',
            name: ws.name || '',
            description: ws.description || '',
            userId: ws.userId || '',
            updatedAt: ws.updatedAt || '',
            thumbnailAt: ws.thumbnailAt || null,
          });
          console.log(`  ✓ ${ws.name} (${ws.id}) — public`);
        }
      } catch (err) {
        console.log(`  ✗ ${key} — failed to read`);
      }
    }

    // Sort by updatedAt descending
    publicWorkspaces.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    console.log(`\nFound ${publicWorkspaces.length} public workspaces`);

    if (dryRun) {
      console.log('\nDry run results:');
      console.log(JSON.stringify(publicWorkspaces, null, 2));
      return;
    }

    // Write to KV
    const value = JSON.stringify(publicWorkspaces);
    execSync(
      `echo '${value.replace(/'/g, "'\\''")}' | wrangler kv key put --namespace-id ${namespaceId} "public:workspaces" --path -`,
      { encoding: 'utf-8' },
    );

    console.log('\nWrote public:workspaces index to KV');
    console.log('Done!');
  });

program.parse();

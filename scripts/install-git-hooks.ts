import { execSync } from 'node:child_process';
import { chmodSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Command } from 'commander';

function installHook(hooksDir: string, name: string): void {
  const shim = `#!/bin/sh
npx tsx scripts/git-hooks/${name}.ts "$@"
`;
  const dest = join(hooksDir, name);
  writeFileSync(dest, shim);
  chmodSync(dest, 0o755);
  console.log(`Installed hook: ${name}`);
}

const program = new Command();
program
  .name('install-git-hooks')
  .description('Install git hooks from scripts/git-hooks/')
  .action(() => {
    const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
    const hooksDir = join(repoRoot, '.git', 'hooks');

    if (!existsSync(hooksDir)) {
      console.error('Error: .git/hooks not found. Are you in a git repository?');
      process.exit(1);
    }

    installHook(hooksDir, 'pre-commit');
    installHook(hooksDir, 'post-commit');
  });
program.parse();

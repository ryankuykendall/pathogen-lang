import { execSync } from 'node:child_process';

import { Command } from 'commander';

const program = new Command();
program
  .name('post-commit')
  .description('Remind to update CHANGELOG.md after commits')
  .action(() => {
    try {
      execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe' });
    } catch {
      return;
    }

    try {
      const files = execSync('git diff-tree --no-commit-id --name-only -r HEAD', { encoding: 'utf-8' });
      if (!files.includes('CHANGELOG.md')) {
        console.log('\nReminder: consider updating CHANGELOG.md for this commit.\n');
      }
    } catch {
      // Silently ignore errors
    }
  });
program.parse();

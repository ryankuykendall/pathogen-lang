import { execSync } from 'node:child_process';

import { Command } from 'commander';

const WATCHED_SRC_PATTERNS: RegExp[] = [
  /^src\/evaluator\//,
  /^src\/stdlib\//,
  /^src\/parser\//,
  /^src\/api-surface\.ts$/,
];

const DOC_PATTERNS: RegExp[] = [
  /^docs\/.+\.md$/,
  /^scripts\/build-docs\.ts$/,
];

function getStagedFiles(): string[] {
  try {
    return execSync('git diff --cached --name-only --diff-filter=ACMR', { encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function stagedDiffAddsPublicApi(): boolean {
  try {
    const diff = execSync('git diff --cached --unified=0', { encoding: 'utf-8' });
    // Added lines start with "+" but not "+++" (file header). Match new exports,
    // which are the strongest signal of a new public API surface.
    return /^\+(?!\+\+)[^\n]*\bexport\s+(?:function|const|let|var|class|interface|type|enum|default|async\s+function)\b/m.test(diff);
  } catch {
    return false;
  }
}

const program = new Command();
program
  .name('pre-commit')
  .description('Warn when public-API additions in src/ are not accompanied by user-facing docs changes')
  .action(() => {
    try {
      execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe' });
    } catch {
      return;
    }

    try {
      const staged = getStagedFiles();
      if (staged.length === 0) return;

      const watchedStaged = staged.filter((f) => WATCHED_SRC_PATTERNS.some((re) => re.test(f)));
      if (watchedStaged.length === 0) return;

      const touchesDocs = staged.some((f) => DOC_PATTERNS.some((re) => re.test(f)));
      if (touchesDocs) return;

      if (!stagedDiffAddsPublicApi()) return;

      console.log('');
      console.log('\u26a0  pre-commit warning: public-API additions without docs changes');
      console.log('');
      console.log('  This commit adds new `export` declarations in src/ but does not touch');
      console.log('  any file in docs/ or scripts/build-docs.ts.');
      console.log('');
      console.log('  Project policy requires user-facing developer documentation for every');
      console.log('  new public API:');
      console.log('    - .claude/CLAUDE.md \u2192 Quality Standard');
      console.log('    - .claude/CLAUDE.md \u2192 docs/ vs project-docs/');
      console.log('    - src/CLAUDE.md \u2192 Development Lifecycle step 1');
      console.log('');
      console.log('  project-docs/ demos, primers, and plans do NOT satisfy this requirement.');
      console.log('  A feature is not shippable without a published docs/<feature>.md page');
      console.log('  registered in scripts/build-docs.ts DOC_FILES.');
      console.log('');
      console.log('  Watched files staged in this commit:');
      for (const f of watchedStaged) console.log(`    ${f}`);
      console.log('');
      console.log('  If this is a pure internal refactor or bug fix, proceed with:');
      console.log('    git commit --no-verify');
      console.log('');
      // Warning only — do not block the commit.
    } catch {
      // Never block a commit due to hook errors.
    }
  });
program.parse();

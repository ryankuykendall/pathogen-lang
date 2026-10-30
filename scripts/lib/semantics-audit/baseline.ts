/**
 * The "old" evaluator for the semantics audit: `src/` at a given commit,
 * exported with `git archive` into tmp/semantics-audit/<sha>/ and imported
 * from there. Nothing is checked out and no branch is made; node_modules
 * resolves upward from tmp/ to the project's own.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type PathogenModule = typeof import('../../../src/index');

export const AUDIT_DIR = join('tmp', 'semantics-audit');

function run(command: string, args: string[]): string {
  const out = spawnSync(command, args, { encoding: 'utf-8' });
  if (out.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${out.stderr.trim() || `exit ${out.status}`}`);
  }
  return out.stdout.trim();
}

/** The full commit id a ref names. */
export function resolveCommit(ref: string): string {
  return run('git', ['rev-parse', '--verify', `${ref}^{commit}`]);
}

/** Export `src/` at `commit` (once) and import its library entry. */
export async function loadBaseline(commit: string): Promise<PathogenModule> {
  const dir = join(AUDIT_DIR, commit);
  const entry = join(dir, 'src', 'index.ts');
  if (!existsSync(entry)) {
    mkdirSync(AUDIT_DIR, { recursive: true });
    const tar = join(AUDIT_DIR, `${commit}.tar`);
    run('git', ['archive', '-o', tar, `--prefix=${commit}/`, commit, 'src']);
    run('tar', ['-xf', tar, '-C', AUDIT_DIR]);
  }
  return (await import(pathToFileURL(resolve(entry)).href)) as PathogenModule;
}

/**
 * Import the library entry of a folder holding a `src/` tree: a snapshot of
 * the change under audit, so edits made elsewhere during a run can't leak in.
 */
export async function loadFromDir(dir: string): Promise<PathogenModule> {
  const entry = join(dir, 'src', 'index.ts');
  if (!existsSync(entry)) throw new Error(`--after-dir: ${entry} does not exist`);
  return (await import(pathToFileURL(resolve(entry)).href)) as PathogenModule;
}

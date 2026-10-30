/**
 * Every Pathogen program the repository holds, for the semantics audit:
 * blog samples, Pathogen fences in the docs and blog posts, project-docs
 * programs, the playground's templates and the VS Code fixtures.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { isPathogenFence, markdownFences } from '../markdown-fences';

export const ORIGINS = ['samples', 'docs', 'blog', 'project-docs', 'examples', 'fixtures'] as const;
/** `probes` are extra files named on the command line, tracked or not. */
export type Origin = (typeof ORIGINS)[number] | 'probes';

export interface Program {
  /** Stable id: a file path, `file.md:line` for a fence, `examples:name` for a template. */
  id: string;
  origin: Origin;
  source: string;
  /** The file on disk, when the program is a whole file (its folder anchors @font paths). */
  file?: string;
}

function tracked(pathspec: string): string[] {
  const out = spawnSync('git', ['ls-files', '--', pathspec], { encoding: 'utf-8' });
  if (out.status !== 0) throw new Error(`git ls-files ${pathspec} failed: ${out.stderr.trim()}`);
  return out.stdout.split('\n').filter(Boolean);
}

function files(origin: Origin, pathspec: string): Program[] {
  return tracked(pathspec).map((file) => ({ id: file, origin, file, source: readFileSync(file, 'utf-8') }));
}

function fences(origin: Origin, pathspec: string): Program[] {
  const programs: Program[] = [];
  for (const file of tracked(pathspec)) {
    if (basename(file) === 'CLAUDE.md') continue;
    for (const fence of markdownFences(readFileSync(file, 'utf-8'))) {
      if (!isPathogenFence(fence.info) || !fence.body.trim()) continue;
      programs.push({ id: `${file}:${fence.line}`, origin, source: fence.body });
    }
  }
  return programs;
}

async function examples(): Promise<Program[]> {
  const mod = await import('../../../playground/utils/examples');
  const programs: Program[] = [
    { id: 'examples:emptyBoilerplate', origin: 'examples', source: mod.emptyBoilerplate },
    { id: 'examples:defaultCode', origin: 'examples', source: mod.defaultCode },
  ];
  for (const [name, source] of Object.entries(mod.examples)) {
    programs.push({ id: `examples:${name}`, origin: 'examples', source });
  }
  return programs;
}

/** Programs named directly, such as a step's positive controls before they are committed. */
export function probes(paths: readonly string[]): Program[] {
  return paths.map((file) => ({ id: file, origin: 'probes', file, source: readFileSync(file, 'utf-8') }));
}

export async function collectCorpus(origins: ReadonlySet<Origin>): Promise<Program[]> {
  const programs: Program[] = [];
  // git pathspecs: `*` matches across folders, so these reach nested files.
  if (origins.has('samples')) programs.push(...files('samples', 'website/blog/samples/*.pathogen'));
  if (origins.has('docs')) programs.push(...fences('docs', 'docs/*.md'));
  if (origins.has('blog')) programs.push(...fences('blog', 'website/blog/*.md'));
  if (origins.has('project-docs')) programs.push(...files('project-docs', 'project-docs/*.pathogen'));
  if (origins.has('examples')) programs.push(...(await examples()));
  if (origins.has('fixtures')) programs.push(...files('fixtures', 'packages/vscode-pathogen/test-fixtures/*.pathogen'));
  return programs;
}

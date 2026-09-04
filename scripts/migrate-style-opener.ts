/**
 * One-off codemod: rewrite the style-block opener `${ … }` → `#{ … }`
 * across the corpus, driven by the frozen pre-change grammar (see
 * scripts/lib/legacy-style-opener.ts for the mechanism and its guards).
 *
 * Dry run by default; `--write` applies. Emits a per-file report
 * (`--report <file.json>`) whose `review` entries — openers rewritten next
 * to a parse error — and `skipped` entries want a human look.
 *
 * Default paths cover the EXECUTABLE corpus: published docs, blog posts and
 * their samples, guidelines, tests, playground, scripts, VS Code fixtures.
 * `src/` and the snippet files are hand-edited (they carry `${1:…}` snippet
 * placeholders that look like openers); `project-docs/*.md` are historical
 * records and are left alone unless passed explicitly — their `.pathogen`
 * demos ARE migrated so they keep compiling.
 *
 * Usage:
 *   tsx scripts/migrate-style-opener.ts                       # dry run
 *   tsx scripts/migrate-style-opener.ts --write --report out.json
 *   tsx scripts/migrate-style-opener.ts --paths docs website/blog --write
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

import { buildLegacyParser, rewriteMarkdown, rewritePathogenFile, rewriteTypeScript } from './lib/legacy-style-opener';

import type { FileReport } from './lib/legacy-style-opener';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_PATHS = [
  'docs',
  'website/blog',
  'website/guidelines',
  'project-docs',
  'tests',
  'playground',
  'scripts',
  'packages/vscode-pathogen/test-fixtures',
];

/** Directory names never descended into (dependency, build, and scratch dirs). */
const SKIP_DIRS = new Set([
  ['node', 'modules'].join('_'),
  'dist',
  'public',
  '.git',
  '.wrangler',
  'tmp',
  'legacy-style-opener',
]);
/** Files that hold snippet placeholders, generated content, or the codemod itself. */
const SKIP_FILES = new Set([
  'playground/utils/cm-completion-bridge.ts',
  'playground/utils/blog-content.js',
  'playground/utils/docs-content.js',
  'scripts/migrate-style-opener.ts',
  'scripts/lib/legacy-style-opener.ts',
  'tests/migrate-style-opener.test.ts',
]);

type Kind = 'pathogen' | 'md' | 'ts';

function kindOf(rel: string, includeProjectDocsMd: boolean): Kind | null {
  const ext = extname(rel);
  if (ext === '.pathogen') return 'pathogen';
  if (ext === '.md') {
    if (rel.startsWith('project-docs/') && !includeProjectDocsMd) return null;
    return 'md';
  }
  if (ext === '.ts' || ext === '.js') return 'ts';
  return null;
}

function walk(abs: string, out: string[]): void {
  if (!existsSync(abs)) {
    console.warn(`  (skipping missing path ${relative(ROOT, abs)})`);
    return;
  }
  const st = statSync(abs);
  if (st.isFile()) {
    out.push(abs);
    return;
  }
  for (const entry of readdirSync(abs)) {
    if (SKIP_DIRS.has(entry)) continue;
    walk(join(abs, entry), out);
  }
}

function rewriteByKind(
  kind: Kind,
  source: string,
  rel: string,
  parser: ReturnType<typeof buildLegacyParser>,
): { text: string; report: FileReport } {
  if (kind === 'pathogen') return rewritePathogenFile(source, parser);
  if (kind === 'md') return rewriteMarkdown(source, parser);
  return rewriteTypeScript(source, parser, rel);
}

interface Summary {
  files: number;
  changed: number;
  rewritten: number;
  review: number;
  skipped: number;
}

const program = new Command();
program
  .name('migrate-style-opener')
  .description(
    'Rewrite Pathogen style-block openers from the legacy dollar-brace form to #{ … } using the frozen pre-change grammar',
  )
  .option('--write', 'apply the rewrite (default: dry run)')
  .option('--report <file>', 'write a JSON report of every touched file')
  .option('--paths <paths...>', 'files or directories to process (relative to the repo root)', DEFAULT_PATHS)
  .option(
    '--include-project-docs-md',
    'also rewrite fences in project-docs/**/*.md (historical records; off by default)',
  )
  .option('--verbose', 'list every changed file')
  .action(
    (opts: {
      write?: boolean;
      report?: string;
      paths: string[];
      includeProjectDocsMd?: boolean;
      verbose?: boolean;
    }) => {
      const parser = buildLegacyParser();
      const files: string[] = [];
      for (const p of opts.paths) walk(join(ROOT, p), files);

      const summary: Summary = { files: 0, changed: 0, rewritten: 0, review: 0, skipped: 0 };
      const reports: Record<string, FileReport & { changed: boolean }> = {};
      const seen = new Set<string>();

      for (const abs of files) {
        const rel = relative(ROOT, abs);
        if (seen.has(rel) || SKIP_FILES.has(rel)) continue;
        seen.add(rel);
        const kind = kindOf(rel, Boolean(opts.includeProjectDocsMd));
        if (!kind) continue;
        const source = readFileSync(abs, 'utf-8');
        if (!source.includes('${')) continue;
        summary.files++;
        const result = rewriteByKind(kind, source, rel, parser);
        const changed = result.text !== source;
        if (changed || result.report.skipped.length > 0 || result.report.review.length > 0) {
          reports[rel] = { ...result.report, changed };
        }
        if (changed) {
          summary.changed++;
          summary.rewritten += result.report.rewritten;
          if (opts.verbose) console.log(`  ${rel}: ${result.report.rewritten} opener(s)`);
          if (opts.write) writeFileSync(abs, result.text);
        }
        summary.review += result.report.review.length;
        summary.skipped += result.report.skipped.length;
        for (const r of result.report.review) console.log(`  REVIEW  ${rel}:${r.line}  ${r.text ?? ''}`);
        for (const s of result.report.skipped) console.log(`  SKIP    ${rel}:${s.line}  ${s.reason}  ${s.text ?? ''}`);
      }

      console.log(
        `\n${opts.write ? 'Rewrote' : 'Would rewrite'} ${summary.rewritten} opener(s) in ${summary.changed} of ${summary.files} candidate file(s); ` +
          `${summary.review} to review, ${summary.skipped} unit(s) skipped.`,
      );
      if (opts.report) {
        writeFileSync(opts.report, JSON.stringify({ write: Boolean(opts.write), summary, files: reports }, null, 2));
        console.log(`Report: ${opts.report}`);
      }
      if (!opts.write) console.log('(dry run — pass --write to apply)');
    },
  );
program.parse();

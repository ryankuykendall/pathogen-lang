/**
 * Which programs DECLARE a given name — the collision check for a new
 * built-in (decision 21, project-docs/modules/05-phase-0a-audit.md §6).
 *
 * A program can't declare a built-in's name (docs/syntax.md "Built-in
 * names"), so adding a stdlib function, constructor, enum or namespace breaks
 * every program that already declares that name. Run this BEFORE adding one:
 *
 *   npx tsx scripts/check-builtin-collisions.ts --names wobble
 *   npx tsx scripts/check-builtin-collisions.ts --names wobble --kv-dir tmp/kv-sources/prod
 *
 * The repository corpus is the semantics audit's (blog samples, docs and blog
 * fences, project-docs, playground templates, VS Code fixtures). Stored
 * workspaces come from a read-only export (scripts/export-workspace-sources.ts;
 * production needs the user's go-ahead). With no --names, every current
 * built-in name is checked — the repository should then report none outside
 * project-docs records and docs examples marked `pathogen invalid`.
 *
 * Exits 1 when any program declares one of the names.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Command } from 'commander';

import { BUILTIN_NAMES } from '../src/builtin-names';
import { lezerParser } from '../src/parser';
import { bindingNodesAt } from '../src/parser/reserved-bindings';
import { collectCorpus, ORIGINS } from './lib/semantics-audit/corpus';

import type { Program } from './lib/semantics-audit/corpus';

interface Collision {
  id: string;
  name: string;
  line: number;
  text: string;
}

function declarationsOf(program: Program, names: ReadonlySet<string>): Collision[] {
  const out: Collision[] = [];
  const lines = program.source.split('\n');
  const cursor = lezerParser.parse(program.source).cursor();
  do {
    for (const { node } of bindingNodesAt(cursor)) {
      const name = program.source.slice(node.from, node.to);
      if (!names.has(name)) continue;
      const line = program.source.slice(0, node.from).split('\n').length;
      out.push({ id: program.id, name, line, text: lines[line - 1].trim() });
    }
  } while (cursor.next());
  return out;
}

const program = new Command();
program
  .name('check-builtin-collisions')
  .description('List programs that declare the given names (the collision check before adding a built-in).')
  .option('--names <list>', 'comma-separated names to look for (default: every current built-in name)')
  .option('--kv-dir <dir>', 'also check an exported KV folder (scripts/export-workspace-sources.ts)')
  .option('--no-repo', 'skip the repository corpus')
  .action(async (opts: { names?: string; kvDir?: string; repo: boolean }) => {
    const names = new Set(
      opts.names
        ? opts.names
            .split(',')
            .map((n) => n.trim())
            .filter(Boolean)
        : BUILTIN_NAMES.keys(),
    );
    const programs: Program[] = opts.repo ? await collectCorpus(new Set(ORIGINS)) : [];
    if (opts.kvDir) {
      for (const f of readdirSync(opts.kvDir)
        .filter((f) => f.endsWith('.pathogen'))
        .sort()) {
        const file = join(opts.kvDir, f);
        programs.push({ id: file, origin: 'probes', file, source: readFileSync(file, 'utf-8') });
      }
    }

    const collisions = programs.flatMap((p) => declarationsOf(p, names));
    const byName = new Map<string, number>();
    for (const c of collisions) byName.set(c.name, (byName.get(c.name) ?? 0) + 1);

    console.log(`${programs.length} programs checked for ${names.size} name(s).`);
    if (collisions.length === 0) {
      console.log('No program declares any of them.');
      return;
    }
    const files = new Set(collisions.map((c) => c.id.replace(/:\d+$/, '')));
    console.log(`${collisions.length} declaration(s) in ${files.size} file(s):`);
    for (const [name, count] of [...byName].sort((a, b) => b[1] - a[1])) console.log(`  ${name}: ${count}`);
    console.log('');
    for (const c of collisions) console.log(`${c.id}:${c.line}  ${c.name}  ${c.text}`);
    process.exitCode = 1;
  });
program.parse();

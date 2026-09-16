import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { Command } from 'commander';

import { formatDocument } from '../src/language-services/formatter';
import { getDiagnostics } from '../src/language-services/diagnostics';
import { DiagnosticSeverity } from '../src/language-services/types';
import { StringTextDocument } from '../src/language-services/document';

function applyEdits(source: string, edits: { range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }[]): string {
  if (edits.length === 0) return source;
  // formatDocument returns a single edit replacing the whole document.
  return edits[0].newText;
}

type Outcome = 'formatted' | 'unchanged' | { refused: string };

function formatFile(path: string): Outcome {
  const source = readFileSync(path, 'utf-8');
  const doc = new StringTextDocument(source);
  const edits = formatDocument(doc);
  if (edits.length === 0) {
    // The formatter returns no edits both for a clean file and for one it
    // refuses to touch (a parse error whose recovery would drop code).
    // Tell the two apart, so a refusal never reads as "already formatted".
    const error = getDiagnostics(doc).find((d) => d.severity === DiagnosticSeverity.Error);
    if (error) {
      return { refused: `parse error at line ${error.range.start.line + 1}: ${error.message}` };
    }
    return 'unchanged';
  }
  const formatted = applyEdits(source, edits);
  if (formatted === source) return 'unchanged';
  writeFileSync(path, formatted, 'utf-8');
  return 'formatted';
}

const program = new Command();
program
  .name('format-samples')
  .description('Run formatDocument() over every .pathogen file under a directory.')
  .argument('<dir>', 'Directory to scan (recursively)')
  .action((dir: string) => {
    const files: string[] = [];
    function walk(d: string): void {
      for (const entry of readdirSync(d)) {
        const p = join(d, entry);
        const s = statSync(p);
        if (s.isDirectory()) walk(p);
        else if (entry.endsWith('.pathogen')) files.push(p);
      }
    }
    walk(dir);

    let changed = 0;
    let unchanged = 0;
    let failed = 0;
    for (const f of files) {
      try {
        const outcome = formatFile(f);
        if (outcome === 'formatted') {
          console.log(`  formatted  ${f}`);
          changed++;
        } else if (outcome === 'unchanged') {
          console.log(`  unchanged  ${f}`);
          unchanged++;
        } else {
          console.log(`  REFUSED    ${f} — ${outcome.refused}`);
          failed++;
        }
      } catch (e) {
        console.log(`  FAILED     ${f} — ${(e as Error).message}`);
        failed++;
      }
    }
    console.log(`\nDone: ${changed} formatted, ${unchanged} unchanged, ${failed} failed (${files.length} total).`);
    if (failed > 0) process.exitCode = 1;
  });
program.parse();

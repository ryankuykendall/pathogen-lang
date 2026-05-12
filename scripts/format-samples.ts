import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { Command } from 'commander';

import { formatDocument } from '../src/language-services/formatter';
import { StringTextDocument } from '../src/language-services/document';

function applyEdits(source: string, edits: { range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }[]): string {
  if (edits.length === 0) return source;
  // formatDocument returns a single edit replacing the whole document.
  return edits[0].newText;
}

function formatFile(path: string): boolean {
  const source = readFileSync(path, 'utf-8');
  const doc = new StringTextDocument(source);
  const edits = formatDocument(doc);
  if (edits.length === 0) return false;
  const formatted = applyEdits(source, edits);
  if (formatted === source) return false;
  writeFileSync(path, formatted, 'utf-8');
  return true;
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
        if (formatFile(f)) {
          console.log(`  formatted  ${f}`);
          changed++;
        } else {
          console.log(`  unchanged  ${f}`);
          unchanged++;
        }
      } catch (e) {
        console.log(`  FAILED     ${f} — ${(e as Error).message}`);
        failed++;
      }
    }
    console.log(`\nDone: ${changed} formatted, ${unchanged} unchanged, ${failed} failed (${files.length} total).`);
  });
program.parse();

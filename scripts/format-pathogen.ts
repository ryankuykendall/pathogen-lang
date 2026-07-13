import { readFileSync, writeFileSync } from 'fs';
import { Command } from 'commander';
import { StringTextDocument } from '../src/language-services/document';
import { formatDocument } from '../src/language-services/formatter';
import { parseLezer } from '../src/parser';

/**
 * format-pathogen — CLI wrapper around the shared language-services formatter
 * (the same `formatDocument` used by the VS Code extension and playground).
 *
 * Usage:
 *   npx tsx scripts/format-pathogen.ts <file...> [--check]
 *   npm run format:pathogen -- website/blog/samples/post27/*.pathogen
 *
 * With --check, exits 1 if any file is unformatted (writes nothing).
 */
const program = new Command();
program
  .name('format-pathogen')
  .description('Format .pathogen files using the shared language-services formatter')
  .argument('<files...>', 'Pathogen source files to format')
  .option('--check', 'Check only; exit 1 if any file would change', false)
  .action(async (files: string[], opts: { check: boolean }) => {
    let changed = 0;
    let failed = 0;
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const edits = formatDocument(new StringTextDocument(source));
      if (edits.length === 0) {
        // Empty edits means EITHER "already formatted" or "unparseable" —
        // disambiguate with a recovery parse.
        try {
          parseLezer(source);
          console.log(`  = ${file} (already formatted)`);
        } catch {
          console.error(`  ✗ ${file} — cannot format (parse error)`);
          failed++;
        }
        continue;
      }
      const formatted = edits[0].newText;
      changed++;
      if (opts.check) {
        console.log(`  ! ${file} (needs formatting)`);
      } else {
        writeFileSync(file, formatted);
        console.log(`  ✓ ${file} (formatted)`);
      }
    }
    if (failed > 0 || (opts.check && changed > 0)) process.exit(1);
  });
program.parse();

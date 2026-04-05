// Compare Parsimmon vs Lezer error positions for known-bad inputs
import Parsimmon from 'parsimmon';
import { parser as lezerParser } from '../src/parser/pathogen.generated.ts';

// Import the Parsimmon program parser
// (it's deep in index.ts — we'll import the full module)
import '../src/parser/index.ts';

const badInputs = [
  'let x = 10',                           // Missing ; after let
  'let x = 10\nM x 0',                    // Missing ; before path command
  'let x = 10;\ny = 5\nM 0 0',            // Missing ; after assignment
  'fn test() { return 10 }',              // Missing ; after return
  'for (i in 0..5) { M i 0',              // Unclosed brace
  'let x = 10;\nlet y = 20',              // Missing ; (second)
  'M calc(undefinedVar + 1) 0',           // Valid (should NOT error)
];

for (const input of badInputs) {
  // Lezer error position
  const tree = lezerParser.parse(input);
  const cur = tree.cursor();
  let lezerErr = 'none';
  do {
    if (cur.type.isError) {
      const before = input.slice(0, cur.from);
      const lines = before.split('\n');
      lezerErr = `L${lines.length}:${lines[lines.length-1].length+1} (offset ${cur.from})`;
      break;
    }
  } while (cur.next());

  console.log(`"${input.substring(0, 40).replace(/\n/g, '\\n')}"`);
  console.log(`  Lezer: ${lezerErr}`);
}

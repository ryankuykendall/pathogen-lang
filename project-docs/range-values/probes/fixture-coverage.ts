// Which grammar node types / keywords does the all-syntax fixture NOT exercise?
// Run: npx tsx project-docs/range-values/probes/fixture-coverage.ts
import { readFileSync } from 'node:fs';
import { lezerParser } from '../../../src/parser';

const src = readFileSync('packages/vscode-pathogen/test-fixtures/all-syntax.pathogen', 'utf8');
const seen = new Set<string>();
let errors = 0;
lezerParser.parse(src).iterate({ enter(n) { if (n.type.isError) errors++; seen.add(n.name); } });

const all = lezerParser.nodeSet.types.filter((t) => !t.isError && !t.isAnonymous && t.name !== '').map((t) => t.name);
const named = [...new Set(all)].filter((n) => /^[A-Z]/.test(n));
const words = [...new Set(all)].filter((n) => /^[a-z]\w*$/.test(n));
console.log('error nodes in fixture:', errors);
console.log(`Capitalized node types: ${named.length}; missing from fixture:`, named.filter((n) => !seen.has(n)));
console.log(`word-like node types: ${words.length}; missing:`, words.filter((n) => !seen.has(n)));

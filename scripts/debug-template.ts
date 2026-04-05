import { parser } from '../src/parser/pathogen.generated.ts';
import { buildAST } from '../src/parser/ast-builder.ts';

// Test template with interpolation
const src = 'log(`The answer is ${x}`);';
const tree = parser.parse(src);

// Show tree
const cursor = tree.cursor();
function walk(d: number) {
  do {
    const t = src.slice(cursor.from, cursor.to).substring(0, 40);
    console.log('  '.repeat(d) + cursor.name + '[' + cursor.from + '-' + cursor.to + '] «' + t + '»');
    if (cursor.firstChild()) { walk(d + 1); cursor.parent(); }
  } while (cursor.nextSibling());
}
console.log('=== Tree ===');
cursor.firstChild(); walk(0);

// Show AST
console.log('\n=== AST ===');
const ast = buildAST(tree, src);
const stmt = (ast.body[0] as any);
const tmplArg = stmt.args?.[0];
console.log('template:', JSON.stringify(tmplArg, (k, v) => k === 'loc' ? undefined : v, 2));

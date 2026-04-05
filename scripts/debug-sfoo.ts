import { parser } from '../src/parser/pathogen.generated.ts';

const src = "let s = `hello`;\ns.foo()";
const tree = parser.parse(src);
const cursor = tree.cursor();
function walk(d: number) {
  do {
    console.log('  '.repeat(d) + cursor.name + '[' + cursor.from + '-' + cursor.to + '] «' + src.slice(cursor.from, cursor.to).substring(0, 30) + '»');
    if (cursor.firstChild()) { walk(d + 1); cursor.parent(); }
  } while (cursor.nextSibling());
}
cursor.firstChild(); walk(0);

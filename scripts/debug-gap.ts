import { parser } from '../src/parser/pathogen.generated.ts';

function showTree(src: string) {
  console.log('=== ' + src.substring(0, 50) + ' ===');
  const tree = parser.parse(src);
  const cursor = tree.cursor();
  function walk(d: number) {
    do {
      const t = src.slice(cursor.from, cursor.to).substring(0, 30);
      console.log('  '.repeat(d) + cursor.name + '[' + cursor.from + '-' + cursor.to + '] «' + t + '»');
      if (cursor.firstChild()) { walk(d + 1); cursor.parent(); }
    } while (cursor.nextSibling());
  }
  cursor.firstChild(); walk(0);
  console.log();
}

showTree('circle(50, 50, 20)');
showTree('fn draw(a, b, c) { M a b }');
showTree('@font "Inter";');

import { parser } from '../src/parser/pathogen.generated.ts';

function dumpTree(label: string, source: string) {
  console.log('=== ' + label + ' ===');
  const tree = parser.parse(source);
  const cursor = tree.cursor();
  function walk(d: number) {
    do {
      const text = source.slice(cursor.from, cursor.to).replace(/\n/g, '\\n').substring(0, 40);
      console.log('  '.repeat(d) + cursor.name + '[' + cursor.from + '-' + cursor.to + '] «' + text + '»');
      if (cursor.firstChild()) { walk(d + 1); cursor.parent(); }
    } while (cursor.nextSibling());
  }
  cursor.firstChild(); walk(0); console.log();
}

dumpTree('let + expr', 'let x = 10 + 20;');
dumpTree('let destructure', 'let [a, b] = arr;');
dumpTree('assignment', 'x = 42;');
dumpTree('for range', 'for (i in 0..5) { M i 0 }');
dumpTree('if/else', 'if (x > 0) { M 1 0 } else { M 0 0 }');
dumpTree('function', 'fn draw(cx, cy) { circle(cx, cy, 50) }');
dumpTree('enum', 'enum Dir { UP, DOWN }');
dumpTree('path commands', 'M 10 20 L 30 40 Z');
dumpTree('ternary', 'let x = a > 0 ? a : 0;');
dumpTree('array', 'let arr = [1, 2, 3];');
dumpTree('object', 'let obj = { x: 10, y: 20 };');
dumpTree('return', 'fn f() { return 42; }');
dumpTree('unary', 'let neg = -x;');
dumpTree('member access', 'ctx.position.x;');
dumpTree('index access', 'arr[0];');
dumpTree('func call expr', 'let r = circle(50, 50, 25);');
dumpTree('color', 'let c = #ff0000;');

// Temporary probe for the lambda grammar change — dumps CSTs for the
// spike corpus. Safe to delete after lambdas land.
import { parser } from '../src/parser/pathogen.generated';

const probes: Array<[string, string]> = [
  ['lambda in let', 'let f = {|a, b| return a + b; };'],
  ['zero-param lambda', 'let g = {|| return 1; };'],
  ['suffix block unchanged', 'foo(1) {|x| L x 0}'],
  ['method suffix unchanged', 'let y = list.map {|item| return item; };'],
  ['nested lambda stmt', 'let h = {|a| let k = {|b| return b; }; return k; };'],
  ['empty object', 'let x = {};'],
  ['shorthand object', 'let x = {a};'],
  ['object literal', 'let x = {a: 1};'],
  ['lambda as argument', 'let z = items.map({|v| return v * 2; });'],
];

for (const [name, src] of probes) {
  const tree = parser.parse(src);
  let out = '';
  let depth = 0;
  let hasError = false;
  tree.iterate({
    enter(node) {
      if (node.type.isError) hasError = true;
      out += '  '.repeat(depth) + node.name + ' «' + src.slice(node.from, node.to).replace(/\n/g, '\\n') + '»\n';
      depth++;
    },
    leave() { depth--; },
  });
  console.log(`=== ${name}${hasError ? '  ⚠ ERROR NODE' : ''} ===`);
  console.log(out);
}

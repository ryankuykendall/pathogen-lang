import { parser as spike } from './spike/parser';
import { parser as baseline } from './baseline/parser';

function show(p: any, src: string): { tree: string; errors: number } {
  const tree = p.parse(src);
  let out = '';
  let errors = 0;
  let depth = 0;
  tree.iterate({
    enter(n: any) {
      if (n.type.isError) errors++;
      const leaf = n.node.firstChild === null;
      out += `${'  '.repeat(depth)}${n.type.isError ? '⚠ERROR' : n.name}${leaf ? ` «${src.slice(n.from, n.to)}»` : ''}\n`;
      depth++;
    },
    leave() { depth--; },
  });
  return { tree: out, errors };
}

const cases: Array<[string, string]> = [
  ['target', 'let items = (1..100).map() {|index|\n  return index * 2;\n};'],
  ['half-open + no-paren method', 'let evens = (0..<20).filter {|n| n % 2 == 0};'],
  ['bare value', 'let r = (1..5);'],
  ['expr bounds', 'let ys = (first[0]..limits.max + 1);'],
  ['member', 'let n = (1..5).length;'],
  ['index', 'let v = (1..5)[0];'],
  ['spread', 'let padded = [0, ...(1..3), 99];'],
  ['call arg', 'foo((1..5));'],
  ['worker', 'let d = (1..5).map() << double;'],
  ['for-each over range value', 'for ([value, i] in (10..12)) { log(value); }'],
  ['for header unchanged', 'for (i in 1..5) { log(i); }'],
  ['for header paren bounds', 'for (i in (a)..(b)) { log(i); }'],
  ['case arm unchanged', 'switch (x) { case 1..5 { log(1); } case 100.. { log(2); } case ..<0 { log(3); } default { log(4); } }'],
  ['case paren range', 'switch (x) { case (1..5) { log(1); } default { log(4); } }'],
  ['switch expr arm', 'let s = switch (x) { case 0..<10 { 1 } default { 2 } };'],
  ['nested', 'let grid = (0..<3).map() {|row| return (0..<3).map() {|col| return row * 3 + col; }; };'],
  ['ternary bound', 'let t = (0..(big ? 10 : 5));'],
  ['calc', 'let c = calc((1..5).length * 2);'],
  ['template', 'let s = `n=${(1..3).length}`;'],
  ['unary', 'let u = -(1..5).length;'],
  ['paren expr still ok', 'let p = (1 + 2) * 3;'],
  ['trailing block after range (no method)', 'let w = (1..5) {|x| x};'],
  ['text body', 'text(0, 0) { for (i in 1..3) { tspan(`${i}`); } }'],
  ['BAD bare let', 'let bad = 1..5;'],
  ['BAD open upper', 'let bad = (1..);'],
  ['BAD open lower', 'let bad = (..5);'],
  ['BAD call arg', 'foo(1..5);'],
];

const verbose = new Set(process.argv.slice(2));
for (const [label, src] of cases) {
  const s = show(spike, src);
  const b = show(baseline, src);
  const mustFail = label.startsWith('BAD');
  const ok = mustFail ? s.errors > 0 : s.errors === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${label}]  spikeErrors=${s.errors} baselineErrors=${b.errors}${!mustFail && b.errors === 0 && s.tree !== b.tree ? '  (tree differs from baseline)' : ''}`);
  if (verbose.has(label) || verbose.has('all') || !ok) console.log(s.tree);
}

// Dumps the Lezer error-node context for every bare-range misspelling, so
// describeBareRange (src/parser/range-value-errors.ts) can be written against
// what recovery actually produces. Run: npx tsx project-docs/range-values/probes/error-shapes.ts
import { lezerParser } from '../../../src/parser';

const cases = [
  'let steps = 1..5;',
  'let steps = 0..<count;',
  'log(1..5);',
  'let list = [1..5];',
  'fn make() { return 1..5; }',
  'let steps = 0; steps = 1..5;',
  'let doubled = 1..5.map {|v| return v; };',
  'let bad = (1..);',
  'let bad = (..5);',
  'let bad = (1...5);',
  'for ([v, i] in 10..12) { M v i }',
  'let t = cond ? 1..5 : 0;',
  // parenthesized OPEN-ENDED case patterns (code review finding #1)
  'switch (t) { case (100..) { M 1 1 } default { M 0 0 } }',
  'switch (t) { case (..5) { M 1 1 } default { M 0 0 } }',
  'switch (t) { case (..<0) { M 1 1 } default { M 0 0 } }',
  'let band = switch (t) { case (100..) { 1 } default { 0 } };',
  'switch (t) { case pick((1..)) { M 1 1 } default { M 0 0 } }',
];

for (const src of cases) {
  const tree = lezerParser.parse(src);
  console.log(`\n── ${src}`);
  tree.iterate({
    enter(n) {
      if (!n.type.isError) return;
      const node = n.node;
      const kids: string[] = [];
      for (let c = node.firstChild; c; c = c.nextSibling) kids.push(c.name);
      const chain: string[] = [];
      for (let a = node.parent; a; a = a.parent) chain.push(a.name);
      console.log(`     ancestors: ${chain.join(' < ')}`);
      console.log(
        `  ⚠ [${n.from},${n.to}] «${src.slice(n.from, n.to)}» parent=${node.parent?.name} prev=${node.prevSibling?.name}«${node.prevSibling ? src.slice(node.prevSibling.from, node.prevSibling.to) : ''}» next=${node.nextSibling?.name} kids=[${kids.join(',')}]`,
      );
    },
  });
}

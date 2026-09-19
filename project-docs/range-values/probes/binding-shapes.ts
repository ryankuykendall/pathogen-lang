// Dumps the Lezer tree around every binding form, so the static reserved-name
// check (src/parser/reserved-bindings.ts) is written against real shapes.
// Run: npx tsx project-docs/range-values/probes/binding-shapes.ts
import { lezerParser } from '../../../src/parser';

const cases = [
  'let { rad, a: deg, ...pi } = o;',
  'switch (p) { case [rad, x, ...deg] { M 0 0 } case { pi, y: rad, ...deg } { M 1 1 } default { M 2 2 } }',
  'enum AngleUnit { deg, rad = 2 }',
  'let f = {|deg, pi| return 1; };',
];
for (const src of cases) {
  console.log(`\n── ${src}`);
  let depth = 0;
  lezerParser.parse(src).iterate({
    enter(n) {
      const leaf = n.node.firstChild === null;
      if (depth > 0) console.log(`${'  '.repeat(depth)}${n.name}${leaf ? ` «${src.slice(n.from, n.to)}»` : ''}`);
      depth++;
    },
    leave() { depth--; },
  });
}

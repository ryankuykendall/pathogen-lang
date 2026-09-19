import { parser as spike } from './spike/parser';
import { parser as baseline } from './baseline/parser';

function outline(p: any, src: string): { text: string; errors: number; comments: string[] } {
  let text = '';
  let errors = 0;
  let depth = 0;
  const comments: string[] = [];
  p.parse(src).iterate({
    enter(n: any) {
      if (n.type.isError) errors++;
      if (n.name === 'Comment' || n.name === 'LineComment') comments.push(`${n.node.parent?.name}>${src.slice(n.from, n.to).trim()}`);
      const leaf = n.node.firstChild === null;
      text += `${'  '.repeat(depth)}${n.type.isError ? '⚠' : n.name}${leaf ? ` «${src.slice(n.from, n.to).slice(0, 24)}»` : ''}\n`;
      depth++;
    },
    leave() { depth--; },
  });
  return { text, errors, comments };
}

const cases: Array<[string, string]> = [
  ['USER: commented-out case clause', 'switch (x) {\n  case 1 {\n    M 0 0\n  }\n  // case 2 {\n  //   M 1 1\n  // }\n  default {\n    M 2 2\n  }\n}'],
  ['comment before first clause + after last', 'switch (x) {\n  // first\n  case 1 { M 0 0 }\n  // last\n}'],
  ['switch expression arms', 'let b = switch (y) {\n  // low\n  case ..<0 { 0 }\n  // rest\n  default { 1 }\n};'],
  ['array literal', 'let a1 = [\n  1, // first\n  // 2,\n  3,\n];'],
  ['object literal', 'let o1 = {\n  w: 1, // width\n  // k: 2,\n};'],
  ['call args', 'let v1 = clamp(\n  5, // value\n  0,\n  10\n);'],
  ['method chain', 'let s1 = [3, 1]\n  // sort it\n  .sort();'],
  ['text body', "text(0, 0) {\n  // heading\n  tspan()`a`\n  // tspan()`b`\n}"],
  ['enum members', 'enum Dir {\n  UP, // north\n  // DOWN,\n  LEFT\n}'],
  ['mid-statement', 'let x1 = // why\n  5;'],
  ['STATEMENT level (must match baseline placement)', '// top\nlet x1 = 1; // trailing\n// between\nM 0 0 // after path\nL 1 1\nfor (i in 0..2) {\n  // in block\n  M i 0\n}\n// end'],
  ['fn body + trailing block', 'fn f1(n) {\n  // body\n  return n;\n}\nlet r1 = [1].map {|n|\n  // block\n  return n;\n};'],
  ['path block', 'let p1 = @{\n  // start\n  m 0 0\n  l 5 5 // diag\n};'],
  ['NOT a comment: url in string/template/style', 'let u1 = "http://x.y";\nlet t1 = `a//b`;\nlet s2 = #{ fill: red; };'],
  ['division still works', 'let d1 = 6 / 2 / 3;'],
];

for (const [label, src] of cases) {
  const s = outline(spike, src);
  const b = outline(baseline, src);
  const same = b.errors === 0 && s.text.replace(/LineComment/g, 'C').replace(/Comment/g, 'C') === b.text.replace(/LineComment/g, 'C').replace(/Comment/g, 'C');
  console.log(`${s.errors === 0 ? 'OK  ' : 'ERR '} [${label}] spikeErrors=${s.errors} baselineErrors=${b.errors}${b.errors === 0 ? (same ? '  tree==baseline' : '  TREE DIFFERS FROM BASELINE') : ''}`);
  console.log(`      comments: ${s.comments.join(' | ')}`);
  if (process.argv.includes(label) || (b.errors === 0 && !same)) { console.log(s.text); console.log('--- baseline'); console.log(b.text); }
}

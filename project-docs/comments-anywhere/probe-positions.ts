// For each risky comment position: does it parse, does it MEAN the same as the
// comment-free program, and does the formatter keep every comment, keep the
// meaning, and stay idempotent?  Run: npx tsx project-docs/comments-anywhere/probe-positions.ts
import { compile } from '../../src';
import { StringTextDocument } from '../../src/language-services/document';
import { formatDocument } from '../../src/language-services/formatter';
import { lezerParser } from '../../src/parser';

const cases: Array<[string, string]> = [
  ['between } and else', 'let n = 0;\nif (n > 0) {\n  M 1 1\n}\n// otherwise\nelse {\n  M 2 2\n}'],
  ['between } and else if', 'let n = 0;\nif (n > 0) {\n  M 1 1\n} // first\nelse if (n == 0) {\n  M 2 2\n}'],
  ['before with / as clauses', 'M 0 0\nh 20\nv 20 // down\n  with fillet(3) // round it\n  as segment(\'side\')\nz'],
  ['inside a corner op call', 'M 0 0\nh 20\nv 20 with fillet( // radius\n  3)\nz'],
  ['between define and its style', "define PathLayer('a') // the outline\n  #{ stroke: #000; }\nlayer('a').apply { M 0 0 }"],
  ['between layer() and .apply', "define PathLayer('a') #{ stroke: #000; }\nlayer('a') // target\n  .apply {\n  M 5 5\n}"],
  ['inside for-each destructure', 'for ([item, // the value\n  index] in [7, 8]) {\n  M item index\n}'],
  ['first thing in fn / lambda / case / apply bodies', "define PathLayer('a') #{ stroke: #000; }\nfn f1(n) {\n  // body\n  return n;\n}\nlet g1 = {|n|\n  // lambda body\n  return n;\n};\nswitch (1) {\n  case 1 {\n    // in the case\n    M f1(1) g1(2)\n  }\n}\nlayer('a').apply {\n  // in apply\n  M 3 3\n}"],
  ['inside a template interpolation', 'let a1 = 1;\nlet b1 = 2;\nlog(`${a1 // first\n  + b1}`);\nM 0 0'],
  ['right after {|a, b|', 'let sum = [1, 2].reduce(0) {|acc, n| // accumulate\n  return acc + n;\n};\nM sum 0'],
  ['between block params', 'let sum = [1, 2].reduce(0) {|acc, // running\n  n|\n  return acc + n;\n};\nM sum 0'],
  ['between a call and its trailing block', 'let out = [1, 2].map() // per item\n  {|n| return n * 2; };\nM out[0] out[1]'],
  ['comment as the only content of a block', 'if (true) {\n  // nothing yet\n}\nM 0 0'],
  ['comment as the only content of a switch', 'switch (1) {\n  // no cases yet\n}\nM 0 0'],
  ['comment as the only content of an array', 'let empty = [\n  // nothing yet\n];\nM empty.length 0'],
  ['comment as the only content of a text body', "define TextLayer('t') #{ font-size: 10; }\nlayer('t').apply {\n  text(0, 0) {\n    // nothing yet\n  }\n}"],
  ['file that is only comments', '// one\n// two'],
  ['comment on the last line, no newline', 'M 0 0\n// end'],
  ['two statements on one line, second has an interior comment', 'M 0 0 let list = [ // c\n  1,\n];\nL list[0] 0'],
  ['tab-indented verbatim statement', 'if (true) {\n\tlet list = [\n\t\t1, // one\n\t\t2,\n\t];\n\tM list[0] 0\n}'],
  ['multi-line template inside a verbatim statement', 'if (true) {\n      let note = [ // keep\n        `line one\n   line two`,\n      ];\n      log(note[0]);\n}\nM 0 0'],
  ['verbatim statement two blocks deep', 'for (i in 0..1) {\n      if (true) {\n            let list = [\n              i, // the index\n            ];\n            M list[0] 0\n      }\n}'],
  ['switch expression with comments between arms', 'let band = switch (5) {\n      // negative\n  case ..<0 { 0 }\n  default { 1 }\n};\nM band 0'],
  ['comment inside the switch discriminant', 'switch (1 // the mode\n) {\n  case 1 {\n    M 1 1\n  }\n}'],
  ['comment between switch(...) and {', 'switch (1) // pick\n{\n  case 1 {\n    M 1 1\n  }\n}'],
  ['calc with an interior comment', 'let a1 = 1;\nM calc(a1 // plus\n  + 2) 0'],
  ['CRLF line endings', 'let list = [\r\n  1, // one\r\n  2,\r\n];\r\nM list[0] 0\r\n'],
];

const strip = (src: string): string => {
  // remove comments using the parse tree (never touches strings/templates)
  const cuts: Array<[number, number]> = [];
  const cur = lezerParser.parse(src).cursor();
  do { if (cur.name === 'LineComment') cuts.push([cur.from, cur.to]); } while (cur.next());
  let out = src;
  for (const [from, to] of cuts.reverse()) out = out.slice(0, from) + out.slice(to);
  return out;
};
const comments = (src: string): string[] => {
  const found: string[] = [];
  const cur = lezerParser.parse(src).cursor();
  do { if (cur.name === 'LineComment') found.push(src.slice(cur.from, cur.to).trimEnd()); } while (cur.next());
  return found;
};
const meaning = (src: string): string => {
  try {
    const r = compile(src);
    return JSON.stringify([r.layers.map((l: any) => [l.name, l.data ?? null, l.textElements ?? null]), r.logs.map((e) => e.parts.map((p) => p.value).join(''))]);
  } catch (e) {
    return 'ERROR: ' + (e as Error).message.slice(0, 110);
  }
};

let problems = 0;
for (const [label, src] of cases) {
  const notes: string[] = [];
  const withC = meaning(src);
  const without = meaning(strip(src));
  if (withC.startsWith('ERROR')) notes.push(`does not compile: ${withC}`);
  else if (withC !== without) notes.push('MEANING DIFFERS from the comment-free program');
  if (!withC.startsWith('ERROR')) {
    const edits = formatDocument(new StringTextDocument(src));
    const out = edits.length ? edits[0].newText : src;
    if (JSON.stringify(comments(out)) !== JSON.stringify(comments(src))) notes.push(`formatter changed the comments: ${JSON.stringify(comments(out))}`);
    if (meaning(out) !== withC) notes.push('formatter changed the MEANING');
    if (formatDocument(new StringTextDocument(out)).length !== 0) notes.push('formatter is not idempotent');
    if (edits.length === 0 && out !== src) notes.push('?');
    if (process.argv.includes('-v')) console.log(`--- ${label}\n${out}`);
  }
  problems += notes.length;
  console.log(`${notes.length ? 'PROBLEM' : 'ok     '} ${label}${notes.length ? '\n          ' + notes.join('\n          ') : ''}`);
}
console.log(`\n${problems} problem(s)`);

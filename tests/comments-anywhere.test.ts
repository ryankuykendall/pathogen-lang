import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { getDiagnostics } from '../src/language-services/diagnostics';
import { StringTextDocument } from '../src/language-services/document';
import { formatDocument } from '../src/language-services/formatter';
import { analyzeScopes } from '../src/language-services/scope-analysis';
import { lezerParser, parse } from '../src/parser';
import { pathArgCommentRanges } from '../src/parser/path-args-tokenizer';
import { compilePath } from './helpers';

// A `//` comment is trivia: legal anywhere whitespace is. It used to be a
// STATEMENT (the `Comment` token outranked the skipped `LineComment`, which
// therefore never fired), so a comment between the cases of a switch, inside a
// multi-line array / object / argument list, in a method chain or in a text
// body was a parse error — reported as a misleading "Missing ';'".
// Docs: docs/syntax.md "Comments".

/** A program and the same program with its comments removed must mean the same thing. */
const POSITIONS: Array<[label: string, withComments: string, without: string]> = [
  [
    'a commented-out case clause (the reported case)',
    'let mode = 3;\nswitch (mode) {\n  case 0 {\n    M 0 0\n  }\n  // case 1 {\n  //   M 1 1\n  // }\n  default {\n    M 2 2\n  }\n}',
    'let mode = 3;\nswitch (mode) {\n  case 0 {\n    M 0 0\n  }\n  default {\n    M 2 2\n  }\n}',
  ],
  [
    'comments before the first clause and after the last',
    'let mode = 0;\nswitch (mode) {\n  // first\n  case 0 { M 0 0 }\n  // nothing else yet\n}',
    'let mode = 0;\nswitch (mode) {\n  case 0 { M 0 0 }\n}',
  ],
  [
    'between the arms of a switch expression',
    'let band = switch (5) {\n  // negative\n  case ..<0 { 0 }\n  // everything else\n  default { 1 }\n};\nM band 0',
    'let band = switch (5) {\n  case ..<0 { 0 }\n  default { 1 }\n};\nM band 0',
  ],
  [
    'inside a multi-line array literal',
    'let list = [\n  10, // first\n  // 20,\n  30,\n];\nM list[0] list[1]',
    'let list = [\n  10,\n  30,\n];\nM list[0] list[1]',
  ],
  [
    'inside a multi-line object literal',
    'let size = {\n  width: 12, // in units\n  // height: 8,\n  depth: 3,\n};\nM size.width size.depth',
    'let size = {\n  width: 12,\n  depth: 3,\n};\nM size.width size.depth',
  ],
  [
    'inside multi-line call arguments',
    'let value = clamp(\n  50, // what to limit\n  0,\n  // upper bound\n  10\n);\nM value 0',
    'let value = clamp(\n  50,\n  0,\n  10\n);\nM value 0',
  ],
  [
    'inside a method chain',
    'let ordered = [3, 1, 2]\n  // smallest first\n  .sort()\n  // then flip\n  .reverse();\nM ordered[0] ordered[2]',
    'let ordered = [3, 1, 2]\n  .sort()\n  .reverse();\nM ordered[0] ordered[2]',
  ],
  [
    'between enum members',
    'enum Side {\n  LEFT, // west\n  // MIDDLE,\n  RIGHT\n}\nlog(Side.RIGHT);\nM 0 0',
    'enum Side {\n  LEFT,\n  RIGHT\n}\nlog(Side.RIGHT);\nM 0 0',
  ],
  [
    'in the middle of a statement',
    'let total = // running sum\n  1 +\n  // the second term\n  2;\nM total 0',
    'let total =\n  1 +\n  2;\nM total 0',
  ],
  [
    'inside a for header, a fn parameter list and destructuring',
    'fn add(\n  left, // first\n  right\n) {\n  return left + right;\n}\nlet [\n  head, // the first\n  ...rest\n] = [1, 2];\nfor (i in 0.. // up to\n  2) {\n  M i 0\n}\nM add(head, 1) 0',
    'fn add(\n  left,\n  right\n) {\n  return left + right;\n}\nlet [\n  head,\n  ...rest\n] = [1, 2];\nfor (i in 0..\n  2) {\n  M i 0\n}\nM add(head, 1) 0',
  ],
  [
    'inside a range value and a ternary',
    'let steps = (1.. // through\n  3);\nlet pick = steps.length > 2 // long enough?\n  ? 1\n  : 0;\nM pick steps.length',
    'let steps = (1..\n  3);\nlet pick = steps.length > 2\n  ? 1\n  : 0;\nM pick steps.length',
  ],
  [
    'inside a trailing block and a lambda',
    'let doubled = [1, 2].map {|value|\n  // scale it\n  return value * 2; // twice\n};\nlet twice = {|value| // a lambda\n  value * 2};\nM doubled[1] twice(3)',
    'let doubled = [1, 2].map {|value|\n  return value * 2;\n};\nlet twice = {|value|\n  value * 2};\nM doubled[1] twice(3)',
  ],
];

const TEXT_BODY = [
  "define TextLayer('labels') #{ font-size: 12; }\nlayer('labels').apply {\n  text(10, 20) {\n    // the heading\n    tspan()`Totals`\n    // tspan(0, 16)`(draft)`\n    switch (2) {\n      // small\n      case 1 {\n        tspan()`one`\n      }\n      // the rest\n      default {\n        tspan()`many`\n      }\n    }\n  }\n}",
  "define TextLayer('labels') #{ font-size: 12; }\nlayer('labels').apply {\n  text(10, 20) {\n    tspan()`Totals`\n    switch (2) {\n      case 1 {\n        tspan()`one`\n      }\n      default {\n        tspan()`many`\n      }\n    }\n  }\n}",
] as const;

/** Every comment in a program, read from the parse tree (so `//` inside a string never counts), plus the ones carried inside a PathArgs token. */
function treeComments(source: string): string[] {
  const found: Array<[number, string]> = [];
  const cursor = lezerParser.parse(source).cursor();
  do {
    if (cursor.name === 'LineComment') found.push([cursor.from, source.slice(cursor.from, cursor.to).trimEnd()]);
    if (cursor.name === 'PathArgs') {
      const args = source.slice(cursor.from, cursor.to);
      for (const [from, to] of pathArgCommentRanges(args)) found.push([cursor.from + from, args.slice(from, to).trimEnd()]);
    }
    if (cursor.name === 'StyleContent') {
      const content = source.slice(cursor.from, cursor.to);
      for (const m of content.matchAll(/\/\/[^\n]*/g)) found.push([cursor.from + (m.index ?? 0), m[0].trimEnd()]);
    }
  } while (cursor.next());
  return found.sort((a, b) => a[0] - b[0]).map(([, text]) => text);
}

function everything(source: string): string {
  const result = compile(source);
  return JSON.stringify({
    layers: result.layers.map((layer: any) => [layer.name, layer.data ?? null, layer.textElements ?? null]),
    logs: result.logs.map((entry) => entry.parts.map((p) => p.value).join('')),
  });
}

describe('comments anywhere: parsing and meaning', () => {
  it.each(POSITIONS)('%s: parses, and means what it means without the comments', (_label, withComments, without) => {
    expect(() => parse(withComments)).not.toThrow();
    expect(everything(withComments)).toBe(everything(without));
  });

  it('inside a text body, including a text switch', () => {
    expect(() => parse(TEXT_BODY[0])).not.toThrow();
    expect(everything(TEXT_BODY[0])).toBe(everything(TEXT_BODY[1]));
  });

  it('inside a text block', () => {
    const withComments = 'let caption = &{\n  // title\n  text(0, 14)`Title`\n  // text(0, 30)`Subtitle`\n};\nlog(caption);';
    expect(compile(withComments).logs[0].parts[0].value).toBe('TextBlock(1 elements)');
  });

  it('statement-level comments still build Comment nodes where they did before', () => {
    const ast = parse('// top\nlet x1 = 1; // trailing\nfor (i in 0..1) {\n  // in a block\n  M i 0\n}\n// end');
    expect(ast.body.map((s) => s.type)).toEqual(['Comment', 'LetDeclaration', 'Comment', 'ForLoop', 'Comment']);
    const loop = ast.body[3] as any;
    expect(loop.body.map((s: any) => s.type)).toEqual(['Comment', 'PathCommand']);
    expect((ast.body[0] as any).text).toBe('// top');
  });

  it('a comment after a path command does not join its arguments', () => {
    expect(compilePath('M 10 20 // start here\nL 30 40 // then here')).toBe('M 10 20 L 30 40');
  });

  it.each([
    ['a string', 'let link = "https://example.com/a//b";\nlog(link);', 'https://example.com/a//b'],
    ['a template', 'let note = `a // b`;\nlog(note);', 'a // b'],
  ])('`//` inside %s is text, not a comment', (_label, source, expected) => {
    expect(compile(source).logs[0].parts.map((p) => p.value).join('')).toContain(expected);
  });

  it('style blocks take comments on their own line and after a declaration (docs example)', () => {
    const result = compile(
      "define PathLayer('outline') #{\n  // thin, unfilled\n  stroke: #333;\n  stroke-width: 1;   // hairline\n  fill: none;\n}\nlayer('outline').apply { M 0 0 }",
    );
    const outline = result.layers.find((layer) => layer.name === 'outline') as any;
    expect(outline.styles).toMatchObject({ stroke: '#333', 'stroke-width': '1', fill: 'none' });
  });

  it('division is unaffected', () => {
    expect(compilePath('let ratio = 12 / 2 / 3;\nM ratio 0')).toBe('M 2 0');
  });

  it('a comment does not rescue a genuinely missing semicolon', () => {
    expect(() => parse('let first = 1 // no semicolon\nlet second = 2;')).toThrow(/Missing ';'/);
  });

  it('produces no diagnostics, and scope analysis still sees names on both sides of a comment', () => {
    const source = POSITIONS[0][1];
    expect(getDiagnostics(new StringTextDocument(source))).toEqual([]);
    const info = analyzeScopes(new StringTextDocument('let list = [\n  first, // one\n  second,\n];'));
    expect(info.references.map((r) => r.name)).toEqual(expect.arrayContaining(['first', 'second']));
  });
});

// Positions where the AST builder peeks at a neighbouring node, where a block
// has nothing but a comment in it, or where the formatter has to re-indent a
// verbatim statement — the places a skipped token could silently change what a
// program means, or get lost on format. Each must hold FOUR invariants.
const RISKY_POSITIONS: Array<[string, string]> = [
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
  ['a comment containing a paren and a range inside a path argument', 'M calc(1 // (1..3) is not a range )\n  + 2) 0'],
  ['a comment containing a quote inside a path argument', "M calc(1 // don't stop here\n  + 2) 0"],
  ['a path-argument comment inside a block being re-indented', 'if (true) {\n        M calc(1 // one\n          + 2) 0\n}'],
];

/** Every comment in a program: tree comments, plus the ones carried inside a PathArgs token. */
function commentSpans(source: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const cursor = lezerParser.parse(source).cursor();
  do {
    if (cursor.name === 'LineComment') spans.push([cursor.from, cursor.to]);
    if (cursor.name === 'PathArgs') {
      for (const [from, to] of pathArgCommentRanges(source.slice(cursor.from, cursor.to))) {
        spans.push([cursor.from + from, cursor.from + to]);
      }
    }
  } while (cursor.next());
  return spans.sort((a, b) => a[0] - b[0]);
}

describe('comments anywhere: risky positions', () => {
  const format = (source: string): string => {
    const edits = formatDocument(new StringTextDocument(source));
    return edits.length === 0 ? source : edits[0].newText;
  };
  const commentList = (source: string): string[] => commentSpans(source).map(([from, to]) => source.slice(from, to).trimEnd());
  const withoutComments = (source: string): string => {
    let out = source;
    for (const [from, to] of commentSpans(source).reverse()) out = out.slice(0, from) + out.slice(to);
    return out;
  };

  it('the comment finder used by these tests sees every comment in the list', () => {
    // guards the guard: a finder that returned nothing would make every check below vacuous
    const total = RISKY_POSITIONS.reduce((n, [, source]) => n + commentList(source).length, 0);
    expect(total).toBeGreaterThanOrEqual(RISKY_POSITIONS.length);
    for (const [label, source] of RISKY_POSITIONS) expect([label, commentList(source).length > 0]).toEqual([label, true]);
  });

  it.each(RISKY_POSITIONS)('%s', (_label, source) => {
    // 1. it compiles   2. it means what it means without the comments
    expect(everything(source)).toBe(everything(withoutComments(source)));
    // 3. formatting keeps every comment, in order, and keeps the meaning
    const once = format(source);
    expect(commentList(once)).toEqual(commentList(source));
    expect(everything(once)).toBe(everything(source));
    // 4. formatting is idempotent
    expect(format(once)).toBe(once);
  });

  it('a multi-line template inside a verbatim statement keeps its continuation lines byte for byte', () => {
    const source = 'if (true) {\n      let note = [ // keep\n        `line one\n   line two`,\n      ];\n      log(note[0]);\n}\nM 0 0';
    expect(format(source)).toContain('`line one\n   line two`');
    expect(compile(format(source)).logs[0].parts.map((p) => p.value).join('')).toBe('line one\n   line two');
  });

  it('a comment still ends a path command\'s arguments at the top level', () => {
    expect(compilePath('M 10 20 // start here\nL 30 40')).toBe('M 10 20 L 30 40');
    expect(compilePath('M calc(1 // one\n  + 2) 5 // after the args\nL 1 1')).toBe('M 3 5 L 1 1');
  });
});

// Several builders re-parse a SLICE of source — an if condition, a return
// value, a text-body if — wrapped as `let _ = <slice>;`. With the `;` on the
// slice's own line, a slice that ENDS in a comment swallowed it: the sub-parse
// failed, and the builders fall back silently (an if condition to `true`, a
// return value to null). Before comments were legal there, that input was a
// hard parse error; afterwards it was a silent wrong answer.
describe('comments anywhere: a comment at the END of a re-parsed slice', () => {
  it('an if condition that ends in a comment is still evaluated', () => {
    const program = (value: number) => `let n1 = ${value};\nif (n1 > 0 // positive?\n) {\n  M 1 1\n} else {\n  M 2 2\n}`;
    expect(compilePath(program(-1))).toBe('M 2 2');
    expect(compilePath(program(5))).toBe('M 1 1');
  });

  it('an else-if condition that ends in a comment is still evaluated', () => {
    const source = 'let n1 = 0;\nif (n1 > 0) {\n  M 1 1\n} else if (n1 < 0 // negative?\n) {\n  M 2 2\n} else {\n  M 3 3\n}';
    expect(compilePath(source)).toBe('M 3 3');
  });

  it('a return value that ends in a comment is still returned', () => {
    const result = compile('fn answer() {\n  return 42 // the answer\n  ;\n}\nlog(`${answer()}`);');
    expect(result.logs[0].parts.map((p) => p.value).join('')).toBe('42');
  });

  it('a text-body if condition that ends in a comment is still evaluated', () => {
    const source =
      "define TextLayer('labels') #{ font-size: 10; }\nlet n1 = -1;\nlayer('labels').apply {\n  text(0, 0) {\n    if (n1 > 0 // positive?\n    ) {\n      tspan()`yes`\n    } else {\n      tspan()`no`\n    }\n  }\n}";
    const labels = compile(source).layers.find((layer) => layer.name === 'labels') as any;
    expect(labels.textElements[0].children.map((c: any) => c.text)).toEqual(['no']);
  });

  it('a for-each iterable and a calc() that end in a comment', () => {
    expect(compilePath('for (item in [4, 5] // the values\n) {\n  M item 0\n}')).toBe('M 4 0 M 5 0');
    expect(compilePath('let a1 = 1;\nM calc(a1 + 2 // three\n) 0')).toBe('M 3 0');
  });

  it('formatting keeps those programs meaning what they meant', () => {
    const source = 'let n1 = -1;\nif (n1 > 0 // positive?\n) {\n  M 1 1\n} else {\n  M 2 2\n}';
    const edits = formatDocument(new StringTextDocument(source));
    const once = edits.length === 0 ? source : edits[0].newText;
    expect(once).toContain('// positive?');
    expect(compilePath(once)).toBe('M 2 2');
  });
});

describe('comments anywhere: docs examples', () => {
  it('switching off one case (docs example)', () => {
    const source =
      'let mode = 1;\nswitch (mode) {\n  case 0 {\n    circle(50, 50, 20);\n  }\n  // case 1 {\n  //   rect(30, 30, 40, 40);\n  // }\n  default {\n    polygon(50, 50, 20, 6);\n  }\n}';
    // mode 1 now falls to the default: a hexagon, not a rect
    expect(compile(source).layers[0].data).toBe(compile('polygon(50, 50, 20, 6);').layers[0].data);
  });

  it('lists spread over several lines (docs example)', () => {
    const result = compile(
      'let value = 250;\nlet palette = [\n  #e63946,   // accent\n  // #f1faee,\n  #1d3557,\n];\n\nlet size = {\n  width: 120,   // in viewBox units\n  // height: 80,\n};\n\nlet clamped = clamp(\n  value,   // what to limit\n  0,\n  100\n);\nlog(`${palette.length} ${size.width} ${clamped}`);',
    );
    expect(result.logs[0].parts.map((p) => p.value).join('')).toBe('2 120 100');
  });

  it('a method chain and a text body (docs example)', () => {
    const result = compile(
      "let scores = [3, 9, 5];\nlet ordered = scores\n  // highest first\n  .sort {|left, right| return right - left; };\n\ndefine TextLayer('labels') #{ font-size: 12; }\nlayer('labels').apply {\n  text(10, 20) {\n    // the heading\n    tspan()`Totals`\n    // tspan(0, 16)`(draft)`\n  }\n}\nlog(`${ordered}`);",
    );
    expect(result.logs[0].parts.map((p) => p.value).join('')).toBe('[9, 5, 3]');
    const labels = result.layers.find((layer) => layer.name === 'labels') as any;
    expect(labels.textElements[0].children.map((c: any) => c.text)).toEqual(['Totals']);
  });
});

describe('comments anywhere: the formatter keeps every comment', () => {
  function format(source: string): string {
    const edits = formatDocument(new StringTextDocument(source));
    return edits.length === 0 ? source : edits[0].newText;
  }
  // Tree-based, like the formatter's own net — a regex over lines would count `//` inside a string.
  const commentsOf = treeComments;

  it.each([...POSITIONS.map(([label, source]) => [label, source] as [string, string]), ['a text body', TEXT_BODY[0]]])(
    '%s: every comment survives, the program still means the same, and formatting is idempotent',
    (_label, source) => {
      const once = format(source);
      expect(commentsOf(once)).toEqual(commentsOf(source));
      expect(everything(once)).toBe(everything(source));
      expect(format(once)).toBe(once);
    },
  );

  it('re-indents comments between switch clauses with their neighbours', () => {
    const messy = 'switch (mode) {\ncase 0 {\nM 0 0\n}\n      // case 1 {\n//   M 1 1\n   // }\ndefault {\nM 2 2\n}\n}';
    expect(format(messy)).toBe(
      'switch(mode) {\n  case 0 {\n    M 0 0\n  }\n  // case 1 {\n  //   M 1 1\n  // }\n  default {\n    M 2 2\n  }\n}',
    );
  });

  it('keeps a comment that follows the last clause', () => {
    const once = format('switch (mode) {\n  case 0 {\n    M 0 0\n  }\n  // more to come\n}');
    expect(once).toContain('  // more to come\n}');
  });

  it('re-indents comments between text-body items', () => {
    const once = format("text(10, 20) {\n// the heading\ntspan()`Totals`\n      // tspan(0, 16)`(draft)`\n}");
    // (the formatter's canonical tspan form ends in `;`)
    expect(once).toBe('text(10, 20) {\n  // the heading\n  tspan()`Totals`;\n  // tspan(0, 16)`(draft)`\n}');
  });

  it('leaves a statement with a comment INSIDE it exactly as written, and still formats its neighbours', () => {
    const source = 'let   before=1;\nlet list = [\n    10,   // first\n  // 20,\n      30,\n];\nlet   after=2;';
    const once = format(source);
    expect(once).toContain('let before = 1;');
    expect(once).toContain('let after = 2;');
    expect(once).toContain('let list = [\n    10,   // first\n  // 20,\n      30,\n];');
  });

  it('a comment in the HEADER of a text-body if keeps that if verbatim, not the whole text()', () => {
    const source = "text(0, 0) {\n      tspan()`before`\n  if (true // keep\n  ) {\n    tspan()`A`\n  }   else {\n    tspan()`B`\n  }\n      tspan()`after`\n}";
    const once = format(source);
    // its neighbours format normally…
    expect(once).toContain('\n  tspan()`before`;\n');
    expect(once).toContain('\n  tspan()`after`;\n');
    // …the text-if is one verbatim unit (ragged `}   else {` and all)
    expect(once).toContain('  if (true // keep\n  ) {\n    tspan()`A`\n  }   else {\n    tspan()`B`\n  }');
    expect(commentsOf(once)).toEqual(['// keep']);
    expect(format(once)).toBe(once);
  });

  it('counts a comment and a `//` inside a string on the same program correctly', () => {
    const source = 'let   link="https://example.com/a//b"; // the docs\nlet list = [\n  link, // keep\n];';
    const once = format(source);
    expect(commentsOf(source)).toEqual(['// the docs', '// keep']);
    expect(commentsOf(once)).toEqual(['// the docs', '// keep']);
    expect(once).toContain('https://example.com/a//b'); // (the formatter's canonical quote style is its own business)
  });

  it('re-indents a verbatim statement as a unit when its block moves', () => {
    const source = 'if (true) {\n        let list = [\n          1, // one\n          2,\n        ];\n}';
    expect(format(source)).toBe('if (true) {\n  let list = [\n    1, // one\n    2,\n  ];\n}');
  });

  // A comment at the end of a line describes that line. Printed on a line of
  // its own it sits directly above the NEXT statement and reads as describing
  // that — the formatter used to do exactly this to every trailing comment.
  it('keeps a trailing comment on its line', () => {
    expect(format('let x1 = 50;  // inline comment\nM x1 0')).toBe('let x1 = 50; // inline comment\nM x1 0');
  });

  it('keeps trailing comments on path commands, block closers, clauses and text items', () => {
    const source =
      "define TextLayer('labels') #{ font-size: 10; }\nif (true) {\n  M 0 0 // start\n  L 5 5    // then\n} // done\nswitch (1) {\n  case 1 {\n    M 1 1\n  } // the only case\n}\nlayer('labels').apply {\n  text(0, 0) {\n    tspan()`a`; // first\n  }\n}";
    const once = format(source);
    expect(once).toContain('  M 0 0 // start\n  L 5 5 // then\n} // done');
    expect(once).toContain('  } // the only case\n}');
    expect(once).toContain('    tspan()`a`; // first');
    expect(format(once)).toBe(once);
    expect(everything(once)).toBe(everything(source));
  });

  it('a comment on its own line is never pulled up onto the line before it', () => {
    expect(format('M 0 0\n// about the next line\nL 5 5')).toBe('M 0 0\n// about the next line\nL 5 5');
  });

  // A style block's content is one raw token printed back from its parsed
  // declarations, so its comments were lost on format: a comment with words in
  // it made the formatter refuse the whole document, and one without — a
  // `// ----` rule — was silently deleted.
  it.each([
    ['the docs example', "define PathLayer('outline') #{\n  // thin, unfilled\n  stroke: #333;\n  stroke-width: 1;   // hairline\n  fill: none;\n}"],
    ['a comment with no words in it', "define PathLayer('outline') #{\n  // ----\n  stroke: #333;\n}"],
    ['a style block in a let', 'let paint = #{\n  fill: red; // warm\n};'],
    ['next to an interpolation', 'let accent = #333;\nlet paint = #{\n  // from the theme\n  stroke: ${accent};\n};'],
  ])('keeps comments inside a style block: %s', (_label, styleSource) => {
    const source = `${styleSource}\nlet   after=2;`;
    const once = format(source);
    expect(commentsOf(once)).toEqual(commentsOf(source));
    expect(once).toContain(styleSource); // the statement is kept as written
    expect(once).toContain('let after = 2;'); // …and its neighbour still formats
    expect(format(once)).toBe(once);
  });

  it('never drops a comment that contains no words', () => {
    const source = 'let list = [\n  1, // ----\n  2,\n];';
    expect(commentsOf(format(source))).toEqual(['// ----']);
  });
});

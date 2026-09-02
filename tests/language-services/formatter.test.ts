import { describe, it, expect } from 'vitest';
import { StringTextDocument } from '../../src/language-services/document';
import { formatDocument } from '../../src/language-services/formatter';
import { parse } from '../../src/parser';

function format(source: string, indent?: string): string {
  const edits = formatDocument(new StringTextDocument(source), indent ? { indent } : undefined);
  if (edits.length === 0) return source; // Already formatted or unparseable
  return edits[0].newText;
}

describe('formatDocument', () => {
  it('formats source with minor errors via Lezer fallback', () => {
    // Lezer error recovery allows formatting even with missing semicolons
    const edits = formatDocument(new StringTextDocument('let x = 10\nlet y = 20'));
    expect(edits.length).toBeGreaterThan(0);
    expect(edits[0].newText).toContain('let x = 10;');
  });

  describe('lambda expressions', () => {
    it('formats a lambda in a let declaration and is idempotent', () => {
      const once = format('let f = {|a, b|\nreturn a + b;\n};');
      expect(once).toBe('let f = {|a, b|\n  return a + b;\n};');
      expect(format(once)).toBe(once);
    });

    it('zero-param lambda keeps {|| — never collapses to an object literal', () => {
      const result = format('let g = {||\nreturn 1;\n};');
      expect(result).toContain('{||');
      expect(format(result)).toBe(result);
      // Round-trip: the formatted output must still parse as a lambda
      const ast = parse(result);
      expect((ast.body[0] as any).value.type).toBe('LambdaExpression');
    });
  });

  // --- Section 1: Indentation ---
  describe('indentation', () => {
    it('indents for-loop body with 2 spaces', () => {
      const result = format('for (i in 0..5) {\nM i 0\n}');
      expect(result).toBe('for (i in 0..5) {\n  M i 0\n}');
    });

    it('keeps an else-if chain flat instead of nesting it', () => {
      // `else if` parses as an alternate holding one IfStatement; the
      // formatter used to print `} else {\n  if (...) {` and lose the chain.
      const src = 'if (a > 2) {\nM 1 1\n} else if (a > 1) {\nM 2 2\n} else if (a > 0) {\nM 3 3\n} else {\nM 4 4\n}';
      const result = format(src);
      expect(result).toBe('if (a > 2) {\n  M 1 1\n} else if (a > 1) {\n  M 2 2\n} else if (a > 0) {\n  M 3 3\n} else {\n  M 4 4\n}');
      expect(format(result)).toBe(result);
      expect(() => parse(result)).not.toThrow();
    });

    it('keeps an else-if chain flat when nested inside a loop', () => {
      const result = format('for (i in 0..2) {\nif (i == 0) {\nM 0 0\n} else if (i == 1) {\nM 1 1\n}\n}');
      expect(result).toBe('for (i in 0..2) {\n  if (i == 0) {\n    M 0 0\n  } else if (i == 1) {\n    M 1 1\n  }\n}');
      expect(format(result)).toBe(result);
    });

    it('preserves the half-open range operator', () => {
      const result = format('for (i in 0..<pts.length) {\nM i 0\n}');
      expect(result).toBe('for (i in 0..<pts.length) {\n  M i 0\n}');
      expect(format(result)).toBe(result);
    });

    it('indents function body', () => {
      const result = format('fn draw() {\nM 0 0\nL 100 100\n}');
      expect(result).toBe('fn draw() {\n  M 0 0\n  L 100 100\n}');
    });

    it('indents nested blocks (3 levels)', () => {
      const result = format('for (i in 0..3) {\nif (i > 1) {\nM i 0\n}\n}');
      expect(result).toBe('for (i in 0..3) {\n  if (i > 1) {\n    M i 0\n  }\n}');
    });

    it('indents if-else', () => {
      const result = format('if (x > 0) {\nM 10 10\n} else {\nM 0 0\n}');
      expect(result).toContain('  M 10 10');
      expect(result).toContain('} else {');
      expect(result).toContain('  M 0 0');
    });

    it('uses 4-space indent when specified', () => {
      const result = format('for (i in 0..5) {\nM i 0\n}', '    ');
      expect(result).toBe('for (i in 0..5) {\n    M i 0\n}');
    });

    it('uses tab indent when specified', () => {
      const result = format('for (i in 0..5) {\nM i 0\n}', '\t');
      expect(result).toBe('for (i in 0..5) {\n\tM i 0\n}');
    });
  });

  // --- Section 2: Braces ---
  describe('braces', () => {
    it('uses same-line opening braces for fn', () => {
      const result = format('fn draw(cx, cy) {\ncircle(cx, cy, 10);\n}');
      expect(result).toContain('fn draw(cx, cy) {');
    });

    it('uses same-line opening braces for for', () => {
      const result = format('for (i in 0..5) {\nM i 0\n}');
      expect(result).toContain('for (i in 0..5) {');
    });

    it('uses same-line opening braces for if', () => {
      const result = format('if (x > 0) {\nM 10 10\n}');
      expect(result).toContain('if (x > 0) {');
    });
  });

  // --- Section 3: Semicolons ---
  describe('semicolons', () => {
    it('adds semicolon after let declaration', () => {
      expect(format('let x = 10;')).toBe('let x = 10;');
    });

    it('adds semicolon after assignment', () => {
      expect(format('x = 20;')).toBe('x = 20;');
    });

    it('adds semicolon after return', () => {
      const result = format('fn f() {\nreturn 10;\n}');
      expect(result).toContain('return 10;');
    });

    it('adds semicolon after member assignment (ExpressionStatement)', () => {
      const result = format('obj.x = 10;');
      expect(result).toContain('obj.x = 10;');
    });

    it('adds semicolon after @font directive', () => {
      const result = format('@font "Inter";');
      expect(result).toBe('@font "Inter";');
    });

    it('formats @font identifier source without quotes', () => {
      const result = format('let family = "Inter";\n@font family 700;');
      expect(result).toContain('@font family 700;');
    });

    it('adds semicolon after @font with weight', () => {
      const result = format('@font "Inter" 700;');
      expect(result).toBe('@font "Inter" 700;');
    });

    it('does not add semicolon after path commands', () => {
      const result = format('M 10 20');
      expect(result).toBe('M 10 20');
      expect(result).not.toContain(';');
    });

    it('does not add semicolon after block statements', () => {
      const result = format('for (i in 0..5) {\nM i 0\n}');
      expect(result).not.toMatch(/\};\s*$/);
    });

    it('adds semicolon after indexed assignment', () => {
      const result = format('arr[0] = 10;');
      expect(result).toContain('arr[0] = 10;');
    });

    it('adds semicolon after member assignment', () => {
      const result = format('obj.x = 10;');
      expect(result).toContain('obj.x = 10;');
    });
  });

  // --- Section 4: Operators ---
  describe('operators', () => {
    it('formats binary expressions with spaces', () => {
      const result = format('let x = calc(10 + 20);');
      expect(result).toContain('10 + 20');
    });

    it('formats unary without space', () => {
      const result = format('let x = -10;');
      expect(result).toContain('-10');
    });

    it('formats comparison operators with spaces', () => {
      const result = format('if (x > 10) {\nM 0 0\n}');
      expect(result).toContain('x > 10');
    });

    it('formats logical operators with spaces', () => {
      const result = format('if (a && b) {\nM 0 0\n}');
      expect(result).toContain('a && b');
    });

    it('formats merge operator with spaces', () => {
      const result = format('let x = a << b;');
      expect(result).toContain('a << b');
    });
  });

  // --- Section 5: Style blocks ---
  describe('style blocks', () => {
    it('formats empty style block inline', () => {
      const result = format('let x = PathLayer(\'bg\') ${};');
      expect(result).toContain('${}');
    });

    it('formats single-property style block as multi-line', () => {
      const result = format('let x = PathLayer(\'bg\') ${ fill: #000; };');
      expect(result).toContain('${\n');
      expect(result).toContain('  fill: #000;\n');
      expect(result).toContain('}');
    });

    it('formats multi-property style block with one per line', () => {
      const result = format('let x = PathLayer(\'bg\') ${ fill: #000; stroke: none; };');
      expect(result).toContain('  fill: #000;');
      expect(result).toContain('  stroke: none;');
    });

    it('formats style block in define statement', () => {
      const result = format("define PathLayer('main') ${ stroke: #000; fill: none; }");
      expect(result).toContain('${\n');
      expect(result).toContain('  stroke: #000;');
      expect(result).toContain('  fill: none;');
    });
  });

  // --- Section 6: Path commands ---
  describe('path commands', () => {
    it('formats path command with spaces', () => {
      expect(format('M 10 20')).toBe('M 10 20');
    });

    it('formats Z with no args', () => {
      expect(format('M 0 0\nL 100 0\nZ')).toContain('Z');
    });

    it('preserves space between command and arguments', () => {
      const result = format('M 100 200');
      expect(result).toBe('M 100 200');
    });
  });

  // --- Path-command suffix clauses (with / as) ---
  describe('suffix clauses', () => {
    it('formats a command with both with and as clauses stably', () => {
      const src = "v 20 with fillet(5) as segment('west');";
      expect(format(src)).toBe(src);
    });

    it('is idempotent on with/as clauses', () => {
      const src = "v 20 with fillet(5) as segment('west');";
      const once = format(src);
      expect(format(once)).toBe(once);
    });

    it('formats a bare with clause on z without a poisonous semicolon', () => {
      // `z <suffix>;` fails to parse mid-document, so the formatter must not
      // add the terminator on close-path commands.
      expect(format('z with chamfer(2)')).toBe('z with chamfer(2)');
    });

    it('keeps annotated z formatting parseable inside a block (round-trip)', () => {
      const src = 'let box = @{\n  M 0 0\n  z with chamfer(2)\n};\n';
      const out = format(src);
      // The invariant that matters for a formatter: parse(format(x)) must
      // succeed whenever parse(x) does.
      expect(() => parse(out)).not.toThrow();
    });

    it('formats comma-separated labels', () => {
      const src = "h 20 as segment('lid'), endpoint('corner');";
      expect(format(src)).toBe(src);
    });

    it('formats a label on a statement function call', () => {
      expect(format("circle(5, 5, 20) as segment('c1');")).toBe("circle(5, 5, 20) as segment('c1');");
    });

    it('emits the with clause before the as clause', () => {
      const result = format("h 10 with chamfer(2) as segment('base');");
      expect(result).toBe("h 10 with chamfer(2) as segment('base');");
      expect(result.indexOf('with')).toBeLessThan(result.indexOf('as'));
    });
  });

  // --- Section 7: Ternary expressions ---
  describe('ternary expressions', () => {
    it('formats short ternary on one line', () => {
      const result = format('let x = a ? 1 : 0;');
      expect(result).toContain('a ? 1 : 0');
    });
  });

  // --- Section 8: Arrays ---
  describe('arrays', () => {
    it('formats empty array inline', () => {
      const result = format('let x = [];');
      expect(result).toContain('[]');
    });

    it('formats array with elements as multi-line', () => {
      const result = format('let arr = [1, 2, 3];');
      expect(result).toBe('let arr = [\n  1,\n  2,\n  3,\n];');
    });

    it('adds trailing comma to last element', () => {
      const result = format('let arr = [1, 2, 3];');
      // Each element has trailing comma, including the last
      expect(result).toContain('  3,');
    });

    it('formats nested arrays', () => {
      const result = format('let arr = [[1, 2], [3, 4]];');
      expect(result).toContain('[\n');
      expect(result).toContain('  [\n');
    });

    it('formats spread elements in arrays', () => {
      const result = format('let arr = [...a, 1];');
      expect(result).toContain('...a,');
    });
  });

  // --- Section 9: Objects ---
  describe('objects', () => {
    it('formats empty object inline', () => {
      const result = format('let x = {};');
      expect(result).toContain('{}');
    });

    it('formats object with properties as multi-line', () => {
      const result = format('let x = { a: 1, b: 2 };');
      expect(result).toBe('let x = {\n  a: 1,\n  b: 2,\n};');
    });

    it('adds trailing comma to last property', () => {
      const result = format('let x = { a: 1 };');
      expect(result).toContain('  a: 1,');
    });

    it('formats spread in objects', () => {
      const result = format('let x = { ...defaults, a: 1 };');
      expect(result).toContain('...defaults,');
    });

    it('preserves shorthand properties', () => {
      const result = format('let x = { a, b: 2 };');
      expect(result).toBe('let x = {\n  a,\n  b: 2,\n};');
    });
  });

  // --- Section 10: Function definitions ---
  describe('function definitions', () => {
    it('keeps 3 params on one line', () => {
      const result = format('fn draw(cx, cy, r) {\ncircle(cx, cy, r);\n}');
      expect(result).toContain('fn draw(cx, cy, r) {');
    });

    it('keeps 4 params on one line', () => {
      const result = format('fn draw(cx, cy, w, h) {\nrect(cx, cy, w, h);\n}');
      expect(result).toContain('fn draw(cx, cy, w, h) {');
    });

    it('wraps 5+ params after every 4th', () => {
      const result = format('fn build(a, b, c, d, e) {\nM 0 0\n}');
      expect(result).toContain('fn build(a, b, c, d,\n');
      expect(result).toContain('    e) {');
    });

    it('wraps 9 params in groups of 4', () => {
      const result = format('fn build(a, b, c, d, e, f, g, h, i) {\nM 0 0\n}');
      expect(result).toContain('fn build(a, b, c, d,\n');
      expect(result).toContain('    e, f, g, h,\n');
      expect(result).toContain('    i) {');
    });
  });

  // --- Section 11: Function calls ---
  describe('function calls', () => {
    it('adds semicolon to standalone function call', () => {
      // Standalone function calls in PathCommand context get semicolons
      // because the parser requires them at statement level
      const result = format('circle(100, 100, 50)');
      expect(result).toBe('circle(100, 100, 50);');
    });

    it('adds semicolon to rect call', () => {
      const result = format('rect(0, 0, 100, 50)');
      expect(result).toBe('rect(0, 0, 100, 50);');
    });

    it('wraps 5+ args one per line', () => {
      const result = format('fn f() {\nfoo(1, 2, 3, 4, 5);\n}');
      expect(result).toContain('foo(1,\n');
    });
  });

  // --- Section 12: Method chains ---
  describe('method chains', () => {
    it('keeps 2-step chain on one line', () => {
      const result = format('let x = base.lighten(0.2).alpha(0.5);');
      expect(result).toContain('base.lighten(0.2).alpha(0.5)');
    });

    it('wraps 3+ step chain with leading dot', () => {
      const result = format('let x = base.hueShift(180).lighten(20).alpha(0.8);');
      expect(result).toContain('base\n');
      expect(result).toContain('    .hueShift(180)');
      expect(result).toContain('    .lighten(20)');
      expect(result).toContain('    .alpha(0.8)');
    });
  });

  // --- Section 13: Enums ---
  describe('enums', () => {
    it('formats enum with indented members', () => {
      const result = format('enum Dir {\nUP,\nDOWN\n}');
      expect(result).toContain('  UP,');
      expect(result).toContain('  DOWN,');
    });

    it('adds trailing comma on last member', () => {
      const result = format('enum Dir {\nUP,\nDOWN\n}');
      // Both UP and DOWN should end with comma
      const lines = result.split('\n');
      const memberLines = lines.filter((l) => l.trim().startsWith('UP') || l.trim().startsWith('DOWN'));
      memberLines.forEach((l) => expect(l.trimEnd()).toMatch(/,$/));
    });

    it('formats enum members with values', () => {
      const result = format("enum E {\nA = 'a',\nB = 'b'\n}");
      expect(result).toContain("  A = 'a',");
      expect(result).toContain("  B = 'b',");
    });
  });

  // --- Section 14: Layer definitions ---
  describe('layer definitions', () => {
    it('formats define with multi-line style block', () => {
      const result = format("define PathLayer('main') ${ stroke: #000; fill: none; }");
      expect(result).toContain("define PathLayer('main') ${\n");
      expect(result).toContain('  stroke: #000;');
      expect(result).toContain('  fill: none;');
    });

    it('formats define default layer', () => {
      const result = format("define default PathLayer('main') ${ stroke: #000; }");
      expect(result).toContain('define default PathLayer');
    });
  });

  // --- Section 15: Layer apply ---
  describe('layer apply', () => {
    it('formats layer apply as multi-line', () => {
      // Parser requires semicolons on function calls inside apply blocks
      const result = format("layer('main').apply {\ncircle(50, 50, 25);\n}");
      expect(result).toContain("layer('main').apply {\n");
      expect(result).toContain('  circle(50, 50, 25)');
    });

    it('formats variable apply', () => {
      const result = format("bg.apply {\nrect(0, 0, 100, 100);\n}");
      expect(result).toContain('bg.apply {\n');
      expect(result).toContain('  rect(0, 0, 100, 100)');
    });
  });

  // --- Section 16: Text/tspan ---
  describe('text and tspan', () => {
    it('formats inline text with semicolon', () => {
      const result = format("text(50, 50)`Hello`;");
      expect(result).toBe("text(50, 50)`Hello`;");
    });

    it('formats text block form without a semicolon after a bare template item', () => {
      // The text-body grammar has no `;` after a bare template item; the
      // formatter used to add one and turn a valid file into a parse error.
      const result = format("text(50, 50) {\n`line one`\ntspan()`two`\n}");
      expect(result).toBe('text(50, 50) {\n  `line one`\n  tspan()`two`;\n}');
      expect(() => parse(result)).not.toThrow();
      expect(format(result)).toBe(result);
    });

    it('round-trips a switch inside a text body with bare template and tspan items', () => {
      const result = format('text(16, y) {\n`#${row}: `\nswitch (score) {\ncase ..<40 {\ntspan()`low`\n}\ndefault {\n`high`\n}\n}\n}');
      expect(result).toBe('text(16, y) {\n  `#${row}: `\n  switch (score) {\n    case ..<40 {\n      tspan()`low`;\n    }\n    default {\n      `high`\n    }\n  }\n}');
      expect(() => parse(result)).not.toThrow();
      expect(format(result)).toBe(result);
    });
  });

  // --- Section 17: Path blocks ---
  describe('path blocks', () => {
    it('formats path block as multi-line', () => {
      const result = format('let sq = @{\nh 60\nv 60\n};');
      expect(result).toContain('@{\n');
      expect(result).toContain('  h 60\n');
      expect(result).toContain('  v 60\n');
      expect(result).toContain('}');
    });
  });

  // --- Section 18: Text blocks ---
  describe('text blocks', () => {
    it('formats text block as multi-line', () => {
      const result = format("let tb = &{\ntext(0, 14)`line`\n};");
      expect(result).toContain('&{\n');
      expect(result).toContain("  text(0, 14)`line`;");
    });
  });

  // --- Section 19: Destructuring ---
  describe('destructuring', () => {
    it('formats array destructuring with spaces', () => {
      const result = format('let [a, b, c] = arr;');
      expect(result).toBe('let [a, b, c] = arr;');
    });

    it('formats array destructuring with rest', () => {
      const result = format('let [head, ...tail] = arr;');
      expect(result).toBe('let [head, ...tail] = arr;');
    });

    it('formats object destructuring with spaces', () => {
      const result = format('let { x, y } = pt;');
      expect(result).toContain('let { x, y } =');
    });

    it('formats object destructuring with alias', () => {
      const result = format('let { x, y: alias } = pt;');
      expect(result).toContain('y: alias');
    });

    it('formats for-each destructuring', () => {
      const result = format('for ([d, i] in data) {\nM 0 0\n}');
      expect(result).toContain('for ([d, i] in data) {');
    });
  });

  // --- Section 20: Comments ---
  describe('comments', () => {
    it('preserves top-level comments', () => {
      const result = format('// header\nlet x = 10;');
      expect(result).toContain('// header');
      expect(result).toContain('let x = 10;');
    });

    it('preserves comments inside function bodies', () => {
      const result = format('fn f() {\n// inside\nM 0 0\n}');
      expect(result).toContain('  // inside');
      expect(result).toContain('  M 0 0');
    });

    it('preserves comments inside for loops', () => {
      const result = format('for (i in 0..5) {\n// loop comment\nM i 0\n}');
      expect(result).toContain('  // loop comment');
    });

    it('preserves inline comments between statements', () => {
      const result = format('let x = 10;\n// separator\nlet y = 20;');
      expect(result).toContain('// separator');
    });
  });

  // --- Section 21: Trailing whitespace ---
  describe('trailing whitespace', () => {
    it('strips trailing spaces from lines', () => {
      const result = format('let x = 10;');
      const lines = result.split('\n');
      lines.forEach((line) => {
        expect(line).toBe(line.trimEnd());
      });
    });
  });

  // --- Section 22: Blank lines ---
  describe('blank lines', () => {
    it('preserves single blank line between statements', () => {
      const result = format('let x = 10;\n\nlet y = 20;');
      expect(result).toBe('let x = 10;\n\nlet y = 20;');
    });

    it('normalizes 3+ consecutive blank lines to 2', () => {
      const result = format('let x = 10;\n\n\n\nlet y = 20;');
      // Should have at most 2 blank lines
      expect(result).not.toContain('\n\n\n\n');
    });
  });

  // --- Semantic preservation (regressions: formatting must never change meaning) ---
  describe('semantic preservation', () => {
    it('keeps parentheses that precedence requires', () => {
      expect(format('let x = calc((i + 0.5) / 28);')).toContain('(i + 0.5) / 28');
      expect(format('let x = calc((a + b) * c);')).toContain('(a + b) * c');
      expect(format('let x = calc(a - (b + c));')).toContain('a - (b + c)');
      expect(format('let x = calc(a / (b * c));')).toContain('a / (b * c)');
    });

    it('drops parentheses that precedence makes redundant', () => {
      expect(format('let x = calc((a * b) + c);')).toContain('a * b + c');
      expect(format('let x = calc(a + (b - c));')).toContain('a + b - c');
    });

    it('parenthesizes binary arguments of unary operators', () => {
      expect(format('let x = calc(-(a + b));')).toContain('-(a + b)');
      expect(format('let x = !(a && b);')).toContain('!(a && b)');
    });

    it('re-quotes strings containing single quotes without corrupting them', () => {
      const result = format(`let font = "'Helvetica Neue', 'Helvetica', sans-serif";`);
      expect(result).toContain(`"'Helvetica Neue', 'Helvetica', sans-serif"`);
    });

    it('escapes when a string contains both quote styles', () => {
      const result = format(`let s = "it's a \\"quote\\"";`);
      expect(result).toContain(`'it\\'s a "quote"'`);
    });

    it('formatting is idempotent for precedence-heavy sources', () => {
      const src = `let x = calc((i + 0.5) / 28);\nlet font = "'Helvetica Neue', sans-serif";`;
      const once = format(src);
      const twice = format(once);
      expect(twice).toBe(once);
    });
  });

  // --- Trailing blocks ---
  describe('trailing blocks', () => {
    it('formats function call with trailing block', () => {
      const result = format("let g = LinearGradient('sky', 0, 0, 0, 1) {|g|\ng.stop(0, Color('#000'));\ng.stop(1, Color('#fff'));\n};");
      expect(result).toContain('{|g|');
      expect(result).toContain("g.stop(0");
      expect(result).toContain("g.stop(1");
      // Stops should be indented
      expect(result).toContain('  g.stop');
    });

    it('formats method trailing blocks and normalizes to parens form', () => {
      const result = format('let a = [1, 2].map {|v|\nreturn calc(v * 2);\n};');
      expect(result).toContain('.map() {|v|');
      expect(result).toContain('  return calc(v * 2);');
      expect(format(result)).toBe(result); // idempotent
    });
  });

  // --- << worker application ---
  describe('<< worker application', () => {
    it('formats a named-worker application on one line', () => {
      const src = 'let f = {|v| return calc(v * 2); };\nlet a = [1, 2].map() << f;';
      const result = format(src);
      expect(result).toContain('.map() << f;');
      expect(format(result)).toBe(result);
    });

    it('formats a literal-lambda worker with an indented multi-line body', () => {
      const src = 'let a = [1, 2].reduce(0) << {|acc, v|\nreturn calc(acc + v);\n};';
      const result = format(src);
      expect(result).toContain('.reduce(0) << {|acc, v|');
      expect(result).toContain('  return calc(acc + v);');
      expect(result).toMatch(/\n\};/); // closing brace back at statement depth
      expect(format(result)).toBe(result);
    });

    it('preserves user parens on a right-nested << (non-associative)', () => {
      // Re-grouping to the left would evaluate the bare builder call and error.
      const src = 'let mk = {|go, pb| go.stop(0, 5, CurveContinuity.G1); };\nlet spine = @{ l 100 0 };\nlet full = @{ m -10 0 } << (spine.variableOffset() << mk);';
      const result = format(src);
      expect(result).toContain('<< (spine.variableOffset() << mk)');
      expect(format(result)).toBe(result);
    });

    it('left-nested << chains stay paren-free', () => {
      const src = 'let a = b << c << d;';
      const result = format(src);
      expect(result).toContain('let a = b << c << d;');
      expect(format(result)).toBe(result);
    });
  });
});

describe('expression-bodied lambdas', () => {
  it('preserves the expression-body form (no synthesized return printed)', () => {
    const source = "let isDash = {|piece| piece.kind == 'dash'};\n";
    expect(format(source)).toBe(source);
  });

  it('keeps the statement form as statements', () => {
    const source = 'let dbl = {|v|\n  return calc(v * 2);\n};\n';
    expect(format(source)).toBe(source);
  });
});

// --- Switch statements ---
describe('formatDocument switch statements', () => {
  const canonical = [
    'switch (kind) {',
    "  case 'circle' {",
    '    circle(0, 0, 5);',
    '  }',
    "  case 'square', 'rect' {",
    '    rect(0, 0, 5, 5);',
    '  }',
    '  case 0..10 {',
    '    M 0 0',
    '  }',
    '  case 0..<0.25 {',
    '    M 1 1',
    '  }',
    '  case ..<0 {',
    '    M 2 2',
    '  }',
    '  case 100.. {',
    '    M 3 3',
    '  }',
    '  case { x, y } where x > y {',
    '    M x y',
    '  }',
    '  case { x: px, ...rest } {',
    '    M px 0',
    '  }',
    '  case [first, second] {',
    '    M first second',
    '  }',
    '  case [first, ...others] {',
    '    M first 0',
    '  }',
    '  default {',
    '    M 9 9',
    '  }',
    '}',
  ].join('\n');

  it('prints value, range, destructuring, where, and default clauses', () => {
    const messy = [
      'switch (kind) {',
      'case "circle" { circle(0, 0, 5); }',
      'case "square", "rect" { rect(0, 0, 5, 5); }',
      'case 0..10 { M 0 0 } case 0..<0.25 { M 1 1 } case ..<0 { M 2 2 } case 100.. { M 3 3 }',
      'case {x, y} where x > y { M x y }',
      'case {x: px, ...rest} { M px 0 }',
      'case [first, second] { M first second } case [first, ...others] { M first 0 }',
      'default { M 9 9 }',
      '}',
    ].join('\n');
    expect(format(messy)).toBe(canonical);
  });

  it('is idempotent on the canonical form', () => {
    expect(format(canonical)).toBe(canonical);
  });

  it('indents a switch nested in a for loop', () => {
    const src = 'for (i in 0..3) {\nswitch (i) {\ncase 0 { M 0 0 }\ndefault { M i i }\n}\n}';
    const expected = [
      'for (i in 0..3) {',
      '  switch (i) {',
      '    case 0 {',
      '      M 0 0',
      '    }',
      '    default {',
      '      M i i',
      '    }',
      '  }',
      '}',
    ].join('\n');
    expect(format(src)).toBe(expected);
    expect(format(expected)).toBe(expected);
  });

  it('text-form switch keeps tspan and template-literal bodies', () => {
    const src = 'text(10, 30) {\nswitch (level) {\ncase 1, 2 { `Low` }\ncase 3..<7 { tspan()`Medium` }\ndefault { `High` }\n}\n}';
    const expected = [
      'text(10, 30) {',
      '  switch (level) {',
      '    case 1, 2 {',
      '      `Low`',
      '    }',
      '    case 3..<7 {',
      '      tspan()`Medium`;',
      '    }',
      '    default {',
      '      `High`',
      '    }',
      '  }',
      '}',
    ].join('\n');
    expect(format(src)).toBe(expected);
    expect(format(expected)).toBe(expected);
  });

  it('text-form if keeps a nested tspan body (regression: the tspan used to be dropped)', () => {
    const src = 'text(10, 30) {\nif (level > 1) { tspan()`Medium` } else { `Low` }\n}';
    const expected = [
      'text(10, 30) {',
      '  if (level > 1) {',
      '    tspan()`Medium`;',
      '  } else {',
      '    `Low`',
      '  }',
      '}',
    ].join('\n');
    expect(format(src)).toBe(expected);
  });

  it('let destructuring printers still work through the shared pattern formatter', () => {
    expect(format('let [a, b] = arr;')).toBe('let [a, b] = arr;');
    expect(format('let [head, ...tail] = arr;')).toBe('let [head, ...tail] = arr;');
    expect(format('let {x, y: py} = p;')).toBe('let { x, y: py } = p;');
    expect(format('let {x, ...rest} = p;')).toBe('let { x, ...rest } = p;');
  });
});

describe('switch expressions', () => {
  it('prints one arm per line and round-trips patterns, guards, and destructuring', () => {
    const result = format('let r = switch (level) { case 1, 2 { 4 } case 3..<7 where level > 0 { 8 } case {x, y} { x } default { 12 } };');
    expect(result).toBe('let r = switch (level) {\n  case 1, 2 { 4 }\n  case 3..<7 where level > 0 { 8 }\n  case { x, y } { x }\n  default { 12 }\n};');
    expect(format(result)).toBe(result);
  });

  it('keeps a switch expression inside calc() in a path argument', () => {
    const result = format('M 0 0\nL calc(switch (k) { case 1 { 5 } default { 7 } }) 9');
    expect(result).toBe('M 0 0\nL calc(switch (k) {\n  case 1 { 5 }\n  default { 7 }\n}) 9');
    expect(format(result)).toBe(result);
  });
});

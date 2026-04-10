import { describe, it, expect } from 'vitest';
import { StringTextDocument } from '../../src/language-services/document';
import { formatDocument } from '../../src/language-services/formatter';

function format(source: string, indent?: string): string {
  const edits = formatDocument(new StringTextDocument(source), indent ? { indent } : undefined);
  if (edits.length === 0) return source; // Already formatted or unparseable
  return edits[0].newText;
}

describe('formatDocument', () => {
  it('returns empty edits for unparseable source', () => {
    const edits = formatDocument(new StringTextDocument('let x = '));
    expect(edits).toHaveLength(0);
  });

  // --- Section 1: Indentation ---
  describe('indentation', () => {
    it('indents for-loop body with 2 spaces', () => {
      const result = format('for (i in 0..5) {\nM i 0\n}');
      expect(result).toBe('for (i in 0..5) {\n  M i 0\n}');
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
    it('keeps simple call on one line (path context)', () => {
      // Standalone function calls in path context are PathCommands (no semicolon)
      const result = format('circle(100, 100, 50)');
      expect(result).toBe('circle(100, 100, 50)');
    });

    it('keeps 4 args with simple values on one line', () => {
      const result = format('rect(0, 0, 100, 50)');
      expect(result).toBe('rect(0, 0, 100, 50)');
    });

    it('keeps 4 simple args on one line even as path arg', () => {
      // Path context function calls are PathCommand — no wrapping logic applies
      const result = format('rect(0, 0, 100, 50)');
      expect(result).toBe('rect(0, 0, 100, 50)');
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

    it('formats text block form', () => {
      const result = format("text(50, 50) {\n`line one`\n}");
      expect(result).toContain('text(50, 50) {\n');
      expect(result).toContain('  `line one`;');
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
  });
});

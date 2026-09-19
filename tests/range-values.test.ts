import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { parse } from '../src/parser';
import { compilePath } from './helpers';

// Ranges as values: `(a..b)` / `(a..<b)` evaluate to an ordinary array of the
// numbers a `for` loop over the same range visits. Parentheses are part of the
// spelling; `for` headers and `case` arms keep their bare form.
// Docs: docs/syntax.md "Ranges as Values".

/** Every log line of a program, each rendered as the text the user sees. */
function logLines(source: string): string[] {
  return compile(source).logs.map((entry) => entry.parts.map((p) => p.value).join(''));
}

/** The last log line of a program. */
function logged(source: string): string {
  const lines = logLines(source);
  expect(lines.length).toBeGreaterThan(0);
  return lines[lines.length - 1];
}

/** `let _ = <expr>;` → the expression's AST node. */
function exprOf(source: string): any {
  return (parse(`let _ = ${source};`).body[0] as any).value;
}

describe('range values: parsing', () => {
  it('parses (a..b) as an inclusive RangeExpression', () => {
    expect(exprOf('(1..5)')).toMatchObject({
      type: 'RangeExpression',
      start: { type: 'NumberLiteral', value: 1 },
      end: { type: 'NumberLiteral', value: 5 },
      inclusive: true,
    });
  });

  it('parses (a..<b) as a half-open RangeExpression', () => {
    expect(exprOf('(0..<4)')).toMatchObject({
      type: 'RangeExpression',
      start: { type: 'NumberLiteral', value: 0 },
      end: { type: 'NumberLiteral', value: 4 },
      inclusive: false,
    });
  });

  it('records a source location (method-call errors on a range receiver report its line)', () => {
    expect(exprOf('(1..5)').loc).toBeDefined();
  });

  it('accepts full expressions as bounds, like a for header', () => {
    expect(exprOf('(first[0]..limits.max)')).toMatchObject({
      type: 'RangeExpression',
      start: { type: 'IndexExpression', object: { type: 'Identifier', name: 'first' } },
      end: { type: 'MemberExpression', property: 'max' },
    });
    expect(exprOf('(a + 1..<b * 2)')).toMatchObject({
      type: 'RangeExpression',
      start: { type: 'BinaryExpression', operator: '+' },
      end: { type: 'BinaryExpression', operator: '*' },
      inclusive: false,
    });
    expect(exprOf('(-2..2)')).toMatchObject({
      type: 'RangeExpression',
      start: { type: 'UnaryExpression', operator: '-' },
    });
    expect(exprOf('(0..<len(xs))')).toMatchObject({
      type: 'RangeExpression',
      end: { type: 'FunctionCall', name: 'len' },
    });
    expect(exprOf('(0..(big ? 10 : 5))')).toMatchObject({
      type: 'RangeExpression',
      end: { type: 'TernaryExpression' },
    });
  });

  describe('postfix on a range', () => {
    it('.map() with a trailing block', () => {
      expect(exprOf('(1..100).map() {|index| return index * 2; }')).toMatchObject({
        type: 'MethodCallExpression',
        method: 'map',
        object: { type: 'RangeExpression' },
        block: { params: ['index'] },
      });
    });

    it('.map with a trailing block and no parentheses', () => {
      expect(exprOf('(1..100).map {|index| return index * 2; }')).toMatchObject({
        type: 'MethodCallExpression',
        method: 'map',
        object: { type: 'RangeExpression' },
        block: { params: ['index'] },
      });
    });

    it('member access, indexing, and chains', () => {
      expect(exprOf('(1..5).length')).toMatchObject({
        type: 'MemberExpression',
        property: 'length',
        object: { type: 'RangeExpression' },
      });
      expect(exprOf('(1..5)[0]')).toMatchObject({
        type: 'IndexExpression',
        object: { type: 'RangeExpression' },
      });
      expect(exprOf('(1..5).reverse().slice(0, 1)')).toMatchObject({
        type: 'MethodCallExpression',
        method: 'slice',
        object: { type: 'MethodCallExpression', method: 'reverse', object: { type: 'RangeExpression' } },
      });
    });

    it('a << worker applies to a range receiver', () => {
      expect(exprOf('(1..5).map() << double')).toMatchObject({
        type: 'BinaryExpression',
        operator: '<<',
        left: { type: 'MethodCallExpression', method: 'map', object: { type: 'RangeExpression' } },
      });
    });
  });

  describe('for headers and case arms are unchanged', () => {
    it('for (i in a..b) is still a lazy ForLoop', () => {
      expect(parse('for (i in 1..5) { M i 0 }').body[0]).toMatchObject({ type: 'ForLoop', inclusive: true });
      expect(parse('for (i in (a)..(b)) { M i 0 }').body[0].type).toBe('ForLoop');
    });

    it('for (v in (a..b)) is a for-each over the array', () => {
      expect(parse('for (step in (1..5)) { M step 0 }').body[0]).toMatchObject({
        type: 'ForEachLoop',
        variable: 'step',
        iterable: { type: 'RangeExpression' },
      });
      expect(parse('for ([value, position] in (10..12)) { M value position }').body[0]).toMatchObject({
        type: 'ForEachLoop',
        variable: 'value',
        indexVariable: 'position',
        iterable: { type: 'RangeExpression' },
      });
    });

    it('case (a..b) is the same RangePattern as case a..b', () => {
      const bare = parse('switch (t) { case 1..5 { M 1 1 } }').body[0] as any;
      const wrapped = parse('switch (t) { case (1..5) { M 1 1 } }').body[0] as any;
      const strip = ({ loc: _loc, ...rest }: any) => rest;
      expect(wrapped.cases[0].patterns[0]).toMatchObject({
        type: 'RangePattern',
        start: { type: 'NumberLiteral', value: 1 },
        end: { type: 'NumberLiteral', value: 5 },
        inclusive: true,
      });
      expect(strip(wrapped.cases[0].patterns[0]).inclusive).toBe(strip(bare.cases[0].patterns[0]).inclusive);
    });

    it('case (a..b).length stays a value pattern', () => {
      const stmt = parse('switch (t) { case (1..5).length { M 1 1 } }').body[0] as any;
      expect(stmt.cases[0].patterns[0]).toMatchObject({
        type: 'ValuePattern',
        value: { type: 'MemberExpression', property: 'length' },
      });
    });

    it('open-ended case arms still parse', () => {
      const stmt = parse('switch (t) { case ..<0 { M 1 1 } case 100.. { M 2 2 } }').body[0] as any;
      expect(stmt.cases[0].patterns[0]).toMatchObject({ type: 'RangePattern', start: null });
      expect(stmt.cases[1].patterns[0]).toMatchObject({ type: 'RangePattern', end: null });
    });
  });

  // These builders re-parse a source slice and fall back to a NullLiteral when
  // the sub-parse fails, so a silent regression would not throw — pin shapes.
  describe('sub-parsed positions', () => {
    it('return (a..b).map {...};', () => {
      const fn = parse('fn make() { return (1..3).map {|v| return v * 2; }; }').body[0] as any;
      expect(fn.body[0]).toMatchObject({
        type: 'ReturnStatement',
        value: { type: 'MethodCallExpression', method: 'map', object: { type: 'RangeExpression' } },
      });
    });

    it('if ((a..b).length > n)', () => {
      expect(parse('if ((1..3).length > 2) { M 1 1 }').body[0]).toMatchObject({
        type: 'IfStatement',
        condition: {
          type: 'BinaryExpression',
          operator: '>',
          left: { type: 'MemberExpression', object: { type: 'RangeExpression' } },
        },
      });
    });

    it('spread, template interpolation, and a statement that starts with a range', () => {
      expect(exprOf('[0, ...(1..3), 10]')).toMatchObject({
        type: 'ArrayLiteral',
        elements: [{ type: 'NumberLiteral' }, { type: 'SpreadElement', argument: { type: 'RangeExpression' } }, { type: 'NumberLiteral' }],
      });
      expect(exprOf('`n=${(1..3).length}`').type).toBe('TemplateLiteral');
      expect(() => parse('(1..3).map {|v| return v; };')).not.toThrow();
    });
  });

  describe('not a range value', () => {
    it.each([
      ['open upper bound', 'let bad = (1..);'],
      ['open lower bound', 'let bad = (..5);'],
      ['three dots is the spread token', 'let bad = (1...5);'],
      ['a block directly after a range', 'let bad = (1..5) {|x| x};'],
    ])('%s is a parse error', (_label, source) => {
      expect(() => parse(source)).toThrow(/Parse error/);
    });
  });
});

describe('range values: needs-parentheses error', () => {
  it.each([
    ['let declaration', 'let steps = 1..5;'],
    ['half-open let declaration', 'let steps = 0..<5;'],
    ['call argument', 'log(1..5);'],
    ['array literal', 'let list = [1..5];'],
    ['return', 'fn make() { return 1..5; }'],
    ['assignment', 'let steps = 0; steps = 1..5;'],
    ['method receiver without parens', 'let doubled = 1..5.map {|v| return v; };'],
  ])('%s asks for parentheses', (_label, source) => {
    expect(() => parse(source)).toThrow(/A range used as a value needs parentheses/);
  });

  it('echoes simple bounds in the suggestion', () => {
    expect(() => parse('let steps = 1..5;')).toThrow(/write \(1\.\.5\)/);
    expect(() => parse('let steps = 0..<count;')).toThrow(/write \(0\.\.<count\)/);
  });

  it('reports the position of the range operator', () => {
    expect(() => parse('let steps = 1..5;')).toThrow(/line 1, column 14/);
  });

  it('a missing bound gets its own message', () => {
    expect(() => parse('let bad = (1..);')).toThrow(/A range value needs both bounds/);
    expect(() => parse('let bad = (..5);')).toThrow(/A range value needs both bounds/);
  });

  // Open-ended ranges ARE legal in a case arm, bare — so "open-ended ranges
  // only work as case patterns" would tell this user to do what they did.
  it.each([
    ['case (100..)', 'switch (t) { case (100..) { M 1 1 } default { M 0 0 } }', 'write case 100..'],
    ['case (..5)', 'switch (t) { case (..5) { M 1 1 } default { M 0 0 } }', 'write case ..5'],
    ['case (..<0)', 'switch (t) { case (..<0) { M 1 1 } default { M 0 0 } }', 'write case ..<0'],
    ['a switch expression arm', 'let band = switch (t) { case (100..) { 1 } default { 0 } };', 'write case 100..'],
  ])('%s says to drop the parentheses', (_label, source, advice) => {
    expect(() => parse(source)).toThrow(/An open-ended case range takes no parentheses/);
    expect(() => parse(source)).toThrow(advice);
  });

  it('a missing bound nested inside a case pattern still needs both bounds', () => {
    expect(() => parse('switch (t) { case pick((1..)) { M 1 1 } default { M 0 0 } }')).toThrow(/needs both bounds/);
  });

  it('does not fire inside for headers or case arms', () => {
    expect(() => parse('for (i in 1..5) { M i 0 }')).not.toThrow();
    expect(() => parse('switch (t) { case 1..5 { M 1 1 } case 100.. { M 2 2 } case ..<0 { M 3 3 } }')).not.toThrow();
  });

  it('compile() surfaces the same message', () => {
    expect(() => compile('let steps = 1..5;')).toThrow(/A range used as a value needs parentheses/);
  });
});

describe('range values: evaluation', () => {
  // The contract: (a..b) IS the list of values `for (i in a..b)` visits.
  // Each row runs both and compares the logged arrays.
  describe('parity with the for loop', () => {
    const rows: Array<[label: string, range: string, setup?: string]> = [
      ['ascending', '1..5'],
      ['descending', '5..1'],
      ['half-open ascending', '0..<4'],
      ['half-open descending', '5..<0'],
      ['empty half-open', '0..<0'],
      ['single value', '3..3'],
      ['single value half-open is empty', '3..<3'],
      ['fractional start', '0.5..3'],
      ['fractional end', '0..2.5'],
      ['fractional half-open end', '0..<2.5'],
      ['fractional descending', '2.5..0'],
      ['negative to positive', '-2..2'],
      ['negative descending', '-1..-4'],
      ['boolean bounds', 'false..true'],
      ['variable bounds', 'low..high', 'let low = 2; let high = 6;'],
      ['expression bounds', 'low + 1..<high * 2', 'let low = 2; let high = 3;'],
      ['member and index bounds', 'limits.min..items[1]', 'let limits = { min: 1 }; let items = [9, 4];'],
      ['array length bound', '0..<items.length', 'let items = [7, 8, 9];'],
      ['call bounds', 'floor(1.9)..ceil(3.1)'],
    ];

    it.each(rows)('%s: (%s)', (_label, range, setup = '') => {
      const viaLoop = logged(`${setup} let collected = []; for (i in ${range}) { collected.push(i); } log(\`\${collected}\`);`);
      const viaValue = logged(`${setup} let collected = (${range}); log(\`\${collected}\`);`);
      expect(viaValue).toBe(viaLoop);
    });

    it('pins a few concrete results so parity cannot pass vacuously', () => {
      expect(logged('log(`${(1..5)}`);')).toBe('[1, 2, 3, 4, 5]');
      expect(logged('log(`${(0..<4)}`);')).toBe('[0, 1, 2, 3]');
      expect(logged('log(`${(5..1)}`);')).toBe('[5, 4, 3, 2, 1]');
      expect(logged('log(`${(0..<0)}`);')).toBe('[]');
      expect(logged('log(`${(0.5..3)}`);')).toBe('[0.5, 1.5, 2.5]');
    });

    it('angle bounds count in radians, exactly like the loop', () => {
      expect(logged('log(`${(0deg..90deg)}`);')).toBe('[0, 1]');
    });
  });

  describe('it is an ordinary array', () => {
    it('map (the headline example)', () => {
      const out = logged('let items = (1..100).map() {|index| return index * 2; }; log(`${items.length} ${items[0]} ${items[99]}`);');
      expect(out).toBe('100 2 200');
    });

    it('map binds the zero-based position as the second param', () => {
      expect(logged('let pairs = (10..12).map {|value, position| return value * 10 + position; }; log(`${pairs}`);')).toBe('[100, 111, 122]');
    });

    it('filter, reduce, sort, slice, reverse, mapSlice', () => {
      expect(logged('let evens = (0..<10).filter {|value| return value % 2 == 0; }; log(`${evens}`);')).toBe('[0, 2, 4, 6, 8]');
      expect(logged('let total = (1..10).reduce(0) {|sum, value| return sum + value; }; log(`${total}`);')).toBe('55');
      expect(logged('let sorted = (1..4).sort {|left, right| return right - left; }; log(`${sorted}`);')).toBe('[4, 3, 2, 1]');
      expect(logged('log(`${(1..5).slice(1, 2)}`);')).toBe('[2, 3]');
      expect(logged('log(`${(1..3).reverse()}`);')).toBe('[3, 2, 1]');
      // Whatever mapSlice does for the literal, it does for the range.
      expect(logged('log(`${(0..3).mapSlice(2)}`);')).toBe(logged('log(`${[0, 1, 2, 3].mapSlice(2)}`);'));
    });

    it('length, first, last, indexing, empty()', () => {
      expect(logged('log(`${(1..5).length} ${(1..5).first} ${(1..5).last} ${(1..5)[2]}`);')).toBe('5 1 5 3');
      expect(logged('log(`${(0..<0).length} ${(0..<0).first}`);')).toBe('0 null');
    });

    it('nested ranges build a grid of numbers', () => {
      const out = logged('let cells = (0..<2).map {|row| return (0..<3).map {|col| return row * 3 + col; }; }; log(`${cells}`);');
      expect(out).toBe('[[0, 1, 2], [3, 4, 5]]');
    });

    it('<< workers apply to a range receiver', () => {
      expect(logged('let double = {|value| return value * 2; }; let out = (1..3).map() << double; log(`${out}`);')).toBe('[2, 4, 6]');
      expect(logged('fn keepOdd(value) { return value % 2 == 1; } let out = (1..5).filter() << keepOdd; log(`${out}`);')).toBe('[1, 3, 5]');
    });

    it('works inside calc() in path-argument position', () => {
      expect(compilePath('M calc((1..5).length * 2) calc((1..5).last)')).toBe('M 10 5');
    });

    it('every evaluation is a fresh array (no aliasing)', () => {
      const out = logged(`
        fn make() { return (1..3); }
        let first = make();
        let second = make();
        first.push(99);
        log(\`\${first} \${second}\`);
      `);
      expect(out).toBe('[1, 2, 3, 99] [1, 2, 3]');
    });

    it('a range stored in a variable is locked during its own iteration', () => {
      expect(() => compile('let steps = (1..3); let out = steps.map {|value| steps.push(value); return value; };')).toThrow(/while it is being iterated/);
    });

    it('for-each, spread, and destructuring (docs example)', () => {
      const lines = logLines(`
        let padded = [0, ...(1..3), 10];
        let [first, second, ...others] = (10..14);
        log(\`\${padded}\`);
        log(\`\${first} \${second} \${others}\`);
        for ([value, index] in (10..12)) {
          log(\`\${index}:\${value}\`);
        }
      `);
      expect(lines).toEqual(['[0, 1, 2, 3, 10]', '10 11 [12, 13, 14]', '0:10', '1:11', '2:12']);
    });

    it('case (a..b) is an interval test, not an array comparison', () => {
      const program = (value: string) => `
        let band = switch (${value}) { case (1..5) { 1 } default { 0 } };
        log(\`\${band}\`);
      `;
      expect(logged(program('2.5'))).toBe('1');
      expect(logged(program('6'))).toBe('0');
    });
  });

  describe('docs examples', () => {
    it('the log ladder (docs example)', () => {
      const lines = logLines(
        'let steps = (1..5); log(`${steps}`); log(`${(0..<4)}`); log(`${(5..1)}`); log(`${(0..<0)}`); log(`${(0.5..3)}`);',
      );
      expect(lines).toEqual(['[1, 2, 3, 4, 5]', '[0, 1, 2, 3]', '[5, 4, 3, 2, 1]', '[]', '[0.5, 1.5, 2.5]']);
    });

    it('before/after: the loop-and-push form equals the range form (docs example)', () => {
      const lines = logLines(`
        let doubledByLoop = [];
        for (index in 1..100) {
          doubledByLoop.push(index * 2);
        }
        let doubled = (1..100).map {|index|
          return index * 2;
        };
        log(\`\${doubled}\`);
        log(\`\${doubledByLoop}\`);
      `);
      expect(lines[0]).toBe(lines[1]);
      expect(lines[0].startsWith('[2, 4, 6,')).toBe(true);
      expect(lines[0].endsWith(', 198, 200]')).toBe(true);
    });

    it('filter and reduce (docs example)', () => {
      const lines = logLines(`
        let evens = (0..<20).filter {|value|
          return value % 2 == 0;
        };
        let total = (1..10).reduce(0) {|sum, value|
          return sum + value;
        };
        log(\`\${evens}\`);
        log(\`\${total}\`);
      `);
      expect(lines).toEqual(['[0, 2, 4, 6, 8, 10, 12, 14, 16, 18]', '55']);
    });

    it('one range, two derived lists (docs example)', () => {
      const program = (range: string) => `
        define ViewBox(0, 0, 240, 60);

        let columns = ${range};
        let spacing = viewbox.width / (columns.length + 1);

        let centers = columns.map {|column|
          return Point((column + 1) * spacing, viewbox.height / 2);
        };
        let radii = columns.map {|column|
          return 3 + column;
        };

        for ([center, index] in centers) {
          circle(center.x, center.y, radii[index]);
        }
        log(\`\${radii}\`);
        log(\`\${centers.first.x} \${centers.last.x}\`);
      `;
      const eight = compile(program('(0..<8)'));
      const eightData = eight.layers.map((layer: any) => layer.data ?? '').join(' ');
      // circle() emits one M per circle
      expect(eightData.match(/M/g)?.length).toBe(8);
      const eightLogs = eight.logs.map((entry) => entry.parts.map((p) => p.value).join(''));
      expect(eightLogs[0]).toBe('[3, 4, 5, 6, 7, 8, 9, 10]');
      // first and last centers sit one `spacing` in from each edge: 240 / 9
      const [firstX, lastX] = eightLogs[1].split(' ').map(Number);
      expect(firstX).toBeCloseTo(240 / 9, 6);
      expect(lastX).toBeCloseTo((240 / 9) * 8, 6);
      // "Change (0..<8) to (0..<5) and everything follows"
      const five = compile(program('(0..<5)'));
      expect(five.layers.map((layer: any) => layer.data ?? '').join(' ').match(/M/g)?.length).toBe(5);
    });

    it('scaling whole steps into angles (docs example)', () => {
      const out = logged('let quarters = (0..<4).map {|quarter| return quarter * 90deg; }; log(`${quarters.length}`);');
      expect(out).toBe('4');
    });
  });
});

describe('range values: errors', () => {
  it('non-numeric bounds', () => {
    expect(() => compile('let bad = ("a".."c");')).toThrow(/Line 1.*range bounds must be numeric/);
    expect(() => compile('let ok = 1;\nlet bad = (1..null);')).toThrow(/Line 2.*range bounds must be numeric/);
  });

  it('non-finite bounds', () => {
    expect(() => compile('let bad = (0..1 / 0);')).toThrow(/range bounds must be finite \(got Infinity or NaN\)/);
  });

  it('the 32,000 cap applies to the exact element count', () => {
    expect(() => compile('let big = (0..<32001);')).toThrow('range would produce 32001 elements (max 32000)');
    expect(logged('log(`${(0..<32000).length}`);')).toBe('32000');
  });

  it('the for-loop messages are unchanged', () => {
    expect(() => compilePath('for (i in "a".."c") { L i 0 }')).toThrow('for loop range must be numeric');
    expect(() => compilePath('for (i in 0..<32001) { L i 0 }')).toThrow('for loop would run 32001 iterations (max 32000)');
  });

  it('reading one number out of a range in a path argument (docs example)', () => {
    expect(compilePath('M 0 0 L calc((1..3).last) 5')).toBe('M 0 0 L 3 5');
    expect(() => compilePath('M 0 0 L (1..3) 5')).toThrow(/range cannot be used as a path argument/);
  });

  it('a range is not a number', () => {
    expect(() => compile('let bad = -(1..5);')).toThrow(/requires numeric operand/);
    expect(() => compilePath('M calc((1..5)) 0')).toThrow(/must evaluate to a number/);
  });
});

describe('range values: path-argument guard', () => {
  // The path-args shadow grammar used to read `(1..3)` as `1` then `.3`.
  it.each([
    ['a bare range', 'M 0 0 L (1..3) 5;'],
    ['a half-open range', 'M 0 0 L (1..<3) 5;'],
    ['a range passed to a function', 'fn pick(list) { return 1; } M 0 0 L pick((1..3)) 5;'],
    ['a range statement swallowed by a path command with no semicolon', 'M 0 0\n(1..3).map {|value| return value; };'],
  ])('%s is a compile error', (_label, source) => {
    expect(() => compile(source)).toThrow(/range cannot be used as a path argument/);
  });

  it('two numbers typed with no space are caught too, and the message covers that cause', () => {
    // `L 1..3 5` used to read as 1, 0.3, 5 — the same silent miscompile.
    expect(() => compile('M 0 0 L 1..3 5;')).toThrow(/If these are two numbers, put a space between them/);
  });

  it('the suggested fix actually works (calc() alone would not: a range is an array)', () => {
    expect(() => compile('M 0 0 L (1..3) 5;')).toThrow(/calc\(\(1\.\.3\)\.last\)/);
    expect(compilePath('M 0 0 L calc((1..3).last) 5')).toBe('M 0 0 L 3 5');
    expect(() => compilePath('M 0 0 L calc((1..3)) 5')).toThrow(/must evaluate to a number/);
  });

  it('mentions the missing semicolon, since that is the likeliest cause', () => {
    expect(() => compile('M 0 0\n(1..3).map {|value| return value; };')).toThrow(/';'/);
  });

  it.each([
    ['calc() interior', 'M 0 0 L calc((1..3).length) 5', 'M 0 0 L 3 5'],
    ['indexing', 'let pts = [Point(4, 6)]; M pts[0].x 5', 'M 4 5'],
    ['a range spread inside an array literal', 'M 0 0 L [...(1..3)][0] 5', 'M 0 0 L 1 5'],
    ['decimals', 'M 0.5 .25 L 1.5 -.75', 'M 0.5 0.25 L 1.5 -0.75'],
  ])('no false positive: %s', (_label, source, expected) => {
    expect(compilePath(source)).toBe(expected);
  });
});

describe('array callbacks: semantics preserved by the no-throw fast path', () => {
  it('top-level return, nested return, and no return', () => {
    expect(logged('log(`${[1, 2, 3].map {|v| return v * 2; }}`);')).toBe('[2, 4, 6]');
    expect(logged('log(`${[1, 2, 3].map {|v| if (v == 2) { return 0; } return v; }}`);')).toBe('[1, 0, 3]');
    expect(logged('log(`${[1, 2].map {|v| let unused = v; }}`);')).toBe('[null, null]');
  });

  it('a return nested inside a loop stops the callback', () => {
    expect(logged('log(`${[3, 5].map {|limit| for (i in 0..10) { if (i == limit) { return i * 10; } } return -1; }}`);')).toBe('[30, 50]');
  });

  it('expression-bodied blocks', () => {
    expect(logged('log(`${[1, 2, 3].map {|v| v * 2}}`);')).toBe('[2, 4, 6]');
    expect(logged('log(`${[1, 2, 3, 4].filter {|v| v % 2 == 0}}`);')).toBe('[2, 4]');
    expect(logged('log(`${[1, 2, 3].reduce(10) {|acc, v| acc + v}}`);')).toBe('16');
  });

  it('filter keeps on truthy nested returns; reduce threads nested returns', () => {
    expect(logged('log(`${[1, 2, 3, 4].filter {|v| if (v > 2) { return true; } return false; }}`);')).toBe('[3, 4]');
    expect(logged('log(`${[1, 2, 3].reduce(0) {|acc, v| if (v == 2) { return acc; } return acc + v; }}`);')).toBe('4');
  });

  it('errors keep the callback + index wrapper', () => {
    expect(() => compile('let out = [1, 2, 3].map {|v| if (v == 3) { return missing; } return v; };')).toThrow(/Error in \.map\(\) callback at index 2/);
    expect(() => compile('let out = [1, 2].filter {|v| return missing; };')).toThrow(/Error in \.filter\(\) callback at index 0/);
    expect(() => compile('let out = [1, 2].reduce(0) {|acc, v| return missing; };')).toThrow(/Error in \.reduce\(\) callback at index 0/);
  });

  it('path commands inside a callback are discarded', () => {
    expect(compilePath('M 1 1 let out = [1, 2].map {|v| L 50 50 return v; }; L 2 2')).toBe('M 1 1 L 2 2');
  });

  it('the receiver stays locked for the whole iteration and unlocks after an error', () => {
    expect(() => compile('let list = [1, 2]; let out = list.map {|v| list.push(v); return v; };')).toThrow(/while it is being iterated/);
    expect(logged('let list = [1, 2]; let out = list.map {|v| return v; }; list.push(3); log(`${list}`);')).toBe('[1, 2, 3]');
  });

  // 32,000 callbacks used to take ~14 s (one throw/catch per element inside
  // the very large evaluateMethodCall). Generous budget: the point is to catch
  // a return to seconds-per-call, not to benchmark.
  it('map, filter, and reduce over 32,000 elements finish quickly', () => {
    const started = Date.now();
    const out = logged(`
      let doubled = (1..32000).map {|value| return value * 2; };
      let kept = doubled.filter {|value| return value % 3 == 0; };
      let total = kept.reduce(0) {|sum, value| return sum + value; };
      log(\`\${doubled.length} \${kept.length} \${total}\`);
    `);
    expect(out).toBe('32000 10666 341322666');
    expect(Date.now() - started).toBeLessThan(5000);
  }, 60000);
});

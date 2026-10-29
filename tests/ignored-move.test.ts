/**
 * The `ignored-move` warning (docs/debug.md "A move a shape ignores"). The
 * shape functions draw at the coordinates in their own arguments and start a
 * new subpath with an absolute `M`, so a move right before one has no effect.
 * `M 85 52 roundRect(0, 0, 320, 220, 14);` used to compile silently and draw
 * the rectangle at (0, 0); the output is unchanged, but now the compiler says
 * why.
 */
import { describe, expect, it } from 'vitest';

import { compile, compileWithContext, groupWarnings } from '../src';
import { WARNING_CODES } from '../src/evaluator/types';

function ignoredMoves(source: string) {
  return compile(source).warnings.filter((w) => w.code === 'ignored-move');
}

const ROUND_RECT_MESSAGE =
  'roundRect() draws at the coordinates in its own arguments, so the move to (85, 52) before it has no effect — put the position in its arguments instead';

describe('ignored-move warning', () => {
  it('is a warning code (so --strict=ignored-move is accepted)', () => {
    expect(WARNING_CODES).toContain('ignored-move');
  });

  it('warns at the call when the move and the shape share a statement (the docs example)', () => {
    const result = compile('M 85 52 roundRect(0, 0, 320, 220, 14);');
    expect(result.warnings).toEqual([{ code: 'ignored-move', message: ROUND_RECT_MESSAGE, line: 1, column: 9 }]);
    // The output is what it always was: the move, then the shape at its own coordinates.
    expect(result.layers[0].data.startsWith('M 85 52 M 14 0 ')).toBe(true);
  });

  it('names the move line when the move is a statement of its own', () => {
    expect(ignoredMoves('M 85 52\nroundRect(0, 0, 320, 220, 14);')).toEqual([
      {
        code: 'ignored-move',
        message:
          'roundRect() draws at the coordinates in its own arguments, so the move to (85, 52) on line 1 has no effect — put the position in its arguments instead',
        line: 2,
        column: 1,
      },
    ]);
  });

  it('reports a relative move by where it lands', () => {
    // M 5 5 is followed by a relative m (it still counts); the m is the move circle() ignores.
    const warnings = ignoredMoves('M 5 5\nm 10 10\ncircle(50, 50, 5);');
    expect(warnings.map((w) => [w.line, w.message.split(',')[0]])).toEqual([
      [3, 'circle() draws at the coordinates in its own arguments'],
    ]);
    expect(warnings[0].message).toContain('the move to (15, 15) on line 2 has no effect');
  });

  it.each([
    ['circle', 'circle(50, 50, 5)'],
    ['rect', 'rect(10, 10, 20, 20)'],
    ['polygon', 'polygon(50, 50, 10, 5)'],
    ['star', 'star(50, 50, 10, 5, 5)'],
    ['line', 'line(0, 0, 10, 10)'],
    ['quadratic', 'quadratic(0, 0, 5, 10, 10, 0)'],
    ['cubic', 'cubic(0, 0, 3, 10, 7, 10, 10, 0)'],
    ['moveTo', 'moveTo(5, 5)'],
    ['squareGrid', "squareGrid('shape', 0, 0, 40, 40, 20)"],
    ['triangleGrid', "triangleGrid('shape', 0, 0, 40, 40, 20)"],
    ['hexagonGrid', "hexagonGrid('dot', 0, 0, 40, 40, 20)"],
  ])('warns for %s(), which starts its own subpath', (name, call) => {
    const warnings = ignoredMoves(`M 100 100\n${call};`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message.startsWith(`${name}() draws at the coordinates in its own arguments`)).toBe(true);
  });

  it.each([
    ['a drawing command in between', 'M 10 10 L 20 20\ncircle(50, 50, 5);'],
    ['a shape first in the program', 'circle(50, 50, 5);'],
    ['a shape after a shape', 'circle(50, 50, 5);\ncircle(80, 50, 5);'],
    ['a move with a line after it in the same command', 'M 10 10 20 20 circle(50, 50, 5);'],
    ['a path block drawn at the pen', 'let tile = @{ roundRect(0, 0, 32, 22, 4); };\nM 85 52 tile.draw();'],
    ['arc(), which continues from the pen', 'M 10 10\narc(10, 10, 0, 0, 1, 20, 0);'],
    ['lineTo(), which continues from the pen', 'M 10 10\nlineTo(20, 20);'],
    ['radialWedge(), which starts with a relative m', 'M 10 10\nradialWedge(10, 20, 0deg, 90deg, 2);'],
    ['a context-aware function', 'M 10 10\npolarLine(0deg, 20);'],
    [
      'a move in another layer',
      "define PathLayer('a') #{ stroke: red; };\nlayer('a').apply { M 10 10 }\ncircle(50, 50, 5);",
    ],
  ])('does not warn for %s', (_, source) => {
    expect(ignoredMoves(source)).toEqual([]);
  });

  it('warns inside a path block, where the shape is block-frame absolute', () => {
    // Path blocks take relative commands only, so the move is an `m`.
    const warnings = ignoredMoves('let b = @{ m 5 5 circle(0, 0, 3); };\nb.draw();');
    expect(warnings.map((w) => w.line)).toEqual([1]);
    expect(warnings[0].message).toContain('the move to (5, 5) before it has no effect');
  });

  it('in a loop, every instance is kept and the surfaces show them as one family', () => {
    // docs/debug.md "Repeated warnings": like a fillet on every contour, the
    // instances differ only in their numbers, so they group as one ×N row.
    const result = compile('for (i in 0..<200) {\n  M calc(i * 2) 0\n  circle(calc(i * 2), 50, 1);\n}');
    const warnings = result.warnings.filter((w) => w.code === 'ignored-move');
    expect(warnings).toHaveLength(200);
    expect(groupWarnings(warnings).map((g) => [g.code, g.line, g.count])).toEqual([['ignored-move', 3, 200]]);
  });

  it('warns once per ignored move', () => {
    expect(ignoredMoves('M 10 10\ncircle(50, 50, 5);\ncircle(80, 50, 5);')).toHaveLength(1);
  });

  it('stops the compile under strict mode, at the call', () => {
    expect(() => compile('M 85 52 roundRect(0, 0, 320, 220, 14);', { strict: ['ignored-move'] })).toThrow(
      `Line 1, col 9: ${ROUND_RECT_MESSAGE} (strict: ignored-move)`,
    );
  });

  it('reaches compileWithContext the same way', () => {
    expect(compileWithContext('M 85 52 roundRect(0, 0, 320, 220, 14);').warnings).toEqual([
      { code: 'ignored-move', message: ROUND_RECT_MESSAGE, line: 1, column: 9 },
    ]);
  });
});

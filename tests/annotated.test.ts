import { describe, expect, it } from 'vitest';

import { compileAnnotated } from '../src';

describe('Annotated Output', () => {
  describe('basic path commands', () => {
    it('outputs each path command on its own line', () => {
      const result = compileAnnotated('M 0 0 L 10 20 Z');
      const lines = result.split('\n').filter((l) => l.trim());
      expect(lines).toContain('M 0 0');
      expect(lines).toContain('L 10 20');
      expect(lines).toContain('Z');
    });

    it('preserves path command values', () => {
      const result = compileAnnotated('M 100 200');
      expect(result).toContain('M 100 200');
    });
  });

  describe('comments', () => {
    it('preserves single line comments', () => {
      const result = compileAnnotated('// This is a comment\nM 0 0');
      expect(result).toContain('// This is a comment');
    });

    it('preserves multiple comments', () => {
      const result = compileAnnotated(`// First
M 0 0
// Second
L 10 20`);
      expect(result).toContain('// First');
      expect(result).toContain('// Second');
    });

    it('preserves inline comments', () => {
      const result = compileAnnotated('M 0 0 // start point');
      expect(result).toContain('// start point');
    });
  });

  describe('for loops', () => {
    it('annotates simple for loop', () => {
      // 0..3 is inclusive: 0, 1, 2, 3
      const result = compileAnnotated('for (i in 0..3) { M i 0 }');
      expect(result).toContain('//--- for (i in 0..3) from line 1');
      expect(result).toContain('//--- iteration 0');
      expect(result).toContain('//--- iteration 1');
      expect(result).toContain('//--- iteration 2');
      expect(result).toContain('//--- iteration 3');
    });

    it('shows correct line number for loop', () => {
      const result = compileAnnotated(`M 0 0
for (i in 0..2) { L i 0 }`);
      expect(result).toContain('from line 2');
    });

    it('truncates long loops', () => {
      // 0..20 is inclusive: 21 iterations (0 through 20)
      // First 3: 0, 1, 2. Last 3: 18, 19, 20. Skip: 15
      const result = compileAnnotated('for (i in 0..20) { M i 0 }');
      expect(result).toContain('//--- iteration 0');
      expect(result).toContain('//--- iteration 1');
      expect(result).toContain('//--- iteration 2');
      expect(result).toContain('... 15 more iterations ...');
      expect(result).toContain('//--- iteration 18');
      expect(result).toContain('//--- iteration 19');
      expect(result).toContain('//--- iteration 20');
      // Should NOT contain middle iterations
      expect(result).not.toContain('//--- iteration 10');
    });

    it('shows all iterations for short loops', () => {
      // 0..5 is inclusive: 6 iterations (0 through 5), below truncation threshold
      const result = compileAnnotated('for (i in 0..5) { M i 0 }');
      expect(result).toContain('//--- iteration 0');
      expect(result).toContain('//--- iteration 1');
      expect(result).toContain('//--- iteration 2');
      expect(result).toContain('//--- iteration 3');
      expect(result).toContain('//--- iteration 4');
      expect(result).toContain('//--- iteration 5');
      expect(result).not.toContain('more iterations');
    });
  });

  describe('function calls', () => {
    it('annotates stdlib function calls', () => {
      const result = compileAnnotated('circle(50, 50, 25);');
      expect(result).toContain('//--- circle(50, 50, 25) called from line 1');
    });

    it('shows correct line number for function calls', () => {
      // Note: Function calls need to be separate statements (not after path commands)
      // because otherwise they're parsed as path arguments
      const result = compileAnnotated(`// Setup
circle(100, 100, 50);`);
      expect(result).toContain('from line 2');
    });

    it('annotates user-defined function calls', () => {
      const result = compileAnnotated(`fn square(x, y, s) {
  M x y
  L calc(x + s) y
  L calc(x + s) calc(y + s)
  L x calc(y + s)
  Z
}
square(10, 10, 50);`);
      expect(result).toContain('//--- square(10, 10, 50) called from line');
      expect(result).toContain('M 10 10');
      expect(result).toContain('L 60 10');
    });
  });

  describe('nested structures', () => {
    it('handles nested loops', () => {
      const result = compileAnnotated(`
for (i in 0..2) {
  for (j in 0..2) {
    M i j
  }
}`);
      // Should have outer loop annotation
      expect(result).toContain('//--- for (i in 0..2)');
      // Should have inner loop annotations
      expect(result).toContain('//--- for (j in 0..2)');
    });

    it('handles function calls inside loops', () => {
      const result = compileAnnotated(`
for (i in 0..3) {
  circle(calc(i * 50), 50, 20);
}`);
      expect(result).toContain('//--- for (i in 0..3)');
      expect(result).toContain('//--- circle');
    });
  });

  describe('variables and expressions', () => {
    it('evaluates variables in output', () => {
      const result = compileAnnotated(`
let x = 100;
let y = 200;
M x y`);
      expect(result).toContain('M 100 200');
    });

    it('evaluates calc expressions', () => {
      const result = compileAnnotated('M calc(10 + 20) calc(5 * 3)');
      expect(result).toContain('M 30 15');
    });
  });

  describe('if statements', () => {
    it('only shows executed branch', () => {
      const result = compileAnnotated(`
let x = 10;
if (x > 5) {
  M 100 100
} else {
  M 0 0
}`);
      expect(result).toContain('M 100 100');
      expect(result).not.toContain('M 0 0');
    });
  });

  describe('complex examples', () => {
    it('handles spiral example', () => {
      const result = compileAnnotated(`
// Spiral pattern
M 100 100
for (i in 1..5) {
  let angle = calc(i * 0.5);
  let r = calc(i * 10);
  L calc(100 + r) calc(100 + r)
}`);
      expect(result).toContain('// Spiral pattern');
      expect(result).toContain('M 100 100');
      expect(result).toContain('//--- for (i in 1..5)');
      expect(result).toContain('//--- iteration 1');
    });

    it('handles steps function', () => {
      // User function called as separate statement
      const result = compileAnnotated(`
fn steps(count, tread, riser) {
  for (i in 0..count) {
    h tread
    v riser
  }
}
steps(3, 20, 10);`);
      expect(result).toContain('//--- steps(3, 20, 10)');
      expect(result).toContain('//--- for (i in 0..3)');
      expect(result).toContain('h 20');
      expect(result).toContain('v 10');
    });
  });

  describe('context-aware functions', () => {
    it('handles polarLine', () => {
      const result = compileAnnotated('M 50 50 polarLine(0, 100);');
      expect(result).toContain('L');
      expect(result).toContain('150'); // 50 + 100*cos(0) = 150
    });

    it('handles arcFromCenter', () => {
      const result = compileAnnotated('arcFromCenter(0, 0, 50, 0, 90deg, 1);');
      // arcFromCenter now emits L (not M) to keep paths continuous
      expect(result).toContain('L');
      expect(result).toContain('A');
    });

    it('handles arcFromPolarOffset', () => {
      const result = compileAnnotated('arcFromPolarOffset(0, 50, 90deg);');
      // arcFromPolarOffset emits only A (no L or M)
      expect(result).toContain('A 50 50');
      expect(result).not.toContain('L');
    });

    it('handles tangentLine after arc', () => {
      const result = compileAnnotated(`
arcFromCenter(0, 0, 50, 0, 90deg, 1);
tangentLine(20);`);
      expect(result).toContain('L');
    });

    it('handles polarMove', () => {
      const result = compileAnnotated('M 0 0 polarMove(0, 100);');
      expect(result).toContain('L');
      expect(result).toContain('100'); // 0 + 100*cos(0) = 100
    });
  });

  describe('return statements', () => {
    it('handles explicit return in user function', () => {
      const result = compileAnnotated(`
fn double(x) { return calc(x * 2); }
M double(5) 0`);
      expect(result).toContain('M 10 0');
    });

    it('handles return in nested function call', () => {
      const result = compileAnnotated(`
fn add(a, b) { return calc(a + b); }
fn triple(x) { return calc(x * 3); }
M add(triple(2), 4) 0`);
      expect(result).toContain('M 10 0'); // triple(2)=6, add(6,4)=10
    });
  });

  describe('angle units', () => {
    it('converts deg to radians', () => {
      const result = compileAnnotated('M calc(sin(90deg)) 0');
      expect(result).toContain('M 1 0');
    });

    it('handles degrees in polarLine', () => {
      // polarLine(90deg, 100) at position (50, 50) should go to (50, 150)
      const result = compileAnnotated('M 50 50 polarLine(90deg, 100);');
      expect(result).toContain('L');
      expect(result).toContain('150'); // 50 + 100*sin(90deg) = 150
    });
  });

  describe('member expressions in path args', () => {
    it('handles ctx.position.x', () => {
      const result = compileAnnotated('M 100 200 L calc(ctx.position.x + 50) ctx.position.y');
      expect(result).toContain('M 100 200');
      expect(result).toContain('L 150 200');
    });
  });

  describe('spline stdlib functions', () => {
    it('annotates cubicSpline call with relative path commands', () => {
      const result = compileAnnotated(`cubicSpline([
        { x: 0, y: 0, angle: 0, exit: 30 },
        { x: 100, y: 0, angle: 0, entry: 30 }
      ]);`);
      expect(result).toContain('//--- cubicSpline');
      expect(result).toContain('called from line 1');
      expect(result).toContain('m 0 0');
      expect(result).toContain('c 30 0 70 0 100 0');
    });

    it('annotates quadSpline call', () => {
      const result = compileAnnotated(`quadSpline(
        { x: 0, y: 0, angle: 0, exit: 40 },
        [],
        { x: 100, y: 50 }
      );`);
      expect(result).toContain('//--- quadSpline');
      expect(result).toContain('m 0 0');
      expect(result).toContain('q 40 0 100 50');
    });

    it('annotates clippedQuadSpline call', () => {
      const result = compileAnnotated(`clippedQuadSpline(
        { x: 0, y: 0, angle: 0, exit: 50, exitTime: 1 },
        [],
        { x: 100, y: 0, entryTime: 1 }
      );`);
      expect(result).toContain('//--- clippedQuadSpline');
      expect(result).toContain('m 0 0');
      expect(result).toContain('c 50 0 50 0 100 0');
    });
  });

  describe('heading and turn', () => {
    it('heading() does not emit commands', () => {
      const result = compileAnnotated('M 50 100\nheading(0);\ntangentLine(30);');
      expect(result).toContain('M 50 100');
      expect(result).toContain('L 80 100');
    });

    it('turn() adjusts heading', () => {
      const result = compileAnnotated('M 0 0\nL 50 0\nturn(90deg);\ntangentLine(30);');
      expect(result).toContain('L 50 30');
    });
  });

  describe('destructuring', () => {
    it('destructures object literals', () => {
      const result = compileAnnotated('let { x, y } = { x: 20, y: 30 };\nM x y');
      expect(result).toContain('M 20 30');
    });

    it('destructures arrays', () => {
      const result = compileAnnotated('let [px, py] = [15, 25];\nM px py');
      expect(result).toContain('M 15 25');
    });

    it('destructures Point like the main evaluator', () => {
      const result = compileAnnotated('let { x, y } = Point(20, 30);\nM x y');
      expect(result).toContain('M 20 30');
    });

    it('destructures Point with rename and rest', () => {
      const result = compileAnnotated('let { x: px, ...rest } = Point(40, 60);\nM px rest.y');
      expect(result).toContain('M 40 60');
    });

    it('destructures Grid computed properties', () => {
      const result = compileAnnotated('let { width, height } = Grid(4, 5, { xDim: 10, yDim: 10 });\nM width height');
      expect(result).toContain('M 50 40');
    });

    it('destructures ctx.position mid-path', () => {
      const result = compileAnnotated('M 50 50\nL 120 80\nlet { x, y } = ctx.position;\nM x y');
      expect(result).toContain('M 120 80');
    });

    it('throws with line number for a missing struct key', () => {
      expect(() => compileAnnotated('let { z } = Point(1, 2);')).toThrow(
        /Line 1.*Property 'z' does not exist on Point/,
      );
    });

    it('destructures inside a TextBlock text body without throwing', () => {
      expect(() =>
        compileAnnotated(`let t = &{
  text(0, 0) {
    let { x, y } = Point(7, 9);
    \`at \${x},\${y}\`
  }
};`),
      ).not.toThrow();
    });

    it('missing struct key inside a TextBlock text body reports a line number', () => {
      expect(() =>
        compileAnnotated(`let t = &{
  text(0, 0) {
    let { z } = Point(1, 2);
    \`hi\`
  }
};`),
      ).toThrow(/Line \d+.*Property 'z' does not exist on Point/);
    });

    it('still throws when destructuring a plain number', () => {
      expect(() => compileAnnotated('let { x } = 5;')).toThrow(/cannot destructure/i);
    });
  });
});

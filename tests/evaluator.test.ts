import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { compilePath } from './helpers';

describe('Evaluator', () => {
  describe('path commands', () => {
    it('evaluates simple path commands', () => {
      expect(compilePath('M 10 20')).toBe('M 10 20');
    });

    it('evaluates multiple path commands', () => {
      expect(compilePath('M 0 0 L 10 20 Z')).toBe('M 0 0 L 10 20 Z');
    });

    it('evaluates negative numbers', () => {
      expect(compilePath('M -10 -20')).toBe('M -10 -20');
    });

    it('evaluates decimal numbers', () => {
      expect(compilePath('M 10.5 20.75')).toBe('M 10.5 20.75');
    });

    it('evaluates H (horizontal line)', () => {
      expect(compilePath('H 50')).toBe('H 50');
    });

    it('evaluates V (vertical line)', () => {
      expect(compilePath('V 50')).toBe('V 50');
    });

    it('evaluates C (cubic bezier)', () => {
      expect(compilePath('C 10 20 30 40 50 60')).toBe('C 10 20 30 40 50 60');
    });

    it('evaluates S (smooth cubic)', () => {
      expect(compilePath('S 30 40 50 60')).toBe('S 30 40 50 60');
    });

    it('evaluates Q (quadratic bezier)', () => {
      expect(compilePath('Q 25 50 50 0')).toBe('Q 25 50 50 0');
    });

    it('evaluates T (smooth quadratic)', () => {
      expect(compilePath('T 50 0')).toBe('T 50 0');
    });

    it('evaluates A (arc)', () => {
      expect(compilePath('A 25 25 0 1 1 50 50')).toBe('A 25 25 0 1 1 50 50');
    });

    it('evaluates lowercase relative commands', () => {
      expect(compilePath('m 10 20 l 30 40 h 10 v 10')).toBe('m 10 20 l 30 40 h 10 v 10');
    });
  });

  describe('comments', () => {
    it('ignores line comments', () => {
      expect(compilePath('// This is a comment\nM 10 20')).toBe('M 10 20');
    });

    it('ignores inline comments', () => {
      expect(compilePath('M 10 20 // move to point\nL 30 40')).toBe('M 10 20 L 30 40');
    });

    it('handles multiple comments', () => {
      expect(
        compilePath(`
        // First comment
        let x = 10; // define x
        // Another comment
        M x 0
      `),
      ).toBe('M 10 0');
    });
  });

  describe('operators', () => {
    describe('comparison operators', () => {
      it('evaluates less than', () => {
        expect(compilePath('if (1 < 2) { M 1 0 }')).toBe('M 1 0');
        expect(compilePath('if (2 < 1) { M 1 0 }')).toBe('');
      });

      it('evaluates greater than', () => {
        expect(compilePath('if (2 > 1) { M 1 0 }')).toBe('M 1 0');
        expect(compilePath('if (1 > 2) { M 1 0 }')).toBe('');
      });

      it('evaluates less than or equal', () => {
        expect(compilePath('if (1 <= 2) { M 1 0 }')).toBe('M 1 0');
        expect(compilePath('if (2 <= 2) { M 1 0 }')).toBe('M 1 0');
        expect(compilePath('if (3 <= 2) { M 1 0 }')).toBe('');
      });

      it('evaluates greater than or equal', () => {
        expect(compilePath('if (2 >= 1) { M 1 0 }')).toBe('M 1 0');
        expect(compilePath('if (2 >= 2) { M 1 0 }')).toBe('M 1 0');
        expect(compilePath('if (1 >= 2) { M 1 0 }')).toBe('');
      });

      it('evaluates equal', () => {
        expect(compilePath('if (2 == 2) { M 1 0 }')).toBe('M 1 0');
        expect(compilePath('if (1 == 2) { M 1 0 }')).toBe('');
      });

      it('evaluates not equal', () => {
        expect(compilePath('if (1 != 2) { M 1 0 }')).toBe('M 1 0');
        expect(compilePath('if (2 != 2) { M 1 0 }')).toBe('');
      });
    });

    describe('logical operators', () => {
      it('evaluates logical and', () => {
        expect(compilePath('if (1 && 1) { M 1 0 }')).toBe('M 1 0');
        expect(compilePath('if (1 && 0) { M 1 0 }')).toBe('');
        expect(compilePath('if (0 && 1) { M 1 0 }')).toBe('');
      });

      it('evaluates logical or', () => {
        expect(compilePath('if (1 || 0) { M 1 0 }')).toBe('M 1 0');
        expect(compilePath('if (0 || 1) { M 1 0 }')).toBe('M 1 0');
        expect(compilePath('if (0 || 0) { M 1 0 }')).toBe('');
      });

      it('evaluates compound logical expressions', () => {
        expect(compilePath('if ((1 > 0) && (2 > 1)) { M 1 0 }')).toBe('M 1 0');
        expect(compilePath('if ((1 > 2) || (2 > 1)) { M 1 0 }')).toBe('M 1 0');
      });
    });

    describe('unary operators', () => {
      it('evaluates unary minus', () => {
        expect(compilePath('let x = -5; M x 0')).toBe('M -5 0');
        expect(compilePath('M calc(-10) 0')).toBe('M -10 0');
      });

      it('evaluates unary not', () => {
        expect(compilePath('if (!0) { M 1 0 }')).toBe('M 1 0');
        expect(compilePath('if (!1) { M 1 0 }')).toBe('');
      });
    });

    describe('arithmetic operators', () => {
      it('evaluates subtraction', () => {
        expect(compilePath('M calc(10 - 3) 0')).toBe('M 7 0');
      });

      it('evaluates division', () => {
        expect(compilePath('M calc(10 / 2) 0')).toBe('M 5 0');
      });

      it('evaluates modulo', () => {
        expect(compilePath('M calc(10 % 3) 0')).toBe('M 1 0');
      });

      it('evaluates complex expressions', () => {
        expect(compilePath('M calc(2 + 3 * 4 - 6 / 2) 0')).toBe('M 11 0');
      });
    });
  });

  describe('variable scoping', () => {
    it('shadows variables in for loop', () => {
      // 0..3 is inclusive: 0, 1, 2, 3
      const result = compilePath('let i = 100; for (i in 0..3) { M i 0 } M i 0');
      expect(result).toBe('M 0 0 M 1 0 M 2 0 M 3 0 M 100 0');
    });

    it('shadows variables in function scope', () => {
      const result = compilePath('let x = 100; fn f(x) { M x 0 } f(5) M x 0');
      expect(result).toBe('M 5 0 M 100 0');
    });

    it('inner scope does not affect outer scope', () => {
      const result = compilePath('let x = 10; if (1) { let x = 20; M x 0 } M x 0');
      expect(result).toBe('M 20 0 M 10 0');
    });
  });

  describe('variables', () => {
    it('evaluates variable references', () => {
      expect(compilePath('let x = 10; M x 20')).toBe('M 10 20');
    });

    it('evaluates multiple variables', () => {
      expect(compilePath('let x = 10; let y = 20; M x y')).toBe('M 10 20');
    });

    it('evaluates variable with expression', () => {
      expect(compilePath('let x = 10 + 5; M x 0')).toBe('M 15 0');
    });
  });

  describe('calc expressions', () => {
    it('evaluates calc with addition', () => {
      expect(compilePath('M calc(10 + 5) 0')).toBe('M 15 0');
    });

    it('evaluates calc with multiplication', () => {
      expect(compilePath('M calc(10 * 2) 0')).toBe('M 20 0');
    });

    it('evaluates calc with variables', () => {
      expect(compilePath('let x = 10; M calc(x + 5) 0')).toBe('M 15 0');
    });

    it('respects operator precedence', () => {
      expect(compilePath('M calc(2 + 3 * 4) 0')).toBe('M 14 0');
    });

    it('evaluates nested parentheses', () => {
      expect(compilePath('M calc((2 + 3) * 4) 0')).toBe('M 20 0');
    });
  });

  describe('stdlib math functions', () => {
    describe('trigonometric', () => {
      it('evaluates sin', () => {
        expect(compilePath('M calc(sin(0)) 0')).toBe('M 0 0');
      });

      it('evaluates cos', () => {
        expect(compilePath('M calc(cos(0)) 0')).toBe('M 1 0');
      });

      it('evaluates tan', () => {
        expect(compilePath('M calc(tan(0)) 0')).toBe('M 0 0');
      });

      it('evaluates asin', () => {
        expect(compilePath('M calc(asin(0)) 0')).toBe('M 0 0');
      });

      it('evaluates acos', () => {
        const result = compilePath('M calc(acos(1)) 0');
        expect(result).toBe('M 0 0');
      });

      it('evaluates atan', () => {
        expect(compilePath('M calc(atan(0)) 0')).toBe('M 0 0');
      });

      it('evaluates atan2', () => {
        expect(compilePath('M calc(atan2(0, 1)) 0')).toBe('M 0 0');
      });
    });

    describe('hyperbolic', () => {
      it('evaluates sinh', () => {
        expect(compilePath('M calc(sinh(0)) 0')).toBe('M 0 0');
      });

      it('evaluates cosh', () => {
        expect(compilePath('M calc(cosh(0)) 0')).toBe('M 1 0');
      });

      it('evaluates tanh', () => {
        expect(compilePath('M calc(tanh(0)) 0')).toBe('M 0 0');
      });
    });

    describe('exponential and logarithmic', () => {
      it('evaluates exp', () => {
        expect(compilePath('M calc(exp(0)) 0')).toBe('M 1 0');
      });

      it('evaluates log (natural)', () => {
        expect(compilePath('M calc(log(1)) 0')).toBe('M 0 0');
      });

      it('evaluates log10', () => {
        expect(compilePath('M calc(log10(10)) 0')).toBe('M 1 0');
      });

      it('evaluates log2', () => {
        expect(compilePath('M calc(log2(8)) 0')).toBe('M 3 0');
      });

      it('evaluates pow', () => {
        expect(compilePath('M calc(pow(2, 3)) 0')).toBe('M 8 0');
      });

      it('evaluates sqrt', () => {
        expect(compilePath('M calc(sqrt(16)) 0')).toBe('M 4 0');
      });

      it('evaluates cbrt', () => {
        expect(compilePath('M calc(cbrt(27)) 0')).toBe('M 3 0');
      });
    });

    describe('rounding', () => {
      it('evaluates floor', () => {
        expect(compilePath('M calc(floor(3.7)) 0')).toBe('M 3 0');
      });

      it('evaluates ceil', () => {
        expect(compilePath('M calc(ceil(3.2)) 0')).toBe('M 4 0');
      });

      it('evaluates round', () => {
        expect(compilePath('M calc(round(3.5)) 0')).toBe('M 4 0');
        expect(compilePath('M calc(round(3.4)) 0')).toBe('M 3 0');
      });

      it('evaluates trunc', () => {
        expect(compilePath('M calc(trunc(3.9)) 0')).toBe('M 3 0');
        expect(compilePath('M calc(trunc(-3.9)) 0')).toBe('M -3 0');
      });
    });

    describe('utility', () => {
      it('evaluates abs', () => {
        expect(compilePath('M calc(abs(-10)) 0')).toBe('M 10 0');
      });

      it('evaluates sign', () => {
        expect(compilePath('M calc(sign(-10)) calc(sign(10))')).toBe('M -1 1');
        expect(compilePath('M calc(sign(0)) 0')).toBe('M 0 0');
      });

      it('evaluates min/max', () => {
        expect(compilePath('M calc(min(10, 5)) calc(max(10, 5))')).toBe('M 5 10');
      });
    });

    describe('constants', () => {
      it('evaluates PI', () => {
        const result = compilePath('M calc(PI()) 0');
        expect(result).toContain('3.14159');
      });

      it('evaluates E', () => {
        const result = compilePath('M calc(E()) 0');
        expect(result).toContain('2.718');
      });

      it('evaluates TAU', () => {
        const result = compilePath('M calc(TAU()) 0');
        expect(result).toContain('6.28318');
      });
    });

    describe('interpolation and clamping', () => {
      it('evaluates lerp', () => {
        expect(compilePath('M calc(lerp(0, 100, 0.5)) 0')).toBe('M 50 0');
        expect(compilePath('M calc(lerp(0, 100, 0)) 0')).toBe('M 0 0');
        expect(compilePath('M calc(lerp(0, 100, 1)) 0')).toBe('M 100 0');
      });

      it('evaluates clamp', () => {
        expect(compilePath('M calc(clamp(15, 0, 10)) 0')).toBe('M 10 0');
        expect(compilePath('M calc(clamp(-5, 0, 10)) 0')).toBe('M 0 0');
        expect(compilePath('M calc(clamp(5, 0, 10)) 0')).toBe('M 5 0');
      });

      it('evaluates map', () => {
        expect(compilePath('M calc(map(5, 0, 10, 0, 100)) 0')).toBe('M 50 0');
        expect(compilePath('M calc(map(0, 0, 10, 0, 100)) 0')).toBe('M 0 0');
        expect(compilePath('M calc(map(10, 0, 10, 0, 100)) 0')).toBe('M 100 0');
      });
    });

    describe('angle conversions', () => {
      it('evaluates deg (radians to degrees)', () => {
        const result = compilePath('M calc(deg(PI())) 0');
        expect(result).toBe('M 180 0');
      });

      it('evaluates rad (degrees to radians)', () => {
        const result = compilePath('M calc(rad(180)) 0');
        expect(result).toContain('3.14159');
      });
    });

    describe('pi suffix and mpi()', () => {
      it('evaluates 0.25pi to Math.PI * 0.25', () => {
        const result = compilePath('M 0.25pi 0');
        const match = /^M ([\d.]+) 0$/.exec(result);
        expect(match).not.toBeNull();
        expect(parseFloat(match![1])).toBeCloseTo(Math.PI * 0.25);
      });

      it('evaluates 1pi to Math.PI', () => {
        const result = compilePath('M 1pi 0');
        const match = /^M ([\d.]+) 0$/.exec(result);
        expect(match).not.toBeNull();
        expect(parseFloat(match![1])).toBeCloseTo(Math.PI);
      });

      it('evaluates mpi(0.5) to Math.PI * 0.5', () => {
        const result = compilePath('M calc(mpi(0.5)) 0');
        const match = /^M ([\d.]+) 0$/.exec(result);
        expect(match).not.toBeNull();
        expect(parseFloat(match![1])).toBeCloseTo(Math.PI * 0.5);
      });

      it('allows calc(0.25pi + 0.25pi)', () => {
        const result = compilePath('M calc(0.25pi + 0.25pi) 0');
        const match = /^M ([\d.]+) 0$/.exec(result);
        expect(match).not.toBeNull();
        expect(parseFloat(match![1])).toBeCloseTo(Math.PI * 0.5);
      });

      it('allows calc(90deg + 0.5pi) — both have angle units', () => {
        const result = compilePath('M calc(90deg + 0.5pi) 0');
        const match = /^M ([\d.]+) 0$/.exec(result);
        expect(match).not.toBeNull();
        expect(parseFloat(match![1])).toBeCloseTo(Math.PI);
      });

      it('throws on calc(0.25pi + 5) — angle unit mismatch', () => {
        expect(() => compilePath('M calc(0.25pi + 5) 0')).toThrow();
      });

      it('evaluates calc(0.5pi * 2) — multiply pi suffix by scalar', () => {
        const result = compilePath('M calc(0.5pi * 2) 0');
        const match = /^M ([\d.]+) 0$/.exec(result);
        expect(match).not.toBeNull();
        expect(parseFloat(match![1])).toBeCloseTo(Math.PI);
      });

      it('evaluates calc(0.5pi / 2) — divide pi suffix by scalar', () => {
        const result = compilePath('M calc(0.5pi / 2) 0');
        const match = /^M ([\d.]+) 0$/.exec(result);
        expect(match).not.toBeNull();
        expect(parseFloat(match![1])).toBeCloseTo(Math.PI / 4);
      });
    });

    describe('random', () => {
      it('evaluates random (returns number between 0 and 1)', () => {
        const result = compilePath('M calc(random()) 0');
        const match = /M ([\d.]+) 0/.exec(result);
        expect(match).not.toBeNull();
        const value = parseFloat(match![1]);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      });

      it('evaluates randomRange (returns number in range)', () => {
        const result = compilePath('M calc(randomRange(10, 20)) 0');
        const match = /M ([\d.]+) 0/.exec(result);
        expect(match).not.toBeNull();
        const value = parseFloat(match![1]);
        expect(value).toBeGreaterThanOrEqual(10);
        expect(value).toBeLessThan(20);
      });
    });
  });

  describe('stdlib path functions', () => {
    it('evaluates circle', () => {
      const result = compilePath('circle(50, 50, 25)');
      expect(result).toContain('M 25 50');
      expect(result).toContain('A 25 25');
    });

    it('evaluates arc', () => {
      const result = compilePath('arc(10, 10, 0, 1, 1, 50, 50)');
      expect(result).toBe('A 10 10 0 1 1 50 50');
    });

    it('evaluates rect', () => {
      const result = compilePath('rect(0, 0, 100, 50)');
      expect(result).toBe('M 0 0 L 100 0 L 100 50 L 0 50 Z');
    });

    it('evaluates roundRect', () => {
      const result = compilePath('roundRect(10, 10, 80, 60, 10)');
      expect(result).toContain('M 20 10'); // Start with radius offset
      expect(result).toContain('Q'); // Quadratic curves for corners
      expect(result).toContain('Z');
    });

    it('evaluates roundRect with large radius (clamped)', () => {
      // radius is clamped to half the smaller dimension
      const result = compilePath('roundRect(0, 0, 40, 20, 50)');
      expect(result).toContain('Q');
      expect(result).toContain('Z');
    });

    it('evaluates polygon', () => {
      const result = compilePath('polygon(50, 50, 25, 4)');
      expect(result).toContain('M');
      expect(result).toContain('L');
      expect(result).toContain('Z');
    });

    it('evaluates polygon with different side counts', () => {
      // Triangle
      const triangle = compilePath('polygon(50, 50, 25, 3)');
      expect(triangle.match(/L/g)?.length).toBe(2);

      // Hexagon
      const hexagon = compilePath('polygon(50, 50, 25, 6)');
      expect(hexagon.match(/L/g)?.length).toBe(5);
    });

    it('evaluates star', () => {
      const result = compilePath('star(50, 50, 30, 15, 5)');
      expect(result).toContain('M');
      expect(result).toContain('L');
      expect(result).toContain('Z');
      // 5-pointed star has 10 L commands (alternating outer/inner points)
      expect(result.match(/L/g)?.length).toBe(9);
    });

    it('evaluates line', () => {
      const result = compilePath('line(10, 20, 30, 40)');
      expect(result).toBe('M 10 20 L 30 40');
    });

    it('evaluates quadratic', () => {
      const result = compilePath('quadratic(0, 0, 50, 100, 100, 0)');
      expect(result).toBe('M 0 0 Q 50 100 100 0');
    });

    it('evaluates cubic', () => {
      const result = compilePath('cubic(0, 0, 25, 100, 75, 100, 100, 0)');
      expect(result).toBe('M 0 0 C 25 100 75 100 100 0');
    });

    it('evaluates moveTo', () => {
      const result = compilePath('moveTo(50, 100)');
      expect(result).toBe('M 50 100');
    });

    it('evaluates lineTo', () => {
      const result = compilePath('lineTo(50, 100)');
      expect(result).toBe('L 50 100');
    });

    it('evaluates closePath', () => {
      const result = compilePath('closePath()');
      expect(result).toBe('Z');
    });

    it('combines multiple path functions', () => {
      const result = compilePath('moveTo(0, 0) lineTo(100, 0) lineTo(100, 100) closePath()');
      expect(result).toBe('M 0 0 L 100 0 L 100 100 Z');
    });
  });

  describe('for loops', () => {
    it('evaluates simple for loop', () => {
      // 0..3 is inclusive: 0, 1, 2, 3
      expect(compilePath('for (i in 0..3) { L i 0 }')).toBe('L 0 0 L 1 0 L 2 0 L 3 0');
    });

    it('evaluates for loop with calc', () => {
      // 0..3 is inclusive: 0, 1, 2, 3
      expect(compilePath('for (i in 0..3) { L calc(i * 10) 0 }')).toBe('L 0 0 L 10 0 L 20 0 L 30 0');
    });

    it('evaluates nested for loops', () => {
      // 0..2 is inclusive: 0, 1, 2 (3 values each = 9 total)
      const result = compilePath('for (i in 0..2) { for (j in 0..2) { M i j } }');
      expect(result).toBe('M 0 0 M 0 1 M 0 2 M 1 0 M 1 1 M 1 2 M 2 0 M 2 1 M 2 2');
    });

    it('throws error for infinite loop range (Infinity)', () => {
      expect(() => compilePath('let n = calc(1/0); for (i in 0..n) { M i 0 }')).toThrow('finite');
    });

    it('throws error for NaN loop range', () => {
      expect(() => compilePath('let n = calc(0/0); for (i in 0..n) { M i 0 }')).toThrow('finite');
    });

    it('throws error for excessive iterations', () => {
      expect(() => compilePath('for (i in 0..20000) { M i 0 }')).toThrow('max');
    });

    it('allows reasonable iteration count', () => {
      // 0..100 is inclusive: 101 iterations (0 through 100)
      const result = compilePath('for (i in 0..100) { M i 0 }');
      expect(result).toContain('M 0 0');
      expect(result).toContain('M 99 0');
      expect(result).toContain('M 100 0');
    });

    it('evaluates descending for loop', () => {
      // 3..0 is inclusive descending: 3, 2, 1, 0
      expect(compilePath('for (i in 3..0) { M i 0 }')).toBe('M 3 0 M 2 0 M 1 0 M 0 0');
    });

    it('evaluates descending for loop with larger range', () => {
      // 10..8 is inclusive descending: 10, 9, 8
      expect(compilePath('for (i in 10..8) { M i 0 }')).toBe('M 10 0 M 9 0 M 8 0');
    });

    it('evaluates descending for loop with negative values', () => {
      // 2..-2 is inclusive descending: 2, 1, 0, -1, -2
      expect(compilePath('for (i in 2..-2) { M i 0 }')).toBe('M 2 0 M 1 0 M 0 0 M -1 0 M -2 0');
    });

    it('evaluates ascending for loop with negative values', () => {
      // -2..2 is inclusive ascending: -2, -1, 0, 1, 2
      expect(compilePath('for (i in -2..2) { M i 0 }')).toBe('M -2 0 M -1 0 M 0 0 M 1 0 M 2 0');
    });
  });

  describe('if statements', () => {
    it('evaluates if true', () => {
      expect(compilePath('let x = 1; if (x > 0) { M 10 10 }')).toBe('M 10 10');
    });

    it('evaluates if false', () => {
      expect(compilePath('let x = 0; if (x > 0) { M 10 10 }')).toBe('');
    });

    it('evaluates if-else', () => {
      expect(compilePath('let x = 0; if (x > 0) { M 10 10 } else { M 0 0 }')).toBe('M 0 0');
    });

    it('evaluates else if picking correct branch', () => {
      expect(compilePath('let x = 2; if (x == 1) { M 1 0 } else if (x == 2) { M 2 0 } else { M 0 0 }')).toBe('M 2 0');
    });

    it('evaluates multi-branch else if chain with final else', () => {
      expect(
        compilePath(
          'let x = 3; if (x == 1) { M 1 0 } else if (x == 2) { M 2 0 } else if (x == 3) { M 3 0 } else { M 0 0 }',
        ),
      ).toBe('M 3 0');
      expect(
        compilePath(
          'let x = 9; if (x == 1) { M 1 0 } else if (x == 2) { M 2 0 } else if (x == 3) { M 3 0 } else { M 0 0 }',
        ),
      ).toBe('M 0 0');
    });

    it('evaluates else if without final else (no match returns empty)', () => {
      expect(compilePath('let x = 5; if (x == 1) { M 1 0 } else if (x == 2) { M 2 0 }')).toBe('');
    });

    it('evaluates else if inside a loop', () => {
      const result = compilePath(`
        for (i in 1..3) {
          if (i == 1) { M 10 0 } else if (i == 2) { M 20 0 } else { M 30 0 }
        }
      `);
      expect(result).toBe('M 10 0 M 20 0 M 30 0');
    });

    it('evaluates if with calc() in condition', () => {
      expect(compilePath('let x = 4; if (calc(x % 2) == 0) { M 1 0 } else { M 0 0 }')).toBe('M 1 0');
      expect(compilePath('let x = 3; if (calc(x % 2) == 0) { M 1 0 } else { M 0 0 }')).toBe('M 0 0');
    });

    it('evaluates if with calc() on both sides', () => {
      expect(compilePath('let a = 5; let b = 3; if (calc(a + b) > calc(b * 2)) { M 1 0 }')).toBe('M 1 0');
    });

    it('evaluates complex calc() in loop condition', () => {
      // 0..4 is inclusive: 0, 1, 2, 3, 4. Even values: 0, 2, 4
      const result = compilePath(`
        for (i in 0..4) {
          if (calc(i % 2) == 0) { M i 0 }
        }
      `);
      expect(result).toBe('M 0 0 M 2 0 M 4 0');
    });

    it('evaluates calc() in if after path command', () => {
      const result = compilePath(`
        for (i in 1..5) {
          v 20
          if (calc(i % 2) == 0) {
            h -10
          } else {
            h 10
          }
        }
      `);
      expect(result).toContain('v 20');
      expect(result).toContain('h');
    });

    it('evaluates calc() in if after M command', () => {
      const result = compilePath(`
        M 0 0
        if (calc(5 % 2) == 1) { L 10 10 }
      `);
      expect(result).toBe('M 0 0 L 10 10');
    });

    it('evaluates calc() in if after L command', () => {
      const result = compilePath(`
        M 0 0
        L 10 10
        if (calc(4 / 2) == 2) { L 20 20 }
      `);
      expect(result).toBe('M 0 0 L 10 10 L 20 20');
    });

    it('evaluates fingerJoint pattern', () => {
      const result = compilePath(`
        fn fingerJoint(thickness, height, fingers) {
          let fingerHeight = calc(height / fingers);
          for (i in 1..fingers) {
            v fingerHeight
            if (calc(i % 2) == 0) {
              h calc(thickness * -1)
            } else {
              h thickness
            }
          }
        }
        M 0 0
        fingerJoint(10, 100, 5)
      `);
      expect(result).toContain('M 0 0');
      expect(result).toContain('v 20');
      expect(result).toContain('h 10');
      expect(result).toContain('h -10');
    });
  });

  describe('function definitions', () => {
    it('evaluates user function', () => {
      expect(compilePath('fn double(x) { M calc(x * 2) 0 } double(5)')).toBe('M 10 0');
    });

    it('evaluates function with multiple params', () => {
      expect(compilePath('fn add(a, b) { M calc(a + b) 0 } add(3, 7)')).toBe('M 10 0');
    });

    it('evaluates function called multiple times', () => {
      expect(compilePath('fn point(x) { M x 0 } point(1) point(2) point(3)')).toBe('M 1 0 M 2 0 M 3 0');
    });
  });

  describe('return statements', () => {
    it('returns a computed value from a function', () => {
      const result = compilePath(`
        fn double(x) {
          return calc(x * 2);
        }
        M double(5) 0
      `);
      expect(result).toBe('M 10 0');
    });

    it('returns a value usable in expressions', () => {
      const result = compilePath(`
        fn mpi(radians) {
          return calc(PI() * radians);
        }
        M mpi(0.5) 0
      `);
      // PI() * 0.5 ≈ 1.5707963...
      expect(result).toMatch(/^M 1\.570796\d* 0$/);
    });

    it('early return stops execution of remaining statements', () => {
      const result = compilePath(`
        fn test() {
          return 42;
          M 999 999
        }
        M test() 0
      `);
      expect(result).toBe('M 42 0');
    });

    it('functions without explicit return use implicit path accumulation', () => {
      const result = compilePath(`
        fn square() {
          M 0 0
          L 10 0
          L 10 10
          L 0 10
          Z
        }
        square()
      `);
      expect(result).toBe('M 0 0 L 10 0 L 10 10 L 0 10 Z');
    });

    it('return in path context works correctly', () => {
      const result = compilePath(`
        fn halfPi() {
          return calc(PI() / 2);
        }
        M halfPi() 0
      `);
      // PI()/2 ≈ 1.5707963...
      expect(result).toMatch(/^M 1\.570796\d* 0$/);
    });

    it('return value can be assigned to a variable', () => {
      const result = compilePath(`
        fn triple(x) {
          return calc(x * 3);
        }
        let y = triple(10);
        M y 0
      `);
      expect(result).toBe('M 30 0');
    });

    it('return value can be used in calc expression', () => {
      const result = compilePath(`
        fn add(a, b) {
          return calc(a + b);
        }
        M calc(add(3, 4) * 2) 0
      `);
      expect(result).toBe('M 14 0');
    });

    it('nested function calls with return work correctly', () => {
      const result = compilePath(`
        fn square(x) {
          return calc(x * x);
        }
        fn sumOfSquares(a, b) {
          return calc(square(a) + square(b));
        }
        M sumOfSquares(3, 4) 0
      `);
      // 3*3 + 4*4 = 9 + 16 = 25
      expect(result).toBe('M 25 0');
    });

    it('return inside conditional works correctly', () => {
      const result = compilePath(`
        fn absValue(x) {
          if (x < 0) {
            return calc(x * -1);
          }
          return x;
        }
        M absValue(-5) absValue(3)
      `);
      expect(result).toBe('M 5 3');
    });

    it('return inside loop exits function immediately', () => {
      const result = compilePath(`
        fn findFirst() {
          for (i in 1..10) {
            if (i == 3) {
              return i;
            }
          }
          return 0;
        }
        M findFirst() 0
      `);
      expect(result).toBe('M 3 0');
    });
  });

  describe('toFixed option', () => {
    it('rounds decimals to specified precision', () => {
      expect(compilePath('M calc(10/3) calc(20/7)', { toFixed: 2 })).toBe('M 3.33 2.86');
    });

    it('rounds to 0 decimal places', () => {
      expect(compilePath('M calc(10/3) calc(20/7)', { toFixed: 0 })).toBe('M 3 3');
    });

    it('rounds to 4 decimal places', () => {
      expect(compilePath('M calc(10/3) 0', { toFixed: 4 })).toBe('M 3.3333 0');
    });

    it('does not modify integers', () => {
      expect(compilePath('M 100 200', { toFixed: 2 })).toBe('M 100 200');
    });

    it('preserves arc flags as integers', () => {
      expect(compilePath('A 25 25 0 1 1 50 50', { toFixed: 2 })).toBe('A 25 25 0 1 1 50 50');
    });

    it('handles negative decimals', () => {
      expect(compilePath('M calc(-10/3) calc(-20/7)', { toFixed: 2 })).toBe('M -3.33 -2.86');
    });

    it('does not round when option not provided', () => {
      const result = compilePath('M calc(10/3) 0');
      expect(result).toBe(`M ${10 / 3} 0`);
    });

    it('works with stdlib functions', () => {
      const result = compilePath('circle(100, 100, calc(100/3))', { toFixed: 2 });
      // All decimals should have at most 2 decimal places
      const numbers = result.match(/-?\d+\.?\d*/g) || [];
      for (const num of numbers) {
        if (num.includes('.')) {
          const decimals = num.split('.')[1];
          expect(decimals.length).toBeLessThanOrEqual(2);
        }
      }
    });
  });

  describe('variable reassignment', () => {
    it('reassigns a variable', () => {
      expect(compilePath('let x = 10; x = 20; M x 0')).toBe('M 20 0');
    });

    it('reassigns variable inside if block (updates outer scope)', () => {
      expect(compilePath('let x = 10; if (1) { x = 20; } M x 0')).toBe('M 20 0');
    });

    it('reassigns with expression', () => {
      expect(compilePath('let x = 10; x = calc(x + 5); M x 0')).toBe('M 15 0');
    });

    it('reassigns inside for loop (updates outer scope)', () => {
      expect(compilePath('let sum = 0; for (i in 1..3) { sum = calc(sum + i); } M sum 0')).toBe('M 6 0');
    });

    it('let in block still shadows (does not affect outer)', () => {
      expect(compilePath('let x = 10; if (1) { let x = 20; M x 0 } M x 0')).toBe('M 20 0 M 10 0');
    });

    it('reassigns closest scope variable', () => {
      expect(compilePath('let x = 10; if (1) { let x = 20; x = 30; M x 0 } M x 0')).toBe('M 30 0 M 10 0');
    });

    it('throws on assigning to undeclared variable', () => {
      expect(() => compilePath('x = 10;')).toThrow('Cannot assign to undeclared variable: x');
    });

    it('reassigns with modulus operator', () => {
      expect(compilePath('let x = 5; if (1) { x = calc(x % 3); } M x 0')).toBe('M 2 0');
    });
  });

  describe('template literals', () => {
    it('evaluates simple template literal', () => {
      const result = compile('let x = `hello`; log(x);');
      expect(result.logs[0].parts[0].value).toBe('hello');
    });

    it('evaluates template literal with expression', () => {
      const result = compile('let name = "World"; let x = `Hello \${name}!`; log(x);');
      expect(result.logs[0].parts[0].value).toBe('Hello World!');
    });

    it('evaluates template literal with numeric expression', () => {
      const result = compile('let x = `Score: \${2 + 3}`; log(x);');
      expect(result.logs[0].parts[0].value).toBe('Score: 5');
    });

    it('evaluates template literal with multiple expressions', () => {
      const result = compile('let a = 1; let b = 2; let x = `\${a} + \${b} = \${a + b}`; log(x);');
      expect(result.logs[0].parts[0].value).toBe('1 + 2 = 3');
    });

    it('evaluates empty template literal', () => {
      const result = compile('let x = ``; log(x);');
      expect(result.logs[0].parts[0].value).toBe('');
    });

    it('template literal in log()', () => {
      const result = compile('let n = 42; log(`The answer is \${n}`);');
      expect(result.logs[0].parts[0].value).toBe('The answer is 42');
    });
  });

  describe('string equality', () => {
    it('compares equal strings', () => {
      expect(compilePath('let mode = "dark"; if (mode == "dark") { M 1 0 } else { M 2 0 }')).toBe('M 1 0');
    });

    it('compares unequal strings', () => {
      expect(compilePath('let mode = "dark"; if (mode == "light") { M 1 0 } else { M 2 0 }')).toBe('M 2 0');
    });

    it('!= for unequal strings returns truthy', () => {
      expect(compilePath('let mode = "dark"; if (mode != "light") { M 1 0 } else { M 2 0 }')).toBe('M 1 0');
    });

    it('!= for equal strings returns falsy', () => {
      expect(compilePath('let mode = "dark"; if (mode != "dark") { M 1 0 } else { M 2 0 }')).toBe('M 2 0');
    });

    it('string equality with template literals', () => {
      expect(compilePath('let a = `hello`; if (a == "hello") { M 1 0 } else { M 2 0 }')).toBe('M 1 0');
    });

    it('string + still throws error', () => {
      expect(() => compile('let x = "a" + "b";')).toThrow('requires numeric operands');
    });
  });

  describe('null', () => {
    it('null is falsy in conditionals', () => {
      expect(compilePath('let x = null; if (x) { M 1 0 } else { M 0 0 }')).toBe('M 0 0');
    });

    it('null == null is truthy', () => {
      expect(compilePath('let x = null; if (x == null) { M 1 0 } else { M 0 0 }')).toBe('M 1 0');
    });

    it('null != null is falsy', () => {
      expect(compilePath('let x = null; if (x != null) { M 1 0 } else { M 0 0 }')).toBe('M 0 0');
    });

    it('null != 0 (null is not zero)', () => {
      expect(compilePath('if (null == 0) { M 1 0 } else { M 0 0 }')).toBe('M 0 0');
    });

    it('null in arithmetic throws', () => {
      expect(() => compilePath('let x = null; let y = calc(x + 1);')).toThrow(/null/i);
    });

    it('null in path args throws', () => {
      expect(() => compilePath('let x = null; M x 0')).toThrow(/null/i);
    });

    it('log(null) displays "null"', () => {
      const result = compile('log(null);');
      expect(result.logs[0].parts[0].value).toBe('null');
    });
  });

  describe('arrays', () => {
    it('creates an array and accesses elements', () => {
      expect(compilePath('let list = [10, 20, 30]; M list[0] list[1]')).toBe('M 10 20');
    });

    it('accesses .length', () => {
      const result = compile('let list = [1, 2, 3]; log(list.length);');
      expect(result.logs[0].parts[0].value).toBe('3');
    });

    it('empty() on empty array', () => {
      expect(compilePath('let list = []; if (list.empty()) { M 1 0 } else { M 0 0 }')).toBe('M 1 0');
    });

    it('empty() on non-empty array', () => {
      expect(compilePath('let list = [1]; if (list.empty()) { M 1 0 } else { M 0 0 }')).toBe('M 0 0');
    });

    it('push adds element and returns new length', () => {
      expect(compilePath('let list = [1, 2]; let len = list.push(3); M len list[2]')).toBe('M 3 3');
    });

    it('pop removes last element and returns it', () => {
      expect(compilePath('let list = [1, 2, 3]; let last = list.pop(); M last list.length')).toBe('M 3 2');
    });

    it('pop on empty array returns null', () => {
      expect(compilePath('let list = []; let x = list.pop(); if (x == null) { M 1 0 } else { M 0 0 }')).toBe('M 1 0');
    });

    it('shift removes first element and returns it', () => {
      expect(compilePath('let list = [10, 20, 30]; let first = list.shift(); M first list[0]')).toBe('M 10 20');
    });

    it('shift on empty array returns null', () => {
      expect(compilePath('let list = []; let x = list.shift(); if (x == null) { M 1 0 } else { M 0 0 }')).toBe('M 1 0');
    });

    it('unshift prepends element and returns new length', () => {
      expect(compilePath('let list = [2, 3]; let len = list.unshift(1); M len list[0]')).toBe('M 3 1');
    });

    it('for-each iterates over array', () => {
      expect(compilePath('let pts = [10, 20, 30]; for (p in pts) { M p 0 }')).toBe('M 10 0 M 20 0 M 30 0');
    });

    it('destructured for-each provides item and index', () => {
      expect(compilePath('let pts = [10, 20]; for ([p, i] in pts) { M p i }')).toBe('M 10 0 M 20 1');
    });

    it('trailing comma in array literal', () => {
      expect(compilePath('let arr = [10, 20, 30,]; M arr[0] arr[1]')).toBe('M 10 20');
    });

    it('for-each with destructuring over nested arrays binds element and index', () => {
      expect(compilePath('let nested = [[1, 2], [3, 4]]; for ([item, i] in nested) { M item[0] i }')).toBe(
        'M 1 0 M 3 1',
      );
    });

    it('for-each over empty array produces nothing', () => {
      expect(compilePath('let list = []; for (x in list) { M x 0 }')).toBe('');
    });

    it('reference semantics — mutations visible through all bindings', () => {
      expect(compilePath('let arr = [1, 2]; let ref = arr; ref.push(3); M arr[2] arr.length')).toBe('M 3 3');
    });

    it('arrays in path args via index', () => {
      expect(compilePath('let pts = [10, 20]; M pts[0] pts[1]')).toBe('M 10 20');
    });

    it('log displays arrays', () => {
      const result = compile('let list = [1, 2, 3]; log(list);');
      expect(result.logs[0].parts[0].value).toBe('[1, 2, 3]');
    });

    it('log displays nested arrays', () => {
      const result = compile('let list = [1, [2, 3]]; log(list);');
      expect(result.logs[0].parts[0].value).toBe('[1, [2, 3]]');
    });

    it('array with expressions', () => {
      expect(compilePath('let x = 5; let list = [x, calc(x * 2), calc(x * 3)]; M list[0] list[2]')).toBe('M 5 15');
    });

    it('empty array literal has length 0', () => {
      expect(compilePath('let list = []; M list.length 0')).toBe('M 0 0');
    });
  });

  describe('string operations', () => {
    it('.length returns character count', () => {
      const result = compile('let str = `Hello`; log(str.length);');
      expect(result.logs[0].parts[0].value).toBe('5');
    });

    it('.length on empty string returns 0', () => {
      expect(compilePath('let str = ``; M str.length 0')).toBe('M 0 0');
    });

    it('.empty() on empty string returns truthy', () => {
      expect(compilePath('let str = ``; if (str.empty()) { M 1 0 } else { M 0 0 }')).toBe('M 1 0');
    });

    it('.empty() on non-empty string returns falsy', () => {
      expect(compilePath('let str = `hello`; if (str.empty()) { M 1 0 } else { M 0 0 }')).toBe('M 0 0');
    });

    it('index access returns character at position', () => {
      const result = compile('let str = `Hello`; log(str[0]);');
      expect(result.logs[0].parts[0].value).toBe('H');
    });

    it('index access works at different positions', () => {
      const result = compile('let str = `abc`; log(str[0]); log(str[1]); log(str[2]);');
      expect(result.logs[0].parts[0].value).toBe('a');
      expect(result.logs[1].parts[0].value).toBe('b');
      expect(result.logs[2].parts[0].value).toBe('c');
    });

    it('.split() returns array of characters', () => {
      const result = compile('let str = `abc`; let chars = str.split(); log(chars);');
      expect(result.logs[0].parts[0].value).toBe('[a, b, c]');
    });

    it('.split() returns empty array for empty string', () => {
      expect(compilePath('let str = ``; let chars = str.split(); M chars.length 0')).toBe('M 0 0');
    });

    it('.split() result can be iterated', () => {
      const result = compile('let str = `abc`; for (ch in str.split()) { log(ch); }');
      expect(result.logs).toHaveLength(3);
      expect(result.logs[0].parts[0].value).toBe('a');
      expect(result.logs[1].parts[0].value).toBe('b');
      expect(result.logs[2].parts[0].value).toBe('c');
    });

    it('.append() creates new string with value at end', () => {
      const result = compile('let str = `Hello`; let r = str.append(` World`); log(r);');
      expect(result.logs[0].parts[0].value).toBe('Hello World');
    });

    it('.append() does not mutate original', () => {
      const result = compile('let str = `Hello`; let r = str.append(` World`); log(str);');
      expect(result.logs[0].parts[0].value).toBe('Hello');
    });

    it('.prepend() creates new string with value at beginning', () => {
      const result = compile('let str = `World`; let r = str.prepend(`Hello `); log(r);');
      expect(result.logs[0].parts[0].value).toBe('Hello World');
    });

    it('.prepend() does not mutate original', () => {
      const result = compile('let str = `World`; let r = str.prepend(`Hello `); log(str);');
      expect(result.logs[0].parts[0].value).toBe('World');
    });

    it('.includes() returns truthy when substring found', () => {
      expect(compilePath('let str = `Hello World`; if (str.includes(`World`)) { M 1 0 } else { M 0 0 }')).toBe('M 1 0');
    });

    it('.includes() returns falsy when substring not found', () => {
      expect(compilePath('let str = `Hello World`; if (str.includes(`Foo`)) { M 1 0 } else { M 0 0 }')).toBe('M 0 0');
    });

    it('.includes() works with empty substring', () => {
      expect(compilePath('let str = `Hello`; if (str.includes(``)) { M 1 0 } else { M 0 0 }')).toBe('M 1 0');
    });

    it('.slice() extracts substring', () => {
      const result = compile('let str = `Hello World`; log(str.slice(0, 5));');
      expect(result.logs[0].parts[0].value).toBe('Hello');
    });

    it('.slice() with different range', () => {
      const result = compile('let str = `Hello World`; log(str.slice(6, 11));');
      expect(result.logs[0].parts[0].value).toBe('World');
    });

    it('.slice() with negative start', () => {
      const result = compile('let str = `Hello World`; log(str.slice(-5, 11));');
      expect(result.logs[0].parts[0].value).toBe('World');
    });

    it('string length in path context', () => {
      expect(compilePath('let str = `abc`; M str.length 0')).toBe('M 3 0');
    });
  });

  describe('points', () => {
    it('creates a point with Point(x, y)', () => {
      expect(compilePath('let pt = Point(100, 200); M pt.x pt.y')).toBe('M 100 200');
    });

    it('accesses .x and .y properties', () => {
      expect(compilePath('let pt = Point(42, 99); M pt.x pt.y')).toBe('M 42 99');
    });

    it('uses point properties in calc expressions', () => {
      expect(compilePath('let pt = Point(100, 200); M calc(pt.x + 10) calc(pt.y - 50)')).toBe('M 110 150');
    });

    it('.translate(dx, dy) returns offset point', () => {
      expect(compilePath('let pt = Point(100, 100); let moved = pt.translate(10, -20); M moved.x moved.y')).toBe(
        'M 110 80',
      );
    });

    it('.polarTranslate(angle, distance) returns point at polar offset', () => {
      const result = compilePath('let pt = Point(100, 100); let moved = pt.polarTranslate(0, 50); M moved.x moved.y');
      expect(result).toBe('M 150 100');
    });

    it('.midpoint(other) returns halfway point', () => {
      expect(
        compilePath('let p1 = Point(0, 0); let p2 = Point(100, 100); let mid = p1.midpoint(p2); M mid.x mid.y'),
      ).toBe('M 50 50');
    });

    it('.lerp(other, t) interpolates between points', () => {
      expect(
        compilePath('let p1 = Point(0, 0); let p2 = Point(100, 200); let mid = p1.lerp(p2, 0.25); M mid.x mid.y'),
      ).toBe('M 25 50');
    });

    it('.lerp(other, 0) returns this point', () => {
      expect(
        compilePath(
          'let p1 = Point(10, 20); let p2 = Point(100, 200); let result = p1.lerp(p2, 0); M result.x result.y',
        ),
      ).toBe('M 10 20');
    });

    it('.lerp(other, 1) returns other point', () => {
      expect(
        compilePath(
          'let p1 = Point(10, 20); let p2 = Point(100, 200); let result = p1.lerp(p2, 1); M result.x result.y',
        ),
      ).toBe('M 100 200');
    });

    it('.rotate(angle, origin) rotates around center', () => {
      const result = compilePath(
        'let pt = Point(100, 0); let center = Point(0, 0); let r = pt.rotate(90deg, center); M r.x r.y',
        { toFixed: 2 },
      );
      // 100,0 rotated 90deg CW around origin → approximately 0,100
      const match = /^M (-?[\d.]+) (-?[\d.]+)$/.exec(result);
      expect(match).not.toBeNull();
      expect(parseFloat(match![1])).toBeCloseTo(0, 0);
      expect(parseFloat(match![2])).toBeCloseTo(100, 0);
    });

    it('.distanceTo(other) returns Euclidean distance', () => {
      expect(compilePath('let p1 = Point(0, 0); let p2 = Point(3, 4); let dist = p1.distanceTo(p2); M dist 0')).toBe(
        'M 5 0',
      );
    });

    it('.angleTo(other) returns angle in radians', () => {
      expect(compilePath('let p1 = Point(0, 0); let p2 = Point(1, 0); let ang = p1.angleTo(p2); M ang 0')).toBe(
        'M 0 0',
      );
    });

    it('.angleTo(other) returns correct angle for vertical', () => {
      const result = compilePath('let p1 = Point(0, 0); let p2 = Point(0, 1); let ang = p1.angleTo(p2); M ang 0');
      const match = /^M ([\d.]+) 0$/.exec(result);
      expect(match).not.toBeNull();
      expect(parseFloat(match![1])).toBeCloseTo(Math.PI / 2);
    });

    it('log(point) displays Point(x, y)', () => {
      const result = compile('let pt = Point(100, 200); log(pt);');
      expect(result.logs[0].parts[0].value).toBe('Point(100, 200)');
    });

    it('point in template literal displays Point(x, y)', () => {
      const result = compile('let pt = Point(42, 99); log(`pos: ${pt}`);');
      expect(result.logs[0].parts[0].value).toBe('pos: Point(42, 99)');
    });

    it('chained operations work', () => {
      expect(
        compilePath('let pt = Point(0, 0); let moved = pt.translate(50, 50).translate(10, 10); M moved.x moved.y'),
      ).toBe('M 60 60');
    });

    it('point methods work in calc expressions', () => {
      expect(compilePath('let p1 = Point(0, 0); let p2 = Point(6, 8); M calc(p1.distanceTo(p2) * 2) 0')).toBe('M 20 0');
    });

    it('works with for loops', () => {
      expect(compilePath('let center = Point(100, 100); for (i in 0..2) { M calc(center.x + i * 10) center.y }')).toBe(
        'M 100 100 M 110 100 M 120 100',
      );
    });
  });

  describe('cycler', () => {
    it('cycles through elements sequentially', () => {
      const result = compile(`
        let c = Cycler(['a', 'b', 'c']);
        log(c.pick());
        log(c.pick());
        log(c.pick());
      `);
      expect(result.logs[0].parts[0].value).toBe('a');
      expect(result.logs[1].parts[0].value).toBe('b');
      expect(result.logs[2].parts[0].value).toBe('c');
    });

    it('wraps around after reaching the end', () => {
      const result = compile(`
        let c = Cycler(['x', 'y']);
        log(c.pick());
        log(c.pick());
        log(c.pick());
        log(c.pick());
      `);
      expect(result.logs[0].parts[0].value).toBe('x');
      expect(result.logs[1].parts[0].value).toBe('y');
      expect(result.logs[2].parts[0].value).toBe('x');
      expect(result.logs[3].parts[0].value).toBe('y');
    });

    it('has .length property', () => {
      expect(compilePath('let c = Cycler([1, 2, 3]); M calc(c.length) 0')).toBe('M 3 0');
    });

    it('shuffled mode produces stable order across cycles', () => {
      const result = compile(`
        let c = Cycler(['a', 'b', 'c', 'd', 'e'], 1);
        let first = c.pick();
        let second = c.pick();
        let third = c.pick();
        let fourth = c.pick();
        let fifth = c.pick();
        // Second cycle should repeat the same order
        log(first == c.pick());
        log(second == c.pick());
        log(third == c.pick());
        log(fourth == c.pick());
        log(fifth == c.pick());
      `);
      // All comparisons should be truthy (1)
      for (const log of result.logs) {
        expect(log.parts[0].value).toBe('1');
      }
    });

    it('throws on empty array', () => {
      expect(() => compile('let c = Cycler([]);')).toThrow('must not be empty');
    });

    it('throws on non-array argument', () => {
      expect(() => compile('let c = Cycler(42);')).toThrow('must be an array');
    });

    it('log() displays cycler info', () => {
      const result = compile('let c = Cycler([1, 2, 3]); log(c);');
      expect(result.logs[0].parts[0].value).toBe('Cycler(3 items, index 0)');
    });

    it('log() displays updated index after picks', () => {
      const result = compile('let c = Cycler([1, 2, 3]); c.pick(); c.pick(); log(c);');
      expect(result.logs[0].parts[0].value).toBe('Cycler(3 items, index 2)');
    });

    it('works with mixed value types', () => {
      const result = compile(`
        let c = Cycler([42, 'hello']);
        log(c.pick());
        log(c.pick());
      `);
      expect(result.logs[0].parts[0].value).toBe('42');
      expect(result.logs[1].parts[0].value).toBe('hello');
    });

    it('works with numbers in path context', () => {
      expect(
        compilePath(`
        let c = Cycler([10, 20, 30]);
        M calc(c.pick()) calc(c.pick())
      `),
      ).toBe('M 10 20');
    });
  });

  describe('style blocks', () => {
    it('creates a style block value', () => {
      const result = compile(`
        let s = \${ stroke: red; stroke-width: 2; };
        define PathLayer('test') s
        layer('test').apply { M 0 0 L 10 10 }
      `);
      expect(result.layers[0].styles).toEqual({ stroke: 'red', 'stroke-width': '2' });
    });

    it('merges style blocks with <<', () => {
      const result = compile(`
        let base = \${ stroke: red; stroke-width: 2; };
        let merged = base << \${ stroke-width: 4; fill: blue; };
        define PathLayer('test') merged
        layer('test').apply { M 0 0 }
      `);
      expect(result.layers[0].styles).toEqual({ stroke: 'red', 'stroke-width': '4', fill: 'blue' });
    });

    it('accesses style block property with camelCase', () => {
      const result = compile(`
        let s = \${ stroke-width: 4; };
        let sw = s.strokeWidth;
        log(sw);
      `);
      expect(result.logs[0].parts[0].value).toBe('4');
    });

    it('accesses simple property names with dot notation', () => {
      const result = compilePath(`
        let s = \${ stroke: red; fill: blue; };
        // stroke and fill are simple names, no camel conversion needed
        define default PathLayer('d') \${ stroke: black; }
        M 0 0
      `);
      expect(result).toBe('M 0 0');
    });

    it('try-evaluates calc expressions in style block values', () => {
      const result = compile(`
        let s = \${ font-size: calc(12 + 15); };
        define PathLayer('test') s
        layer('test').apply { M 0 0 }
      `);
      expect(result.layers[0].styles['font-size']).toBe('27');
    });

    it('keeps raw string for non-evaluable values', () => {
      const result = compile(`
        define PathLayer('test') \${ stroke: rgb(232, 74, 166); fill: #996633; }
        layer('test').apply { M 0 0 }
      `);
      expect(result.layers[0].styles.stroke).toBe('rgb(232, 74, 166)');
      expect(result.layers[0].styles.fill).toBe('#996633');
    });

    it('uses style block expression in layer definition', () => {
      const result = compile(`
        let baseStyles = \${ stroke: red; stroke-width: 2; };
        define PathLayer('main') baseStyles << \${ fill: none; }
        layer('main').apply { M 0 0 L 50 50 }
      `);
      expect(result.layers[0].styles).toEqual({ stroke: 'red', 'stroke-width': '2', fill: 'none' });
    });

    it('evaluates style block with variable references in values', () => {
      const result = compile(`
        let w = 8;
        let s = \${ stroke-width: w; };
        define PathLayer('test') s
        layer('test').apply { M 0 0 }
      `);
      expect(result.layers[0].styles['stroke-width']).toBe('8');
    });

    it('chains multiple << merges', () => {
      const result = compile(`
        let a = \${ stroke: red; };
        let b = \${ fill: blue; };
        let c = \${ opacity: 0.5; };
        let merged = a << b << c;
        define PathLayer('test') merged
        layer('test').apply { M 0 0 }
      `);
      expect(result.layers[0].styles).toEqual({ stroke: 'red', fill: 'blue', opacity: '0.5' });
    });
  });
});

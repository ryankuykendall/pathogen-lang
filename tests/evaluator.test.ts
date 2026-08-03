import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { compilePath, expectSVGPathCommandSequence, parseSVGPath } from './helpers';

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
        expect(compilePath('let d = calc(10 / 2); M d 0')).toBe('M 5 0');
      });

      it('evaluates division directly in path args', () => {
        expect(compilePath('M calc(10 / 2) 0')).toBe('M 5 0');
      });

      it('evaluates division with function call in path args', () => {
        expect(compilePath('l calc(4 / pow(2, 1)) 0')).toBe('l 2 0');
      });

      it('evaluates modulo', () => {
        expect(compilePath('M calc(10 % 3) 0')).toBe('M 1 0');
      });

      it('evaluates complex expressions', () => {
        expect(compilePath('let r = calc(2 + 3 * 4 - 6 / 2); M r 0')).toBe('M 11 0');
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
      const result = compilePath('let x = 100; fn f(x) { M x 0 } f(5); M x 0');
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

      it('evaluates smoothstep (Hermite 3t^2 - 2t^3 over clamped t)', () => {
        // t = 0.25 → 0.25^2 * (3 - 0.5) = 0.15625
        expect(compilePath('M calc(smoothstep(0, 1, 0.25)) 0')).toBe('M 0.15625 0');
        expect(compilePath('M calc(smoothstep(0, 1, 0.5)) 0')).toBe('M 0.5 0');
        expect(compilePath('M calc(smoothstep(0, 1, 0.75)) 0')).toBe('M 0.84375 0');
      });

      it('smoothstep normalizes x into the edge range (GLSL argument order)', () => {
        expect(compilePath('M calc(smoothstep(10, 20, 15)) 0')).toBe('M 0.5 0');
      });

      it('smoothstep saturates outside the edges', () => {
        expect(compilePath('M calc(smoothstep(0, 1, -1)) 0')).toBe('M 0 0');
        expect(compilePath('M calc(smoothstep(0, 1, 2)) 0')).toBe('M 1 0');
      });

      it('smoothstep with reversed edges reverses the ramp', () => {
        expect(compilePath('M calc(smoothstep(1, 0, 0.25)) 0')).toBe('M 0.84375 0');
      });

      it('smoothstep with equal edges collapses to a hard step', () => {
        // The clamp absorbs the divide-by-zero infinities; NaN appears only
        // when x also equals the shared edge (0/0). Documented contract.
        expect(compilePath('M calc(smoothstep(5, 5, 10)) 0')).toBe('M 1 0');
        expect(compilePath('M calc(smoothstep(5, 5, 0)) 0')).toBe('M 0 0');
        expect(compilePath('M calc(smoothstep(5, 5, 5)) 0')).toBe('M NaN 0');
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
        const result = compilePath('let pi_val = 0.5pi; let result = calc(pi_val / 2); M result 0');
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

    describe('hash functions', () => {
      // Expected values computed from the lowbias32 double-mix construction:
      //   mix32(x): x ^= x>>>16; x = imul(x, 0x7feb352d); x ^= x>>>15;
      //             x = imul(x, 0x846ca68b); x ^= x>>>16;
      //   hashU32(n, seed) = mix32(mix32(n|0) ^ imul((seed|0) ^ 0x9e3779b9, 0x85ebca6b)) >>> 0
      //   hash01(n, seed?) = hashU32(n, seed ?? 0) / 2^32
      // These are bit-exact contracts: any change to the constants or mixing
      // steps is a breaking change to every program using hash01.
      it('evaluates hash01 to exact bit-specified values', () => {
        expect(compilePath('M calc(hash01(0)) 0')).toBe('M 0.3778164542745799 0');
        expect(compilePath('M calc(hash01(1)) 0')).toBe('M 0.2531894932035357 0');
        expect(compilePath('M calc(hash01(2)) 0')).toBe('M 0.4740615279879421 0');
        expect(compilePath('M calc(hash01(42)) 0')).toBe('M 0.6516876730602235 0');
      });

      it('hash01 handles negative indices', () => {
        expect(compilePath('M calc(hash01(-1)) 0')).toBe('M 0.6598478690721095 0');
      });

      it('hash01 seed selects an independent stream', () => {
        expect(compilePath('M calc(hash01(1, 7)) 0')).toBe('M 0.8208946359809488 0');
      });

      it('hash01 truncates n to a 32-bit integer (documented contract)', () => {
        expect(compilePath('M calc(hash01(0.9)) 0')).toBe(compilePath('M calc(hash01(0)) 0'));
      });

      it('hash01 truncates non-finite inputs to 0 (documented contract)', () => {
        expect(compilePath('M calc(hash01(1/0)) 0')).toBe(compilePath('M calc(hash01(0)) 0'));
      });

      it('hash01 is deterministic across compiles', () => {
        const program = 'for (i in 0..10) { M calc(hash01(i) * 100) calc(hash01(i, 1) * 100) }';
        expect(compilePath(program)).toBe(compilePath(program));
      });

      it('hash01 stays in [0, 1) with a balanced mean over 1000 indices', () => {
        // Supplementary distribution invariant; exact-value tests above carry
        // the primary contract.
        const result = compilePath('let s = 0; for (i in 0..999) { s = s + hash01(i); } M calc(s / 1000) 0');
        const match = /^M (-?[\d.]+) 0$/.exec(result);
        expect(match).not.toBeNull();
        const mean = parseFloat(match![1]);
        expect(mean).toBeGreaterThan(0.45);
        expect(mean).toBeLessThan(0.55);
      });

      it('user-defined fn hash01 shadows the stdlib function', () => {
        // Protects published blog samples that define their own hash01: user
        // scope must win over stdlib so their output never drifts.
        const program = 'fn hash01(i) { return 0.5; } M calc(hash01(3)) 0';
        expect(compilePath(program)).toBe('M 0.5 0');
      });
    });
  });

  describe('stdlib path functions', () => {
    it('evaluates circle', () => {
      // Circle centered at (50, 50) with r=25 → start at (25, 50), two semicircle arcs
      const result = compilePath('circle(50, 50, 25);');
      expect(result).toBe('M 25 50 a 25 25 0 1 1 50 0 a 25 25 0 1 1 -50 0');
    });

    it('evaluates arc', () => {
      // arc() is a continuation command — keeps uppercase A since it has no start-position knowledge
      const result = compilePath('arc(10, 10, 0, 1, 1, 50, 50);');
      expect(result).toBe('A 10 10 0 1 1 50 50');
    });

    it('evaluates rect', () => {
      const result = compilePath('rect(0, 0, 100, 50);');
      expect(result).toBe('M 0 0 l 100 0 l 0 50 l -100 0 z');
    });

    it('evaluates roundRect', () => {
      const result = compilePath('roundRect(10, 10, 80, 60, 10);');
      // roundRect(x=10, y=10, w=80, h=60, r=min(10,40,30)=10); bodyW=60, bodyH=40
      expect(result).toBe(
        'M 20 10 l 60 0 q 10 0 10 10 l 0 40 q 0 10 -10 10 l -60 0 q -10 0 -10 -10 l 0 -40 q 0 -10 10 -10 z',
      );
    });

    it('evaluates roundRect with large radius (clamped)', () => {
      // radius is clamped to min(50, 40/2=20, 20/2=10) = 10; bodyW=20, bodyH=0
      const result = compilePath('roundRect(0, 0, 40, 20, 50);');
      expect(result).toBe(
        'M 10 0 l 20 0 q 10 0 10 10 l 0 0 q 0 10 -10 10 l -20 0 q -10 0 -10 -10 l 0 0 q 0 -10 10 -10 z',
      );
    });

    it('evaluates polygon', () => {
      // polygon(cx=50, cy=50, r=25, sides=4) — square rotated 45°
      // vertices: (50, 25), (75, 50), (50, 75), (25, 50)
      const result = compilePath('polygon(50, 50, 25, 4);');
      expect(result).toBe('M 50 25 l 25 25 l -25 25 l -25 -25 z');
    });

    it('evaluates polygon with different side counts', () => {
      // Triangle: M + 2 l's + z
      const triangle = compilePath('polygon(50, 50, 25, 3);');
      expect(triangle.match(/\bl\b/g)?.length).toBe(2);
      expect(triangle).toMatch(/^M .+ l .+ l .+ z$/);

      // Hexagon: M + 5 l's + z
      const hexagon = compilePath('polygon(50, 50, 25, 6);');
      expect(hexagon.match(/\bl\b/g)?.length).toBe(5);
      expect(hexagon).toMatch(/^M .+ z$/);
    });

    it('evaluates star', () => {
      // star(cx=50, cy=50, outerR=30, innerR=15, points=5)
      // 10 vertices: 5 outer + 5 inner alternating → M + 9 l's + z
      const result = compilePath('star(50, 50, 30, 15, 5);');
      expect(result.match(/\bl\b/g)?.length).toBe(9);
      // First vertex at top: cx=50, cy=50-30=20
      expect(result).toMatch(/^M 50 20 l/);
      expect(result).toMatch(/z$/);
    });

    it('evaluates line', () => {
      const result = compilePath('line(10, 20, 30, 40);');
      expect(result).toBe('M 10 20 l 20 20');
    });

    it('evaluates quadratic', () => {
      const result = compilePath('quadratic(0, 0, 50, 100, 100, 0);');
      expect(result).toBe('M 0 0 q 50 100 100 0');
    });

    it('evaluates cubic', () => {
      const result = compilePath('cubic(0, 0, 25, 100, 75, 100, 100, 0);');
      expect(result).toBe('M 0 0 c 25 100 75 100 100 0');
    });

    it('evaluates moveTo', () => {
      const result = compilePath('moveTo(50, 100);');
      expect(result).toBe('M 50 100');
    });

    it('evaluates lineTo', () => {
      const result = compilePath('lineTo(50, 100);');
      expect(result).toBe('L 50 100');
    });

    it('evaluates closePath', () => {
      const result = compilePath('closePath();');
      expect(result).toBe('Z');
    });

    it('combines multiple path functions', () => {
      const result = compilePath('moveTo(0, 0); lineTo(100, 0); lineTo(100, 100); closePath();');
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
      expect(() => compilePath('for (i in 0..40000) { M i 0 }')).toThrow('max');
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
      expect(compilePath('fn double(x) { M calc(x * 2) 0 } double(5);')).toBe('M 10 0');
    });

    it('evaluates function with multiple params', () => {
      expect(compilePath('fn add(a, b) { M calc(a + b) 0 } add(3, 7);')).toBe('M 10 0');
    });

    it('evaluates function called multiple times', () => {
      expect(compilePath('fn point(x) { M x 0 } point(1); point(2); point(3);')).toBe('M 1 0 M 2 0 M 3 0');
    });
  });

  describe('lambdas', () => {
    it('calls a lambda stored in a variable', () => {
      expect(compilePath('let f = {|a, b| return a + b; }; M f(1, 2) 0;')).toBe('M 3 0');
    });

    it('calls a zero-param lambda', () => {
      expect(compilePath('let one = {|| return 1; }; M one() 0;')).toBe('M 1 0');
    });

    it('lambda body path-command fall-through matches named-fn fall-through exactly', () => {
      const viaLambda = compilePath('let sq = {|x, y| rect(x, y, 10, 10); }; sq(0, 0);');
      const viaFn = compilePath('fn sq(x, y) { rect(x, y, 10, 10); } sq(0, 0);');
      expect(viaLambda).toBe(viaFn);
      expect(viaLambda).toBe('M 0 0 l 10 0 l 0 10 l -10 0 z');
    });

    it('passes a lambda to a named function and calls it through the parameter', () => {
      expect(compilePath('fn use(f, v) { return f(v); } let dbl = {|x| return calc(x * 2); }; M use(dbl, 5) 0;'))
        .toBe('M 10 0');
    });

    it('nested lambdas: a lambda returned from a lambda closes over both scopes', () => {
      const result = compilePath(`
        let base = 100;
        let outer = {|a| let inner = {|b| return calc(base + a + b); }; return inner; };
        let addFive = outer(5);
        M addFive(2) 0
      `);
      expect(result).toBe('M 107 0');
    });

    it('arity error names the lambda', () => {
      expect(() => compilePath('let f = {|a, b| return a; }; M f(1) 0;'))
        .toThrow(/Lambda f expects 2 arguments, got 1/);
    });

    it('formats as Lambda(params) in template interpolation', () => {
      const result = compile('let f = {|a, b| return a; }; log(`${f}`); M 0 0;');
      expect(result.logs[0].parts[0].value).toContain('Lambda(a, b)');
    });
  });

  describe('scoping: named fns are dynamic, lambdas are lexical', () => {
    it('PINS: named fn resolves free names in the CALLER scope (dynamic)', () => {
      const result = compilePath(`
        fn f() { return amt; }
        fn g() { let amt = 7; return f(); }
        let amt = 1;
        M f() g()
      `);
      expect(result).toBe('M 1 7');
    });

    it('lambda resolves free names in the DEFINITION scope (lexical)', () => {
      const result = compilePath(`
        let scale = 3;
        let times = {|x| return calc(x * scale); };
        fn caller() { let scale = 100; return times(2); }
        M caller() 0
      `);
      expect(result).toBe('M 6 0');
    });

    it('lambda parameter shadows a captured variable of the same name', () => {
      expect(compilePath('let x = 50; let id = {|x| return x; }; M id(7) 0;')).toBe('M 7 0');
    });

    it('capture is by reference: lambda sees later reassignment', () => {
      expect(compilePath('let n = 1; let get = {|| return n; }; n = 5; M get() 0;')).toBe('M 5 0');
    });

    it('lambdas created in a loop capture per-iteration values', () => {
      const result = compilePath(`
        let fns = [];
        for (i in 1..3) {
          fns.push({|| return i; });
        }
        let f0 = fns[0];
        let f2 = fns[2];
        M f0() f2()
      `);
      expect(result).toBe('M 1 3');
    });

    it('a lambda captured inside a named fn still sees the fn-call scope it was born in', () => {
      const result = compilePath(`
        fn make(k) { return {|x| return calc(x + k); }; }
        let addTen = make(10);
        M addTen(5) 0
      `);
      expect(result).toBe('M 15 0');
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
        square();
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
      expect(compilePath('let x1 = calc(10 / 3); let x2 = calc(20 / 7); M x1 x2', { toFixed: 2 })).toBe('M 3.33 2.86');
    });

    it('rounds to 0 decimal places', () => {
      expect(compilePath('let x1 = calc(10 / 3); let x2 = calc(20 / 7); M x1 x2', { toFixed: 0 })).toBe('M 3 3');
    });

    it('rounds to 4 decimal places', () => {
      expect(compilePath('let x1 = calc(10 / 3); M x1 0', { toFixed: 4 })).toBe('M 3.3333 0');
    });

    it('does not modify integers', () => {
      expect(compilePath('M 100 200', { toFixed: 2 })).toBe('M 100 200');
    });

    it('preserves arc flags as integers', () => {
      expect(compilePath('A 25 25 0 1 1 50 50', { toFixed: 2 })).toBe('A 25 25 0 1 1 50 50');
    });

    it('handles negative decimals', () => {
      expect(compilePath('let x1 = calc(-10 / 3); let x2 = calc(-20 / 7); M x1 x2', { toFixed: 2 })).toBe('M -3.33 -2.86');
    });

    it('does not round when option not provided', () => {
      const result = compilePath('let x1 = calc(10 / 3); M x1 0');
      expect(result).toBe(`M ${10 / 3} 0`);
    });

    it('works with stdlib functions', () => {
      const result = compilePath('circle(100, 100, calc(100/3));', { toFixed: 2 });
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

    it('reassigns variable after path command on next line', () => {
      const result = compile(`
        let pos = { "x": 0, "y": 0 };
        let myLayer = PathLayer('test') \${};
        myLayer.apply {
          m 10 20
          pos = { "x": 10, "y": 20 };
          l pos.x pos.y
        }
      `);
      expect(result.layers[0].data).toBe('m 10 20 l 10 20');
    });

    it('reassigns variable inside if/else in apply block after path command', () => {
      const result = compile(`
        let pos = { "x": 0, "y": 0 };
        let myLayer = PathLayer('test') \${};
        myLayer.apply {
          if (1) {
            m 100 200
            pos = { "x": 100, "y": 200 };
          }
          l pos.x pos.y
        }
      `);
      expect(result.layers[0].data).toBe('m 100 200 l 100 200');
    });

    it('tracks position across loop iterations with assignment after path command', () => {
      const result = compile(`
        let myLayer = PathLayer('test') \${};
        let lastX = 0;
        let lastY = 0;
        let points = [{ "x": 10, "y": 20 }, { "x": 30, "y": 40 }];
        for ([pt, i] in points) {
          myLayer.apply {
            if (i == 0) {
              m pt.x pt.y
            } else {
              l calc(pt.x - lastX) calc(pt.y - lastY)
            }
            lastX = pt.x;
            lastY = pt.y;
          }
        }
      `);
      expect(result.layers[0].data).toBe('m 10 20 l 20 20');
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

  describe('booleans', () => {
    it('true is truthy in conditionals', () => {
      expect(compilePath('if (true) { M 1 0 } else { M 0 0 }')).toBe('M 1 0');
    });

    it('false is falsy in conditionals', () => {
      expect(compilePath('if (false) { M 1 0 } else { M 0 0 }')).toBe('M 0 0');
    });

    it('true == 1 is true', () => {
      expect(compilePath('if (true == 1) { M 1 0 } else { M 0 0 }')).toBe('M 1 0');
    });

    it('false == 0 is true', () => {
      expect(compilePath('if (false == 0) { M 1 0 } else { M 0 0 }')).toBe('M 1 0');
    });

    it('arithmetic: true + 1 == 2', () => {
      expect(compilePath('let x = calc(true + 1); M x 0')).toBe('M 2 0');
    });

    it('arithmetic: true + true == 2', () => {
      expect(compilePath('let x = calc(true + true); M x 0')).toBe('M 2 0');
    });

    it('log(true) displays "true"', () => {
      const result = compile('log(true);');
      expect(result.logs[0].parts[0].value).toBe('true');
    });

    it('log(false) displays "false"', () => {
      const result = compile('log(false);');
      expect(result.logs[0].parts[0].value).toBe('false');
    });

    it('log(5 > 3) displays "true"', () => {
      const result = compile('log(5 > 3);');
      expect(result.logs[0].parts[0].value).toBe('true');
    });

    it('log(1 > 5) displays "false"', () => {
      const result = compile('log(1 > 5);');
      expect(result.logs[0].parts[0].value).toBe('false');
    });

    it('negation: !true == false', () => {
      expect(compilePath('if (!true) { M 1 0 } else { M 0 0 }')).toBe('M 0 0');
    });

    it('negation: !false == true', () => {
      expect(compilePath('if (!false) { M 1 0 } else { M 0 0 }')).toBe('M 1 0');
    });

    it('logical AND: true && false == false', () => {
      expect(compilePath('if (true && false) { M 1 0 } else { M 0 0 }')).toBe('M 0 0');
    });

    it('logical OR: false || true == true', () => {
      expect(compilePath('if (false || true) { M 1 0 } else { M 0 0 }')).toBe('M 1 0');
    });

    it('template literal: `${true}` renders as "true"', () => {
      const result = compile('log(`${true}`);');
      expect(result.logs[0].parts[0].value).toBe('true');
    });

    it('path args: boolean as arc flag', () => {
      expect(compilePath('let flag = true; M 0 0 A 50 50 0 flag false 100 0')).toBe(
        'M 0 0 A 50 50 0 1 0 100 0',
      );
    });

    it('true == null is false', () => {
      expect(compilePath('if (true == null) { M 1 0 } else { M 0 0 }')).toBe('M 0 0');
    });

    it('false == null is false', () => {
      expect(compilePath('if (false == null) { M 1 0 } else { M 0 0 }')).toBe('M 0 0');
    });

    it('comparison returns boolean that displays correctly', () => {
      const result = compile('let a = 10; let b = 20; log(a < b);');
      expect(result.logs[0].parts[0].value).toBe('true');
    });

    it('boolean in variable used in conditional', () => {
      expect(compilePath('let x = 5 > 3; if (x) { M 1 0 } else { M 0 0 }')).toBe('M 1 0');
    });
  });

  describe('built-in enums', () => {
    it('Easing.Linear resolves to "linear"', () => {
      const result = compile('log(Easing.Linear);');
      expect(result.logs[0].parts[0].value).toBe('linear');
    });

    it('Easing.Smoothstep resolves to "smoothstep"', () => {
      const result = compile('log(Easing.Smoothstep);');
      expect(result.logs[0].parts[0].value).toBe('smoothstep');
    });

    it('Interpolation.OKLCH resolves to "oklch"', () => {
      const result = compile('log(Interpolation.OKLCH);');
      expect(result.logs[0].parts[0].value).toBe('oklch');
    });

    it('SpreadMethod.Pad resolves to "pad"', () => {
      const result = compile('log(SpreadMethod.Pad);');
      expect(result.logs[0].parts[0].value).toBe('pad');
    });

    it('Direction.CW resolves to "cw"', () => {
      const result = compile('log(Direction.CW);');
      expect(result.logs[0].parts[0].value).toBe('cw');
    });

    it('TopoMethod.Laplace resolves to "laplace"', () => {
      const result = compile('log(TopoMethod.Laplace);');
      expect(result.logs[0].parts[0].value).toBe('laplace');
    });

    it('Easing.Linear == "linear" is true', () => {
      expect(compilePath('if (Easing.Linear == "linear") { M 1 0 } else { M 0 0 }')).toBe('M 1 0');
    });

    it('unknown member returns null', () => {
      const result = compile('log(Easing.FooBar);');
      expect(result.logs[0].parts[0].value).toBe('null');
    });
  });

  describe('user-defined enums', () => {
    it('auto-valued enum members are lowercase strings', () => {
      const result = compile('enum Dir { Up, Down, Left, Right } log(Dir.Up);');
      expect(result.logs[0].parts[0].value).toBe('up');
    });

    it('explicit string values', () => {
      const result = compile("enum X { A = 'alpha', B = 'beta' } log(X.A);");
      expect(result.logs[0].parts[0].value).toBe('alpha');
    });

    it('explicit number values', () => {
      const result = compile('enum W { Thin = 1, Bold = 4 } M W.Thin W.Bold');
      expect(compilePath('enum W { Thin = 1, Bold = 4 } M W.Thin W.Bold')).toBe('M 1 4');
    });

    it('explicit angle values', () => {
      const result = compile('enum Ang { Quarter = 90deg } log(Ang.Quarter);');
      // First-class Angle: displays in its written unit; reads as radians in
      // numeric contexts (M Ang.Quarter 0 emits PI/2)
      expect(result.logs[0].parts[0].value).toBe('90deg');
      expect(compilePath('enum Ang { Quarter = 90deg } M Ang.Quarter 0')).toBe(`M ${Math.PI / 2} 0`);
    });

    it('explicit color values', () => {
      const result = compile('enum P { Main = #ff0000 } log(P.Main);');
      expect(result.logs[0].parts[0].value).toContain('Color(');
    });

    it('explicit boolean values', () => {
      const result = compile('enum T { On = true, Off = false } log(T.On);');
      expect(result.logs[0].parts[0].value).toBe('true');
    });

    it('enum member used in conditional', () => {
      expect(compilePath("enum Dir { Up, Down } let d = Dir.Up; if (d == 'up') { M 10 20 } else { M 0 0 }")).toBe('M 10 20');
    });

    it('unknown member returns null', () => {
      const result = compile('enum Dir { Up, Down } log(Dir.Left);');
      expect(result.logs[0].parts[0].value).toBe('null');
    });

    it('redefinition in same scope throws', () => {
      expect(() => compile('enum Dir { Up } enum Dir { Down }')).toThrow(/already defined/);
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

    describe('map', () => {
      it('transforms array elements', () => {
        expect(compilePath(
          'let arr = [10, 20, 30]; let doubled = arr.map {|x| return calc(x * 2); }; M doubled[0] doubled[1]',
        )).toBe('M 20 40');
      });

      it('returns new array, does not mutate original', () => {
        expect(compilePath(
          'let arr = [1, 2, 3]; let b = arr.map {|x| return calc(x + 10); }; M arr[0] b[0]',
        )).toBe('M 1 11');
      });

      it('empty array returns empty array', () => {
        expect(compilePath(
          'let arr = []; let b = arr.map {|x| return calc(x * 2); }; if (b.empty()) { M 1 0 } else { M 0 0 }',
        )).toBe('M 1 0');
      });

      it('no return in block produces null', () => {
        expect(compilePath(
          'let arr = [1, 2]; let b = arr.map {|x| log(x); }; if (b[0] == null) { M 1 0 } else { M 0 0 }',
        )).toBe('M 1 0');
      });

      it('result can be iterated with for-each', () => {
        expect(compilePath(
          'let arr = [1, 2, 3]; let doubled = arr.map {|x| return calc(x * 2); }; for (d in doubled) { M d 0 }',
        )).toBe('M 2 0 M 4 0 M 6 0');
      });

      it('block can access outer scope variables', () => {
        expect(compilePath(
          'let offset = 100; let arr = [1, 2]; let b = arr.map {|x| return calc(x + offset); }; M b[0] b[1]',
        )).toBe('M 101 102');
      });

      it('block can use let declarations and conditionals', () => {
        expect(compilePath(
          'let arr = [1, 2, 3]; let b = arr.map {|x| let y = calc(x * 10); if (y > 15) { return y; } else { return 0; } }; M b[0] b[1]',
        )).toBe('M 0 20');
      });

      it('result length matches input length', () => {
        expect(compilePath(
          'let arr = [5, 10, 15, 20]; let b = arr.map {|x| return calc(x + 1); }; M b.length 0',
        )).toBe('M 4 0');
      });

      it('without block throws', () => {
        expect(() => compile('let arr = [1]; let b = arr.map();')).toThrow(/requires a trailing block/);
      });

      it('with args throws', () => {
        expect(() => compile('let arr = [1]; let b = arr.map(1) {|x| return x; };')).toThrow(/takes no arguments besides the callback/);
      });

      it('wraps errors with map iteration context', () => {
        // When an error occurs inside a map callback, the error message
        // should include the iteration index and mention .map()
        expect(() => compile(`
          let arr = [{ x: 1 }, { x: 2 }];
          let result = arr.map() {|item|
            let y = item.missing_prop.nested;
            return y;
          };
        `)).toThrow(/\.map\(\) callback at index 0/);
      });

      it('evaluates function calls as object property values', () => {
        // Regression: randomRange(calc(...), calc(...)) as object property
        // was parsed as NullLiteral instead of FunctionCall
        expect(compilePath(`
          let arr = [{ y: 5 }];
          let mapped = arr.map() {|item|
            let props = { y: calc(item.y * 2) };
            return props;
          };
          M mapped[0].y 0
        `)).toBe('M 10 0');
      });
    });

    describe('slice', () => {
      it('returns sub-array with inclusive end index', () => {
        expect(compilePath(
          'let arr = [10, 20, 30, 40, 50]; let sub = arr.slice(1, 3); M sub[0] sub[1]',
        )).toBe('M 20 30');
      });

      it('inclusive end returns correct length', () => {
        expect(compilePath(
          'let arr = [10, 20, 30, 40, 50]; let sub = arr.slice(1, 3); M sub.length 0',
        )).toBe('M 3 0');
      });

      it('single arg returns from start to end of array', () => {
        expect(compilePath(
          'let arr = [10, 20, 30, 40]; let sub = arr.slice(2); M sub[0] sub[1]',
        )).toBe('M 30 40');
      });

      it('single arg returns correct length', () => {
        expect(compilePath(
          'let arr = [10, 20, 30, 40]; let sub = arr.slice(2); M sub.length 0',
        )).toBe('M 2 0');
      });

      it('negative start index counts from end', () => {
        expect(compilePath(
          'let arr = [10, 20, 30, 40]; let sub = arr.slice(-2); M sub[0] sub[1]',
        )).toBe('M 30 40');
      });

      it('negative end index counts from end (inclusive)', () => {
        expect(compilePath(
          'let arr = [10, 20, 30, 40, 50]; let sub = arr.slice(0, -2); M sub.length sub[3]',
        )).toBe('M 4 40');
      });

      it('slice(0, 0) returns first element', () => {
        expect(compilePath(
          'let arr = [10, 20, 30]; let sub = arr.slice(0, 0); M sub.length sub[0]',
        )).toBe('M 1 10');
      });

      it('returns new array (not a reference)', () => {
        expect(compilePath(
          'let arr = [1, 2, 3]; let sub = arr.slice(0, 1); sub.push(99); M arr.length sub.length',
        )).toBe('M 3 3');
      });

      it('empty array returns empty array', () => {
        expect(compilePath(
          'let arr = []; let sub = arr.slice(0); if (sub.empty()) { M 1 0 } else { M 0 0 }',
        )).toBe('M 1 0');
      });

      it('no args throws', () => {
        expect(() => compile('let arr = [1]; let sub = arr.slice();')).toThrow(/expects 1-2 arguments/);
      });

      it('both negative indexes', () => {
        expect(compilePath(
          'let arr = [10, 20, 30, 40, 50]; let sub = arr.slice(-3, -1); M sub.length sub[0]',
        )).toBe('M 3 30');
      });

      it('negative end exceeding length returns empty', () => {
        expect(compilePath(
          'let arr = [10, 20, 30]; let sub = arr.slice(0, -10); if (sub.empty()) { M 1 0 } else { M 0 0 }',
        )).toBe('M 1 0');
      });

      it('non-number arg throws', () => {
        expect(() => compile('let arr = [1]; let sub = arr.slice(`a`);')).toThrow(/start must be a number/);
      });
    });

    describe('map multi-param', () => {
      it('provides index as second block parameter', () => {
        const result = compile('let r = [10, 20, 30].map {|item, idx| return idx; }; log(r);');
        expect(result.logs[0].parts[0].value).toBe('[0, 1, 2]');
      });

      it('provides array reference as third block parameter', () => {
        const result = compile('let r = [10, 20, 30].map {|item, idx, ref| return ref.length; }; log(r);');
        expect(result.logs[0].parts[0].value).toBe('[3, 3, 3]');
      });

      it('supports look-ahead via arrayRef', () => {
        const result = compile(`
          let arr = [1, 2, 3, 4];
          let r = arr.map {|item, idx, ref|
            if (idx < ref.length - 1) {
              return calc(item + ref[idx + 1]);
            }
            return item;
          };
          log(r);
        `);
        expect(result.logs[0].parts[0].value).toBe('[3, 5, 7, 4]');
      });

      it('single param still works (backward compatible)', () => {
        const result = compile('let r = [1, 2, 3].map {|x| return calc(x * 10); }; log(r);');
        expect(result.logs[0].parts[0].value).toBe('[10, 20, 30]');
      });

      it('unused extra params are harmless', () => {
        const result = compile('let r = [5, 6].map {|item, idx, ref| return item; }; log(r);');
        expect(result.logs[0].parts[0].value).toBe('[5, 6]');
      });
    });

    describe('reduce', () => {
      it('sums numbers', () => {
        const result = compile('let sum = [1, 2, 3, 4].reduce(0) {|acc, n| return calc(acc + n); }; log(sum);');
        expect(result.logs[0].parts[0].value).toBe('10');
      });

      it('concatenates strings', () => {
        const result = compile(`
          let csv = ['a', 'b', 'c'].reduce('') {|acc, s, i|
            if (i == 0) { return s; }
            return \`\${acc},\${s}\`;
          };
          log(csv);
        `);
        expect(result.logs[0].parts[0].value).toBe('a,b,c');
      });

      it('empty array returns initial value', () => {
        const result = compile('let r = [].reduce(42) {|acc, n| return calc(acc + n); }; log(r);');
        expect(result.logs[0].parts[0].value).toBe('42');
      });

      it('single element array', () => {
        const result = compile('let r = [5].reduce(10) {|acc, n| return calc(acc + n); }; log(r);');
        expect(result.logs[0].parts[0].value).toBe('15');
      });

      it('index param works', () => {
        const result = compile('let r = [10, 20, 30].reduce(0) {|acc, item, idx| return calc(acc + idx); }; log(r);');
        expect(result.logs[0].parts[0].value).toBe('3');
      });

      it('arrayRef param works', () => {
        const result = compile('let r = [1, 2, 3].reduce(0) {|acc, item, idx, ref| return ref.length; }; log(r);');
        expect(result.logs[0].parts[0].value).toBe('3');
      });

      it('no return in block sets accumulator to null', () => {
        const result = compile('let r = [1, 2].reduce(99) {|acc, n| let x = 1; }; log(r);');
        expect(result.logs[0].parts[0].value).toBe('null');
      });

      it('builds an array accumulator', () => {
        const result = compile(`
          let r = [1, 2, 3].reduce([]) {|acc, n|
            acc.push(calc(n * 2));
            return acc;
          };
          log(r);
        `);
        expect(result.logs[0].parts[0].value).toBe('[2, 4, 6]');
      });

      it('missing initial value throws', () => {
        expect(() => compile('let r = [1].reduce() {|acc, n| return acc; };')).toThrow(/expects 1 argument/);
      });

      it('missing block throws', () => {
        expect(() => compile('let r = [1].reduce(0);')).toThrow(/requires a trailing block/);
      });
    });

    describe('mapSlice', () => {
      it('creates sliding windows', () => {
        const result = compile('let r = [1, 2, 3, 4].mapSlice(2); log(r);');
        expect(result.logs[0].parts[0].value).toBe('[[1, 2], [2, 3], [3, 4], [4]]');
      });

      it('length equals array length', () => {
        const result = compile('let r = [1, 2, 3].mapSlice(3); log(r);');
        expect(result.logs[0].parts[0].value).toBe('[[1, 2, 3], [2, 3], [3]]');
      });

      it('length of 1 wraps each element', () => {
        const result = compile('let r = [10, 20, 30].mapSlice(1); log(r);');
        expect(result.logs[0].parts[0].value).toBe('[[10], [20], [30]]');
      });

      it('empty array returns empty array', () => {
        const result = compile('let r = [].mapSlice(2); log(r);');
        expect(result.logs[0].parts[0].value).toBe('[]');
      });

      it('length exceeds array length', () => {
        const result = compile('let r = [1, 2].mapSlice(5); log(r);');
        expect(result.logs[0].parts[0].value).toBe('[[1, 2], [2]]');
      });

      it('length less than 1 throws', () => {
        expect(() => compile('let r = [1].mapSlice(0);')).toThrow(/must be at least 1/);
      });

      it('non-number argument throws', () => {
        expect(() => compile("let r = [1].mapSlice('a');")).toThrow(/must be a number/);
      });
    });

    describe('reverse', () => {
      it('returns a new reversed array', () => {
        const result = compile('let r = [1, 2, 3].reverse(); log(r);');
        expect(result.logs[0].parts[0].value).toBe('[3, 2, 1]');
      });

      it('does not mutate the original array', () => {
        const result = compile('let a = [1, 2, 3]; let r = a.reverse(); log(a); log(r);');
        expect(result.logs[0].parts[0].value).toBe('[1, 2, 3]');
        expect(result.logs[1].parts[0].value).toBe('[3, 2, 1]');
      });

      it('empty array returns empty array', () => {
        const result = compile('let r = [].reverse(); log(r);');
        expect(result.logs[0].parts[0].value).toBe('[]');
      });

      it('single element array', () => {
        const result = compile('let r = [42].reverse(); log(r);');
        expect(result.logs[0].parts[0].value).toBe('[42]');
      });

      it('reverses strings', () => {
        expect(compilePath(
          'let r = [`a`, `b`, `c`].reverse(); if (r[0] == `c`) { M 1 0 } else { M 0 0 }',
        )).toBe('M 1 0');
      });
    });

    describe('sort', () => {
      it('bare sort orders numbers ascending, not lexicographically', () => {
        const result = compile('let r = [10, 2, -1].sort(); log(r);');
        expect(result.logs[0].parts[0].value).toBe('[-1, 2, 10]');
      });

      it('bare sort handles decimals', () => {
        const result = compile('let r = [0.5, 0.25, 2].sort(); log(r);');
        expect(result.logs[0].parts[0].value).toBe('[0.25, 0.5, 2]');
      });

      it('bare sort orders strings alphabetically', () => {
        expect(compilePath(
          'let r = [`cherry`, `apple`, `banana`].sort(); if (r[0] == `apple` && r[2] == `cherry`) { M 1 0 } else { M 0 0 }',
        )).toBe('M 1 0');
      });

      it('does not mutate the original array', () => {
        const result = compile('let a = [3, 1, 2]; let r = a.sort(); log(a); log(r);');
        expect(result.logs[0].parts[0].value).toBe('[3, 1, 2]');
        expect(result.logs[1].parts[0].value).toBe('[1, 2, 3]');
      });

      it('empty array returns empty array', () => {
        const result = compile('let r = [].sort(); log(r);');
        expect(result.logs[0].parts[0].value).toBe('[]');
      });

      it('single element array', () => {
        const result = compile('let r = [7].sort(); log(r);');
        expect(result.logs[0].parts[0].value).toBe('[7]');
      });

      it('comparator sorts descending', () => {
        const result = compile('let r = [3, 1, 2].sort {|a, b| return calc(b - a); }; log(r);');
        expect(result.logs[0].parts[0].value).toBe('[3, 2, 1]');
      });

      it('comparator sorts Points by field', () => {
        expect(compilePath(
          'let pts = [Point(30, 0), Point(10, 0), Point(20, 0)]; let sorted = pts.sort {|a, b| return calc(a.x - b.x); }; M sorted[0].x sorted[2].x',
        )).toBe('M 10 30');
      });

      it('sort is stable — equal keys keep original relative order', () => {
        expect(compilePath(
          'let pts = [Point(1, 5), Point(1, 3), Point(0, 9)]; let sorted = pts.sort {|a, b| return calc(a.x - b.x); }; M sorted[1].y sorted[2].y',
        )).toBe('M 5 3');
      });

      it('comparator can access outer scope variables', () => {
        const result = compile('let dir = -1; let r = [1, 3, 2].sort {|a, b| return calc((a - b) * dir); }; log(r);');
        expect(result.logs[0].parts[0].value).toBe('[3, 2, 1]');
      });

      it('no-paren trailing block form works', () => {
        const result = compile('let r = [2, 1].sort {|a, b| return calc(a - b); }; log(r);');
        expect(result.logs[0].parts[0].value).toBe('[1, 2]');
      });

      it('paren-plus-block form works', () => {
        const result = compile('let r = [2, 1].sort() {|a, b| return calc(a - b); }; log(r);');
        expect(result.logs[0].parts[0].value).toBe('[1, 2]');
      });

      it('comparator with nested return inside if', () => {
        const result = compile(
          'let r = [3, 1, 2].sort {|a, b| if (a > b) { return 1; } if (a < b) { return -1; } return 0; }; log(r);',
        );
        expect(result.logs[0].parts[0].value).toBe('[1, 2, 3]');
      });

      it('chains with reverse', () => {
        const result = compile('let r = [2, 3, 1].sort().reverse(); log(r);');
        expect(result.logs[0].parts[0].value).toBe('[3, 2, 1]');
      });
    });
  });

  describe('spread operator', () => {
    describe('array spread', () => {
      it('copies an array', () => {
        const result = compile('let a = [1, 2, 3]; let b = [...a]; log(b);');
        expect(result.logs[0].parts[0].value).toBe('[1, 2, 3]');
      });

      it('prepends elements', () => {
        const result = compile('let a = [2, 3]; let b = [0, 1, ...a]; log(b);');
        expect(result.logs[0].parts[0].value).toBe('[0, 1, 2, 3]');
      });

      it('appends elements', () => {
        const result = compile('let a = [1, 2]; let b = [...a, 3, 4]; log(b);');
        expect(result.logs[0].parts[0].value).toBe('[1, 2, 3, 4]');
      });

      it('combines two arrays', () => {
        const result = compile('let a = [1, 2]; let b = [3, 4]; let c = [...a, ...b]; log(c);');
        expect(result.logs[0].parts[0].value).toBe('[1, 2, 3, 4]');
      });

      it('mixes spread with literal elements', () => {
        const result = compile('let a = [2]; let b = [4]; let c = [1, ...a, 3, ...b, 5]; log(c);');
        expect(result.logs[0].parts[0].value).toBe('[1, 2, 3, 4, 5]');
      });

      it('spreads an empty array', () => {
        const result = compile('let a = []; let b = [1, ...a, 2]; log(b);');
        expect(result.logs[0].parts[0].value).toBe('[1, 2]');
      });

      it('nested arrays preserve structure', () => {
        const result = compile('let a = [1, 2]; let b = [[...a], [3, 4]]; log(b);');
        expect(result.logs[0].parts[0].value).toBe('[[1, 2], [3, 4]]');
      });

      it('throws when spreading non-array', () => {
        expect(() => compile('let a = 42; let b = [...a];')).toThrow(/must be an array/);
      });
    });

    describe('object spread', () => {
      it('copies an object', () => {
        const result = compile('let a = { x: 1, y: 2 }; let b = { ...a }; log(b.x, b.y);');
        expect(result.logs[0].parts[0].value).toBe('1');
        expect(result.logs[0].parts[1].value).toBe('2');
      });

      it('extends with new properties', () => {
        const result = compile('let a = { x: 1 }; let b = { ...a, y: 2 }; log(b.x, b.y);');
        expect(result.logs[0].parts[0].value).toBe('1');
        expect(result.logs[0].parts[1].value).toBe('2');
      });

      it('later properties override earlier', () => {
        const result = compile('let a = { x: 1, y: 2 }; let b = { ...a, x: 99 }; log(b.x, b.y);');
        expect(result.logs[0].parts[0].value).toBe('99');
        expect(result.logs[0].parts[1].value).toBe('2');
      });

      it('combines multiple objects', () => {
        const result = compile('let a = { x: 1 }; let b = { y: 2 }; let c = { ...a, ...b, z: 3 }; log(c.x, c.y, c.z);');
        expect(result.logs[0].parts[0].value).toBe('1');
        expect(result.logs[0].parts[1].value).toBe('2');
        expect(result.logs[0].parts[2].value).toBe('3');
      });

      it('spreads empty object', () => {
        const result = compile('let a = {}; let b = { ...a, x: 1 }; log(b.x);');
        expect(result.logs[0].parts[0].value).toBe('1');
      });

      it('throws when spreading non-object', () => {
        expect(() => compile('let a = 42; let b = { ...a };')).toThrow(/must be an object/);
      });
    });

    describe('shorthand properties', () => {
      it('expands { x, y } to { x: x, y: y }', () => {
        const result = compile('let x = 50; let y = 80; let p = { x, y }; log(p.x, p.y);');
        expect(result.logs[0].parts[0].value).toBe('50');
        expect(result.logs[0].parts[1].value).toBe('80');
      });

      it('mixes shorthand with regular properties and spread', () => {
        const result = compile('let a = { w: 1 }; let radius = 40; let spec = { ...a, radius, cx: 100 }; log(spec.w, spec.radius, spec.cx);');
        expect(result.logs[0].parts[0].value).toBe('1');
        expect(result.logs[0].parts[1].value).toBe('40');
        expect(result.logs[0].parts[2].value).toBe('100');
      });

      it('works inside a for-loop with index destructuring', () => {
        const result = compile(`
let out = [];
for ([glyph, gIndex] in ['a', 'b']) {
  let leftOffset = calc(60 + gIndex * 48);
  out.push({ glyph, leftOffset });
}
log(out[0].glyph, out[0].leftOffset, out[1].glyph, out[1].leftOffset);
`);
        expect(result.logs[0].parts[0].value).toBe('a');
        expect(result.logs[0].parts[1].value).toBe('60');
        expect(result.logs[0].parts[2].value).toBe('b');
        expect(result.logs[0].parts[3].value).toBe('108');
      });

      it('errors on undefined variable like a normal reference', () => {
        expect(() => compile('let p = { nope };')).toThrow(/nope/);
      });
    });
  });

  describe('destructuring', () => {
    describe('array destructuring', () => {
      it('binds elements to variables', () => {
        const result = compile('let [a, b, c] = [1, 2, 3]; log(a, b, c);');
        expect(result.logs[0].parts[0].value).toBe('1');
        expect(result.logs[0].parts[1].value).toBe('2');
        expect(result.logs[0].parts[2].value).toBe('3');
      });

      it('ignores extra elements', () => {
        const result = compile('let [a, b] = [1, 2, 3, 4]; log(a, b);');
        expect(result.logs[0].parts[0].value).toBe('1');
        expect(result.logs[0].parts[1].value).toBe('2');
      });

      it('assigns null for missing elements', () => {
        const result = compile('let [a, b, c] = [1]; log(a, b, c);');
        expect(result.logs[0].parts[0].value).toBe('1');
        expect(result.logs[0].parts[1].value).toBe('null');
        expect(result.logs[0].parts[2].value).toBe('null');
      });

      it('rest pattern collects remaining elements', () => {
        const result = compile('let [first, ...rest] = [1, 2, 3, 4]; log(first, rest);');
        expect(result.logs[0].parts[0].value).toBe('1');
        expect(result.logs[0].parts[1].value).toBe('[2, 3, 4]');
      });

      it('rest pattern with empty remainder', () => {
        const result = compile('let [only, ...rest] = [42]; log(only, rest);');
        expect(result.logs[0].parts[0].value).toBe('42');
        expect(result.logs[0].parts[1].value).toBe('[]');
      });

      it('destructures nested arrays', () => {
        const result = compile('let [a, b] = [[1, 2], [3, 4]]; log(a[0], b[1]);');
        expect(result.logs[0].parts[0].value).toBe('1');
        expect(result.logs[0].parts[1].value).toBe('4');
      });

      it('throws when destructuring non-array', () => {
        expect(() => compile('let [a, b] = 42;')).toThrow(/cannot destructure/i);
      });

      it('works with function return values', () => {
        const result = compile('fn pair() { return [10, 20]; } let [x, y] = pair(); log(x, y);');
        expect(result.logs[0].parts[0].value).toBe('10');
        expect(result.logs[0].parts[1].value).toBe('20');
      });
    });

    describe('object destructuring', () => {
      it('binds properties to variables', () => {
        const result = compile('let { x, y } = { x: 50, y: 80 }; log(x, y);');
        expect(result.logs[0].parts[0].value).toBe('50');
        expect(result.logs[0].parts[1].value).toBe('80');
      });

      it('assigns null for missing keys', () => {
        const result = compile('let { x, z } = { x: 1, y: 2 }; log(x, z);');
        expect(result.logs[0].parts[0].value).toBe('1');
        expect(result.logs[0].parts[1].value).toBe('null');
      });

      it('renames properties', () => {
        const result = compile('let { z: depth } = { z: 42 }; log(depth);');
        expect(result.logs[0].parts[0].value).toBe('42');
      });

      it('rest pattern collects remaining properties', () => {
        const result = compile('let { x, ...rest } = { x: 1, y: 2, z: 3 }; log(x, rest.y, rest.z);');
        expect(result.logs[0].parts[0].value).toBe('1');
        expect(result.logs[0].parts[1].value).toBe('2');
        expect(result.logs[0].parts[2].value).toBe('3');
      });

      it('rest pattern with nothing remaining', () => {
        const result = compile('let { x } = { x: 1 }; log(x);');
        expect(result.logs[0].parts[0].value).toBe('1');
      });

      it('throws when destructuring non-object', () => {
        expect(() => compile('let { x } = [1, 2];')).toThrow(/cannot destructure/i);
      });

      it('works with spread and destructuring together', () => {
        const result = compile('let a = { x: 1 }; let b = { y: 2 }; let { x, y } = { ...a, ...b }; log(x, y);');
        expect(result.logs[0].parts[0].value).toBe('1');
        expect(result.logs[0].parts[1].value).toBe('2');
      });

      it('works with function return values', () => {
        const result = compile('fn point() { return { x: 10, y: 20 }; } let { x, y } = point(); log(x, y);');
        expect(result.logs[0].parts[0].value).toBe('10');
        expect(result.logs[0].parts[1].value).toBe('20');
      });
    });

    describe('built-in struct destructuring', () => {
      it('destructures Point x and y', () => {
        const result = compile('let point = Point(20, 30); let { x, y } = point; log(x, y);');
        expect(result.logs[0].parts[0].value).toBe('20');
        expect(result.logs[0].parts[1].value).toBe('30');
      });

      it('destructured values work in path commands', () => {
        expect(compilePath('let { x, y } = Point(20, 30); M x y')).toBe('M 20 30');
      });

      it('renames Point properties', () => {
        const result = compile('let { x: px, y: py } = Point(10, 30); log(px, py);');
        expect(result.logs[0].parts[0].value).toBe('10');
        expect(result.logs[0].parts[1].value).toBe('30');
      });

      it('destructures PolarVector angle and distance', () => {
        const result = compile('let { angle, distance } = PolarVector(0.5, 100); log(angle, distance);');
        expect(result.logs[0].parts[0].value).toBe('0.5');
        expect(result.logs[0].parts[1].value).toBe('100');
      });

      it('destructures Grid including computed width and height', () => {
        const result = compile(
          'let g = Grid(4, 5, { xDim: 10, yDim: 10 }); let { rows, cols, width, height } = g; log(rows, cols, width, height);',
        );
        expect(result.logs[0].parts[0].value).toBe('4');
        expect(result.logs[0].parts[1].value).toBe('5');
        expect(result.logs[0].parts[2].value).toBe('50');
        expect(result.logs[0].parts[3].value).toBe('40');
      });

      it('destructures Color channel properties', () => {
        const result = compile('let { lightness, chroma, hue } = oklch(0.7 0.15 200); log(lightness, chroma, hue);');
        expect(result.logs[0].parts[0].value).toBe('0.7');
        expect(result.logs[0].parts[1].value).toBe('0.15');
        expect(result.logs[0].parts[2].value).toBe('200');
      });

      it('destructured Color css matches member access', () => {
        const result = compile('let c = oklch(0.7 0.15 200); let { css } = c; log(css); log(c.css);');
        expect(result.logs[0].parts[0].value).toBe(result.logs[1].parts[0].value);
      });

      it('destructures MeshPoint x, y, and color', () => {
        const result = compile(`let mg = MeshGradient('m', 100, 100, 2, 2) {|g|
  g.colorAll(oklch(0.7 0.1 250));
};
let p = mg.getPoint(0, 0);
let { x, y, color } = p;
log(x, y);
log(color.hex);
log(p.color.hex);`);
        expect(result.logs[0].parts[0].value).toBe('0');
        expect(result.logs[0].parts[1].value).toBe('0');
        expect(result.logs[1].parts[0].value).toBe(result.logs[2].parts[0].value);
      });

      it('destructures ctx.position mid-path', () => {
        const result = compile('M 50 50 L 120 80 let { x, y } = ctx.position; log(x, y);');
        expect(result.logs[0].parts[0].value).toBe('120');
        expect(result.logs[0].parts[1].value).toBe('80');
      });

      it('rest pattern collects remaining Point properties', () => {
        const result = compile('let { x, ...rest } = Point(1, 2); log(x, rest.y);');
        expect(result.logs[0].parts[0].value).toBe('1');
        expect(result.logs[0].parts[1].value).toBe('2');
      });

      it('Grid rest pattern includes computed properties', () => {
        const result = compile(
          'let { rows, cols, ...dims } = Grid(4, 5, { xDim: 10, yDim: 10 }); log(dims.width, dims.height);',
        );
        expect(result.logs[0].parts[0].value).toBe('50');
        expect(result.logs[0].parts[1].value).toBe('40');
      });

      it('throws with line number for a missing struct key', () => {
        expect(() => compile("let { z } = Point(1, 2);")).toThrow(/Line 1: Property 'z' does not exist on Point/);
      });

      it('throws for a missing key on ctx.position', () => {
        expect(() => compile('M 0 0 let { q } = ctx.position;')).toThrow(/Property 'q' does not exist on context object/);
      });

      it('still throws when destructuring a plain number', () => {
        expect(() => compile('let { x } = 5;')).toThrow(/cannot destructure/i);
      });

      it('still throws for array pattern on a struct', () => {
        expect(() => compile('let [a, b] = Point(1, 2);')).toThrow(/cannot destructure non-array/i);
      });

      it('object-literal missing keys still bind null', () => {
        const result = compile('let { x, z } = { x: 1, y: 2 }; log(x, z);');
        expect(result.logs[0].parts[0].value).toBe('1');
        expect(result.logs[0].parts[1].value).toBe('null');
      });

      it('destructures inside a text block body', () => {
        const result = compile(`
        define TextLayer('labels') \${}
        layer('labels').apply {
          text(10, 20) {
            let { x, y } = Point(7, 9);
            \`at \${x},\${y}\`
          }
        }
      `);
        const te = result.layers[0].textElements![0];
        expect(te.children[0]).toEqual({ type: 'run', text: 'at 7,9' });
      });

      it('missing struct key inside a text block reports a line number', () => {
        expect(() =>
          compile(`
        define TextLayer('labels') \${}
        layer('labels').apply {
          text(10, 20) {
            let { z } = Point(1, 2);
          }
        }
      `),
        ).toThrow(/Line \d+: Property 'z' does not exist on Point/);
      });
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

    it('.offset(other) returns dx and dy', () => {
      expect(compilePath('let p1 = Point(200, 200); let p2 = Point(100, 300); let off = p1.offset(p2); M off.dx off.dy')).toBe(
        'M -100 100',
      );
    });

    it('.offset(other) reverse direction negates values', () => {
      expect(compilePath('let p1 = Point(200, 200); let p2 = Point(100, 300); let off = p2.offset(p1); M off.dx off.dy')).toBe(
        'M 100 -100',
      );
    });

    it('.offset(self) returns zero', () => {
      expect(compilePath('let pt = Point(50, 50); let off = pt.offset(pt); M off.dx off.dy')).toBe(
        'M 0 0',
      );
    });

    it('.offset(other) used in calc expression', () => {
      expect(compilePath('let p1 = Point(10, 20); let p2 = Point(30, 50); let off = p1.offset(p2); M calc(p1.x + off.dx) calc(p1.y + off.dy)')).toBe(
        'M 30 50',
      );
    });

    it('.offset() with no argument throws', () => {
      expect(() => compilePath('let pt = Point(0, 0); let off = pt.offset(); M 0 0')).toThrow('offset() expects 1 argument');
    });

    it('.offset() with non-Point argument throws', () => {
      expect(() => compilePath('let pt = Point(0, 0); let off = pt.offset(5); M 0 0')).toThrow('offset() argument must be a Point');
    });

    it('.offset() with too many arguments throws', () => {
      expect(() => compilePath('let p1 = Point(0, 0); let p2 = Point(1, 1); let off = p1.offset(p2, p2); M 0 0')).toThrow('offset() expects 1 argument');
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
      // All comparisons should be truthy (true)
      for (const log of result.logs) {
        expect(log.parts[0].value).toBe('true');
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

  describe('color literals', () => {
    it('evaluates 6-digit hex literal to ColorValue', () => {
      const result = compile('let c = #cc0000; log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#cc0000');
    });

    it('evaluates 3-digit hex literal to ColorValue', () => {
      const result = compile('let c = #f00; log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#ff0000');
    });

    it('evaluates 8-digit hex literal with alpha', () => {
      const result = compile('let c = #ff000080; log(c.a);');
      const alpha = parseFloat(result.logs[0].parts[0].value);
      expect(alpha).toBeCloseTo(0.502, 1);
    });

    it('evaluates 4-digit hex literal with alpha', () => {
      const result = compile('let c = #f008; log(c.a);');
      const alpha = parseFloat(result.logs[0].parts[0].value);
      expect(alpha).toBeCloseTo(0.533, 1);
    });

    it('supports method chaining on hex literal via parens', () => {
      const result = compile('let c = (#cc0000).lighten(0.2); log(c.hex);');
      // Lightened red should be a lighter shade
      expect(result.logs[0].parts[0].value).not.toBe('#cc0000');
      expect(result.logs[0].parts[0].value).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('Color() accepts ColorValue pass-through', () => {
      const result = compile('let c = Color(#cc0000); log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#cc0000');
    });

    it('hex literal properties work', () => {
      const result = compile('let c = #00ff00; log(c.hex); log(c.css);');
      expect(result.logs[0].parts[0].value).toBe('#00ff00');
      expect(result.logs[1].parts[0].value).toMatch(/^#00ff00|rgb/);
    });

    it('lighten with percent suffix on hex literal', () => {
      const result = compile('let c = (#cc0000).lighten(20%); log(c.hex);');
      // 20% = 0.2, lighten by 0.2
      expect(result.logs[0].parts[0].value).not.toBe('#cc0000');
      expect(result.logs[0].parts[0].value).toMatch(/^#[0-9a-f]{6}$/);
    });
  });

  describe('CSS color function literals', () => {
    it('evaluates rgb() to ColorValue', () => {
      const result = compile('let c = rgb(255, 0, 0); log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#ff0000');
    });

    it('evaluates rgba() with alpha', () => {
      const result = compile('let c = rgba(255, 0, 0, 0.5); log(c.a);');
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.5, 2);
    });

    it('evaluates hsl() to ColorValue', () => {
      const result = compile('let c = hsl(0, 100%, 50%); log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#ff0000');
    });

    it('evaluates oklch() to ColorValue', () => {
      const result = compile('let c = oklch(0.6 0.15 30); log(c.css);');
      expect(result.logs[0].parts[0].value).toMatch(/^#|^rgb/);
    });

    it('evaluates oklch() with percentage L and C (CSS spec scaling)', () => {
      // CSS spec: L 100% = 1.0, C 100% = 0.4. So 79% L → 0.79, 32% C → 0.128.
      // Matches what hdr-color-input emits and what colorjs.io parses.
      const result = compile(
        'let c = oklch(79% 32% 178); log(c.lightness); log(c.chroma); log(c.hue);',
      );
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.79, 4);
      expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(0.128, 4);
      expect(parseFloat(result.logs[2].parts[0].value)).toBeCloseTo(178, 2);
    });

    it('oklch() accepts percentage alpha', () => {
      const result = compile('let c = oklch(0.79 0.32 178 / 50%); log(c.a);');
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.5, 4);
    });

    it('oklch() accepts mixed numeric and percentage forms per axis', () => {
      const result = compile(
        'let c = oklch(0.79 32% 178); log(c.lightness); log(c.chroma);',
      );
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.79, 4);
      expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(0.128, 4);
    });

    it('evaluates oklab() with percentage L and a/b (CSS spec scaling)', () => {
      // CSS spec: oklab L 100% = 1.0, a/b 100% = 0.4.
      const result = compile(
        'let c = oklab(73% 50% -25%); log(c.lightness);',
      );
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.73, 4);
    });

    it('oklab() with negative numeric a/b still parses (no percentage)', () => {
      // The user's commented-out example: oklab(73% .19 -.09)
      const result = compile('let c = oklab(73% .19 -.09); log(c.lightness);');
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.73, 4);
    });

    it('hsl() accepts modern space-separated form', () => {
      const result = compile('let c = hsl(120 100% 40%); log(c.hex);');
      // hsl(120, 100%, 40%) is pure green at 40% lightness
      expect(result.logs[0].parts[0].value).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('hsl() modern form with / alpha', () => {
      const result = compile('let c = hsl(120 100% 40% / 50%); log(c.a);');
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.5, 4);
    });

    it('hsl() legacy comma form still works', () => {
      const result = compile('let c = hsl(120, 100%, 40%); log(c.hex);');
      expect(result.logs[0].parts[0].value).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('rgb() accepts modern space-separated form', () => {
      const result = compile('let c = rgb(255 128 0); log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#ff8000');
    });

    it('rgb() accepts percentage components', () => {
      // 100% 50% 0% → 255, 127.5, 0 → rounds to ff8000 (or close)
      const result = compile('let c = rgb(100% 50% 0%); log(c.hex);');
      expect(result.logs[0].parts[0].value).toMatch(/^#ff[78][0f]00$/);
    });

    it('rgb() modern form with / alpha', () => {
      const result = compile('let c = rgb(255 128 0 / 50%); log(c.a);');
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.5, 4);
    });

    it('hwb() accepts percent alpha via /', () => {
      const result = compile('let c = hwb(120 0% 50% / 25%); log(c.a);');
      expect(parseFloat(result.logs[0].parts[0].value)).toBeCloseTo(0.25, 4);
    });

    it('reports source position when color is invalid', () => {
      // Regression: parseColor() throws without loc, so the error read "Line 1:1"
      // even when the call was on a later line.
      let err: Error | null = null;
      try {
        compile('let a = 1;\nlet b = 2;\nlet c = oklch(bogus);');
      } catch (e) {
        err = e as Error;
      }
      expect(err).not.toBeNull();
      // Should reference line 3 (where oklch(bogus) sits), not line 1.
      expect(err!.message).toMatch(/Line 3/);
      expect(err!.message).toMatch(/Invalid color/);
    });

    it('method chaining on CSS color function', () => {
      const result = compile('let c = rgb(255, 0, 0).lighten(0.2); log(c.hex);');
      expect(result.logs[0].parts[0].value).not.toBe('#ff0000');
      expect(result.logs[0].parts[0].value).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('parenthesized CSSColorLiteral with method evaluates correctly', () => {
      const result = compile('let c = (rgba(0, 0, 200, 1).lighten(20%)); log(c.hex);');
      expect(result.logs[0].parts[0].value).toMatch(/^#[0-9a-f]{6}$/);
      expect(result.logs[0].parts[0].value).not.toBe('#0000c8');
    });

    it('parenthesized function call evaluates correctly', () => {
      const result = compile('let v = (sin(0)); log(v);');
      expect(result.logs[0].parts[0].value).toBe('0');
    });

    it('parenthesized member access evaluates correctly', () => {
      const result = compile('let obj = {a: 42}; let v = (obj.a); log(v);');
      expect(result.logs[0].parts[0].value).toBe('42');
    });

    it('CSS color function shadows user-defined function of same name', () => {
      // rgb() is always a color literal, even if user defines fn rgb()
      const result = compile('let c = rgb(255, 0, 0); log(c.hex);');
      expect(result.logs[0].parts[0].value).toBe('#ff0000');
    });
  });

  describe('percent suffix', () => {
    it('converts percent to decimal', () => {
      const result = compile('let x = 50%; log(x);');
      expect(result.logs[0].parts[0].value).toBe('0.5');
    });

    it('works with zero percent', () => {
      const result = compile('let x = 0%; log(x);');
      expect(result.logs[0].parts[0].value).toBe('0');
    });

    it('works with 100 percent', () => {
      const result = compile('let x = 100%; log(x);');
      expect(result.logs[0].parts[0].value).toBe('1');
    });

    it('modulus with spaces still works', () => {
      const result = compile('let x = calc(10 % 3); log(x);');
      expect(result.logs[0].parts[0].value).toBe('1');
    });

    it('percent suffix and modulus together: calc(20% % 2%)', () => {
      // 20% = 0.2, 2% = 0.02, 0.2 % 0.02 ≈ 0
      const result = compile('let x = calc(20% % 2%); log(x);');
      const val = parseFloat(result.logs[0].parts[0].value);
      expect(val).toBeCloseTo(0, 10);
    });

    it('percent in arithmetic: 50% + 0.25', () => {
      const result = compile('let x = calc(50% + 0.25); log(x);');
      expect(result.logs[0].parts[0].value).toBe('0.75');
    });
  });

  describe('chained bezier splines', () => {
    const cubicSplineFn = `
      fn cubicSpline(points) {
        M points[0].x points[0].y
        let n = calc(points.length - 1);
        if (n > 0) {
          for (i in 1..n) {
            let prev = points[calc(i - 1)];
            let curr = points[i];
            let c1x = calc(prev.x + prev.exit * cos(prev.angle));
            let c1y = calc(prev.y + prev.exit * sin(prev.angle));
            let c2x = calc(curr.x - curr.entry * cos(curr.angle));
            let c2y = calc(curr.y - curr.entry * sin(curr.angle));
            C c1x c1y c2x c2y curr.x curr.y
          }
        }
      }
    `;

    const quadSplineFn = `
      fn quadSpline(start, points, end) {
        M start.x start.y
        let cpx = calc(start.x + start.exit * cos(start.angle));
        let cpy = calc(start.y + start.exit * sin(start.angle));
        if (points.length > 0) {
          Q cpx cpy points[0].x points[0].y
          let prevCPx = cpx;
          let prevCPy = cpy;
          for ([pt, idx] in points) {
            let angle = atan2(calc(pt.y - prevCPy), calc(pt.x - prevCPx));
            let newCPx = calc(pt.x + pt.exit * cos(angle));
            let newCPy = calc(pt.y + pt.exit * sin(angle));
            if (idx < calc(points.length - 1)) {
              let nextIdx = calc(idx + 1);
              Q newCPx newCPy points[nextIdx].x points[nextIdx].y
            } else {
              Q newCPx newCPy end.x end.y
            }
            prevCPx = newCPx;
            prevCPy = newCPy;
          }
        } else {
          Q cpx cpy end.x end.y
        }
      }
    `;

    const clippedQuadSplineFn = `
      fn clippedQuadSpline(start, points, end) {
        M start.x start.y
        let cpx = calc(start.x + start.exit * cos(start.angle));
        let cpy = calc(start.y + start.exit * sin(start.angle));
        if (points.length > 0) {
          let c1x = lerp(start.x, cpx, start.exitTime);
          let c1y = lerp(start.y, cpy, start.exitTime);
          let c2x = lerp(points[0].x, cpx, points[0].entryTime);
          let c2y = lerp(points[0].y, cpy, points[0].entryTime);
          C c1x c1y c2x c2y points[0].x points[0].y
          let prevCPx = cpx;
          let prevCPy = cpy;
          for ([pt, idx] in points) {
            let angle = atan2(calc(pt.y - prevCPy), calc(pt.x - prevCPx));
            let newCPx = calc(pt.x + pt.exit * cos(angle));
            let newCPy = calc(pt.y + pt.exit * sin(angle));
            let c1x = lerp(pt.x, newCPx, pt.exitTime);
            let c1y = lerp(pt.y, newCPy, pt.exitTime);
            if (idx < calc(points.length - 1)) {
              let nextIdx = calc(idx + 1);
              let c2x = lerp(points[nextIdx].x, newCPx, points[nextIdx].entryTime);
              let c2y = lerp(points[nextIdx].y, newCPy, points[nextIdx].entryTime);
              C c1x c1y c2x c2y points[nextIdx].x points[nextIdx].y
            } else {
              let c2x = lerp(end.x, newCPx, end.entryTime);
              let c2y = lerp(end.y, newCPy, end.entryTime);
              C c1x c1y c2x c2y end.x end.y
            }
            prevCPx = newCPx;
            prevCPy = newCPy;
          }
        } else {
          let c1x = lerp(start.x, cpx, start.exitTime);
          let c1y = lerp(start.y, cpy, start.exitTime);
          let c2x = lerp(end.x, cpx, end.entryTime);
          let c2y = lerp(end.y, cpy, end.entryTime);
          C c1x c1y c2x c2y end.x end.y
        }
      }
    `;

    describe('cubicSpline', () => {
      it('3-point chain: M + 2 C commands with computed CPs', () => {
        const result = compilePath(`
          ${cubicSplineFn}
          cubicSpline([
            { x: 0, y: 100, angle: 0, exit: 30 },
            { x: 50, y: 0, angle: 0, entry: 20, exit: 25 },
            { x: 100, y: 100, angle: 0, entry: 30 }
          ]);
        `);
        // angle=0: cos(0)=1, sin(0)=0
        // Seg 1: CP1=(0+30,100+0)=(30,100), CP2=(50-20,0-0)=(30,0)
        // Seg 2: CP1=(50+25,0+0)=(75,0), CP2=(100-30,100-0)=(70,100)
        expect(result).toBe('M 0 100 C 30 100 30 0 50 0 C 75 0 70 100 100 100');
      });

      it('2-point chain: single cubic segment', () => {
        const result = compilePath(`
          ${cubicSplineFn}
          cubicSpline([
            { x: 0, y: 0, angle: 0, exit: 40 },
            { x: 100, y: 50, angle: 0, entry: 30 }
          ]);
        `);
        // CP1=(0+40,0)=(40,0), CP2=(100-30,50)=(70,50)
        expect(result).toBe('M 0 0 C 40 0 70 50 100 50');
      });

      it('G1 continuity: CPs at shared point are collinear', () => {
        const result = compilePath(`
          ${cubicSplineFn}
          cubicSpline([
            { x: 0, y: 100, angle: 0, exit: 30 },
            { x: 50, y: 0, angle: 0, entry: 20, exit: 25 },
            { x: 100, y: 100, angle: 0, entry: 30 }
          ]);
        `);
        const cmds = parseSVGPath(result);
        // At shared point P1=(50,0):
        // Seg 1 CP2=(30,0), Seg 2 CP1=(75,0) — both on y=0, collinear with P1
        const seg1CP2 = { x: cmds[1].args[2], y: cmds[1].args[3] };
        const seg2CP1 = { x: cmds[2].args[0], y: cmds[2].args[1] };
        const sharedPt = { x: cmds[1].args[4], y: cmds[1].args[5] };
        const inAngle = Math.atan2(sharedPt.y - seg1CP2.y, sharedPt.x - seg1CP2.x);
        const outAngle = Math.atan2(seg2CP1.y - sharedPt.y, seg2CP1.x - sharedPt.x);
        expect(inAngle).toBeCloseTo(outAngle, 10);
      });

      it('single-point array: emits only M', () => {
        const result = compilePath(`
          ${cubicSplineFn}
          cubicSpline([{ x: 50, y: 50, angle: 0 }]);
        `);
        expect(result).toBe('M 50 50');
      });

      it('no error when last point lacks exit and first point lacks entry', () => {
        const result = compilePath(`
          ${cubicSplineFn}
          cubicSpline([
            { x: 0, y: 0, angle: 0, exit: 20 },
            { x: 100, y: 0, angle: 0, entry: 20 }
          ]);
        `);
        // exit on last and entry on first are never accessed by the algorithm
        expect(result).toBe('M 0 0 C 20 0 80 0 100 0');
      });
    });

    describe('quadSpline', () => {
      it('start + end only (no intermediates): single Q segment', () => {
        const result = compilePath(`
          ${quadSplineFn}
          quadSpline(
            { x: 0, y: 0, angle: 0, exit: 40 },
            [],
            { x: 100, y: 50 }
          );
        `);
        // cp = (0+40*1, 0+40*0) = (40, 0)
        expect(result).toBe('M 0 0 Q 40 0 100 50');
      });

      it('one intermediate: verifies angle inference via atan2', () => {
        const result = compilePath(`
          ${quadSplineFn}
          quadSpline(
            { x: 0, y: 0, angle: 0, exit: 30 },
            [{ x: 60, y: 0, exit: 30 }],
            { x: 120, y: 0 }
          );
        `);
        // First cp=(30,0), Q 30 0 60 0
        // At (60,0): prevCP=(30,0), angle=atan2(0,30)=0
        // newCP=(90,0), Q 90 0 120 0
        expect(result).toBe('M 0 0 Q 30 0 60 0 Q 90 0 120 0');
      });

      it('angle inference with non-trivial geometry', () => {
        const result = compilePath(`
          ${quadSplineFn}
          quadSpline(
            { x: 0, y: 0, angle: 0, exit: 40 },
            [{ x: 50, y: 30, exit: 30 }],
            { x: 100, y: 50 }
          );
        `);
        // First cp=(40,0), Q 40 0 50 30
        // At (50,30): prevCP=(40,0), angle=atan2(30,10)
        // cos(atan2(30,10))=10/√1000=1/√10, sin=3/√10
        const sqrt10 = Math.sqrt(10);
        const newCPx = 50 + 30 / sqrt10;
        const newCPy = 30 + 90 / sqrt10;
        expectSVGPathCommandSequence(result, [
          ['M', 0, 0],
          ['Q', 40, 0, 50, 30],
          ['Q', newCPx, newCPy, 100, 50],
        ], { precision: 4 });
      });

      it('symmetric collinear layout', () => {
        const result = compilePath(`
          ${quadSplineFn}
          quadSpline(
            { x: 0, y: 0, angle: 0, exit: 50 },
            [{ x: 100, y: 0, exit: 50 }],
            { x: 200, y: 0 }
          );
        `);
        // cp1=(50,0), Q 50 0 100 0
        // At (100,0): angle=0, newCP=(150,0), Q 150 0 200 0
        expect(result).toBe('M 0 0 Q 50 0 100 0 Q 150 0 200 0');
      });
    });

    describe('clippedQuadSpline', () => {
      it('exitTime=1, entryTime=1: CPs at shared position (degenerate cubic)', () => {
        const result = compilePath(`
          ${clippedQuadSplineFn}
          clippedQuadSpline(
            { x: 0, y: 0, angle: 0, exit: 50, exitTime: 1 },
            [],
            { x: 100, y: 0, entryTime: 1 }
          );
        `);
        // sharedCP=(50,0)
        // CP1=lerp(0,50,1)=50, CP2=lerp(100,50,1)=50
        expect(result).toBe('M 0 0 C 50 0 50 0 100 0');
      });

      it('exitTime=0.5: CPs at half arm length', () => {
        const result = compilePath(`
          ${clippedQuadSplineFn}
          clippedQuadSpline(
            { x: 0, y: 0, angle: 0, exit: 100, exitTime: 0.5 },
            [],
            { x: 200, y: 0, entryTime: 0.5 }
          );
        `);
        // sharedCP=(100,0)
        // CP1=lerp(0,100,0.5)=50, CP2=lerp(200,100,0.5)=150
        expect(result).toBe('M 0 0 C 50 0 150 0 200 0');
      });

      it('emits C commands (not Q)', () => {
        const result = compilePath(`
          ${clippedQuadSplineFn}
          clippedQuadSpline(
            { x: 0, y: 0, angle: 0, exit: 40, exitTime: 0.8 },
            [],
            { x: 100, y: 0, entryTime: 0.8 }
          );
        `);
        expect(result).toContainSVGCommands(['M', 'C']);
        expect(result).not.toContain('Q ');
      });
    });

    describe('integration', () => {
      it('cubicSpline called inside a for loop with computed points', () => {
        const result = compilePath(`
          ${cubicSplineFn}
          for (i in 0..1) {
            let ox = calc(i * 100);
            cubicSpline([
              { x: ox, y: 0, angle: 0, exit: 20 },
              { x: calc(ox + 50), y: 50, angle: 0, entry: 20 }
            ]);
          }
        `);
        // i=0: M 0 0 C 20 0 30 50 50 50
        // i=1: M 100 0 C 120 0 130 50 150 50
        expect(result).toBe('M 0 0 C 20 0 30 50 50 50 M 100 0 C 120 0 130 50 150 50');
      });

      it('points defined using calc() expressions', () => {
        const result = compilePath(`
          ${cubicSplineFn}
          let bx = 10;
          let by = 20;
          cubicSpline([
            { x: bx, y: by, angle: 0, exit: 15 },
            { x: calc(bx + 50), y: calc(by + 30), angle: 0, entry: 15 }
          ]);
        `);
        // P0=(10,20), P1=(60,50), CP1=(25,20), CP2=(45,50)
        expect(result).toBe('M 10 20 C 25 20 45 50 60 50');
      });

      it('multiple spline types in sequence', () => {
        const result = compilePath(`
          ${cubicSplineFn}
          ${quadSplineFn}
          cubicSpline([
            { x: 0, y: 0, angle: 0, exit: 20 },
            { x: 50, y: 0, angle: 0, entry: 20 }
          ]);
          quadSpline(
            { x: 60, y: 0, angle: 0, exit: 20 },
            [],
            { x: 100, y: 0 }
          );
        `);
        // cubicSpline: M 0 0 C 20 0 30 0 50 0
        // quadSpline: M 60 0 Q 80 0 100 0
        expect(result).toBe('M 0 0 C 20 0 30 0 50 0 M 60 0 Q 80 0 100 0');
      });
    });
  });

  describe('stdlib chained bezier splines', () => {
    describe('cubicSpline', () => {
      it('3-point chain: m + 2 c commands with computed CPs', () => {
        const result = compilePath(`
          cubicSpline([
            { x: 0, y: 100, angle: 0, exit: 30 },
            { x: 50, y: 0, angle: 0, entry: 20, exit: 25 },
            { x: 100, y: 100, angle: 0, entry: 30 }
          ]);
        `);
        // angle=0: cos(0)=1, sin(0)=0
        // Absolute: M(0,100) C(30,100)(30,0)(50,0) C(75,0)(70,100)(100,100)
        // Seg 1 pen=(0,100): c1=(30,0) c2=(30,-100) end=(50,-100)
        // Seg 2 pen=(50,0):  c1=(25,0) c2=(20,100)  end=(50,100)
        expect(result).toBe('m 0 100 c 30 0 30 -100 50 -100 c 25 0 20 100 50 100');
      });

      it('single-point array: emits only m', () => {
        const result = compilePath(`
          cubicSpline([{ x: 50, y: 50, angle: 0 }]);
        `);
        expect(result).toBe('m 50 50');
      });

      it('G1 continuity: CPs at shared point are collinear', () => {
        const result = compilePath(`
          cubicSpline([
            { x: 0, y: 100, angle: 0, exit: 30 },
            { x: 50, y: 0, angle: 0, entry: 20, exit: 25 },
            { x: 100, y: 100, angle: 0, entry: 30 }
          ]);
        `);
        const cmds = parseSVGPath(result);
        // Relative coords — convert to absolute for collinearity check
        // m(0,100) → pen at (0,100)
        // c(30,0)(30,-100)(50,-100) → abs CP2=(0+30, 100-100)=(30,0), abs end=(0+50, 100-100)=(50,0)
        // c(25,0)(20,100)(50,100)   → abs CP1=(50+25, 0+0)=(75,0)
        // At shared point (50,0): seg1 CP2 abs=(30,0), seg2 CP1 abs=(75,0) — collinear on y=0
        const pen0x = cmds[0].args[0]; // 0
        const pen0y = cmds[0].args[1]; // 100
        const seg1CP2 = { x: pen0x + cmds[1].args[2], y: pen0y + cmds[1].args[3] };
        const sharedPt = { x: pen0x + cmds[1].args[4], y: pen0y + cmds[1].args[5] };
        const seg2CP1 = { x: sharedPt.x + cmds[2].args[0], y: sharedPt.y + cmds[2].args[1] };
        const inAngle = Math.atan2(sharedPt.y - seg1CP2.y, sharedPt.x - seg1CP2.x);
        const outAngle = Math.atan2(seg2CP1.y - sharedPt.y, seg2CP1.x - sharedPt.x);
        expect(inAngle).toBeCloseTo(outAngle, 10);
      });

      it('non-zero angle produces correct CPs', () => {
        const result = compilePath(`
          cubicSpline([
            { x: 0, y: 0, angle: calc(PI() / 2), exit: 40 },
            { x: 100, y: 100, angle: calc(PI() / 2), entry: 30 }
          ]);
        `);
        // angle=π/2: cos≈0, sin=1
        // Absolute: CP1=(0,40), CP2=(100,70), end=(100,100)
        // Relative from pen (0,0): c (0,40)(100,70)(100,100)
        expectSVGPathCommandSequence(result, [
          ['m', 0, 0],
          ['c', 0, 40, 100, 70, 100, 100],
        ], { precision: 4 });
      });
    });

    describe('quadSpline', () => {
      it('start + end only (no intermediates): single q segment', () => {
        const result = compilePath(`
          quadSpline(
            { x: 0, y: 0, angle: 0, exit: 40 },
            [],
            { x: 100, y: 50 }
          );
        `);
        // Absolute: cp=(40,0), end=(100,50). Relative from pen (0,0): same values
        expect(result).toBe('m 0 0 q 40 0 100 50');
      });

      it('one intermediate: verifies angle inference via atan2', () => {
        const result = compilePath(`
          quadSpline(
            { x: 0, y: 0, angle: 0, exit: 30 },
            [{ x: 60, y: 0, exit: 30 }],
            { x: 120, y: 0 }
          );
        `);
        // Absolute: M 0 0  Q(30,0)(60,0)  Q(90,0)(120,0)
        // Seg 1 pen=(0,0):  q(30,0)(60,0)
        // Seg 2 pen=(60,0): q(30,0)(60,0)
        expect(result).toBe('m 0 0 q 30 0 60 0 q 30 0 60 0');
      });

      it('angle inference with non-trivial geometry', () => {
        const result = compilePath(`
          quadSpline(
            { x: 0, y: 0, angle: 0, exit: 40 },
            [{ x: 50, y: 30, exit: 30 }],
            { x: 100, y: 50 }
          );
        `);
        // Absolute: Q(40,0)(50,30)  then Q(newCPx, newCPy)(100,50)
        // Seg 1 pen=(0,0):  q(40,0)(50,30)
        // Seg 2 pen=(50,30): newCPx=50+30/√10, newCPy=30+90/√10
        //   relative: (newCPx-50, newCPy-30) = (30/√10, 90/√10), end=(50,20)
        const sqrt10 = Math.sqrt(10);
        expectSVGPathCommandSequence(result, [
          ['m', 0, 0],
          ['q', 40, 0, 50, 30],
          ['q', 30 / sqrt10, 90 / sqrt10, 50, 20],
        ], { precision: 4 });
      });
    });

    describe('clippedQuadSpline', () => {
      it('exitTime=1, entryTime=1: CPs at shared position (degenerate cubic)', () => {
        const result = compilePath(`
          clippedQuadSpline(
            { x: 0, y: 0, angle: 0, exit: 50, exitTime: 1 },
            [],
            { x: 100, y: 0, entryTime: 1 }
          );
        `);
        // Absolute: CP1=(50,0), CP2=(50,0), end=(100,0)
        // Relative from pen (0,0): same values
        expect(result).toBe('m 0 0 c 50 0 50 0 100 0');
      });

      it('exitTime=0.5: CPs at half arm length', () => {
        const result = compilePath(`
          clippedQuadSpline(
            { x: 0, y: 0, angle: 0, exit: 100, exitTime: 0.5 },
            [],
            { x: 200, y: 0, entryTime: 0.5 }
          );
        `);
        // Absolute: CP1=(50,0), CP2=(150,0), end=(200,0)
        // Relative from pen (0,0): same values
        expect(result).toBe('m 0 0 c 50 0 150 0 200 0');
      });

      it('emits c commands (not q)', () => {
        const result = compilePath(`
          clippedQuadSpline(
            { x: 0, y: 0, angle: 0, exit: 40, exitTime: 0.8 },
            [],
            { x: 100, y: 0, entryTime: 0.8 }
          );
        `);
        expect(result).toContainSVGCommands(['m', 'c']);
        expect(result).not.toContain('q ');
        expect(result).not.toContain('Q ');
      });
    });

    describe('user fn shadows stdlib', () => {
      it('user-defined cubicSpline takes precedence over stdlib', () => {
        const result = compilePath(`
          fn cubicSpline(points) {
            M points[0].x points[0].y
            let n = calc(points.length - 1);
            if (n > 0) {
              for (i in 1..n) {
                let prev = points[calc(i - 1)];
                let curr = points[i];
                let c1x = calc(prev.x + prev.exit * cos(prev.angle));
                let c1y = calc(prev.y + prev.exit * sin(prev.angle));
                let c2x = calc(curr.x - curr.entry * cos(curr.angle));
                let c2y = calc(curr.y - curr.entry * sin(curr.angle));
                C c1x c1y c2x c2y curr.x curr.y
              }
            }
          }
          cubicSpline([
            { x: 0, y: 0, angle: 0, exit: 20 },
            { x: 100, y: 0, angle: 0, entry: 20 }
          ]);
        `);
        // User fn emits absolute commands (M, C) — different from stdlib's relative (m, c)
        expect(result).toBe('M 0 0 C 20 0 80 0 100 0');
      });
    });

    describe('integration', () => {
      it('cubicSpline inside a for loop', () => {
        const result = compilePath(`
          for (i in 0..1) {
            let ox = calc(i * 100);
            cubicSpline([
              { x: ox, y: 0, angle: 0, exit: 20 },
              { x: calc(ox + 50), y: 50, angle: 0, entry: 20 }
            ]);
          }
        `);
        // i=0: m(0,0) c(20,0)(30,50)(50,50)  — pen at (0,0), rel from (0,0)
        // i=1: m(100,0) c(20,0)(30,50)(50,50) — pen at (50,50), m(100,0) moves to (150,50)
        //   Wait — m is relative to current pen. After i=0, pen is at abs (50,50).
        //   i=1 points: ox=100, P0=(100,0), P1=(150,50)
        //   m(100,0) relative to pen(50,50) would move to abs(150,50) — wrong.
        //   But stdlib computes m(ox, 0) = m(100, 0). The evaluator tracks
        //   position from the emitted path string, so m 100 0 from pen(50,50)
        //   lands at abs(150,50). The c args are relative to each segment's start.
        //   Seg: c1=(100+20,0)=(120,0), c2=(150-20,50)=(130,50), end=(150,50)
        //   Rel from (100,0): c(20,0)(30,50)(50,50)
        // So overall path: m 0 0 c 20 0 30 50 50 50 m 100 0 c 20 0 30 50 50 50
        expect(result).toBe('m 0 0 c 20 0 30 50 50 50 m 100 0 c 20 0 30 50 50 50');
      });

      it('multiple spline types in sequence', () => {
        const result = compilePath(`
          cubicSpline([
            { x: 0, y: 0, angle: 0, exit: 20 },
            { x: 50, y: 0, angle: 0, entry: 20 }
          ]);
          quadSpline(
            { x: 60, y: 0, angle: 0, exit: 20 },
            [],
            { x: 100, y: 0 }
          );
        `);
        // cubicSpline: m 0 0 c 20 0 30 0 50 0
        // quadSpline:  m 60 0 q 20 0 40 0  (cp abs=80, end abs=100; rel from 60: 20, 40)
        expect(result).toBe('m 0 0 c 20 0 30 0 50 0 m 60 0 q 20 0 40 0');
      });
    });
  });

  describe('PolarVector', () => {
    describe('constructor', () => {
      it('creates a PolarVector with angle and distance', () => {
        const result = compilePath(`
          let pv = PolarVector(0.5, 20);
          log(pv.angle);
          log(pv.distance);
          M 0 0
        `);
        expect(result).toBe('M 0 0');
      });

      it('displays correctly in log()', () => {
        const result = compile('let pv = PolarVector(0.5, 20); log(pv);');
        expect(result.logs[0].parts[0].value).toBe('PolarVector(0.5, 20)');
      });

      it('rejects wrong number of arguments', () => {
        expect(() => compilePath('let pv = PolarVector(1);')).toThrow(/expects 2 arguments/);
        expect(() => compilePath('let pv = PolarVector(1, 2, 3);')).toThrow(/expects 2 arguments/);
      });

      it('rejects non-numeric arguments', () => {
        expect(() => compilePath('let pv = PolarVector("a", 1);')).toThrow(/angle must be a number/);
        expect(() => compilePath('let pv = PolarVector(1, "b");')).toThrow(/distance must be a number/);
      });
    });

    describe('property access', () => {
      it('.angle returns the angle', () => {
        const result = compilePath(`
          let pv = PolarVector(1.5, 20);
          M pv.angle 0
        `);
        expect(result).toBe('M 1.5 0');
      });

      it('.distance returns the distance', () => {
        const result = compilePath(`
          let pv = PolarVector(0, 42);
          M 0 pv.distance
        `);
        expect(result).toBe('M 0 42');
      });

      it('rejects unknown properties', () => {
        expect(() => compilePath('let pv = PolarVector(0, 1); M pv.foo 0')).toThrow(/does not exist/);
      });
    });

    describe('.turn()', () => {
      it('rotates angle by delta, preserving distance', () => {
        const result = compilePath(`
          let pv = PolarVector(1, 20);
          let turned = pv.turn(0.5);
          M turned.angle turned.distance
        `);
        expect(result).toBe('M 1.5 20');
      });

      it('supports negative delta', () => {
        const result = compilePath(`
          let pv = PolarVector(1, 10);
          let turned = pv.turn(-0.5);
          M turned.angle turned.distance
        `);
        expect(result).toBe('M 0.5 10');
      });
    });

    describe('.scale()', () => {
      it('multiplies distance by factor, preserving angle', () => {
        const result = compilePath(`
          let pv = PolarVector(2, 10);
          let scaled = pv.scale(3);
          M scaled.angle scaled.distance
        `);
        expect(result).toBe('M 2 30');
      });

      it('supports fractional factor', () => {
        const result = compilePath(`
          let pv = PolarVector(1, 20);
          let scaled = pv.scale(0.5);
          M scaled.angle scaled.distance
        `);
        expect(result).toBe('M 1 10');
      });

      it('rejects negative factor', () => {
        expect(() => compilePath('let pv = PolarVector(0, 10); pv.scale(-1);')).toThrow(/non-negative.*mirror/);
      });
    });

    describe('.mirror()', () => {
      it('adds PI to the angle, preserving distance', () => {
        const result = compilePath(`
          let pv = PolarVector(0, 20);
          let mirrored = pv.mirror();
          M mirrored.distance 0
        `);
        // distance unchanged
        expect(result).toBe('M 20 0');
      });

      it('angle is offset by PI', () => {
        // angle=0.5, mirror → 0.5 + PI ≈ 3.641592653589793
        const result = compilePath(`
          let pv = PolarVector(0.5, 10);
          let m = pv.mirror();
          let val = calc(round(m.angle * 1000) / 1000);
          M val 0
        `);
        const expected = Math.round((0.5 + Math.PI) * 1000) / 1000;
        expect(result).toBe(`M ${expected} 0`);
      });
    });

    describe('method chaining', () => {
      it('turn then scale', () => {
        const result = compilePath(`
          let pv = PolarVector(0, 10);
          let r = pv.turn(1).scale(2);
          M r.angle r.distance
        `);
        expect(result).toBe('M 1 20');
      });

      it('mirror then turn', () => {
        const result = compilePath(`
          let pv = PolarVector(0, 15);
          let r = pv.mirror().turn(0.5);
          M r.distance 0
        `);
        // distance preserved through mirror and turn
        expect(result).toBe('M 15 0');
      });
    });
  });

  describe('polarCubicBezier', () => {
    it('horizontal control points at angle 0', () => {
      // start=(0,100), pv1=PolarVector(0, 30), pv2=PolarVector(PI, 30), end=(100,100)
      // CP1 = (0+30*cos(0), 100+30*sin(0)) = (30, 100)
      // CP2 = (100+30*cos(PI), 100+30*sin(PI)) = (70, 100)
      // Relative: m 0 100 c 30 0 70 0 100 0
      const result = compilePath(`
        polarCubicBezier(
          Point(0, 100),
          PolarVector(0, 30),
          PolarVector(PI(), 30),
          Point(100, 100)
        );
      `);
      expect(result).toBe('m 0 100 c 30 0 70 0 100 0');
    });

    it('vertical control points at angle PI/2', () => {
      // start=(50,0), pv1=PolarVector(PI/2, 40), pv2=PolarVector(-PI/2, 40), end=(50,100)
      // CP1 = (50+40*cos(PI/2), 0+40*sin(PI/2)) = (50, 40)
      // CP2 = (50+40*cos(-PI/2), 100+40*sin(-PI/2)) = (50, 60)
      // Relative c: CP1-start=(0,40), CP2-start=(0,60), end-start=(0,100)
      const result = compilePath(`
        polarCubicBezier(
          Point(50, 0),
          PolarVector(calc(PI() / 2), 40),
          PolarVector(calc(-1 * PI() / 2), 40),
          Point(50, 100)
        );
      `);
      expect(result).toBe('m 50 0 c 0 40 0 60 0 100');
    });

    it('works with PolarVector.mirror() for symmetric curve', () => {
      // handle = PolarVector(0, 25), mirror → PolarVector(PI, 25)
      // start=(0,0), end=(100,0)
      // CP1 = (0+25,0) = (25,0), CP2 = (100+25*cos(PI), 0) = (75,0)
      // Relative: m 0 0 c 25 0 75 0 100 0
      const result = compilePath(`
        let handle = PolarVector(0, 25);
        polarCubicBezier(Point(0, 0), handle, handle.mirror(), Point(100, 0));
      `);
      expectSVGPathCommandSequence(result, [
        ['m', 0, 0],
        ['c', 25, 0, 75, 0, 100, 0],
      ], { precision: 10 });
    });

    it('works with PolarVector.scale()', () => {
      // handle = PolarVector(0, 20), scale(1.5) → PolarVector(0, 30)
      // start=(0,0), end=(100,0)
      // CP1 = (30,0), CP2 = (100+20*cos(PI), 0) = (80,0)
      // Relative: m 0 0 c 30 0 80 0 100 0
      const result = compilePath(`
        let h = PolarVector(0, 20);
        polarCubicBezier(Point(0, 0), h.scale(1.5), h.mirror(), Point(100, 0));
      `);
      expectSVGPathCommandSequence(result, [
        ['m', 0, 0],
        ['c', 30, 0, 80, 0, 100, 0],
      ], { precision: 10 });
    });

    it('works with PolarVector.turn()', () => {
      // pv = PolarVector(0, 40).turn(PI/2) → PolarVector(PI/2, 40)
      // start=(0,0), end=(100,0)
      // CP1 = (0+40*cos(PI/2), 0+40*sin(PI/2)) = (0, 40)
      // CP2 = (100+40*cos(PI/2), 0+40*sin(PI/2)) = (100, 40)
      // Relative c: (0,40), (100,40), (100,0)
      const result = compilePath(`
        let pv = PolarVector(0, 40).turn(calc(PI() / 2));
        polarCubicBezier(Point(0, 0), pv, pv, Point(100, 0));
      `);
      expectSVGPathCommandSequence(result, [
        ['m', 0, 0],
        ['c', 0, 40, 100, 40, 100, 0],
      ], { precision: 10 });
    });

    it('rejects wrong number of arguments', () => {
      expect(() => compilePath('polarCubicBezier(Point(0,0), PolarVector(0,1), PolarVector(0,1));')).toThrow(/expects 4 arguments/);
    });

    it('rejects non-Point start', () => {
      expect(() => compilePath('polarCubicBezier(5, PolarVector(0,1), PolarVector(0,1), Point(1,1));')).toThrow(/must be a Point/);
    });

    it('rejects non-PolarVector control handles', () => {
      expect(() => compilePath('polarCubicBezier(Point(0,0), 5, PolarVector(0,1), Point(1,1));')).toThrow(/must be a PolarVector/);
    });

    it('rejects non-Point end', () => {
      expect(() => compilePath('polarCubicBezier(Point(0,0), PolarVector(0,1), PolarVector(0,1), 5);')).toThrow(/must be a Point/);
    });
  });

  describe('grid functions', () => {
    describe('squareGrid', () => {
      it('shape pattern generates correct grid lines for a 2x2 grid', () => {
        const result = compilePath("squareGrid('shape', 0, 0, 40, 40, 20);");
        // 2 cols, 2 rows => 3 horizontal + 3 vertical = 6 M commands and 6 line commands
        expect(result).toHaveSVGCommandCount('M', 6);
      });

      it('dot pattern places circles at all vertices', () => {
        // 2x2 grid = 3x3 = 9 vertices, each circle uses 2 A commands
        const result = compilePath("squareGrid('dot', 0, 0, 40, 40, 20);");
        expect(result).toHaveSVGCommandCount('A', 18);
      });

      it('intersection pattern places cross marks at vertices', () => {
        // 3x3 = 9 vertices, each cross = 2 M + 2 L commands
        const result = compilePath("squareGrid('intersection', 0, 0, 40, 40, 20);");
        expect(result).toHaveSVGCommandCount('M', 18);
        expect(result).toHaveSVGCommandCount('L', 18);
      });

      it('partial pattern places segments on all edges', () => {
        // 2 cols, 2 rows: horizontal edges = 2*3 = 6, vertical edges = 2*3 = 6, total 12
        const result = compilePath("squareGrid('partial', 0, 0, 40, 40, 20);");
        expect(result).toHaveSVGCommandCount('M', 12);
        expect(result).toHaveSVGCommandCount('L', 12);
      });

      it('handles non-divisible dimensions (extra space ignored)', () => {
        // width=50, cellSize=20 => 2 cols; height=50 => 2 rows. Same as 40x40
        const result = compilePath("squareGrid('shape', 0, 0, 50, 50, 20);");
        expect(result).toHaveSVGCommandCount('M', 6);
      });

      it('returns empty path when cellSize exceeds dimensions', () => {
        const result = compilePath("squareGrid('shape', 0, 0, 10, 10, 20);");
        expect(result).toBe('');
      });

      it('offsets grid by x and y', () => {
        const result = compilePath("squareGrid('shape', 100, 200, 20, 20, 20);");
        // 1x1 grid starting at (100, 200)
        expect(result).toContain('100');
        expect(result).toContain('200');
      });

      it('accepts GridPatternType enum values', () => {
        const result = compilePath("squareGrid(GridPatternType.Shape, 0, 0, 40, 40, 20);");
        expect(result).toHaveSVGCommandCount('M', 6);
      });

      it('throws on invalid pattern type', () => {
        expect(() => compilePath("squareGrid('invalid', 0, 0, 40, 40, 20);")).toThrow(/type must be/);
      });

      it('throws on cellSize <= 0', () => {
        expect(() => compilePath("squareGrid('shape', 0, 0, 40, 40, 0);")).toThrow(/cellSize must be positive/);
      });

      it('throws on wrong argument count', () => {
        expect(() => compilePath("squareGrid('shape', 0, 0, 40);")).toThrow(/expects 6 arguments/);
      });
    });

    describe('triangleGrid', () => {
      it('shape pattern generates triangle edges', () => {
        const result = compilePath("triangleGrid('shape', 0, 0, 60, 60, 20);");
        // Should produce M and L commands for triangle edges
        const parsed = parseSVGPath(result);
        const mCount = parsed.filter(c => c.command === 'M').length;
        const lCount = parsed.filter(c => c.command === 'L').length;
        expect(mCount).toBeGreaterThan(0);
        expect(lCount).toBeGreaterThan(0);
      });

      it('dot pattern places circles at triangle vertices', () => {
        const result = compilePath("triangleGrid('dot', 0, 0, 60, 60, 20);");
        const parsed = parseSVGPath(result);
        const arcCount = parsed.filter(c => c.command === 'A').length;
        expect(arcCount).toBeGreaterThan(0);
        expect(arcCount % 2).toBe(0); // Arcs come in pairs (full circles)
      });

      it('intersection pattern uses 3-arm edge-aligned marks', () => {
        const result = compilePath("triangleGrid('intersection', 0, 0, 60, 60, 20);");
        const parsed = parseSVGPath(result);
        const mCount = parsed.filter(c => c.command === 'M').length;
        const lCount = parsed.filter(c => c.command === 'L').length;
        expect(mCount).toBeGreaterThan(0);
        // 3 arms per vertex = 3 M + 3 L per vertex
        expect(lCount).toBe(mCount);
      });

      it('partial pattern places segments on triangle edges', () => {
        const result = compilePath("triangleGrid('partial', 0, 0, 60, 60, 20);");
        const parsed = parseSVGPath(result);
        const mCount = parsed.filter(c => c.command === 'M').length;
        expect(mCount).toBeGreaterThan(0);
      });

      it('returns empty path when cellSize exceeds dimensions', () => {
        const result = compilePath("triangleGrid('shape', 0, 0, 5, 5, 20);");
        expect(result).toBe('');
      });

      it('accepts GridPatternType enum values', () => {
        const result = compilePath("triangleGrid(GridPatternType.Shape, 0, 0, 60, 60, 20);");
        const parsed = parseSVGPath(result);
        expect(parsed.filter(c => c.command === 'M').length).toBeGreaterThan(0);
      });

      it('throws on invalid pattern type', () => {
        expect(() => compilePath("triangleGrid('bad', 0, 0, 60, 60, 20);")).toThrow(/type must be/);
      });

      it('throws on cellSize <= 0', () => {
        expect(() => compilePath("triangleGrid('shape', 0, 0, 60, 60, -5);")).toThrow(/cellSize must be positive/);
      });
    });

    describe('hexagonGrid', () => {
      it('shape flat-top generates hex outlines with no duplicate edges', () => {
        const result = compilePath("hexagonGrid('shape', 0, 0, 100, 100, 20);");
        const parsed = parseSVGPath(result);
        const mCount = parsed.filter(c => c.command === 'M').length;
        const lCount = parsed.filter(c => c.command === 'L').length;
        expect(mCount).toBeGreaterThan(0);
        expect(lCount).toBe(mCount); // Each edge is M + L
      });

      it('shape pointy-top generates correct geometry', () => {
        const result = compilePath("hexagonGrid('shape', 0, 0, 100, 100, 20, 'vertex');");
        const parsed = parseSVGPath(result);
        const mCount = parsed.filter(c => c.command === 'M').length;
        expect(mCount).toBeGreaterThan(0);
      });

      it('dot pattern places circles at hex vertices', () => {
        const result = compilePath("hexagonGrid('dot', 0, 0, 100, 100, 20);");
        const parsed = parseSVGPath(result);
        const arcCount = parsed.filter(c => c.command === 'A').length;
        expect(arcCount).toBeGreaterThan(0);
        expect(arcCount % 2).toBe(0);
      });

      it('intersection pattern uses edge-aligned 3-arm marks', () => {
        const result = compilePath("hexagonGrid('intersection', 0, 0, 100, 100, 20);");
        const parsed = parseSVGPath(result);
        const mCount = parsed.filter(c => c.command === 'M').length;
        const lCount = parsed.filter(c => c.command === 'L').length;
        expect(mCount).toBeGreaterThan(0);
        expect(lCount).toBe(mCount);
      });

      it('partial pattern places segments on hex edges', () => {
        const result = compilePath("hexagonGrid('partial', 0, 0, 100, 100, 20);");
        const parsed = parseSVGPath(result);
        expect(parsed.filter(c => c.command === 'M').length).toBeGreaterThan(0);
      });

      it('defaults to flat-top (edge) orientation when 6 args given', () => {
        const withDefault = compilePath("hexagonGrid('shape', 0, 0, 100, 100, 20);");
        const explicit = compilePath("hexagonGrid('shape', 0, 0, 100, 100, 20, 'edge');");
        expect(withDefault).toBe(explicit);
      });

      it('accepts HexagonOrientation enum values', () => {
        const result = compilePath("hexagonGrid(GridPatternType.Shape, 0, 0, 100, 100, 20, HexagonOrientation.Edge);");
        const parsed = parseSVGPath(result);
        expect(parsed.filter(c => c.command === 'M').length).toBeGreaterThan(0);
      });

      it('throws on invalid orientation', () => {
        expect(() => compilePath("hexagonGrid('shape', 0, 0, 100, 100, 20, 'diagonal');")).toThrow(/orientation must be/);
      });

      it('throws on cellSize <= 0', () => {
        expect(() => compilePath("hexagonGrid('shape', 0, 0, 100, 100, 0);")).toThrow(/cellSize must be positive/);
      });

      it('returns empty path when cellSize exceeds dimensions', () => {
        const result = compilePath("hexagonGrid('shape', 0, 0, 5, 5, 20);");
        expect(result).toBe('');
      });
    });
  });

  describe('Grid constructor', () => {
    describe('construction', () => {
      it('creates a grid with default cell value null', () => {
        const result = compile('let g = Grid(2, 3, {}); log(g.get(0, 0)); log(g.get(1, 2));');
        expect(result.logs[0].parts[0].value).toBe('null');
        expect(result.logs[1].parts[0].value).toBe('null');
      });

      it('honors options.defaultValue for initial cell value', () => {
        const result = compile('let g = Grid(2, 2, { defaultValue: 7 }); log(g.get(0, 0)); log(g.get(1, 1));');
        expect(result.logs[0].parts[0].value).toBe('7');
        expect(result.logs[1].parts[0].value).toBe('7');
      });

      it('populates cells via trailing block fill()', () => {
        const result = compile(`
          let g = Grid(2, 3, {}) {|grid|
            grid.fill {|row, col, center| return calc(row * 10 + col); };
          };
          log(g.get(0, 0)); log(g.get(0, 2)); log(g.get(1, 1));
        `);
        expect(result.logs[0].parts[0].value).toBe('0');
        expect(result.logs[1].parts[0].value).toBe('2');
        expect(result.logs[2].parts[0].value).toBe('11');
      });
    });

    describe('members', () => {
      it('exposes rows, cols, xDim, yDim, width, height', () => {
        const result = compile(`
          let g = Grid(3, 4, { xDim: 10, yDim: 20 });
          log(g.rows); log(g.cols); log(g.xDim); log(g.yDim); log(g.width); log(g.height);
        `);
        expect(result.logs[0].parts[0].value).toBe('3');
        expect(result.logs[1].parts[0].value).toBe('4');
        expect(result.logs[2].parts[0].value).toBe('10');
        expect(result.logs[3].parts[0].value).toBe('20');
        expect(result.logs[4].parts[0].value).toBe('40'); // cols * xDim
        expect(result.logs[5].parts[0].value).toBe('60'); // rows * yDim
      });
    });

    describe('cell access', () => {
      it('set() mutates and returns the grid', () => {
        const result = compile(`
          let g = Grid(2, 2, {}) {|grid|
            grid.set(0, 0, 1).set(0, 1, 2).set(1, 0, 3).set(1, 1, 4);
          };
          log(g.get(0, 0)); log(g.get(0, 1)); log(g.get(1, 0)); log(g.get(1, 1));
        `);
        expect(result.logs[0].parts[0].value).toBe('1');
        expect(result.logs[1].parts[0].value).toBe('2');
        expect(result.logs[2].parts[0].value).toBe('3');
        expect(result.logs[3].parts[0].value).toBe('4');
      });

      it('getPoint returns cell center in canvas coords', () => {
        // 3x4 grid with xDim=10, yDim=10. Cell (0,0) center = (0.5*10, 0.5*10) = (5, 5).
        // Cell (2, 3) center = (3.5*10, 2.5*10) = (35, 25).
        const result = compile(`
          let g = Grid(3, 4, { xDim: 10, yDim: 10 });
          log(g.getPoint(0, 0).x); log(g.getPoint(0, 0).y);
          log(g.getPoint(2, 3).x); log(g.getPoint(2, 3).y);
        `);
        expect(result.logs[0].parts[0].value).toBe('5');
        expect(result.logs[1].parts[0].value).toBe('5');
        expect(result.logs[2].parts[0].value).toBe('35');
        expect(result.logs[3].parts[0].value).toBe('25');
      });

      it('getPoint accounts for non-zero origin', () => {
        const result = compile(`
          let g = Grid(2, 2, { xDim: 10, yDim: 10, origin: Point(100, 200) });
          log(g.getPoint(0, 0).x); log(g.getPoint(0, 0).y);
        `);
        expect(result.logs[0].parts[0].value).toBe('105');
        expect(result.logs[1].parts[0].value).toBe('205');
      });

      it('getRow and getCol return array slices', () => {
        const result = compile(`
          let g = Grid(2, 3, {}) {|grid|
            grid.fill {|row, col, center| return calc(row * 10 + col); };
          };
          let r = g.getRow(1);
          log(r.length); log(r[0]); log(r[2]);
          let c = g.getCol(2);
          log(c.length); log(c[0]); log(c[1]);
        `);
        expect(result.logs[0].parts[0].value).toBe('3');
        expect(result.logs[1].parts[0].value).toBe('10');
        expect(result.logs[2].parts[0].value).toBe('12');
        expect(result.logs[3].parts[0].value).toBe('2');
        expect(result.logs[4].parts[0].value).toBe('2');
        expect(result.logs[5].parts[0].value).toBe('12');
      });

      it('cells() returns flat row-major array', () => {
        const result = compile(`
          let g = Grid(2, 2, {}) {|grid|
            grid.fill {|row, col, center| return calc(row * 10 + col); };
          };
          let flat = g.cells();
          log(flat.length); log(flat[0]); log(flat[1]); log(flat[2]); log(flat[3]);
        `);
        expect(result.logs[0].parts[0].value).toBe('4');
        expect(result.logs[1].parts[0].value).toBe('0');
        expect(result.logs[2].parts[0].value).toBe('1');
        expect(result.logs[3].parts[0].value).toBe('10');
        expect(result.logs[4].parts[0].value).toBe('11');
      });
    });

    describe('iteration', () => {
      it('forEach visits every cell in row-major order', () => {
        const result = compile(`
          let g = Grid(2, 3, {}) {|grid|
            grid.fill {|row, col, center| return calc(row * 10 + col); };
          };
          let visits = [];
          g.forEach {|cell, row, col, center|
            visits.push(cell);
          };
          log(visits.length); log(visits[0]); log(visits[5]);
        `);
        expect(result.logs[0].parts[0].value).toBe('6');
        expect(result.logs[1].parts[0].value).toBe('0');
        expect(result.logs[2].parts[0].value).toBe('12');
      });

      it('map returns a new grid without mutating the original', () => {
        const result = compile(`
          let g = Grid(2, 2, {}) {|grid|
            grid.fill {|row, col, center| return calc(row * 10 + col); };
          };
          let doubled = g.map {|cell, row, col, center| return calc(cell * 2); };
          log(g.get(1, 1)); log(doubled.get(1, 1));
          log(g.rows); log(doubled.rows);
        `);
        expect(result.logs[0].parts[0].value).toBe('11');
        expect(result.logs[1].parts[0].value).toBe('22');
        expect(result.logs[2].parts[0].value).toBe('2');
        expect(result.logs[3].parts[0].value).toBe('2');
      });

      it('forEach inside layer.apply emits paths to the surrounding layer', () => {
        const result = compile(`
          define ViewBox(0, 0, 100, 100);
          define PathLayer('flow') \${ stroke: Color('#000'); }
          let g = Grid(2, 2, { xDim: 50, yDim: 50 });
          layer('flow').apply {
            g.forEach {|cell, row, col, center|
              M center.x center.y l 10 0
            };
          }
        `);
        const flowLayer = result.layers.find((l) => l.name === 'flow');
        // 2x2 grid with xDim=50, yDim=50 → centers at (25,25), (75,25), (25,75), (75,75)
        expect(flowLayer?.data).toContain('M 25 25');
        expect(flowLayer?.data).toContain('M 75 25');
        expect(flowLayer?.data).toContain('M 25 75');
        expect(flowLayer?.data).toContain('M 75 75');
      });
    });

    describe('sampling', () => {
      it('sampleNearest at a cell center returns that cell', () => {
        const result = compile(`
          let g = Grid(2, 2, { xDim: 10, yDim: 10 }) {|grid|
            grid.fill {|row, col, center| return calc(row * 10 + col); };
          };
          log(g.sampleNearest(5, 5));    // cell (0, 0) center → 0
          log(g.sampleNearest(15, 15));  // cell (1, 1) center → 11
        `);
        expect(result.logs[0].parts[0].value).toBe('0');
        expect(result.logs[1].parts[0].value).toBe('11');
      });

      it('sampleBilinear at a cell center matches the stored value', () => {
        const result = compile(`
          let g = Grid(2, 2, { xDim: 10, yDim: 10 }) {|grid|
            grid.set(0, 0, 0); grid.set(0, 1, 10); grid.set(1, 0, 100); grid.set(1, 1, 1000);
          };
          log(g.sampleBilinear(5, 5));    // cell (0, 0) center → 0
          log(g.sampleBilinear(15, 15));  // cell (1, 1) center → 1000
        `);
        expect(result.logs[0].parts[0].value).toBe('0');
        expect(result.logs[1].parts[0].value).toBe('1000');
      });

      it('sampleBilinear at a midpoint averages adjacent cells', () => {
        const result = compile(`
          let g = Grid(2, 2, { xDim: 10, yDim: 10 }) {|grid|
            grid.set(0, 0, 0); grid.set(0, 1, 100); grid.set(1, 0, 0); grid.set(1, 1, 100);
          };
          // (10, 5): horizontally midway between (0,0) center and (0,1) center → 50
          log(g.sampleBilinear(10, 5));
          // (10, 10): center of all four cells → 50
          log(g.sampleBilinear(10, 10));
        `);
        expect(result.logs[0].parts[0].value).toBe('50');
        expect(result.logs[1].parts[0].value).toBe('50');
      });

      it('outOfBounds: clamp returns edge cell for out-of-range coords', () => {
        const result = compile(`
          let g = Grid(2, 2, { xDim: 10, yDim: 10, outOfBounds: 'clamp' }) {|grid|
            grid.set(0, 0, 1); grid.set(0, 1, 2); grid.set(1, 0, 3); grid.set(1, 1, 4);
          };
          log(g.sampleNearest(-100, -100));  // clamped to (0, 0) → 1
          log(g.sampleNearest(1000, 1000));  // clamped to (1, 1) → 4
        `);
        expect(result.logs[0].parts[0].value).toBe('1');
        expect(result.logs[1].parts[0].value).toBe('4');
      });

      it('outOfBounds: null returns null for out-of-range coords', () => {
        const result = compile(`
          let g = Grid(2, 2, { xDim: 10, yDim: 10, outOfBounds: 'null' }) {|grid|
            grid.set(0, 0, 1);
          };
          log(g.sampleNearest(-100, -100));
        `);
        expect(result.logs[0].parts[0].value).toBe('null');
      });

      it('outOfBounds: wrap wraps coordinates around', () => {
        const result = compile(`
          let g = Grid(2, 2, { xDim: 10, yDim: 10, outOfBounds: 'wrap' }) {|grid|
            grid.set(0, 0, 1); grid.set(0, 1, 2); grid.set(1, 0, 3); grid.set(1, 1, 4);
          };
          // x=25 → cell col 2 → wraps to col 0; y=5 → row 0. Value = 1.
          log(g.sampleNearest(25, 5));
        `);
        expect(result.logs[0].parts[0].value).toBe('1');
      });

      it('sample dispatches to bilinear when interpolation option is set', () => {
        const result = compile(`
          let g = Grid(2, 2, { xDim: 10, yDim: 10, interpolation: 'bilinear' }) {|grid|
            grid.set(0, 0, 0); grid.set(0, 1, 100); grid.set(1, 0, 0); grid.set(1, 1, 100);
          };
          log(g.sample(10, 5));  // midpoint between cols → 50 (bilinear)
        `);
        expect(result.logs[0].parts[0].value).toBe('50');
      });

      it('sampleBilinear interpolates Points component-wise (for flow-field vectors)', () => {
        const result = compile(`
          let g = Grid(2, 2, { xDim: 10, yDim: 10 }) {|grid|
            grid.set(0, 0, Point(1, 0));
            grid.set(0, 1, Point(0, 1));
            grid.set(1, 0, Point(0, 1));
            grid.set(1, 1, Point(-1, 0));
          };
          // (10, 10) = center of all four → average is Point(0, 0.5)
          let p = g.sampleBilinear(10, 10);
          log(p.x); log(p.y);
        `);
        expect(result.logs[0].parts[0].value).toBe('0');
        expect(result.logs[1].parts[0].value).toBe('0.5');
      });
    });

    // Guards for the per-cell return fast path (evaluateGridCellBody): a
    // top-level `return` is short-circuited without throwing for speed, while
    // nested returns (inside if/for) still throw ReturnSignal. These verify the
    // two paths produce identical semantics.
    describe('cell-body return handling', () => {
      it('fill: top-level return stores the value in the cell', () => {
        const result = compile(`
          let g = Grid(1, 2, {}) {|grid|
            grid.fill {|row, col, center| return calc(col + 5); };
          };
          log(g.get(0, 0)); log(g.get(0, 1));
        `);
        expect(result.logs[0].parts[0].value).toBe('5');
        expect(result.logs[1].parts[0].value).toBe('6');
      });

      it('fill: a body with no return leaves the cell null', () => {
        const result = compile(`
          let g = Grid(1, 2, {}) {|grid|
            grid.fill {|row, col, center| let x = calc(col * 2); };
          };
          log(g.get(0, 0)); log(g.get(0, 1));
        `);
        expect(result.logs[0].parts[0].value).toBe('null');
        expect(result.logs[1].parts[0].value).toBe('null');
      });

      it('fill: a nested return inside if/else is honored (ReturnSignal path)', () => {
        const result = compile(`
          let g = Grid(1, 2, {}) {|grid|
            grid.fill {|row, col, center|
              if (col == 0) { return 100; }
              return 200;
            };
          };
          log(g.get(0, 0)); log(g.get(0, 1));
        `);
        // col 0 returns from inside the if (nested → ReturnSignal);
        // col 1 falls through to the top-level return (fast path).
        expect(result.logs[0].parts[0].value).toBe('100');
        expect(result.logs[1].parts[0].value).toBe('200');
      });

      it('map: a nested return inside if/else is honored', () => {
        const result = compile(`
          let g = Grid(1, 2, {}) {|grid| grid.fill {|row, col, center| return col; }; };
          let m = g.map {|cell, row, col, center|
            if (cell == 0) { return 7; }
            return 8;
          };
          log(m.get(0, 0)); log(m.get(0, 1));
        `);
        expect(result.logs[0].parts[0].value).toBe('7');
        expect(result.logs[1].parts[0].value).toBe('8');
      });

      it('forEach: a top-level return ends the cell body but iteration continues', () => {
        const result = compile(`
          let g = Grid(1, 2, {});
          let visits = [];
          g.forEach {|cell, row, col, center|
            visits.push(col);
            return 0;
            visits.push(999);
          };
          log(visits.length); log(visits[0]); log(visits[1]);
        `);
        // Both cells visited (push(col)); the unreachable push(999) never runs.
        expect(result.logs[0].parts[0].value).toBe('2');
        expect(result.logs[1].parts[0].value).toBe('0');
        expect(result.logs[2].parts[0].value).toBe('1');
      });
    });
  });
});

describe('nested expression parsing (parse-depth regression)', () => {
  // A boolean recursion guard in parseExpression silently dropped expressions
  // parsed while another parse was in flight — an `if` condition inside a
  // path block inside a `return` statement defaulted to `true`.
  it('respects a false condition inside a path block returned from a function', () => {
    const result = compile('fn tab(withNotch) {\n  return @{\n    h 30\n    if (withNotch) {\n      v 99\n    }\n    h 40\n  };\n}\nlet a = tab(false);\na.drawTo(0, 0);');
    expect(result.layers[0].data).toBe('M 0 0 h 30 h 40');
  });

  it('respects a true condition inside a path block returned from a function', () => {
    const result = compile('fn tab(withNotch) {\n  return @{\n    h 30\n    if (withNotch) {\n      v 99\n    }\n    h 40\n  };\n}\nlet a = tab(true);\na.drawTo(0, 0);');
    expect(result.layers[0].data).toBe('M 0 0 h 30 v 99 h 40');
  });
});

describe('first-class Angle values', () => {
  const logOf = (src: string): string => compile(src).logs[0].parts[0].value;

  describe('numeric coercion', () => {
    it('an Angle variable reads as radians in a path argument', () => {
      // 90deg / 2 = π/4 ≈ 0.7853981633974483
      const d = compilePath('let d = calc(90deg / 2);\nM d 0');
      const [cmd] = parseSVGPath(d);
      expect(cmd.command).toBe('M');
      expect(cmd.args[0]).toBeCloseTo(Math.PI / 4, 10);
    });

    it('an Angle works in comparisons and as a ternary condition', () => {
      expect(logOf('let a = 90deg; log(a > 1 ? "big" : "small");')).toBe('big');
      expect(logOf('let a = 90deg; log(a ? "truthy" : "falsy");')).toBe('truthy');
      expect(logOf('let a = 0deg; log(a ? "truthy" : "falsy");')).toBe('falsy');
    });

    it('an Angle works as a loop bound (radians value)', () => {
      const result = compile('let n = 3rad;\nfor (i in 0..n) { log(i); }');
      expect(result.logs).toHaveLength(4); // 0, 1, 2, 3
    });

    it('sin/cos receive radians from an Angle variable', () => {
      // (assigned to a variable first — log(sin(x)) takes the math-log fast path)
      expect(parseFloat(logOf('let a = 90deg; let s = calc(sin(a)); log(s);'))).toBeCloseTo(1, 10);
      expect(parseFloat(logOf('let a = 1pi; let c = calc(cos(a)); log(c);'))).toBeCloseTo(-1, 10);
    });
  });

  describe('arithmetic propagation', () => {
    const hueOf = (src: string): number => parseFloat(compile(src).logs[0].parts[0].value);

    it('Angle + Angle stays an angle through variables', () => {
      expect(
        hueOf('let c = Color(0.5, 0.15, 30); let a = 45deg; let b = calc(a + a); log(c.hueShift(b).hue);'),
      ).toBeCloseTo(120, 1);
    });

    it('unary minus preserves the angle', () => {
      expect(
        hueOf('let c = Color(0.5, 0.15, 30); let a = 90deg; log(c.hueShift(-a).hue);'),
      ).toBeCloseTo(300, 1);
    });

    it('Angle scaled by a plain number stays an angle', () => {
      expect(
        hueOf('let c = Color(0.5, 0.15, 30); let a = 45deg; log(c.hueShift(calc(a * 2)).hue);'),
      ).toBeCloseTo(120, 1);
      expect(
        hueOf('let c = Color(0.5, 0.15, 30); let a = 1pi; log(c.hueShift(calc(a / 2)).hue);'),
      ).toBeCloseTo(120, 1);
    });

    it('Angle / Angle is a plain ratio', () => {
      // ratio 0.5 * 180 = 90 read as degrees
      expect(
        hueOf('let c = Color(0.5, 0.15, 30); let a = 1pi; let b = 2pi; log(c.hueShift(calc(a / b * 180)).hue);'),
      ).toBeCloseTo(120, 1);
    });

    it('modulo drops angle-ness to a plain number', () => {
      // 3pi % 2pi = pi radians = 3.14159… — read as DEGREES by hueShift (plain number)
      expect(
        hueOf('let c = Color(0.5, 0.15, 30); let a = 3pi; log(c.hueShift(a % calc(2pi)).hue);'),
      ).toBeCloseTo(30 + Math.PI, 1);
    });
  });

  describe('members', () => {
    it('.deg, .rad, .pi, .turns', () => {
      const result = compile('let a = 90deg;\nlog(a.deg);\nlog(a.rad);\nlog(a.pi);\nlog(a.turns);');
      expect(parseFloat(result.logs[0].parts[0].value)).toBe(90);
      expect(parseFloat(result.logs[1].parts[0].value)).toBeCloseTo(Math.PI / 2, 12);
      expect(parseFloat(result.logs[2].parts[0].value)).toBe(0.5);
      expect(parseFloat(result.logs[3].parts[0].value)).toBeCloseTo(0.25, 12);
    });

    it('.pi is snapped clean for deg-written angles', () => {
      // 30deg → 30/180 must read exactly 0.16666666667-style snapped, not float noise
      expect(parseFloat(logOf('let a = 45deg; log(a.pi);'))).toBe(0.25);
      expect(parseFloat(logOf('let a = 0.5pi; log(a.pi);'))).toBe(0.5);
    });

    it('members work on a computed angle', () => {
      expect(parseFloat(logOf('let a = calc(2 * 45deg); log(a.deg);'))).toBe(90);
    });

    it('.toPi()/.toDeg()/.toRad()/.toTurns() re-tag the display unit only', () => {
      const result = compile(
        'let a = 90deg;\nlog(a.toPi());\nlog(a.toRad());\nlog(a.toTurns());\nlog(a.toPi().toDeg());\nlog(a.toPi() == 0.5pi);\nlog(a.toTurns().rad);',
      );
      expect(result.logs[0].parts[0].value).toBe('0.5pi');
      expect(result.logs[1].parts[0].value).toBe(`${Math.PI / 2}rad`);
      expect(result.logs[2].parts[0].value).toBe('0.25turns');
      expect(result.logs[3].parts[0].value).toBe('90deg'); // chains, round-trips exactly
      expect(result.logs[4].parts[0].value).toBe('true'); // same angle — equality unchanged
      expect(parseFloat(result.logs[5].parts[0].value)).toBeCloseTo(Math.PI / 2, 12); // members still work
    });

    it('re-tagged angles still convert in hueShift', () => {
      expect(
        parseFloat(compile('let c = Color(0.5, 0.15, 30); let a = 0.5pi; log(c.hueShift(a.toDeg()).hue);').logs[0].parts[0].value),
      ).toBeCloseTo(120, 1);
    });

    it('.toX() methods reject arguments', () => {
      expect(() => compile('let a = 90deg; let b = a.toPi(1);')).toThrow(/toPi\(\) expects 0 arguments/);
    });
  });

  describe('display', () => {
    it('template literal shows the written unit', () => {
      expect(logOf('let a = 90deg; log(`${a}`);')).toBe('90deg');
      expect(logOf('let a = 0.5pi; log(`${a}`);')).toBe('0.5pi');
      expect(logOf('let a = 1.5rad; log(`${a}`);')).toBe('1.5rad');
    });

    it('log() of an Angle shows the written unit', () => {
      expect(logOf('let a = 90deg; log(a);')).toBe('90deg');
    });

    it('.rad/.deg give bare numbers for text', () => {
      expect(logOf('let a = 90deg; log(`${a.deg}`);')).toBe('90');
    });
  });

  describe('style blocks', () => {
    it('rotate: 90deg emits transform="rotate(90)" (unchanged contract)', () => {
      const result = compile("define PathLayer('p') ${ rotate: 90deg; }\nlayer('p').apply { M 0 0 L 10 10 }");
      const p = result.layers.find((l) => l.name === 'p');
      expect(p?.transform).toBe('rotate(90)');
    });

    it('an Angle variable in a style value behaves like the inline literal', () => {
      const result = compile("let a = 90deg;\ndefine PathLayer('p') ${ rotate: a; }\nlayer('p').apply { M 0 0 L 10 10 }");
      const p = result.layers.find((l) => l.name === 'p');
      expect(p?.transform).toBe('rotate(90)');
    });
  });

  describe('arrays', () => {
    it('sort() orders Angles by radians', () => {
      const result = compile('let a = [1pi, 90deg, 0.1rad];\nlet s = a.sort();\nlog(`${s[0]} ${s[1]} ${s[2]}`);');
      expect(result.logs[0].parts[0].value).toBe('0.1rad 90deg 1pi');
    });
  });

  describe('strict non-angle slots', () => {
    it('Grid rejects an Angle where no angle makes sense', () => {
      expect(() => compile('let g = Grid(90deg, 4, 10);')).toThrow(/Grid\(\) rows/);
    });
  });

  describe('nested angles in structured stdlib arguments', () => {
    it('cubicSpline point angle: fields accept Angle values', () => {
      const viaAngle = compilePath('M 0 0 cubicSpline([{x: 50, y: 20, angle: 30deg}, {x: 100, y: 0, angle: -20deg}]);');
      const viaNumber = compilePath(
        `M 0 0 cubicSpline([{x: 50, y: 20, angle: ${(30 * Math.PI) / 180}}, {x: 100, y: 0, angle: ${(-20 * Math.PI) / 180}}]);`,
      );
      expect(viaAngle).toBe(viaNumber);
    });
  });
});

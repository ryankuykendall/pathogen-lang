/**
 * Path-emit guard — a path-emitting function must never write a non-number
 * into `d`.
 *
 * Contract (docs/syntax.md → Null): "Using `null` in arithmetic or as a path
 * argument throws a descriptive error." Raw path commands honoured that; stdlib
 * shape functions and context-aware functions did not — `circle(x, y, null)`
 * compiled cleanly to `a null null …`, and inside a `@{ }` block to
 * `a undefined undefined … NaN NaN`, which every browser then rejects with
 * "Expected number" (reported 2026-09-19: `mapSlice(2)`'s short last slice
 * destructured to a null inner radius — mapSlice has since become strict by
 * default, so that route now needs `{ partial: true }`; the guard is what
 * catches a null from ANY route).
 *
 * The matrix below is DERIVED from `pathFunctions` so a shape function added
 * later is covered without touching this file.
 */
import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { contextAwareFunctions } from '../src/stdlib';
import { pathFunctions } from '../src/stdlib/path';

/** A program prelude that produces a genuinely-null binding the way users hit it. */
const NULL_PRELUDE = 'let [present, missing] = [40];\n';

/** Fixed-arity path functions: every argument position can be probed mechanically. */
const FIXED_ARITY = Object.entries(pathFunctions)
  .filter(([, fn]) => (fn as (...a: unknown[]) => unknown).length > 0)
  .map(([name, fn]) => ({ name, arity: (fn as (...a: unknown[]) => unknown).length }));

function callWith(name: string, arity: number, nullIndex: number, nullExpr: string): string {
  const args = Array.from({ length: arity }, (_, i) => (i === nullIndex ? nullExpr : '10'));
  return `${name}(${args.join(', ')});`;
}

describe('path-emit guard', () => {
  it('derives a non-trivial matrix from pathFunctions', () => {
    // Guards the guard: if the export shape changes and the matrix goes empty,
    // every case below would vacuously pass.
    expect(FIXED_ARITY.length).toBeGreaterThanOrEqual(10);
    expect(FIXED_ARITY.map((f) => f.name)).toContain('circle');
  });

  describe('null argument → positioned error naming the function and argument', () => {
    for (const { name, arity } of FIXED_ARITY) {
      for (let i = 0; i < arity; i++) {
        it(`${name}() argument ${i + 1}`, () => {
          const src = `${NULL_PRELUDE}${callWith(name, arity, i, 'missing')}`;
          expect(() => compile(src)).toThrow(new RegExp(`${name}\\(\\).*argument ${i + 1}.*null`));
        });
      }
    }
  });

  describe('error quality', () => {
    it('names the variable that was null, and carries line and column', () => {
      const src = `${NULL_PRELUDE}circle(50, 50, missing);`;
      expect(() => compile(src)).toThrow(/Line 2, col \d+: circle\(\).*argument 3.*`missing`.*null/);
    });

    it('does not name a variable when the argument is an expression', () => {
      const src = 'let radii = [];\ncircle(50, 50, radii.first);';
      expect(() => compile(src)).toThrow(/Line 2, col \d+: circle\(\).*argument 3.*null/);
    });
  });

  describe('the reported program shape', () => {
    // The loop as the author wrote it. mapSlice is strict by default (same
    // day's follow-up), so the short slice that produced the null is gone and
    // the program is simply correct: three radii, two rings, nothing else.
    const ringsFrom = (slices: string) => `
let radii = [120, 80, 40];
for ([pair, index] in ${slices}) {
  let [outer, inner] = pair;
  let ring = @{
    circle(200, 200, inner);
  };
  ring.drawTo(0, 0);
}`;

    it('compiles unguarded: every window is full, so `inner` is never null', () => {
      const d = compile(ringsFrom('radii.mapSlice(2)')).layers[0].data;
      // circle(cx, cy, r) inside a block → `m {cx - r} {cy} a r r 0 1 1 {2r} 0 a r r 0 1 1 {-2r} 0`
      expect(d).toBe(
        'M 0 0 m 120 200 a 80 80 0 1 1 160 0 a 80 80 0 1 1 -160 0 ' +
          'M 0 0 m 160 200 a 40 40 0 1 1 80 0 a 40 40 0 1 1 -80 0',
      );
    });

    // The route that reached the guard still exists behind { partial: true }:
    // the short last window destructures `inner` to null, and the guard must
    // stop it rather than let `a undefined` through.
    it('with { partial: true } the short window still reaches the guard, not the path', () => {
      expect(() => compile(ringsFrom('radii.mapSlice(2, { partial: true })'))).toThrow(
        /circle\(\).*argument 3.*`inner`.*null/,
      );
    });
  });

  describe('context-aware functions', () => {
    it('derives a non-trivial set', () => {
      expect(contextAwareFunctions.size).toBeGreaterThanOrEqual(8);
    });

    // Every context-aware function is numeric geometry; null is never meaningful.
    // Two arguments covers the widest common prefix — enough to prove each name
    // reaches the guard, which is the contract under test.
    for (const name of contextAwareFunctions) {
      it(`${name}() rejects a null first argument`, () => {
        const src = `${NULL_PRELUDE}M 0 0 h 10 ${name}(missing, 10);`;
        expect(() => compile(src)).toThrow(new RegExp(`${name}\\(\\).*argument 1.*null`));
      });
    }

    it('polarLine() no longer coerces a null distance to 0', () => {
      const src = `${NULL_PRELUDE}M 0 0 polarLine(0deg, missing);`;
      expect(() => compile(src)).toThrow(/polarLine\(\).*argument 2.*`missing`.*null/);
    });

    // Found in code review: a MISSING argument is not in the argument list, so
    // the null check cannot see it, and `polarLine(0.5)` still wrote `L NaN NaN`.
    // These are cases of one switch — there is no arity to read — so the guard
    // inspects what was produced. The matrix asserts the contract itself rather
    // than a per-function expectation: with too few arguments a call either
    // stops the compile or puts nothing non-numeric in the path.
    describe('too few arguments never reach the path', () => {
      const NON_NUMERIC = /(?:^|[\s,])(-?NaN|-?Infinity|null|undefined)(?=$|[\s,])/;
      const allPathData = (src: string) =>
        compile(src)
          .layers.map((layer) => layer.data)
          .join(' ');

      // The call is a STATEMENT so that it emits. (`let got = polarLine(…)`
      // captures the segment as a value and emits nothing — a matrix built on
      // that form passes even with the leak wide open.) A heading and a pen
      // position are in place, so the only thing missing is the argument.
      const emitting = (call: string) => `M 0 0 h 10 heading(0deg); ${call}; L 20 20`;

      it('the template really emits — with valid arguments the segment is in the path', () => {
        expect(allPathData(emitting('polarLine(0deg, 10)'))).toBe('M 0 0 h 10 L 20 0 L 20 20');
      });

      for (const name of contextAwareFunctions) {
        for (const args of ['', '0.5']) {
          it(`${name}(${args})`, () => {
            const src = emitting(`${name}(${args})`);
            let data = '';
            try {
              data = allPathData(src);
            } catch {
              return; // stopped the compile — the contract holds
            }
            expect(data).not.toMatch(NON_NUMERIC);
          });
        }
      }

      it('names the function and how many arguments it received', () => {
        expect(() => compile('M 0 0 polarLine(0.5);')).toThrow(
          /Line 1, col \d+: polarLine\(\) produced a non-numeric coordinate \(NaN\).*it received 1 argument\)/,
        );
      });

      it('catches coordinates handed back to the program, not only emitted path text', () => {
        expect(() => compile('M 0 0 let tip = polarPoint(0.5); L tip.x tip.y')).toThrow(
          /polarPoint\(\) produced a non-numeric x \(NaN\).*it received 1 argument\)/,
        );
      });

      it('catches a poisoned heading — turn() emits nothing, so the path text is clean', () => {
        expect(() => compile('M 0 0 heading(0deg); turn(); tangentLine(10);')).toThrow(
          /turn\(\) left the heading as NaN.*it received 0 arguments\)/,
        );
      });
    });

    // The guard added a throw to this dispatch path; valid calls must not move.
    describe('valid calls are untouched', () => {
      it('polarLine', () => {
        expect(compile('M 0 0 polarLine(0deg, 10);').layers[0].data).toBe('M 0 0 L 10 0');
      });

      it('polarMove with its optional third argument', () => {
        expect(compile('M 0 0 polarMove(0deg, 10, 1);').layers[0].data).toBe('M 0 0 M 10 0');
      });

      it('polarPoint coordinates', () => {
        expect(compile('M 0 0 let tip = polarPoint(0deg, 25); L tip.x tip.y').layers[0].data).toBe('M 0 0 L 25 0');
      });

      it('heading, turn, tangentArc', () => {
        expect(compile('M 0 0 h 10 tangentArc(20, 90deg);').layers[0].data).toBe(
          'M 0 0 h 10 A 20 20 0 0 1 30 19.999999999999996',
        );
      });
    });
  });

  describe('angle arguments', () => {
    // An angle literal reaches a stdlib function as a wrapped AngleValue, which
    // is unwrapped to radians AFTER the guard looks at the arguments. The guard
    // must neither reject the wrapper nor let the unwrap change what is drawn.
    it('an AngleValue argument is not mistaken for a non-number', () => {
      const data = compile('radialWedge(10, 20, 45deg, 90deg, 5);').layers[0].data;
      expect(data).not.toMatch(/NaN|undefined|null|Infinity/);
      expect(data.length).toBeGreaterThan(0);
    });

    it('a degree literal and its radian value draw the same thing', () => {
      const viaDegrees = compile('M 0 0 polarLine(90deg, 10);').layers[0].data;
      const viaRadians = compile('M 0 0 polarLine(0.5pi, 10);').layers[0].data;
      expect(viaDegrees).toBe(viaRadians);
    });
  });

  describe('too few arguments', () => {
    // Found by this guard: tests/path-blocks.test.ts called `circle(10)` and
    // asserted only the drawTo prefix, so `M NaN undefined a undefined …` passed.
    it('reports arity instead of emitting NaN', () => {
      expect(() => compile('circle(10);')).toThrow(/Line 1, col \d+: circle\(\) expects 3 arguments, got 1/);
    });

    for (const { name, arity } of FIXED_ARITY.filter((f) => f.arity > 1)) {
      it(`${name}() with one argument short`, () => {
        const args = Array.from({ length: arity - 1 }, () => '10').join(', ');
        expect(() => compile(`${name}(${args});`)).toThrow(
          new RegExp(`${name}\\(\\) expects ${arity} arguments, got ${arity - 1}`),
        );
      });
    }
  });

  describe('non-finite numbers', () => {
    it('rejects a NaN argument instead of emitting `a NaN NaN`', () => {
      expect(() => compile('circle(50, 50, sqrt(-1));')).toThrow(/Line 1, col \d+: circle\(\).*argument 3.*NaN/);
    });

    it('rejects an infinite argument', () => {
      expect(() => compile('rect(0, 0, 1 / 0, 10);')).toThrow(/rect\(\).*argument 3/);
    });
  });

  describe('valid calls are untouched', () => {
    it('circle() output is byte-identical', () => {
      expect(compile('circle(50, 50, 20);').layers[0].data).toBe('M 30 50 a 20 20 0 1 1 40 0 a 20 20 0 1 1 -40 0');
    });

    it('zero and negative numbers are numbers, not errors', () => {
      expect(() => compile('rect(-10, 0, 0, 5);')).not.toThrow();
    });
  });
});

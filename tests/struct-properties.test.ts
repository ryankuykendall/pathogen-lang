import { describe, expect, it } from 'vitest';

import { compile, compileAnnotated } from '../src';
import { getStructDescriptor } from '../src/evaluator/struct-properties';

import type { Value } from '../src/evaluator/types';

/**
 * Drift guard: for every property the struct descriptor exposes, destructuring
 * and member access must produce identical results in BOTH evaluators. The
 * descriptor is the single source of truth — this test pins the equivalence
 * mechanically so new properties are covered automatically. Numeric properties
 * are additionally value-checked through the annotated evaluator by routing
 * them into path output.
 */

interface StructCase {
  name: string;
  /** Program prefix that binds the struct to `v`. */
  setup: string;
  /** Minimal value used only to look up the descriptor (get() is not invoked). */
  probe: Value;
  /** Keys whose values are numbers, verifiable via `M <key> 0` path output. */
  numericKeys: string[];
}

const MESH_SETUP = `let mg = MeshGradient('m', 100, 100, 2, 2) {|g|
  g.colorAll(oklch(0.7 0.1 250));
};
let v = mg.getPoint(1, 1);`;

const CASES: StructCase[] = [
  {
    name: 'Point',
    setup: 'let v = Point(1, 2);',
    probe: { type: 'PointValue', x: 1, y: 2 },
    numericKeys: ['x', 'y'],
  },
  {
    name: 'PolarVector',
    setup: 'let v = PolarVector(0.5, 100);',
    probe: { type: 'PolarVectorValue', angle: 0.5, distance: 100 } as Value,
    numericKeys: ['angle', 'distance'],
  },
  {
    name: 'Grid',
    setup: 'let v = Grid(4, 5, { xDim: 10, yDim: 10 });',
    probe: { type: 'GridValue' } as unknown as Value,
    numericKeys: ['rows', 'cols', 'xDim', 'yDim', 'width', 'height'],
  },
  {
    name: 'MeshPoint',
    setup: MESH_SETUP,
    probe: { type: 'MeshPointValue' } as unknown as Value,
    numericKeys: ['x', 'y'],
  },
  {
    name: 'Color',
    setup: 'let v = oklch(0.7 0.15 200);',
    probe: { type: 'ColorValue' } as unknown as Value,
    numericKeys: ['lightness', 'chroma', 'hue', 'a'],
  },
  {
    name: 'Angle',
    setup: 'let v = 90deg;',
    probe: { type: 'AngleValue', radians: Math.PI / 2, unit: 'deg' } as unknown as Value,
    numericKeys: ['deg', 'rad', 'pi', 'turns'],
  },
];

function outcome(source: string): { logs?: string[][]; error?: string } {
  try {
    const result = compile(source);
    return { logs: result.logs.map((l) => l.parts.map((p) => String(p.value))) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

describe('struct-properties drift guard', () => {
  for (const { name, setup, probe, numericKeys } of CASES) {
    describe(name, () => {
      const descriptor = getStructDescriptor(probe);
      const keys = descriptor?.keys(probe) ?? [];

      it('has a descriptor with keys', () => {
        expect(descriptor).not.toBeNull();
        expect(descriptor?.name).toBe(name);
        expect(keys.length).toBeGreaterThan(0);
        for (const k of numericKeys) expect(keys).toContain(k);
      });

      it('does not expose inherited object members', () => {
        expect(descriptor?.has(probe, 'toString')).toBe(false);
        expect(descriptor?.has(probe, 'constructor')).toBe(false);
        expect(descriptor?.has(probe, 'hasOwnProperty')).toBe(false);
      });

      for (const key of keys) {
        it(`'${key}' destructures identically to member access`, () => {
          const destructured = outcome(`${setup} let { ${key}: d } = v; log(d);`);
          const member = outcome(`${setup} log(v.${key});`);
          expect(destructured).toEqual(member);
          expect(destructured.error).toBeUndefined();
        });
      }

      for (const key of numericKeys) {
        it(`'${key}' has annotated-evaluator parity with member access`, () => {
          const viaDestructuring = compileAnnotated(`${setup}\nlet { ${key}: d } = v;\nM d 0`);
          const viaMember = compileAnnotated(`${setup}\nlet d = v.${key};\nM d 0`);
          expect(viaDestructuring).toContain('M ');
          // Both routes must emit the identical M command with the real value
          const mLine = (s: string) => s.split('\n').find((l) => l.trim().startsWith('M '));
          expect(mLine(viaDestructuring)).toBeDefined();
          expect(mLine(viaDestructuring)).toBe(mLine(viaMember));
        });
      }

      it('destructuring all properties works in the annotated evaluator', () => {
        const pattern = keys.map((k, i) => `${k}: d${i}`).join(', ');
        expect(() => compileAnnotated(`${setup}\nlet { ${pattern} } = v;`)).not.toThrow();
      });
    });
  }

  describe('inherited-member regression', () => {
    it('member access on toString throws instead of leaking Object.prototype', () => {
      expect(() => compile('let p = Point(1, 2); log(p.toString);')).toThrow(
        /Property 'toString' does not exist on Point/,
      );
    });

    it('destructuring toString throws instead of leaking Object.prototype', () => {
      expect(() => compile('let { toString } = Point(1, 2);')).toThrow(
        /Property 'toString' does not exist on Point/,
      );
    });
  });

  describe('ContextObject', () => {
    const probe = { type: 'ContextObject', value: { x: 5, y: 10 } } as Value;
    const descriptor = getStructDescriptor(probe);

    it('exposes dynamic keys, excluding internals', () => {
      expect(descriptor?.keys(probe).sort()).toEqual(['x', 'y']);
    });

    it('excludes _transformState from keys and has()', () => {
      const p = { type: 'ContextObject', value: { x: 1, _transformState: {} } } as Value;
      const d = getStructDescriptor(p);
      expect(d?.keys(p)).toEqual(['x']);
      expect(d?.has(p, '_transformState')).toBe(false);
    });

    for (const key of ['x', 'y']) {
      it(`ctx.position '${key}' destructures identically to member access`, () => {
        const destructured = outcome(`M 5 10 let { ${key}: d } = ctx.position; log(d);`);
        const member = outcome(`M 5 10 log(ctx.position.${key});`);
        expect(destructured).toEqual(member);
        expect(destructured.error).toBeUndefined();
      });
    }
  });

  describe('non-struct values', () => {
    it('returns null for numbers, strings, null, and plain objects', () => {
      expect(getStructDescriptor(5)).toBeNull();
      expect(getStructDescriptor('hi')).toBeNull();
      expect(getStructDescriptor(null)).toBeNull();
      expect(getStructDescriptor({ type: 'ObjectValue', properties: new Map() } as Value)).toBeNull();
    });
  });
});

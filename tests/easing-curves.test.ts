// The named easing family has one source of truth (src/stdlib/easing-curves.ts)
// that feeds three consumers: the `ease()` stdlib function, the `Easing` enum,
// and the playground's topo-gradient renderers (Canvas fallback + two WGSL
// shaders, whose `applyEasing` is generated from the same table). These tests
// pin the wire contract and the splice so none of the copies can drift.

import { describe, expect, it } from 'vitest';

import { EASING_WGSL_MARKER, withEasingWgsl } from '../playground/gpu/easing-wgsl';
import { TOPO_LAPLACE_RENDER_WGSL } from '../playground/gpu/topo-laplace-shader';
import { TOPO_FRAGMENT_WGSL } from '../playground/gpu/topo-shader';
import { BUILTIN_ENUMS } from '../src/evaluator/builtin-enums';
import { stdlib } from '../src/stdlib';
import {
  buildEasingWgsl,
  EASING_CURVES,
  EASING_ORDER,
  EASING_SPECS,
  easingModeIndex,
} from '../src/stdlib/easing-curves';

describe('easing curve table (single source for stdlib, enum and shaders)', () => {
  it('pins the legacy u32 wire values 0..4', () => {
    expect(EASING_ORDER.slice(0, 5)).toEqual(['linear', 'smoothstep', 'ease-in', 'ease-out', 'ease-in-out']);
  });

  it('is exactly the Easing enum, in enum order', () => {
    expect([...EASING_ORDER]).toEqual(Object.values(BUILTIN_ENUMS.Easing));
    expect(EASING_ORDER).toHaveLength(26);
  });

  it('derives the enum member names from the curve names', () => {
    expect(BUILTIN_ENUMS.Easing.EaseInOut).toBe('ease-in-out');
    expect(BUILTIN_ENUMS.Easing.SineInOut).toBe('sine-in-out');
    expect(BUILTIN_ENUMS.Easing.BounceOut).toBe('bounce-out');
    expect(BUILTIN_ENUMS.Easing.Smoothstep).toBe('smoothstep');
  });

  it('every curve has a JS body with endpoints at 0 and 1', () => {
    for (const name of EASING_ORDER) {
      const curve = EASING_CURVES[name];
      expect(typeof curve, name).toBe('function');
      expect(curve(0), `${name}(0)`).toBeCloseTo(0, 12);
      expect(curve(1), `${name}(1)`).toBeCloseTo(1, 12);
    }
  });

  it('stdlib.ease is the table', () => {
    const ease = stdlib.ease as (curve: string, t: number) => number;
    for (const name of EASING_ORDER) {
      for (const t of [0.15, 0.5, 0.85]) {
        expect(ease(name, t), `${name}(${t})`).toBe(EASING_CURVES[name](t));
      }
    }
  });

  it('easingModeIndex maps a name to its wire value and unknown names to -1', () => {
    expect(easingModeIndex('linear')).toBe(0);
    expect(easingModeIndex('ease-in-out')).toBe(4);
    expect(easingModeIndex('bounce-in-out')).toBe(EASING_ORDER.length - 1);
    expect(easingModeIndex('wobble')).toBe(-1);
  });

  it('generates a WGSL applyEasing with one case per wire value, input and output clamps', () => {
    const wgsl = buildEasingWgsl();
    expect(wgsl).toContain('fn applyEasing(t: f32, mode: u32) -> f32');
    expect(wgsl).toContain('fn easingCurve(u: f32, mode: u32) -> f32');
    expect(wgsl).toContain('fn bounceOut(x: f32) -> f32');
    for (let i = 0; i < EASING_ORDER.length; i++) {
      expect(wgsl, `case for ${EASING_ORDER[i]}`).toContain(`case ${i}u: {`);
      expect(wgsl, `comment for ${EASING_ORDER[i]}`).toContain(`// ${EASING_ORDER[i]}`);
    }
    expect(wgsl).toContain('clamp(t, 0.0, 1.0)');
    expect(wgsl).toContain('clamp(easingCurve(u, mode), 0.0, 1.0)');
    for (const spec of EASING_SPECS) expect(spec.wgsl, `${spec.name} wgsl returns`).toContain('return');
  });

  it('generates structurally sound WGSL: balanced braces, one return per case, unique labels, float literals', () => {
    // A real compile happens in scripts/debug-easing-family.ts (WebGPU); this
    // guards the generator's shape so a broken template cannot pass silently.
    const wgsl = buildEasingWgsl();
    let depth = 0;
    for (const ch of wgsl) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
    const labels = [...wgsl.matchAll(/case (\d+)u: \{/g)].map((m) => Number(m[1]));
    expect(labels).toEqual(EASING_ORDER.map((_, i) => i));
    const caseBodies = wgsl.split(/case \d+u: \{/).slice(1);
    for (const [i, body] of caseBodies.entries()) {
      const own = body.split(/\n    \}/)[0];
      expect(own, `case ${i} (${EASING_ORDER[i]}) returns on its last line`).toMatch(/return [^;]+;\s*$/);
    }
    // Every numeric literal inside the curve bodies is a float literal (has a
    // '.' or an exponent), so WGSL never sees an i32 where an f32 is needed.
    const bodyText = caseBodies.join('\n').replace(/case \d+u/g, '').replace(/\/\/[^\n]*/g, '');
    for (const literal of bodyText.match(/(?<![\w.])\d+(?:\.\d+)?(?:e[-+]?\d+)?(?![\w.])/g) ?? []) {
      expect(literal, `literal ${literal} must be a float`).toMatch(/\.|e/);
    }
  });

  it('EASING_CURVES has no prototype: Object.prototype names are not curves', () => {
    expect(EASING_CURVES['constructor']).toBeUndefined();
    expect(EASING_CURVES['toString']).toBeUndefined();
    expect(Object.getPrototypeOf(EASING_CURVES)).toBeNull();
  });

  it('both topo shaders carry the splice marker exactly once and splice cleanly', () => {
    for (const [label, src] of [
      ['distance', TOPO_FRAGMENT_WGSL],
      ['laplace', TOPO_LAPLACE_RENDER_WGSL],
    ] as const) {
      expect(src.split(EASING_WGSL_MARKER), `${label} marker count`).toHaveLength(2);
      expect(src, `${label} has no hand-written applyEasing`).not.toContain('fn applyEasing(');
      const spliced = withEasingWgsl(src, buildEasingWgsl());
      expect(spliced).not.toContain(EASING_WGSL_MARKER);
      expect(spliced).toContain('fn applyEasing(t: f32, mode: u32) -> f32');
      expect(spliced).toContain('applyEasing(');
    }
  });

  it('withEasingWgsl refuses a source without the marker', () => {
    expect(() => withEasingWgsl('fn main() {}', buildEasingWgsl())).toThrow(/marker/);
  });
});

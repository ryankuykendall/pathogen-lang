import { describe, expect, it } from 'vitest';

import {
  INNER_BLEND_STOPS,
  MIN_WEDGE_RESOLUTION,
  TWO_PI,
  conicParamForAngle,
  innerFillMode,
  smoothstep01,
  wedgeCountFor,
  wrapAngle,
} from '../src/conic-param';

// These pin the port of playground/gpu/conic-shader.ts `fs_main`: the same
// angle must map to the same stop parameter on every surface.

const quarter = { from: 0, to: Math.PI / 2, direction: 'cw' as const, spread: 'clamp' as const };

describe('wrapAngle', () => {
  it('folds any angle into [0, 2π)', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(-Math.PI / 2)).toBeCloseTo(1.5 * Math.PI, 12);
    expect(wrapAngle(TWO_PI)).toBeCloseTo(0, 12);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
  });
});

describe('conicParamForAngle — inside the sweep', () => {
  it('maps the sweep linearly onto t ∈ [0, 1]', () => {
    expect(conicParamForAngle(0, quarter)).toBeCloseTo(0, 12);
    expect(conicParamForAngle(Math.PI / 4, quarter)).toBeCloseTo(0.5, 12);
    expect(conicParamForAngle(Math.PI / 2, quarter)).toBeCloseTo(1, 12);
  });

  it('measures from a negative `from` the way the shader does (wrapped)', () => {
    const spec = { ...quarter, from: -Math.PI / 4, to: Math.PI / 4 };
    expect(conicParamForAngle(-Math.PI / 4, spec)).toBeCloseTo(0, 12);
    expect(conicParamForAngle(0, spec)).toBeCloseTo(0.5, 12);
    expect(conicParamForAngle(1.75 * Math.PI, spec)).toBeCloseTo(0, 12); // same direction as −π/4
  });

  it("reflects the angle for 'ccw', so the painted arc is the mirror image", () => {
    const ccw = { ...quarter, direction: 'ccw' as const, spread: 'transparent' as const };
    // Screen angle −π/8 (top-right) reflects to π/8 → inside the sweep.
    expect(conicParamForAngle(-Math.PI / 8, ccw)).toBeCloseTo(0.25, 12);
    // Screen angle +π/8 (bottom-right) reflects to 2π − π/8 → outside.
    expect(conicParamForAngle(Math.PI / 8, ccw)).toBeNull();
  });
});

describe('conicParamForAngle — outside the sweep', () => {
  const gap = Math.PI; // opposite the quarter sweep
  it("'transparent' paints nothing", () => {
    expect(conicParamForAngle(gap, { ...quarter, spread: 'transparent' })).toBeNull();
  });
  it("'clamp' takes the last stop for a positive sweep", () => {
    expect(conicParamForAngle(gap, { ...quarter, spread: 'clamp' })).toBe(1);
  });
  it("'repeat' tiles the stop list around the circle", () => {
    // π is 2 sweeps past `from`, so t = 2.0 → wraps to 0; 1.25π → 2.5 → 0.5
    expect(conicParamForAngle(gap, { ...quarter, spread: 'repeat' })).toBeCloseTo(0, 12);
    expect(conicParamForAngle(1.25 * Math.PI, { ...quarter, spread: 'repeat' })).toBeCloseTo(0.5, 12);
  });
  it('a full-turn sweep never leaves [0, 1]', () => {
    const full = { ...quarter, to: TWO_PI, spread: 'transparent' as const };
    for (let k = 0; k < 16; k++) {
      const t = conicParamForAngle((k / 16) * TWO_PI, full);
      expect(t).not.toBeNull();
      expect(t!).toBeGreaterThanOrEqual(0);
      expect(t!).toBeLessThan(1);
    }
  });
  it('a zero sweep paints nothing', () => {
    expect(conicParamForAngle(1, { ...quarter, to: 0 })).toBeNull();
  });
});

describe('innerFillMode', () => {
  it('numbers the modes like the shader uniform', () => {
    expect(innerFillMode(undefined)).toBe(0);
    expect(innerFillMode('transparent')).toBe(0);
    expect(innerFillMode('center')).toBe(1);
    expect(innerFillMode('#1a1a2e')).toBe(2);
    expect(innerFillMode('transparent-blend')).toBe(3);
  });
});

describe('inner blend curve', () => {
  it('smoothstep01 matches the WGSL definition at its anchor points', () => {
    expect(smoothstep01(0)).toBe(0);
    expect(smoothstep01(0.5)).toBe(0.5);
    expect(smoothstep01(1)).toBe(1);
    expect(smoothstep01(0.25)).toBeCloseTo(0.15625, 12);
    expect(smoothstep01(-1)).toBe(0);
    expect(smoothstep01(2)).toBe(1);
  });
  it('INNER_BLEND_STOPS carry the inner color weight 1 − smoothstep', () => {
    expect(INNER_BLEND_STOPS.map((s) => s.offset)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(INNER_BLEND_STOPS.map((s) => Number(s.innerWeight.toFixed(5)))).toEqual([1, 0.84375, 0.5, 0.15625, 0]);
  });
});

describe('wedgeCountFor', () => {
  it('rounds the slice count up and never returns zero', () => {
    const oneDegree = Math.PI / 180;
    expect(wedgeCountFor(Math.PI / 2, oneDegree)).toBe(90);
    expect(wedgeCountFor(TWO_PI, oneDegree)).toBe(360);
    expect(wedgeCountFor(-Math.PI / 2, oneDegree)).toBe(90);
    expect(wedgeCountFor(1e-6, oneDegree)).toBe(1);
  });

  it('clamps a zero, negative or non-finite resolution to the 0.01° floor instead of looping forever', () => {
    const cap = Math.ceil(TWO_PI / MIN_WEDGE_RESOLUTION);
    expect(wedgeCountFor(TWO_PI, 0)).toBe(cap);
    expect(wedgeCountFor(TWO_PI, -1)).toBe(cap);
    expect(wedgeCountFor(TWO_PI, Number.NaN)).toBe(cap);
    expect(cap).toBe(36000);
  });
});

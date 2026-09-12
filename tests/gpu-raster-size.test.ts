import { describe, expect, it } from 'vitest';

import { DEFAULT_GPU_MAX_DIM, MAX_CANVAS_2D_DIM, clampScale, rasterSize } from '../playground/gpu/raster-size';

// ISSUE-017: the former clampScale floored the reduced scale at 0.25, so any
// viewBox past 32768 units asked WebGPU for a texture over its own cap. These
// pin the replacement: the result never exceeds maxDim, on any input.

describe('clampScale', () => {
  it('keeps the requested scale while it fits', () => {
    expect(clampScale(200, 200, 2, 8192)).toBe(2);
    expect(clampScale(4096, 100, 2, 8192)).toBe(2);
  });

  it('reduces to exactly maxDim / longest edge, with no floor', () => {
    expect(clampScale(22200, 14800, 2, 8192)).toBeCloseTo(8192 / 22200, 12);
    const wide = clampScale(48000, 18600, 2, 8192);
    expect(wide).toBeCloseTo(8192 / 48000, 12);
    expect(wide).toBeLessThan(0.25);
  });

  it('never raises the scale and tolerates a degenerate size', () => {
    expect(clampScale(100, 100, 0.5, 8192)).toBe(0.5);
    expect(clampScale(0, 0, 2, 8192)).toBe(2);
  });
});

describe('rasterSize', () => {
  it('matches the documented table', () => {
    expect(rasterSize(48000, 18600, 2, 8192)).toEqual({ scale: 8192 / 48000, pw: 8192, ph: 3174 });
    expect(rasterSize(22200, 14800, 2, 8192)).toEqual({ scale: 8192 / 22200, pw: 8192, ph: 5461 });
    expect(rasterSize(200, 200, 2, 8192)).toEqual({ scale: 2, pw: 400, ph: 400 });
    expect(rasterSize(48000, 18600, 2, 16384)).toEqual({ scale: 16384 / 48000, pw: 16384, ph: 6349 });
  });

  it('yields integers no larger than maxDim and no smaller than 1 for any size', () => {
    let seed = 12345;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 200; i++) {
      const w = Math.ceil(next() * 120000) + 1;
      const h = Math.ceil(next() * 120000) + 1;
      const maxDim = next() < 0.5 ? DEFAULT_GPU_MAX_DIM : MAX_CANVAS_2D_DIM;
      const { pw, ph } = rasterSize(w, h, 2, maxDim);
      expect(Number.isInteger(pw) && Number.isInteger(ph)).toBe(true);
      expect(Math.max(pw, ph)).toBeLessThanOrEqual(maxDim);
      expect(Math.min(pw, ph)).toBeGreaterThanOrEqual(1);
    }
  });

  it('exposes the two caps the renderers use', () => {
    expect(MAX_CANVAS_2D_DIM).toBe(16384);
    expect(DEFAULT_GPU_MAX_DIM).toBe(8192);
  });
});

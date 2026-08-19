import { describe, expect, it } from 'vitest';

import {
  bandHasInk,
  bandHasNonOpaque,
  buildSampleGrid,
  buildSizeLadder,
  buildTileGrid,
  classifyRasterSamples,
  hexToRgb,
} from '../playground/utils/raster-verify';

const rgba = (r: number, g: number, b: number, a: number): Uint8ClampedArray => new Uint8ClampedArray([r, g, b, a]);

describe('buildSampleGrid', () => {
  it('produces grid² points including corners and center', () => {
    const pts = buildSampleGrid(7200, 7200, 5);
    expect(pts).toHaveLength(25);
    expect(pts).toContainEqual({ x: 0, y: 0 });
    expect(pts).toContainEqual({ x: 7199, y: 0 });
    expect(pts).toContainEqual({ x: 0, y: 7199 });
    expect(pts).toContainEqual({ x: 7199, y: 7199 });
    expect(pts).toContainEqual({ x: 3600, y: 3600 }); // center (odd grid)
  });

  it('keeps every point inside the canvas, even for tiny canvases', () => {
    for (const [w, h] of [
      [1, 1],
      [2, 3],
      [4, 4],
    ] as const) {
      for (const p of buildSampleGrid(w, h, 5)) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThan(w);
        expect(p.y).toBeLessThan(h);
      }
    }
  });

  it('preserves aspect-dependent spacing on non-square canvases', () => {
    const pts = buildSampleGrid(100, 50, 5);
    expect(pts).toContainEqual({ x: 99, y: 49 });
    expect(pts.every((p) => p.x < 100 && p.y < 50)).toBe(true);
  });
});

describe('classifyRasterSamples — opaque (JPEG) mode', () => {
  const fill = [rgba(255, 255, 255, 255), rgba(255, 255, 255, 255)];

  it('all-opaque samples that differ from the fill are ok', () => {
    const post = [rgba(255, 255, 255, 255), rgba(30, 40, 50, 255)];
    expect(classifyRasterSamples(post, 'opaque', fill)).toBe('ok');
  });

  it('a single non-opaque sample means the canvas was wiped (black-page signature)', () => {
    const post = [rgba(255, 255, 255, 255), rgba(0, 0, 0, 254)];
    expect(classifyRasterSamples(post, 'opaque', fill)).toBe('wiped');
  });

  it('an all-transparent buffer is wiped', () => {
    const post = [rgba(0, 0, 0, 0), rgba(0, 0, 0, 0)];
    expect(classifyRasterSamples(post, 'opaque', fill)).toBe('wiped');
  });

  it('samples identical to the pre-fill snapshot are a suspected draw no-op', () => {
    const post = [rgba(255, 255, 255, 255), rgba(255, 255, 255, 255)];
    expect(classifyRasterSamples(post, 'opaque', fill)).toBe('suspect-noop');
  });

  it('without a pre-fill snapshot, opaque samples are ok (no no-op detection)', () => {
    const post = [rgba(255, 255, 255, 255), rgba(255, 255, 255, 255)];
    expect(classifyRasterSamples(post, 'opaque')).toBe('ok');
  });
});

describe('classifyRasterSamples — transparent (PNG) mode', () => {
  it('any nonzero byte anywhere is ok', () => {
    expect(classifyRasterSamples([rgba(0, 0, 0, 0), rgba(0, 0, 1, 0)], 'transparent')).toBe('ok');
    expect(classifyRasterSamples([rgba(0, 0, 0, 3)], 'transparent')).toBe('ok');
  });

  it('all-zero samples are suspect-blank (wipe and no-op are indistinguishable)', () => {
    const post = [rgba(0, 0, 0, 0), rgba(0, 0, 0, 0)];
    expect(classifyRasterSamples(post, 'transparent')).toBe('suspect-blank');
  });
});

describe('bandHasInk', () => {
  it('opaque: detects a pixel differing from the fill color', () => {
    const fill = { r: 20, g: 16, b: 28 };
    const band = new Uint8ClampedArray([20, 16, 28, 255, 20, 17, 28, 255]);
    expect(bandHasInk(band, 'opaque', fill)).toBe(true);
  });

  it('opaque: uniform fill-colored band has no ink', () => {
    const fill = { r: 255, g: 255, b: 255 };
    const band = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]);
    expect(bandHasInk(band, 'opaque', fill)).toBe(false);
  });

  it('opaque: a non-opaque pixel is NOT ink (it is a wipe signal, not artwork)', () => {
    const fill = { r: 255, g: 255, b: 255 };
    const band = new Uint8ClampedArray([255, 255, 255, 255, 10, 10, 10, 200]);
    expect(bandHasInk(band, 'opaque', fill)).toBe(false);
    expect(bandHasNonOpaque(band)).toBe(true);
  });

  it('bandHasNonOpaque is false for a fully opaque band', () => {
    const band = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]);
    expect(bandHasNonOpaque(band)).toBe(false);
  });

  it('opaque mode without a fill color throws (never a silent wrong answer)', () => {
    expect(() => bandHasInk(new Uint8ClampedArray(8), 'opaque')).toThrow(/fill color/);
  });

  it('transparent: any nonzero byte is ink, all-zero is not', () => {
    expect(bandHasInk(new Uint8ClampedArray(16), 'transparent')).toBe(false);
    const band = new Uint8ClampedArray(16);
    band[9] = 1;
    expect(bandHasInk(band, 'transparent')).toBe(true);
  });
});

describe('hexToRgb', () => {
  it('parses #rrggbb', () => {
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#14101c')).toEqual({ r: 20, g: 16, b: 28 });
  });
});

describe('buildSizeLadder', () => {
  it('7200² with floor 2048 steps down by ~1/√2 and ends exactly at the floor', () => {
    const ladder = buildSizeLadder(7200, 7200, 2048);
    expect(ladder.map((s) => s.w)).toEqual([7200, 5091, 3600, 2546, 2048]);
    expect(ladder.map((s) => s.h)).toEqual([7200, 5091, 3600, 2546, 2048]);
  });

  it('is strictly decreasing', () => {
    const ladder = buildSizeLadder(8800, 8800, 2048);
    for (let i = 1; i < ladder.length; i++) {
      expect(Math.max(ladder[i].w, ladder[i].h)).toBeLessThan(Math.max(ladder[i - 1].w, ladder[i - 1].h));
    }
    expect(Math.max(ladder[ladder.length - 1].w, ladder[ladder.length - 1].h)).toBe(2048);
  });

  it('preserves aspect ratio on non-square sizes', () => {
    const ladder = buildSizeLadder(7200, 3600, 2048);
    for (const step of ladder) {
      expect(step.w / step.h).toBeCloseTo(2, 1);
    }
    const last = ladder[ladder.length - 1];
    expect(Math.max(last.w, last.h)).toBe(2048);
  });

  it('requested size at or below the floor yields a single entry', () => {
    expect(buildSizeLadder(1200, 1200, 2048)).toEqual([{ w: 1200, h: 1200 }]);
    expect(buildSizeLadder(2048, 2048, 2048)).toEqual([{ w: 2048, h: 2048 }]);
  });

  it('cover-preview case: 1200² with floor 600 ends at 600', () => {
    const ladder = buildSizeLadder(1200, 1200, 600);
    expect(ladder[0]).toEqual({ w: 1200, h: 1200 });
    expect(Math.max(ladder[ladder.length - 1].w, ladder[ladder.length - 1].h)).toBe(600);
  });
});

describe('buildTileGrid', () => {
  it('covers the full canvas with no gaps or overlaps', () => {
    const tiles = buildTileGrid(7200, 7200, 2048);
    expect(tiles).toHaveLength(16); // ceil(7200/2048)² = 4×4
    const area = tiles.reduce((sum, t) => sum + t.w * t.h, 0);
    expect(area).toBe(7200 * 7200);
    for (const t of tiles) {
      expect(t.x + t.w).toBeLessThanOrEqual(7200);
      expect(t.y + t.h).toBeLessThanOrEqual(7200);
    }
  });

  it('single tile when the canvas fits', () => {
    expect(buildTileGrid(1200, 900, 2048)).toEqual([{ x: 0, y: 0, w: 1200, h: 900 }]);
  });

  it('partial last row/column tiles have the remainder size', () => {
    const tiles = buildTileGrid(5000, 3000, 2048);
    expect(tiles.some((t) => t.w === 5000 - 2 * 2048)).toBe(true);
    expect(tiles.some((t) => t.h === 3000 - 2048)).toBe(true);
  });
});

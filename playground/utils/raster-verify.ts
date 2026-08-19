/**
 * Pure decision logic for verifying that a large SVG-to-canvas rasterization
 * actually drew something (export raster / PNG paths).
 *
 * Background: at print resolution (tens of megapixels) with heavily filtered
 * artwork, Chrome can lose the canvas context (buffer resets to transparent
 * black) or silently no-op the drawImage. Both used to ship undetected — a
 * transparent canvas JPEG-encodes to solid black, and a transparent PNG looks
 * blank. These helpers classify sparse pixel samples so the export modal can
 * detect the failure and retry (tiled, then at reduced resolution).
 *
 * No DOM access — fully unit-testable. All pixel data is RGBA
 * Uint8ClampedArray as returned by getImageData().data.
 */

export interface SamplePoint {
  x: number;
  y: number;
}

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RasterVerdict = 'ok' | 'wiped' | 'suspect-noop' | 'suspect-blank';

/**
 * Evenly spaced grid×grid sample points spanning [0, w-1] × [0, h-1] —
 * includes all four corners, edge midpoints, and (odd grid) the center.
 */
export function buildSampleGrid(w: number, h: number, grid = 5): SamplePoint[] {
  const points: SamplePoint[] = [];
  const steps = Math.max(1, grid - 1);
  for (let iy = 0; iy < grid; iy++) {
    const y = Math.min(h - 1, Math.round((iy * (h - 1)) / steps));
    for (let ix = 0; ix < grid; ix++) {
      const x = Math.min(w - 1, Math.round((ix * (w - 1)) / steps));
      points.push({ x, y });
    }
  }
  return points;
}

/**
 * Classify post-draw samples (one RGBA quad per sample point).
 *
 * 'opaque' mode — an opaque background fill preceded the draw (JPEG path):
 * - any sample with alpha < 255 proves the buffer was reset after the fill
 *   (context loss) → 'wiped'. This is the black-page failure signature.
 * - every sample byte-identical to its pre-fill counterpart → the draw may
 *   have been a silent no-op → 'suspect-noop' (caller escalates to a full
 *   scan; sparse artwork can legitimately miss every sample point).
 *
 * 'transparent' mode — no pre-fill (PNG path), where a wipe and a no-op are
 * indistinguishable: any nonzero byte → 'ok'; all zero → 'suspect-blank'
 * (caller escalates; a legitimately empty artwork is also all zero).
 */
export function classifyRasterSamples(
  postDraw: Uint8ClampedArray[],
  mode: 'opaque' | 'transparent',
  preFill?: Uint8ClampedArray[],
): RasterVerdict {
  if (mode === 'opaque') {
    for (const s of postDraw) {
      if (s[3] !== 255) return 'wiped';
    }
    if (preFill?.length === postDraw.length) {
      const changed = postDraw.some((s, i) => {
        const p = preFill[i];
        return s[0] !== p[0] || s[1] !== p[1] || s[2] !== p[2] || s[3] !== p[3];
      });
      if (!changed) return 'suspect-noop';
    }
    return 'ok';
  }
  for (const s of postDraw) {
    if (s[0] !== 0 || s[1] !== 0 || s[2] !== 0 || s[3] !== 0) return 'ok';
  }
  return 'suspect-blank';
}

/**
 * Escalation predicate for a 'suspect-*' verdict: does this horizontal band
 * of RGBA pixels contain any ink? In 'opaque' mode ink is a fully opaque
 * pixel differing from the fill color (non-opaque pixels are a wipe signal —
 * see bandHasNonOpaque — never ink); in 'transparent' mode ink is any
 * nonzero byte.
 */
export function bandHasInk(
  band: Uint8ClampedArray,
  mode: 'opaque' | 'transparent',
  fill?: { r: number; g: number; b: number },
): boolean {
  if (mode === 'opaque') {
    // Without the fill color the opaque comparison is meaningless — every
    // opaque pixel would read as "ink". Fail loudly rather than wrongly.
    if (!fill) throw new Error('bandHasInk: fill color is required in opaque mode');
    for (let i = 0; i < band.length; i += 4) {
      if (band[i + 3] === 255 && (band[i] !== fill.r || band[i + 1] !== fill.g || band[i + 2] !== fill.b)) {
        return true;
      }
    }
    return false;
  }
  for (const byte of band) {
    if (byte !== 0) return true;
  }
  return false;
}

/**
 * After an opaque background fill, any non-opaque pixel proves the buffer
 * was reset (context loss) — the opaque-mode wipe signal for full scans.
 */
export function bandHasNonOpaque(band: Uint8ClampedArray): boolean {
  for (let i = 3; i < band.length; i += 4) {
    if (band[i] !== 255) return true;
  }
  return false;
}

/** Parse a #rrggbb hex string (the resolveCssColorToHex output format). */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/**
 * Retry sizes for a failed rasterization: the requested size first, then
 * ×1/√2 steps (aspect preserved), with the final entry clamped so its longer
 * side is exactly `floorMaxSide`. Callers use index 0 for the full-size
 * attempts and slice(1) for the reduced-resolution ladder.
 */
export function buildSizeLadder(w: number, h: number, floorMaxSide: number): { w: number; h: number }[] {
  const ladder = [{ w, h }];
  let cw = w;
  let ch = h;
  while (Math.max(cw, ch) > floorMaxSide) {
    let nw = Math.max(1, Math.round(cw * Math.SQRT1_2));
    let nh = Math.max(1, Math.round(ch * Math.SQRT1_2));
    if (Math.max(nw, nh) < floorMaxSide) {
      const scale = floorMaxSide / Math.max(w, h);
      nw = Math.max(1, Math.round(w * scale));
      nh = Math.max(1, Math.round(h * scale));
    }
    if (nw >= cw && nh >= ch) break; // guard: no progress (tiny sizes)
    ladder.push({ w: nw, h: nh });
    cw = nw;
    ch = nh;
  }
  return ladder;
}

/**
 * Cover a w×h canvas with tiles of at most tileSide × tileSide (the last
 * row/column may be smaller). Row-major order, no gaps, no overlaps.
 */
export function buildTileGrid(w: number, h: number, tileSide = 2048): TileRect[] {
  const tiles: TileRect[] = [];
  for (let y = 0; y < h; y += tileSide) {
    const th = Math.min(tileSide, h - y);
    for (let x = 0; x < w; x += tileSide) {
      tiles.push({ x, y, w: Math.min(tileSide, w - x), h: th });
    }
  }
  return tiles;
}

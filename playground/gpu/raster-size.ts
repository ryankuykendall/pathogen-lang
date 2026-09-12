/**
 * Raster sizing for GPU / Canvas 2D gradient textures.
 *
 * Pure math, no DOM — importable under vitest. One integer size feeds the
 * canvas, the shader's resolution uniform and the texture-cache key, so the
 * three can never disagree.
 */

/** Largest canvas edge the Canvas 2D fallbacks will allocate. */
export const MAX_CANVAS_2D_DIM = 16384;

/** WebGPU's default `maxTextureDimension2D` — used before a device exists. */
export const DEFAULT_GPU_MAX_DIM = 8192;

export interface RasterSize {
  /** Effective pixels per user unit after clamping. */
  scale: number;
  /** Integer texture width / height, each ≤ the cap that produced them. */
  pw: number;
  ph: number;
}

/**
 * Reduce `scale` so both `w × scale` and `h × scale` fit within `maxDim`.
 * Never raises the scale, and never floors it: a viewBox wider than
 * 4 × maxDim units simply renders at fewer pixels per unit. (The former 0.25
 * floor requested textures over the cap for viewBoxes past 32768 units and
 * blanked every gradient on them — ISSUE-017.)
 */
export function clampScale(w: number, h: number, scale: number, maxDim: number): number {
  const longest = Math.max(w, h);
  if (longest <= 0) return scale;
  if (longest * scale <= maxDim) return scale;
  return maxDim / longest;
}

/** Clamped scale plus the integer texture size it yields. */
export function rasterSize(w: number, h: number, scale: number, maxDim: number): RasterSize {
  const s = clampScale(w, h, scale, maxDim);
  const clampAxis = (v: number): number => Math.min(maxDim, Math.max(1, Math.round(v * s)));
  return { scale: s, pw: clampAxis(w), ph: clampAxis(h) };
}

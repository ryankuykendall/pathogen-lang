/**
 * Conic gradient sampling rules shared by every renderer.
 *
 * The playground's WebGPU shader (`playground/gpu/conic-shader.ts`) is the
 * reference implementation. This module is a line-for-line port of its
 * per-pixel decisions — which stop parameter `t` a given angle maps to under
 * `from`/`to`/`direction`/`spread`, and how `innerRadius`/`innerFill` shape
 * the center — so the CLI wedge renderer and the Canvas 2D fallback can make
 * the same choices without owning a second copy of the rules.
 *
 * Pure math, no DOM.
 */

export type ConicSpread = 'clamp' | 'repeat' | 'transparent';
export type ConicDirection = 'cw' | 'ccw';

export interface ConicAngleSpec {
  /** Start angle, radians, 0 = 3 o'clock, positive clockwise on screen (y down). */
  from: number;
  /** End angle, radians. The sweep is `to - from`. */
  to: number;
  direction: ConicDirection;
  spread: ConicSpread;
}

export const TWO_PI = 2 * Math.PI;

/** Wrap an angle into [0, 2π). */
export function wrapAngle(angle: number): number {
  return angle - Math.floor(angle / TWO_PI) * TWO_PI;
}

/**
 * Stop parameter for a screen-space angle, or `null` when the angle lies
 * outside the sweep and `spread` is `'transparent'` (nothing is painted).
 *
 * Mirrors `fs_main` in the shader: the angle is wrapped to [0, 2π), reflected
 * for `'ccw'`, measured from `from` (wrapped again), divided by the sweep, and
 * the out-of-range part is handled by the spread mode. A sweep of zero yields
 * `null` for every angle.
 */
export function conicParamForAngle(angleRad: number, spec: ConicAngleSpec): number | null {
  const sweep = spec.to - spec.from;
  if (Math.abs(sweep) < 1e-10) return null;

  let angle = wrapAngle(angleRad);
  if (spec.direction === 'ccw') angle = TWO_PI - angle;

  const relative = wrapAngle(angle - spec.from);
  let t = relative / sweep;

  if (t < 0 || t > 1) {
    if (spec.spread === 'transparent') return null;
    if (spec.spread === 'repeat') {
      t = t - Math.floor(t);
    } else {
      t = t < 0 ? 0 : 1;
    }
  }
  return t;
}

/**
 * Inner-fill mode as the shader numbers it:
 * 0 = `'transparent'` (hard hole), 1 = `'center'` (blend from the first stop),
 * 2 = custom CSS color (blend from that color), 3 = `'transparent-blend'`
 * (blend from transparent).
 */
export type InnerFillMode = 0 | 1 | 2 | 3;

export function innerFillMode(innerFill: string | undefined): InnerFillMode {
  const fill = innerFill ?? 'transparent';
  if (fill === 'transparent') return 0;
  if (fill === 'center') return 1;
  if (fill === 'transparent-blend') return 3;
  return 2;
}

/** GLSL/WGSL `smoothstep(0, 1, x)` — the curve the shader blends the inner fill with. */
export function smoothstep01(x: number): number {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
}

/**
 * Radial-gradient stops that approximate the shader's inner-fill blend.
 * Each entry is the fraction of `innerRadius` and the *inner color's* weight
 * there: one minus the smoothstep of that fraction. Five stops keep the
 * S-curve within a few percent of the shader while staying cheap in SVG.
 */
export const INNER_BLEND_STOPS: ReadonlyArray<{ offset: number; innerWeight: number }> = [0, 0.25, 0.5, 0.75, 1].map(
  (offset) => ({ offset, innerWeight: 1 - smoothstep01(offset) }),
);

/** Finest wedge resolution accepted (0.01°) — keeps a bad `resolution` from looping forever. */
export const MIN_WEDGE_RESOLUTION = Math.PI / 18000;

/** Number of wedges needed to cover `sweepRad` at `resolutionRad` per wedge (at least 1). */
export function wedgeCountFor(sweepRad: number, resolutionRad: number): number {
  const res = Number.isFinite(resolutionRad) && resolutionRad > MIN_WEDGE_RESOLUTION ? resolutionRad : MIN_WEDGE_RESOLUTION;
  return Math.max(1, Math.ceil(Math.abs(sweepRad) / res));
}

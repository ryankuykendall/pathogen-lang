/**
 * Conic gradient renderer — generates SVG wedge paths for the CLI, the VS Code
 * preview and library consumers (every surface without a GPU raster).
 *
 * The playground's WebGPU shader is the reference; this renderer takes every
 * per-angle decision from `conic-param.ts`, which is a port of that shader,
 * and mixes stop colors in the same space the shader does — gamma-encoded
 * sRGB with straight alpha, as CSS gradients do by default — so the three
 * surfaces agree on `from`/`to`/`direction`/`spread`/`innerRadius`/`innerFill`.
 *
 * Pure math utility, no DOM dependencies.
 */

import { cssToRGBA, mixRGBA, rgbaToCSS } from './color.js';
import {
  INNER_BLEND_STOPS,
  TWO_PI,
  conicParamForAngle,
  innerFillMode,
  wedgeCountFor,
  type ConicDirection,
  type ConicSpread,
} from './conic-param.js';

import type { OKLCH, RGBA } from './color.js';

export interface ConicWedge {
  d: string;
  fill: string;
}

export interface ConicStop {
  offset: number;
  /** CSS color; this is what gets mixed (the shader parses the same string). */
  color: string;
  /** Carried by the evaluator's `stopsWithOklch`; not used for mixing. */
  oklch?: OKLCH;
}

export interface ConicRenderSpec {
  /** Center, user units. */
  cx: number;
  cy: number;
  /** Start / end angle in radians (0 = 3 o'clock, clockwise positive on screen). */
  from: number;
  to: number;
  direction: ConicDirection;
  spread: ConicSpread;
  stops: ConicStop[];
  /** Viewport size — the wedges extend past the farthest corner. */
  viewWidth: number;
  viewHeight: number;
  /** Center plateau radius, user units (0 = none). */
  innerRadius?: number;
  /** `'transparent'` | `'transparent-blend'` | `'center'` | a CSS color. */
  innerFill?: string;
  /** Radians per wedge (default ≈ 1°). */
  resolution?: number;
}

/**
 * A disc of `radius` around the center, painted over the wedges with the
 * inner color fading out — the CLI's approximation of the shader's
 * `mix(inner_color, sweep_color, smoothstep(0, r, dist))` for `'center'` and
 * custom-color fills.
 */
export interface ConicInnerOverlay {
  radius: number;
  color: string;
  /** Radial-gradient stops: `offset` is a fraction of `radius`, `opacity` the inner color's weight there. */
  stops: { offset: number; opacity: number }[];
}

/**
 * A luminance mask over the wedges for `'transparent-blend'`: black (hidden)
 * at the center rising to white (visible) at `radius` along the same curve.
 */
export interface ConicInnerMask {
  radius: number;
  stops: { offset: number; luminance: number }[];
}

export interface ConicRender {
  wedges: ConicWedge[];
  innerOverlay?: ConicInnerOverlay;
  innerMask?: ConicInnerMask;
}

const fmt = (n: number): string => Number(n.toFixed(2)).toString();

/**
 * Fraction of a wedge's angular step that it overshoots into the next wedge.
 * Wide enough that the following wedge fully covers this one's anti-aliased
 * edge at any radius above a few dozen units (a 1° wedge is ~1.7 px wide at
 * radius 100, so 0.6 of it is about a pixel there and more further out).
 */
const WEDGE_OVERLAP = 0.6;

/**
 * Sample the stop ramp at `t` exactly as the shader's `sampleRamp` does:
 * clamp to the end stops, find the bracketing pair, mix linearly in
 * gamma-encoded sRGB (straight alpha). A stop whose color cannot be parsed
 * falls back to the nearer stop's raw string.
 */
export function sampleConicRamp(sortedStops: ConicStop[], t: number): string {
  if (sortedStops.length === 0) return '#000000';
  const first = sortedStops[0];
  const last = sortedStops[sortedStops.length - 1];
  if (sortedStops.length === 1 || t <= first.offset) return first.color;
  if (t >= last.offset) return last.color;

  let lo = 0;
  let hi = sortedStops.length - 1;
  for (let i = 0; i < sortedStops.length - 1; i++) {
    if (t >= sortedStops[i].offset && t <= sortedStops[i + 1].offset) {
      lo = i;
      hi = i + 1;
      break;
    }
  }
  const a = sortedStops[lo];
  const b = sortedStops[hi];
  const range = b.offset - a.offset;
  if (range < 0.00001) return b.color;
  const f = (t - a.offset) / range;

  let ca: RGBA;
  let cb: RGBA;
  try {
    ca = cssToRGBA(a.color);
    cb = cssToRGBA(b.color);
  } catch {
    return f < 0.5 ? a.color : b.color;
  }
  return rgbaToCSS(mixRGBA(ca, cb, f));
}

/**
 * Render a conic gradient as SVG wedge paths plus, when the inner fill is a
 * blend, the overlay or mask that approximates it.
 */
export function renderConic(spec: ConicRenderSpec): ConicRender {
  const { cx, cy, from, to, direction, spread, viewWidth, viewHeight } = spec;
  const stops = [...spec.stops].sort((a, b) => a.offset - b.offset);
  if (stops.length === 0) return { wedges: [] };

  const sweep = to - from;
  if (Math.abs(sweep) < 1e-10) return { wedges: [] };

  const res = spec.resolution ?? Math.PI / 180;
  const angleSpec = { from, to, direction, spread };

  // Outer radius: past the farthest viewport corner, with a small margin.
  const r =
    Math.max(
      Math.hypot(cx, cy),
      Math.hypot(cx - viewWidth, cy),
      Math.hypot(cx, cy - viewHeight),
      Math.hypot(cx - viewWidth, cy - viewHeight),
    ) + 2;

  const innerRadius = Math.max(0, spec.innerRadius ?? 0);
  const fillMode = innerFillMode(spec.innerFill);
  // Only the hard hole cuts the wedges; the blended modes paint over full sectors.
  const holeRadius = innerRadius > 0 && fillMode === 0 ? Math.min(innerRadius, r) : 0;

  const wedges: ConicWedge[] = [];
  const sign = sweep > 0 ? 1 : -1;

  const emitArc = (start: number, end: number, finalRun: boolean): void => {
    const arc = end - start;
    if (Math.abs(arc) < 1e-10) return;
    const count = wedgeCountFor(arc, res);
    const step = arc / count;
    const sweepFlag = arc > 0 ? 1 : 0;
    // Each wedge overshoots its end by a fraction of a step so the next one,
    // painted on top, covers the seam. Adjacent anti-aliased edges in SVG
    // otherwise blend with the background and read as faint lines
    // (conflation artifacts). The very last wedge painted keeps its true edge:
    // nothing follows to hide an overshoot there, and for a full circle it
    // would sit on top of the first wedge as a sliver of the wrong color.
    for (let i = 0; i < count; i++) {
      const isLast = finalRun && i === count - 1;
      const a1 = start + i * step;
      const a2 = start + (i + 1) * step + (isLast ? 0 : step * WEDGE_OVERLAP);
      const t = conicParamForAngle(start + (i + 0.5) * step, angleSpec);
      if (t === null) continue;
      const fill = sampleConicRamp(stops, t);

      const x1 = cx + r * Math.cos(a1);
      const y1 = cy + r * Math.sin(a1);
      const x2 = cx + r * Math.cos(a2);
      const y2 = cy + r * Math.sin(a2);
      const largeArc = Math.abs(a2 - a1) > Math.PI ? 1 : 0;

      let d: string;
      if (holeRadius > 0) {
        const xi1 = cx + holeRadius * Math.cos(a1);
        const yi1 = cy + holeRadius * Math.sin(a1);
        const xi2 = cx + holeRadius * Math.cos(a2);
        const yi2 = cy + holeRadius * Math.sin(a2);
        d =
          `M ${fmt(xi1)} ${fmt(yi1)} L ${fmt(x1)} ${fmt(y1)} ` +
          `A ${fmt(r)} ${fmt(r)} 0 ${largeArc} ${sweepFlag} ${fmt(x2)} ${fmt(y2)} ` +
          `L ${fmt(xi2)} ${fmt(yi2)} ` +
          `A ${fmt(holeRadius)} ${fmt(holeRadius)} 0 ${largeArc} ${1 - sweepFlag} ${fmt(xi1)} ${fmt(yi1)} Z`;
      } else {
        d = `M ${fmt(cx)} ${fmt(cy)} L ${fmt(x1)} ${fmt(y1)} A ${fmt(r)} ${fmt(r)} 0 ${largeArc} ${sweepFlag} ${fmt(x2)} ${fmt(y2)} Z`;
      }
      wedges.push({ d, fill });
    }
  };

  // Screen-space bounds of the sweep. The shader reflects the angle for
  // 'ccw' (angle' = 2π − angle), so the painted arc on screen is the mirror
  // image [−to, −from]; walking it keeps wedge boundaries exactly on the
  // sweep's edges. Colors always come from the true angle via the helper.
  const start = direction === 'ccw' ? -to : from;
  const end = direction === 'ccw' ? -from : to;
  if (Math.abs(sweep) >= TWO_PI) {
    // The sweep already covers the circle; there is no gap.
    emitArc(start, start + sign * TWO_PI, true);
  } else if (spread === 'transparent') {
    emitArc(start, end, true);
  } else {
    emitArc(start, end, false);
    emitArc(end, start + sign * TWO_PI, true);
  }

  const render: ConicRender = { wedges };
  if (innerRadius > 0 && fillMode !== 0) {
    if (fillMode === 3) {
      render.innerMask = {
        radius: innerRadius,
        stops: INNER_BLEND_STOPS.map((s) => ({ offset: s.offset, luminance: 1 - s.innerWeight })),
      };
    } else {
      const innerColor = fillMode === 1 ? stops[0].color : (spec.innerFill as string);
      render.innerOverlay = {
        radius: innerRadius,
        color: innerColor,
        stops: INNER_BLEND_STOPS.map((s) => ({ offset: s.offset, opacity: s.innerWeight })),
      };
    }
  }
  return render;
}

/** Wedges only — the pre-existing entry point kept for callers that want just paths. */
export function renderConicToWedges(spec: ConicRenderSpec): ConicWedge[] {
  return renderConic(spec).wedges;
}

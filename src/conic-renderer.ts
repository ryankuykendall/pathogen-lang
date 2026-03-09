/**
 * Conic gradient renderer — generates SVG wedge paths for CLI output.
 * Pure math utility, no DOM dependencies.
 */

import { mixColors, oklchToCSS } from './color.js';

import type { OKLCH } from './color.js';

export interface ConicWedge {
  d: string;
  fill: string;
}

/**
 * Interpolate color between two stops at parameter t ∈ [0,1].
 * Uses OKLCh if both stops have oklch data, otherwise picks nearest.
 */
function interpolateColor(stops: { offset: number; color: string; oklch?: OKLCH }[], t: number): string {
  if (stops.length === 0) return '#000000';
  if (stops.length === 1) return stops[0].color;

  // Clamp t to [0,1]
  if (t <= stops[0].offset) return stops[0].color;
  if (t >= stops[stops.length - 1].offset) return stops[stops.length - 1].color;

  // Find bracketing stops
  let lo = 0;
  let hi = stops.length - 1;
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].offset && t <= stops[i + 1].offset) {
      lo = i;
      hi = i + 1;
      break;
    }
  }

  const a = stops[lo];
  const b = stops[hi];
  const span = b.offset - a.offset;
  if (span <= 0) return a.color;

  const frac = (t - a.offset) / span;

  // Use OKLCh interpolation if both have oklch data
  if (a.oklch && b.oklch) {
    const mixed = mixColors(a.oklch, b.oklch, frac);
    return oklchToCSS(mixed);
  }

  // Fallback: return nearest color
  return frac < 0.5 ? a.color : b.color;
}

/**
 * Render a conic gradient as SVG wedge paths.
 *
 * @param cx - Center x
 * @param cy - Center y
 * @param fromRad - Start angle in radians (0 = 3 o'clock)
 * @param toRad - End angle in radians
 * @param direction - 'cw' or 'ccw'
 * @param spread - 'clamp' | 'repeat' | 'transparent'
 * @param stops - Color stops with optional oklch data
 * @param viewWidth - Viewport width for radius calculation
 * @param viewHeight - Viewport height for radius calculation
 * @param resolution - Radians per wedge (default ~1 degree)
 */
export function renderConicToWedges(
  cx: number,
  cy: number,
  fromRad: number,
  toRad: number,
  direction: 'cw' | 'ccw',
  _spread: string,
  stops: { offset: number; color: string; oklch?: OKLCH }[],
  viewWidth: number,
  viewHeight: number,
  resolution?: number,
): ConicWedge[] {
  if (stops.length === 0) return [];

  const res = resolution ?? Math.PI / 180; // ~1 degree per wedge
  const sweep = toRad - fromRad;
  if (Math.abs(sweep) < 1e-10) return [];

  // Radius: max distance from center to any viewport corner, with a small margin
  const r =
    Math.max(
      Math.hypot(cx, cy),
      Math.hypot(cx - viewWidth, cy),
      Math.hypot(cx, cy - viewHeight),
      Math.hypot(cx - viewWidth, cy - viewHeight),
    ) + 2;

  // Process stops — if direction is ccw, reverse offsets
  const processedStops =
    direction === 'ccw'
      ? stops.map((s) => ({ ...s, offset: 1 - s.offset })).sort((a, b) => a.offset - b.offset)
      : [...stops].sort((a, b) => a.offset - b.offset);

  const wedgeCount = Math.max(1, Math.ceil(Math.abs(sweep) / res));
  const wedges: ConicWedge[] = [];
  const angleStep = sweep / wedgeCount;

  for (let i = 0; i < wedgeCount; i++) {
    const a1 = fromRad + i * angleStep;
    const a2 = fromRad + (i + 1) * angleStep;
    const midAngle = (a1 + a2) / 2;

    // Map wedge midpoint to stop offset t ∈ [0,1]
    const t = (midAngle - fromRad) / sweep;

    const fill = interpolateColor(processedStops, t);

    // Generate wedge path: M cx cy L x1 y1 A rx ry 0 largeArc sweep x2 y2 Z
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy + r * Math.sin(a2);

    const wedgeAngle = Math.abs(a2 - a1);
    const largeArc = wedgeAngle > Math.PI ? 1 : 0;
    const sweepFlag = sweep > 0 ? 1 : 0;

    // Use fixed precision for reasonable SVG file sizes
    const fmt = (n: number) => Number(n.toFixed(2)).toString();

    const d = `M ${fmt(cx)} ${fmt(cy)} L ${fmt(x1)} ${fmt(y1)} A ${fmt(r)} ${fmt(r)} 0 ${largeArc} ${sweepFlag} ${fmt(x2)} ${fmt(y2)} Z`;
    wedges.push({ d, fill });
  }

  return wedges;
}

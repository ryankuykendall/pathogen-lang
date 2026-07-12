/**
 * variable-offset-geometry — pure geometry for the variableOffset /
 * compoundVariableOffset PathBlock feature (Model A, "rail-guided points").
 *
 * Spec: project-docs/variable-offset/design-note.md §4.3–4.5, §4.8.
 *
 * Pipeline: project stops on a spine → knots (point + spine tangent), then build
 * a per-knot-continuity curve through the knots:
 *   - G0 knot → the spline BREAKS (hard corner).
 *   - G1 span → non-uniform Catmull-Rom (C1) tangents.
 *   - G2 span → CLAMPED cubic spline (C2) tridiagonal solve. Clamped, not
 *     natural: endpoints honor a *specified first derivative* (spine-derived or
 *     override) with end curvature left free (design-note §4.3/§4.4).
 * Each segment is emitted as a cubic Bézier (Hermite→Bézier), lowercase `c`
 * with args relative to the segment start — matching offsetCommands' convention.
 */

import type { Point } from './context';
import { samplePathAtFraction } from './sampling';
import { unitNormal } from './path-transforms';

export type Continuity = 'G0' | 'G1' | 'G2';

/** Minimal command shape — structurally compatible with TransformCmd / PathBlockCommand. */
export interface GeomCmd {
  command: string;
  args: number[];
  start: Point;
  end: Point;
}

export interface Knot {
  point: Point;
  continuity: Continuity;
  /** Spine tangent direction (radians) at this knot's stop — used for spine-derived endpoint tangents. */
  spineTangent: number;
}

// ---- vector helpers ----

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (a: Point, s: number): Point => ({ x: a.x * s, y: a.y * s });
const len = (a: Point): number => Math.sqrt(a.x * a.x + a.y * a.y);
const dist = (a: Point, b: Point): number => len(sub(a, b));

const EPS = 1e-9;

// ---- stop projection (Model A: spine positions + orients a knot) ----

/**
 * Project a single stop onto the spine: sample point + tangent at arc-length
 * fraction `time`, offset along the left-hand normal by `offset`.
 * Reuses `unitNormal` so the offset sign matches the existing `offset()` method.
 */
export function projectStop(
  spine: GeomCmd[],
  time: number,
  offset: number,
): { point: Point; spineTangent: number } {
  const { point, tangent } = samplePathAtFraction(spine, time);
  const n = unitNormal(Math.cos(tangent), Math.sin(tangent));
  return {
    point: { x: point.x + n.x * offset, y: point.y + n.y * offset },
    spineTangent: tangent,
  };
}

// ---- tridiagonal (Thomas algorithm) ----

/**
 * Solve a tridiagonal system for a single scalar component.
 * `aSub[i]` sub-diagonal (coeff of x[i-1]), `bDiag[i]` diagonal, `cSup[i]`
 * super-diagonal (coeff of x[i+1]), `d[i]` rhs. Returns x.
 */
function solveTridiagonal(aSub: number[], bDiag: number[], cSup: number[], d: number[]): number[] {
  const n = bDiag.length;
  const cp = new Array<number>(n);
  const dp = new Array<number>(n);
  cp[0] = cSup[0] / bDiag[0];
  dp[0] = d[0] / bDiag[0];
  for (let i = 1; i < n; i++) {
    const m = bDiag[i] - aSub[i] * cp[i - 1];
    cp[i] = cSup[i] / m;
    dp[i] = (d[i] - aSub[i] * dp[i - 1]) / m;
  }
  const x = new Array<number>(n);
  x[n - 1] = dp[n - 1];
  for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
  return x;
}

// ---- knot parameterization ----

/** Centripetal (alpha=0.5) knot parameters; guards coincident knots. */
function knotParams(points: Point[]): number[] {
  const t = [0];
  for (let i = 1; i < points.length; i++) {
    const d = Math.max(dist(points[i], points[i - 1]), EPS);
    t.push(t[i - 1] + Math.sqrt(d));
  }
  return t;
}

// ---- per-span tangent computation ----

/**
 * Tangents (dP/dt) at each knot of a single span, given the knot parameters.
 * `useG2` selects the clamped-cubic C2 solve; otherwise non-uniform Catmull-Rom.
 * `startTan`/`endTan` clamp the span endpoints (spine-derived vector or override);
 * when undefined, a one-sided finite difference is used (a G0 corner boundary).
 */
function spanTangents(
  points: Point[],
  t: number[],
  useG2: boolean,
  startTan: Point | undefined,
  endTan: Point | undefined,
): Point[] {
  const n = points.length - 1; // last index
  const h = (i: number) => t[i + 1] - t[i];
  const chord = (i: number): Point => scale(sub(points[i + 1], points[i]), 1 / h(i)); // Δ[i]

  // One-sided endpoint fallbacks.
  const m0 = startTan ?? chord(0);
  const mn = endTan ?? chord(n - 1);

  if (n === 1) return [m0, mn]; // single segment → just the two endpoint tangents

  if (!useG2) {
    // Non-uniform Catmull-Rom: convex-combination tangent at interior knots.
    const m: Point[] = new Array(points.length);
    m[0] = m0;
    m[n] = mn;
    for (let i = 1; i < n; i++) {
      const dPrev = h(i - 1);
      const dNext = h(i);
      const wPrev = dNext / (dPrev + dNext);
      const wNext = dPrev / (dPrev + dNext);
      m[i] = add(scale(chord(i - 1), wPrev), scale(chord(i), wNext));
    }
    return m;
  }

  // Clamped cubic spline: solve tridiagonal for interior slopes m[1..n-1].
  // Equation i:  h[i]·m[i-1] + 2(h[i-1]+h[i])·m[i] + h[i-1]·m[i+1] = R[i]
  //   R[i] = 3( h[i]·(P[i]-P[i-1])/h[i-1] + h[i-1]·(P[i+1]-P[i])/h[i] )
  const size = n - 1;
  const aSub = new Array<number>(size);
  const bDiag = new Array<number>(size);
  const cSup = new Array<number>(size);
  const rx = new Array<number>(size);
  const ry = new Array<number>(size);
  for (let k = 0; k < size; k++) {
    const i = k + 1;
    const hPrev = h(i - 1);
    const hNext = h(i);
    aSub[k] = hNext; // coeff of m[i-1]
    bDiag[k] = 2 * (hPrev + hNext);
    cSup[k] = hPrev; // coeff of m[i+1]
    const R = add(
      scale(sub(points[i], points[i - 1]), (3 * hNext) / hPrev),
      scale(sub(points[i + 1], points[i]), (3 * hPrev) / hNext),
    );
    rx[k] = R.x;
    ry[k] = R.y;
    if (k === 0) {
      rx[k] -= hNext * m0.x;
      ry[k] -= hNext * m0.y;
    }
    if (k === size - 1) {
      rx[k] -= hPrev * mn.x;
      ry[k] -= hPrev * mn.y;
    }
  }
  const mx = solveTridiagonal(aSub, bDiag, cSup, rx);
  const my = solveTridiagonal(aSub, bDiag, cSup, ry);
  const m: Point[] = new Array(points.length);
  m[0] = m0;
  m[n] = mn;
  for (let k = 0; k < size; k++) m[k + 1] = { x: mx[k], y: my[k] };
  return m;
}

// ---- Hermite → cubic Bézier emit ----

/** Emit one segment P[i]→P[i+1] as a relative-`c` cubic, given dP/dt tangents and h. */
function emitCubic(p0: Point, p1: Point, m0: Point, m1: Point, h: number): GeomCmd {
  // On normalized param u∈[0,1], dP/du = h·(dP/dt). Bézier CPs at ±(dP/du)/3.
  const cp1 = add(p0, scale(m0, h / 3));
  const cp2 = sub(p1, scale(m1, h / 3));
  return {
    command: 'c',
    args: [cp1.x - p0.x, cp1.y - p0.y, cp2.x - p0.x, cp2.y - p0.y, p1.x - p0.x, p1.y - p0.y],
    start: { ...p0 },
    end: { ...p1 },
  };
}

// ---- main builder ----

export interface SplineOptions {
  /** Explicit dP/dt at the first knot (spine-derived or PolarVector override). */
  startTangent?: Point;
  /** Explicit dP/dt at the last knot. */
  endTangent?: Point;
}

/**
 * Build a curve through `knots` honoring per-knot continuity. Returns a leading
 * `M` to the first knot followed by cubic `c` segments (G0 breaks stay connected
 * positionally but reset tangents → visible corner). Not normalized to origin —
 * the caller re-normalizes like `offset()` does.
 */
export function buildContinuitySpline(knots: Knot[], opts: SplineOptions = {}): GeomCmd[] {
  if (knots.length === 0) return [];
  const first = knots[0].point;
  const out: GeomCmd[] = [{ command: 'M', args: [first.x, first.y], start: { ...first }, end: { ...first } }];
  if (knots.length === 1) return out;

  // Split into spans at G0 knots (G0 knots are shared as span boundaries → corner).
  const spans: Knot[][] = [];
  let cur: Knot[] = [knots[0]];
  for (let i = 1; i < knots.length; i++) {
    cur.push(knots[i]);
    if (knots[i].continuity === 'G0' && i < knots.length - 1) {
      spans.push(cur);
      cur = [knots[i]];
    }
  }
  spans.push(cur);

  for (let s = 0; s < spans.length; s++) {
    const span = spans[s];
    const pts = span.map((k) => k.point);
    const t = knotParams(pts);
    // A span uses the G2 solve if any interior knot is G2 (design-note §4.3;
    // mixed G1/G2 within a span is a deferred under-spec — upgrades G1→G2 here).
    const useG2 = span.slice(1, -1).some((k) => k.continuity === 'G2');

    // Endpoint clamps: the whole-sequence first/last use opts tangents (spine-derived
    // default); interior G0 boundaries stay undefined → one-sided (corner).
    const isFirstSpan = s === 0;
    const isLastSpan = s === spans.length - 1;
    const startTan = isFirstSpan ? opts.startTangent : undefined;
    const endTan = isLastSpan ? opts.endTangent : undefined;

    const m = spanTangents(pts, t, useG2, startTan, endTan);
    for (let i = 0; i < pts.length - 1; i++) {
      out.push(emitCubic(pts[i], pts[i + 1], m[i], m[i + 1], t[i + 1] - t[i]));
    }
  }
  return out;
}

/** Spine-derived endpoint tangent vector: unit spine direction scaled to a chord magnitude. */
export function spineDerivedTangent(spineTangent: number, magnitude: number): Point {
  return { x: Math.cos(spineTangent) * magnitude, y: Math.sin(spineTangent) * magnitude };
}

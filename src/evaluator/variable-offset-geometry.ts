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
import { unitNormal, reverseCommands } from './path-transforms';

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
 * Endpoint boundary condition: a tangent DIRECTION (radians) with an optional
 * explicit handle length (tension). Magnitude is resolved in parameter space so
 * the Bézier handle equals `tension` (or a natural ⅓-chord when tension is omitted).
 */
export interface EndpointSpec {
  dir: number;
  tension?: number;
}

/**
 * Tangents (dP/dt) at each knot of a single span, given the knot parameters.
 * `useG2` selects the clamped-cubic C2 solve; otherwise non-uniform Catmull-Rom.
 * `startSpec`/`endSpec` clamp the span endpoints (spine-derived direction or a
 * PolarVector override); when undefined, a one-sided finite difference is used
 * (a G0 corner boundary). The endpoint dP/dt is computed as `handleLen·3 / h` so
 * that the emitted handle (`m·h/3`) has the intended length in user units.
 */
function spanTangents(
  points: Point[],
  t: number[],
  useG2: boolean,
  startSpec: EndpointSpec | undefined,
  endSpec: EndpointSpec | undefined,
): Point[] {
  const n = points.length - 1; // last index
  const h = (i: number) => t[i + 1] - t[i];
  const chord = (i: number): Point => scale(sub(points[i + 1], points[i]), 1 / h(i)); // Δ[i]

  const endpointM = (spec: EndpointSpec | undefined, fallback: Point, hEnd: number, euclid: number): Point => {
    if (!spec) return fallback; // one-sided default (G0 boundary between spans)
    const handleLen = spec.tension ?? euclid / 3; // natural handle = ⅓ chord
    const mag = (handleLen * 3) / hEnd; // so that m·hEnd/3 === handleLen
    return { x: Math.cos(spec.dir) * mag, y: Math.sin(spec.dir) * mag };
  };
  const m0 = endpointM(startSpec, chord(0), h(0), len(sub(points[1], points[0])));
  const mn = endpointM(endSpec, chord(n - 1), h(n - 1), len(sub(points[n], points[n - 1])));

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
  /** Boundary condition at the first knot (spine-derived direction or override). */
  start?: EndpointSpec;
  /** Boundary condition at the last knot. */
  end?: EndpointSpec;
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

    // Endpoint clamps: the whole-sequence first/last use opts specs (spine-derived
    // default); interior G0 boundaries stay undefined → one-sided (corner).
    const isFirstSpan = s === 0;
    const isLastSpan = s === spans.length - 1;
    const startSpec = isFirstSpan ? opts.start : undefined;
    const endSpec = isLastSpan ? opts.end : undefined;

    const m = spanTangents(pts, t, useG2, startSpec, endSpec);
    for (let i = 0; i < pts.length - 1; i++) {
      out.push(emitCubic(pts[i], pts[i + 1], m[i], m[i + 1], t[i + 1] - t[i]));
    }
  }
  return out;
}

/** A PolarVector-like endpoint override (direction + tension/handle length). */
export interface PolarOverride {
  angle: number;
  distance: number;
}

// ---- high-level orchestration (project stops → spline → normalized commands) ----

/** Map a CurveContinuity enum *value* ('position'|'tangent'|'curvature') to G0/G1/G2. */
const CONTINUITY_BY_VALUE: Record<string, Continuity> = {
  position: 'G0',
  tangent: 'G1',
  curvature: 'G2',
};
export function continuityFromValue(enumValue: string): Continuity {
  const c = CONTINUITY_BY_VALUE[enumValue];
  if (!c) throw new Error(`Invalid CurveContinuity value: ${enumValue}`);
  return c;
}

export interface SimpleStop {
  time: number;
  offset: number;
  continuity: Continuity;
}

/** Translate a command list so its first point sits at (0,0), zeroing a leading M's args. */
function normalizeToOrigin(cmds: GeomCmd[]): GeomCmd[] {
  if (cmds.length === 0) return cmds;
  const ox = cmds[0].start.x;
  const oy = cmds[0].start.y;
  return cmds.map((c) => {
    const start = { x: c.start.x - ox, y: c.start.y - oy };
    const end = { x: c.end.x - ox, y: c.end.y - oy };
    // Leading absolute M → re-anchor its args to the new origin; relative `c` args are unchanged.
    const args = c.command === 'M' ? [start.x, start.y] : [...c.args];
    return { command: c.command, args, start, end };
  });
}

/**
 * A built variable-offset curve. `commands` are origin-normalized (first point at
 * (0,0), leading M stripped) so drawTo positions the curve freely; `anchor` is the
 * translation that normalization subtracted — the curve's first point in the
 * spine's coordinate space (spine sampled at the first stop, stepped out along the
 * normal by that stop's offset). Adding `anchor` back registers the curve with its
 * spine.
 */
export interface VariableOffsetResult {
  commands: GeomCmd[];
  anchor: Point;
}

/**
 * Full simple-offset pipeline: project each stop onto the spine → knots, resolve
 * endpoint tangents (spine-derived by default, or an explicit override vector),
 * build the continuity spline, and normalize to a (0,0) origin. Returns the
 * emitted command list (cubic `c` segments, leading M stripped) plus the anchor.
 */
export function buildSimpleVariableOffset(
  spine: GeomCmd[],
  stops: SimpleStop[],
  startOverride?: PolarOverride,
  endOverride?: PolarOverride,
): VariableOffsetResult {
  const knots: Knot[] = stops.map((s) => {
    const { point, spineTangent } = projectStop(spine, s.time, s.offset);
    return { point, continuity: s.continuity, spineTangent };
  });
  if (knots.length === 0) return { commands: [], anchor: { x: 0, y: 0 } };
  const spline = buildContinuitySpline(knots, endpointSpecs(knots, startOverride, endOverride));
  return { commands: stripLeadingMove(normalizeToOrigin(spline)), anchor: { ...knots[0].point } };
}

/**
 * Resolve endpoint boundary conditions for a knot run: spine-derived DIRECTION with
 * natural (⅓-chord) tension by default; a PolarVector override supplies both an
 * explicit direction and an explicit handle length. Empty for < 2 knots.
 */
function endpointSpecs(knots: Knot[], startOverride?: PolarOverride, endOverride?: PolarOverride): SplineOptions {
  const n = knots.length;
  if (n < 2) return {};
  return {
    start: startOverride
      ? { dir: startOverride.angle, tension: startOverride.distance }
      : { dir: knots[0].spineTangent },
    end: endOverride ? { dir: endOverride.angle, tension: endOverride.distance } : { dir: knots[n - 1].spineTangent },
  };
}

/** Drop a leading absolute M so the result is a relative sequence positioned by drawTo. */
function stripLeadingMove(cmds: GeomCmd[]): GeomCmd[] {
  return cmds.length > 0 && cmds[0].command === 'M' ? cmds.slice(1) : cmds;
}

// ---- end caps ----

export interface CapSpec {
  cap: 'butt' | 'round' | 'elliptical' | 'tapered';
  projection?: number; // elliptical
  length?: number; // tapered
  continuity?: Continuity; // tapered
}

const crossZ = (u: Point, v: Point): number => u.x * v.y - u.y * v.x;
const unitAt = (angle: number): Point => ({ x: Math.cos(angle), y: Math.sin(angle) });

/**
 * Build the commands for one end cap, from profile endpoint A to profile endpoint B,
 * bulging along the unit `outward` direction. Returns segments starting at A (pen is
 * assumed there) and ending at B — no leading move.
 */
function buildCap(spec: CapSpec, A: Point, B: Point, outward: Point): GeomCmd[] {
  const chord = sub(B, A);
  const chordLen = len(chord);
  if (chordLen < EPS) return [];
  const rel = (from: Point, to: Point): number[] => [to.x - from.x, to.y - from.y];

  switch (spec.cap) {
    case 'butt':
      return [{ command: 'l', args: [chord.x, chord.y], start: { ...A }, end: { ...B } }];

    case 'round':
    case 'elliptical': {
      const rx = chordLen / 2;
      const ry = spec.cap === 'round' ? rx : spec.projection ?? rx;
      const phi = spec.cap === 'round' ? 0 : (Math.atan2(chord.y, chord.x) * 180) / Math.PI;
      // Sweep so the arc bulges toward `outward`.
      const sweep = crossZ(chord, outward) < 0 ? 1 : 0;
      return [{ command: 'a', args: [rx, ry, phi, 0, sweep, chord.x, chord.y], start: { ...A }, end: { ...B } }];
    }

    case 'tapered': {
      const L = spec.length ?? chordLen / 2;
      const apex = add(scale(add(A, B), 0.5), scale(outward, L));
      if ((spec.continuity ?? 'G0') === 'G0') {
        return [
          { command: 'l', args: rel(A, apex), start: { ...A }, end: { ...apex } },
          { command: 'l', args: rel(apex, B), start: { ...apex }, end: { ...B } },
        ];
      }
      // Smooth taper (G1/G2): one cubic A→B pulled toward the apex.
      const cp1 = add(A, scale(sub(apex, A), 0.6));
      const cp2 = add(B, scale(sub(apex, B), 0.6));
      return [
        {
          command: 'c',
          args: [cp1.x - A.x, cp1.y - A.y, cp2.x - A.x, cp2.y - A.y, chord.x, chord.y],
          start: { ...A },
          end: { ...B },
        },
      ];
    }
  }
}

// ---- compound (two-profile ribbon) ----

export interface CompoundStop {
  time: number;
  offset1: number;
  continuity1: Continuity;
  offset2: number;
  continuity2: Continuity;
}

export interface CompoundOptions {
  startOverride?: PolarOverride;
  endOverride?: PolarOverride;
  startCap?: CapSpec;
  endCap?: CapSpec;
}

/**
 * Two-profile ribbon. Traversal (design-note §4.8): profile 1 forward → end cap →
 * profile 2 reversed → start cap → close. A missing cap leaves that end open; with
 * neither cap the two profiles are emitted as separate, unconnected subpaths.
 */
export function buildCompoundVariableOffset(
  spine: GeomCmd[],
  stops: CompoundStop[],
  opts: CompoundOptions = {},
): VariableOffsetResult {
  if (stops.length === 0) return { commands: [], anchor: { x: 0, y: 0 } };
  const project = (offsetKey: 'offset1' | 'offset2', contKey: 'continuity1' | 'continuity2'): Knot[] =>
    stops.map((s) => {
      const { point, spineTangent } = projectStop(spine, s.time, s[offsetKey]);
      return { point, continuity: s[contKey], spineTangent };
    });
  const p1Knots = project('offset1', 'continuity1');
  const p2Knots = project('offset2', 'continuity2');

  const p1 = buildContinuitySpline(p1Knots, endpointSpecs(p1Knots, opts.startOverride, opts.endOverride));
  const p2 = buildContinuitySpline(p2Knots, endpointSpecs(p2Knots));
  const p2Rev = reverseCommands(p2);

  const last = stops.length - 1;
  const p1Start = p1Knots[0].point;
  const p1End = p1Knots[last].point;
  const p2Start = p2Knots[0].point;
  const p2End = p2Knots[last].point;
  const endOutward = unitAt(p1Knots[last].spineTangent); // forward beyond the last stop
  const startOutward = unitAt(p1Knots[0].spineTangent + Math.PI); // backward before the first stop

  // reverseCommands returns draw commands only (no leading M); it assumes the pen
  // is already at the reversed start (p2End).
  const cmds: GeomCmd[] = [...p1]; // M p1Start + profile-1 cubics
  if (opts.endCap) {
    cmds.push(...buildCap(opts.endCap, p1End, p2End, endOutward)); // pen → p2End
    cmds.push(...p2Rev); // reversed profile 2 from p2End
  } else {
    // No end cap → profile 2 is a separate subpath; move to its (reversed) start.
    // MUST be a lowercase relative `m` — PathBlock commands are lowercase-relative,
    // and an uppercase 'M' falls through commandsToRelativeD's catch-all as a
    // literal absolute `M 0 0` (see boolean-ops.ts "uppercase M" trap). The pen is
    // at p1End (end of profile 1); the serializer derives the delta from `end`.
    cmds.push({
      command: 'm',
      args: [p2End.x - p1End.x, p2End.y - p1End.y],
      start: { ...p1End },
      end: { ...p2End },
    });
    cmds.push(...p2Rev);
  }
  if (opts.startCap) cmds.push(...buildCap(opts.startCap, p2Start, p1Start, startOutward));
  if (opts.startCap && opts.endCap) {
    cmds.push({ command: 'z', args: [], start: { ...p1Start }, end: { ...p1Start } });
  }

  // Traversal starts at profile 1's first knot, so that knot is what
  // normalizeToOrigin subtracts — expose it as the anchor.
  return { commands: stripLeadingMove(normalizeToOrigin(cmds)), anchor: { ...p1Start } };
}

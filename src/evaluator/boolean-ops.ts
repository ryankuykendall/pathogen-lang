/**
 * Boolean operations on SVG paths: union, difference, intersection, xor.
 *
 * Curve-preserving — splits at exact intersection points, keeps original
 * command types (line, cubic, quadratic, arc) wherever possible.
 *
 * Self-contained: all math helpers are local. Only the Point type is imported.
 */

import type { Point } from './context';

// ─── Types & Constants ──────────────────────────────────────────────────────

interface TransformCmd {
  command: string;
  args: number[];
  start: Point;
  end: Point;
}

interface ArcCenter {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  phi: number;
  startAngle: number;
  deltaAngle: number;
}

interface Intersection {
  point: Point;
  tA: number;
  tB: number;
  segA: number;
  segB: number;
  /**
   * `true` if this intersection lies on a shared-edge region — either
   * an endpoint of a coincident stretch or a sample inside one. Used
   * by `splitPathAtIntersections` to mark splits as `boundary`, which
   * `classifyByRingWalk` then treats as `'on'`. Solves §2.13 of the
   * audit.
   */
  boundary?: boolean;
}

/**
 * A coincident stretch where path A's segment overlaps path B's
 * segment along a shared geometric curve. Produced by intersection
 * detection (line-line collinear, arc-arc on same circle, line-curve
 * degenerate, or curve-curve coincident) alongside the regular point
 * intersections at the stretch's endpoints. `splitPathAtIntersections`
 * uses these to mark which splits lie inside a shared region; those
 * splits are classified `'on'` and `selectSegments` handles them per
 * boolean op (drop both for union/intersection/xor; drop both for
 * difference).
 */
interface SharedEdgeRange {
  segA: number;
  aStart: number;       // parametric range on A's original segment
  aEnd: number;
  segB: number;
  bStart: number;       // parametric range on B's original segment
  bEnd: number;
  /**
   * Whether A and B traverse the shared region in the same direction.
   * For two outlines with the same winding (e.g. both CW glyph
   * outlines) sharing an edge, this is typically `false` — the paths
   * traverse the shared edge in opposite directions because each
   * keeps its own interior on the same side of the boundary.
   */
  sameDirection: boolean;
}

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const GEOMETRIC_EPSILON = 1e-8;
const PARAMETRIC_EPSILON = 1e-10;
const BEZIER_CLIP_DEPTH = 60;
const BEZIER_CLIP_T_TOL = 1e-9;

// ─── Polynomial Solvers ─────────────────────────────────────────────────────

function clampT(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function isValidT(t: number): boolean {
  return t >= -PARAMETRIC_EPSILON && t <= 1 + PARAMETRIC_EPSILON;
}

function filterRoots(roots: number[]): number[] {
  const out: number[] = [];
  for (const r of roots) {
    if (isValidT(r)) out.push(clampT(r));
  }
  return out;
}

function solveQuadraticRoots(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < 1e-14) {
    if (Math.abs(b) < 1e-14) return [];
    return filterRoots([-c / b]);
  }
  const disc = b * b - 4 * a * c;
  if (disc < -1e-14) return [];
  if (disc < 0) {
    return filterRoots([-b / (2 * a)]);
  }
  const sq = Math.sqrt(disc);
  return filterRoots([(-b - sq) / (2 * a), (-b + sq) / (2 * a)]);
}

function solveCubicRoots(a: number, b: number, c: number, d: number): number[] {
  if (Math.abs(a) < 1e-14) return solveQuadraticRoots(b, c, d);

  // Normalize: t^3 + pt + q = 0 via depressed cubic
  const ba = b / a, ca = c / a, da = d / a;
  const p = ca - ba * ba / 3;
  const q = da - ba * ca / 3 + 2 * ba * ba * ba / 27;
  const disc = q * q / 4 + p * p * p / 27;
  const shift = -ba / 3;

  const roots: number[] = [];
  if (Math.abs(disc) < 1e-20) {
    if (Math.abs(p) < 1e-14 && Math.abs(q) < 1e-14) {
      roots.push(shift);
    } else {
      const u = Math.cbrt(-q / 2);
      roots.push(2 * u + shift, -u + shift);
    }
  } else if (disc > 0) {
    const sqD = Math.sqrt(disc);
    const u = Math.cbrt(-q / 2 + sqD);
    const v = Math.cbrt(-q / 2 - sqD);
    roots.push(u + v + shift);
  } else {
    const r = Math.sqrt(-p * p * p / 27);
    const theta = Math.acos(Math.max(-1, Math.min(1, -q / (2 * r))));
    const m = 2 * Math.cbrt(r);
    roots.push(
      m * Math.cos(theta / 3) + shift,
      m * Math.cos((theta + 2 * Math.PI) / 3) + shift,
      m * Math.cos((theta + 4 * Math.PI) / 3) + shift,
    );
  }
  return filterRoots(roots);
}

/** Quartic solver (Ferrari's method) — used for elliptical arc-arc intersections. */
export function solveQuarticRoots(a: number, b: number, c: number, d: number, e: number): number[] {
  if (Math.abs(a) < 1e-14) return solveCubicRoots(b, c, d, e);

  // Normalize
  const B = b / a, C = c / a, D = d / a, E = e / a;
  const p = C - 3 * B * B / 8;
  const q = D - B * C / 2 + B * B * B / 8;
  const r = E - B * D / 4 + B * B * C / 16 - 3 * B * B * B * B / 256;
  const shift = -B / 4;

  if (Math.abs(q) < 1e-14) {
    // Biquadratic
    const qRoots = solveQuadraticRoots(1, p, r);
    const roots: number[] = [];
    for (const u of qRoots) {
      if (u >= -1e-14) {
        const s = Math.sqrt(Math.max(0, u));
        roots.push(s + shift, -s + shift);
      }
    }
    return filterRoots(roots);
  }

  // Ferrari's resolvent cubic: y^3 - p*y - r = 0 where we solve for y using
  // 8*y^3 - 4*p*y - q^2 + ... — use the resolvent: u^3 + (5p/2)*u^2 + (2p^2-r)*u + (p^3/2 - p*r/2 - q^2/8)
  const cubicRoots = solveCubicRoots(
    1,
    5 * p / 2,
    2 * p * p - r,
    p * p * p / 2 - p * r / 2 - q * q / 8,
  );

  const roots: number[] = [];
  for (const y of cubicRoots) {
    const disc1 = 2 * y - p;
    if (disc1 < -1e-14) continue;
    const sq1 = Math.sqrt(Math.max(0, disc1));
    if (Math.abs(sq1) < 1e-14) continue;
    const sign = q < 0 ? 1 : -1;
    const r1 = solveQuadraticRoots(1, sign * sq1, y - sign * q / (2 * sq1));
    const r2 = solveQuadraticRoots(1, -sign * sq1, y + sign * q / (2 * sq1));
    for (const v of r1) roots.push(v + shift);
    for (const v of r2) roots.push(v + shift);
    break; // only need one resolvent root
  }
  return filterRoots(roots);
}

// ─── Geometry Helpers ───────────────────────────────────────────────────────

function ptEq(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < GEOMETRIC_EPSILON && Math.abs(a.y - b.y) < GEOMETRIC_EPSILON;
}

function dist(a: Point, b: Point): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPt(a: Point, b: Point, t: number): Point {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function cross2(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

// ─── Bezier Evaluation ─────────────────────────────────────────────────────

function evalCubic(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const s = 1 - t;
  const s2 = s * s, t2 = t * t;
  return {
    x: s2 * s * p0.x + 3 * s2 * t * p1.x + 3 * s * t2 * p2.x + t2 * t * p3.x,
    y: s2 * s * p0.y + 3 * s2 * t * p1.y + 3 * s * t2 * p2.y + t2 * t * p3.y,
  };
}

function evalQuadratic(p0: Point, p1: Point, p2: Point, t: number): Point {
  const s = 1 - t;
  return {
    x: s * s * p0.x + 2 * s * t * p1.x + t * t * p2.x,
    y: s * s * p0.y + 2 * s * t * p1.y + t * t * p2.y,
  };
}

function evalLine(p0: Point, p1: Point, t: number): Point {
  return lerpPt(p0, p1, t);
}

/** Evaluate point on command at parametric t. */
function evalCmd(cmd: TransformCmd, t: number): Point {
  const u = cmd.command.toLowerCase();
  const s = cmd.start, e = cmd.end;
  if (u === 'l' || u === 'h' || u === 'v' || u === 'z') {
    return evalLine(s, e, t);
  }
  if (u === 'c') {
    const [dx1, dy1, dx2, dy2] = cmd.args;
    const p1 = { x: s.x + dx1, y: s.y + dy1 };
    const p2 = { x: s.x + dx2, y: s.y + dy2 };
    return evalCubic(s, p1, p2, e, t);
  }
  if (u === 'q') {
    const [dx1, dy1] = cmd.args;
    const p1 = { x: s.x + dx1, y: s.y + dy1 };
    return evalQuadratic(s, p1, e, t);
  }
  if (u === 'a') {
    const center = cmdArcCenter(cmd);
    if (!center) return evalLine(s, e, t);
    return arcPointAt(center, t);
  }
  return evalLine(s, e, t);
}

// ─── Arc Helpers ────────────────────────────────────────────────────────────

function arcEndpointToCenter(
  x1: number, y1: number, rx: number, ry: number, phi: number,
  largeArc: number, sweep: number, x2: number, y2: number,
): ArcCenter | null {
  if (x1 === x2 && y1 === y2) return null;
  if (rx === 0 || ry === 0) return null;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);
  const dx2 = (x1 - x2) / 2, dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;
  let rxSq = rx * rx, rySq = ry * ry;
  const x1pSq = x1p * x1p, y1pSq = y1p * y1p;
  const lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) {
    const sl = Math.sqrt(lambda);
    rx *= sl; ry *= sl; rxSq = rx * rx; rySq = ry * ry;
  }
  const num = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq;
  const den = rxSq * y1pSq + rySq * x1pSq;
  const sign = largeArc !== sweep ? 1 : -1;
  const sq = sign * Math.sqrt(Math.max(num / den, 0));
  const cxp = sq * rx * y1p / ry;
  const cyp = -sq * ry * x1p / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  function vecAngle(ux: number, uy: number, vx: number, vy: number): number {
    const n = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    if (n === 0) return 0;
    const c = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / n));
    let a = Math.acos(c);
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  }
  const startAngle = vecAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let deltaAngle = vecAngle(
    (x1p - cxp) / rx, (y1p - cyp) / ry,
    (-x1p - cxp) / rx, (-y1p - cyp) / ry,
  );
  if (sweep === 0 && deltaAngle > 0) deltaAngle -= 2 * Math.PI;
  if (sweep !== 0 && deltaAngle < 0) deltaAngle += 2 * Math.PI;
  return { cx, cy, rx, ry, phi, startAngle, deltaAngle };
}

function arcPointAt(c: ArcCenter, t: number): Point {
  const angle = c.startAngle + t * c.deltaAngle;
  const cosPhi = Math.cos(c.phi), sinPhi = Math.sin(c.phi);
  const ex = c.rx * Math.cos(angle), ey = c.ry * Math.sin(angle);
  return { x: cosPhi * ex - sinPhi * ey + c.cx, y: sinPhi * ex + cosPhi * ey + c.cy };
}

function cmdArcCenter(cmd: TransformCmd): ArcCenter | null {
  const [rx, ry, rot, la, sw] = cmd.args;
  return arcEndpointToCenter(
    cmd.start.x, cmd.start.y, rx, ry, rot * Math.PI / 180,
    la, sw, cmd.end.x, cmd.end.y,
  );
}

// ─── Bounding Boxes ─────────────────────────────────────────────────────────

function bboxLine(p0: Point, p1: Point): BBox {
  return {
    minX: Math.min(p0.x, p1.x), minY: Math.min(p0.y, p1.y),
    maxX: Math.max(p0.x, p1.x), maxY: Math.max(p0.y, p1.y),
  };
}

function bboxCubic(p0: Point, p1: Point, p2: Point, p3: Point): BBox {
  let minX = Math.min(p0.x, p3.x), maxX = Math.max(p0.x, p3.x);
  let minY = Math.min(p0.y, p3.y), maxY = Math.max(p0.y, p3.y);
  // Extrema via derivative roots
  for (const coord of ['x', 'y'] as const) {
    const a = -3 * p0[coord] + 9 * p1[coord] - 9 * p2[coord] + 3 * p3[coord];
    const b = 6 * p0[coord] - 12 * p1[coord] + 6 * p2[coord];
    const c = -3 * p0[coord] + 3 * p1[coord];
    for (const t of solveQuadraticRoots(a, b, c)) {
      if (t > 0 && t < 1) {
        const v = evalCubic(p0, p1, p2, p3, t)[coord];
        if (coord === 'x') { minX = Math.min(minX, v); maxX = Math.max(maxX, v); }
        else { minY = Math.min(minY, v); maxY = Math.max(maxY, v); }
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

function bboxQuadratic(p0: Point, p1: Point, p2: Point): BBox {
  let minX = Math.min(p0.x, p2.x), maxX = Math.max(p0.x, p2.x);
  let minY = Math.min(p0.y, p2.y), maxY = Math.max(p0.y, p2.y);
  for (const coord of ['x', 'y'] as const) {
    const denom = p0[coord] - 2 * p1[coord] + p2[coord];
    if (Math.abs(denom) > 1e-14) {
      const t = (p0[coord] - p1[coord]) / denom;
      if (t > 0 && t < 1) {
        const v = evalQuadratic(p0, p1, p2, t)[coord];
        if (coord === 'x') { minX = Math.min(minX, v); maxX = Math.max(maxX, v); }
        else { minY = Math.min(minY, v); maxY = Math.max(maxY, v); }
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

function bboxArc(cmd: TransformCmd): BBox {
  const c = cmdArcCenter(cmd);
  if (!c) return bboxLine(cmd.start, cmd.end);
  // Sample at endpoints + extremal angles
  let minX = Math.min(cmd.start.x, cmd.end.x), maxX = Math.max(cmd.start.x, cmd.end.x);
  let minY = Math.min(cmd.start.y, cmd.end.y), maxY = Math.max(cmd.start.y, cmd.end.y);
  // Dense sampling to capture extrema
  for (let i = 1; i < 64; i++) {
    const t = i / 64;
    const pt = arcPointAt(c, t);
    minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
  }
  return { minX, minY, maxX, maxY };
}

function cmdBBox(cmd: TransformCmd): BBox {
  const u = cmd.command.toLowerCase();
  if (u === 'l' || u === 'h' || u === 'v' || u === 'z') {
    return bboxLine(cmd.start, cmd.end);
  }
  if (u === 'c') {
    const [dx1, dy1, dx2, dy2] = cmd.args;
    return bboxCubic(
      cmd.start,
      { x: cmd.start.x + dx1, y: cmd.start.y + dy1 },
      { x: cmd.start.x + dx2, y: cmd.start.y + dy2 },
      cmd.end,
    );
  }
  if (u === 'q') {
    const [dx1, dy1] = cmd.args;
    return bboxQuadratic(cmd.start, { x: cmd.start.x + dx1, y: cmd.start.y + dy1 }, cmd.end);
  }
  if (u === 'a') return bboxArc(cmd);
  return bboxLine(cmd.start, cmd.end);
}

function bboxOverlap(a: BBox, b: BBox): boolean {
  return a.maxX >= b.minX - GEOMETRIC_EPSILON && b.maxX >= a.minX - GEOMETRIC_EPSILON &&
         a.maxY >= b.minY - GEOMETRIC_EPSILON && b.maxY >= a.minY - GEOMETRIC_EPSILON;
}

// ─── Degree Elevation & Arc Approximation ───────────────────────────────────

/** Elevate quadratic Bezier to cubic. */
function quadToCubic(p0: Point, p1: Point, p2: Point): [Point, Point, Point, Point] {
  return [
    p0,
    { x: p0.x + 2 / 3 * (p1.x - p0.x), y: p0.y + 2 / 3 * (p1.y - p0.y) },
    { x: p2.x + 2 / 3 * (p1.x - p2.x), y: p2.y + 2 / 3 * (p1.y - p2.y) },
    p2,
  ];
}

function cmdQuadToCubicCmd(cmd: TransformCmd): TransformCmd {
  const [dx1, dy1] = cmd.args;
  const p0 = cmd.start;
  const p1 = { x: p0.x + dx1, y: p0.y + dy1 };
  const [, cp1, cp2,] = quadToCubic(p0, p1, cmd.end);
  return {
    command: 'c',
    args: [cp1.x - p0.x, cp1.y - p0.y, cp2.x - p0.x, cp2.y - p0.y, cmd.end.x - p0.x, cmd.end.y - p0.y],
    start: { ...cmd.start },
    end: { ...cmd.end },
  };
}

/** Approximate an arc as one or more cubic Bezier segments. */
function arcToCubics(cmd: TransformCmd): TransformCmd[] {
  const c = cmdArcCenter(cmd);
  if (!c) {
    // Degenerate arc — line segment
    return [{
      command: 'l',
      args: [cmd.end.x - cmd.start.x, cmd.end.y - cmd.start.y],
      start: { ...cmd.start }, end: { ...cmd.end },
    }];
  }
  // Split arc into segments of at most PI/2
  const nSegs = Math.max(1, Math.ceil(Math.abs(c.deltaAngle) / (Math.PI / 2)));
  const result: TransformCmd[] = [];
  for (let i = 0; i < nSegs; i++) {
    const t0 = i / nSegs, t1 = (i + 1) / nSegs;
    const a0 = c.startAngle + t0 * c.deltaAngle;
    const a1 = c.startAngle + t1 * c.deltaAngle;
    const da = a1 - a0;
    const alpha = Math.sin(da) * (Math.sqrt(4 + 3 * Math.tan(da / 2) * Math.tan(da / 2)) - 1) / 3;

    const cosPhi = Math.cos(c.phi), sinPhi = Math.sin(c.phi);
    const cosA0 = Math.cos(a0), sinA0 = Math.sin(a0);
    const cosA1 = Math.cos(a1), sinA1 = Math.sin(a1);

    const x0 = cosPhi * c.rx * cosA0 - sinPhi * c.ry * sinA0 + c.cx;
    const y0 = sinPhi * c.rx * cosA0 + cosPhi * c.ry * sinA0 + c.cy;
    const x3 = cosPhi * c.rx * cosA1 - sinPhi * c.ry * sinA1 + c.cx;
    const y3 = sinPhi * c.rx * cosA1 + cosPhi * c.ry * sinA1 + c.cy;

    const dx0 = -c.rx * sinA0, dy0 = c.ry * cosA0;
    const dx1a = -c.rx * sinA1, dy1a = c.ry * cosA1;

    const tx0 = cosPhi * dx0 - sinPhi * dy0;
    const ty0 = sinPhi * dx0 + cosPhi * dy0;
    const tx1 = cosPhi * dx1a - sinPhi * dy1a;
    const ty1 = sinPhi * dx1a + cosPhi * dy1a;

    const cp1x = x0 + alpha * tx0;
    const cp1y = y0 + alpha * ty0;
    const cp2x = x3 - alpha * tx1;
    const cp2y = y3 - alpha * ty1;

    const s = { x: x0, y: y0 };
    const e = { x: x3, y: y3 };
    result.push({
      command: 'c',
      args: [cp1x - x0, cp1y - y0, cp2x - x0, cp2y - y0, x3 - x0, y3 - y0],
      start: s, end: e,
    });
  }
  return result;
}

// ─── Command to control points ──────────────────────────────────────────────

function cmdIsLine(cmd: TransformCmd): boolean {
  const u = cmd.command.toLowerCase();
  return u === 'l' || u === 'h' || u === 'v' || u === 'z';
}

function cmdCubicPts(cmd: TransformCmd): [Point, Point, Point, Point] {
  const [dx1, dy1, dx2, dy2] = cmd.args;
  const p0 = cmd.start;
  return [p0, { x: p0.x + dx1, y: p0.y + dy1 }, { x: p0.x + dx2, y: p0.y + dy2 }, cmd.end];
}

function cmdQuadPts(cmd: TransformCmd): [Point, Point, Point] {
  const [dx1, dy1] = cmd.args;
  const p0 = cmd.start;
  return [p0, { x: p0.x + dx1, y: p0.y + dy1 }, cmd.end];
}

// ─── Pairwise Intersection: Line-Line ───────────────────────────────────────

function intersectLineLine(
  a0: Point, a1: Point, b0: Point, b1: Point,
): { tA: number; tB: number; point: Point }[] {
  const dax = a1.x - a0.x, day = a1.y - a0.y;
  const dbx = b1.x - b0.x, dby = b1.y - b0.y;
  const denom = cross2(dax, day, dbx, dby);
  if (Math.abs(denom) < 1e-14) return []; // parallel / collinear
  const dx = b0.x - a0.x, dy = b0.y - a0.y;
  const tA = cross2(dx, dy, dbx, dby) / denom;
  const tB = cross2(dx, dy, dax, day) / denom;
  if (!isValidT(tA) || !isValidT(tB)) return [];
  return [{ tA: clampT(tA), tB: clampT(tB), point: evalLine(a0, a1, clampT(tA)) }];
}

/**
 * Detect a shared (collinear, overlapping) region between two line
 * segments. Returns the parametric overlap range on each segment plus
 * direction-of-travel agreement, or `null` if the segments are not
 * collinear or don't overlap.
 *
 * Two line segments share a stretch when:
 *   1. They lie on the same infinite line (b0, b1 within line-distance
 *      `1e-8` of A's line and direction is parallel/anti-parallel)
 *   2. Their parametric ranges projected onto the shared line overlap
 *      with positive measure (range > `1e-8`)
 *
 * Used by §2.13 (shared-edge first-class) — the regular
 * `intersectLineLine` returns an empty array for collinear inputs and
 * never produces splits along the shared region. This detector
 * supplies the missing `SharedEdgeRange` for downstream consumption.
 */
function detectSharedEdge_LineLine(
  a0: Point, a1: Point, b0: Point, b1: Point,
): { aStart: number; aEnd: number; bStart: number; bEnd: number; sameDirection: boolean } | null {
  const dax = a1.x - a0.x, day = a1.y - a0.y;
  const dbx = b1.x - b0.x, dby = b1.y - b0.y;
  const lenA2 = dax * dax + day * day;
  const lenB2 = dbx * dbx + dby * dby;
  if (lenA2 < 1e-20 || lenB2 < 1e-20) return null; // degenerate

  // Are the two lines collinear? Check that b0 and b1 both lie on A's line.
  const lenA = Math.sqrt(lenA2);
  const lenB = Math.sqrt(lenB2);
  const nax = -day / lenA, nay = dax / lenA; // unit normal to A
  const COLLINEAR_TOL = 1e-7;
  const dist0 = Math.abs((b0.x - a0.x) * nax + (b0.y - a0.y) * nay);
  const dist1 = Math.abs((b1.x - a0.x) * nax + (b1.y - a0.y) * nay);
  if (dist0 > COLLINEAR_TOL || dist1 > COLLINEAR_TOL) return null;

  // Project B's endpoints onto A's parametric range.
  const tB0_onA = ((b0.x - a0.x) * dax + (b0.y - a0.y) * day) / lenA2;
  const tB1_onA = ((b1.x - a0.x) * dax + (b1.y - a0.y) * day) / lenA2;
  let aStart = Math.max(0, Math.min(tB0_onA, tB1_onA));
  let aEnd = Math.min(1, Math.max(tB0_onA, tB1_onA));
  if (aEnd - aStart <= 1e-8) return null; // no overlap

  // Project A's endpoints onto B's parametric range.
  const tA0_onB = ((a0.x - b0.x) * dbx + (a0.y - b0.y) * dby) / lenB2;
  const tA1_onB = ((a1.x - b0.x) * dbx + (a1.y - b0.y) * dby) / lenB2;
  let bStart = Math.max(0, Math.min(tA0_onB, tA1_onB));
  let bEnd = Math.min(1, Math.max(tA0_onB, tA1_onB));
  if (bEnd - bStart <= 1e-8) return null;

  // (Earlier iter-3d-en attempts snapped near-vertex shared-range
  // endpoints to {0, 1} here. That snap is REMOVED — it incorrectly
  // collapsed real geometry on the longer side into the shared
  // region. Concretely for Libre Bask UPPER EN tracking 0.5: A.seg26
  // started at (57.04, 0) but B.seg9 started at (56.72, 0); the
  // 0.32px "overhang" on A from (57.04, 0) to (56.72, 0) is real A
  // outline that must remain in A's runs. Snapping made the snap
  // expand A's shared range to include the overhang, dropping it
  // from A. The downstream run[1] then chained to a phantom endpoint
  // that B couldn't match → unmatched at link assembly → standalone
  // contour = wedge artifact. The asymmetry is GEOMETRIC, not a
  // float-noise artifact; keep both sides' shared ranges as projected.
  // Asymmetric run counts at link assembly are handled correctly when
  // the overhang is classified by ring-walk like any other split. §2.13. */
  const sameDirection = (dax * dbx + day * dby) > 0;
  return { aStart, aEnd, bStart, bEnd, sameDirection };
}

// ─── Pairwise Intersection: Line-Cubic ──────────────────────────────────────

function intersectLineCubic(
  l0: Point, l1: Point, p0: Point, p1: Point, p2: Point, p3: Point,
): { tA: number; tB: number; point: Point }[] {
  // Project cubic onto line normal
  const dx = l1.x - l0.x, dy = l1.y - l0.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-20) return [];

  // Normal direction: (-dy, dx)
  // Signed distance of cubic control points from line
  const nx = -dy, ny = dx;
  const d0 = nx * (p0.x - l0.x) + ny * (p0.y - l0.y);
  const d1 = nx * (p1.x - l0.x) + ny * (p1.y - l0.y);
  const d2 = nx * (p2.x - l0.x) + ny * (p2.y - l0.y);
  const d3 = nx * (p3.x - l0.x) + ny * (p3.y - l0.y);

  // Cubic in Bernstein form: d(t) = d0*(1-t)^3 + 3*d1*t*(1-t)^2 + 3*d2*t^2*(1-t) + d3*t^3 = 0
  // Convert to power form: a*t^3 + b*t^2 + c*t + d = 0
  const a = -d0 + 3 * d1 - 3 * d2 + d3;
  const b = 3 * d0 - 6 * d1 + 3 * d2;
  const c = -3 * d0 + 3 * d1;
  const dd = d0;

  const tBs = solveCubicRoots(a, b, c, dd);
  const results: { tA: number; tB: number; point: Point }[] = [];
  for (const tB of tBs) {
    const pt = evalCubic(p0, p1, p2, p3, tB);
    // Project onto line to get tA
    const tA = (dx * (pt.x - l0.x) + dy * (pt.y - l0.y)) / len2;
    if (isValidT(tA)) {
      results.push({ tA: clampT(tA), tB: clampT(tB), point: pt });
    }
  }
  return results;
}

// ─── Pairwise Intersection: Line-Quadratic ──────────────────────────────────

function intersectLineQuadratic(
  l0: Point, l1: Point, p0: Point, p1: Point, p2: Point,
): { tA: number; tB: number; point: Point }[] {
  const dx = l1.x - l0.x, dy = l1.y - l0.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-20) return [];
  const nx = -dy, ny = dx;
  const d0 = nx * (p0.x - l0.x) + ny * (p0.y - l0.y);
  const d1 = nx * (p1.x - l0.x) + ny * (p1.y - l0.y);
  const d2 = nx * (p2.x - l0.x) + ny * (p2.y - l0.y);

  // Quadratic Bernstein: d0*(1-t)^2 + 2*d1*t*(1-t) + d2*t^2 = 0
  const a = d0 - 2 * d1 + d2;
  const b = -2 * d0 + 2 * d1;
  const c = d0;

  const tBs = solveQuadraticRoots(a, b, c);
  const results: { tA: number; tB: number; point: Point }[] = [];
  for (const tB of tBs) {
    const pt = evalQuadratic(p0, p1, p2, tB);
    const tA = (dx * (pt.x - l0.x) + dy * (pt.y - l0.y)) / len2;
    if (isValidT(tA)) {
      results.push({ tA: clampT(tA), tB: clampT(tB), point: pt });
    }
  }
  return results;
}

// ─── Pairwise Intersection: Line-Arc ────────────────────────────────────────

function intersectLineArc(
  l0: Point, l1: Point, cmd: TransformCmd,
): { tA: number; tB: number; point: Point }[] {
  const c = cmdArcCenter(cmd);
  if (!c) return intersectLineLine(l0, l1, cmd.start, cmd.end);

  // Transform line into ellipse-local coordinates (unrotate and scale to unit circle)
  const cosPhi = Math.cos(-c.phi), sinPhi = Math.sin(-c.phi);
  const arcCx = c.cx, arcCy = c.cy, arcRx = c.rx, arcRy = c.ry;
  function toLocal(p: Point): Point {
    const dx = p.x - arcCx, dy = p.y - arcCy;
    return { x: (cosPhi * dx + sinPhi * dy) / arcRx, y: (-sinPhi * dx + cosPhi * dy) / arcRy };
  }

  const ll0 = toLocal(l0), ll1 = toLocal(l1);
  const dx = ll1.x - ll0.x, dy = ll1.y - ll0.y;
  const a = dx * dx + dy * dy;
  const b = 2 * (ll0.x * dx + ll0.y * dy);
  const cc = ll0.x * ll0.x + ll0.y * ll0.y - 1;

  const tAs = solveQuadraticRoots(a, b, cc);
  const results: { tA: number; tB: number; point: Point }[] = [];
  for (const tA of tAs) {
    const pt = evalLine(l0, l1, tA);
    // Find the angle and check if it's on the arc
    const tB = arcTForPoint(c, pt);
    if (tB !== null && isValidT(tB)) {
      results.push({ tA: clampT(tA), tB: clampT(tB), point: pt });
    }
  }
  return results;
}

/** Given an arc center parameterization and a point known to lie on the ellipse,
    find the parametric t (0..1) along the arc, or null if not on the arc segment. */
function arcTForPoint(c: ArcCenter, pt: Point): number | null {
  const cosPhi = Math.cos(-c.phi), sinPhi = Math.sin(-c.phi);
  const dx = pt.x - c.cx, dy = pt.y - c.cy;
  const lx = cosPhi * dx + sinPhi * dy;
  const ly = -sinPhi * dx + cosPhi * dy;
  let angle = Math.atan2(ly / c.ry, lx / c.rx);
  // Normalize relative to startAngle
  let t = (angle - c.startAngle) / c.deltaAngle;
  // Handle angle wrapping
  if (t < -PARAMETRIC_EPSILON) {
    angle += c.deltaAngle > 0 ? 2 * Math.PI : -2 * Math.PI;
    t = (angle - c.startAngle) / c.deltaAngle;
  }
  if (t > 1 + PARAMETRIC_EPSILON) {
    angle -= c.deltaAngle > 0 ? 2 * Math.PI : -2 * Math.PI;
    t = (angle - c.startAngle) / c.deltaAngle;
  }
  if (t >= -PARAMETRIC_EPSILON && t <= 1 + PARAMETRIC_EPSILON) return clampT(t);
  return null;
}

// ─── Pairwise Intersection: Cubic-Cubic (Bezier Clipping) ───────────────────

function intersectCubicCubic(
  a0: Point, a1: Point, a2: Point, a3: Point,
  b0: Point, b1: Point, b2: Point, b3: Point,
): { tA: number; tB: number; point: Point }[] {
  // Coincidence guard: identical (or reversed) control polygons cause
  // bezierClipRecurse to never converge — its "poor convergence"
  // branch spawns 4 sub-calls that all overlap, blowing the recursion
  // depth and the heap. When the curves coincide, the discrete-
  // intersection set is degenerate (every point is a "match"); the
  // shared-edge detector handles them via §2.13. Return only the
  // boundary intersections (endpoints) here so downstream splitting
  // and shared-edge promotion still work. §2.13.
  const PT_TOL = 1e-7;
  const same = (p: Point, q: Point) =>
    Math.abs(p.x - q.x) < PT_TOL && Math.abs(p.y - q.y) < PT_TOL;
  const sameForward = same(a0, b0) && same(a1, b1) && same(a2, b2) && same(a3, b3);
  const sameReverse = same(a0, b3) && same(a1, b2) && same(a2, b1) && same(a3, b0);
  if (sameForward || sameReverse) {
    return [
      { tA: 0, tB: sameForward ? 0 : 1, point: { ...a0 } },
      { tA: 1, tB: sameForward ? 1 : 0, point: { ...a3 } },
    ];
  }

  const results: { tA: number; tB: number; point: Point }[] = [];
  bezierClipRecurse(
    a0, a1, a2, a3, 0, 1,
    b0, b1, b2, b3, 0, 1,
    results, 0,
  );
  return dedupeIntersections(results);
}

function bezierClipRecurse(
  a0: Point, a1: Point, a2: Point, a3: Point, tAMin: number, tAMax: number,
  b0: Point, b1: Point, b2: Point, b3: Point, tBMin: number, tBMax: number,
  results: { tA: number; tB: number; point: Point }[],
  depth: number,
): void {
  if (depth > BEZIER_CLIP_DEPTH) return;

  // Bounding box rejection
  const bbA = bboxCubic(a0, a1, a2, a3);
  const bbB = bboxCubic(b0, b1, b2, b3);
  if (!bboxOverlap(bbA, bbB)) return;

  const dA = tAMax - tAMin, dB = tBMax - tBMin;
  if (dA < BEZIER_CLIP_T_TOL && dB < BEZIER_CLIP_T_TOL) {
    const tA = (tAMin + tAMax) / 2;
    const tB = (tBMin + tBMax) / 2;
    const pt = evalCubic(a0, a1, a2, a3, 0.5);
    // Recompute in original parameter space
    results.push({ tA, tB, point: pt });
    return;
  }

  // Clip B against A's fat line
  const dists = fatLineDistances(b0, b1, b2, b3, a0, a3);
  const dmin = Math.min(0, ...dists);
  const dmax = Math.max(0, ...dists);

  // Convex hull clipping
  const clipResult = clipToFatLine(dists, dmin, dmax);
  if (!clipResult) return; // no intersection
  let [clipMin, clipMax] = clipResult;

  if (clipMax - clipMin > 0.8 * dB / (tBMax - tBMin || 1)) {
    // Poor convergence — subdivide
    const tAMid = (tAMin + tAMax) / 2;
    const [a0L, a1L, a2L, a3L] = subdivideCubic(a0, a1, a2, a3, 0.5);
    const [a0R, a1R, a2R, a3R] = subdivideCubicRight(a0, a1, a2, a3, 0.5);
    const tBMid = (tBMin + tBMax) / 2;
    const [b0L, b1L, b2L, b3L] = subdivideCubic(b0, b1, b2, b3, 0.5);
    const [b0R, b1R, b2R, b3R] = subdivideCubicRight(b0, b1, b2, b3, 0.5);

    bezierClipRecurse(a0L, a1L, a2L, a3L, tAMin, tAMid, b0L, b1L, b2L, b3L, tBMin, tBMid, results, depth + 1);
    bezierClipRecurse(a0L, a1L, a2L, a3L, tAMin, tAMid, b0R, b1R, b2R, b3R, tBMid, tBMax, results, depth + 1);
    bezierClipRecurse(a0R, a1R, a2R, a3R, tAMid, tAMax, b0L, b1L, b2L, b3L, tBMin, tBMid, results, depth + 1);
    bezierClipRecurse(a0R, a1R, a2R, a3R, tAMid, tAMax, b0R, b1R, b2R, b3R, tBMid, tBMax, results, depth + 1);
    return;
  }

  // Narrow the B range
  const newTBMin = tBMin + clipMin * (tBMax - tBMin);
  const newTBMax = tBMin + clipMax * (tBMax - tBMin);

  // Subdivide B to new range, then swap roles
  const subB = subdivideCubicRange(b0, b1, b2, b3, clipMin, clipMax);
  bezierClipRecurse(
    subB[0], subB[1], subB[2], subB[3], newTBMin, newTBMax,
    a0, a1, a2, a3, tAMin, tAMax,
    results, depth + 1,
  );
}

function fatLineDistances(
  b0: Point, b1: Point, b2: Point, b3: Point,
  a0: Point, a3: Point,
): [number, number, number, number] {
  const dx = a3.x - a0.x, dy = a3.y - a0.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-14) {
    // Degenerate: use perpendicular distance from point
    return [
      dist(b0, a0), dist(b1, a0), dist(b2, a0), dist(b3, a0),
    ];
  }
  const nx = dy / len, ny = -dx / len;
  const base = nx * a0.x + ny * a0.y;
  return [
    nx * b0.x + ny * b0.y - base,
    nx * b1.x + ny * b1.y - base,
    nx * b2.x + ny * b2.y - base,
    nx * b3.x + ny * b3.y - base,
  ];
}

function clipToFatLine(
  dists: [number, number, number, number],
  dmin: number, dmax: number,
): [number, number] | null {
  // Build convex hull of (t_i, d_i) for t=0, 1/3, 2/3, 1
  // and clip against d=dmin and d=dmax
  const pts: [number, number][] = [
    [0, dists[0]], [1 / 3, dists[1]], [2 / 3, dists[2]], [1, dists[3]],
  ];

  let tMin = 1, tMax = 0;

  // Clip against d=dmin (lower bound)
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const [t1, d1] = pts[i], [t2, d2] = pts[j];
      // Find t where the line between these two points crosses d=dmin
      if ((d1 - dmin) * (d2 - dmin) <= 0) {
        const dd = d2 - d1;
        const t = Math.abs(dd) < 1e-14 ? t1 : t1 + (dmin - d1) * (t2 - t1) / dd;
        tMin = Math.min(tMin, Math.max(0, Math.min(1, t)));
        tMax = Math.max(tMax, Math.max(0, Math.min(1, t)));
      }
      // Clip against d=dmax (upper bound)
      if ((d1 - dmax) * (d2 - dmax) <= 0) {
        const dd = d2 - d1;
        const t = Math.abs(dd) < 1e-14 ? t1 : t1 + (dmax - d1) * (t2 - t1) / dd;
        tMin = Math.min(tMin, Math.max(0, Math.min(1, t)));
        tMax = Math.max(tMax, Math.max(0, Math.min(1, t)));
      }
    }
  }

  // Include points that are inside the band
  for (const [t, d] of pts) {
    if (d >= dmin - GEOMETRIC_EPSILON && d <= dmax + GEOMETRIC_EPSILON) {
      tMin = Math.min(tMin, t);
      tMax = Math.max(tMax, t);
    }
  }

  if (tMin > tMax) return null;
  return [Math.max(0, tMin), Math.min(1, tMax)];
}

function subdivideCubic(
  p0: Point, p1: Point, p2: Point, p3: Point, t: number,
): [Point, Point, Point, Point] {
  const p01 = lerpPt(p0, p1, t);
  const p12 = lerpPt(p1, p2, t);
  const p23 = lerpPt(p2, p3, t);
  const p012 = lerpPt(p01, p12, t);
  const p123 = lerpPt(p12, p23, t);
  const mid = lerpPt(p012, p123, t);
  return [p0, p01, p012, mid];
}

function subdivideCubicRight(
  p0: Point, p1: Point, p2: Point, p3: Point, t: number,
): [Point, Point, Point, Point] {
  const p01 = lerpPt(p0, p1, t);
  const p12 = lerpPt(p1, p2, t);
  const p23 = lerpPt(p2, p3, t);
  const p012 = lerpPt(p01, p12, t);
  const p123 = lerpPt(p12, p23, t);
  const mid = lerpPt(p012, p123, t);
  return [mid, p123, p23, p3];
}

function subdivideCubicRange(
  p0: Point, p1: Point, p2: Point, p3: Point,
  tMin: number, tMax: number,
): [Point, Point, Point, Point] {
  if (tMin <= 0 && tMax >= 1) return [p0, p1, p2, p3];
  // Get the right half at tMin, then left half at adjusted tMax
  const right = subdivideCubicRight(p0, p1, p2, p3, tMin);
  const adjustedT = tMax <= tMin ? 1 : (tMax - tMin) / (1 - tMin);
  return subdivideCubic(right[0], right[1], right[2], right[3], Math.min(1, adjustedT));
}

// ─── Arc-Arc Intersection ───────────────────────────────────────────────────

function intersectArcArc(
  cmdA: TransformCmd, cmdB: TransformCmd,
): { tA: number; tB: number; point: Point }[] {
  const cA = cmdArcCenter(cmdA);
  const cB = cmdArcCenter(cmdB);
  if (!cA) {
    if (!cB) return intersectLineLine(cmdA.start, cmdA.end, cmdB.start, cmdB.end);
    return intersectLineArc(cmdA.start, cmdA.end, cmdB);
  }
  if (!cB) return intersectLineArc(cmdB.start, cmdB.end, cmdA).map(r => ({ tA: r.tB, tB: r.tA, point: r.point }));

  // Both are real arcs. For circular arcs (rx ≈ ry, no rotation), use geometric formula.
  const isCircA = Math.abs(cA.rx - cA.ry) < GEOMETRIC_EPSILON && Math.abs(cA.phi) < GEOMETRIC_EPSILON;
  const isCircB = Math.abs(cB.rx - cB.ry) < GEOMETRIC_EPSILON && Math.abs(cB.phi) < GEOMETRIC_EPSILON;

  if (isCircA && isCircB) {
    return intersectCircleCircle(cA, cB);
  }

  // General elliptical arcs: approximate both as cubics and find intersections
  return intersectViaApprox(cmdA, cmdB);
}

/**
 * Find overlap boundary points for arcs on the same circle.
 * When two arcs share the same underlying circle, they don't have discrete
 * intersection points — but we need to report where one arc's endpoints
 * fall within the other arc's angular range so the segments can be split
 * at the overlap boundaries.
 */
function coincidentArcIntersections(
  cA: ArcCenter, cB: ArcCenter,
): { tA: number; tB: number; point: Point }[] {
  const results: { tA: number; tB: number; point: Point }[] = [];

  // Check if B's start lies within A's angular range
  const bStart = arcPointAt(cB, 0);
  const tA_bStart = arcTForPoint(cA, bStart);
  if (tA_bStart !== null) {
    results.push({ tA: tA_bStart, tB: 0, point: bStart });
  }

  // Check if B's end lies within A's angular range
  const bEnd = arcPointAt(cB, 1);
  const tA_bEnd = arcTForPoint(cA, bEnd);
  if (tA_bEnd !== null) {
    results.push({ tA: tA_bEnd, tB: 1, point: bEnd });
  }

  // Check if A's start lies within B's angular range
  const aStart = arcPointAt(cA, 0);
  const tB_aStart = arcTForPoint(cB, aStart);
  if (tB_aStart !== null) {
    results.push({ tA: 0, tB: tB_aStart, point: aStart });
  }

  // Check if A's end lies within B's angular range
  const aEnd = arcPointAt(cA, 1);
  const tB_aEnd = arcTForPoint(cB, aEnd);
  if (tB_aEnd !== null) {
    results.push({ tA: 1, tB: tB_aEnd, point: aEnd });
  }

  return dedupeIntersections(results);
}

function intersectCircleCircle(
  cA: ArcCenter, cB: ArcCenter,
): { tA: number; tB: number; point: Point }[] {
  const dx = cB.cx - cA.cx, dy = cB.cy - cA.cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  const rA = cA.rx, rB = cB.rx;

  // Coincident circles: same center, same radius — find overlap boundaries
  if (d < GEOMETRIC_EPSILON && Math.abs(rA - rB) < GEOMETRIC_EPSILON) {
    return coincidentArcIntersections(cA, cB);
  }

  if (d > rA + rB + GEOMETRIC_EPSILON || d < Math.abs(rA - rB) - GEOMETRIC_EPSILON || d < GEOMETRIC_EPSILON) {
    return [];
  }

  const a = (rA * rA - rB * rB + d * d) / (2 * d);
  const hSq = rA * rA - a * a;
  const h = Math.sqrt(Math.max(0, hSq));

  const mx = cA.cx + a * dx / d;
  const my = cA.cy + a * dy / d;

  const pts: Point[] = [];
  if (h < GEOMETRIC_EPSILON) {
    pts.push({ x: mx, y: my });
  } else {
    pts.push(
      { x: mx + h * dy / d, y: my - h * dx / d },
      { x: mx - h * dy / d, y: my + h * dx / d },
    );
  }

  const results: { tA: number; tB: number; point: Point }[] = [];
  for (const pt of pts) {
    const tA = arcTForPoint(cA, pt);
    const tB = arcTForPoint(cB, pt);
    if (tA !== null && tB !== null) {
      results.push({ tA, tB, point: pt });
    }
  }
  return results;
}

/** Approximate both curves as cubics and intersect, then refine with Newton-Raphson. */
function intersectViaApprox(
  cmdA: TransformCmd, cmdB: TransformCmd,
): { tA: number; tB: number; point: Point }[] {
  const cubicsA = arcToCubics(cmdA);
  const cubicsB = arcToCubics(cmdB);
  const nA = cubicsA.length, nB = cubicsB.length;

  const rawResults: { tA: number; tB: number; point: Point }[] = [];

  for (let ia = 0; ia < nA; ia++) {
    const ca = cubicsA[ia];
    const [ca0, ca1, ca2, ca3] = cmdCubicPts(ca);
    for (let ib = 0; ib < nB; ib++) {
      const cb = cubicsB[ib];
      const [cb0, cb1, cb2, cb3] = cmdCubicPts(cb);
      const hits = intersectCubicCubic(ca0, ca1, ca2, ca3, cb0, cb1, cb2, cb3);
      for (const hit of hits) {
        // Map t back to original arc parameter
        const tA = (ia + hit.tA) / nA;
        const tB = (ib + hit.tB) / nB;
        rawResults.push({ tA, tB, point: hit.point });
      }
    }
  }

  // Refine with Newton-Raphson on the original arc parameterizations
  const refined: { tA: number; tB: number; point: Point }[] = [];
  for (const r of rawResults) {
    const nr = newtonRefineArcArc(cmdA, cmdB, r.tA, r.tB);
    if (nr) refined.push(nr);
  }

  return dedupeIntersections(refined);
}

function newtonRefineArcArc(
  cmdA: TransformCmd, cmdB: TransformCmd, tA0: number, tB0: number,
  maxIter = 10,
): { tA: number; tB: number; point: Point } | null {
  let tA = tA0, tB = tB0;
  for (let i = 0; i < maxIter; i++) {
    const pA = evalCmd(cmdA, tA);
    const pB = evalCmd(cmdB, tB);
    const ex = pA.x - pB.x, ey = pA.y - pB.y;
    if (Math.abs(ex) < GEOMETRIC_EPSILON && Math.abs(ey) < GEOMETRIC_EPSILON) {
      if (isValidT(tA) && isValidT(tB)) {
        return { tA: clampT(tA), tB: clampT(tB), point: pA };
      }
      return null;
    }
    // Numerical derivatives
    const dt = 1e-7;
    const pAdtx = evalCmd(cmdA, Math.min(1, tA + dt)).x - pA.x;
    const pAdty = evalCmd(cmdA, Math.min(1, tA + dt)).y - pA.y;
    const pBdtx = evalCmd(cmdB, Math.min(1, tB + dt)).x - pB.x;
    const pBdty = evalCmd(cmdB, Math.min(1, tB + dt)).y - pB.y;
    // Jacobian: [dAdtx/dt, -dBdtx/dt; dAdty/dt, -dBdty/dt]
    const j00 = pAdtx / dt, j01 = -pBdtx / dt;
    const j10 = pAdty / dt, j11 = -pBdty / dt;
    const det = j00 * j11 - j01 * j10;
    if (Math.abs(det) < 1e-20) break;
    const dtA = (j11 * ex - j01 * ey) / det;
    const dtB = (-j10 * ex + j00 * ey) / det;
    tA -= dtA;
    tB -= dtB;
  }
  const pA = evalCmd(cmdA, clampT(tA));
  const pB = evalCmd(cmdB, clampT(tB));
  if (dist(pA, pB) < GEOMETRIC_EPSILON * 100 && isValidT(tA) && isValidT(tB)) {
    return { tA: clampT(tA), tB: clampT(tB), point: pA };
  }
  return null;
}

// ─── Pairwise Intersection Dispatch ─────────────────────────────────────────

function pairwiseIntersect(
  cmdA: TransformCmd, cmdB: TransformCmd,
): { tA: number; tB: number; point: Point }[] {
  const bbA = cmdBBox(cmdA);
  const bbB = cmdBBox(cmdB);
  if (!bboxOverlap(bbA, bbB)) return [];

  const uA = cmdA.command.toLowerCase();
  const uB = cmdB.command.toLowerCase();
  const lineA = cmdIsLine(cmdA);
  const lineB = cmdIsLine(cmdB);

  if (lineA && lineB) {
    return intersectLineLine(cmdA.start, cmdA.end, cmdB.start, cmdB.end);
  }

  if (lineA && uB === 'c') {
    const [b0, b1, b2, b3] = cmdCubicPts(cmdB);
    return intersectLineCubic(cmdA.start, cmdA.end, b0, b1, b2, b3);
  }
  if (uA === 'c' && lineB) {
    const [a0, a1, a2, a3] = cmdCubicPts(cmdA);
    return intersectLineCubic(cmdB.start, cmdB.end, a0, a1, a2, a3)
      .map(r => ({ tA: r.tB, tB: r.tA, point: r.point }));
  }

  if (lineA && uB === 'q') {
    const [b0, b1, b2] = cmdQuadPts(cmdB);
    return intersectLineQuadratic(cmdA.start, cmdA.end, b0, b1, b2);
  }
  if (uA === 'q' && lineB) {
    const [a0, a1, a2] = cmdQuadPts(cmdA);
    return intersectLineQuadratic(cmdB.start, cmdB.end, a0, a1, a2)
      .map(r => ({ tA: r.tB, tB: r.tA, point: r.point }));
  }

  if (lineA && uB === 'a') {
    return intersectLineArc(cmdA.start, cmdA.end, cmdB);
  }
  if (uA === 'a' && lineB) {
    return intersectLineArc(cmdB.start, cmdB.end, cmdA)
      .map(r => ({ tA: r.tB, tB: r.tA, point: r.point }));
  }

  if (uA === 'c' && uB === 'c') {
    const [a0, a1, a2, a3] = cmdCubicPts(cmdA);
    const [b0, b1, b2, b3] = cmdCubicPts(cmdB);
    return intersectCubicCubic(a0, a1, a2, a3, b0, b1, b2, b3);
  }

  if (uA === 'q' && uB === 'q') {
    // Elevate both to cubic
    const cA = cmdQuadToCubicCmd(cmdA);
    const cB = cmdQuadToCubicCmd(cmdB);
    const [a0, a1, a2, a3] = cmdCubicPts(cA);
    const [b0, b1, b2, b3] = cmdCubicPts(cB);
    return intersectCubicCubic(a0, a1, a2, a3, b0, b1, b2, b3);
  }

  if (uA === 'c' && uB === 'q') {
    const cB = cmdQuadToCubicCmd(cmdB);
    const [a0, a1, a2, a3] = cmdCubicPts(cmdA);
    const [b0, b1, b2, b3] = cmdCubicPts(cB);
    return intersectCubicCubic(a0, a1, a2, a3, b0, b1, b2, b3);
  }
  if (uA === 'q' && uB === 'c') {
    const cA = cmdQuadToCubicCmd(cmdA);
    const [a0, a1, a2, a3] = cmdCubicPts(cA);
    const [b0, b1, b2, b3] = cmdCubicPts(cmdB);
    return intersectCubicCubic(a0, a1, a2, a3, b0, b1, b2, b3);
  }

  if (uA === 'a' && uB === 'a') {
    return intersectArcArc(cmdA, cmdB);
  }

  // Cubic-Arc
  if (uA === 'c' && uB === 'a') {
    return intersectCubicArc(cmdA, cmdB);
  }
  if (uA === 'a' && uB === 'c') {
    return intersectCubicArc(cmdB, cmdA)
      .map(r => ({ tA: r.tB, tB: r.tA, point: r.point }));
  }

  // Quad-Arc: elevate quad to cubic, use cubic-arc
  if (uA === 'q' && uB === 'a') {
    return intersectCubicArc(cmdQuadToCubicCmd(cmdA), cmdB);
  }
  if (uA === 'a' && uB === 'q') {
    return intersectCubicArc(cmdQuadToCubicCmd(cmdB), cmdA)
      .map(r => ({ tA: r.tB, tB: r.tA, point: r.point }));
  }

  // Fallback: approximate both as cubics
  return intersectViaApprox(cmdA, cmdB);
}

function intersectCubicArc(
  cubicCmd: TransformCmd, arcCmd: TransformCmd,
): { tA: number; tB: number; point: Point }[] {
  const cubicsFromArc = arcToCubics(arcCmd);
  const [a0, a1, a2, a3] = cmdCubicPts(cubicCmd);
  const nB = cubicsFromArc.length;

  const rawResults: { tA: number; tB: number; point: Point }[] = [];
  for (let ib = 0; ib < nB; ib++) {
    const cb = cubicsFromArc[ib];
    const [b0, b1, b2, b3] = cmdCubicPts(cb);
    const hits = intersectCubicCubic(a0, a1, a2, a3, b0, b1, b2, b3);
    for (const hit of hits) {
      const tB = (ib + hit.tB) / nB;
      rawResults.push({ tA: hit.tA, tB, point: hit.point });
    }
  }

  // Refine tB on the actual arc
  const refined: { tA: number; tB: number; point: Point }[] = [];
  for (const r of rawResults) {
    const nr = newtonRefineArcArc(cubicCmd, arcCmd, r.tA, r.tB);
    if (nr) refined.push(nr);
  }
  return dedupeIntersections(refined);
}

// ─── Intersection Dedup ─────────────────────────────────────────────────────

function dedupeIntersections(
  hits: { tA: number; tB: number; point: Point }[],
): { tA: number; tB: number; point: Point }[] {
  const out: { tA: number; tB: number; point: Point }[] = [];
  for (const h of hits) {
    let dup = false;
    for (const o of out) {
      if (Math.abs(h.tA - o.tA) < PARAMETRIC_EPSILON * 100 &&
          Math.abs(h.tB - o.tB) < PARAMETRIC_EPSILON * 100) {
        dup = true; break;
      }
      if (dist(h.point, o.point) < GEOMETRIC_EPSILON) {
        dup = true; break;
      }
    }
    if (!dup) out.push(h);
  }
  return out;
}

// ─── Path-Level Intersection Finding ────────────────────────────────────────

function getDrawCmds(cmds: TransformCmd[]): TransformCmd[] {
  return cmds.filter(c => {
    const u = c.command.toLowerCase();
    return u !== 'm';
  });
}

function findAllIntersections(
  segsA: TransformCmd[], segsB: TransformCmd[],
  opts: { vertexPolicy?: 'drop' | 'snap'; vertexSnapDist?: number } = {},
): { intersections: Intersection[]; sharedEdges: SharedEdgeRange[] } {
  const vertexPolicy = opts.vertexPolicy ?? 'drop';
  const results: Intersection[] = [];
  for (let ia = 0; ia < segsA.length; ia++) {
    for (let ib = 0; ib < segsB.length; ib++) {
      const hits = pairwiseIntersect(segsA[ia], segsB[ib]);
      for (const h of hits) {
        // Skip intersections exactly at endpoint-endpoint junctions that represent shared vertices
        results.push({
          point: h.point,
          tA: h.tA,
          tB: h.tB,
          segA: ia,
          segB: ib,
        });
      }
    }
  }
  // Deduplicate by point proximity
  const deduped: Intersection[] = [];
  for (const r of results) {
    let dup = false;
    for (const d of deduped) {
      if (dist(r.point, d.point) < GEOMETRIC_EPSILON &&
          r.segA === d.segA && r.segB === d.segB &&
          Math.abs(r.tA - d.tA) < PARAMETRIC_EPSILON * 100) {
        dup = true; break;
      }
    }
    if (!dup) deduped.push(r);
  }

  // Cross-path vertex-vertex snap: drop intersections whose geometric
  // point sits within SNAP_DIST of segment endpoints on BOTH paths.
  // These are "true vertex-vertex matches" — both A and B already
  // have a natural segment-junction at that point, so adding an
  // explicit split contributes nothing and creates asymmetry when
  // the intersection's t lands at a non-vertex parametric position
  // on one side (e.g., tA=0.0059 on A's segment vs tB=1.0 at B's
  // vertex). Dropping these symmetrizes the run-count at link
  // assembly and removes the stray `z`-bridge that produces wedge
  // artifacts. Unilateral near-vertex intersections (one side near
  // a vertex, the other mid-segment) are NOT dropped — those are
  // legitimate cross-path intersections that the boundary classifier
  // depends on (e.g., `radialWedge xor` test). §2.13 + iter-3d.
  const VERTEX_SNAP_DIST = 0.5;
  // Under 'drop' (the boolean ops) the distance is the historical absolute
  // 0.5; 'snap' callers may pass a scale-aware distance instead.
  const vertexSnapDist = vertexPolicy === 'snap' ? (opts.vertexSnapDist ?? VERTEX_SNAP_DIST) : VERTEX_SNAP_DIST;
  const filtered: Intersection[] = [];
  let droppedCount = 0;
  for (const r of deduped) {
    if (r.boundary) {
      filtered.push(r);
      continue;
    }
    const segA = segsA[r.segA];
    const segB = segsB[r.segB];
    const distA = Math.min(dist(r.point, segA.start), dist(r.point, segA.end));
    const distB = Math.min(dist(r.point, segB.start), dist(r.point, segB.end));
    if (distA < vertexSnapDist && distB < vertexSnapDist) {
      if (vertexPolicy === 'snap') {
        // Cut-mode policy: a vertex-vertex intersection is a real crossing
        // that must not be lost (dropping it breaks crossing parity for an
        // open cutter). Clamp both t's onto the nearest endpoint and anchor
        // the record at the subject-side (A) vertex so downstream node
        // unification resolves to the existing vertex.
        const aStartCloser = dist(r.point, segA.start) <= dist(r.point, segA.end);
        const bStartCloser = dist(r.point, segB.start) <= dist(r.point, segB.end);
        const anchored: Intersection = {
          point: aStartCloser ? { ...segA.start } : { ...segA.end },
          tA: aStartCloser ? 0 : 1,
          tB: bStartCloser ? 0 : 1,
          segA: r.segA,
          segB: r.segB,
          ...(r.boundary !== undefined ? { boundary: r.boundary } : {}),
        };
        // Dedupe records that collapse onto the same snapped position.
        const isDup = filtered.some(f =>
          f.segA === anchored.segA && f.segB === anchored.segB &&
          Math.abs(f.tA - anchored.tA) < PARAMETRIC_EPSILON * 100 &&
          Math.abs(f.tB - anchored.tB) < PARAMETRIC_EPSILON * 100);
        if (!isDup) filtered.push(anchored);
        continue;
      }
      droppedCount++;
      if (typeof process !== 'undefined' && process.env?.DEBUG_BOOLEAN_OPS === '1') {
        // eslint-disable-next-line no-console
        console.error(`  dropVtxVtx: pt=(${r.point.x.toFixed(3)},${r.point.y.toFixed(3)}) A.seg${r.segA}@tA=${r.tA.toFixed(4)} distA=${distA.toFixed(3)} B.seg${r.segB}@tB=${r.tB.toFixed(4)} distB=${distB.toFixed(3)}`);
      }
      continue;
    }
    filtered.push(r);
  }
  // Replace deduped with filtered for downstream stages.
  deduped.length = 0;
  deduped.push(...filtered);

  // Detect shared edges (coincident regions between segment pairs) and
  // emit boundary intersections at their endpoints so the splitting
  // step makes splits there. The shared range itself is propagated
  // through the pipeline via the `sharedEdges` channel for the
  // classifier to mark splits as `boundary` (→ `'on'` class). §2.13.
  const sharedEdges: SharedEdgeRange[] = [];
  for (let ia = 0; ia < segsA.length; ia++) {
    for (let ib = 0; ib < segsB.length; ib++) {
      const shared = detectSharedEdge(segsA[ia], segsB[ib]);
      if (!shared) continue;
      sharedEdges.push({
        segA: ia,
        aStart: shared.aStart,
        aEnd: shared.aEnd,
        segB: ib,
        bStart: shared.bStart,
        bEnd: shared.bEnd,
        sameDirection: shared.sameDirection,
      });
      // Add boundary intersections at the four endpoints of the shared
      // region so the splitter creates splits at those parameters.
      // sameDirection: A and B traverse the same way, so aStart pairs
      // with bStart (or bEnd if sameDirection is false).
      const aStartPt = evalCmd(segsA[ia], shared.aStart);
      const aEndPt = evalCmd(segsA[ia], shared.aEnd);
      const tBatAStart = shared.sameDirection ? shared.bStart : shared.bEnd;
      const tBatAEnd = shared.sameDirection ? shared.bEnd : shared.bStart;
      // Only emit boundary intersections that aren't already in the
      // deduped list (within tolerance).
      const candidates: Intersection[] = [
        { point: aStartPt, tA: shared.aStart, tB: tBatAStart, segA: ia, segB: ib, boundary: true },
        { point: aEndPt, tA: shared.aEnd, tB: tBatAEnd, segA: ia, segB: ib, boundary: true },
      ];
      for (const c of candidates) {
        let dup = false;
        for (const d of deduped) {
          if (d.segA === c.segA && d.segB === c.segB &&
              Math.abs(d.tA - c.tA) < PARAMETRIC_EPSILON * 100 &&
              Math.abs(d.tB - c.tB) < PARAMETRIC_EPSILON * 100) {
            // Existing intersection at this endpoint — promote to boundary.
            d.boundary = true;
            dup = true;
            break;
          }
        }
        if (!dup) deduped.push(c);
      }
    }
  }

  if (typeof process !== 'undefined' && process.env?.DEBUG_BOOLEAN_OPS === '1') {
    // eslint-disable-next-line no-console
    console.error(`[bool-ops] findAllIntersections: ${deduped.length} intersections (${droppedCount} dropped as vertex-vertex), ${sharedEdges.length} shared edges`);
    for (const se of sharedEdges) {
      // eslint-disable-next-line no-console
      console.error(`  SharedEdge: A.seg${se.segA}[${se.aStart.toFixed(3)}..${se.aEnd.toFixed(3)}] ↔ B.seg${se.segB}[${se.bStart.toFixed(3)}..${se.bEnd.toFixed(3)}] sameDir=${se.sameDirection}`);
    }
  }
  return { intersections: deduped, sharedEdges };
}

/**
 * Detect a shared (coincident) region between two segments. Returns
 * the parametric overlap range on each segment plus direction
 * agreement, or `null` if no shared region exists. Dispatches by
 * segment type. §2.13.
 */
function detectSharedEdge(
  cmdA: TransformCmd, cmdB: TransformCmd,
): { aStart: number; aEnd: number; bStart: number; bEnd: number; sameDirection: boolean } | null {
  const uA = cmdA.command.toLowerCase();
  const uB = cmdB.command.toLowerCase();
  if (cmdIsLine(cmdA) && cmdIsLine(cmdB)) {
    return detectSharedEdge_LineLine(cmdA.start, cmdA.end, cmdB.start, cmdB.end);
  }
  // Arc-arc, cubic-cubic, and quadratic-quadratic dispatches are
  // intentionally NOT enabled here. The matching helpers
  // (`detectSharedEdge_ArcArc`, `detectSharedEdge_CubicCubic`,
  // `detectSharedEdge_QuadraticQuadratic`) exist below and work for
  // their happy paths, but the current `'on'` selection rule in
  // `selectSegments` is "drop both copies for every operation". That
  // rule is correct only when the shared region is *strictly interior*
  // to the boolean result (the typical line-line abutting case for
  // glyph baselines). It is wrong when the shared region spans every
  // segment of one or both paths — e.g.:
  //   - `a.union(a)` (identical shapes — entire boundary is shared)
  //   - nested-curve case (a quarter pie inside a half pie sharing
  //     an arc, sameDirection=true — union should keep the outer
  //     boundary, not drop both)
  //   - abutting-curve case where the shared curve survives as the
  //     implicit `z` close: a STRAIGHT line is emitted in place of
  //     the curve, which is fine for fill rendering but visibly wrong
  //     under stroking.
  // Enabling curve/arc dispatch with the current per-op rules
  // regresses these cases vs the pre-Phase-A baseline. The proper fix
  // is a sameDirection-aware classification (`'onSame'`/`'onOpposite'`
  // in `SegmentClass`, per-op tiebreakers), which is its own
  // mini-phase tracked in §2.13. Until then, only line-line shared
  // edges run through the pipeline; other shared geometry falls
  // through to the `handleNoIntersections` containment fallback.
  // Glyphs (the iter-1 visible target) primarily share baselines
  // (lines), so the line-line case covers the dominant artifact
  // class.
  return null;
}

/**
 * Detect shared (coincident) angular range between two arcs that lie
 * on the same circle. Returns the parametric overlap range on each arc
 * plus direction agreement, or `null` if no shared region exists.
 *
 * Currently handles circular arcs (rx ≈ ry, no rotation). Elliptical
 * shared arcs require additional axis-and-rotation matching that is
 * deferred until a real-world case appears. §2.13.
 */
function detectSharedEdge_ArcArc(
  cmdA: TransformCmd, cmdB: TransformCmd,
): { aStart: number; aEnd: number; bStart: number; bEnd: number; sameDirection: boolean } | null {
  const cA = cmdArcCenter(cmdA);
  const cB = cmdArcCenter(cmdB);
  if (!cA || !cB) return null;

  // Same circle? Match center and radii.
  const CENTER_TOL = 1e-7;
  const RADIUS_TOL = 1e-7;
  if (Math.abs(cA.cx - cB.cx) > CENTER_TOL) return null;
  if (Math.abs(cA.cy - cB.cy) > CENTER_TOL) return null;
  if (Math.abs(cA.rx - cB.rx) > RADIUS_TOL) return null;
  if (Math.abs(cA.ry - cB.ry) > RADIUS_TOL) return null;

  // Restrict to circular arcs for now. Elliptical shared arcs need
  // additional rotation/axis matching.
  const isCircA = Math.abs(cA.rx - cA.ry) < RADIUS_TOL && Math.abs(cA.phi) < CENTER_TOL;
  const isCircB = Math.abs(cB.rx - cB.ry) < RADIUS_TOL && Math.abs(cB.phi) < CENTER_TOL;
  if (!isCircA || !isCircB) return null;

  // Each arc spans [startAngle, startAngle + deltaAngle]. Find overlap.
  const aLo = Math.min(cA.startAngle, cA.startAngle + cA.deltaAngle);
  const aHi = Math.max(cA.startAngle, cA.startAngle + cA.deltaAngle);
  const bLo = Math.min(cB.startAngle, cB.startAngle + cB.deltaAngle);
  const bHi = Math.max(cB.startAngle, cB.startAngle + cB.deltaAngle);

  // Try direct overlap and modulo-2π shifted overlap (since angles wrap).
  const TWO_PI = Math.PI * 2;
  const ANGLE_TOL = 1e-7;
  const candidates: Array<{ lo: number; hi: number }> = [];
  for (const shift of [-TWO_PI, 0, TWO_PI]) {
    const sLo = bLo + shift;
    const sHi = bHi + shift;
    const lo = Math.max(aLo, sLo);
    const hi = Math.min(aHi, sHi);
    if (hi - lo > ANGLE_TOL) candidates.push({ lo, hi });
  }
  if (candidates.length === 0) return null;
  // Prefer the largest overlap.
  candidates.sort((p, q) => (q.hi - q.lo) - (p.hi - p.lo));
  const overlap = candidates[0];

  // Convert overlap angles back to parametric t on each arc.
  // arc(t).angle = startAngle + t * deltaAngle  →  t = (angle - startAngle) / deltaAngle
  const tA1 = (overlap.lo - cA.startAngle) / cA.deltaAngle;
  const tA2 = (overlap.hi - cA.startAngle) / cA.deltaAngle;
  const aStart = Math.max(0, Math.min(tA1, tA2));
  const aEnd = Math.min(1, Math.max(tA1, tA2));
  if (aEnd - aStart < ANGLE_TOL) return null;

  // For B we need to handle the angular shift used to find overlap.
  // Use a robust round-trip: pick the t value on B whose point matches
  // the arc point at aStart/aEnd on A.
  const ptStart = arcPointAt(cA, aStart);
  const ptEnd = arcPointAt(cA, aEnd);
  const tB1raw = arcTForPoint(cB, ptStart);
  const tB2raw = arcTForPoint(cB, ptEnd);
  if (tB1raw === null || tB2raw === null) return null;
  const bStart = Math.max(0, Math.min(tB1raw, tB2raw));
  const bEnd = Math.min(1, Math.max(tB1raw, tB2raw));
  if (bEnd - bStart < ANGLE_TOL) return null;

  // Direction agreement: do A and B traverse the shared region the
  // same way? Test by sampling slightly inward from each shared
  // endpoint on both arcs and checking direction.
  const sameDirection = (cA.deltaAngle > 0) === (cB.deltaAngle > 0);

  return { aStart, aEnd, bStart, bEnd, sameDirection };
}

/**
 * Detect coincident cubic curves. Currently catches only the easy
 * sub-case: two cubics with identical (or reversed) endpoints AND
 * matching internal control points. This case appears when two paths
 * include the same cubic outline segment — for example, font glyph
 * outlines duplicated by two adjacent letters in tightly-tracked text.
 *
 * Partial coincidence (one cubic is a sub-range of another) requires
 * Bezier-clip recursion and is deferred until a real-world case
 * surfaces. §2.13.
 */
function detectSharedEdge_CubicCubic(
  cmdA: TransformCmd, cmdB: TransformCmd,
): { aStart: number; aEnd: number; bStart: number; bEnd: number; sameDirection: boolean } | null {
  const sA = cmdA.start, eA = cmdA.end;
  const sB = cmdB.start, eB = cmdB.end;
  const [adx1, ady1, adx2, ady2] = cmdA.args;
  const [bdx1, bdy1, bdx2, bdy2] = cmdB.args;
  const cp1A = { x: sA.x + adx1, y: sA.y + ady1 };
  const cp2A = { x: sA.x + adx2, y: sA.y + ady2 };
  const cp1B = { x: sB.x + bdx1, y: sB.y + bdy1 };
  const cp2B = { x: sB.x + bdx2, y: sB.y + bdy2 };

  const PT_TOL = 1e-7;
  const ptEqTol = (p: Point, q: Point): boolean =>
    Math.abs(p.x - q.x) < PT_TOL && Math.abs(p.y - q.y) < PT_TOL;

  // Same-direction full overlap: endpoints match and control polygons match.
  if (ptEqTol(sA, sB) && ptEqTol(eA, eB) && ptEqTol(cp1A, cp1B) && ptEqTol(cp2A, cp2B)) {
    return { aStart: 0, aEnd: 1, bStart: 0, bEnd: 1, sameDirection: true };
  }
  // Reversed-direction full overlap: A.start == B.end, A.end == B.start,
  // cp1A == cp2B, cp2A == cp1B.
  if (ptEqTol(sA, eB) && ptEqTol(eA, sB) && ptEqTol(cp1A, cp2B) && ptEqTol(cp2A, cp1B)) {
    return { aStart: 0, aEnd: 1, bStart: 0, bEnd: 1, sameDirection: false };
  }
  return null;
}

/**
 * Detect coincident quadratic curves. Catches identical (or reversed)
 * endpoint+control pairs. Same caveat as cubic detection — partial
 * coincidence requires recursive subdivision and is deferred. §2.13.
 */
function detectSharedEdge_QuadraticQuadratic(
  cmdA: TransformCmd, cmdB: TransformCmd,
): { aStart: number; aEnd: number; bStart: number; bEnd: number; sameDirection: boolean } | null {
  const sA = cmdA.start, eA = cmdA.end;
  const sB = cmdB.start, eB = cmdB.end;
  const [adx1, ady1] = cmdA.args;
  const [bdx1, bdy1] = cmdB.args;
  const cpA = { x: sA.x + adx1, y: sA.y + ady1 };
  const cpB = { x: sB.x + bdx1, y: sB.y + bdy1 };

  const PT_TOL = 1e-7;
  const ptEqTol = (p: Point, q: Point): boolean =>
    Math.abs(p.x - q.x) < PT_TOL && Math.abs(p.y - q.y) < PT_TOL;

  if (ptEqTol(sA, sB) && ptEqTol(eA, eB) && ptEqTol(cpA, cpB)) {
    return { aStart: 0, aEnd: 1, bStart: 0, bEnd: 1, sameDirection: true };
  }
  if (ptEqTol(sA, eB) && ptEqTol(eA, sB) && ptEqTol(cpA, cpB)) {
    return { aStart: 0, aEnd: 1, bStart: 0, bEnd: 1, sameDirection: false };
  }
  return null;
}

// ─── Splitting at Intersections ─────────────────────────────────────────────

interface SplitSegment {
  cmd: TransformCmd;
  origIndex: number;
  tStart: number;
  tEnd: number;
  /**
   * `true` if this split's parametric range lies entirely within a
   * `SharedEdgeRange` — i.e. this split is a fragment of a shared
   * boundary with the other path. `classifyByRingWalk` short-circuits
   * boundary splits to `'on'`. §2.13.
   */
  boundary?: boolean;
}

function splitPathAtIntersections(
  segs: TransformCmd[],
  intersections: Intersection[],
  side: 'A' | 'B',
  sharedEdges: SharedEdgeRange[] = [],
): SplitSegment[] {
  // Group intersection t-values by segment index
  const tsBySegment = new Map<number, number[]>();
  for (const ix of intersections) {
    const segIdx = side === 'A' ? ix.segA : ix.segB;
    const t = side === 'A' ? ix.tA : ix.tB;
    if (!tsBySegment.has(segIdx)) tsBySegment.set(segIdx, []);
    tsBySegment.get(segIdx)!.push(t);
  }

  // Group shared-edge ranges by segment index for this side. Used to
  // mark splits whose parametric range falls entirely inside a shared
  // region as `boundary: true`. §2.13.
  const sharedBySegment = new Map<number, { start: number; end: number }[]>();
  for (const se of sharedEdges) {
    const segIdx = side === 'A' ? se.segA : se.segB;
    const start = side === 'A' ? se.aStart : se.bStart;
    const end = side === 'A' ? se.aEnd : se.bEnd;
    if (!sharedBySegment.has(segIdx)) sharedBySegment.set(segIdx, []);
    sharedBySegment.get(segIdx)!.push({ start, end });
  }

  const result: SplitSegment[] = [];

  for (let i = 0; i < segs.length; i++) {
    const cmd = segs[i];
    const ts = tsBySegment.get(i);
    const sharedRanges = sharedBySegment.get(i) ?? [];

    if (!ts || ts.length === 0) {
      const inShared = sharedRanges.some(s => s.start <= 0 && s.end >= 1);
      result.push({ cmd, origIndex: i, tStart: 0, tEnd: 1, boundary: inShared });
      continue;
    }

    // Sort t-values and deduplicate
    let sorted = Array.from(new Set(ts)).sort((a, b) => a - b).filter(t => t > PARAMETRIC_EPSILON && t < 1 - PARAMETRIC_EPSILON);

    // Merge near-coincident t-values that would create tiny segments.
    // These arise when multiple pairwise intersection tests find slightly
    // different points for what is geometrically the same intersection
    // (e.g., coincident arcs on the same circle). Tiny segments get
    // randomly classified by the winding number test, causing artifacts.
    if (sorted.length > 1) {
      const MIN_SEG_LEN = 0.5; // minimum sub-segment length in path units
      const merged: number[] = [sorted[0]];
      for (let k = 1; k < sorted.length; k++) {
        const prevPt = evalCmd(cmd, merged[merged.length - 1]);
        const curPt = evalCmd(cmd, sorted[k]);
        const segDist = Math.sqrt(
          (curPt.x - prevPt.x) ** 2 + (curPt.y - prevPt.y) ** 2,
        );
        if (segDist < MIN_SEG_LEN) {
          // Merge: keep the average of the two t-values
          merged[merged.length - 1] = (merged[merged.length - 1] + sorted[k]) / 2;
        } else {
          merged.push(sorted[k]);
        }
      }
      sorted = merged;
    }

    const splits = [0, ...sorted, 1];

    for (let j = 0; j < splits.length - 1; j++) {
      const tStart = splits[j];
      const tEnd = splits[j + 1];
      if (tEnd - tStart < PARAMETRIC_EPSILON) continue;
      const subCmd = splitCmdRange(cmd, tStart, tEnd);
      // A split is `boundary` if its parametric range is contained
      // in any shared-edge range for this segment. Tolerance matches
      // the dedup tolerance used elsewhere.
      const TOL = PARAMETRIC_EPSILON * 100;
      const inShared = sharedRanges.some(s => tStart >= s.start - TOL && tEnd <= s.end + TOL);
      result.push({ cmd: subCmd, origIndex: i, tStart, tEnd, boundary: inShared });
    }
  }

  return result;
}

function splitCmdRange(cmd: TransformCmd, tStart: number, tEnd: number): TransformCmd {
  if (tStart <= PARAMETRIC_EPSILON && tEnd >= 1 - PARAMETRIC_EPSILON) {
    return { command: cmd.command, args: [...cmd.args], start: { ...cmd.start }, end: { ...cmd.end } };
  }

  const u = cmd.command.toLowerCase();

  if (cmdIsLine(cmd)) {
    const s = evalCmd(cmd, tStart);
    const e = evalCmd(cmd, tEnd);
    return { command: 'l', args: [e.x - s.x, e.y - s.y], start: s, end: e };
  }

  if (u === 'c') {
    const [p0, p1, p2, p3] = cmdCubicPts(cmd);
    // First split at tStart to get [tStart, 1], then split that at adjusted tEnd
    const right = subdivideCubicRight(p0, p1, p2, p3, tStart);
    const range = 1 - tStart;
    const adjEnd = range > PARAMETRIC_EPSILON ? (tEnd - tStart) / range : 1;
    const sub = subdivideCubic(right[0], right[1], right[2], right[3], Math.min(1, adjEnd));
    const s = sub[0], e = sub[3];
    return {
      command: 'c',
      args: [sub[1].x - s.x, sub[1].y - s.y, sub[2].x - s.x, sub[2].y - s.y, e.x - s.x, e.y - s.y],
      start: s, end: e,
    };
  }

  if (u === 'q') {
    const [p0, p1, p2] = cmdQuadPts(cmd);
    // Split quadratic at tStart
    const p01 = lerpPt(p0, p1, tStart);
    const p12 = lerpPt(p1, p2, tStart);
    const mid1 = lerpPt(p01, p12, tStart);
    // Right half control points: [mid1, p12, p2]
    const range = 1 - tStart;
    const adjEnd = range > PARAMETRIC_EPSILON ? (tEnd - tStart) / range : 1;
    // Split right half at adjEnd
    const q01 = lerpPt(mid1, p12, adjEnd);
    const q12 = lerpPt(p12, p2, adjEnd);
    const mid2 = lerpPt(q01, q12, adjEnd);
    return {
      command: 'q',
      args: [q01.x - mid1.x, q01.y - mid1.y, mid2.x - mid1.x, mid2.y - mid1.y],
      start: mid1, end: mid2,
    };
  }

  if (u === 'a') {
    const c = cmdArcCenter(cmd);
    if (!c) {
      const s = evalCmd(cmd, tStart);
      const e = evalCmd(cmd, tEnd);
      return { command: 'l', args: [e.x - s.x, e.y - s.y], start: s, end: e };
    }
    const [rx, ry, rotation, , sweepFlag] = cmd.args;
    const s = arcPointAt(c, tStart);
    const e = arcPointAt(c, tEnd);
    const delta = (tEnd - tStart) * c.deltaAngle;
    const la = Math.abs(delta) > Math.PI ? 1 : 0;
    return {
      command: 'a',
      args: [rx, ry, rotation, la, sweepFlag, e.x - s.x, e.y - s.y],
      start: s, end: e,
    };
  }

  // Fallback
  const s = evalCmd(cmd, tStart);
  const e = evalCmd(cmd, tEnd);
  return { command: 'l', args: [e.x - s.x, e.y - s.y], start: s, end: e };
}

// ─── Winding Number & Classification ────────────────────────────────────────

/**
 * Compute winding number of a point relative to a closed path, using
 * per-command-type ray-crossing tests (ray from point in +x direction).
 */
function windingNumber(pt: Point, cmds: TransformCmd[]): number {
  let winding = 0;
  for (const cmd of cmds) {
    winding += segmentCrossings(pt, cmd);
  }
  return winding;
}

function segmentCrossings(pt: Point, cmd: TransformCmd): number {
  const u = cmd.command.toLowerCase();
  if (u === 'm') return 0;

  if (cmdIsLine(cmd)) return lineCrossing(pt, cmd.start, cmd.end);
  if (u === 'c') return cubicCrossing(pt, cmd);
  if (u === 'q') return quadraticCrossing(pt, cmd);
  if (u === 'a') return arcCrossing(pt, cmd);
  return lineCrossing(pt, cmd.start, cmd.end);
}

/**
 * Winding number contribution from a line segment, using the Dan Sunday algorithm.
 * Uses asymmetric endpoint convention (start-inclusive, end-exclusive for upward;
 * start-exclusive, end-inclusive for downward) to ensure each vertex crossing
 * is counted exactly once, even when the query y-line passes through vertices.
 */
function lineCrossing(pt: Point, p0: Point, p1: Point): number {
  const y0 = p0.y - pt.y, y1 = p1.y - pt.y;

  if (y0 <= 0) {
    if (y1 > 0) {
      // Upward crossing candidate: p0 is on or below, p1 is strictly above
      // Check if pt is to the left of the directed edge p0→p1 (isLeft test)
      const cross = (p1.x - p0.x) * (-y0) - (pt.x - p0.x) * (p1.y - p0.y);
      if (cross > 0) return 1;
    }
  } else {
    if (y1 <= 0) {
      // Downward crossing candidate: p0 is strictly above, p1 is on or below
      const cross = (p1.x - p0.x) * (-y0) - (pt.x - p0.x) * (p1.y - p0.y);
      if (cross < 0) return -1;
    }
  }
  return 0;
}

function cubicCrossing(pt: Point, cmd: TransformCmd): number {
  // Adaptive subdivision approach for cubic ray crossing
  const evalAt = (t: number): Point => evalCmd(cmd, t);
  return adaptiveCrossing(pt, evalAt, 0, evalAt(0), 1, evalAt(1), 8);
}

function quadraticCrossing(pt: Point, cmd: TransformCmd): number {
  const evalAt = (t: number): Point => evalCmd(cmd, t);
  return adaptiveCrossing(pt, evalAt, 0, evalAt(0), 1, evalAt(1), 8);
}

function arcCrossing(pt: Point, cmd: TransformCmd): number {
  // Derive the arc's center parameterization ONCE and sample against it.
  // Going through evalCmd would re-run the endpoint-to-center conversion at
  // every recursion sample, which made winding tests on arc-heavy subjects
  // (circle()/arc()/roundRect()) ~100x slower than line/cubic subjects.
  const center = cmdArcCenter(cmd);
  const evalAt = center
    ? (t: number): Point => arcPointAt(center, t)
    : (t: number): Point => evalLine(cmd.start, cmd.end, t);
  return adaptiveCrossing(pt, evalAt, 0, evalAt(0), 1, evalAt(1), 12);
}

/**
 * Adaptive subdivision for winding number contribution.
 * Subdivide the curve and count crossings of linearized segments.
 * Endpoints are threaded through the recursion so each level evaluates
 * only its midpoint.
 */
function adaptiveCrossing(
  pt: Point, evalAt: (t: number) => Point,
  t0: number, p0: Point, t1: number, p1: Point, depth: number,
): number {
  if (depth <= 0) {
    return lineCrossing(pt, p0, p1);
  }

  // Check if we need to subdivide: if the segment is mostly flat, linearize
  const tMid = (t0 + t1) / 2;
  const pMid = evalAt(tMid);
  const linearMid = lerpPt(p0, p1, 0.5);
  const dev = dist(pMid, linearMid);

  if (dev < GEOMETRIC_EPSILON * 10) {
    return lineCrossing(pt, p0, p1);
  }

  return adaptiveCrossing(pt, evalAt, t0, p0, tMid, pMid, depth - 1) +
         adaptiveCrossing(pt, evalAt, tMid, pMid, t1, p1, depth - 1);
}

type SegmentClass = 'inside' | 'outside' | 'on';

function classifySegment(
  seg: SplitSegment, otherPath: TransformCmd[],
): SegmentClass {
  // Sample at the midpoint of the segment
  const tMid = 0.5;
  const midPt = evalCmd(seg.cmd, tMid);
  const wn = windingNumber(midPt, otherPath);
  if (wn === 0) return 'outside';
  return 'inside';
}

function classifyAllSegments(
  splitSegs: SplitSegment[], otherPath: TransformCmd[],
  intersections?: Intersection[], side?: 'A' | 'B',
  otherSegs?: TransformCmd[],
): SegmentClass[] {
  if (intersections && side && otherSegs) {
    return classifyByRingWalk(splitSegs, otherPath, intersections, side, otherSegs);
  }
  return splitSegs.map(seg => classifySegment(seg, otherPath));
}

/**
 * Classify split segments by walking each ring and tracking inside/outside state.
 *
 * Instead of independently sampling each segment's midpoint (which fails when
 * the midpoint lies on the other path's boundary), this walks the ring in order
 * and flips the inside/outside state at each intersection boundary. Within a
 * ring, boundaries between segments with the same origIndex are intersection
 * points (crossings) where the state flips; boundaries between different
 * origIndex values are original segment joints where the state is unchanged.
 *
 * The seed classification is determined by finding a segment whose midpoint is
 * reliably inside or outside (verified by sampling at two points and checking
 * agreement). The state is then propagated through the ring.
 */
/**
 * Determine if an intersection at a split boundary is a transverse crossing
 * (curves cross each other) or a tangent touch (curves touch but stay on the
 * same side). Returns true for crossings, false for tangent touches.
 *
 * Uses cross product of the two paths' tangent vectors at the intersection.
 * Transverse crossings have large cross product; tangent touches have ~0.
 */
function isCrossingAtBoundary(
  splitBefore: SplitSegment, splitAfter: SplitSegment,
  intersections: Intersection[], side: 'A' | 'B',
  otherSegs: TransformCmd[],
): boolean {
  // The boundary point is the end of splitBefore / start of splitAfter
  const bndPt = splitBefore.cmd.end;

  // Current path tangent at the boundary
  const tanThis = tangentAtEnd(splitBefore.cmd);

  // Find the matching intersection to get the other path's segment
  const origIdx = splitBefore.origIndex;
  const MATCH_TOL = GEOMETRIC_EPSILON * 1000;
  for (const ix of intersections) {
    const segIdx = side === 'A' ? ix.segA : ix.segB;
    if (segIdx !== origIdx) continue;
    if (dist(ix.point, bndPt) > MATCH_TOL) continue;

    // Found the intersection — get the other path's segment and tangent
    const otherSegIdx = side === 'A' ? ix.segB : ix.segA;
    const otherT = side === 'A' ? ix.tB : ix.tA;
    if (otherSegIdx >= otherSegs.length) continue;
    const otherCmd = otherSegs[otherSegIdx];

    // Compute tangent of the other path at the intersection
    const dt = 1e-5;
    const pBefore = evalCmd(otherCmd, Math.max(0, otherT - dt));
    const pAfter = evalCmd(otherCmd, Math.min(1, otherT + dt));
    const tanOtherX = pAfter.x - pBefore.x;
    const tanOtherY = pAfter.y - pBefore.y;
    const tanOtherLen = Math.sqrt(tanOtherX * tanOtherX + tanOtherY * tanOtherY);
    if (tanOtherLen < 1e-12) continue;

    // Cross product of the two tangent vectors
    const cross = tanThis.x * (tanOtherY / tanOtherLen) - tanThis.y * (tanOtherX / tanOtherLen);

    // Large cross product → unambiguous transverse crossing.
    if (Math.abs(cross) > 0.05) return true;

    // Cross is small (parallel or near-parallel tangents). This can be
    // either: (1) a true tangent-touch where two paths kiss at a point
    // and separate (no class flip), or (2) a shared-edge boundary where
    // two paths coincide along a segment and the intersection point is
    // the start/end of that shared edge (class DOES flip — entering or
    // leaving the coincident region). The cross product alone can't
    // distinguish these. Fall back to winding-number sampling at points
    // just inside splitBefore and splitAfter: if those fall in different
    // winding regions of the other path, the path crosses. Solves §2.4
    // of the audit for shared-edge / near-tangent cases that surface in
    // thin-stroke glyph unions (e.g., Raleway-200 ExtraLight EN).
    const sampleBefore = evalCmd(splitBefore.cmd, 0.95);
    const sampleAfter = evalCmd(splitAfter.cmd, 0.05);
    const wnBefore = windingNumber(sampleBefore, otherSegs);
    const wnAfter = windingNumber(sampleAfter, otherSegs);
    return (wnBefore === 0) !== (wnAfter === 0);
  }

  // Couldn't find matching intersection — assume crossing (conservative)
  return true;
}

function classifyByRingWalk(
  splits: SplitSegment[], otherPath: TransformCmd[],
  intersections: Intersection[], side: 'A' | 'B',
  otherSegs: TransformCmd[],
): SegmentClass[] {
  const classes: SegmentClass[] = new Array(splits.length);

  // Pre-pass: any split flagged as `boundary` (lies inside a shared-edge
  // region with the other path) is classified `'on'` directly. The
  // ring-walk skips these — they don't participate in flip parity, they
  // just sit between regular segments. selectSegments handles them
  // per-op (drop both sides for union/intersection/xor; drop both for
  // difference). §2.13.
  for (let i = 0; i < splits.length; i++) {
    if (splits[i].boundary) classes[i] = 'on';
  }

  // Identify ring boundaries (where consecutive segments don't connect)
  const ringStarts: number[] = [0];
  for (let i = 1; i < splits.length; i++) {
    if (!ptEq(splits[i - 1].cmd.end, splits[i].cmd.start)) {
      ringStarts.push(i);
    }
  }
  ringStarts.push(splits.length); // sentinel

  // Process each ring independently
  for (let r = 0; r < ringStarts.length - 1; r++) {
    const rStart = ringStarts[r];
    const rEnd = ringStarts[r + 1];
    if (rEnd - rStart === 0) continue;

    // Find a reliable seed segment: one whose classification is unambiguous.
    // Sample at multiple t-values; accept the first segment where any two
    // distinct samples agree on inside/outside. Escalating sequence covers
    // the case where the segment is itself a shared boundary edge — sampling
    // at the legacy [0.3, 0.7] alone landed both points on the boundary,
    // making the winding test unreliable. Solves §2.3 of the audit.
    //
    // Skip already-classified `'on'` (boundary) splits when seeding — they
    // are not propagation anchors. §2.13.
    const SEED_TS = [0.5, 0.3, 0.7, 0.1, 0.9, 0.2, 0.8, 0.4, 0.6];
    let seedIdx = rStart;
    let seedClass: SegmentClass = 'outside';
    let found = false;
    for (let i = rStart; i < rEnd && !found; i++) {
      if (classes[i] === 'on') continue;
      const cmd = splits[i].cmd;
      let firstSide: number | null = null;
      for (const t of SEED_TS) {
        const p = evalCmd(cmd, t);
        const wn = windingNumber(p, otherPath);
        const side = wn === 0 ? 0 : 1;
        if (firstSide === null) {
          firstSide = side;
          continue;
        }
        if (side === firstSide) {
          seedIdx = i;
          seedClass = side === 0 ? 'outside' : 'inside';
          found = true;
          break;
        }
      }
    }
    if (!found) {
      // Fallback: use midpoint test on first segment that isn't `'on'`.
      let fallbackIdx = rStart;
      while (fallbackIdx < rEnd && classes[fallbackIdx] === 'on') fallbackIdx++;
      if (fallbackIdx < rEnd) {
        const mid = evalCmd(splits[fallbackIdx].cmd, 0.5);
        seedClass = windingNumber(mid, otherPath) === 0 ? 'outside' : 'inside';
        seedIdx = fallbackIdx;
      } else {
        // Entire ring is `'on'` — leave it; no propagation needed.
        continue;
      }
    }

    // First-pass classification: walk forward from seed, flipping at
    // intra-segment crossings. The walk produces a topologically
    // consistent class assignment relative to the seed. Skip transitions
    // involving `'on'` segments (they don't participate in flip parity)
    // — write only to non-`'on'` slots. §2.13.
    classes[seedIdx] = seedClass;
    let cls = seedClass;
    const ringLen = rEnd - rStart;
    for (let step = 1; step < ringLen; step++) {
      const i = rStart + ((seedIdx - rStart + step) % ringLen);
      const prev = rStart + ((seedIdx - rStart + step - 1 + ringLen) % ringLen);
      // If we're moving INTO an `'on'` segment, don't change cls and don't overwrite.
      if (classes[i] === 'on') continue;
      // If the previous segment was `'on'`, no flip evaluation — cls
      // continues from before the `'on'` block.
      if (classes[prev] !== 'on' &&
          splits[i].origIndex === splits[prev].origIndex) {
        if (isCrossingAtBoundary(splits[prev], splits[i], intersections, side, otherSegs)) {
          cls = cls === 'inside' ? 'outside' : 'inside';
        }
      }
      classes[i] = cls;
    }

    // Direct-sample repair pass. The walk produces a topologically
    // consistent class assignment relative to the seed, but each
    // intra-segment isCrossingAtBoundary decision can be wrong (most
    // commonly at near-tangent crossings or near-coincident
    // intersections). For each split, sample at three t-values via
    // direct winding-number against the other path; if ALL THREE
    // samples agree AND the agreed class disagrees with the walk's,
    // override IF a wider sampling band confirms the override (a
    // 5-sample re-check at additional t values to defend against
    // accidental short-segment midpoint coincidences). Ambiguous
    // segments (samples disagree) keep the walk's class because they
    // are likely on a shared edge where the walk's flip-based
    // propagation handles them better.
    // Direct-sample repair pass with perpendicular-offset sampling. The
    // walk produces a topologically consistent class assignment from a
    // seed but each isCrossingAtBoundary decision can be wrong (most
    // commonly at near-tangent crossings). For each split, sample at
    // midpoint OFFSET PERPENDICULAR to the segment in both directions
    // — if both offset samples agree on inside/outside, the segment is
    // in a uniform region (not on a shared boundary edge of the other
    // path) and that class is authoritative. If they disagree, the
    // segment lies on the other path's boundary (a shared-edge
    // candidate) and we keep the walk's class because it propagates
    // from a reliable seed across the shared edge.
    //
    // Sampling on the segment itself (at midpoint, t=0.3, t=0.7) was
    // tried first but produces false-positive overrides for shared-
    // baseline segments where same-segment samples accidentally agree
    // due to float precision near the boundary.
    if (rEnd - rStart > 1) {
      const PERP_EPSILON = 0.01;
      const T_EPSILON = 1e-3;
      const SAMPLE_TS = [0.25, 0.5, 0.75];
      for (let i = rStart; i < rEnd; i++) {
        if (classes[i] === 'on') continue; // §2.13 — boundary splits are authoritative
        const cmd = splits[i].cmd;
        let suggested: 'outside' | 'inside' | null = null;
        let unanimous = true;
        for (const t of SAMPLE_TS) {
          const p = evalCmd(cmd, t);
          const before = evalCmd(cmd, Math.max(0, t - T_EPSILON));
          const after = evalCmd(cmd, Math.min(1, t + T_EPSILON));
          const tx = after.x - before.x;
          const ty = after.y - before.y;
          const tlen = Math.sqrt(tx * tx + ty * ty);
          if (tlen < 1e-12) { unanimous = false; break; } // degenerate
          const px = (-ty / tlen) * PERP_EPSILON;
          const py = (tx / tlen) * PERP_EPSILON;
          const wnPlus = windingNumber({ x: p.x + px, y: p.y + py }, otherPath);
          const wnMinus = windingNumber({ x: p.x - px, y: p.y - py }, otherPath);
          if ((wnPlus === 0) !== (wnMinus === 0)) { unanimous = false; break; }
          const c: 'outside' | 'inside' = wnPlus === 0 ? 'outside' : 'inside';
          if (suggested === null) suggested = c;
          else if (suggested !== c) { unanimous = false; break; }
        }
        if (unanimous && suggested !== null && classes[i] !== suggested) {
          classes[i] = suggested;
        }
      }
    }
  }

  // Post-pass: shared-edge boundary splits on the OUTER boundary of the
  // merged shape need to be kept (once, from A's copy) rather than
  // dropped. §2.13's "drop both copies" simplification is correct for
  // strictly-INTERIOR shared edges (e.g. abutting rectangles where the
  // shared edge is invisible because both sides are filled), but WRONG
  // for shared edges that sit on the outer boundary of (A ∪ B). For
  // example, Raleway thin-stroke E's top horizontal stroke is collinear
  // with N's top serif at the same y-value; the shared edge IS part of
  // the merged outer boundary, and dropping both copies leaves a gap.
  //
  // Disambiguation: sample perpendicular off the boundary split's
  // midpoint. If either perpendicular sample is OUTSIDE the other path,
  // the shared edge sits on a boundary of (A ∪ B) — keep A's copy as
  // 'outside'; B's copy stays 'on' (selectSegments drops it). For
  // strictly-interior shared edges (both perpendicular samples inside
  // the other path), keep the 'on' classification (drop both copies).
  // Only applies on side === 'A'; side B's boundary splits always stay
  // 'on' so the shared edge appears just once in the output.
  // §2.14 normalization Phase 3.
  if (side === 'A') {
    const PERP_EPSILON_BOUNDARY = 0.5;
    // Build a path representation of A (this side) by collecting all split
    // cmds. The splits cover A's geometry as a connected sequence, suitable
    // for windingNumber.
    const thisSegs: TransformCmd[] = splits.map(s => s.cmd);
    for (let i = 0; i < splits.length; i++) {
      if (!splits[i].boundary) continue;
      if (classes[i] !== 'on') continue;
      const seg = splits[i].cmd;
      const mid = evalCmd(seg, 0.5);
      const tx = seg.end.x - seg.start.x;
      const ty = seg.end.y - seg.start.y;
      const tlen = Math.sqrt(tx * tx + ty * ty);
      if (tlen < 1e-9) continue;
      const nx = -ty / tlen;
      const ny = tx / tlen;
      const samplePlus = { x: mid.x + nx * PERP_EPSILON_BOUNDARY, y: mid.y + ny * PERP_EPSILON_BOUNDARY };
      const sampleMinus = { x: mid.x - nx * PERP_EPSILON_BOUNDARY, y: mid.y - ny * PERP_EPSILON_BOUNDARY };
      // A perpendicular sample is "outside (A ∪ B)" iff it is outside BOTH
      // A's path AND B's path. Keep A's boundary copy as 'outside' only
      // when at least one perpendicular side is outside the union — that
      // identifies a shared edge sitting on the merged outer boundary.
      // For strictly-interior shared edges (both sides inside one or the
      // other), keep 'on' (drop both copies, original §2.13 behaviour).
      const plusOutsideOther = windingNumber(samplePlus, otherSegs) === 0;
      const minusOutsideOther = windingNumber(sampleMinus, otherSegs) === 0;
      const plusOutsideThis = windingNumber(samplePlus, thisSegs) === 0;
      const minusOutsideThis = windingNumber(sampleMinus, thisSegs) === 0;
      const plusOutsideUnion = plusOutsideOther && plusOutsideThis;
      const minusOutsideUnion = minusOutsideOther && minusOutsideThis;
      if (plusOutsideUnion || minusOutsideUnion) {
        classes[i] = 'outside';
      }
    }
  }

  return classes;
}

// ─── Traversal & Assembly ───────────────────────────────────────────────────

type BooleanOp = 'union' | 'difference' | 'intersection' | 'xor';

function selectSegments(
  classA: SegmentClass, classB: SegmentClass,
  op: BooleanOp,
): { keepA: boolean; keepB: boolean; reverseA: boolean; reverseB: boolean } {
  // §2.13 — `'on'` (shared-edge boundary) class falls through these
  // strict-equality checks against `'outside'` / `'inside'` and ends up
  // dropped from both sides for every operation. That matches the
  // shared-edge per-op rules in the redesign plan: union/intersection/
  // xor drop both copies, difference drops both A's `'on'` (not part of
  // A's exclusive area) and B's `'on'` (not subtracted). This is
  // intentional — do not "fix" by widening the comparisons.
  let keepA = false, keepB = false, reverseA = false, reverseB = false;
  switch (op) {
    case 'union':
      keepA = classA === 'outside';
      keepB = classB === 'outside';
      break;
    case 'intersection':
      keepA = classA === 'inside';
      keepB = classB === 'inside';
      break;
    case 'difference':
      keepA = classA === 'outside';
      keepB = classB === 'inside';
      reverseB = true;
      break;
    case 'xor':
      // XOR is handled by pathXor() as difference(A,B) ∪ difference(B,A)
      // This case exists for completeness but should not be reached
      keepA = classA === 'outside';
      keepB = classB === 'outside';
      break;
  }
  return { keepA, keepB, reverseA, reverseB };
}

// Snap arithmetic residue (≤ 1e-12 ≈ machine epsilon scale) to zero so
// reversed commands don't carry visually meaningless coordinates like
// `1.1102230246251565e-16` into the emitted SVG. Threshold sits well below
// any legitimate path coordinate yet above accumulated FP noise.
function snapEpsilon(v: number): number {
  return Math.abs(v) < 1e-12 ? 0 : v;
}

function reverseCmd(cmd: TransformCmd): TransformCmd {
  const u = cmd.command.toLowerCase();
  const s = cmd.end, e = cmd.start;

  if (cmdIsLine(cmd)) {
    return { command: 'l', args: [snapEpsilon(e.x - s.x), snapEpsilon(e.y - s.y)], start: s, end: e };
  }

  if (u === 'c') {
    const [dx1, dy1, dx2, dy2] = cmd.args;
    const cp1 = { x: cmd.start.x + dx1, y: cmd.start.y + dy1 };
    const cp2 = { x: cmd.start.x + dx2, y: cmd.start.y + dy2 };
    return {
      command: 'c',
      args: [
        snapEpsilon(cp2.x - s.x), snapEpsilon(cp2.y - s.y),
        snapEpsilon(cp1.x - s.x), snapEpsilon(cp1.y - s.y),
        snapEpsilon(e.x - s.x), snapEpsilon(e.y - s.y),
      ],
      start: s, end: e,
    };
  }

  if (u === 'q') {
    const [dx1, dy1] = cmd.args;
    const cp = { x: cmd.start.x + dx1, y: cmd.start.y + dy1 };
    return {
      command: 'q',
      args: [snapEpsilon(cp.x - s.x), snapEpsilon(cp.y - s.y), snapEpsilon(e.x - s.x), snapEpsilon(e.y - s.y)],
      start: s, end: e,
    };
  }

  if (u === 'a') {
    const [rx, ry, rotation, largeArc, sweep] = cmd.args;
    return {
      command: 'a',
      args: [rx, ry, rotation, largeArc, sweep ? 0 : 1, snapEpsilon(e.x - s.x), snapEpsilon(e.y - s.y)],
      start: s, end: e,
    };
  }

  return { command: 'l', args: [snapEpsilon(e.x - s.x), snapEpsilon(e.y - s.y)], start: s, end: e };
}

// ─── Ring-Based Assembly (Weiler-Atherton style) ────────────────────────────

interface RingEntry {
  cmd: TransformCmd;
  action: 'keep' | 'gap' | 'degenerate';
}

interface KeptRun {
  cmds: TransformCmd[];
  entryPoint: Point;   // start of first cmd
  exitPoint: Point;    // end of last cmd
  isComplete: boolean; // true if entire ring is kept (no gaps)
  source: 'A' | 'B';
}

/** Compute the tangent direction at the end of a segment (t=1). */
function tangentAtEnd(cmd: TransformCmd): Point {
  const u = cmd.command.toLowerCase();
  if (u === 'q') {
    const [dx1, dy1] = cmd.args;
    const cp = { x: cmd.start.x + dx1, y: cmd.start.y + dy1 };
    const tx = cmd.end.x - cp.x, ty = cmd.end.y - cp.y;
    const len = Math.sqrt(tx * tx + ty * ty);
    return len > 1e-12 ? { x: tx / len, y: ty / len } : { x: 0, y: 0 };
  }
  if (u === 'c') {
    const [, , dx2, dy2] = cmd.args;
    const cp2 = { x: cmd.start.x + dx2, y: cmd.start.y + dy2 };
    const tx = cmd.end.x - cp2.x, ty = cmd.end.y - cp2.y;
    const len = Math.sqrt(tx * tx + ty * ty);
    return len > 1e-12 ? { x: tx / len, y: ty / len } : { x: 0, y: 0 };
  }
  if (u === 'a') {
    const center = cmdArcCenter(cmd);
    if (center) {
      const angle = center.startAngle + center.deltaAngle;
      const cosPhi = Math.cos(center.phi), sinPhi = Math.sin(center.phi);
      const dx = -center.rx * Math.sin(angle);
      const dy = center.ry * Math.cos(angle);
      let tx = cosPhi * dx - sinPhi * dy;
      let ty = sinPhi * dx + cosPhi * dy;
      if (center.deltaAngle < 0) { tx = -tx; ty = -ty; }
      const len = Math.sqrt(tx * tx + ty * ty);
      return len > 1e-12 ? { x: tx / len, y: ty / len } : { x: 0, y: 0 };
    }
  }
  const tx = cmd.end.x - cmd.start.x, ty = cmd.end.y - cmd.start.y;
  const len = Math.sqrt(tx * tx + ty * ty);
  return len > 1e-12 ? { x: tx / len, y: ty / len } : { x: 0, y: 0 };
}

/** Compute the tangent direction at the start of a segment (t=0). */
function tangentAtStart(cmd: TransformCmd): Point {
  const u = cmd.command.toLowerCase();
  if (u === 'q') {
    const [dx1, dy1] = cmd.args;
    const cp = { x: cmd.start.x + dx1, y: cmd.start.y + dy1 };
    const tx = cp.x - cmd.start.x, ty = cp.y - cmd.start.y;
    const len = Math.sqrt(tx * tx + ty * ty);
    return len > 1e-12 ? { x: tx / len, y: ty / len } : { x: 0, y: 0 };
  }
  if (u === 'c') {
    const [dx1, dy1] = cmd.args;
    const cp1 = { x: cmd.start.x + dx1, y: cmd.start.y + dy1 };
    const tx = cp1.x - cmd.start.x, ty = cp1.y - cmd.start.y;
    const len = Math.sqrt(tx * tx + ty * ty);
    return len > 1e-12 ? { x: tx / len, y: ty / len } : { x: 0, y: 0 };
  }
  if (u === 'a') {
    const center = cmdArcCenter(cmd);
    if (center) {
      const angle = center.startAngle;
      const cosPhi = Math.cos(center.phi), sinPhi = Math.sin(center.phi);
      const dx = -center.rx * Math.sin(angle);
      const dy = center.ry * Math.cos(angle);
      let tx = cosPhi * dx - sinPhi * dy;
      let ty = sinPhi * dx + cosPhi * dy;
      if (center.deltaAngle < 0) { tx = -tx; ty = -ty; }
      const len = Math.sqrt(tx * tx + ty * ty);
      return len > 1e-12 ? { x: tx / len, y: ty / len } : { x: 0, y: 0 };
    }
  }
  const tx = cmd.end.x - cmd.start.x, ty = cmd.end.y - cmd.start.y;
  const len = Math.sqrt(tx * tx + ty * ty);
  return len > 1e-12 ? { x: tx / len, y: ty / len } : { x: 0, y: 0 };
}

/**
 * Build ordered rings from split segments, grouped by subpath.
 * Each ring is an ordered array of entries with keep/gap/degenerate classification.
 * For difference-B, rings are reversed so traversal follows the correct winding.
 */
function buildRings(
  splits: SplitSegment[], classes: SegmentClass[],
  op: BooleanOp, source: 'A' | 'B',
): RingEntry[][] {
  const reverseB = source === 'B' && op === 'difference';

  // Determine keep/gap per segment
  const entries: { cmd: TransformCmd; action: 'keep' | 'gap' | 'degenerate' }[] = [];
  for (let i = 0; i < splits.length; i++) {
    const cls = classes[i];
    let keep: boolean;
    if (source === 'A') {
      const sel = selectSegments(cls, 'outside', op);
      keep = sel.keepA;
    } else {
      const sel = selectSegments('outside', cls, op);
      keep = sel.keepB;
    }
    const cmd = splits[i].cmd;
    const degenerate = ptEq(cmd.start, cmd.end);
    entries.push({
      cmd,
      action: degenerate ? 'degenerate' : (keep ? 'keep' : 'gap'),
    });
  }

  // Group into subpath rings by endpoint discontinuity
  const rings: RingEntry[][] = [];
  let currentRing: RingEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    currentRing.push(entries[i]);
    const isLast = i === entries.length - 1;
    const nextDiscontinuous = !isLast && !ptEq(entries[i].cmd.end, entries[i + 1].cmd.start);
    if (isLast || nextDiscontinuous) {
      rings.push(currentRing);
      currentRing = [];
    }
  }

  // For difference-B: reverse each ring and each segment
  if (reverseB) {
    for (let r = 0; r < rings.length; r++) {
      rings[r] = rings[r].reverse().map(entry => ({
        ...entry,
        cmd: reverseCmd(entry.cmd),
      }));
    }
  }

  return rings;
}

/**
 * Extract maximal contiguous runs of kept (non-degenerate) entries from a ring.
 * Handles wraparound: starts iteration from the first gap so a run spanning
 * the ring boundary is captured as one contiguous run.
 */
function extractKeptRuns(ring: RingEntry[], source: 'A' | 'B'): KeptRun[] {
  // Check if the entire ring is kept (no gaps)
  const hasGap = ring.some(e => e.action === 'gap');
  if (!hasGap) {
    // All kept or degenerate — emit as one complete run
    const cmds = ring.filter(e => e.action === 'keep').map(e => e.cmd);
    if (cmds.length === 0) return [];
    return [{
      cmds,
      entryPoint: cmds[0].start,
      exitPoint: cmds[cmds.length - 1].end,
      isComplete: true,
      source,
    }];
  }

  // Find the first gap to start iteration (so runs spanning the boundary are merged)
  let firstGap = -1;
  for (let i = 0; i < ring.length; i++) {
    if (ring[i].action === 'gap') { firstGap = i; break; }
  }

  const runs: KeptRun[] = [];
  let currentCmds: TransformCmd[] = [];

  for (let offset = 1; offset <= ring.length; offset++) {
    const idx = (firstGap + offset) % ring.length;
    const entry = ring[idx];

    if (entry.action === 'keep') {
      currentCmds.push(entry.cmd);
    } else {
      // gap or degenerate — flush current run if non-empty
      if (entry.action === 'gap' && currentCmds.length > 0) {
        runs.push({
          cmds: currentCmds,
          entryPoint: currentCmds[0].start,
          exitPoint: currentCmds[currentCmds.length - 1].end,
          isComplete: false,
          source,
        });
        currentCmds = [];
      }
      // degenerate entries are skipped but don't break runs
    }
  }
  // Flush any remaining run
  if (currentCmds.length > 0) {
    runs.push({
      cmds: currentCmds,
      entryPoint: currentCmds[0].start,
      exitPoint: currentCmds[currentCmds.length - 1].end,
      isComplete: false,
      source,
    });
  }

  return runs;
}

/**
 * Build intersection links: map each non-complete run's exit point to the
 * non-complete run on the other path whose entry point continues the contour.
 *
 * At a clustered intersection, several exit and entry points converge within
 * float-noise distance of one another. Distance-only greedy pairing picks
 * whichever (exit, entry) pair happens to sort shortest — which on a tie can
 * be the topologically wrong pairing, producing a "diagonal close" notch
 * where the contour zig-zags across the shape interior.
 *
 * This function instead solves a global minimum-cost bipartite matching with
 * a cost function that combines distance with tangent continuity:
 *
 *     cost(i → j) = dist(exit_i, entry_j) − α · (t_exit_i · t_entry_j)
 *
 * where α = bboxDiag / 100 makes the tangent term a tie-breaker
 * subordinate to distance — large enough to break ties on near-zero
 * distance pairings, small enough that a long-distance link can never
 * become cheaper than a local pairing solely from tangent continuity
 * (see §2.15 RW-l-50 fix). Same-source pairs (i.source == j.source)
 * get a forbidding cost so they're never matched.
 *
 * Implemented via classical Munkres (Hungarian) on the square N×N matrix of
 * non-complete runs. O(N³) per call; for typical glyph union N ≤ 50, well
 * under 1 ms.
 *
 * Solves §2.5 of the audit (the diagonal-close notch).
 */
function buildIntersectionLinks(
  runsA: KeptRun[], runsB: KeptRun[], bboxDiag: number,
): Map<KeptRun, KeptRun> {
  const links = new Map<KeptRun, KeptRun>();

  // Combine non-complete runs from both paths into a single indexed list.
  // Index ordering: A-runs first, B-runs second. Index identifies a run for
  // both its exit (row) and its entry (column) in the cost matrix.
  const runs: KeptRun[] = [];
  for (const r of runsA) if (!r.isComplete) runs.push(r);
  for (const r of runsB) if (!r.isComplete) runs.push(r);
  const N = runs.length;
  if (N === 0) return links;

  // Forbidding cost for invalid pairings (same source, self-pair). Must
  // dominate any legitimate cost; bboxDiag scales with shape size so
  // FORBIDDEN = bboxDiag * 1000 is safe.
  const FORBIDDEN = Math.max(bboxDiag * 1000, 1e9);
  // §2.15 alpha tuning: tangent continuity is for tie-breaking only,
  // not for dominating distance. With alpha = bboxDiag/10 (the original
  // §2.5 value), the tangent term could make a long-distance link
  // (d=5+ in glyph-local) cheaper than a near-zero local pairing at the
  // same cluster. This produced "interior crossing" links — vertical
  // jumps across e's bowl interior at glyph-junction tracking — that
  // fused what should be 2 disjoint cycles (outer perimeter + bowl-
  // counter hole) into one mis-routed chain (RW-l-50 bowl filled as
  // solid disk). bboxDiag/100 keeps the tie-break behavior the §2.5
  // fix needed without overriding distance.
  const alpha = bboxDiag / 100;

  // Precompute tangents at each run's exit and entry.
  const exitTangents: Point[] = runs.map((r) => tangentAtEnd(r.cmds[r.cmds.length - 1]));
  const entryTangents: Point[] = runs.map((r) => tangentAtStart(r.cmds[0]));

  // Build N×N cost matrix.
  const cost: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i === j || runs[i].source === runs[j].source) {
        cost[i][j] = FORBIDDEN;
        continue;
      }
      const d = dist(runs[i].exitPoint, runs[j].entryPoint);
      const cont = exitTangents[i].x * entryTangents[j].x + exitTangents[i].y * entryTangents[j].y;
      cost[i][j] = d - alpha * cont;
    }
  }

  // Solve minimum-cost assignment.
  const assignment = hungarianMinCost(cost);

  const dbg = typeof process !== 'undefined' && process.env?.DEBUG_BOOLEAN_OPS === '1';
  if (dbg) {
    // eslint-disable-next-line no-console
    console.error(`[buildIntersectionLinks] N=${N}, runs:`);
    for (let i = 0; i < N; i++) {
      const r = runs[i];
      // eslint-disable-next-line no-console
      console.error(`  run[${i}] ${r.source} cmds=${r.cmds.length} exit=(${r.exitPoint.x.toFixed(3)},${r.exitPoint.y.toFixed(3)}) entry=(${r.entryPoint.x.toFixed(3)},${r.entryPoint.y.toFixed(3)})`);
    }
    // eslint-disable-next-line no-console
    console.error(`[buildIntersectionLinks] Hungarian assignments + costs:`);
    for (let i = 0; i < N; i++) {
      const j = assignment[i];
      if (j < 0) {
        // eslint-disable-next-line no-console
        console.error(`  run[${i}] -> UNMATCHED`);
        continue;
      }
      // eslint-disable-next-line no-console
      console.error(`  run[${i}] -> run[${j}]  cost=${cost[i][j].toFixed(3)}  d=${dist(runs[i].exitPoint, runs[j].entryPoint).toFixed(3)}`);
    }
  }

  // Apply links, skipping any FORBIDDEN matches (would mean no valid partner).
  for (let i = 0; i < N; i++) {
    const j = assignment[i];
    if (j < 0 || cost[i][j] >= FORBIDDEN / 2) continue;
    links.set(runs[i], runs[j]);
  }

  return links;
}

/**
 * Classical Hungarian (Kuhn-Munkres) algorithm for minimum-cost perfect
 * matching on a square cost matrix. O(n³). Returns assignment[i] = j meaning
 * row i is matched to column j. Returns -1 for any unmatched row (shouldn't
 * happen on a valid square matrix, but guards against degenerate inputs).
 *
 * Implementation: standard 1-indexed potentials algorithm with one row added
 * per outer iteration. Augmenting paths via the alternating-tree method.
 * No allocations per inner iteration beyond the temporary `minv`, `way`,
 * `used` arrays sized N+1.
 */
function hungarianMinCost(cost: number[][]): number[] {
  const n = cost.length;
  if (n === 0) return [];
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = -1;
      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }
      if (j1 === -1) break; // safety
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const assignment = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) {
    if (p[j] !== 0) {
      assignment[p[j] - 1] = j - 1;
    }
  }
  return assignment;
}

/**
 * Compute the diagonal length of the combined bounding box of two segment
 * arrays. Used to scale relative-tolerance and tangent-weight constants in
 * the assembly step so they track shape size.
 */
function computeBBoxDiag(segsA: TransformCmd[], segsB: TransformCmd[]): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const fold = (cmds: TransformCmd[]): void => {
    for (const c of cmds) {
      const b = cmdBBox(c);
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
    }
  };
  fold(segsA);
  fold(segsB);
  if (!isFinite(minX)) return 0;
  const dx = maxX - minX, dy = maxY - minY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Trace closed contours by following kept runs and intersection links.
 * Complete rings (no gaps) are emitted directly. Partial runs are chained
 * via links: A-run → B-run → A-run → ... until the contour closes.
 */
function traceContours(
  allRuns: KeptRun[], links: Map<KeptRun, KeptRun>,
): TransformCmd[][] {
  const visited = new Set<KeptRun>();
  const contours: TransformCmd[][] = [];

  // Build an inbound-link set so we can prefer chain-START runs in the
  // iteration order. A "chain start" is a run that no other run links
  // INTO (its `entryPoint` is reached only by being the first in a
  // contour, not by following from a predecessor). Without this, the
  // for-loop picks the lowest-index unvisited run regardless of role.
  // If a run with an inbound link is picked before its predecessor, the
  // predecessor's later trace stops short (can't revisit), and the
  // unmatched-tail run becomes a standalone contour — visible as a
  // wedge / phantom subpath at glyph junctions where Hungarian leaves
  // one A-run unmatched. Iterating chain-starts first attaches the
  // tail to the proper outer contour via the existing bridge logic.
  // §2.4 / iter-3d-en wedge fix.
  const hasInbound = new Set<KeptRun>();
  for (const target of links.values()) hasInbound.add(target);

  // Two passes: chain-starts first (runs without inbound links), then
  // any remaining unvisited (which are cycles closed under links).
  const orderedRuns: KeptRun[] = [
    ...allRuns.filter((r) => !hasInbound.has(r)),
    ...allRuns.filter((r) => hasInbound.has(r)),
  ];

  const dbg = typeof process !== 'undefined' && process.env?.DEBUG_BOOLEAN_OPS === '1';

  for (const run of orderedRuns) {
    if (visited.has(run)) continue;

    if (run.isComplete) {
      // Standalone contour — emit directly
      visited.add(run);
      contours.push([...run.cmds]);
      if (dbg) {
        const c0 = run.cmds[0];
        // eslint-disable-next-line no-console
        console.error(`[traceContours] STANDALONE source=${run.source} cmds=${run.cmds.length} start=(${c0.start.x.toFixed(3)},${c0.start.y.toFixed(3)})`);
      }
      continue;
    }

    // Trace through links
    const contour: TransformCmd[] = [];
    let current: KeptRun | undefined = run;
    const traceLog: string[] = [];
    while (current && !visited.has(current)) {
      visited.add(current);
      // Bridge gap between previous run's exit and this run's entry
      if (contour.length > 0) {
        const prevEnd = contour[contour.length - 1].end;
        const nextStart = current.cmds[0].start;
        if (!ptEq(prevEnd, nextStart)) {
          contour.push({
            command: 'l',
            args: [nextStart.x - prevEnd.x, nextStart.y - prevEnd.y],
            start: { ...prevEnd },
            end: { ...nextStart },
          });
        }
      }
      for (const cmd of current.cmds) {
        contour.push(cmd);
      }
      if (dbg) {
        const c0 = current.cmds[0];
        traceLog.push(`${current.source}@(${c0.start.x.toFixed(2)},${c0.start.y.toFixed(2)})·${current.cmds.length}`);
      }
      current = links.get(current);
    }

    if (contour.length > 0) {
      contours.push(contour);
      if (dbg) {
        const c0 = contour[0];
        // eslint-disable-next-line no-console
        console.error(`[traceContours] CHAIN runs=${traceLog.length} cmds=${contour.length} start=(${c0.start.x.toFixed(3)},${c0.start.y.toFixed(3)}): ${traceLog.join(' → ')}`);
      }
    }
  }

  return contours;
}

/**
 * Remove visible spurs — closed sub-loops where the contour returns to a
 * previously visited point through a small enclosed area — and degenerate
 * near-zero line segments. Both come from the link-assembly step when
 * overlapping curves (e.g. tightly-tracked glyph unions) produce clustered
 * intersection points that the greedy distance-based link assignment routes
 * through tiny detours.
 *
 * Conservative thresholds: only removes spurs whose endpoint distance and
 * enclosed area are both small relative to typical path coordinates. Valid
 * figure-8 / self-touching paths have larger enclosed areas and pass through.
 */
function simplifyContourSpurs(contour: TransformCmd[]): TransformCmd[] {
  // Drop degenerate near-zero `l` commands (machine-epsilon residue from
  // bridge segments inserted in traceContours when ptEq misses by < 1e-6).
  const NEAR_ZERO_DELTA = 1e-6;
  const filtered: TransformCmd[] = [];
  for (const cmd of contour) {
    if (cmdIsLine(cmd)) {
      const [dx, dy] = cmd.args;
      if (Math.abs(dx) < NEAR_ZERO_DELTA && Math.abs(dy) < NEAR_ZERO_DELTA) continue;
    }
    filtered.push(cmd);
  }

  if (filtered.length < 4) return filtered;

  // Detect spurs: walk the endpoint list, look for revisit within a small
  // window. If found and the enclosed sub-area is small, drop the spur.
  // Threshold is adaptive: max(50, 0.0001 × bbox area). The minimum keeps
  // the prior behavior at typical scales; the relative term scales up so
  // larger glyphs still catch their (proportionally larger) wrong-link
  // loops without dropping serif features at small scales. Solves §2.7.
  const SPUR_POINT_TOL = 1e-3;
  const SPUR_MAX_WINDOW = 6;
  const SPUR_MAX_PASSES = 8;

  let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
  for (const p of filtered) {
    if (p.end.x < bMinX) bMinX = p.end.x;
    if (p.end.y < bMinY) bMinY = p.end.y;
    if (p.end.x > bMaxX) bMaxX = p.end.x;
    if (p.end.y > bMaxY) bMaxY = p.end.y;
  }
  const bboxArea = isFinite(bMinX) ? (bMaxX - bMinX) * (bMaxY - bMinY) : 0;
  const SPUR_AREA_THRESHOLD = Math.max(50, bboxArea * 0.0001);

  let result = filtered;
  for (let pass = 0; pass < SPUR_MAX_PASSES; pass++) {
    const next = removeOneSpur(result, SPUR_POINT_TOL, SPUR_AREA_THRESHOLD, SPUR_MAX_WINDOW);
    if (next === result) break;
    result = next;
  }
  return result;
}

function removeOneSpur(
  contour: TransformCmd[],
  pointTol: number,
  areaThreshold: number,
  maxWindow: number,
): TransformCmd[] {
  const ends = contour.map((c) => c.end);
  for (let i = 0; i < ends.length - 1; i++) {
    const limit = Math.min(ends.length, i + 1 + maxWindow);
    for (let j = i + 1; j < limit; j++) {
      const dx = ends[i].x - ends[j].x;
      const dy = ends[i].y - ends[j].y;
      if (Math.abs(dx) >= pointTol || Math.abs(dy) >= pointTol) continue;
      // Shoelace area of the polygon formed by ends[i], ends[i+1], ..., ends[j]
      let area2 = 0;
      for (let k = i; k < j; k++) {
        const a = ends[k];
        const b = ends[k + 1];
        area2 += a.x * b.y - b.x * a.y;
      }
      const area = Math.abs(area2) / 2;
      if (area >= areaThreshold) continue;
      // Drop segments (i+1)..j inclusive. The next segment at position j+1
      // (if any) had start = ends[j]; its delta args remain valid since
      // ends[i] ≈ ends[j] within pointTol.
      const head = contour.slice(0, i + 1);
      const tail = contour.slice(j + 1);
      if (tail.length > 0) {
        const cmd = tail[0];
        // Snap the next command's start to ends[i] so the contour is exact.
        tail[0] = { ...cmd, start: { ...ends[i] } };
      }
      return [...head, ...tail];
    }
  }
  return contour;
}

/**
 * Assemble the result path from classified segments using ring-based traversal.
 * Replaces greedy endpoint matching with Weiler-Atherton style ordered traversal
 * that uses explicit intersection links between path rings.
 */
function assembleResult(
  splitsA: SplitSegment[], classesA: SegmentClass[],
  splitsB: SplitSegment[], classesB: SegmentClass[],
  op: BooleanOp, bboxDiag: number,
): TransformCmd[] {
  // Step 1: Build ordered rings
  const ringsA = buildRings(splitsA, classesA, op, 'A');
  const ringsB = buildRings(splitsB, classesB, op, 'B');

  // Step 2: Extract kept runs from each ring
  const allRunsA: KeptRun[] = [];
  const allRunsB: KeptRun[] = [];
  for (const ring of ringsA) {
    allRunsA.push(...extractKeptRuns(ring, 'A'));
  }
  for (const ring of ringsB) {
    allRunsB.push(...extractKeptRuns(ring, 'B'));
  }

  const allRuns = [...allRunsA, ...allRunsB];
  if (allRuns.length === 0) return [];

  // Step 3: Build intersection links between runs (tangent-aware Hungarian)
  const nonCompleteA = allRunsA.filter(r => !r.isComplete);
  const nonCompleteB = allRunsB.filter(r => !r.isComplete);
  const links = buildIntersectionLinks(nonCompleteA, nonCompleteB, bboxDiag);

  // Step 4: Trace contours
  const tracedContours = traceContours(allRuns, links);

  // Step 4.5: Simplify each contour — remove near-zero edges and small spurs
  // that arise when overlapping shapes (e.g. tightly-tracked glyphs) produce
  // clusters of intersection points where greedy link assignment routes the
  // contour through a tiny detour and back.
  const contours = tracedContours.map(simplifyContourSpurs);

  // Step 5: Emit output with m/z wrapping
  const result: TransformCmd[] = [];
  for (const contour of contours) {
    if (contour.length === 0) continue;
    const first = contour[0];
    // MoveTo
    result.push({
      command: 'm',
      args: [first.start.x, first.start.y],
      start: { x: 0, y: 0 },
      end: { ...first.start },
    });
    // Draw commands
    for (const cmd of contour) {
      result.push(cmd);
    }
    // ClosePath
    const last = contour[contour.length - 1];
    result.push({
      command: 'z',
      args: [],
      start: { ...last.end },
      end: { ...first.start },
    });
  }

  return result;
}

function adjustArgsForStart(origCmd: TransformCmd, newStart: Point): number[] {
  // For relative commands, args represent deltas from start, so if we shift start
  // we need to adjust the end-relative values
  const u = origCmd.command.toLowerCase();
  const dx = origCmd.end.x - newStart.x;
  const dy = origCmd.end.y - newStart.y;

  if (cmdIsLine(origCmd)) {
    return [dx, dy];
  }

  if (u === 'c') {
    const [dx1, dy1, dx2, dy2] = origCmd.args;
    // Absolute control points
    const cp1x = origCmd.start.x + dx1;
    const cp1y = origCmd.start.y + dy1;
    const cp2x = origCmd.start.x + dx2;
    const cp2y = origCmd.start.y + dy2;
    return [cp1x - newStart.x, cp1y - newStart.y, cp2x - newStart.x, cp2y - newStart.y, dx, dy];
  }

  if (u === 'q') {
    const [dx1, dy1] = origCmd.args;
    const cpx = origCmd.start.x + dx1;
    const cpy = origCmd.start.y + dy1;
    return [cpx - newStart.x, cpy - newStart.y, dx, dy];
  }

  if (u === 'a') {
    const [rx, ry, rot, la, sw] = origCmd.args;
    return [rx, ry, rot, la, sw, dx, dy];
  }

  return [dx, dy];
}

// ─── Path Validation ────────────────────────────────────────────────────────

function validateClosedPath(cmds: TransformCmd[], label: string): void {
  if (cmds.length === 0) {
    throw new Error(`Boolean operation: ${label} path is empty`);
  }

  const drawCmds = getDrawCmds(cmds);
  if (drawCmds.length === 0) {
    throw new Error(`Boolean operation: ${label} path has no drawing commands`);
  }

  // Check if path ends with 'z' or start ≈ end
  const last = cmds[cmds.length - 1];
  const hasClose = last.command.toLowerCase() === 'z';

  if (!hasClose) {
    // Check if first draw command start ≈ last draw command end
    const firstDraw = drawCmds[0];
    const lastDraw = drawCmds[drawCmds.length - 1];
    if (!ptEq(firstDraw.start, lastDraw.end)) {
      throw new Error(
        `Boolean operation: ${label} path is not closed (no 'z' command and start/end points do not coincide)`,
      );
    }
  }
}

/** Split a command array into per-subpath groups.
 *  Splits after each 'z' command, since PathBlock commands may not include
 *  explicit 'm' commands between subpaths. Each resulting subpath ends with 'z'. */
function splitCmdsIntoSubpaths(cmds: TransformCmd[]): TransformCmd[][] {
  const subpaths: TransformCmd[][] = [];
  let current: TransformCmd[] = [];
  for (const cmd of cmds) {
    current.push(cmd);
    if (cmd.command.toLowerCase() === 'z') {
      subpaths.push(current);
      current = [];
    }
  }
  if (current.length > 0) subpaths.push(current);
  return subpaths;
}

/** Extract just the drawing commands (no move, no close) for intersection work. */
function extractDrawCmds(cmds: TransformCmd[]): TransformCmd[] {
  const result: TransformCmd[] = [];
  for (const cmd of cmds) {
    const u = cmd.command.toLowerCase();
    if (u === 'm') continue;
    if (u === 'z') {
      // Convert close to explicit line if it has visibly nonzero length.
      // The looser threshold (1e-6 vs ptEq's 1e-8) drops accumulated
      // float drift that would otherwise appear as a degenerate `l` like
      // `l 3.18e-9 1.23e-8` after the contour's start `m` — visible in
      // boolean-op outputs that round-trip through assembleResult's z.
      const cdx = cmd.end.x - cmd.start.x;
      const cdy = cmd.end.y - cmd.start.y;
      if (Math.abs(cdx) >= 1e-6 || Math.abs(cdy) >= 1e-6) {
        result.push({
          command: 'l',
          args: [cdx, cdy],
          start: { ...cmd.start },
          end: { ...cmd.end },
        });
      }
      continue;
    }
    result.push(cmd);
  }
  return result;
}

/** Reconstruct full path commands including 'z' closings from draw commands.
 *  Handles multi-subpath inputs by detecting endpoint discontinuities and
 *  closing each subpath individually. */
function includeClosingSegment(cmds: TransformCmd[]): TransformCmd[] {
  if (cmds.length === 0) return [];
  const result: TransformCmd[] = [];
  let subpathStartIdx = 0;

  for (let i = 0; i < cmds.length; i++) {
    result.push(cmds[i]);
    const isLast = i === cmds.length - 1;
    const isSubpathEnd = isLast || !ptEq(cmds[i].end, cmds[i + 1].start);

    if (isSubpathEnd) {
      const first = cmds[subpathStartIdx];
      const current = cmds[i];
      if (!ptEq(current.end, first.start)) {
        result.push({
          command: 'l',
          args: [first.start.x - current.end.x, first.start.y - current.end.y],
          start: { ...current.end },
          end: { ...first.start },
        });
      }
      subpathStartIdx = i + 1;
    }
  }
  return result;
}

// ─── Glyph Topology Normalization (§2.14) ───────────────────────────────────

/**
 * Compute the signed area of a single closed subpath using the shoelace
 * formula on segment endpoints. Curve interior bumps are ignored (start →
 * end chord is used) — the SIGN is what matters for winding-direction
 * detection, and the chord polygon has the same winding sign as the curved
 * polygon for any non-self-intersecting closed contour.
 *
 * Convention: in SVG (y-down) coordinates, positive shoelace = clockwise
 * visually = "outer" winding (TTF convention). Negative = counterclockwise
 * = "hole" winding.
 */
function subpathSignedArea(cmds: TransformCmd[]): number {
  // Curves are sampled rather than reduced to their chords: a chord-only
  // shoelace degenerates to exactly 0 for chord-symmetric contours (e.g.
  // a circle built from two arcs), which misclassifies winding direction.
  let area = 0;
  for (const cmd of cmds) {
    const u = cmd.command.toLowerCase();
    if (u === 'm' || u === 'z') continue;
    const n = (u === 'c' || u === 'q' || u === 'a') ? 8 : 1;
    let prev = cmd.start;
    for (let i = 1; i <= n; i++) {
      const p = i === n ? cmd.end : evalCmd(cmd, i / n);
      area += prev.x * p.y - p.x * prev.y;
      prev = p;
    }
  }
  return area / 2;
}

/**
 * §2.14 normalization Phase 1: drop subpaths that are fully enclosed by
 * another subpath of the SAME winding direction within the same path.
 *
 * Rationale: under nonzero fill rule, two CW subpaths nested produce winding
 * count 2 in their overlap and 1 elsewhere — both fill the same. The inner
 * subpath contributes no visible region. Glyph fonts that encode such
 * "additive" reinforcement subpaths (Playfair Bold capital E ships with 3
 * CW subpaths: outer + 2 small internal decorations) produce spurious extra
 * contours in boolean op output because the additive runs survive
 * classification as STANDALONE rings — they show as visible artifacts when
 * the result is stroked.
 *
 * Holes (opposite winding to their enclosing outer) are preserved — those
 * are legitimate counters that must remain to carve out unfilled regions.
 *
 * Disjoint subpaths of any winding combination are preserved — only NESTED
 * subpaths of the SAME winding are dropped.
 */
function dropNestedSameWindingSubpaths(cmds: TransformCmd[]): TransformCmd[] {
  const subpaths = splitCmdsIntoSubpaths(cmds);
  if (subpaths.length < 2) return cmds;

  // Compute winding direction for each subpath
  const isCW: boolean[] = subpaths.map(sp => subpathSignedArea(sp) > 0);

  // For each subpath, find a representative point GENUINELY INSIDE its
  // boundary. Picking the first vertex is unsafe — if that vertex
  // coincides with another subpath's edge, the winding-number test for
  // containment becomes ambiguous (boundary case). Instead: try several
  // candidates (bbox center, centroid of vertices, midpoints of segments)
  // and accept the first one whose windingNumber against the subpath ITSELF
  // is non-zero, confirming it's strictly interior.
  const testPoints: (Point | null)[] = subpaths.map(sp => {
    const drawCmds = extractDrawCmds(sp);
    if (drawCmds.length === 0) return null;

    // Collect candidate points
    const candidates: Point[] = [];

    // Candidate 1: bbox center
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of drawCmds) {
      minX = Math.min(minX, c.start.x, c.end.x);
      minY = Math.min(minY, c.start.y, c.end.y);
      maxX = Math.max(maxX, c.start.x, c.end.x);
      maxY = Math.max(maxY, c.start.y, c.end.y);
    }
    candidates.push({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });

    // Candidate 2: centroid of vertex starts
    let sumX = 0, sumY = 0, n = 0;
    for (const c of drawCmds) { sumX += c.start.x; sumY += c.start.y; n++; }
    if (n > 0) candidates.push({ x: sumX / n, y: sumY / n });

    // Candidates 3+: midpoints of each segment, slightly offset toward the
    // bbox center (inward). For a closed simple curve, midpoint+offset is
    // very likely strictly interior.
    for (const c of drawCmds) {
      const mx = (c.start.x + c.end.x) / 2;
      const my = (c.start.y + c.end.y) / 2;
      const dx = candidates[0].x - mx;
      const dy = candidates[0].y - my;
      const dlen = Math.sqrt(dx * dx + dy * dy);
      if (dlen < 1e-9) continue;
      const eps = Math.min(0.01, dlen * 0.1);
      candidates.push({ x: mx + (dx / dlen) * eps, y: my + (dy / dlen) * eps });
    }

    // Accept the first candidate strictly inside the subpath itself
    for (const cand of candidates) {
      const wn = windingNumber(cand, drawCmds);
      if (wn !== 0) return cand;
    }
    return null;
  });

  // Mark subpaths that are nested inside another same-winding subpath.
  const dropped = new Set<number>();
  const dbg = typeof process !== 'undefined' && process.env?.DEBUG_BOOLEAN_OPS === '1';
  for (let i = 0; i < subpaths.length; i++) {
    const pt = testPoints[i];
    if (!pt) continue;
    if (dbg) {
      // eslint-disable-next-line no-console
      console.error(`[normalize] subpath[${i}] pt=(${pt.x.toFixed(2)},${pt.y.toFixed(2)}) cw=${isCW[i]} area=${subpathSignedArea(subpaths[i]).toFixed(2)}`);
    }
    for (let j = 0; j < subpaths.length; j++) {
      if (i === j) continue;
      if (dropped.has(j)) continue;
      if (isCW[i] !== isCW[j]) continue;
      const segs = extractDrawCmds(subpaths[j]);
      const wn = windingNumber(pt, segs);
      if (dbg) {
        // eslint-disable-next-line no-console
        console.error(`  vs subpath[${j}] (cw=${isCW[j]}): wn=${wn}`);
      }
      if (wn !== 0) {
        dropped.add(i);
        break;
      }
    }
  }

  if (dbg && dropped.size > 0) {
    // eslint-disable-next-line no-console
    console.error(`[normalize] dropping subpaths: ${[...dropped].join(',')}`);
  }

  if (dropped.size === 0) return cmds;

  const result: TransformCmd[] = [];
  for (let i = 0; i < subpaths.length; i++) {
    if (!dropped.has(i)) result.push(...subpaths[i]);
  }
  return result;
}

/**
 * §2.14 normalization Phase 2: split a single-subpath self-intersecting
 * contour into multiple non-self-intersecting subpaths.
 *
 * Used to clean up glyph fonts (e.g. Playfair Bold lowercase e) that
 * encode a letterform's outer perimeter AND interior bowl counter as a
 * single 40-cmd contour that crosses itself. Without splitting, the
 * boolean op classifier sees ambiguous topology — inside-vs-outside is
 * ill-defined at self-intersection points — and produces visible
 * artifacts in stroked output (the "peninsula" extending into the bowl).
 *
 * Algorithm:
 *  1. Find every self-intersection: pair of non-adjacent segments that
 *     cross at interior parametric values.
 *  2. Split each intersected segment at its t-values; build a list of
 *     "pieces" (sub-segments) in cyclic contour order.
 *  3. Default cyclic next-pointer: piece[i] → piece[(i+1) mod n].
 *  4. At each self-intersection node N, swap the next-pointers of the
 *     two pieces ending at N: each now points to the OTHER segment's
 *     continuation (X-pattern crossing). This cleaves the single cycle
 *     into multiple cycles.
 *  5. Walk the next-pointer graph to extract closed cycles, each
 *     becoming a separate non-self-intersecting subpath.
 *
 * Multi-subpath inputs: each subpath is processed independently. Shared
 * winding still requires the Phase 1 union step.
 */
function splitSelfIntersectingContour(cmds: TransformCmd[]): TransformCmd[] {
  // Only operate on single-subpath inputs. Multi-subpath inputs come from
  // either (a) glyphs that already separate counter from outer (no
  // self-intersection in any single subpath), or (b) outputs of previous
  // boolean ops (already topologically clean by construction). Running
  // O(n²) self-intersection detection on those is expensive and
  // unnecessary; chained .union(B).union(C) calls would otherwise
  // re-process accumulating results and exhaust memory.
  const subpaths = splitCmdsIntoSubpaths(cmds);
  if (subpaths.length !== 1) return cmds;

  const split = splitOneSubpathSelfIntersections(subpaths[0]);
  if (split === subpaths[0]) return cmds;
  return split;
}

function splitOneSubpathSelfIntersections(subpath: TransformCmd[]): TransformCmd[] {
  const segs = extractDrawCmds(subpath);
  if (segs.length < 4) return subpath;

  const n = segs.length;

  // Find self-intersections (non-adjacent pairs only).
  type SI = { iA: number; tA: number; iB: number; tB: number; pt: Point };
  const selfInts: SI[] = [];
  for (let iA = 0; iA < n; iA++) {
    for (let iB = iA + 1; iB < n; iB++) {
      const adjacent = iB === iA + 1 || (iA === 0 && iB === n - 1);
      if (adjacent) continue;
      const ints = pairwiseIntersect(segs[iA], segs[iB]);
      for (const ix of ints) {
        const EPS = PARAMETRIC_EPSILON * 100;
        if (ix.tA <= EPS || ix.tA >= 1 - EPS) continue;
        if (ix.tB <= EPS || ix.tB >= 1 - EPS) continue;
        selfInts.push({ iA, tA: ix.tA, iB, tB: ix.tB, pt: ix.point });
      }
    }
  }
  if (selfInts.length === 0) return subpath;

  // For each segment, gather (t, intId) pairs.
  const perSegTs = new Map<number, Array<{ t: number; intId: number }>>();
  selfInts.forEach((si, idx) => {
    if (!perSegTs.has(si.iA)) perSegTs.set(si.iA, []);
    if (!perSegTs.has(si.iB)) perSegTs.set(si.iB, []);
    perSegTs.get(si.iA)!.push({ t: si.tA, intId: idx });
    perSegTs.get(si.iB)!.push({ t: si.tB, intId: idx });
  });

  type Piece = {
    cmd: TransformCmd;
    fromOrigSeg: number;
    startNode: number; // intersection ID, or -1 if at segment endpoint
    endNode: number;
  };
  const pieces: Piece[] = [];

  for (let i = 0; i < n; i++) {
    const ts = (perSegTs.get(i) ?? []).slice().sort((a, b) => a.t - b.t);
    const splits = [0, ...ts.map(x => x.t), 1];
    for (let k = 0; k < splits.length - 1; k++) {
      const tStart = splits[k];
      const tEnd = splits[k + 1];
      if (tEnd - tStart < PARAMETRIC_EPSILON) continue;
      const subCmd = splitCmdRange(segs[i], tStart, tEnd);
      pieces.push({
        cmd: subCmd,
        fromOrigSeg: i,
        startNode: k === 0 ? -1 : ts[k - 1].intId,
        endNode: k === splits.length - 2 ? -1 : ts[k].intId,
      });
    }
  }

  // Default cyclic next pointers.
  const nextPtr: number[] = pieces.map((_, idx) => (idx + 1) % pieces.length);

  // At each intersection node, swap the two incoming pieces' next-pointers
  // (X-pattern: each crosses to the OTHER segment's continuation).
  for (let nodeId = 0; nodeId < selfInts.length; nodeId++) {
    const incoming: number[] = [];
    const outgoing: number[] = [];
    pieces.forEach((p, idx) => {
      if (p.endNode === nodeId) incoming.push(idx);
      if (p.startNode === nodeId) outgoing.push(idx);
    });
    if (incoming.length !== 2 || outgoing.length !== 2) continue;

    const inA = incoming[0];
    const inB = incoming[1];
    const segIn0 = pieces[inA].fromOrigSeg;
    const segIn1 = pieces[inB].fromOrigSeg;
    const outOnSegA = outgoing.find(o => pieces[o].fromOrigSeg === segIn0);
    const outOnSegB = outgoing.find(o => pieces[o].fromOrigSeg === segIn1);
    if (outOnSegA === undefined || outOnSegB === undefined) continue;

    nextPtr[inA] = outOnSegB;
    nextPtr[inB] = outOnSegA;
  }

  // Walk cycles.
  const visited = new Set<number>();
  const subpathOuts: TransformCmd[][] = [];
  for (let start = 0; start < pieces.length; start++) {
    if (visited.has(start)) continue;
    const cycleCmds: TransformCmd[] = [];
    let cur = start;
    let safety = 0;
    while (!visited.has(cur) && safety < pieces.length * 2) {
      visited.add(cur);
      cycleCmds.push(pieces[cur].cmd);
      cur = nextPtr[cur];
      safety++;
    }
    if (cycleCmds.length > 0) subpathOuts.push(cycleCmds);
  }

  if (subpathOuts.length <= 1) return subpath;

  // Reassemble each cycle as a closed subpath. Use lowercase 'm' (relative
  // moveto) per the codebase convention — TransformCmd.command is always
  // lowercase, with absolute start/end points carried alongside for
  // tracking. Uppercase 'M' would falls through commandsToRelativeD's
  // catch-all and emit a literal absolute "M dx dy" with relative
  // displacement, putting the path at the wrong absolute position when
  // drawTo() translates it later.
  const result: TransformCmd[] = [];
  for (let cycleIdx = 0; cycleIdx < subpathOuts.length; cycleIdx++) {
    const cycle = subpathOuts[cycleIdx];
    if (cycle.length === 0) continue;
    const first = cycle[0];
    // Compute relative move from the previous subpath's last point (or
    // origin for the first subpath).
    const prevEnd: Point = cycleIdx === 0
      ? { x: 0, y: 0 }
      : { ...subpathOuts[cycleIdx - 1][subpathOuts[cycleIdx - 1].length - 1].end };
    result.push({
      command: 'm',
      args: [first.start.x - prevEnd.x, first.start.y - prevEnd.y],
      start: { ...prevEnd },
      end: { ...first.start },
    });
    for (const c of cycle) result.push(c);
    const last = cycle[cycle.length - 1];
    result.push({
      command: 'z',
      args: [],
      start: { ...last.end },
      end: { ...first.start },
    });
  }

  if (typeof process !== 'undefined' && process.env?.DEBUG_BOOLEAN_OPS === '1') {
    // eslint-disable-next-line no-console
    console.error(`[normalize-self-split] ${selfInts.length} self-intersection(s), produced ${subpathOuts.length} subpath(s)`);
  }

  return result;
}

/**
 * §2.14 normalization Phase 1b: union pairs of same-winding subpaths
 * within a single path that are NOT strictly nested but DO touch or
 * partially overlap. Examples from glyph fonts:
 *   - Playfair Bold capital E ships the cap-bar's "T" decoration as a
 *     separate subpath that partially overlaps the E's outer outline at
 *     the cap-bar edge. The two are visually one shape but encoded as
 *     two subpaths; without merging, the boolean op against another
 *     glyph treats them as independent and the merge produces visible
 *     gaps where the T meets the outer.
 *
 * Algorithm: bbox overlap is the cheap pre-filter. If bboxes overlap,
 * test for boundary contact via findAllIntersections + shared-edge
 * detection. If contact exists, recursively call booleanOp(union) on
 * the two subpaths and replace them with the merged result. Iterate to
 * fixed point.
 *
 * Recursion termination: the recursive booleanOp call passes two
 * single-subpath inputs. dropNestedSameWindingSubpaths and this
 * function both early-return when subpaths.length < 2, so no further
 * normalization fires inside the recursive call.
 */
function unionIntersectingSameWindingSubpaths(cmds: TransformCmd[]): TransformCmd[] {
  let subpaths = splitCmdsIntoSubpaths(cmds);
  if (subpaths.length < 2) return cmds;

  const dbg = typeof process !== 'undefined' && process.env?.DEBUG_BOOLEAN_OPS === '1';

  // Compute bbox for each subpath (using draw command endpoints; curve
  // bumps add at most a few units on either side, which is acceptable
  // for bbox-overlap pre-filtering).
  type SP = { cmds: TransformCmd[]; cw: boolean; bbox: { minX: number; minY: number; maxX: number; maxY: number } };
  const computeBbox = (sp: TransformCmd[]) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of sp) {
      const u = c.command.toLowerCase();
      if (u === 'm' || u === 'z') continue;
      minX = Math.min(minX, c.start.x, c.end.x);
      minY = Math.min(minY, c.start.y, c.end.y);
      maxX = Math.max(maxX, c.start.x, c.end.x);
      maxY = Math.max(maxY, c.start.y, c.end.y);
    }
    return { minX, minY, maxX, maxY };
  };
  const bboxesOverlap = (a: SP['bbox'], b: SP['bbox']) =>
    !(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY);

  // Find a representative interior point for each subpath. Tries bbox
  // center, vertex centroid, and segment midpoints offset toward the
  // bbox center; accepts the first candidate strictly inside the
  // subpath (windingNumber !== 0 against itself). Used for "nested
  // inside" detection where boundaries don't cross.
  const findInteriorPoint = (sp: TransformCmd[]): Point | null => {
    const drawCmds = extractDrawCmds(sp);
    if (drawCmds.length === 0) return null;
    const candidates: Point[] = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of drawCmds) {
      minX = Math.min(minX, c.start.x, c.end.x);
      minY = Math.min(minY, c.start.y, c.end.y);
      maxX = Math.max(maxX, c.start.x, c.end.x);
      maxY = Math.max(maxY, c.start.y, c.end.y);
    }
    candidates.push({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
    let sumX = 0, sumY = 0, n = 0;
    for (const c of drawCmds) { sumX += c.start.x; sumY += c.start.y; n++; }
    if (n > 0) candidates.push({ x: sumX / n, y: sumY / n });
    for (const c of drawCmds) {
      const mx = (c.start.x + c.end.x) / 2;
      const my = (c.start.y + c.end.y) / 2;
      const dx = candidates[0].x - mx;
      const dy = candidates[0].y - my;
      const dlen = Math.sqrt(dx * dx + dy * dy);
      if (dlen < 1e-9) continue;
      const eps = Math.min(0.01, dlen * 0.1);
      candidates.push({ x: mx + (dx / dlen) * eps, y: my + (dy / dlen) * eps });
    }
    for (const cand of candidates) {
      const wn = windingNumber(cand, drawCmds);
      if (wn !== 0) return cand;
    }
    return null;
  };

  let entries: SP[] = subpaths.map(sp => ({
    cmds: sp,
    cw: subpathSignedArea(sp) > 0,
    bbox: computeBbox(sp),
  }));

  let changed = true;
  let iter = 0;
  const maxIter = entries.length * entries.length; // safety
  while (changed && iter < maxIter) {
    changed = false;
    iter++;
    let mergedAt: [number, number] | null = null;
    let mergedResult: TransformCmd[] | null = null;
    outer: for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (entries[i].cw !== entries[j].cw) continue;
        if (!bboxesOverlap(entries[i].bbox, entries[j].bbox)) continue;
        const segsI = extractDrawCmds(entries[i].cmds);
        const segsJ = extractDrawCmds(entries[j].cmds);
        // Detect: boundary crossings, shared edges, OR one nested inside other.
        const { intersections, sharedEdges } = findAllIntersections(segsI, segsJ);
        let touches = intersections.length > 0 || sharedEdges.length > 0;
        if (!touches) {
          const ptI = findInteriorPoint(entries[i].cmds);
          const ptJ = findInteriorPoint(entries[j].cmds);
          if (ptI && windingNumber(ptI, segsJ) !== 0) touches = true;
          else if (ptJ && windingNumber(ptJ, segsI) !== 0) touches = true;
        }
        if (!touches) continue;
        // Skip merge if the two subpaths share a full-range
        // opposite-direction edge (artificial split-along-an-edge case).
        // This pattern arises when an earlier union step in a chain
        // produced output where one continuous CW outline was split into
        // two CW subpaths along a diagonal edge. The two subpaths share
        // that diagonal in opposite parametric directions, covering the
        // entire parametric range of one of the segments. Re-merging
        // them via booleanOp(union, normalize:false) introduces a notch
        // (visible as the Bebas Neue CUTTING U-bowl artifact) because
        // the recursive op doesn't handle this specific input topology
        // cleanly. Leaving them as separate CW subpaths is fine under
        // nonzero fill — the two filled regions sum correctly.
        const FULL_RANGE_TOL = 1e-3;
        const hasFullOppositeShared = sharedEdges.some(se => {
          if (se.sameDirection) return false;
          const aFull = se.aStart < FULL_RANGE_TOL && se.aEnd > 1 - FULL_RANGE_TOL;
          const bFull = se.bStart < FULL_RANGE_TOL && se.bEnd > 1 - FULL_RANGE_TOL;
          return aFull && bFull;
        });
        if (hasFullOppositeShared) {
          if (dbg) {
            // eslint-disable-next-line no-console
            console.error(`[normalize-union] skip subpath[${i}] + subpath[${j}]: artificial split-along-edge (full-range opposite-direction shared edge)`);
          }
          continue;
        }
        // Contact exists. Union the two subpaths.
        try {
          const merged = booleanOp(entries[i].cmds, entries[j].cmds, 'union', { normalize: false });
          if (merged.length === 0) continue; // degenerate; skip
          mergedAt = [i, j];
          mergedResult = merged;
          if (dbg) {
            // eslint-disable-next-line no-console
            console.error(`[normalize-union] merged subpath[${i}] + subpath[${j}] (cw=${entries[i].cw}, intersections=${intersections.length}, shared=${sharedEdges.length}) → ${splitCmdsIntoSubpaths(merged).length} subpath(s)`);
          }
          break outer;
        } catch {
          // recursive boolean op failed; leave them as-is
          continue;
        }
      }
    }
    if (mergedAt && mergedResult) {
      const [i, j] = mergedAt;
      const newSubpaths = splitCmdsIntoSubpaths(mergedResult);
      const next: SP[] = [];
      for (let k = 0; k < entries.length; k++) {
        if (k !== i && k !== j) next.push(entries[k]);
      }
      for (const sp of newSubpaths) {
        next.push({ cmds: sp, cw: subpathSignedArea(sp) > 0, bbox: computeBbox(sp) });
      }
      entries = next;
      changed = true;
    }
  }

  if (entries.length === subpaths.length) {
    // No merges happened
    return cmds;
  }

  const result: TransformCmd[] = [];
  for (const e of entries) result.push(...e.cmds);
  return result;
}

// ─── Core Boolean Operation ─────────────────────────────────────────────────

function booleanOp(
  cmdsA: TransformCmd[], cmdsB: TransformCmd[], op: BooleanOp,
  options: { normalize?: boolean } = {},
): TransformCmd[] {
  validateClosedPath(cmdsA, 'first');
  validateClosedPath(cmdsB, 'second');

  // §2.14 input normalization. Skipped on recursive entry (set by
  // unionIntersectingSameWindingSubpaths' inner booleanOp call) to
  // avoid infinite recursion / memory explosion on chained unions.
  // Two passes:
  //   (Phase 2) splitSelfIntersectingContour: find self-touch points
  //   in single-subpath inputs and split into separate non-self-touching
  //   subpaths. Glyph fonts (Playfair Bold lowercase e) sometimes encode
  //   the whole letterform — outer + bowl counter — as a single
  //   self-intersecting contour. Without splitting, the boolean op's
  //   intersection finder sees this as one path with internal crossings
  //   and produces ambiguous run classifications.
  //   (Phase 1) unionIntersectingSameWindingSubpaths: merge same-winding
  //   subpaths that touch, overlap, or are nested (Playfair Bold
  //   capital E's outer + 2 additive subpaths). After Phase 2 splits a
  //   self-touching contour, Phase 1 may need to merge sibling pieces
  //   if they share boundaries.
  if (options.normalize !== false) {
    cmdsA = splitSelfIntersectingContour(cmdsA);
    cmdsB = splitSelfIntersectingContour(cmdsB);
    cmdsA = unionIntersectingSameWindingSubpaths(cmdsA);
    cmdsB = unionIntersectingSameWindingSubpaths(cmdsB);
  }

  // Extract draw-only segments, converting z to lines where needed
  let segsA = extractDrawCmds(cmdsA);
  let segsB = extractDrawCmds(cmdsB);

  // Ensure closing segments
  segsA = includeClosingSegment(segsA);
  segsB = includeClosingSegment(segsB);

  if (segsA.length === 0 || segsB.length === 0) return [];

  // Step 1: Find all intersections (and shared-edge regions, §2.13)
  const { intersections, sharedEdges } = findAllIntersections(segsA, segsB);

  // Check if there are effective intersections (ones that create actual splits).
  // Vertex-vertex intersections (both t at endpoints) don't create splits but
  // their presence in the array would bypass handleNoIntersections.
  const hasEffectiveSplits = intersections.some(ix =>
    (ix.tA > PARAMETRIC_EPSILON && ix.tA < 1 - PARAMETRIC_EPSILON) ||
    (ix.tB > PARAMETRIC_EPSILON && ix.tB < 1 - PARAMETRIC_EPSILON),
  );
  if (intersections.length === 0 || !hasEffectiveSplits) {
    return handleNoIntersections(cmdsA, cmdsB, segsA, segsB, op);
  }

  // Step 2: Split segments at intersections, marking splits within
  // shared-edge regions as `boundary: true` for the §2.13 classifier.
  const splitsA = splitPathAtIntersections(segsA, intersections, 'A', sharedEdges);
  const splitsB = splitPathAtIntersections(segsB, intersections, 'B', sharedEdges);

  // Step 3: Classify each split segment.
  // 5th arg (otherSegs) MUST equal 2nd arg (otherPath): both are "the
  // other path's segment array", used by isCrossingAtBoundary's lookup
  // of ix.segA/ix.segB indices into the other path. Earlier code passed
  // the SAME-side path as otherSegs, which made tangent lookups index
  // out of bounds when the other path's segment index exceeded the
  // same-side length — silently dropping isCrossingAtBoundary matches
  // and corrupting flip parity in classifyByRingWalk. Surfaced as the
  // §2.11 Raleway-200 ExtraLight EN counter-fill artifact.
  const classesA = classifyAllSegments(splitsA, segsB, intersections, 'A', segsB);
  const classesB = classifyAllSegments(splitsB, segsA, intersections, 'B', segsA);

  // Step 4: Assemble result. Pass shape-scale diag so the tangent-aware
  // link assembly uses size-relative thresholds and weights.
  const bboxDiag = computeBBoxDiag(segsA, segsB);
  return assembleResult(splitsA, classesA, splitsB, classesB, op, bboxDiag);
}

function handleNoIntersections(
  cmdsA: TransformCmd[], cmdsB: TransformCmd[],
  segsA: TransformCmd[], segsB: TransformCmd[],
  op: BooleanOp,
): TransformCmd[] {
  // Sample a point from each path and test containment
  const sampleA = evalCmd(segsA[0], 0.5);
  const sampleB = evalCmd(segsB[0], 0.5);
  const aInsideB = windingNumber(sampleA, segsB) !== 0;
  const bInsideA = windingNumber(sampleB, segsA) !== 0;

  switch (op) {
    case 'union':
      if (aInsideB) return [...cmdsB]; // A inside B, result is B
      if (bInsideA) return [...cmdsA]; // B inside A, result is A
      // Disjoint: combine both paths
      return [...cmdsA, ...cmdsB];

    case 'intersection':
      if (aInsideB) return [...cmdsA]; // A inside B, result is A
      if (bInsideA) return [...cmdsB]; // B inside A, result is B
      return []; // Disjoint: no intersection

    case 'difference':
      if (aInsideB) return []; // A inside B, nothing left
      if (bInsideA) {
        // Hole: A minus B = A with B reversed as hole
        const reversedB = reverseEntirePath(cmdsB);
        return [...cmdsA, ...reversedB];
      }
      return [...cmdsA]; // Disjoint: A unchanged

    case 'xor':
      if (aInsideB || bInsideA) {
        // One inside other: result is outer with inner reversed as hole
        const outer = aInsideB ? cmdsB : cmdsA;
        const inner = aInsideB ? cmdsA : cmdsB;
        const reversedInner = reverseEntirePath(inner);
        return [...outer, ...reversedInner];
      }
      // Disjoint: both paths
      return [...cmdsA, ...cmdsB];
  }
}

function reverseEntirePath(cmds: TransformCmd[]): TransformCmd[] {
  const subpaths = splitCmdsIntoSubpaths(cmds);
  const result: TransformCmd[] = [];
  for (const subpath of subpaths) {
    result.push(...reverseSingleSubpath(subpath));
  }
  return result;
}

function reverseSingleSubpath(cmds: TransformCmd[]): TransformCmd[] {
  const drawCmds = extractDrawCmds(cmds);
  if (drawCmds.length === 0) return [];

  const reversed: TransformCmd[] = [];
  // Start with moveTo at the original path's end
  const lastEnd = drawCmds[drawCmds.length - 1].end;
  reversed.push({
    command: 'm',
    args: [lastEnd.x, lastEnd.y],
    start: { x: 0, y: 0 },
    end: { ...lastEnd },
  });

  // Reverse each draw command in reverse order
  for (let i = drawCmds.length - 1; i >= 0; i--) {
    reversed.push(reverseCmd(drawCmds[i]));
  }

  // Close
  reversed.push({
    command: 'z',
    args: [],
    start: { ...drawCmds[0].start },
    end: { ...lastEnd },
  });

  return reversed;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Compute the union of two closed SVG paths.
 * The result contains the area covered by either path.
 * Multi-subpath inputs (e.g. glyphs with counters) are passed through intact —
 * booleanOp preserves winding-based holes via includeClosingSegment.
 */
export function pathUnion(cmdsA: TransformCmd[], cmdsB: TransformCmd[]): TransformCmd[] {
  return booleanOp(cmdsA, cmdsB, 'union');
}

/**
 * Compute the difference of two closed SVG paths (A minus B).
 * The result contains the area of A that is not covered by B.
 * Multi-subpath B (e.g. glyphs with counters) is handled as a unit so that
 * inner holes are preserved via reverseEntirePath's per-subpath reversal.
 */
export function pathDifference(cmdsA: TransformCmd[], cmdsB: TransformCmd[]): TransformCmd[] {
  return booleanOp(cmdsA, cmdsB, 'difference');
}

/**
 * Compute the intersection of two closed SVG paths.
 * The result contains only the area covered by both paths.
 */
export function pathIntersection(cmdsA: TransformCmd[], cmdsB: TransformCmd[]): TransformCmd[] {
  return booleanOp(cmdsA, cmdsB, 'intersection');
}

/**
 * Compute the symmetric difference (XOR) of two closed SVG paths.
 * The result contains the area covered by exactly one of the paths.
 * Implemented as difference(A,B) ∪ difference(B,A) to produce clean
 * separate subpaths rather than a single self-intersecting contour.
 */
export function pathXor(cmdsA: TransformCmd[], cmdsB: TransformCmd[]): TransformCmd[] {
  const aMinusB = booleanOp(cmdsA, cmdsB, 'difference');
  const bMinusA = booleanOp(cmdsB, cmdsA, 'difference');
  return [...aMinusB, ...bMinusA];
}

// ─── Path Cutting (pathCut) ─────────────────────────────────────────────────
//
// Slices a subject path (open or closed, multi-contour) along the strokes of
// a cutter path whose subpaths are open chains (a knife) or closed loops
// (cookie cutters). Unlike the boolean ops above, the cutter is never closed
// and the assembly stage is a planar-arrangement face walk rather than the
// winding-classified ring/run pipeline: subject boundary fragments are
// one-sided half-edges (material on the left after winding canonicalization),
// cutter fragments are twinned, and every traced face is a material piece.

const CUT_JUNCTION_EPS = PARAMETRIC_EPSILON * 100;
/** Scale-aware distance under which nearby intersection records collapse
 *  into one arrangement node: capped at the module's historical absolute
 *  0.5 so idiomatic viewBox-scale drawings behave as before, but shrinking
 *  with the drawing so tiny-coordinate cuts don't get swallowed. */
function cutNodeMergeDist(bboxDiag: number): number {
  return Math.max(1e-9, Math.min(0.5, bboxDiag * 2.5e-3));
}

function cutDebug(msg: string): void {
  if (typeof process !== 'undefined' && process.env?.DEBUG_BOOLEAN_OPS === '1') {
    // eslint-disable-next-line no-console
    console.error(`  pathCut: ${msg}`);
  }
}

function angleOfVec(p: Point): number {
  return Math.atan2(p.y, p.x);
}

function mod2pi(a: number): number {
  const t = a % (2 * Math.PI);
  return t < 0 ? t + 2 * Math.PI : t;
}

/** Recompute a command's args for a nudged end point (start unchanged).
 *  Interior control data is preserved; only the trailing end delta moves. */
function adjustArgsForEnd(cmd: TransformCmd, newEnd: Point): number[] {
  const u = cmd.command.toLowerCase();
  const dx = newEnd.x - cmd.start.x;
  const dy = newEnd.y - cmd.start.y;
  if (cmdIsLine(cmd)) return [dx, dy];
  if (u === 'c') {
    const [dx1, dy1, dx2, dy2] = cmd.args;
    return [dx1, dy1, dx2, dy2, dx, dy];
  }
  if (u === 'q') {
    const [dx1, dy1] = cmd.args;
    return [dx1, dy1, dx, dy];
  }
  if (u === 'a') {
    const [rx, ry, rot, la, sw] = cmd.args;
    return [rx, ry, rot, la, sw, dx, dy];
  }
  return [dx, dy];
}

function rebaseCmdStart(cmd: TransformCmd, newStart: Point): TransformCmd {
  if (ptEq(cmd.start, newStart)) return cmd;
  return { command: cmd.command, args: adjustArgsForStart(cmd, newStart), start: { ...newStart }, end: { ...cmd.end } };
}

function rebaseCmdEnd(cmd: TransformCmd, newEnd: Point): TransformCmd {
  if (ptEq(cmd.end, newEnd)) return cmd;
  return { command: cmd.command, args: adjustArgsForEnd(cmd, newEnd), start: { ...cmd.start }, end: { ...newEnd } };
}

/** Signed area of a closed ring of draw commands. Curve-sampled (see
 *  subpathSignedArea). Positive = interior on the left of travel. */
function ringSignedArea(cmds: TransformCmd[]): number {
  return subpathSignedArea(cmds);
}

function ringDiag(cmds: TransformCmd[]): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cmd of cmds) {
    for (const p of [cmd.start, cmd.end]) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!isFinite(minX)) return 0;
  return Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2);
}

/** Find a point strictly inside the region enclosed by a closed ring, by
 *  offsetting from segment midpoints along both normals. */
function interiorSampleOfRing(cmds: TransformCmd[]): Point | null {
  const diag = ringDiag(cmds);
  const deltas = [Math.max(1e-3, diag * 1e-3), Math.max(1e-2, diag * 1e-2)];
  for (const cmd of cmds) {
    const u = cmd.command.toLowerCase();
    if (u === 'm' || u === 'z') continue;
    const p = evalCmd(cmd, 0.5);
    const p2 = evalCmd(cmd, 0.55);
    let tx = p2.x - p.x, ty = p2.y - p.y;
    const len = Math.sqrt(tx * tx + ty * ty);
    if (len < 1e-12) continue;
    tx /= len; ty /= len;
    for (const delta of deltas) {
      for (const s of [1, -1]) {
        const q = { x: p.x + s * delta * -ty, y: p.y + s * delta * tx };
        if (windingNumber(q, cmds) !== 0) return q;
      }
    }
  }
  return null;
}

/** Reverse a ring in place-order: commands reversed and each command flipped. */
function reverseRing(cmds: TransformCmd[]): TransformCmd[] {
  const out: TransformCmd[] = [];
  for (let i = cmds.length - 1; i >= 0; i--) out.push(reverseCmd(cmds[i]));
  return out;
}

/**
 * Canonicalize winding of the subject's closed rings so material is always
 * on the LEFT of every directed boundary segment: rings at even containment
 * depth get positive signed area, rings at odd depth negative. This is the
 * invariant the face walk depends on.
 */
function canonicalizeRingWindings(rings: TransformCmd[][]): TransformCmd[][] {
  const samples = rings.map(r => interiorSampleOfRing(r));
  return rings.map((ring, i) => {
    const sample = samples[i];
    let depth = 0;
    if (sample) {
      for (let j = 0; j < rings.length; j++) {
        if (j === i) continue;
        if (windingNumber(sample, rings[j]) !== 0) depth++;
      }
    }
    const wantPositive = depth % 2 === 0;
    const area = ringSignedArea(ring);
    if ((area > 0) === wantPositive || area === 0) return ring;
    return reverseRing(ring);
  });
}

/** Split a flat draw-segment array into chains at endpoint discontinuities. */
function splitSegsIntoChains(segs: TransformCmd[]): { segs: TransformCmd[]; startIdx: number; isClosed: boolean }[] {
  const chains: { segs: TransformCmd[]; startIdx: number; isClosed: boolean }[] = [];
  let current: TransformCmd[] = [];
  let startIdx = 0;
  const flush = () => {
    if (current.length > 0) {
      const isClosed = ptEq(current[0].start, current[current.length - 1].end);
      chains.push({ segs: current, startIdx, isClosed });
    }
  };
  for (let i = 0; i < segs.length; i++) {
    if (current.length > 0 && !ptEq(current[current.length - 1].end, segs[i].start)) {
      flush();
      current = [];
      startIdx = i;
    }
    current.push(segs[i]);
  }
  flush();
  return chains;
}

/** Nearest point on a command to `pt` — coarse sampling + golden-section refine. */
function nearestOnCmd(pt: Point, cmd: TransformCmd): { t: number; d2: number } {
  let bestT = 0;
  let bestD2 = Infinity;
  const f = (t: number): number => {
    const p = evalCmd(cmd, t);
    return (p.x - pt.x) ** 2 + (p.y - pt.y) ** 2;
  };
  for (let i = 0; i <= 32; i++) {
    const t = i / 32;
    const d2 = f(t);
    if (d2 < bestD2) { bestD2 = d2; bestT = t; }
  }
  let lo = Math.max(0, bestT - 1 / 32);
  let hi = Math.min(1, bestT + 1 / 32);
  const phi = (Math.sqrt(5) - 1) / 2;
  let c = hi - phi * (hi - lo);
  let d = lo + phi * (hi - lo);
  let fc = f(c), fd = f(d);
  for (let i = 0; i < 48; i++) {
    if (fc < fd) {
      hi = d; d = c; fd = fc;
      c = hi - phi * (hi - lo); fc = f(c);
    } else {
      lo = c; c = d; fc = fd;
      d = lo + phi * (hi - lo); fd = f(d);
    }
  }
  const t = (lo + hi) / 2;
  return { t, d2: f(t) };
}

interface CutNodeTable {
  points: Point[];
  parent: number[];
  /** Node-clustering distance (see cutNodeMergeDist). */
  mergeDist: number;
}

function cutNodeFind(table: CutNodeTable, id: number): number {
  let root = id;
  while (table.parent[root] !== root) root = table.parent[root];
  while (table.parent[id] !== root) {
    const next = table.parent[id];
    table.parent[id] = root;
    id = next;
  }
  return root;
}

function cutNodeUnion(table: CutNodeTable, a: number, b: number): number {
  const ra = cutNodeFind(table, a);
  const rb = cutNodeFind(table, b);
  if (ra !== rb) table.parent[rb] = ra;
  return ra;
}

/** Get-or-create the node for a record point, clustering within the table's merge distance. */
function cutNodeFor(table: CutNodeTable, pt: Point): number {
  for (let i = 0; i < table.points.length; i++) {
    if (cutNodeFind(table, i) !== i) continue;
    if (dist(table.points[i], pt) < table.mergeDist) return i;
  }
  table.points.push({ ...pt });
  table.parent.push(table.points.length - 1);
  return table.points.length - 1;
}

interface CutEdge {
  cmds: TransformCmd[];
  fromNode: number; // -1 = dangling (unlabeled chain end)
  toNode: number;
  /** All fragments lie on a shared (collinear) stretch of the subject boundary. */
  boundary: boolean;
}

interface CutChainSplit {
  edges: CutEdge[];
  /** Non-null when the chain has no arrangement nodes: a closed, uncut loop. */
  cycle: TransformCmd[] | null;
}

/**
 * Split one chain at its labeled (noded) positions into arrangement edges.
 * Boundaries within MIN-length of each other merge (their nodes unioned).
 * `entries[localSeg]` lists `{ t, node }` intersection positions on that
 * segment; `sharedRanges[localSeg]` lists parametric ranges lying on a
 * shared edge with the other path (used to flag boundary fragments).
 */
function splitChainAtNodes(
  chain: { segs: TransformCmd[]; isClosed: boolean },
  entries: Map<number, { t: number; node: number }[]>,
  sharedRanges: Map<number, { start: number; end: number }[]>,
  table: CutNodeTable,
): CutChainSplit {
  const segs = chain.segs;
  // Ordered stream of items along the chain: draw fragments and noded boundaries.
  type Item = { kind: 'cmd'; cmd: TransformCmd; boundary: boolean } | { kind: 'node'; node: number };
  const items: Item[] = [];
  // Junction labels indexed by junction position (0..segs.length); merged below.
  const junctionNodes: (number | null)[] = new Array(segs.length + 1).fill(null);
  const interiorBySeg: { t: number; node: number }[][] = segs.map(() => []);

  for (let i = 0; i < segs.length; i++) {
    const list = entries.get(i);
    if (!list || list.length === 0) continue;
    const sorted = [...list].sort((a, b) => a.t - b.t);
    for (const e of sorted) {
      if (e.t <= CUT_JUNCTION_EPS) {
        junctionNodes[i] = junctionNodes[i] === null ? e.node : cutNodeUnion(table, junctionNodes[i]!, e.node);
      } else if (e.t >= 1 - CUT_JUNCTION_EPS) {
        junctionNodes[i + 1] = junctionNodes[i + 1] === null ? e.node : cutNodeUnion(table, junctionNodes[i + 1]!, e.node);
      } else {
        interiorBySeg[i].push(e);
      }
    }
    // Merge near-coincident interior boundaries (same crossing found twice).
    const interior = interiorBySeg[i];
    const merged: { t: number; node: number }[] = [];
    for (const e of interior) {
      const prev = merged[merged.length - 1];
      if (prev) {
        const pPrev = evalCmd(segs[i], prev.t);
        const pCur = evalCmd(segs[i], e.t);
        if (dist(pPrev, pCur) < table.mergeDist) {
          prev.node = cutNodeUnion(table, prev.node, e.node);
          prev.t = (prev.t + e.t) / 2;
          continue;
        }
      }
      merged.push({ t: e.t, node: e.node });
    }
    interiorBySeg[i] = merged;
  }

  // For a closed chain the first and last junction are the same place.
  if (chain.isClosed) {
    const a = junctionNodes[0], b = junctionNodes[segs.length];
    if (a !== null && b !== null) {
      const u = cutNodeUnion(table, a, b);
      junctionNodes[0] = u;
      junctionNodes[segs.length] = u;
    } else if (a !== null) {
      junctionNodes[segs.length] = a;
    } else if (b !== null) {
      junctionNodes[0] = b;
    }
  }

  for (let i = 0; i < segs.length; i++) {
    if (junctionNodes[i] !== null) items.push({ kind: 'node', node: junctionNodes[i]! });
    const ranges = sharedRanges.get(i) ?? [];
    const inShared = (t0: number, t1: number): boolean =>
      ranges.some(r => t0 >= r.start - CUT_JUNCTION_EPS && t1 <= r.end + CUT_JUNCTION_EPS);
    const cuts = interiorBySeg[i];
    let prevT = 0;
    for (const e of cuts) {
      if (e.t - prevT > PARAMETRIC_EPSILON) {
        items.push({ kind: 'cmd', cmd: splitCmdRange(segs[i], prevT, e.t), boundary: inShared(prevT, e.t) });
      }
      items.push({ kind: 'node', node: e.node });
      prevT = e.t;
    }
    if (1 - prevT > PARAMETRIC_EPSILON) {
      items.push({ kind: 'cmd', cmd: splitCmdRange(segs[i], prevT, 1), boundary: inShared(prevT, 1) });
    }
  }
  if (junctionNodes[segs.length] !== null && !chain.isClosed) {
    items.push({ kind: 'node', node: junctionNodes[segs.length]! });
  }

  const hasNode = items.some(it => it.kind === 'node');
  if (!hasNode) {
    return { edges: [], cycle: items.map(it => (it as { kind: 'cmd'; cmd: TransformCmd }).cmd) };
  }

  // For closed chains, rotate the stream so it starts at a node — the
  // wraparound run before the first node belongs to the last edge.
  let stream = items;
  if (chain.isClosed) {
    const firstNodeIdx = items.findIndex(it => it.kind === 'node');
    stream = [...items.slice(firstNodeIdx), ...items.slice(0, firstNodeIdx)];
    stream.push(stream[0]); // close the loop back to the starting node
  }

  const edges: CutEdge[] = [];
  let currentCmds: TransformCmd[] = [];
  let currentBoundary = true;
  let fromNode = -1;
  let sawFirstNode = false;
  for (const it of stream) {
    if (it.kind === 'cmd') {
      currentCmds.push(it.cmd);
      currentBoundary = currentBoundary && it.boundary;
    } else {
      if (sawFirstNode || currentCmds.length > 0) {
        if (currentCmds.length > 0) {
          edges.push({ cmds: currentCmds, fromNode, toNode: it.node, boundary: currentBoundary });
        }
      }
      fromNode = it.node;
      sawFirstNode = true;
      currentCmds = [];
      currentBoundary = true;
    }
  }
  if (currentCmds.length > 0) {
    edges.push({ cmds: currentCmds, fromNode, toNode: -1, boundary: currentBoundary });
  }
  return { edges, cycle: null };
}

/** Snap an edge's boundary command endpoints onto its canonical node points. */
function snapEdgeToNodes(edge: CutEdge, table: CutNodeTable): CutEdge {
  let cmds = edge.cmds;
  if (edge.fromNode >= 0 && cmds.length > 0) {
    const pt = table.points[cutNodeFind(table, edge.fromNode)];
    cmds = [rebaseCmdStart(cmds[0], pt), ...cmds.slice(1)];
  }
  if (edge.toNode >= 0 && cmds.length > 0) {
    const pt = table.points[cutNodeFind(table, edge.toNode)];
    cmds = [...cmds.slice(0, -1), rebaseCmdEnd(cmds[cmds.length - 1], pt)];
  }
  return { ...edge, cmds };
}

interface CutHalfEdge {
  cmds: TransformCmd[];
  fromNode: number;
  toNode: number;
  twin: number; // index into the half-edge array, or -1 for one-sided
  visited: boolean;
}

/**
 * Trace the faces of the arrangement. At each node the successor of an
 * arriving half-edge is the clockwise-most outgoing half-edge relative to
 * the reversed arrival direction — the standard interior-to-the-left face
 * walk. Because subject edges are one-sided with material on the left,
 * every traced face is a material region; the unbounded face and hole
 * interiors are never traced.
 */
function traceCutFaces(halfEdges: CutHalfEdge[], table: CutNodeTable, warnings?: string[]): TransformCmd[][] {
  const outsByNode = new Map<number, number[]>();
  for (let i = 0; i < halfEdges.length; i++) {
    const n = cutNodeFind(table, halfEdges[i].fromNode);
    if (!outsByNode.has(n)) outsByNode.set(n, []);
    outsByNode.get(n)!.push(i);
  }

  const departureAngle = (heIdx: number): number => angleOfVec(tangentAtStart(halfEdges[heIdx].cmds[0]));
  const probeAngle = (heIdx: number): number => {
    const he = halfEdges[heIdx];
    const origin = he.cmds[0].start;
    const probe = evalCmd(he.cmds[0], 0.1);
    return angleOfVec({ x: probe.x - origin.x, y: probe.y - origin.y });
  };

  const successor = (arriving: number): number | null => {
    const he = halfEdges[arriving];
    const node = cutNodeFind(table, he.toNode);
    const outs = outsByNode.get(node);
    if (!outs || outs.length === 0) return null;
    const dirIn = tangentAtEnd(he.cmds[he.cmds.length - 1]);
    const thetaRev = angleOfVec({ x: -dirIn.x, y: -dirIn.y });
    let best: number | null = null;
    let bestDelta = Infinity;
    let secondDelta = Infinity;
    let second: number | null = null;
    for (const cand of outs) {
      let delta = mod2pi(thetaRev - departureAngle(cand));
      // The exact reversal (the twin) must rank last, not first —
      // otherwise every face would immediately U-turn.
      if (delta < 1e-9) delta = 2 * Math.PI;
      if (delta < bestDelta) {
        second = best; secondDelta = bestDelta;
        best = cand; bestDelta = delta;
      } else if (delta < secondDelta) {
        second = cand; secondDelta = delta;
      }
    }
    // Tangent-coincident tie (e.g. a curve splitting off a tangent line):
    // separate by curvature using a probe point along each candidate.
    if (best !== null && second !== null && Math.abs(bestDelta - secondDelta) < 1e-7) {
      const thetaRevProbe = thetaRev;
      let dBest = mod2pi(thetaRevProbe - probeAngle(best));
      let dSecond = mod2pi(thetaRevProbe - probeAngle(second));
      if (dBest < 1e-9) dBest = 2 * Math.PI;
      if (dSecond < 1e-9) dSecond = 2 * Math.PI;
      if (dSecond < dBest) best = second;
    }
    return best;
  };

  const faces: TransformCmd[][] = [];
  for (let start = 0; start < halfEdges.length; start++) {
    if (halfEdges[start].visited) continue;
    const face: TransformCmd[] = [];
    let cur = start;
    let ok = true;
    let guard = 0;
    for (;;) {
      const he = halfEdges[cur];
      if (he.visited) { ok = cur === start && face.length > 0; break; }
      he.visited = true;
      // Bridge sub-tolerance gaps between consecutive fragments.
      if (face.length > 0) {
        const prevEnd = face[face.length - 1].end;
        const curStart = he.cmds[0].start;
        if (!ptEq(prevEnd, curStart) && dist(prevEnd, curStart) > 1e-6) {
          face.push({
            command: 'l',
            args: [curStart.x - prevEnd.x, curStart.y - prevEnd.y],
            start: { ...prevEnd },
            end: { ...curStart },
          });
        }
      }
      face.push(...he.cmds);
      const next = successor(cur);
      if (next === null) { ok = false; break; }
      if (next === start) break;
      cur = next;
      if (++guard > halfEdges.length + 8) { ok = false; break; }
    }
    if (ok && face.length > 0) {
      faces.push(face);
    } else if (face.length > 0) {
      warnings?.push('cut(): a piece could not be traced cleanly and was dropped — the result may be missing a fragment');
      cutDebug(`dropped malformed face of ${face.length} cmds starting at half-edge ${start}`);
    }
  }
  return faces;
}

/** Append a ring's draw commands to `out`, closed with `z`. The first ring
 *  of a piece carries no leading `m` — the serializer's bridgeOriginGap
 *  positions it (same convention as fillet-shifted closed paths), which
 *  keeps bounding boxes free of a fictitious origin point. Subsequent rings
 *  are separated by an `m` (the cursor-aware serializer only reads its
 *  `end`). */
function emitRing(ring: TransformCmd[], out: TransformCmd[]): void {
  if (ring.length === 0) return;
  const first = ring[0];
  if (out.length > 0) {
    out.push({
      command: 'm',
      args: [first.start.x, first.start.y],
      start: { ...first.start },
      end: { ...first.start },
    });
  }
  for (const cmd of ring) out.push(cmd);
  const last = ring[ring.length - 1];
  out.push({
    command: 'z',
    args: [],
    start: { ...last.end },
    end: { ...first.start },
  });
}

/**
 * Cut a path with the strokes of another path.
 *
 * The subject may be open or closed and may contain multiple contours
 * (islands and holes). Each cutter subpath is one knife stroke: open chains
 * slice wherever they fully cross material; closed loops act as cookie
 * cutters. Cutter endpoints within a scale-relative tolerance of the subject
 * boundary snap onto it; a stroke that dead-ends inside contributes nothing.
 *
 * Returns one command array per resulting piece. Closed pieces are healed
 * (re-closed along the cut lines) with holes carried as extra subpaths;
 * open-subject pieces are open fragments. If nothing is cut, returns the
 * subject verbatim as a single piece.
 */
export function pathCut(subjectCmds: TransformCmd[], cutterCmds: TransformCmd[], warnings?: string[]): TransformCmd[][] {
  if (subjectCmds.length === 0) return [];

  // ── Cutter prep: draw segments only, never re-closed ──
  const cutterSegsAll = extractDrawCmds(cutterCmds);
  if (cutterSegsAll.length === 0) return [[...subjectCmds]];

  // ── Subject prep: partition subpaths into closed and open ──
  const closedGroups: TransformCmd[][] = [];
  const openChains: TransformCmd[][] = [];
  for (const sp of splitCmdsIntoSubpaths(subjectCmds)) {
    // splitCmdsIntoSubpaths only splits on z; also split on m/discontinuity.
    const draw = extractDrawCmds(sp);
    if (draw.length === 0) continue;
    for (const chain of splitSegsIntoChains(draw)) {
      if (chain.isClosed) closedGroups.push(chain.segs);
      else openChains.push(chain.segs);
    }
  }

  // Closed subject rings: normalization prologue (glyph outlines are often
  // self-touching), then re-extract, close, and canonicalize winding.
  let subjRings: TransformCmd[][] = [];
  if (closedGroups.length > 0) {
    let closedCmds: TransformCmd[] = [];
    for (const g of closedGroups) {
      emitRing(g, closedCmds);
    }
    closedCmds = splitSelfIntersectingContour(closedCmds);
    closedCmds = unionIntersectingSameWindingSubpaths(closedCmds);
    const segs = includeClosingSegment(extractDrawCmds(closedCmds));
    subjRings = splitSegsIntoChains(segs).map(c => c.segs);
    subjRings = canonicalizeRingWindings(subjRings);
  }
  const subjSegs: TransformCmd[] = subjRings.flat();
  const openSegs: TransformCmd[] = openChains.flat();

  // ── Scale-aware endpoint snap tolerance ──
  const bboxDiag = computeBBoxDiag([...subjSegs, ...openSegs], cutterSegsAll);
  const snapTol = Math.max(0.5, bboxDiag * 1e-3);
  const mergeDist = cutNodeMergeDist(bboxDiag);

  // ── Endpoint snap: open cutter chain ends near the subject boundary ──
  const cutterChains = splitSegsIntoChains(cutterSegsAll);
  const snapTargets = [...subjSegs, ...openSegs];
  interface SnapInfo { subjSeg: number; tA: number; point: Point; cutterSeg: number; tB: number }
  const snaps: SnapInfo[] = [];
  if (snapTargets.length > 0) {
    for (const chain of cutterChains) {
      if (chain.isClosed) continue;
      for (const endKind of ['start', 'end'] as const) {
        const terminal = endKind === 'start' ? chain.segs[0] : chain.segs[chain.segs.length - 1];
        const pt = endKind === 'start' ? terminal.start : terminal.end;
        let best: { segIdx: number; t: number; d2: number } | null = null;
        for (let i = 0; i < snapTargets.length; i++) {
          const bb = cmdBBox(snapTargets[i]);
          if (pt.x < bb.minX - snapTol || pt.x > bb.maxX + snapTol ||
              pt.y < bb.minY - snapTol || pt.y > bb.maxY + snapTol) continue;
          const near = nearestOnCmd(pt, snapTargets[i]);
          if (!best || near.d2 < best.d2) best = { segIdx: i, t: near.t, d2: near.d2 };
        }
        if (!best || best.d2 > snapTol * snapTol) continue;
        const target = snapTargets[best.segIdx];
        let snapped = evalCmd(target, best.t);
        let snappedT = best.t;
        // Prefer the exact vertex when the projection lands near one.
        if (dist(snapped, target.start) < mergeDist) { snapped = { ...target.start }; snappedT = 0; }
        else if (dist(snapped, target.end) < mergeDist) { snapped = { ...target.end }; snappedT = 1; }
        const chainIdxInAll = cutterSegsAll.indexOf(terminal);
        if (endKind === 'start') {
          const rebased = rebaseCmdStart(terminal, snapped);
          chain.segs[0] = rebased;
          cutterSegsAll[chainIdxInAll] = rebased;
        } else {
          const rebased = rebaseCmdEnd(terminal, snapped);
          chain.segs[chain.segs.length - 1] = rebased;
          cutterSegsAll[chainIdxInAll] = rebased;
        }
        if (best.segIdx < subjSegs.length) {
          snaps.push({
            subjSeg: best.segIdx, tA: snappedT, point: snapped,
            cutterSeg: chainIdxInAll, tB: endKind === 'start' ? 0 : 1,
          });
        }
        cutDebug(`snapped cutter ${endKind} onto boundary at (${snapped.x.toFixed(3)}, ${snapped.y.toFixed(3)})`);
      }
    }
  }

  const pieces: TransformCmd[][] = [];
  let anyCut = false;

  // ── Closed-subject pipeline: planar arrangement + face walk ──
  if (subjRings.length > 0) {
    const closedPieces = cutClosedRings(subjRings, subjSegs, cutterChains, cutterSegsAll, snaps, mergeDist, warnings);
    if (closedPieces === null) {
      // No cutter fragment survived: the closed portion stays whole.
      const wholeClosed: TransformCmd[] = [];
      for (const ring of subjRings) emitRing(ring, wholeClosed);
      pieces.push(wholeClosed);
    } else {
      anyCut = true;
      pieces.push(...closedPieces);
    }
  }

  // ── Open-subject pipeline: sever at crossings ──
  for (const chainSegs of openChains) {
    const fragments = cutOpenChain(chainSegs, cutterSegsAll, mergeDist);
    if (fragments.length > 1) anyCut = true;
    pieces.push(...fragments);
  }

  if (!anyCut) return [[...subjectCmds]];
  if (pieces.length === 0) return [[...subjectCmds]];
  return pieces;
}

function cutClosedRings(
  subjRings: TransformCmd[][],
  subjSegs: TransformCmd[],
  cutterChains: { segs: TransformCmd[]; startIdx: number; isClosed: boolean }[],
  cutterSegsAll: TransformCmd[],
  snaps: { subjSeg: number; tA: number; point: Point; cutterSeg: number; tB: number }[],
  mergeDist: number,
  warnings?: string[],
): TransformCmd[][] | null {
  // ── Intersections: subject × cutter ──
  const { intersections, sharedEdges } = findAllIntersections(subjSegs, cutterSegsAll, { vertexPolicy: 'snap', vertexSnapDist: mergeDist });

  // Synthetic records for snapped endpoints the pairwise pass missed.
  for (const s of snaps) {
    const covered = intersections.some(ix =>
      ix.segA === s.subjSeg && ix.segB === s.cutterSeg && dist(ix.point, s.point) < mergeDist);
    if (!covered) {
      intersections.push({ point: { ...s.point }, tA: s.tA, tB: s.tB, segA: s.subjSeg, segB: s.cutterSeg });
    }
  }

  // ── Intersections: cutter × cutter (crossing knives subdivide each other) ──
  interface CutterPairHit { point: Point; segI: number; tI: number; segJ: number; tJ: number }
  const cutterHits: CutterPairHit[] = [];
  const chainOfSeg = new Map<number, number>();
  cutterChains.forEach((chain, ci) => {
    for (let k = 0; k < chain.segs.length; k++) chainOfSeg.set(chain.startIdx + k, ci);
  });
  for (let i = 0; i < cutterSegsAll.length; i++) {
    for (let j = i + 1; j < cutterSegsAll.length; j++) {
      const bbI = cmdBBox(cutterSegsAll[i]);
      const bbJ = cmdBBox(cutterSegsAll[j]);
      if (!bboxOverlap(bbI, bbJ)) continue;
      const sameChain = chainOfSeg.get(i) === chainOfSeg.get(j);
      const chain = sameChain ? cutterChains[chainOfSeg.get(i)!] : null;
      const adjacent = sameChain && chain !== null && (
        j - i === 1 ||
        (chain.isClosed && i === chain.startIdx && j === chain.startIdx + chain.segs.length - 1)
      );
      const hits = pairwiseIntersect(cutterSegsAll[i], cutterSegsAll[j]);
      for (const h of hits) {
        if (adjacent) {
          // Skip the shared junction of consecutive chain segments.
          const atJunction =
            (Math.abs(h.tA - 1) < CUT_JUNCTION_EPS && Math.abs(h.tB) < CUT_JUNCTION_EPS) ||
            (Math.abs(h.tA) < CUT_JUNCTION_EPS && Math.abs(h.tB - 1) < CUT_JUNCTION_EPS);
          if (atJunction) continue;
        }
        cutterHits.push({ point: h.point, segI: i, tI: h.tA, segJ: j, tJ: h.tB });
      }
    }
  }

  // ── Node table: cluster records into arrangement nodes ──
  const table: CutNodeTable = { points: [], parent: [], mergeDist };
  const subjEntries = new Map<number, { t: number; node: number }[]>();
  const cutterEntries = new Map<number, { t: number; node: number }[]>();
  const addEntry = (map: Map<number, { t: number; node: number }[]>, seg: number, t: number, node: number): void => {
    if (!map.has(seg)) map.set(seg, []);
    map.get(seg)!.push({ t, node });
  };
  for (const ix of intersections) {
    const node = cutNodeFor(table, ix.point);
    addEntry(subjEntries, ix.segA, ix.tA, node);
    addEntry(cutterEntries, ix.segB, ix.tB, node);
  }
  for (const h of cutterHits) {
    const node = cutNodeFor(table, h.point);
    addEntry(cutterEntries, h.segI, h.tI, node);
    addEntry(cutterEntries, h.segJ, h.tJ, node);
  }

  // ── Split subject rings into edges ──
  const subjEdges: CutEdge[] = [];
  const subjCycles: TransformCmd[][] = [];
  let segBase = 0;
  for (const ring of subjRings) {
    const localEntries = new Map<number, { t: number; node: number }[]>();
    const localShared = new Map<number, { start: number; end: number }[]>();
    for (let k = 0; k < ring.length; k++) {
      const global = segBase + k;
      const list = subjEntries.get(global);
      if (list) localEntries.set(k, list);
      const ranges = sharedEdges.filter(se => se.segA === global)
        .map(se => ({ start: Math.min(se.aStart, se.aEnd), end: Math.max(se.aStart, se.aEnd) }));
      if (ranges.length > 0) localShared.set(k, ranges);
    }
    const split = splitChainAtNodes({ segs: ring, isClosed: true }, localEntries, localShared, table);
    if (split.cycle) subjCycles.push(split.cycle);
    else subjEdges.push(...split.edges);
    segBase += ring.length;
  }

  // ── Split cutter chains into edges ──
  const cutterEdges: CutEdge[] = [];
  const cutterCycles: TransformCmd[][] = [];
  for (const chain of cutterChains) {
    const localEntries = new Map<number, { t: number; node: number }[]>();
    const localShared = new Map<number, { start: number; end: number }[]>();
    for (let k = 0; k < chain.segs.length; k++) {
      const global = chain.startIdx + k;
      const list = cutterEntries.get(global);
      if (list) localEntries.set(k, list);
      const ranges = sharedEdges.filter(se => se.segB === global)
        .map(se => ({ start: Math.min(se.bStart, se.bEnd), end: Math.max(se.bStart, se.bEnd) }));
      if (ranges.length > 0) localShared.set(k, ranges);
    }
    const split = splitChainAtNodes(chain, localEntries, localShared, table);
    if (split.cycle) {
      if (chain.isClosed) cutterCycles.push(split.cycle);
      // An open, uncrossed chain contributes nothing.
    } else {
      cutterEdges.push(...split.edges);
    }
  }

  // ── Prune cutter fragments ──
  // 1. Boundary-coincident fragments duplicate subject edges — drop.
  // 2. Fragments outside material (winding 0 vs the canonicalized subject,
  //    which zeroes both the exterior and hole interiors) — drop.
  // 3. Dangling fragments (unlabeled chain ends, or ends orphaned by prior
  //    pruning) — drop iteratively.
  let alive = cutterEdges.filter(e => {
    if (e.boundary) return false;
    if (e.fromNode < 0 || e.toNode < 0) return false;
    const mid = e.cmds[Math.floor(e.cmds.length / 2)];
    const sample = evalCmd(mid, 0.5);
    return windingNumber(sample, subjSegs) !== 0;
  });
  for (;;) {
    const degree = new Map<number, number>();
    const bump = (n: number): void => {
      const c = cutNodeFind(table, n);
      degree.set(c, (degree.get(c) ?? 0) + 1);
    };
    for (const e of subjEdges) { bump(e.fromNode); bump(e.toNode); }
    for (const e of alive) { bump(e.fromNode); bump(e.toNode); }
    const next = alive.filter(e =>
      (degree.get(cutNodeFind(table, e.fromNode)) ?? 0) > 1 &&
      (degree.get(cutNodeFind(table, e.toNode)) ?? 0) > 1);
    if (next.length === alive.length) break;
    alive = next;
  }

  // Surviving closed cutter loops entirely inside material: cookie cutters.
  const cookies = cutterCycles.filter(cycle => {
    const mid = cycle[Math.floor(cycle.length / 2)];
    const sample = evalCmd(mid, 0.5);
    return windingNumber(sample, subjSegs) !== 0;
  });

  if (alive.length === 0 && cookies.length === 0) return null;

  // ── Snap edge endpoints onto canonical node coordinates ──
  const snappedSubj = subjEdges.map(e => snapEdgeToNodes(e, table));
  const snappedCutter = alive.map(e => snapEdgeToNodes(e, table));

  // ── Half-edge graph ──
  const halfEdges: CutHalfEdge[] = [];
  for (const e of snappedSubj) {
    halfEdges.push({ cmds: e.cmds, fromNode: e.fromNode, toNode: e.toNode, twin: -1, visited: false });
  }
  for (const e of snappedCutter) {
    const fwd = halfEdges.length;
    halfEdges.push({ cmds: e.cmds, fromNode: e.fromNode, toNode: e.toNode, twin: fwd + 1, visited: false });
    halfEdges.push({ cmds: reverseRing(e.cmds), fromNode: e.toNode, toNode: e.fromNode, twin: fwd, visited: false });
  }

  const faces = halfEdges.length > 0 ? traceCutFaces(halfEdges, table, warnings) : [];

  // ── Collect rings: traced faces + uncut subject cycles + cookie loops ──
  interface CutRing { cmds: TransformCmd[]; area: number }
  const positives: CutRing[] = [];
  const negatives: CutRing[] = [];
  const bboxArea = ringDiag(subjSegs) ** 2 / 2;
  const areaEps = Math.max(1e-4, bboxArea * 1e-8);
  const addRing = (cmds: TransformCmd[]): void => {
    const area = ringSignedArea(cmds);
    if (Math.abs(area) < areaEps) {
      warnings?.push('cut(): a sliver piece thinner than the geometric tolerance was dropped');
      cutDebug(`dropped sliver ring, |area|=${Math.abs(area).toExponential(2)}`);
      return;
    }
    (area > 0 ? positives : negatives).push({ cmds, area });
  };
  for (const face of faces) addRing(face);
  for (const cycle of subjCycles) addRing(cycle);
  for (const cookie of cookies) {
    // A cookie loop both stamps out a piece and punches a hole in its host.
    const area = ringSignedArea(cookie);
    const positive = area > 0 ? cookie : reverseRing(cookie);
    const negative = area > 0 ? reverseRing(cookie) : cookie;
    addRing(positive);
    addRing(negative);
  }

  if (positives.length === 0) return null;

  // ── Assign holes to the smallest strictly-larger containing outer ──
  const holeAssignment = new Map<number, TransformCmd[][]>();
  for (const hole of negatives) {
    const sample = interiorSampleOfRing(hole.cmds);
    if (!sample) {
      warnings?.push('cut(): a hole contour could not be located and was dropped — a piece may be missing its hole');
      cutDebug('hole ring with no interior sample dropped');
      continue;
    }
    let bestIdx = -1;
    let bestArea = Infinity;
    for (let i = 0; i < positives.length; i++) {
      const outer = positives[i];
      if (outer.area <= Math.abs(hole.area) + 1e-9) continue; // never its own reversal
      if (windingNumber(sample, outer.cmds) === 0) continue;
      if (outer.area < bestArea) { bestArea = outer.area; bestIdx = i; }
    }
    if (bestIdx >= 0) {
      if (!holeAssignment.has(bestIdx)) holeAssignment.set(bestIdx, []);
      holeAssignment.get(bestIdx)!.push(hole.cmds);
    } else {
      warnings?.push('cut(): a hole contour had no containing piece and was dropped — a piece may be missing its hole');
      cutDebug('hole ring with no containing outer dropped');
    }
  }

  // ── Emit pieces ──
  const pieces: TransformCmd[][] = [];
  for (let i = 0; i < positives.length; i++) {
    const piece: TransformCmd[] = [];
    emitRing(positives[i].cmds, piece);
    for (const hole of holeAssignment.get(i) ?? []) emitRing(hole, piece);
    pieces.push(piece);
  }
  return pieces;
}

/** Sever an open subject chain at every cutter crossing. */
function cutOpenChain(chainSegs: TransformCmd[], cutterSegs: TransformCmd[], mergeDist: number): TransformCmd[][] {
  const table: CutNodeTable = { points: [], parent: [], mergeDist };
  const entries = new Map<number, { t: number; node: number }[]>();
  for (let i = 0; i < chainSegs.length; i++) {
    for (const cSeg of cutterSegs) {
      if (!bboxOverlap(cmdBBox(chainSegs[i]), cmdBBox(cSeg))) continue;
      const hits = pairwiseIntersect(chainSegs[i], cSeg);
      for (const h of hits) {
        const node = cutNodeFor(table, h.point);
        if (!entries.has(i)) entries.set(i, []);
        entries.get(i)!.push({ t: h.tA, node });
      }
    }
  }
  const split = splitChainAtNodes({ segs: chainSegs, isClosed: false }, entries, new Map(), table);
  const runs = split.cycle ? [split.cycle] : split.edges.map(e => e.cmds);
  // Open fragments need no leading m — bridgeOriginGap positions each piece.
  return runs.filter(r => r.length > 0).map(run => [...run]);
}

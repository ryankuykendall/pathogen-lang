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
): Intersection[] {
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
  return deduped;
}

// ─── Splitting at Intersections ─────────────────────────────────────────────

interface SplitSegment {
  cmd: TransformCmd;
  origIndex: number;
  tStart: number;
  tEnd: number;
}

function splitPathAtIntersections(
  segs: TransformCmd[],
  intersections: Intersection[],
  side: 'A' | 'B',
): SplitSegment[] {
  // Group intersection t-values by segment index
  const tsBySegment = new Map<number, number[]>();
  for (const ix of intersections) {
    const segIdx = side === 'A' ? ix.segA : ix.segB;
    const t = side === 'A' ? ix.tA : ix.tB;
    if (!tsBySegment.has(segIdx)) tsBySegment.set(segIdx, []);
    tsBySegment.get(segIdx)!.push(t);
  }

  const result: SplitSegment[] = [];

  for (let i = 0; i < segs.length; i++) {
    const cmd = segs[i];
    const ts = tsBySegment.get(i);

    if (!ts || ts.length === 0) {
      result.push({ cmd, origIndex: i, tStart: 0, tEnd: 1 });
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
      result.push({ cmd: subCmd, origIndex: i, tStart, tEnd });
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
  return adaptiveCrossing(pt, cmd, 0, 1, 8);
}

function quadraticCrossing(pt: Point, cmd: TransformCmd): number {
  return adaptiveCrossing(pt, cmd, 0, 1, 8);
}

function arcCrossing(pt: Point, cmd: TransformCmd): number {
  return adaptiveCrossing(pt, cmd, 0, 1, 12);
}

/**
 * Adaptive subdivision for winding number contribution.
 * Subdivide the curve and count crossings of linearized segments.
 */
function adaptiveCrossing(
  pt: Point, cmd: TransformCmd,
  t0: number, t1: number, depth: number,
): number {
  const p0 = evalCmd(cmd, t0);
  const p1 = evalCmd(cmd, t1);

  if (depth <= 0) {
    return lineCrossing(pt, p0, p1);
  }

  // Check if we need to subdivide: if the segment is mostly flat, linearize
  const tMid = (t0 + t1) / 2;
  const pMid = evalCmd(cmd, tMid);
  const linearMid = lerpPt(p0, p1, 0.5);
  const dev = dist(pMid, linearMid);

  if (dev < GEOMETRIC_EPSILON * 10) {
    return lineCrossing(pt, p0, p1);
  }

  return adaptiveCrossing(pt, cmd, t0, tMid, depth - 1) +
         adaptiveCrossing(pt, cmd, tMid, t1, depth - 1);
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

    // Small cross product → tangent touch; large → transverse crossing
    return Math.abs(cross) > 0.05;
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
    // Sample at t=0.3 and t=0.7 — if both agree, the segment is not on the boundary.
    let seedIdx = rStart;
    let seedClass: SegmentClass = 'outside';
    let found = false;
    for (let i = rStart; i < rEnd; i++) {
      const cmd = splits[i].cmd;
      const p1 = evalCmd(cmd, 0.3);
      const p2 = evalCmd(cmd, 0.7);
      const wn1 = windingNumber(p1, otherPath);
      const wn2 = windingNumber(p2, otherPath);
      if ((wn1 === 0) === (wn2 === 0)) {
        // Both agree on inside/outside → reliable seed
        seedIdx = i;
        seedClass = wn1 === 0 ? 'outside' : 'inside';
        found = true;
        break;
      }
    }
    if (!found) {
      // Fallback: use midpoint test on first segment
      const mid = evalCmd(splits[rStart].cmd, 0.5);
      seedClass = windingNumber(mid, otherPath) === 0 ? 'outside' : 'inside';
    }

    // Assign seed
    classes[seedIdx] = seedClass;

    // Walk forward from seed, flipping at transverse crossings
    let cls = seedClass;
    for (let i = seedIdx + 1; i < rEnd; i++) {
      if (splits[i].origIndex === splits[i - 1].origIndex) {
        // Same original segment → boundary is an intersection.
        // Only flip if it's a transverse crossing (not a tangent touch).
        if (isCrossingAtBoundary(splits[i - 1], splits[i], intersections, side, otherSegs)) {
          cls = cls === 'inside' ? 'outside' : 'inside';
        }
      }
      classes[i] = cls;
    }

    // Walk backward from seed
    cls = seedClass;
    for (let i = seedIdx - 1; i >= rStart; i--) {
      if (splits[i].origIndex === splits[i + 1].origIndex) {
        if (isCrossingAtBoundary(splits[i], splits[i + 1], intersections, side, otherSegs)) {
          cls = cls === 'inside' ? 'outside' : 'inside';
        }
      }
      classes[i] = cls;
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

function reverseCmd(cmd: TransformCmd): TransformCmd {
  const u = cmd.command.toLowerCase();
  const s = cmd.end, e = cmd.start;

  if (cmdIsLine(cmd)) {
    return { command: 'l', args: [e.x - s.x, e.y - s.y], start: s, end: e };
  }

  if (u === 'c') {
    const [dx1, dy1, dx2, dy2] = cmd.args;
    // Original absolute control points
    const cp1 = { x: cmd.start.x + dx1, y: cmd.start.y + dy1 };
    const cp2 = { x: cmd.start.x + dx2, y: cmd.start.y + dy2 };
    // Reversed: swap order, cp2 becomes first, cp1 becomes second
    return {
      command: 'c',
      args: [cp2.x - s.x, cp2.y - s.y, cp1.x - s.x, cp1.y - s.y, e.x - s.x, e.y - s.y],
      start: s, end: e,
    };
  }

  if (u === 'q') {
    const [dx1, dy1] = cmd.args;
    const cp = { x: cmd.start.x + dx1, y: cmd.start.y + dy1 };
    return {
      command: 'q',
      args: [cp.x - s.x, cp.y - s.y, e.x - s.x, e.y - s.y],
      start: s, end: e,
    };
  }

  if (u === 'a') {
    const [rx, ry, rotation, largeArc, sweep] = cmd.args;
    // Reverse arc: flip sweep flag
    return {
      command: 'a',
      args: [rx, ry, rotation, largeArc, sweep ? 0 : 1, e.x - s.x, e.y - s.y],
      start: s, end: e,
    };
  }

  return { command: 'l', args: [e.x - s.x, e.y - s.y], start: s, end: e };
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
 * Build intersection links: map each run's exit point to the matching run's
 * entry point on the other path. At intersection points, multiple segment
 * endpoints converge — use tangent dot product to pick smoothest continuation
 * when there are multiple candidates.
 */
function buildIntersectionLinks(
  runsA: KeptRun[], runsB: KeptRun[],
): Map<KeptRun, KeptRun> {
  // Distance-sorted greedy assignment: pair each run exit with a run entry on
  // the other path, processing shortest distances first. Each run participates
  // in at most one link (as exit and as entry). This replaces the fixed-
  // tolerance + fallback approach which failed when coincident arc detection
  // shifted split points away from exact intersection coordinates.
  const links = new Map<KeptRun, KeptRun>();

  interface LinkCandidate { exitRun: KeptRun; entryRun: KeptRun; d: number }
  const allCandidates: LinkCandidate[] = [];
  for (const aRun of runsA) {
    if (aRun.isComplete) continue;
    for (const bRun of runsB) {
      allCandidates.push({ exitRun: aRun, entryRun: bRun, d: dist(aRun.exitPoint, bRun.entryPoint) });
    }
  }
  for (const bRun of runsB) {
    if (bRun.isComplete) continue;
    for (const aRun of runsA) {
      allCandidates.push({ exitRun: bRun, entryRun: aRun, d: dist(bRun.exitPoint, aRun.entryPoint) });
    }
  }

  allCandidates.sort((a, b) => a.d - b.d);

  const usedExits = new Set<KeptRun>();
  const usedEntries = new Set<KeptRun>();
  for (const c of allCandidates) {
    if (usedExits.has(c.exitRun) || usedEntries.has(c.entryRun)) continue;
    links.set(c.exitRun, c.entryRun);
    usedExits.add(c.exitRun);
    usedEntries.add(c.entryRun);
  }

  return links;
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

  for (const run of allRuns) {
    if (visited.has(run)) continue;

    if (run.isComplete) {
      // Standalone contour — emit directly
      visited.add(run);
      contours.push([...run.cmds]);
      continue;
    }

    // Trace through links
    const contour: TransformCmd[] = [];
    let current: KeptRun | undefined = run;
    while (current && !visited.has(current)) {
      visited.add(current);
      // Bridge gap between previous run's exit and this run's entry
      if (contour.length > 0) {
        const prevEnd = contour[contour.length - 1].end;
        const nextStart = current.cmds[0].start;
        if (!ptEq(prevEnd, nextStart)) {
          // Insert connecting line segment for shared boundary gaps
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
      current = links.get(current);
    }

    if (contour.length > 0) {
      contours.push(contour);
    }
  }

  return contours;
}

/**
 * Assemble the result path from classified segments using ring-based traversal.
 * Replaces greedy endpoint matching with Weiler-Atherton style ordered traversal
 * that uses explicit intersection links between path rings.
 */
function assembleResult(
  splitsA: SplitSegment[], classesA: SegmentClass[],
  splitsB: SplitSegment[], classesB: SegmentClass[],
  op: BooleanOp,
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

  // Step 3: Build intersection links between runs
  const nonCompleteA = allRunsA.filter(r => !r.isComplete);
  const nonCompleteB = allRunsB.filter(r => !r.isComplete);
  const links = buildIntersectionLinks(nonCompleteA, nonCompleteB);

  // Step 4: Trace contours
  const contours = traceContours(allRuns, links);

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
      // Convert close to explicit line if it has nonzero length
      if (!ptEq(cmd.start, cmd.end)) {
        result.push({
          command: 'l',
          args: [cmd.end.x - cmd.start.x, cmd.end.y - cmd.start.y],
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

// ─── Core Boolean Operation ─────────────────────────────────────────────────

function booleanOp(
  cmdsA: TransformCmd[], cmdsB: TransformCmd[], op: BooleanOp,
): TransformCmd[] {
  validateClosedPath(cmdsA, 'first');
  validateClosedPath(cmdsB, 'second');

  // Extract draw-only segments, converting z to lines where needed
  let segsA = extractDrawCmds(cmdsA);
  let segsB = extractDrawCmds(cmdsB);

  // Ensure closing segments
  segsA = includeClosingSegment(segsA);
  segsB = includeClosingSegment(segsB);

  if (segsA.length === 0 || segsB.length === 0) return [];

  // Step 1: Find all intersections
  const intersections = findAllIntersections(segsA, segsB);

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

  // Step 2: Split segments at intersections
  const splitsA = splitPathAtIntersections(segsA, intersections, 'A');
  const splitsB = splitPathAtIntersections(segsB, intersections, 'B');

  // Step 3: Classify each split segment
  const classesA = classifyAllSegments(splitsA, segsB, intersections, 'A', segsA);
  const classesB = classifyAllSegments(splitsB, segsA, intersections, 'B', segsB);

  // Step 4: Assemble result
  return assembleResult(splitsA, classesA, splitsB, classesB, op);
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

import type { Point } from './context';
import type { PathCommandMeta } from './types';

/**
 * Minimal command interface for sampling — structurally compatible with PathBlockCommand
 */
interface SamplingCmd {
  command: string;
  args: number[];
  start: Point;
  end: Point;
  meta?: PathCommandMeta; // carried through rewrites so command identity survives
}

// ---- Length calculation (moved from index.ts) ----

function approximateCubicBezierLength(p0: Point, p1: Point, p2: Point, p3: Point): number {
  const steps = 16;
  let length = 0;
  let prevX = p0.x;
  let prevY = p0.y;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;

    const x = mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x;
    const y = mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y;

    const dx = x - prevX;
    const dy = y - prevY;
    length += Math.sqrt(dx * dx + dy * dy);
    prevX = x;
    prevY = y;
  }

  return length;
}

function approximateQuadraticBezierLength(p0: Point, p1: Point, p2: Point): number {
  const steps = 16;
  let length = 0;
  let prevX = p0.x;
  let prevY = p0.y;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;

    const x = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x;
    const y = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;

    const dx = x - prevX;
    const dy = y - prevY;
    length += Math.sqrt(dx * dx + dy * dy);
    prevX = x;
    prevY = y;
  }

  return length;
}

/**
 * Exact length of an SVG arc command. The chord alone cannot tell a minor arc
 * from its major complement or a half circle from its diameter (ISSUE-021), so
 * the flags go through the endpoint-to-center solver: circular arcs are
 * |sweep| · r, elliptical arcs integrate the speed of the parametrization
 * (Simpson, 64 slices — well under 1e-6 relative error for any sweep).
 * Degenerate arcs (coincident endpoints, zero radius) fall back to the chord.
 */
function arcCommandLength(
  start: Point,
  end: Point,
  rx: number,
  ry: number,
  phi: number,
  largeArcFlag: number,
  sweepFlag: number,
): number {
  const chord = Math.hypot(end.x - start.x, end.y - start.y);
  const c = arcEndpointToCenter(start.x, start.y, rx, ry, phi, largeArcFlag, sweepFlag, end.x, end.y);
  if (!c) return chord;
  const sweep = Math.abs(c.deltaAngle);
  if (Math.abs(c.rx - c.ry) <= 1e-10) return sweep * c.rx;
  const n = 64;
  const h = sweep / n;
  const speed = (theta: number) => Math.hypot(c.rx * Math.sin(theta), c.ry * Math.cos(theta));
  const a0 = c.startAngle;
  const dir = c.deltaAngle < 0 ? -1 : 1;
  let sum = speed(a0) + speed(a0 + dir * sweep);
  for (let i = 1; i < n; i++) sum += (i % 2 === 0 ? 2 : 4) * speed(a0 + dir * i * h);
  return (h / 3) * sum;
}

export function calculateCommandLength(cmd: SamplingCmd): number {
  const dx = cmd.end.x - cmd.start.x;
  const dy = cmd.end.y - cmd.start.y;
  const upperCmd = cmd.command.toUpperCase();

  switch (upperCmd) {
    case 'M':
      return 0;

    case 'L':
    case 'H':
    case 'V':
      return Math.sqrt(dx * dx + dy * dy);

    // T (and S below) are expected to be expanded to Q/C via resolveSmooth before
    // reaching here; these branches are a straight-line/degenerate fallback only.
    case 'T':
      return Math.sqrt(dx * dx + dy * dy);

    case 'Z':
      return Math.sqrt(dx * dx + dy * dy);

    case 'C': {
      const [x1, y1, x2, y2] = cmd.args;
      return approximateCubicBezierLength(cmd.start, controlPointOf(cmd, x1, y1), controlPointOf(cmd, x2, y2), cmd.end);
    }

    case 'S': {
      const [x2, y2] = cmd.args;
      return approximateCubicBezierLength(cmd.start, cmd.start, controlPointOf(cmd, x2, y2), cmd.end);
    }

    case 'Q': {
      const [x1, y1] = cmd.args;
      return approximateQuadraticBezierLength(cmd.start, controlPointOf(cmd, x1, y1), cmd.end);
    }

    case 'A': {
      const [rx, ry, rotation, largeArcFlag, sweepFlag] = cmd.args;
      return arcCommandLength(cmd.start, cmd.end, rx, ry, (rotation * Math.PI) / 180, largeArcFlag, sweepFlag);
    }

    default:
      return Math.sqrt(dx * dx + dy * dy);
  }
}

/**
 * Wrap an angle into (−π, π], the range `Math.atan2` returns — so a value
 * derived from a tangent (e.g. the normal, tangent − π/2) reports the same
 * numbers a program would get from `atan2` for the same direction. Exactly
 * left is +π, as for the tangent; nothing is ever reported above π.
 */
export function wrapToPi(angle: number): number {
  const TWO_PI = 2 * Math.PI;
  let a = angle - Math.floor((angle + Math.PI) / TWO_PI) * TWO_PI; // [−π, π)
  if (a <= -Math.PI) a += TWO_PI; // exactly −π → +π (and guards fp noise just below −π)
  return a;
}

export function calculatePathLength(commands: SamplingCmd[]): number {
  // Resolve smooth commands first so T/S contribute their true curve length
  // rather than a straight-line approximation (same reason sampling resolves).
  let total = 0;
  for (const cmd of resolveSmooth(commands)) {
    total += calculateCommandLength(cmd);
  }
  return total;
}

/**
 * A curve command's argument pair, resolved against the command's own case.
 *
 * `SamplingCmd.command` is case-preserved on layer records (types.ts:560): a
 * lowercase `c`/`s`/`q`/`t` carries deltas from `start`, an uppercase one carries
 * absolute coordinates. Every sampler here used to read args as deltas whatever
 * the case, so an absolutely-authored curve reached through a layer query
 * measured and sampled against control points reflected off `start` — wrong
 * lengths, wrong points, wrong tangents. `A` was never affected (its args are
 * radii and flags, and its endpoint comes from `cmd.end`), nor were `L/H/V/M/Z`.
 *
 * The relative branch returns the arguments untouched rather than recomputing
 * them, so results for lowercase input stay bit-identical.
 */
function isAbsoluteCmd(cmd: SamplingCmd): boolean {
  return cmd.command === cmd.command.toUpperCase();
}

/** The pair as an absolute point. */
function controlPointOf(cmd: SamplingCmd, ax: number, ay: number): Point {
  return isAbsoluteCmd(cmd) ? { x: ax, y: ay } : { x: cmd.start.x + ax, y: cmd.start.y + ay };
}

/** The pair as a delta from `start`. */
function controlDeltaOf(cmd: SamplingCmd, ax: number, ay: number): Point {
  return isAbsoluteCmd(cmd) ? { x: ax - cmd.start.x, y: ay - cmd.start.y } : { x: ax, y: ay };
}

// ---- resolveSmooth: convert S→C and T→Q ----
//
// A smooth command (T/S) has an implicit control point — the reflection of the
// previous Q/T (resp. C/S) control point about the current point. That control
// point cannot be recovered from a single command in isolation, so any per-command
// geometry (length, point sampling, tangent) must run on a *resolved* command list
// where T has been expanded to Q and S to C. This lives here (the lowest-level
// geometry module) so both the sampling entry points below and the transforms in
// path-transforms.ts can share it without an import cycle.
export function resolveSmooth(commands: SamplingCmd[]): SamplingCmd[] {
  const result: SamplingCmd[] = [];
  let lastCubicCP: Point | null = null; // last CP2 of C/S (absolute)
  let lastQuadCP: Point | null = null; // last CP of Q/T (absolute)

  for (const cmd of commands) {
    const upper = cmd.command.toUpperCase();

    if (upper === 'S') {
      // S x2 y2 x y → C cp1x cp1y x2 y2 dx dy. The emitted command is lowercase,
      // so every pair is written as a delta from start — controlDeltaOf converts
      // an uppercase S's absolute arguments and passes a lowercase s's through.
      const [a1, a2, a3, a4] = cmd.args;
      const cp2 = controlDeltaOf(cmd, a1, a2);
      const end = controlDeltaOf(cmd, a3, a4);
      let cp1x: number;
      let cp1y: number;
      if (lastCubicCP) {
        // Reflected point = 2*start - lastCP2 (absolute); relative to start: start - lastCP2
        cp1x = cmd.start.x - lastCubicCP.x;
        cp1y = cmd.start.y - lastCubicCP.y;
      } else {
        cp1x = 0;
        cp1y = 0;
      }
      result.push({
        command: 'c',
        args: [cp1x, cp1y, cp2.x, cp2.y, end.x, end.y],
        start: { ...cmd.start },
        end: { ...cmd.end },
        ...(cmd.meta !== undefined ? { meta: cmd.meta } : {}),
      });
      lastCubicCP = { x: cmd.start.x + cp2.x, y: cmd.start.y + cp2.y };
      lastQuadCP = null;
    } else if (upper === 'T') {
      // T x y → Q cpx cpy dx dy, likewise emitted lowercase.
      const end = controlDeltaOf(cmd, cmd.args[0], cmd.args[1]);
      let cpx: number;
      let cpy: number;
      if (lastQuadCP) {
        cpx = cmd.start.x - lastQuadCP.x;
        cpy = cmd.start.y - lastQuadCP.y;
      } else {
        cpx = 0;
        cpy = 0;
      }
      result.push({
        command: 'q',
        args: [cpx, cpy, end.x, end.y],
        start: { ...cmd.start },
        end: { ...cmd.end },
        ...(cmd.meta !== undefined ? { meta: cmd.meta } : {}),
      });
      lastQuadCP = { x: cmd.start.x + cpx, y: cmd.start.y + cpy };
      lastCubicCP = null;
    } else {
      result.push({
        command: cmd.command,
        args: [...cmd.args],
        start: { ...cmd.start },
        end: { ...cmd.end },
        ...(cmd.meta !== undefined ? { meta: cmd.meta } : {}),
      });

      // Track control points for C and Q so a following S/T can reflect them
      if (upper === 'C') {
        const [, , x2, y2] = cmd.args;
        lastCubicCP = controlPointOf(cmd, x2, y2);
        lastQuadCP = null;
      } else if (upper === 'Q') {
        const [x1, y1] = cmd.args;
        lastQuadCP = controlPointOf(cmd, x1, y1);
        lastCubicCP = null;
      } else {
        lastCubicCP = null;
        lastQuadCP = null;
      }
    }
  }

  return result;
}

// ---- Parametric curve evaluation ----

function cubicBezierAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
  };
}

function cubicBezierDerivativeAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
}

function quadBezierAt(p0: Point, p1: Point, p2: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

function quadBezierDerivativeAt(p0: Point, p1: Point, p2: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: 2 * mt * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
    y: 2 * mt * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
  };
}

// ---- Arc endpoint-to-center conversion (SVG spec F.6.5) ----

export interface ArcCenterParams {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  phi: number;
  startAngle: number;
  deltaAngle: number;
}

export function arcEndpointToCenter(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  phi: number,
  largeArcFlag: number,
  sweepFlag: number,
  x2: number,
  y2: number,
): ArcCenterParams | null {
  if (x1 === x2 && y1 === y2) return null;
  if (rx === 0 || ry === 0) return null;

  rx = Math.abs(rx);
  ry = Math.abs(ry);

  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;
  let rxSq = rx * rx;
  let rySq = ry * ry;

  const lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda);
    rx *= sqrtLambda;
    ry *= sqrtLambda;
    rxSq = rx * rx;
    rySq = ry * ry;
  }

  const num = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq;
  const denom = rxSq * y1pSq + rySq * x1pSq;
  const sign = largeArcFlag !== sweepFlag ? 1 : -1;
  const sq = sign * Math.sqrt(Math.max(num / denom, 0));
  const cxp = (sq * rx * y1p) / ry;
  const cyp = (-sq * ry * x1p) / rx;

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
    const n = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    if (n === 0) return 0;
    const c = (ux * vx + uy * vy) / n;
    let angle = Math.acos(Math.max(-1, Math.min(1, c)));
    if (ux * vy - uy * vx < 0) angle = -angle;
    return angle;
  }

  const startAngle = vectorAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let deltaAngle = vectorAngle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);

  if (sweepFlag === 0 && deltaAngle > 0) deltaAngle -= 2 * Math.PI;
  if (sweepFlag !== 0 && deltaAngle < 0) deltaAngle += 2 * Math.PI;

  return { cx, cy, rx, ry, phi, startAngle, deltaAngle };
}

export function arcPointFromCenter(p: ArcCenterParams, t: number): Point {
  const angle = p.startAngle + t * p.deltaAngle;
  const cosPhi = Math.cos(p.phi);
  const sinPhi = Math.sin(p.phi);
  const ex = p.rx * Math.cos(angle);
  const ey = p.ry * Math.sin(angle);
  return {
    x: cosPhi * ex - sinPhi * ey + p.cx,
    y: sinPhi * ex + cosPhi * ey + p.cy,
  };
}

export function arcTangentFromCenter(p: ArcCenterParams, t: number): number {
  const angle = p.startAngle + t * p.deltaAngle;
  const cosPhi = Math.cos(p.phi);
  const sinPhi = Math.sin(p.phi);
  const dex = -p.rx * Math.sin(angle);
  const dey = p.ry * Math.cos(angle);
  let tx = cosPhi * dex - sinPhi * dey;
  let ty = sinPhi * dex + cosPhi * dey;
  if (p.deltaAngle < 0) {
    tx = -tx;
    ty = -ty;
  }
  return Math.atan2(ty, tx);
}

// ---- Arc-length parameterization ----

function buildArcLengthLookup(sampleFn: (t: number) => Point, steps: number): number[] {
  const lengths = [0];
  let prev = sampleFn(0);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const pt = sampleFn(t);
    const dx = pt.x - prev.x;
    const dy = pt.y - prev.y;
    lengths.push(lengths[i - 1] + Math.sqrt(dx * dx + dy * dy));
    prev = pt;
  }
  return lengths;
}

function lookupArcLengthT(lengths: number[], fraction: number): number {
  const totalLength = lengths[lengths.length - 1];
  if (totalLength === 0) return 0;
  const targetLength = fraction * totalLength;

  let lo = 0;
  let hi = lengths.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (lengths[mid] < targetLength) lo = mid;
    else hi = mid;
  }

  const segLength = lengths[hi] - lengths[lo];
  const segFraction = segLength > 0 ? (targetLength - lengths[lo]) / segLength : 0;
  const steps = lengths.length - 1;
  return (lo + segFraction) / steps;
}

// ---- Per-command sampling (arc-length corrected) ----

export interface SampleResult {
  point: Point;
  tangent: number;
}

function sampleOnCommand(cmd: SamplingCmd, tLocal: number): SampleResult {
  const upperCmd = cmd.command.toUpperCase();

  switch (upperCmd) {
    case 'M':
      return { point: { x: cmd.start.x, y: cmd.start.y }, tangent: 0 };

    // T is grouped with the linear commands as a fallback: callers resolve smooth
    // commands (T→Q, S→C) before sampling, so a real T should never reach here.
    case 'L':
    case 'H':
    case 'V':
    case 'Z':
    case 'T': {
      const dx = cmd.end.x - cmd.start.x;
      const dy = cmd.end.y - cmd.start.y;
      return {
        point: {
          x: cmd.start.x + dx * tLocal,
          y: cmd.start.y + dy * tLocal,
        },
        tangent: dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx),
      };
    }

    case 'C': {
      const [cx1, cy1, cx2, cy2] = cmd.args;
      const p0 = cmd.start;
      const p1 = controlPointOf(cmd, cx1, cy1);
      const p2 = controlPointOf(cmd, cx2, cy2);
      const p3 = cmd.end;

      const table = buildArcLengthLookup((t) => cubicBezierAt(p0, p1, p2, p3, t), 64);
      const ct = lookupArcLengthT(table, tLocal);
      const point = cubicBezierAt(p0, p1, p2, p3, ct);
      const deriv = cubicBezierDerivativeAt(p0, p1, p2, p3, ct);
      return { point, tangent: Math.atan2(deriv.y, deriv.x) };
    }

    case 'S': {
      const [sx2, sy2] = cmd.args;
      const p0 = cmd.start;
      const p1 = p0;
      const p2 = controlPointOf(cmd, sx2, sy2);
      const p3 = cmd.end;

      const table = buildArcLengthLookup((t) => cubicBezierAt(p0, p1, p2, p3, t), 64);
      const ct = lookupArcLengthT(table, tLocal);
      const point = cubicBezierAt(p0, p1, p2, p3, ct);
      const deriv = cubicBezierDerivativeAt(p0, p1, p2, p3, ct);
      return { point, tangent: Math.atan2(deriv.y, deriv.x) };
    }

    case 'Q': {
      const [qx1, qy1] = cmd.args;
      const p0 = cmd.start;
      const p1 = controlPointOf(cmd, qx1, qy1);
      const p2 = cmd.end;

      const table = buildArcLengthLookup((t) => quadBezierAt(p0, p1, p2, t), 64);
      const ct = lookupArcLengthT(table, tLocal);
      const point = quadBezierAt(p0, p1, p2, ct);
      const deriv = quadBezierDerivativeAt(p0, p1, p2, ct);
      return { point, tangent: Math.atan2(deriv.y, deriv.x) };
    }

    case 'A': {
      const [rx, ry, rotation, largeArcFlag, sweepFlag] = cmd.args;
      const phi = (rotation * Math.PI) / 180;
      const center = arcEndpointToCenter(
        cmd.start.x,
        cmd.start.y,
        rx,
        ry,
        phi,
        largeArcFlag,
        sweepFlag,
        cmd.end.x,
        cmd.end.y,
      );

      if (!center) {
        const dx = cmd.end.x - cmd.start.x;
        const dy = cmd.end.y - cmd.start.y;
        return {
          point: { x: cmd.start.x + dx * tLocal, y: cmd.start.y + dy * tLocal },
          tangent: dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx),
        };
      }

      const needsCorrection = Math.abs(center.rx - center.ry) > 1e-10;
      if (needsCorrection) {
        const table = buildArcLengthLookup((t) => arcPointFromCenter(center, t), 64);
        const ct = lookupArcLengthT(table, tLocal);
        return { point: arcPointFromCenter(center, ct), tangent: arcTangentFromCenter(center, ct) };
      }

      return { point: arcPointFromCenter(center, tLocal), tangent: arcTangentFromCenter(center, tLocal) };
    }

    default: {
      const dx = cmd.end.x - cmd.start.x;
      const dy = cmd.end.y - cmd.start.y;
      return {
        point: { x: cmd.start.x + dx * tLocal, y: cmd.start.y + dy * tLocal },
        tangent: dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx),
      };
    }
  }
}

// ---- Command location (arc-length fraction → command index + local t) ----

export interface CommandLocation {
  cmdIndex: number;
  localT: number;
}

/**
 * Given a set of commands with precomputed lengths, find which command contains
 * the arc-length fraction `t` and compute the local fraction within that command.
 */
export function locateCommandAtFraction(
  commands: SamplingCmd[],
  cmdLengths: number[],
  totalLength: number,
  t: number,
): CommandLocation {
  if (totalLength === 0 || commands.length === 0) {
    return { cmdIndex: 0, localT: 0 };
  }

  if (t >= 1) {
    for (let i = commands.length - 1; i >= 0; i--) {
      if (cmdLengths[i] > 0) return { cmdIndex: i, localT: 1 };
    }
    return { cmdIndex: 0, localT: 0 };
  }

  const targetDist = Math.max(0, t) * totalLength;
  let accumulated = 0;

  for (let i = 0; i < commands.length; i++) {
    const cmdLen = cmdLengths[i];
    if (cmdLen === 0) continue;

    if (accumulated + cmdLen >= targetDist) {
      const localDist = targetDist - accumulated;
      const localT = localDist / cmdLen;
      return { cmdIndex: i, localT: Math.max(0, Math.min(1, localT)) };
    }

    accumulated += cmdLen;
  }

  return { cmdIndex: commands.length - 1, localT: 1 };
}

/**
 * Convert an arc-length fraction within a single command to a parametric t.
 * For lines, identity. For curves/arcs, uses arc-length lookup table.
 */
export function getParametricTForCommand(cmd: SamplingCmd, arcLengthFraction: number): number {
  if (arcLengthFraction <= 0) return 0;
  if (arcLengthFraction >= 1) return 1;

  const upperCmd = cmd.command.toUpperCase();

  switch (upperCmd) {
    case 'L':
    case 'H':
    case 'V':
    case 'Z':
    case 'M':
      // Linear: parametric t === arc-length fraction
      return arcLengthFraction;

    case 'C': {
      const [cx1, cy1, cx2, cy2] = cmd.args;
      const p0 = cmd.start;
      const p1 = controlPointOf(cmd, cx1, cy1);
      const p2 = controlPointOf(cmd, cx2, cy2);
      const p3 = cmd.end;
      const table = buildArcLengthLookup((t) => cubicBezierAt(p0, p1, p2, p3, t), 64);
      return lookupArcLengthT(table, arcLengthFraction);
    }

    case 'S': {
      const [sx2, sy2] = cmd.args;
      const p0 = cmd.start;
      const p1 = p0;
      const p2 = controlPointOf(cmd, sx2, sy2);
      const p3 = cmd.end;
      const table = buildArcLengthLookup((t) => cubicBezierAt(p0, p1, p2, p3, t), 64);
      return lookupArcLengthT(table, arcLengthFraction);
    }

    case 'Q': {
      const [qx1, qy1] = cmd.args;
      const p0 = cmd.start;
      const p1 = controlPointOf(cmd, qx1, qy1);
      const p2 = cmd.end;
      const table = buildArcLengthLookup((t) => quadBezierAt(p0, p1, p2, t), 64);
      return lookupArcLengthT(table, arcLengthFraction);
    }

    case 'T':
      // Fallback only — callers resolveSmooth (T→Q) before sampling, so a real
      // T should never reach here; treat as linear if it somehow does.
      return arcLengthFraction;

    case 'A': {
      const [rx, ry, rotation, largeArcFlag, sweepFlag] = cmd.args;
      const phi = (rotation * Math.PI) / 180;
      const center = arcEndpointToCenter(
        cmd.start.x,
        cmd.start.y,
        rx,
        ry,
        phi,
        largeArcFlag,
        sweepFlag,
        cmd.end.x,
        cmd.end.y,
      );

      if (!center) return arcLengthFraction;

      const needsCorrection = Math.abs(center.rx - center.ry) > 1e-10;
      if (needsCorrection) {
        const table = buildArcLengthLookup((t) => arcPointFromCenter(center, t), 64);
        return lookupArcLengthT(table, arcLengthFraction);
      }

      // Circular arc: parametric t === arc-length fraction
      return arcLengthFraction;
    }

    default:
      return arcLengthFraction;
  }
}

// ---- Path-level sampling ----

// Sample a fraction of an already-resolved command list (T→Q, S→C applied).
// Callers that pass raw commands must go through samplePathAtFraction so smooth
// commands are expanded first; sampling a raw T/S would treat it as a line.
function samplePathAtFractionResolved(resolved: SamplingCmd[], t: number): SampleResult {
  const cmdLengths: number[] = [];
  let totalLength = 0;
  for (const cmd of resolved) {
    const len = calculateCommandLength(cmd);
    cmdLengths.push(len);
    totalLength += len;
  }

  if (totalLength === 0) {
    return { point: { x: resolved[0].start.x, y: resolved[0].start.y }, tangent: 0 };
  }

  const loc = locateCommandAtFraction(resolved, cmdLengths, totalLength, t);
  return sampleOnCommand(resolved[loc.cmdIndex], loc.localT);
}

export function samplePathAtFraction(commands: SamplingCmd[], t: number): SampleResult {
  if (commands.length === 0) {
    return { point: { x: 0, y: 0 }, tangent: 0 };
  }
  return samplePathAtFractionResolved(resolveSmooth(commands), t);
}

export function partitionPath(commands: SamplingCmd[], n: number): SampleResult[] {
  const results: SampleResult[] = [];
  if (commands.length === 0) {
    for (let i = 0; i <= n; i++) results.push({ point: { x: 0, y: 0 }, tangent: 0 });
    return results;
  }
  // Resolve smooth commands once, then sample the resolved list n+1 times.
  const resolved = resolveSmooth(commands);
  for (let i = 0; i <= n; i++) {
    results.push(samplePathAtFractionResolved(resolved, i / n));
  }
  return results;
}

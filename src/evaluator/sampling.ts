import type { Point } from './context';

/**
 * Minimal command interface for sampling — structurally compatible with PathBlockCommand
 */
interface SamplingCmd {
  command: string;
  args: number[];
  start: Point;
  end: Point;
}

// ---- Length calculation (moved from index.ts) ----

function approximateCubicBezierLength(p0: Point, p1: Point, p2: Point, p3: Point): number {
  const steps = 16;
  let length = 0;
  let prevX = p0.x, prevY = p0.y;

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
  let prevX = p0.x, prevY = p0.y;

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

function approximateArcLength(rx: number, ry: number, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const chordLength = Math.sqrt(dx * dx + dy * dy);

  if (rx === ry && rx > 0) {
    const r = rx;
    const halfChord = chordLength / 2;
    if (halfChord >= r) return chordLength;
    const halfAngle = Math.asin(Math.min(halfChord / r, 1));
    return 2 * halfAngle * r;
  }

  const avgR = (rx + ry) / 2;
  if (avgR <= 0) return chordLength;
  const halfChord = chordLength / 2;
  if (halfChord >= avgR) return chordLength;
  const halfAngle = Math.asin(Math.min(halfChord / avgR, 1));
  return 2 * halfAngle * avgR;
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
    case 'T':
      return Math.sqrt(dx * dx + dy * dy);

    case 'Z':
      return Math.sqrt(dx * dx + dy * dy);

    case 'C': {
      const [x1, y1, x2, y2] = cmd.args;
      return approximateCubicBezierLength(
        cmd.start, { x: cmd.start.x + x1, y: cmd.start.y + y1 },
        { x: cmd.start.x + x2, y: cmd.start.y + y2 }, cmd.end
      );
    }

    case 'S': {
      const [x2, y2] = cmd.args;
      return approximateCubicBezierLength(
        cmd.start, cmd.start,
        { x: cmd.start.x + x2, y: cmd.start.y + y2 }, cmd.end
      );
    }

    case 'Q': {
      const [x1, y1] = cmd.args;
      return approximateQuadraticBezierLength(
        cmd.start, { x: cmd.start.x + x1, y: cmd.start.y + y1 }, cmd.end
      );
    }

    case 'A': {
      const [rx, ry] = cmd.args;
      return approximateArcLength(rx, ry, cmd.start, cmd.end);
    }

    default:
      return Math.sqrt(dx * dx + dy * dy);
  }
}

export function calculatePathLength(commands: SamplingCmd[]): number {
  let total = 0;
  for (const cmd of commands) {
    total += calculateCommandLength(cmd);
  }
  return total;
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
  x1: number, y1: number,
  rx: number, ry: number,
  phi: number,
  largeArcFlag: number, sweepFlag: number,
  x2: number, y2: number
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
  const sign = (largeArcFlag !== sweepFlag) ? 1 : -1;
  const sq = sign * Math.sqrt(Math.max(num / denom, 0));
  const cxp = sq * rx * y1p / ry;
  const cyp = -sq * ry * x1p / rx;

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
  let deltaAngle = vectorAngle(
    (x1p - cxp) / rx, (y1p - cyp) / ry,
    (-x1p - cxp) / rx, (-y1p - cyp) / ry
  );

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
  if (p.deltaAngle < 0) { tx = -tx; ty = -ty; }
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

  let lo = 0, hi = lengths.length - 1;
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

    case 'L': case 'H': case 'V': case 'Z': case 'T': {
      const dx = cmd.end.x - cmd.start.x;
      const dy = cmd.end.y - cmd.start.y;
      return {
        point: {
          x: cmd.start.x + dx * tLocal,
          y: cmd.start.y + dy * tLocal,
        },
        tangent: (dx === 0 && dy === 0) ? 0 : Math.atan2(dy, dx),
      };
    }

    case 'C': {
      const [cx1, cy1, cx2, cy2] = cmd.args;
      const p0 = cmd.start;
      const p1 = { x: p0.x + cx1, y: p0.y + cy1 };
      const p2 = { x: p0.x + cx2, y: p0.y + cy2 };
      const p3 = cmd.end;

      const table = buildArcLengthLookup(t => cubicBezierAt(p0, p1, p2, p3, t), 64);
      const ct = lookupArcLengthT(table, tLocal);
      const point = cubicBezierAt(p0, p1, p2, p3, ct);
      const deriv = cubicBezierDerivativeAt(p0, p1, p2, p3, ct);
      return { point, tangent: Math.atan2(deriv.y, deriv.x) };
    }

    case 'S': {
      const [sx2, sy2] = cmd.args;
      const p0 = cmd.start;
      const p1 = p0;
      const p2 = { x: p0.x + sx2, y: p0.y + sy2 };
      const p3 = cmd.end;

      const table = buildArcLengthLookup(t => cubicBezierAt(p0, p1, p2, p3, t), 64);
      const ct = lookupArcLengthT(table, tLocal);
      const point = cubicBezierAt(p0, p1, p2, p3, ct);
      const deriv = cubicBezierDerivativeAt(p0, p1, p2, p3, ct);
      return { point, tangent: Math.atan2(deriv.y, deriv.x) };
    }

    case 'Q': {
      const [qx1, qy1] = cmd.args;
      const p0 = cmd.start;
      const p1 = { x: p0.x + qx1, y: p0.y + qy1 };
      const p2 = cmd.end;

      const table = buildArcLengthLookup(t => quadBezierAt(p0, p1, p2, t), 64);
      const ct = lookupArcLengthT(table, tLocal);
      const point = quadBezierAt(p0, p1, p2, ct);
      const deriv = quadBezierDerivativeAt(p0, p1, p2, ct);
      return { point, tangent: Math.atan2(deriv.y, deriv.x) };
    }

    case 'A': {
      const [rx, ry, rotation, largeArcFlag, sweepFlag] = cmd.args;
      const phi = rotation * Math.PI / 180;
      const center = arcEndpointToCenter(
        cmd.start.x, cmd.start.y,
        rx, ry, phi,
        largeArcFlag, sweepFlag,
        cmd.end.x, cmd.end.y
      );

      if (!center) {
        const dx = cmd.end.x - cmd.start.x;
        const dy = cmd.end.y - cmd.start.y;
        return {
          point: { x: cmd.start.x + dx * tLocal, y: cmd.start.y + dy * tLocal },
          tangent: (dx === 0 && dy === 0) ? 0 : Math.atan2(dy, dx),
        };
      }

      const needsCorrection = Math.abs(center.rx - center.ry) > 1e-10;
      if (needsCorrection) {
        const table = buildArcLengthLookup(t => arcPointFromCenter(center, t), 64);
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
        tangent: (dx === 0 && dy === 0) ? 0 : Math.atan2(dy, dx),
      };
    }
  }
}

// ---- Path-level sampling ----

export function samplePathAtFraction(commands: SamplingCmd[], t: number): SampleResult {
  if (commands.length === 0) {
    return { point: { x: 0, y: 0 }, tangent: 0 };
  }

  const cmdLengths: number[] = [];
  let totalLength = 0;
  for (const cmd of commands) {
    const len = calculateCommandLength(cmd);
    cmdLengths.push(len);
    totalLength += len;
  }

  if (totalLength === 0) {
    return { point: { x: commands[0].start.x, y: commands[0].start.y }, tangent: 0 };
  }

  if (t >= 1) {
    for (let i = commands.length - 1; i >= 0; i--) {
      if (cmdLengths[i] > 0) return sampleOnCommand(commands[i], 1);
    }
    return { point: { x: commands[0].start.x, y: commands[0].start.y }, tangent: 0 };
  }

  const targetDist = Math.max(0, t) * totalLength;
  let accumulated = 0;

  for (let i = 0; i < commands.length; i++) {
    const cmdLen = cmdLengths[i];
    if (cmdLen === 0) continue;

    if (accumulated + cmdLen >= targetDist) {
      const localDist = targetDist - accumulated;
      const localT = localDist / cmdLen;
      return sampleOnCommand(commands[i], Math.max(0, Math.min(1, localT)));
    }

    accumulated += cmdLen;
  }

  return sampleOnCommand(commands[commands.length - 1], 1);
}

export function partitionPath(commands: SamplingCmd[], n: number): SampleResult[] {
  const results: SampleResult[] = [];
  for (let i = 0; i <= n; i++) {
    results.push(samplePathAtFraction(commands, i / n));
  }
  return results;
}

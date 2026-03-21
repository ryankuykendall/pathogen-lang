// Path helper functions that return PathSegment values

import { formatNum } from '../evaluator/format';
import type { ArrayValue, ObjectValue, PointValue, PolarVectorValue, Value } from '../evaluator/types';

export interface PathSegment {
  type: 'PathSegment';
  value: string;
}

function segment(value: string): PathSegment {
  return { type: 'PathSegment', value };
}

// ---------------------------------------------------------------------------
// Value extraction helpers for spline functions that accept complex arguments
// ---------------------------------------------------------------------------

function asNumber(v: Value): number {
  if (typeof v === 'number') return v;
  throw new Error(`Expected number, got ${typeof v}`);
}

function asArray(v: unknown, name: string): Value[] {
  if (typeof v === 'object' && v !== null && 'type' in v && (v as ArrayValue).type === 'ArrayValue') {
    return (v as ArrayValue).elements;
  }
  throw new Error(`${name}: expected an array`);
}

function getNum(obj: unknown, key: string): number {
  if (typeof obj !== 'object' || obj === null || !('type' in obj) || (obj as ObjectValue).type !== 'ObjectValue') {
    throw new Error(`Expected an object with property '${key}'`);
  }
  const val = (obj as ObjectValue).properties.get(key);
  if (val === undefined || val === null) throw new Error(`Missing required property '${key}'`);
  return asNumber(val);
}

function getNumOpt(obj: unknown, key: string, fallback: number): number {
  if (typeof obj !== 'object' || obj === null || !('type' in obj) || (obj as ObjectValue).type !== 'ObjectValue') return fallback;
  const val = (obj as ObjectValue).properties.get(key);
  if (val === undefined || val === null) return fallback;
  return asNumber(val);
}

export const pathFunctions = {
  // Circle: draws a full circle using two arcs
  circle: (cx: number, cy: number, r: number): PathSegment =>
    segment(
      `M ${formatNum(cx - r)} ${formatNum(cy)} ` +
        `A ${formatNum(r)} ${formatNum(r)} 0 1 1 ${formatNum(cx + r)} ${formatNum(cy)} ` +
        `A ${formatNum(r)} ${formatNum(r)} 0 1 1 ${formatNum(cx - r)} ${formatNum(cy)}`,
    ),

  // Arc: draws an arc from current point
  arc: (rx: number, ry: number, rotation: number, largeArc: number, sweep: number, x: number, y: number): PathSegment =>
    segment(
      `A ${formatNum(rx)} ${formatNum(ry)} ${formatNum(rotation)} ${largeArc} ${sweep} ${formatNum(x)} ${formatNum(y)}`,
    ),

  // Rectangle
  rect: (x: number, y: number, width: number, height: number): PathSegment =>
    segment(
      `M ${formatNum(x)} ${formatNum(y)} ` +
        `L ${formatNum(x + width)} ${formatNum(y)} ` +
        `L ${formatNum(x + width)} ${formatNum(y + height)} ` +
        `L ${formatNum(x)} ${formatNum(y + height)} ` +
        `Z`,
    ),

  // Rounded rectangle
  roundRect: (x: number, y: number, width: number, height: number, radius: number): PathSegment => {
    const r = Math.min(radius, width / 2, height / 2);
    return segment(
      `M ${formatNum(x + r)} ${formatNum(y)} ` +
        `L ${formatNum(x + width - r)} ${formatNum(y)} ` +
        `Q ${formatNum(x + width)} ${formatNum(y)} ${formatNum(x + width)} ${formatNum(y + r)} ` +
        `L ${formatNum(x + width)} ${formatNum(y + height - r)} ` +
        `Q ${formatNum(x + width)} ${formatNum(y + height)} ${formatNum(x + width - r)} ${formatNum(y + height)} ` +
        `L ${formatNum(x + r)} ${formatNum(y + height)} ` +
        `Q ${formatNum(x)} ${formatNum(y + height)} ${formatNum(x)} ${formatNum(y + height - r)} ` +
        `L ${formatNum(x)} ${formatNum(y + r)} ` +
        `Q ${formatNum(x)} ${formatNum(y)} ${formatNum(x + r)} ${formatNum(y)} ` +
        `Z`,
    );
  },

  // Regular polygon
  polygon: (cx: number, cy: number, radius: number, sides: number): PathSegment => {
    const points: string[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      points.push(i === 0 ? `M ${formatNum(x)} ${formatNum(y)}` : `L ${formatNum(x)} ${formatNum(y)}`);
    }
    points.push('Z');
    return segment(points.join(' '));
  },

  // Star shape
  star: (cx: number, cy: number, outerRadius: number, innerRadius: number, points: number): PathSegment => {
    const segments: string[] = [];
    const totalPoints = points * 2;

    for (let i = 0; i < totalPoints; i++) {
      const angle = (i / totalPoints) * Math.PI * 2 - Math.PI / 2;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      segments.push(i === 0 ? `M ${formatNum(x)} ${formatNum(y)}` : `L ${formatNum(x)} ${formatNum(y)}`);
    }
    segments.push('Z');
    return segment(segments.join(' '));
  },

  // Line segment
  line: (x1: number, y1: number, x2: number, y2: number): PathSegment =>
    segment(`M ${formatNum(x1)} ${formatNum(y1)} L ${formatNum(x2)} ${formatNum(y2)}`),

  // Quadratic bezier curve
  quadratic: (x1: number, y1: number, cx: number, cy: number, x2: number, y2: number): PathSegment =>
    segment(
      `M ${formatNum(x1)} ${formatNum(y1)} Q ${formatNum(cx)} ${formatNum(cy)} ${formatNum(x2)} ${formatNum(y2)}`,
    ),

  // Cubic bezier curve
  cubic: (
    x1: number,
    y1: number,
    c1x: number,
    c1y: number,
    c2x: number,
    c2y: number,
    x2: number,
    y2: number,
  ): PathSegment =>
    segment(
      `M ${formatNum(x1)} ${formatNum(y1)} C ${formatNum(c1x)} ${formatNum(c1y)} ${formatNum(c2x)} ${formatNum(c2y)} ${formatNum(x2)} ${formatNum(y2)}`,
    ),

  // Move to (returns path segment)
  moveTo: (x: number, y: number): PathSegment => segment(`M ${formatNum(x)} ${formatNum(y)}`),

  // Line to (returns path segment)
  lineTo: (x: number, y: number): PathSegment => segment(`L ${formatNum(x)} ${formatNum(y)}`),

  // Close path
  closePath: (): PathSegment => segment('Z'),

  // ---------------------------------------------------------------------------
  // Chained bezier spline functions
  // ---------------------------------------------------------------------------

  // cubicSpline(points) — cubic bezier chain with explicit tangent control (relative commands)
  // Point: { x, y, angle, exit?, entry? }
  // CP1 = P[i] + exit * dir(angle), CP2 = P[i+1] - entry * dir(angle)
  cubicSpline: (...args: unknown[]): PathSegment => {
    const points = asArray(args[0], 'cubicSpline');
    const n = points.length;
    if (n === 0) throw new Error('cubicSpline: points array must not be empty');

    const p0x = getNum(points[0], 'x');
    const p0y = getNum(points[0], 'y');
    const parts: string[] = [`m ${formatNum(p0x)} ${formatNum(p0y)}`];

    for (let i = 1; i < n; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const prevX = getNum(prev, 'x');
      const prevY = getNum(prev, 'y');
      const prevAngle = getNum(prev, 'angle');
      const prevExit = getNumOpt(prev, 'exit', 0);
      const currX = getNum(curr, 'x');
      const currY = getNum(curr, 'y');
      const currAngle = getNum(curr, 'angle');
      const currEntry = getNumOpt(curr, 'entry', 0);

      // Absolute positions of control points
      const c1x = prevX + prevExit * Math.cos(prevAngle);
      const c1y = prevY + prevExit * Math.sin(prevAngle);
      const c2x = currX - currEntry * Math.cos(currAngle);
      const c2y = currY - currEntry * Math.sin(currAngle);

      // Convert to relative (offset from pen position = prev point)
      parts.push(
        `c ${formatNum(c1x - prevX)} ${formatNum(c1y - prevY)} ${formatNum(c2x - prevX)} ${formatNum(c2y - prevY)} ${formatNum(currX - prevX)} ${formatNum(currY - prevY)}`,
      );
    }

    return segment(parts.join(' '));
  },

  // quadSpline(start, points, end) — quadratic bezier chain with implicit angle derivation (relative commands)
  // Start: { x, y, angle, exit }, Intermediate: { x, y, exit }, End: { x, y }
  quadSpline: (...args: unknown[]): PathSegment => {
    const start = args[0];
    const intermediates = asArray(args[1], 'quadSpline');
    const end = args[2];

    const sx = getNum(start, 'x');
    const sy = getNum(start, 'y');
    const startAngle = getNum(start, 'angle');
    const startExit = getNum(start, 'exit');

    let cpx = sx + startExit * Math.cos(startAngle);
    let cpy = sy + startExit * Math.sin(startAngle);

    const parts: string[] = [`m ${formatNum(sx)} ${formatNum(sy)}`];
    // Pen is now at (sx, sy)
    let penX = sx;
    let penY = sy;

    if (intermediates.length > 0) {
      // First segment: start → intermediates[0]
      const firstX = getNum(intermediates[0], 'x');
      const firstY = getNum(intermediates[0], 'y');
      parts.push(
        `q ${formatNum(cpx - penX)} ${formatNum(cpy - penY)} ${formatNum(firstX - penX)} ${formatNum(firstY - penY)}`,
      );
      penX = firstX;
      penY = firstY;

      let prevCPx = cpx;
      let prevCPy = cpy;

      for (let idx = 0; idx < intermediates.length; idx++) {
        const pt = intermediates[idx];
        const ptx = getNum(pt, 'x');
        const pty = getNum(pt, 'y');
        const ptExit = getNum(pt, 'exit');

        const angle = Math.atan2(pty - prevCPy, ptx - prevCPx);
        const newCPx = ptx + ptExit * Math.cos(angle);
        const newCPy = pty + ptExit * Math.sin(angle);

        let destX: number, destY: number;
        if (idx < intermediates.length - 1) {
          const next = intermediates[idx + 1];
          destX = getNum(next, 'x');
          destY = getNum(next, 'y');
        } else {
          destX = getNum(end, 'x');
          destY = getNum(end, 'y');
        }

        parts.push(
          `q ${formatNum(newCPx - penX)} ${formatNum(newCPy - penY)} ${formatNum(destX - penX)} ${formatNum(destY - penY)}`,
        );
        penX = destX;
        penY = destY;

        prevCPx = newCPx;
        prevCPy = newCPy;
      }
    } else {
      // No intermediates: single q from start to end
      const endX = getNum(end, 'x');
      const endY = getNum(end, 'y');
      parts.push(
        `q ${formatNum(cpx - penX)} ${formatNum(cpy - penY)} ${formatNum(endX - penX)} ${formatNum(endY - penY)}`,
      );
    }

    return segment(parts.join(' '));
  },

  // clippedQuadSpline(start, points, end) — time-clipped quadratic spline emitting cubic commands (relative)
  // Start: { x, y, angle, exit, exitTime }, Intermediate: { x, y, exit, exitTime, entryTime }, End: { x, y, entryTime }
  clippedQuadSpline: (...args: unknown[]): PathSegment => {
    const start = args[0];
    const intermediates = asArray(args[1], 'clippedQuadSpline');
    const end = args[2];

    const sx = getNum(start, 'x');
    const sy = getNum(start, 'y');
    const startAngle = getNum(start, 'angle');
    const startExit = getNum(start, 'exit');
    const startExitTime = getNum(start, 'exitTime');

    let cpx = sx + startExit * Math.cos(startAngle);
    let cpy = sy + startExit * Math.sin(startAngle);

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const parts: string[] = [`m ${formatNum(sx)} ${formatNum(sy)}`];
    let penX = sx;
    let penY = sy;

    if (intermediates.length > 0) {
      // First segment: start → intermediates[0]
      const firstPt = intermediates[0];
      const firstX = getNum(firstPt, 'x');
      const firstY = getNum(firstPt, 'y');
      const firstEntryTime = getNum(firstPt, 'entryTime');

      const c1x = lerp(sx, cpx, startExitTime);
      const c1y = lerp(sy, cpy, startExitTime);
      const c2x = lerp(firstX, cpx, firstEntryTime);
      const c2y = lerp(firstY, cpy, firstEntryTime);

      parts.push(
        `c ${formatNum(c1x - penX)} ${formatNum(c1y - penY)} ${formatNum(c2x - penX)} ${formatNum(c2y - penY)} ${formatNum(firstX - penX)} ${formatNum(firstY - penY)}`,
      );
      penX = firstX;
      penY = firstY;

      let prevCPx = cpx;
      let prevCPy = cpy;

      for (let idx = 0; idx < intermediates.length; idx++) {
        const pt = intermediates[idx];
        const ptx = getNum(pt, 'x');
        const pty = getNum(pt, 'y');
        const ptExit = getNum(pt, 'exit');
        const ptExitTime = getNum(pt, 'exitTime');

        const angle = Math.atan2(pty - prevCPy, ptx - prevCPx);
        const newCPx = ptx + ptExit * Math.cos(angle);
        const newCPy = pty + ptExit * Math.sin(angle);

        const sc1x = lerp(ptx, newCPx, ptExitTime);
        const sc1y = lerp(pty, newCPy, ptExitTime);

        let destX: number, destY: number;
        let sc2x: number, sc2y: number;
        if (idx < intermediates.length - 1) {
          const next = intermediates[idx + 1];
          destX = getNum(next, 'x');
          destY = getNum(next, 'y');
          const nextEntryTime = getNum(next, 'entryTime');
          sc2x = lerp(destX, newCPx, nextEntryTime);
          sc2y = lerp(destY, newCPy, nextEntryTime);
        } else {
          destX = getNum(end, 'x');
          destY = getNum(end, 'y');
          const endEntryTime = getNum(end, 'entryTime');
          sc2x = lerp(destX, newCPx, endEntryTime);
          sc2y = lerp(destY, newCPy, endEntryTime);
        }

        parts.push(
          `c ${formatNum(sc1x - penX)} ${formatNum(sc1y - penY)} ${formatNum(sc2x - penX)} ${formatNum(sc2y - penY)} ${formatNum(destX - penX)} ${formatNum(destY - penY)}`,
        );
        penX = destX;
        penY = destY;

        prevCPx = newCPx;
        prevCPy = newCPy;
      }
    } else {
      // No intermediates: single c from start to end
      const endX = getNum(end, 'x');
      const endY = getNum(end, 'y');
      const endEntryTime = getNum(end, 'entryTime');

      const c1x = lerp(sx, cpx, startExitTime);
      const c1y = lerp(sy, cpy, startExitTime);
      const c2x = lerp(endX, cpx, endEntryTime);
      const c2y = lerp(endY, cpy, endEntryTime);

      parts.push(
        `c ${formatNum(c1x - penX)} ${formatNum(c1y - penY)} ${formatNum(c2x - penX)} ${formatNum(c2y - penY)} ${formatNum(endX - penX)} ${formatNum(endY - penY)}`,
      );
    }

    return segment(parts.join(' '));
  },

  // ---------------------------------------------------------------------------
  // Polar bezier functions
  // ---------------------------------------------------------------------------

  // polarCubicBezier(start, pv1, pv2, end) — cubic bezier with polar control points (relative commands)
  // start/end: Point, pv1/pv2: PolarVector (direction + distance from anchor to control point)
  polarCubicBezier: (...args: unknown[]): PathSegment => {
    if (args.length !== 4) throw new Error('polarCubicBezier() expects 4 arguments');
    const start = args[0];
    const pv1 = args[1];
    const pv2 = args[2];
    const end = args[3];
    if (!isPointArg(start)) throw new Error('polarCubicBezier: arg 1 (start) must be a Point');
    if (!isPolarVectorArg(pv1)) throw new Error('polarCubicBezier: arg 2 must be a PolarVector');
    if (!isPolarVectorArg(pv2)) throw new Error('polarCubicBezier: arg 3 must be a PolarVector');
    if (!isPointArg(end)) throw new Error('polarCubicBezier: arg 4 (end) must be a Point');

    // Compute absolute control points from polar vectors relative to anchors
    const cp1x = start.x + pv1.distance * Math.cos(pv1.angle);
    const cp1y = start.y + pv1.distance * Math.sin(pv1.angle);
    const cp2x = end.x + pv2.distance * Math.cos(pv2.angle);
    const cp2y = end.y + pv2.distance * Math.sin(pv2.angle);

    // Emit relative path commands (m to start, c for cubic relative to start)
    return segment(
      `m ${formatNum(start.x)} ${formatNum(start.y)} c ${formatNum(cp1x - start.x)} ${formatNum(cp1y - start.y)} ${formatNum(cp2x - start.x)} ${formatNum(cp2y - start.y)} ${formatNum(end.x - start.x)} ${formatNum(end.y - start.y)}`,
    );
  },
};

// Local type guards to avoid circular imports from evaluator
function isPointArg(v: unknown): v is PointValue {
  return typeof v === 'object' && v !== null && 'type' in v && (v as PointValue).type === 'PointValue';
}

function isPolarVectorArg(v: unknown): v is PolarVectorValue {
  return typeof v === 'object' && v !== null && 'type' in v && (v as PolarVectorValue).type === 'PolarVectorValue';
}

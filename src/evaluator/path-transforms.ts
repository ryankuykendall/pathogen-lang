import { formatNum } from './format';
import {
  arcEndpointToCenter,
  arcPointFromCenter,
  calculateCommandLength,
  getParametricTForCommand,
  locateCommandAtFraction,
  resolveSmooth,
} from './sampling';

import type { Point } from './context';
import type { PathCommandMeta } from './types';

/**
 * Minimal command interface — structurally compatible with PathBlockCommand
 */
interface TransformCmd {
  command: string;
  args: number[];
  start: Point;
  end: Point;
  meta?: PathCommandMeta; // command identity (labels, recorded corner ops) — propagated through trims/splices
}

/**
 * Meta for a command inserted at a corner junction: the insert belongs to a
 * labeled segment only when both neighbors carry the same label (an interior
 * corner of one labeled range); a boundary corner between two differently
 * labeled segments belongs to neither.
 */
function inheritInsertMeta(incoming: TransformCmd, outgoing: TransformCmd): PathCommandMeta | undefined {
  const label = incoming.meta?.segmentLabel;
  return label !== undefined && label === outgoing.meta?.segmentLabel ? { segmentLabel: label } : undefined;
}

// ---- Shared utilities ----

export function commandToPathString(cmd: TransformCmd): string {
  if (cmd.args.length === 0) return cmd.command;
  return `${cmd.command} ${cmd.args.map(formatNum).join(' ')}`;
}

/**
 * Solve quadratic equation ax² + bx + c = 0, returning real roots
 */
function solveQuadratic(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < 1e-12) {
    // Linear: bx + c = 0
    if (Math.abs(b) < 1e-12) return [];
    return [-c / b];
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  if (disc === 0) return [-b / (2 * a)];
  const sq = Math.sqrt(disc);
  return [(-b - sq) / (2 * a), (-b + sq) / (2 * a)];
}

/**
 * Check whether `angle` falls within the arc sweep from `startAngle` spanning `deltaAngle`
 */
function isAngleInArc(angle: number, startAngle: number, deltaAngle: number): boolean {
  // Normalize angle relative to startAngle into [0, 2π)
  const a = (((angle - startAngle) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (deltaAngle > 0) {
    return a <= deltaAngle + 1e-9;
  }
  // Negative sweep: convert to check in negative direction
  const aNeg = a === 0 ? 0 : a - 2 * Math.PI;
  return aNeg >= deltaAngle - 1e-9;
}

// resolveSmooth (S→C, T→Q) now lives in ./sampling — the lowest-level geometry
// module — so both sampling and these transforms can share it without an import
// cycle. Re-exported here for backwards compatibility with existing importers.
export { resolveSmooth };

// ---- reverse ----

export function reverseCommands(commands: TransformCmd[]): TransformCmd[] {
  if (commands.length === 0) return [];

  // Step 1: resolve S→C, T→Q
  const resolved = resolveSmooth(commands);

  // Step 2: check for closing z
  let wasClosed = false;
  let zeroZMeta: PathCommandMeta | undefined;
  const working = [...resolved];
  if (working.length > 0 && working[working.length - 1].command.toUpperCase() === 'Z') {
    const zCmd = working.pop()!;
    wasClosed = true;
    // If z has nonzero length, convert to explicit l
    const zdx = zCmd.end.x - zCmd.start.x;
    const zdy = zCmd.end.y - zCmd.start.y;
    if (Math.abs(zdx) > 1e-10 || Math.abs(zdy) > 1e-10) {
      working.push({
        command: 'l',
        args: [zdx, zdy],
        start: { ...zCmd.start },
        end: { ...zCmd.end },
        ...(zCmd.meta !== undefined ? { meta: zCmd.meta } : {}),
      });
    } else {
      // Zero-length z: its meta (an endpoint label on the close vertex)
      // re-attaches to the z we append after reversing.
      zeroZMeta = zCmd.meta;
    }
  }

  // Skip m commands at the beginning (they don't draw)
  const drawCommands = working.filter((c) => c.command.toUpperCase() !== 'M');
  if (drawCommands.length === 0) return [];

  // Step 3: reverse command array
  const reversedCmds = [...drawCommands].reverse();

  // Step 4: transform each reversed command
  const result: TransformCmd[] = [];
  // The reversed path starts at the original path's last endpoint
  let cursor: Point = {
    x: drawCommands[drawCommands.length - 1].end.x,
    y: drawCommands[drawCommands.length - 1].end.y,
  };

  for (const cmd of reversedCmds) {
    // Original: went from cmd.start to cmd.end
    // Reversed: goes from cmd.end to cmd.start
    const dx = cmd.end.x - cmd.start.x;
    const dy = cmd.end.y - cmd.start.y;
    const upper = cmd.command.toUpperCase();

    let newCmd: TransformCmd;

    switch (upper) {
      case 'L': {
        newCmd = {
          command: 'l',
          args: [-dx, -dy],
          start: { ...cursor },
          end: { x: cursor.x - dx, y: cursor.y - dy },
        };
        break;
      }
      case 'H': {
        newCmd = {
          command: 'h',
          args: [-dx],
          start: { ...cursor },
          end: { x: cursor.x - dx, y: cursor.y },
        };
        break;
      }
      case 'V': {
        newCmd = {
          command: 'v',
          args: [-dy],
          start: { ...cursor },
          end: { x: cursor.x, y: cursor.y - dy },
        };
        break;
      }
      case 'C': {
        // c x1 y1 x2 y2 dx dy
        // Original CP1 = start + (x1, y1), CP2 = start + (x2, y2), end = start + (dx, dy)
        // Reversed: new CP1 = old CP2 relative to new start (which is old end)
        // new CP1 = (x2 - dx, y2 - dy), new CP2 = (x1 - dx, y1 - dy), new end = (-dx, -dy)
        const [x1, y1, x2, y2] = cmd.args;
        newCmd = {
          command: 'c',
          args: [x2 - dx, y2 - dy, x1 - dx, y1 - dy, -dx, -dy],
          start: { ...cursor },
          end: { x: cursor.x - dx, y: cursor.y - dy },
        };
        break;
      }
      case 'Q': {
        // q x1 y1 dx dy
        // Reversed: new CP = (x1 - dx, y1 - dy), new end = (-dx, -dy)
        const [x1, y1] = cmd.args;
        newCmd = {
          command: 'q',
          args: [x1 - dx, y1 - dy, -dx, -dy],
          start: { ...cursor },
          end: { x: cursor.x - dx, y: cursor.y - dy },
        };
        break;
      }
      case 'A': {
        // a rx ry rot largeArc sweep dx dy
        const [rx, ry, rot, largeArc, sweep] = cmd.args;
        newCmd = {
          command: 'a',
          args: [rx, ry, rot, largeArc, 1 - sweep, -dx, -dy],
          start: { ...cursor },
          end: { x: cursor.x - dx, y: cursor.y - dy },
        };
        break;
      }
      default: {
        // Fallback for unknown commands: treat as line
        newCmd = {
          command: 'l',
          args: [-dx, -dy],
          start: { ...cursor },
          end: { x: cursor.x - dx, y: cursor.y - dy },
        };
        break;
      }
    }

    // Meta: the segment label travels with the command; an endpoint label
    // names the command's END vertex, which after reversal is the end of the
    // NEXT reversed command — so endVertex shifts one command toward the
    // source start (wrapping mod n on closed paths, whose vertices are
    // cyclic; on open paths the forward-last endpoint label has no home and
    // drops — documented).
    const j = result.length;
    const n = drawCommands.length;
    const segLabel = cmd.meta?.segmentLabel;
    let evSourceIdx = n - 2 - j;
    if (evSourceIdx < 0 && wasClosed) evSourceIdx = ((evSourceIdx % n) + n) % n;
    const ev = evSourceIdx >= 0 ? drawCommands[evSourceIdx].meta?.endVertex : undefined;
    if (segLabel !== undefined || ev !== undefined) {
      newCmd.meta = {
        ...(segLabel !== undefined ? { segmentLabel: segLabel } : {}),
        ...(ev !== undefined ? { endVertex: { ...ev } } : {}),
      };
    }
    result.push(newCmd);
    cursor = { ...newCmd.end };
  }

  // Step 5: append z if was closed
  if (wasClosed) {
    // z goes from current cursor back to the start of the reversed path
    const startOfReversed = result[0].start;
    result.push({
      command: 'z',
      args: [],
      start: { ...cursor },
      end: { ...startOfReversed },
      ...(zeroZMeta !== undefined ? { meta: { ...zeroZMeta, ...(zeroZMeta.endVertex ? { endVertex: { ...zeroZMeta.endVertex } } : {}) } } : {}),
    });
  }

  return result;
}

// ---- boundingBox ----

export function computeBoundingBox(commands: TransformCmd[]): { x: number; y: number; width: number; height: number } {
  if (commands.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = commands[0].start.x;
  let maxX = commands[0].start.x;
  let minY = commands[0].start.y;
  let maxY = commands[0].start.y;

  function expand(x: number, y: number) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  for (const cmd of commands) {
    // Always expand with start and end points
    expand(cmd.start.x, cmd.start.y);
    expand(cmd.end.x, cmd.end.y);

    const upper = cmd.command.toUpperCase();

    if (upper === 'C') {
      // Cubic Bezier: find extrema by solving B'(t) = 0 per axis
      const p0 = cmd.start;
      const [cx1, cy1, cx2, cy2] = cmd.args;
      const p1 = { x: p0.x + cx1, y: p0.y + cy1 };
      const p2 = { x: p0.x + cx2, y: p0.y + cy2 };
      const p3 = cmd.end;

      // B'(t) = 3(1-t)²(P1-P0) + 6(1-t)t(P2-P1) + 3t²(P3-P2)
      // = at² + bt + c where:
      // a = 3(-P0 + 3P1 - 3P2 + P3)
      // b = 6(P0 - 2P1 + P2)
      // c = 3(P1 - P0)
      for (const axis of ['x', 'y'] as const) {
        const a = 3 * (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]);
        const b = 6 * (p0[axis] - 2 * p1[axis] + p2[axis]);
        const c = 3 * (p1[axis] - p0[axis]);

        const roots = solveQuadratic(a, b, c);
        for (const t of roots) {
          if (t > 0 && t < 1) {
            const mt = 1 - t;
            const val =
              mt * mt * mt * p0[axis] + 3 * mt * mt * t * p1[axis] + 3 * mt * t * t * p2[axis] + t * t * t * p3[axis];
            if (axis === 'x') {
              if (val < minX) minX = val;
              if (val > maxX) maxX = val;
            } else {
              if (val < minY) minY = val;
              if (val > maxY) maxY = val;
            }
          }
        }
      }
    } else if (upper === 'Q') {
      // Quadratic Bezier: B'(t) = 0 → linear per axis
      const p0 = cmd.start;
      const [qx1, qy1] = cmd.args;
      const p1 = { x: p0.x + qx1, y: p0.y + qy1 };
      const p2 = cmd.end;

      // B'(t) = 2(1-t)(P1-P0) + 2t(P2-P1) = 0
      // t = (P0 - P1) / (P0 - 2P1 + P2)
      for (const axis of ['x', 'y'] as const) {
        const denom = p0[axis] - 2 * p1[axis] + p2[axis];
        if (Math.abs(denom) > 1e-12) {
          const t = (p0[axis] - p1[axis]) / denom;
          if (t > 0 && t < 1) {
            const mt = 1 - t;
            const val = mt * mt * p0[axis] + 2 * mt * t * p1[axis] + t * t * p2[axis];
            if (axis === 'x') {
              if (val < minX) minX = val;
              if (val > maxX) maxX = val;
            } else {
              if (val < minY) minY = val;
              if (val > maxY) maxY = val;
            }
          }
        }
      }
    } else if (upper === 'A') {
      // Arc: find extrema
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

      if (center) {
        const cosPhi = Math.cos(center.phi);
        const sinPhi = Math.sin(center.phi);

        // X extrema: dx/dθ = -rx·sin(θ)·cos(φ) - ry·cos(θ)·sin(φ) = 0
        // θ = atan2(-ry·sin(φ), rx·cos(φ))
        const thetaX = Math.atan2(-center.ry * sinPhi, center.rx * cosPhi);
        // Y extrema: dy/dθ = -rx·sin(θ)·sin(φ) + ry·cos(θ)·cos(φ) = 0
        // θ = atan2(ry·cos(φ), rx·sin(φ))
        const thetaY = Math.atan2(center.ry * cosPhi, center.rx * sinPhi);

        // Check both θ and θ + π for each axis
        for (const baseTheta of [thetaX, thetaX + Math.PI]) {
          if (isAngleInArc(baseTheta, center.startAngle, center.deltaAngle)) {
            const pt = arcPointFromCenter(center, (baseTheta - center.startAngle) / center.deltaAngle);
            expand(pt.x, pt.y);
          }
        }
        for (const baseTheta of [thetaY, thetaY + Math.PI]) {
          if (isAngleInArc(baseTheta, center.startAngle, center.deltaAngle)) {
            const pt = arcPointFromCenter(center, (baseTheta - center.startAngle) / center.deltaAngle);
            expand(pt.x, pt.y);
          }
        }
      }
    }
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Center of the axis-aligned bounding box (the box computeBoundingBox reports). */
export function computeBoundingBoxCenter(commands: TransformCmd[]): { x: number; y: number } {
  const bb = computeBoundingBox(commands);
  return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
}

// ---- offset ----

export function unitNormal(dx: number, dy: number): Point {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-12) return { x: 0, y: -1 }; // default upward
  // Left-hand normal in SVG coords (y-down): (dy, -dx) / len
  // For rightward (1,0) → (0,-1) = upward ✓
  return { x: dy / len, y: -dx / len };
}

export interface OffsetJoinOptions {
  join?: 'miter' | 'bevel' | 'round';
  /** Miter-length limit as a multiple of the offset distance; joins spiking
   *  past it fall back to a bevel. Default 2 (the historical offset() cap);
   *  stroke outlining passes the SVG default of 4 or the user's value. */
  miterLimit?: number;
}

function offsetPt(p: Point, n: Point, d: number): Point {
  return { x: p.x + n.x * d, y: p.y + n.y * d };
}

/** Intersect two parametric lines p + t·d. Returns null when parallel. */
function lineIntersect(p1: Point, d1: Point, p2: Point, d2: Point): { pt: Point; t1: number; t2: number } | null {
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(cross) < 1e-12) return null;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const t1 = (dx * d2.y - dy * d2.x) / cross;
  const t2 = (dx * d1.y - dy * d1.x) / cross;
  return { pt: { x: p1.x + t1 * d1.x, y: p1.y + t1 * d1.y }, t1, t2 };
}

function evalCubic(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function cubicTangent(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  let dx = 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
  let dy = 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) {
    dx = p3.x - p0.x;
    dy = p3.y - p0.y;
  }
  return { x: dx, y: dy };
}

/** Tiller–Hanson: offset a cubic's control polygon legs and re-intersect. */
function offsetCubicOnce(p0: Point, p1: Point, p2: Point, p3: Point, d: number): [Point, Point, Point, Point] {
  const legDir = (a: Point, b: Point, fb1: Point, fb2: Point): Point => {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) {
      dx = fb2.x - fb1.x;
      dy = fb2.y - fb1.y;
    }
    return { x: dx, y: dy };
  };
  const l1 = legDir(p0, p1, p0, p3);
  const l2 = legDir(p1, p2, p0, p3);
  const l3 = legDir(p2, p3, p0, p3);
  const n1 = unitNormal(l1.x, l1.y);
  const n2 = unitNormal(l2.x, l2.y);
  const n3 = unitNormal(l3.x, l3.y);
  const q0 = offsetPt(p0, n1, d);
  const q3 = offsetPt(p3, n3, d);
  const hitA = lineIntersect(q0, l1, offsetPt(p1, n2, d), l2);
  const hitB = lineIntersect(offsetPt(p2, n2, d), l2, q3, l3);
  const q1 = hitA ? hitA.pt : offsetPt(p1, { x: (n1.x + n2.x) / 2, y: (n1.y + n2.y) / 2 }, d);
  const q2 = hitB ? hitB.pt : offsetPt(p2, { x: (n2.x + n3.x) / 2, y: (n2.y + n3.y) / 2 }, d);
  return [q0, q1, q2, q3];
}

/** Offset one cubic as a true parallel curve, subdividing where it bends
 *  too strongly for a single Tiller–Hanson pass to stay within tolerance. */
function offsetCubicAdaptive(cmd: TransformCmd, d: number, depth: number): TransformCmd[] {
  const p0 = { ...cmd.start };
  const [cx1, cy1, cx2, cy2] = cmd.args;
  const p1 = { x: cmd.start.x + cx1, y: cmd.start.y + cy1 };
  const p2 = { x: cmd.start.x + cx2, y: cmd.start.y + cy2 };
  const p3 = { ...cmd.end };
  const [q0, q1, q2, q3] = offsetCubicOnce(p0, p1, p2, p3, d);

  if (depth < 4) {
    const tol = Math.max(0.08, Math.abs(d) * 0.02);
    let worst = 0;
    for (const t of [0.25, 0.5, 0.75]) {
      const tan = cubicTangent(p0, p1, p2, p3, t);
      const n = unitNormal(tan.x, tan.y);
      const target = offsetPt(evalCubic(p0, p1, p2, p3, t), n, d);
      const got = evalCubic(q0, q1, q2, q3, t);
      const err = Math.sqrt((got.x - target.x) ** 2 + (got.y - target.y) ** 2);
      if (err > worst) worst = err;
    }
    if (worst > tol) {
      const [left, right] = splitCommandAtParametricT(cmd, 0.5);
      return [...offsetCubicAdaptive(left, d, depth + 1), ...offsetCubicAdaptive(right, d, depth + 1)];
    }
  }

  return [
    {
      command: 'c',
      args: [q1.x - q0.x, q1.y - q0.y, q2.x - q0.x, q2.y - q0.y, q3.x - q0.x, q3.y - q0.y],
      start: q0,
      end: q3,
    },
  ];
}

interface OffsetPiece {
  cmds: TransformCmd[]; // offset image of one source command
  srcMeta?: PathCommandMeta;
  srcStart: Point;
  srcEnd: Point;
  srcStartTangent: Point;
  srcEndTangent: Point;
  isLine: boolean;
  emitAsZ: boolean; // re-emit as the ring's closing command
}

function offsetOneCommand(cmd: TransformCmd, d: number): OffsetPiece | null {
  const upper = cmd.command.toUpperCase();
  const base = {
    srcMeta: cmd.meta,
    srcStart: { ...cmd.start },
    srcEnd: { ...cmd.end },
    srcStartTangent: getStartTangent(cmd),
    srcEndTangent: getEndTangent(cmd),
  };

  if (upper === 'L' || upper === 'H' || upper === 'V' || upper === 'Z') {
    const dx = cmd.end.x - cmd.start.x;
    const dy = cmd.end.y - cmd.start.y;
    // Zero-length segments have no direction to offset along — drop them
    // rather than letting a fallback normal pollute the join math.
    if (Math.abs(dx) < 1e-10 && Math.abs(dy) < 1e-10) return null;
    const n = unitNormal(dx, dy);
    const start = offsetPt(cmd.start, n, d);
    const end = offsetPt(cmd.end, n, d);
    return {
      ...base,
      cmds: [{ command: 'l', args: [end.x - start.x, end.y - start.y], start, end }],
      isLine: true,
      emitAsZ: upper === 'Z',
    };
  }

  if (upper === 'C') {
    return { ...base, cmds: offsetCubicAdaptive(cmd, d, 0), isLine: false, emitAsZ: false };
  }

  if (upper === 'Q') {
    // Exact degree elevation to a cubic, then the cubic pipeline.
    const [qx1, qy1] = cmd.args;
    const qp = { x: cmd.start.x + qx1, y: cmd.start.y + qy1 };
    const c1 = { x: cmd.start.x + (2 / 3) * (qp.x - cmd.start.x), y: cmd.start.y + (2 / 3) * (qp.y - cmd.start.y) };
    const c2 = { x: cmd.end.x + (2 / 3) * (qp.x - cmd.end.x), y: cmd.end.y + (2 / 3) * (qp.y - cmd.end.y) };
    const asCubic: TransformCmd = {
      command: 'c',
      args: [c1.x - cmd.start.x, c1.y - cmd.start.y, c2.x - cmd.start.x, c2.y - cmd.start.y, cmd.end.x - cmd.start.x, cmd.end.y - cmd.start.y],
      start: { ...cmd.start },
      end: { ...cmd.end },
    };
    return { ...base, cmds: offsetCubicAdaptive(asCubic, d, 0), isLine: false, emitAsZ: false };
  }

  if (upper === 'A') {
    const [rx, ry, rotation, largeArcFlag, sweepFlag] = cmd.args;
    const phi = (rotation * Math.PI) / 180;
    const center = arcEndpointToCenter(cmd.start.x, cmd.start.y, rx, ry, phi, largeArcFlag, sweepFlag, cmd.end.x, cmd.end.y);
    if (center) {
      const cosPhi = Math.cos(center.phi);
      const sinPhi = Math.sin(center.phi);
      const tangentAt = (angle: number): Point => {
        const dex = -center.rx * Math.sin(angle);
        const dey = center.ry * Math.cos(angle);
        let tx = cosPhi * dex - sinPhi * dey;
        let ty = sinPhi * dex + cosPhi * dey;
        if (center.deltaAngle < 0) {
          tx = -tx;
          ty = -ty;
        }
        return { x: tx, y: ty };
      };
      const t0 = tangentAt(center.startAngle);
      const t1 = tangentAt(center.startAngle + center.deltaAngle);
      const n0 = unitNormal(t0.x, t0.y);
      const n1 = unitNormal(t1.x, t1.y);
      const start = offsetPt(cmd.start, n0, d);
      const end = offsetPt(cmd.end, n1, d);
      const sign = center.deltaAngle > 0 ? 1 : -1;
      const newRx = Math.max(0.001, center.rx + sign * d);
      const newRy = Math.max(0.001, center.ry + sign * d);
      return {
        ...base,
        cmds: [{ command: 'a', args: [newRx, newRy, rotation, largeArcFlag, sweepFlag, end.x - start.x, end.y - start.y], start, end }],
        isLine: false,
        emitAsZ: false,
      };
    }
    // Degenerate arc → line
    const dx = cmd.end.x - cmd.start.x;
    const dy = cmd.end.y - cmd.start.y;
    const n = unitNormal(dx, dy);
    const start = offsetPt(cmd.start, n, d);
    const end = offsetPt(cmd.end, n, d);
    return { ...base, cmds: [{ command: 'l', args: [end.x - start.x, end.y - start.y], start, end }], isLine: true, emitAsZ: false };
  }

  // Unknown drawing command: translate by its chord normal.
  const dx = cmd.end.x - cmd.start.x;
  const dy = cmd.end.y - cmd.start.y;
  const n = unitNormal(dx, dy);
  const start = offsetPt(cmd.start, n, d);
  const end = offsetPt(cmd.end, n, d);
  return {
    ...base,
    cmds: [{ command: cmd.command, args: [...cmd.args], start, end }],
    isLine: false,
    emitAsZ: false,
  };
}

/** Recompute a line command's args after an endpoint adjustment. */
function refreshLineArgs(cmd: TransformCmd): void {
  if (cmd.command === 'l') cmd.args = [cmd.end.x - cmd.start.x, cmd.end.y - cmd.start.y];
}

/** Parametric position on a cubic fragment nearest to a target point. */
function nearestCubicT(cmd: TransformCmd, target: Point): number {
  const p0 = cmd.start;
  const p1 = { x: cmd.start.x + cmd.args[0], y: cmd.start.y + cmd.args[1] };
  const p2 = { x: cmd.start.x + cmd.args[2], y: cmd.start.y + cmd.args[3] };
  const p3 = cmd.end;
  let bestT = 0;
  let bestD = Infinity;
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    const pt = evalCubic(p0, p1, p2, p3, t);
    const dist = (pt.x - target.x) ** 2 + (pt.y - target.y) ** 2;
    if (dist < bestD) {
      bestD = dist;
      bestT = t;
    }
  }
  return bestT;
}

/** Trim the tail of a piece's offset commands back to (approximately) the
 *  given crossing point. Lines trim exactly; cubics split at the nearest
 *  parameter. Returns false for untrimmable pieces (arcs). */
function trimPieceTailToward(cmds: TransformCmd[], target: Point): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    const last = cmds[cmds.length - 1];
    if (last.command === 'l') {
      last.end = { ...target };
      refreshLineArgs(last);
      return true;
    }
    if (last.command === 'c') {
      const t = nearestCubicT(last, target);
      if (t < 0.03) {
        if (cmds.length > 1) {
          cmds.pop(); // crossing lies before this fragment — retry on the previous one
          continue;
        }
        return false;
      }
      if (t > 0.97) return true; // endpoint already at the crossing
      const [head] = splitCommandAtParametricT(last, t);
      cmds[cmds.length - 1] = head;
      return true;
    }
    return false;
  }
  return false;
}

/** Mirror of trimPieceTailToward for the head of a piece. */
function trimPieceHeadToward(cmds: TransformCmd[], target: Point): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    const first = cmds[0];
    if (first.command === 'l') {
      first.start = { ...target };
      refreshLineArgs(first);
      return true;
    }
    if (first.command === 'c') {
      const t = nearestCubicT(first, target);
      if (t > 0.97) {
        if (cmds.length > 1) {
          cmds.shift(); // crossing lies beyond this fragment — retry on the next one
          continue;
        }
        return false;
      }
      if (t < 0.03) return true; // start already at the crossing
      const [, tail] = splitCommandAtParametricT(first, t);
      cmds[0] = tail;
      return true;
    }
    return false;
  }
  return false;
}

export function offsetCommands(
  commands: TransformCmd[],
  distance: number,
  options: OffsetJoinOptions = {},
): TransformCmd[] {
  const join = options.join ?? 'miter';
  const miterLimit = options.miterLimit ?? 2;
  if (commands.length === 0 || distance === 0)
    return commands.map((c) => ({
      command: c.command,
      args: [...c.args],
      start: { ...c.start },
      end: { ...c.end },
      ...(c.meta !== undefined ? { meta: c.meta } : {}),
    }));

  // Step 1: resolve S→C, T→Q
  const resolved = resolveSmooth(commands);

  // Step 2: group into subpaths (a leading M plus its drawing commands).
  interface Subpath {
    moveCmd: TransformCmd | null;
    body: TransformCmd[];
  }
  const subpaths: Subpath[] = [];
  let current: Subpath | null = null;
  for (const cmd of resolved) {
    if (cmd.command.toUpperCase() === 'M') {
      current = { moveCmd: cmd, body: [] };
      subpaths.push(current);
      continue;
    }
    if (!current) {
      current = { moveCmd: null, body: [] };
      subpaths.push(current);
    }
    current.body.push(cmd);
    if (cmd.command.toUpperCase() === 'Z') current = null;
  }

  const result: TransformCmd[] = [];

  for (const sub of subpaths) {
    if (sub.body.length === 0) {
      if (sub.moveCmd) {
        result.push({ command: sub.moveCmd.command, args: [...sub.moveCmd.args], start: { ...sub.moveCmd.start }, end: { ...sub.moveCmd.end }, ...(sub.moveCmd.meta !== undefined ? { meta: sub.moveCmd.meta } : {}) });
      }
      continue;
    }

    // Offset every drawing command with its own normals.
    const pieces: OffsetPiece[] = [];
    let zeroZ: TransformCmd | null = null;
    for (const cmd of sub.body) {
      const piece = offsetOneCommand(cmd, distance);
      if (piece) pieces.push(piece);
      else if (cmd.command.toUpperCase() === 'Z') zeroZ = cmd; // re-attach after the ring
      // degenerate zero-length drawing segments are dropped entirely
    }
    if (pieces.length === 0) {
      if (zeroZ) result.push({ ...zeroZ, args: [...zeroZ.args], start: { ...zeroZ.start }, end: { ...zeroZ.end } });
      continue;
    }

    const last = sub.body[sub.body.length - 1];
    const closed =
      last.command.toUpperCase() === 'Z' ||
      (Math.abs(sub.body[0].start.x - last.end.x) < 1e-9 && Math.abs(sub.body[0].start.y - last.end.y) < 1e-9);

    // Step 3: join consecutive pieces; for closed rings also join last→first.
    // Joins either meet at a shared (mitred/trimmed) corner or get a
    // connector inserted between them — join geometry is NEVER folded
    // into a curve segment's own shape.
    const connectors = new Map<number, TransformCmd>(); // insert BEFORE piece at index
    const junctionCount = closed ? pieces.length : pieces.length - 1;
    for (let j = 0; j < junctionCount; j++) {
      const prev = pieces[j];
      const next = pieces[(j + 1) % pieces.length];
      const prevLast = prev.cmds[prev.cmds.length - 1];
      const nextFirst = next.cmds[0];
      const a = prevLast.end;
      const b = nextFirst.start;
      const gap = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
      if (gap < 1e-9) continue; // tangent-continuous — already meeting

      const vertex = prev.srcEnd;
      const hit = lineIntersect(a, prev.srcEndTangent, b, next.srcStartTangent);
      const bothLines = prev.isLine && next.isLine;
      if (hit) {
        const concave = hit.t1 < 1e-9; // trimming back rather than extending
        if (bothLines) {
          const miterLen = Math.sqrt((hit.pt.x - vertex.x) ** 2 + (hit.pt.y - vertex.y) ** 2);
          if (concave || (join === 'miter' && miterLen <= miterLimit * Math.abs(distance))) {
            prevLast.end = { ...hit.pt };
            refreshLineArgs(prevLast);
            nextFirst.start = { ...hit.pt };
            refreshLineArgs(nextFirst);
            continue;
          }
        } else if (concave) {
          // Concave corner with a curve involved: the offset sides cross
          // BEFORE their endpoints, so an external connector would loop
          // outside the silhouette. Trim both sides back to (approximately)
          // the crossing instead, then bridge any residual micro-gap.
          const prevTrimmed = trimPieceTailToward(prev.cmds, hit.pt);
          const nextTrimmed = trimPieceHeadToward(next.cmds, hit.pt);
          if (prevTrimmed && nextTrimmed) {
            const trimmedEnd = prev.cmds[prev.cmds.length - 1].end;
            const trimmedStart = next.cmds[0].start;
            const microGap = Math.sqrt((trimmedStart.x - trimmedEnd.x) ** 2 + (trimmedStart.y - trimmedEnd.y) ** 2);
            if (microGap > 1e-9) {
              const microLabel =
                prev.srcMeta?.segmentLabel !== undefined && prev.srcMeta.segmentLabel === next.srcMeta?.segmentLabel
                  ? prev.srcMeta.segmentLabel
                  : undefined;
              const micro: TransformCmd = {
                command: 'l',
                args: [trimmedStart.x - trimmedEnd.x, trimmedStart.y - trimmedEnd.y],
                start: { ...trimmedEnd },
                end: { ...trimmedStart },
              };
              if (microLabel !== undefined) micro.meta = { segmentLabel: microLabel };
              connectors.set((j + 1) % pieces.length, micro);
            }
            continue;
          }
          // Untrimmable pair (arc-involving) — fall through to a connector.
        }
      }

      // Connector join: bevel line, or a round arc centered on the vertex.
      const sharedLabel =
        prev.srcMeta?.segmentLabel !== undefined && prev.srcMeta.segmentLabel === next.srcMeta?.segmentLabel
          ? prev.srcMeta.segmentLabel
          : undefined;
      let connector: TransformCmd;
      if (join === 'round') {
        const crossV = (a.x - vertex.x) * (b.y - vertex.y) - (a.y - vertex.y) * (b.x - vertex.x);
        connector = {
          command: 'a',
          args: [Math.abs(distance), Math.abs(distance), 0, 0, crossV > 0 ? 1 : 0, b.x - a.x, b.y - a.y],
          start: { ...a },
          end: { ...b },
        };
      } else {
        connector = { command: 'l', args: [b.x - a.x, b.y - a.y], start: { ...a }, end: { ...b } };
      }
      if (sharedLabel !== undefined) connector.meta = { segmentLabel: sharedLabel };
      connectors.set((j + 1) % pieces.length, connector);
    }

    // Step 4: emit — leading move (recomputed), pieces with meta, ring close.
    const ringStart = connectors.has(0) ? connectors.get(0)!.end : pieces[0].cmds[0].start;
    if (sub.moveCmd) {
      const mStart = { ...sub.moveCmd.start };
      result.push({
        command: sub.moveCmd.command,
        args: sub.moveCmd.command === 'M' ? [ringStart.x, ringStart.y] : [ringStart.x - mStart.x, ringStart.y - mStart.y],
        start: mStart,
        end: { ...ringStart },
        ...(sub.moveCmd.meta !== undefined ? { meta: sub.moveCmd.meta } : {}),
      });
    }
    for (let j = 0; j < pieces.length; j++) {
      if (j > 0 && connectors.has(j)) result.push(connectors.get(j)!);
      const piece = pieces[j];
      const isRingCloser = closed && piece.emitAsZ && j === pieces.length - 1 && !connectors.has(0);
      for (let k = 0; k < piece.cmds.length; k++) {
        const cmd = piece.cmds[k];
        const lastOfPiece = k === piece.cmds.length - 1;
        if (isRingCloser && lastOfPiece) {
          // The closing edge rejoins the (possibly mitred) ring start.
          cmd.end = { ...ringStart };
          result.push({ command: 'z', args: [], start: { ...cmd.start }, end: { ...cmd.end }, ...(piece.srcMeta !== undefined ? { meta: piece.srcMeta } : {}) });
          continue;
        }
        if (piece.srcMeta !== undefined) {
          if (piece.cmds.length === 1) {
            cmd.meta = { ...piece.srcMeta, ...(piece.srcMeta.endVertex ? { endVertex: { ...piece.srcMeta.endVertex } } : {}) };
          } else {
            // A subdivided curve: the label covers every fragment, the
            // end-vertex annotation only the final one.
            const seg = piece.srcMeta.segmentLabel;
            const ev = lastOfPiece ? piece.srcMeta.endVertex : undefined;
            const seamId = piece.srcMeta.seamId;
            if (seg !== undefined || ev !== undefined || seamId !== undefined) {
              cmd.meta = {
                ...(seg !== undefined ? { segmentLabel: seg } : {}),
                ...(ev !== undefined ? { endVertex: { ...ev } } : {}),
                ...(seamId !== undefined ? { seamId } : {}),
              };
            }
          }
        }
        result.push(cmd);
      }
    }
    if (closed) {
      const closerEmitted = result.length > 0 && result[result.length - 1].command === 'z';
      if (!closerEmitted) {
        const ringEnd = connectors.has(0) ? connectors.get(0)! : null;
        if (ringEnd) result.push(ringEnd);
        const tail = result[result.length - 1];
        result.push({ command: 'z', args: [], start: { ...tail.end }, end: { ...ringStart }, ...(zeroZ && zeroZ.meta !== undefined ? { meta: zeroZ.meta } : {}) });
      }
    } else if (zeroZ) {
      const tail = result[result.length - 1];
      result.push({ command: 'z', args: [], start: { ...tail.end }, end: { ...tail.end }, ...(zeroZ.meta !== undefined ? { meta: zeroZ.meta } : {}) });
    }
  }

  return result;
}

function getEndTangent(cmd: TransformCmd): Point {
  const upper = cmd.command.toUpperCase();
  let dx: number;
  let dy: number;

  if (upper === 'C') {
    const [, , cx2, cy2] = cmd.args;
    dx = cmd.end.x - cmd.start.x - cx2;
    dy = cmd.end.y - cmd.start.y - cy2;
    if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) {
      dx = cmd.end.x - cmd.start.x;
      dy = cmd.end.y - cmd.start.y;
    }
  } else if (upper === 'Q') {
    const [qx1, qy1] = cmd.args;
    dx = cmd.end.x - cmd.start.x - qx1;
    dy = cmd.end.y - cmd.start.y - qy1;
    if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) {
      dx = cmd.end.x - cmd.start.x;
      dy = cmd.end.y - cmd.start.y;
    }
  } else {
    dx = cmd.end.x - cmd.start.x;
    dy = cmd.end.y - cmd.start.y;
  }

  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-12) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}

function getStartTangent(cmd: TransformCmd): Point {
  const upper = cmd.command.toUpperCase();
  let dx: number;
  let dy: number;

  if (upper === 'C') {
    const [cx1, cy1] = cmd.args;
    dx = cx1;
    dy = cy1;
    if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) {
      dx = cmd.end.x - cmd.start.x;
      dy = cmd.end.y - cmd.start.y;
    }
  } else if (upper === 'Q') {
    const [qx1, qy1] = cmd.args;
    dx = qx1;
    dy = qy1;
    if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) {
      dx = cmd.end.x - cmd.start.x;
      dy = cmd.end.y - cmd.start.y;
    }
  } else {
    dx = cmd.end.x - cmd.start.x;
    dy = cmd.end.y - cmd.start.y;
  }

  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-12) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}

// ---- Shared affine transform helper ----

/**
 * Apply a point transform to every coordinate in the path, then recompute relative args.
 * Does NOT touch arc rotation or sweep — those are handled by callers.
 */
function transformPathPoints(commands: TransformCmd[], transformPoint: (p: Point) => Point): TransformCmd[] {
  const result: TransformCmd[] = [];

  for (const cmd of commands) {
    const upper = cmd.command.toUpperCase();
    const newStart = transformPoint(cmd.start);
    const newEnd = transformPoint(cmd.end);

    switch (upper) {
      case 'L':
      case 'H':
      case 'V': {
        // Always emit as 'l' since transform can rotate axes, breaking H/V constraint
        result.push({
          command: 'l',
          args: [newEnd.x - newStart.x, newEnd.y - newStart.y],
          start: newStart,
          end: newEnd,
        });
        break;
      }
      case 'C': {
        // Transform start, CP1 (start+x1,y1), CP2 (start+x2,y2), end
        const [x1, y1, x2, y2] = cmd.args;
        const cp1Abs = { x: cmd.start.x + x1, y: cmd.start.y + y1 };
        const cp2Abs = { x: cmd.start.x + x2, y: cmd.start.y + y2 };
        const newCp1 = transformPoint(cp1Abs);
        const newCp2 = transformPoint(cp2Abs);
        result.push({
          command: 'c',
          args: [
            newCp1.x - newStart.x,
            newCp1.y - newStart.y,
            newCp2.x - newStart.x,
            newCp2.y - newStart.y,
            newEnd.x - newStart.x,
            newEnd.y - newStart.y,
          ],
          start: newStart,
          end: newEnd,
        });
        break;
      }
      case 'Q': {
        // Transform start, CP (start+x1,y1), end
        const [x1, y1] = cmd.args;
        const cpAbs = { x: cmd.start.x + x1, y: cmd.start.y + y1 };
        const newCp = transformPoint(cpAbs);
        result.push({
          command: 'q',
          args: [newCp.x - newStart.x, newCp.y - newStart.y, newEnd.x - newStart.x, newEnd.y - newStart.y],
          start: newStart,
          end: newEnd,
        });
        break;
      }
      case 'S': {
        // Transform start, CP2 (start+x2,y2), end — smooth relationship preserved by linearity
        const [x2, y2] = cmd.args;
        const cp2Abs = { x: cmd.start.x + x2, y: cmd.start.y + y2 };
        const newCp2 = transformPoint(cp2Abs);
        result.push({
          command: 's',
          args: [newCp2.x - newStart.x, newCp2.y - newStart.y, newEnd.x - newStart.x, newEnd.y - newStart.y],
          start: newStart,
          end: newEnd,
        });
        break;
      }
      case 'T': {
        // Transform start, end — smooth relationship preserved by linearity
        result.push({
          command: 't',
          args: [newEnd.x - newStart.x, newEnd.y - newStart.y],
          start: newStart,
          end: newEnd,
        });
        break;
      }
      case 'A': {
        // Transform start, end. Recompute dx/dy. rx, ry, largeArc preserved.
        // Rotation and sweep handled by caller (mirrorCommands / rotateAtVertexCommands).
        const [rx, ry, rotation, largeArc, sweep] = cmd.args;
        result.push({
          command: 'a',
          args: [rx, ry, rotation, largeArc, sweep, newEnd.x - newStart.x, newEnd.y - newStart.y],
          start: newStart,
          end: newEnd,
        });
        break;
      }
      case 'Z': {
        result.push({
          command: 'z',
          args: [],
          start: newStart,
          end: newEnd,
        });
        break;
      }
      case 'M': {
        result.push({
          command: 'm',
          args: [newEnd.x - newStart.x, newEnd.y - newStart.y],
          start: newStart,
          end: newEnd,
        });
        break;
      }
      default: {
        result.push({
          command: cmd.command,
          args: [newEnd.x - newStart.x, newEnd.y - newStart.y],
          start: newStart,
          end: newEnd,
        });
        break;
      }
    }
    // Every branch pushes exactly one command for this source command —
    // point transforms are 1:1, so meta (labels) carries straight across.
    if (cmd.meta !== undefined) result[result.length - 1].meta = cmd.meta;
  }

  return result;
}

// ---- extractVerticesFromCommands ----

/**
 * Extract unique vertices (start/end points of each segment) as plain Points.
 */
export function extractVerticesFromCommands(commands: TransformCmd[]): Point[] {
  if (commands.length === 0) return [];

  const vertices: Point[] = [];
  const seen = new Set<string>();

  for (const cmd of commands) {
    const startKey = `${cmd.start.x},${cmd.start.y}`;
    if (!seen.has(startKey)) {
      seen.add(startKey);
      vertices.push({ x: cmd.start.x, y: cmd.start.y });
    }
    const endKey = `${cmd.end.x},${cmd.end.y}`;
    if (!seen.has(endKey)) {
      seen.add(endKey);
      vertices.push({ x: cmd.end.x, y: cmd.end.y });
    }
  }

  return vertices;
}

// ---- mirror ----

/**
 * Reflect path across a line through `center` at angle `angle` (radians).
 * Reflection formula: P' = C + (dx·cos2θ + dy·sin2θ, dx·sin2θ - dy·cos2θ)
 */
export function mirrorCommands(commands: TransformCmd[], angle: number, center: Point): TransformCmd[] {
  const cos2a = Math.cos(2 * angle);
  const sin2a = Math.sin(2 * angle);

  const transformPoint = (p: Point): Point => {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    return {
      x: center.x + dx * cos2a + dy * sin2a,
      y: center.y + dx * sin2a - dy * cos2a,
    };
  };

  const result = transformPathPoints(commands, transformPoint);

  // Post-process arc commands: flip sweep, adjust rotation
  const angleDeg = (angle * 180) / Math.PI;
  for (const cmd of result) {
    if (cmd.command.toUpperCase() === 'A') {
      cmd.args[4] = 1 - cmd.args[4]; // flip sweep flag
      cmd.args[2] = 2 * angleDeg - cmd.args[2]; // adjust rotation
    }
  }

  return result;
}

// ---- rotateAtVertexIndex ----

/**
 * Rotate path around the vertex at `vertexIndex` by `angle` (radians).
 * Rotation formula: P' = V + (dx·cosθ - dy·sinθ, dx·sinθ + dy·cosθ)
 */
// ---- scale ----

/**
 * Recompute arc parameters after non-uniform scaling.
 * Uses eigendecomposition of the transformed ellipse shape matrix.
 */
export function scaleArcParams(
  rx: number,
  ry: number,
  rotation: number,
  sweep: number,
  sx: number,
  sy: number,
): { rx: number; ry: number; rotation: number; sweep: number } {
  const absSx = Math.abs(sx);
  const absSy = Math.abs(sy);

  // Flip sweep when exactly one of sx, sy is negative (reflection reverses chirality)
  let newSweep = sweep;
  if (sx < 0 !== sy < 0) {
    newSweep = 1 - sweep;
  }

  // Uniform scaling: just scale the radii
  if (Math.abs(absSx - absSy) < 1e-12) {
    return { rx: rx * absSx, ry: ry * absSx, rotation, sweep: newSweep };
  }

  // Non-uniform: eigendecompose the transformed ellipse shape matrix
  const theta = (rotation * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const rx2 = rx * rx;
  const ry2 = ry * ry;

  // Ellipse shape matrix M = R(θ) · diag(rx², ry²) · R(θ)^T
  const a = rx2 * cosT * cosT + ry2 * sinT * sinT;
  const b = (rx2 - ry2) * cosT * sinT;
  const d = rx2 * sinT * sinT + ry2 * cosT * cosT;

  // Apply scale: M' = S · M · S^T where S = diag(|sx|, |sy|)
  const sx2 = absSx * absSx;
  const sy2 = absSy * absSy;
  const ap = sx2 * a;
  const bp = absSx * absSy * b;
  const dp = sy2 * d;

  // Eigendecompose M' to get new radii and rotation
  const trace = ap + dp;
  const det = ap * dp - bp * bp;
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const lambda1 = trace / 2 + disc;
  const lambda2 = trace / 2 - disc;

  const newRx = Math.sqrt(Math.max(0, lambda1));
  const newRy = Math.sqrt(Math.max(0, lambda2));
  const newRotation =
    Math.abs(bp) < 1e-12 && Math.abs(ap - dp) < 1e-12
      ? rotation // symmetric case — rotation unchanged
      : (Math.atan2(2 * bp, ap - dp) / 2) * (180 / Math.PI);

  return { rx: newRx, ry: newRy, rotation: newRotation, sweep: newSweep };
}

/**
 * Scale path commands from a center point by (sx, sy).
 * Uses transformPathPoints for point coordinates, then post-processes arcs.
 */
export function scaleCommands(commands: TransformCmd[], sx: number, sy: number, center: Point): TransformCmd[] {
  const transformPoint = (p: Point): Point => ({
    x: center.x + (p.x - center.x) * sx,
    y: center.y + (p.y - center.y) * sy,
  });

  const result = transformPathPoints(commands, transformPoint);

  // Post-process arc commands for non-uniform scaling
  for (const cmd of result) {
    if (cmd.command.toUpperCase() === 'A') {
      const scaled = scaleArcParams(cmd.args[0], cmd.args[1], cmd.args[2], cmd.args[4], sx, sy);
      cmd.args[0] = scaled.rx;
      cmd.args[1] = scaled.ry;
      cmd.args[2] = scaled.rotation;
      cmd.args[4] = scaled.sweep;
    }
  }

  return result;
}

// ---- concatenate ----

/**
 * Concatenate two path command arrays end-to-end.
 * Right path's relative commands continue from where the left path ends.
 */
export function concatenateCommands(
  leftCmds: TransformCmd[],
  leftEndPoint: Point,
  rightCmds: TransformCmd[],
): TransformCmd[] {
  if (leftCmds.length === 0 && rightCmds.length === 0) return [];
  if (leftCmds.length === 0) {
    return rightCmds.map((cmd) => ({
      command: cmd.command,
      args: [...cmd.args],
      start: { ...cmd.start },
      end: { ...cmd.end },
      ...(cmd.meta !== undefined ? { meta: cmd.meta } : {}),
    }));
  }
  if (rightCmds.length === 0) {
    return leftCmds.map((cmd) => ({
      command: cmd.command,
      args: [...cmd.args],
      start: { ...cmd.start },
      end: { ...cmd.end },
      ...(cmd.meta !== undefined ? { meta: cmd.meta } : {}),
    }));
  }

  // Deep-copy left commands (unchanged)
  const result: TransformCmd[] = leftCmds.map((cmd) => ({
    command: cmd.command,
    args: [...cmd.args],
    start: { ...cmd.start },
    end: { ...cmd.end },
    ...(cmd.meta !== undefined ? { meta: cmd.meta } : {}),
  }));

  // Deep-copy right commands, offset start/end by leftEndPoint
  for (const cmd of rightCmds) {
    result.push({
      command: cmd.command,
      args: [...cmd.args],
      start: { x: cmd.start.x + leftEndPoint.x, y: cmd.start.y + leftEndPoint.y },
      end: { x: cmd.end.x + leftEndPoint.x, y: cmd.end.y + leftEndPoint.y },
      ...(cmd.meta !== undefined ? { meta: cmd.meta } : {}),
    });
  }

  return result;
}

export function rotateAtVertexCommands(commands: TransformCmd[], vertexIndex: number, angle: number): TransformCmd[] {
  const vertices = extractVerticesFromCommands(commands);

  if (vertexIndex < 0 || vertexIndex >= vertices.length) {
    throw new Error(`rotateAtVertexIndex() vertex index ${vertexIndex} out of range [0, ${vertices.length - 1}]`);
  }

  return rotateAboutPointCommands(commands, angle, vertices[vertexIndex]);
}

/** Rotate commands about an arbitrary pivot point (in the commands' own
 *  coordinate frame). Shared by rotateAtVertexCommands and `rotate()`. */
export function rotateAboutPointCommands(commands: TransformCmd[], angle: number, center: Point): TransformCmd[] {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  const transformPoint = (p: Point): Point => {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    return {
      x: center.x + dx * cosA - dy * sinA,
      y: center.y + dx * sinA + dy * cosA,
    };
  };

  const result = transformPathPoints(commands, transformPoint);

  // Post-process arc commands: adjust rotation (sweep unchanged)
  const angleDeg = (angle * 180) / Math.PI;
  for (const cmd of result) {
    if (cmd.command.toUpperCase() === 'A') {
      cmd.args[2] += angleDeg; // adjust rotation
    }
  }

  // Snap sub-epsilon float residue (cos/sin of right angles) so emitted
  // output stays free of `1.5e-15`-style artifacts.
  const snap = (v: number): number => (Math.abs(v) < 1e-9 ? 0 : v);
  for (const cmd of result) {
    const u = cmd.command.toUpperCase();
    if (u !== 'A') {
      for (let i = 0; i < cmd.args.length; i++) cmd.args[i] = snap(cmd.args[i]);
    } else {
      cmd.args[5] = snap(cmd.args[5]);
      cmd.args[6] = snap(cmd.args[6]);
    }
    cmd.start = { x: snap(cmd.start.x), y: snap(cmd.start.y) };
    cmd.end = { x: snap(cmd.end.x), y: snap(cmd.end.y) };
  }

  return result;
}

// ---- splitCommandAtParametricT ----

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Split a single drawing command at parametric t ∈ (0, 1).
 * Returns [head, tail] — two commands covering [0, t] and [t, 1].
 */
export function splitCommandAtParametricT(cmd: TransformCmd, t: number): [TransformCmd, TransformCmd] {
  if (t <= 0) {
    const zero: TransformCmd = { command: cmd.command, args: [], start: { ...cmd.start }, end: { ...cmd.start } };
    return [zero, { command: cmd.command, args: [...cmd.args], start: { ...cmd.start }, end: { ...cmd.end } }];
  }
  if (t >= 1) {
    const zero: TransformCmd = { command: cmd.command, args: [], start: { ...cmd.end }, end: { ...cmd.end } };
    return [{ command: cmd.command, args: [...cmd.args], start: { ...cmd.start }, end: { ...cmd.end } }, zero];
  }

  const upper = cmd.command.toUpperCase();

  switch (upper) {
    case 'L':
    case 'H':
    case 'V':
    case 'Z': {
      // Linear interpolation
      const dx = cmd.end.x - cmd.start.x;
      const dy = cmd.end.y - cmd.start.y;
      const mid = { x: cmd.start.x + dx * t, y: cmd.start.y + dy * t };
      const head: TransformCmd = {
        command: 'l',
        args: [mid.x - cmd.start.x, mid.y - cmd.start.y],
        start: { ...cmd.start },
        end: { ...mid },
      };
      const tail: TransformCmd = {
        command: 'l',
        args: [cmd.end.x - mid.x, cmd.end.y - mid.y],
        start: { ...mid },
        end: { ...cmd.end },
      };
      return [head, tail];
    }

    case 'C': {
      // De Casteljau cubic split
      const [cx1, cy1, cx2, cy2] = cmd.args;
      const p0 = cmd.start;
      const p1 = { x: p0.x + cx1, y: p0.y + cy1 };
      const p2 = { x: p0.x + cx2, y: p0.y + cy2 };
      const p3 = cmd.end;

      // First level
      const p01 = lerpPoint(p0, p1, t);
      const p12 = lerpPoint(p1, p2, t);
      const p23 = lerpPoint(p2, p3, t);
      // Second level
      const p012 = lerpPoint(p01, p12, t);
      const p123 = lerpPoint(p12, p23, t);
      // Third level (split point)
      const mid = lerpPoint(p012, p123, t);

      const head: TransformCmd = {
        command: 'c',
        args: [p01.x - p0.x, p01.y - p0.y, p012.x - p0.x, p012.y - p0.y, mid.x - p0.x, mid.y - p0.y],
        start: { ...p0 },
        end: { ...mid },
      };
      const tail: TransformCmd = {
        command: 'c',
        args: [p123.x - mid.x, p123.y - mid.y, p23.x - mid.x, p23.y - mid.y, p3.x - mid.x, p3.y - mid.y],
        start: { ...mid },
        end: { ...p3 },
      };
      return [head, tail];
    }

    case 'Q': {
      // De Casteljau quadratic split
      const [qx1, qy1] = cmd.args;
      const p0 = cmd.start;
      const p1 = { x: p0.x + qx1, y: p0.y + qy1 };
      const p2 = cmd.end;

      const p01 = lerpPoint(p0, p1, t);
      const p12 = lerpPoint(p1, p2, t);
      const mid = lerpPoint(p01, p12, t);

      const head: TransformCmd = {
        command: 'q',
        args: [p01.x - p0.x, p01.y - p0.y, mid.x - p0.x, mid.y - p0.y],
        start: { ...p0 },
        end: { ...mid },
      };
      const tail: TransformCmd = {
        command: 'q',
        args: [p12.x - mid.x, p12.y - mid.y, p2.x - mid.x, p2.y - mid.y],
        start: { ...mid },
        end: { ...p2 },
      };
      return [head, tail];
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
        // Degenerate arc → treat as line
        const dx = cmd.end.x - cmd.start.x;
        const dy = cmd.end.y - cmd.start.y;
        const mid = { x: cmd.start.x + dx * t, y: cmd.start.y + dy * t };
        return [
          { command: 'l', args: [mid.x - cmd.start.x, mid.y - cmd.start.y], start: { ...cmd.start }, end: { ...mid } },
          { command: 'l', args: [cmd.end.x - mid.x, cmd.end.y - mid.y], start: { ...mid }, end: { ...cmd.end } },
        ];
      }

      // Split angle range
      const mid = arcPointFromCenter(center, t);

      const delta1 = t * center.deltaAngle;
      const delta2 = (1 - t) * center.deltaAngle;

      // largeArc flag: 1 if |deltaAngle| > π
      const la1 = Math.abs(delta1) > Math.PI ? 1 : 0;
      const la2 = Math.abs(delta2) > Math.PI ? 1 : 0;

      const head: TransformCmd = {
        command: 'a',
        args: [center.rx, center.ry, rotation, la1, sweepFlag, mid.x - cmd.start.x, mid.y - cmd.start.y],
        start: { ...cmd.start },
        end: { ...mid },
      };
      const tail: TransformCmd = {
        command: 'a',
        args: [center.rx, center.ry, rotation, la2, sweepFlag, cmd.end.x - mid.x, cmd.end.y - mid.y],
        start: { ...mid },
        end: { ...cmd.end },
      };
      return [head, tail];
    }

    default: {
      // Unknown command: treat as line
      const dx = cmd.end.x - cmd.start.x;
      const dy = cmd.end.y - cmd.start.y;
      const mid = { x: cmd.start.x + dx * t, y: cmd.start.y + dy * t };
      return [
        { command: 'l', args: [mid.x - cmd.start.x, mid.y - cmd.start.y], start: { ...cmd.start }, end: { ...mid } },
        { command: 'l', args: [cmd.end.x - mid.x, cmd.end.y - mid.y], start: { ...mid }, end: { ...cmd.end } },
      ];
    }
  }
}

// ---- subPathCommands ----

/**
 * Extract the geometric portion of a path between arc-length fractions startT and endT.
 * If startT > endT, the result is reversed.
 */
export function subPathCommands(commands: TransformCmd[], startT: number, endT: number): TransformCmd[] {
  // Handle reversed range
  if (startT > endT) {
    const forward = subPathCommands(commands, endT, startT);
    return reverseCommands(forward);
  }

  // Equal → empty path
  if (startT === endT) return [];

  // Clamp
  startT = Math.max(0, Math.min(1, startT));
  endT = Math.max(0, Math.min(1, endT));

  // Resolve smooth curves (S→C, T→Q) for accurate splitting
  const resolved = resolveSmooth(commands);

  // Filter to drawing commands (skip M) and compute lengths
  const drawCmds = resolved.filter((c) => c.command.toUpperCase() !== 'M');
  if (drawCmds.length === 0) return [];

  const cmdLengths: number[] = [];
  let totalLength = 0;
  for (const cmd of drawCmds) {
    const len = calculateCommandLength(cmd);
    cmdLengths.push(len);
    totalLength += len;
  }

  if (totalLength === 0) return [];

  // Locate start and end commands
  const startLoc = locateCommandAtFraction(drawCmds, cmdLengths, totalLength, startT);
  const endLoc = locateCommandAtFraction(drawCmds, cmdLengths, totalLength, endT);

  // Convert arc-length local t to parametric t
  const startParamT = getParametricTForCommand(drawCmds[startLoc.cmdIndex], startLoc.localT);
  const endParamT = getParametricTForCommand(drawCmds[endLoc.cmdIndex], endLoc.localT);

  if (startLoc.cmdIndex === endLoc.cmdIndex) {
    // Same command: split twice to extract middle
    const cmd = drawCmds[startLoc.cmdIndex];

    if (startParamT >= 1 || endParamT <= 0) return [];

    // First split at startParamT
    const [, afterStart] = splitCommandAtParametricT(cmd, startParamT);

    // The remaining portion represents [startParamT, 1] of the original.
    // We need [startParamT, endParamT], which is [0, (endParamT - startParamT) / (1 - startParamT)] of afterStart.
    const remainingRange = 1 - startParamT;
    if (remainingRange <= 0) return [];
    const adjustedEndT = (endParamT - startParamT) / remainingRange;
    const [middle] = splitCommandAtParametricT(afterStart, Math.max(0, Math.min(1, adjustedEndT)));

    // Filter zero-length
    const dx = middle.end.x - middle.start.x;
    const dy = middle.end.y - middle.start.y;
    if (middle.args.length === 0 && Math.abs(dx) < 1e-10 && Math.abs(dy) < 1e-10) return [];

    // Labels: the fragment keeps its source segment label; the endpoint
    // label only applies when the fragment retains the command's true end.
    if (cmd.meta !== undefined) {
      const keepEnd = endParamT >= 1 - 1e-12;
      const mid: PathCommandMeta = {
        ...(cmd.meta.segmentLabel !== undefined ? { segmentLabel: cmd.meta.segmentLabel } : {}),
        ...(keepEnd && cmd.meta.endVertex ? { endVertex: { ...cmd.meta.endVertex } } : {}),
      };
      if (mid.segmentLabel !== undefined || mid.endVertex !== undefined) middle.meta = mid;
    }

    return [middle];
  }

  // Different commands: tail of start + full middle commands + head of end
  const result: TransformCmd[] = [];

  // Tail of start command
  if (startParamT < 1) {
    const [, startTail] = splitCommandAtParametricT(drawCmds[startLoc.cmdIndex], startParamT);
    const startMeta = drawCmds[startLoc.cmdIndex].meta;
    if (startMeta !== undefined) startTail.meta = startMeta; // tail keeps the true end vertex
    const sdx = startTail.end.x - startTail.start.x;
    const sdy = startTail.end.y - startTail.start.y;
    const hasLength = startTail.args.length > 0 || Math.abs(sdx) > 1e-10 || Math.abs(sdy) > 1e-10;
    if (hasLength) result.push(startTail);
  }

  // Full middle commands
  for (let i = startLoc.cmdIndex + 1; i < endLoc.cmdIndex; i++) {
    result.push({
      command: drawCmds[i].command,
      args: [...drawCmds[i].args],
      start: { ...drawCmds[i].start },
      end: { ...drawCmds[i].end },
      ...(drawCmds[i].meta !== undefined ? { meta: drawCmds[i].meta } : {}),
    });
  }

  // Head of end command
  if (endParamT > 0) {
    const [endHead] = splitCommandAtParametricT(drawCmds[endLoc.cmdIndex], endParamT);
    const endSegLabel = drawCmds[endLoc.cmdIndex].meta?.segmentLabel;
    if (endSegLabel !== undefined) endHead.meta = { segmentLabel: endSegLabel };
    const edx = endHead.end.x - endHead.start.x;
    const edy = endHead.end.y - endHead.start.y;
    const hasLength = endHead.args.length > 0 || Math.abs(edx) > 1e-10 || Math.abs(edy) > 1e-10;
    if (hasLength) result.push(endHead);
  }

  return result;
}

// ---- Chamfers, Fillets, Elliptical Fillets ----

/**
 * Identify corner vertex indices — junctions between consecutive drawing commands.
 * For a closed path (ending with z), the closure junction (last→first) is included.
 * Returns indices into the commands array where command[i].end == command[i+1].start.
 */
export function identifyCornerVertices(commands: TransformCmd[]): number[] {
  if (commands.length < 2) return [];
  const corners: number[] = [];
  for (let i = 0; i < commands.length - 1; i++) {
    // A corner is at the junction between command i and command i+1
    // (command i's end == command i+1's start)
    const upper = commands[i].command.toUpperCase();
    const upperNext = commands[i + 1].command.toUpperCase();
    if (upper === 'M' || upperNext === 'M' || upper === 'Z' || upperNext === 'Z') continue;
    corners.push(i);
  }
  return corners;
}

/**
 * Trim distance from end of a command using arc-length.
 * Returns parametric t at which to split to keep the first portion.
 */
function findTrimFromEndT(cmd: TransformCmd, distance: number): number {
  const len = calculateCommandLength(cmd);
  if (len <= 0) return 1;
  if (distance >= len) return 0;
  const keepFraction = (len - distance) / len;
  return getParametricTForCommand(cmd, keepFraction);
}

/**
 * Trim distance from start of a command using arc-length.
 * Returns parametric t at which to split to keep the tail portion.
 */
function findTrimFromStartT(cmd: TransformCmd, distance: number): number {
  const len = calculateCommandLength(cmd);
  if (len <= 0) return 0;
  if (distance >= len) return 1;
  const skipFraction = distance / len;
  return getParametricTForCommand(cmd, skipFraction);
}

interface CornerOperation {
  type: 'chamfer' | 'fillet' | 'ellipticalFillet';
  d1: number;
  d2: number;
  // For fillet
  radius?: number;
  // For elliptical fillet
  rx?: number;
  ry?: number;
  rotation?: number;
}



/**
 * Apply corner operations (chamfer, fillet, or elliptical fillet) to commands.
 * @param commands The path commands
 * @param vertexIndices Which corner indices to operate on (null = all)
 * @param op The corner operation to apply
 * @returns { commands, warnings }
 */
export function applyCornerOperations(
  commands: TransformCmd[],
  vertexIndices: number[] | null,
  op: CornerOperation,
): { commands: TransformCmd[]; warnings: string[] } {
  const warnings: string[] = [];

  // Step 1: resolve S→C, T→Q
  const resolved = resolveSmooth(commands);

  // Check for closed path and expand z
  let isClosed = false;
  let zMeta: PathCommandMeta | undefined;
  const working = [...resolved];
  if (working.length > 0 && working[working.length - 1].command.toUpperCase() === 'Z') {
    const zCmd = working.pop()!;
    zMeta = zCmd.meta;
    isClosed = true;
    const zdx = zCmd.end.x - zCmd.start.x;
    const zdy = zCmd.end.y - zCmd.start.y;
    if (Math.abs(zdx) > 1e-10 || Math.abs(zdy) > 1e-10) {
      working.push({
        command: 'l',
        args: [zdx, zdy],
        start: { ...zCmd.start },
        end: { ...zCmd.end },
      });
    }
  }

  // Filter to drawing commands
  const drawCmds = working.filter((c) => c.command.toUpperCase() !== 'M');
  if (drawCmds.length < 2) return { commands: [...commands], warnings };

  // Identify corners
  const allCorners = identifyCornerVertices(drawCmds);

  // If closed, add the closure corner (last cmd → first cmd)
  if (isClosed && drawCmds.length >= 2) {
    allCorners.push(drawCmds.length - 1); // junction at last command
  }

  // Filter to requested vertices
  let targetCorners: number[];
  if (vertexIndices !== null) {
    targetCorners = [];
    for (const vi of vertexIndices) {
      if (vi < 0 || vi >= allCorners.length) {
        throw new Error(`chamfer/fillet vertex index ${vi} out of range [0, ${allCorners.length - 1}]`);
      }
      targetCorners.push(allCorners[vi]);
    }
  } else {
    targetCorners = [...allCorners];
  }

  if (targetCorners.length === 0) return { commands: [...commands], warnings };

  // Process corners from end to start so indices stay valid
  const targetSet = new Set(targetCorners);
  const sortedCorners = [...targetSet].sort((a, b) => b - a);

  // Work with a mutable copy of drawCmds
  const result = drawCmds.map((cmd) => ({
    command: cmd.command,
    args: [...cmd.args],
    start: { ...cmd.start },
    end: { ...cmd.end },
    ...(cmd.meta !== undefined ? { meta: cmd.meta } : {}),
  }));

  for (const cornerIdx of sortedCorners) {
    const isClosureCorner = isClosed && cornerIdx === drawCmds.length - 1;
    const incomingIdx = cornerIdx;
    const outgoingIdx = isClosureCorner ? 0 : cornerIdx + 1;

    if (incomingIdx >= result.length || outgoingIdx >= result.length) continue;

    const incoming = result[incomingIdx];
    const outgoing = result[outgoingIdx];

    const inLen = calculateCommandLength(incoming);
    const outLen = calculateCommandLength(outgoing);

    let d1 = op.d1;
    let d2 = op.d2;

    // Clamp distances
    if (d1 > inLen) {
      d1 = inLen;
      warnings.push(`Chamfer/fillet distance ${op.d1} clamped to incoming edge length ${inLen.toFixed(2)}`);
    }
    if (d2 > outLen) {
      d2 = outLen;
      warnings.push(`Chamfer/fillet distance ${op.d2} clamped to outgoing edge length ${outLen.toFixed(2)}`);
    }

    if (d1 <= 0 && d2 <= 0) continue;

    // For fillet/ellipticalFillet, check if both edges are lines
    if (op.type === 'fillet' || op.type === 'ellipticalFillet') {
      const inUpper = incoming.command.toUpperCase();
      const outUpper = outgoing.command.toUpperCase();
      const isInLine = inUpper === 'L' || inUpper === 'H' || inUpper === 'V';
      const isOutLine = outUpper === 'L' || outUpper === 'H' || outUpper === 'V';
      if (!isInLine || !isOutLine) {
        warnings.push(`Fillet skipped at curve junction (index ${cornerIdx})`);
        continue;
      }
    }

    // Trim incoming from end
    const trimEndT = findTrimFromEndT(incoming, d1);
    const [inHead] = splitCommandAtParametricT(incoming, trimEndT);
    if (incoming.meta !== undefined) inHead.meta = incoming.meta;

    // Trim outgoing from start
    const trimStartT = findTrimFromStartT(outgoing, d2);
    const [, outTail] = splitCommandAtParametricT(outgoing, trimStartT);
    if (outgoing.meta !== undefined) outTail.meta = outgoing.meta;

    // Build the corner insert
    const trimEndPoint = inHead.end;
    const trimStartPoint = outTail.start;

    let insertCmds: TransformCmd[];

    if (op.type === 'chamfer') {
      // Insert a line from trimEndPoint to trimStartPoint
      const dx = trimStartPoint.x - trimEndPoint.x;
      const dy = trimStartPoint.y - trimEndPoint.y;
      insertCmds = [
        {
          command: 'l',
          args: [dx, dy],
          start: { ...trimEndPoint },
          end: { ...trimStartPoint },
        },
      ];
    } else if (op.type === 'fillet') {
      const radius = op.radius!;
      insertCmds = buildFilletArc(incoming, outgoing, trimEndPoint, trimStartPoint, radius);
    } else {
      // ellipticalFillet
      const rx = op.rx!;
      const ry = op.ry!;
      const rotation = op.rotation ?? 0;
      insertCmds = buildEllipticalFilletArc(incoming, outgoing, trimEndPoint, trimStartPoint, rx, ry, rotation);
    }
    const insertMeta = inheritInsertMeta(incoming, outgoing);
    if (insertMeta !== undefined) {
      for (const ins of insertCmds) ins.meta = insertMeta;
    }

    // Replace in result array
    if (isClosureCorner) {
      // Special case: closure corner straddles end and start
      result[incomingIdx] = inHead;
      result[outgoingIdx] = outTail;
      // Insert chamfer/fillet at end and connect to start
      result.push(...insertCmds);
    } else {
      // Replace incoming with trimmed head, outgoing with trimmed tail, insert between
      result.splice(incomingIdx, 2, inHead, ...insertCmds, outTail);
    }
  }

  // Re-close if was closed
  if (isClosed) {
    const last = result[result.length - 1];
    const first = result[0];
    result.push({
      command: 'z',
      args: [],
      start: { ...last.end },
      end: { ...first.start },
      ...(zMeta !== undefined ? { meta: zMeta } : {}),
    });
  }

  return { commands: result, warnings };
}

/**
 * Build a circular fillet arc between two line segments.
 */
function buildFilletArc(
  incoming: TransformCmd,
  outgoing: TransformCmd,
  p1: Point,
  p2: Point,
  radius: number,
): TransformCmd[] {
  // Compute edge directions at the vertex
  const vertex = incoming.end;

  // Incoming direction: from incoming.start to incoming.end
  const inDx = vertex.x - incoming.start.x;
  const inDy = vertex.y - incoming.start.y;
  const inLen = Math.sqrt(inDx * inDx + inDy * inDy);

  // Outgoing direction: from outgoing.start to outgoing.end
  const outDx = outgoing.end.x - vertex.x;
  const outDy = outgoing.end.y - vertex.y;
  const outLen = Math.sqrt(outDx * outDx + outDy * outDy);

  if (inLen < 1e-10 || outLen < 1e-10) {
    // Degenerate: just line
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return [{ command: 'l', args: [dx, dy], start: { ...p1 }, end: { ...p2 } }];
  }

  const uInX = inDx / inLen;
  const uInY = inDy / inLen;
  const uOutX = outDx / outLen;
  const uOutY = outDy / outLen;

  // Cross product determines sweep direction
  const cross = uInX * uOutY - uInY * uOutX;
  const sweep = cross > 0 ? 1 : 0;

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  return [
    {
      command: 'a',
      args: [radius, radius, 0, 0, sweep, dx, dy],
      start: { ...p1 },
      end: { ...p2 },
    },
  ];
}

/**
 * Build an elliptical fillet arc between two line segments.
 */
function buildEllipticalFilletArc(
  incoming: TransformCmd,
  outgoing: TransformCmd,
  p1: Point,
  p2: Point,
  rx: number,
  ry: number,
  rotation: number,
): TransformCmd[] {
  const vertex = incoming.end;

  const inDx = vertex.x - incoming.start.x;
  const inDy = vertex.y - incoming.start.y;
  const inLen = Math.sqrt(inDx * inDx + inDy * inDy);

  const outDx = outgoing.end.x - vertex.x;
  const outDy = outgoing.end.y - vertex.y;
  const outLen = Math.sqrt(outDx * outDx + outDy * outDy);

  if (inLen < 1e-10 || outLen < 1e-10) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return [{ command: 'l', args: [dx, dy], start: { ...p1 }, end: { ...p2 } }];
  }

  const uInX = inDx / inLen;
  const uInY = inDy / inLen;
  const uOutX = outDx / outLen;
  const uOutY = outDy / outLen;

  const cross = uInX * uOutY - uInY * uOutX;
  const sweep = cross > 0 ? 1 : 0;

  const rotDeg = (rotation * 180) / Math.PI;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  return [
    {
      command: 'a',
      args: [rx, ry, rotDeg, 0, sweep, dx, dy],
      start: { ...p1 },
      end: { ...p2 },
    },
  ];
}

/**
 * Chamfer all corners or specific vertices.
 */
export function chamferCommands(
  commands: TransformCmd[],
  d1: number,
  d2: number,
  vertexIndices: number[] | null,
): { commands: TransformCmd[]; warnings: string[] } {
  return applyCornerOperations(commands, vertexIndices, { type: 'chamfer', d1, d2 });
}

/**
 * Fillet all corners or specific vertices with circular arcs.
 */
export function filletCommands(
  commands: TransformCmd[],
  radius: number,
  vertexIndices: number[] | null,
): { commands: TransformCmd[]; warnings: string[] } {
  // For fillets, compute trim distance from radius and half-angle
  // But we need vertex geometry per-corner; use applyCornerOperations with fillet type
  // The trim distance for a circular fillet at a line-line junction is radius / tan(halfAngle)
  // We pass the radius and let applyCornerOperations compute d1/d2 per vertex
  return applyFilletOperations(commands, vertexIndices, radius);
}

/**
 * Compute the tangent direction (as dx, dy) at the END of a command.
 * For lines: direction from start to end.
 * For arcs: perpendicular to radius at endpoint (direction of travel).
 * For curves: direction from last control point to endpoint.
 */
function getEdgeTangentAtEnd(cmd: TransformCmd): { dx: number; dy: number } {
  const upper = cmd.command.toUpperCase();
  if (upper === 'A') {
    const [rx, ry, rotation, largeArcFlag, sweepFlag] = cmd.args;
    const phi = (rotation * Math.PI) / 180;
    const center = arcEndpointToCenter(
      cmd.start.x, cmd.start.y, rx, ry, phi,
      largeArcFlag, sweepFlag, cmd.end.x, cmd.end.y,
    );
    if (!center) return { dx: cmd.end.x - cmd.start.x, dy: cmd.end.y - cmd.start.y };
    const radDx = cmd.end.x - center.cx;
    const radDy = cmd.end.y - center.cy;
    // Tangent perpendicular to radius; direction depends on arc sweep
    if (center.deltaAngle > 0) {
      return { dx: -radDy, dy: radDx }; // CCW
    } else {
      return { dx: radDy, dy: -radDx }; // CW
    }
  }
  if (upper === 'C') {
    const [, , cx2, cy2] = cmd.args;
    const cpX = cmd.start.x + cx2;
    const cpY = cmd.start.y + cy2;
    const dx = cmd.end.x - cpX;
    const dy = cmd.end.y - cpY;
    if (Math.abs(dx) > 1e-10 || Math.abs(dy) > 1e-10) return { dx, dy };
  }
  if (upper === 'Q') {
    const [qx1, qy1] = cmd.args;
    const cpX = cmd.start.x + qx1;
    const cpY = cmd.start.y + qy1;
    const dx = cmd.end.x - cpX;
    const dy = cmd.end.y - cpY;
    if (Math.abs(dx) > 1e-10 || Math.abs(dy) > 1e-10) return { dx, dy };
  }
  return { dx: cmd.end.x - cmd.start.x, dy: cmd.end.y - cmd.start.y };
}

/**
 * Compute the tangent direction (as dx, dy) at the START of a command.
 */
function getEdgeTangentAtStart(cmd: TransformCmd): { dx: number; dy: number } {
  const upper = cmd.command.toUpperCase();
  if (upper === 'A') {
    const [rx, ry, rotation, largeArcFlag, sweepFlag] = cmd.args;
    const phi = (rotation * Math.PI) / 180;
    const center = arcEndpointToCenter(
      cmd.start.x, cmd.start.y, rx, ry, phi,
      largeArcFlag, sweepFlag, cmd.end.x, cmd.end.y,
    );
    if (!center) return { dx: cmd.end.x - cmd.start.x, dy: cmd.end.y - cmd.start.y };
    const radDx = cmd.start.x - center.cx;
    const radDy = cmd.start.y - center.cy;
    if (center.deltaAngle > 0) {
      return { dx: -radDy, dy: radDx }; // CCW
    } else {
      return { dx: radDy, dy: -radDx }; // CW
    }
  }
  if (upper === 'C') {
    const [cx1, cy1] = cmd.args;
    if (Math.abs(cx1) > 1e-10 || Math.abs(cy1) > 1e-10) return { dx: cx1, dy: cy1 };
  }
  if (upper === 'Q') {
    const [qx1, qy1] = cmd.args;
    if (Math.abs(qx1) > 1e-10 || Math.abs(qy1) > 1e-10) return { dx: qx1, dy: qy1 };
  }
  return { dx: cmd.end.x - cmd.start.x, dy: cmd.end.y - cmd.start.y };
}

/**
 * Apply fillet operations with proper per-vertex trim distance calculation.
 */
function applyFilletOperations(
  commands: TransformCmd[],
  vertexIndices: number[] | null,
  radius: number,
): { commands: TransformCmd[]; warnings: string[] } {
  const warnings: string[] = [];

  const resolved = resolveSmooth(commands);

  let isClosed = false;
  let zMeta: PathCommandMeta | undefined;
  const working = [...resolved];
  if (working.length > 0 && working[working.length - 1].command.toUpperCase() === 'Z') {
    const zCmd = working.pop()!;
    zMeta = zCmd.meta;
    isClosed = true;
    const zdx = zCmd.end.x - zCmd.start.x;
    const zdy = zCmd.end.y - zCmd.start.y;
    if (Math.abs(zdx) > 1e-10 || Math.abs(zdy) > 1e-10) {
      working.push({
        command: 'l',
        args: [zdx, zdy],
        start: { ...zCmd.start },
        end: { ...zCmd.end },
      });
    }
  }

  const drawCmds = working.filter((c) => c.command.toUpperCase() !== 'M');
  if (drawCmds.length < 2) return { commands: [...commands], warnings };

  const allCorners = identifyCornerVertices(drawCmds);
  if (isClosed && drawCmds.length >= 2) {
    allCorners.push(drawCmds.length - 1);
  }

  let targetCorners: number[];
  if (vertexIndices !== null) {
    targetCorners = [];
    for (const vi of vertexIndices) {
      if (vi < 0 || vi >= allCorners.length) {
        throw new Error(`fillet vertex index ${vi} out of range [0, ${allCorners.length - 1}]`);
      }
      targetCorners.push(allCorners[vi]);
    }
  } else {
    targetCorners = [...allCorners];
  }

  if (targetCorners.length === 0) return { commands: [...commands], warnings };

  const targetSet = new Set(targetCorners);
  const sortedCorners = [...targetSet].sort((a, b) => b - a);

  const result = drawCmds.map((cmd) => ({
    command: cmd.command,
    args: [...cmd.args],
    start: { ...cmd.start },
    end: { ...cmd.end },
    ...(cmd.meta !== undefined ? { meta: cmd.meta } : {}),
  }));

  for (const cornerIdx of sortedCorners) {
    const isClosureCorner = isClosed && cornerIdx === drawCmds.length - 1;
    const incomingIdx = cornerIdx;
    const outgoingIdx = isClosureCorner ? 0 : cornerIdx + 1;

    if (incomingIdx >= result.length || outgoingIdx >= result.length) continue;

    const incoming = result[incomingIdx];
    const outgoing = result[outgoingIdx];

    const vertex = incoming.end;

    // Compute tangent directions at the junction (works for lines, arcs, and curves)
    const inTangent = getEdgeTangentAtEnd(incoming);
    const outTangent = getEdgeTangentAtStart(outgoing);

    const inDx = inTangent.dx;
    const inDy = inTangent.dy;
    const inLen = Math.sqrt(inDx * inDx + inDy * inDy);

    const outDx = outTangent.dx;
    const outDy = outTangent.dy;
    const outLen = Math.sqrt(outDx * outDx + outDy * outDy);

    if (inLen < 1e-10 || outLen < 1e-10) continue;

    // Unit vectors pointing away from vertex
    const upX = -inDx / inLen; // toward incoming start
    const upY = -inDy / inLen;
    const uqX = outDx / outLen; // toward outgoing end
    const uqY = outDy / outLen;

    // Half angle
    const dot = upX * uqX + upY * uqY;
    const clampedDot = Math.max(-1, Math.min(1, dot));
    const halfAngle = Math.acos(clampedDot) / 2;

    if (halfAngle < 1e-10 || Math.abs(halfAngle - Math.PI / 2) < 1e-10 && Math.abs(Math.PI - Math.acos(clampedDot)) < 1e-10) {
      // Collinear edges, skip
      continue;
    }

    // Trim distance
    let trimDist = radius / Math.tan(halfAngle);
    let effectiveRadius = radius;

    // Clamp against actual edge arc-lengths (not tangent vector lengths)
    const inEdgeLen = calculateCommandLength(incoming);
    const outEdgeLen = calculateCommandLength(outgoing);
    if (trimDist > inEdgeLen) {
      trimDist = inEdgeLen;
      effectiveRadius = trimDist * Math.tan(halfAngle);
      warnings.push(`Fillet radius clamped at vertex ${cornerIdx}: effective radius ${effectiveRadius.toFixed(2)}`);
    }
    if (trimDist > outEdgeLen) {
      trimDist = outEdgeLen;
      effectiveRadius = trimDist * Math.tan(halfAngle);
      warnings.push(`Fillet radius clamped at vertex ${cornerIdx}: effective radius ${effectiveRadius.toFixed(2)}`);
    }

    // Trim points — computed by splitting edges at the trim distance
    // For lines, this is equivalent to vertex + direction * trimDist
    // For arcs/curves, splitCommandAtParametricT handles the geometry
    const inTrimT = findTrimFromEndT(incoming, trimDist);
    const outTrimT = findTrimFromStartT(outgoing, trimDist);

    // Skip if trim would consume the entire edge (degenerate result)
    if (inTrimT <= 1e-6 || outTrimT >= 1 - 1e-6) {
      warnings.push(`Fillet skipped at vertex ${cornerIdx}: radius too large for edge length`);
      continue;
    }

    const [inHead] = splitCommandAtParametricT(incoming, inTrimT);
    if (incoming.meta !== undefined) inHead.meta = incoming.meta;
    const p1 = { ...inHead.end };

    const [, outTail] = splitCommandAtParametricT(outgoing, outTrimT);
    if (outgoing.meta !== undefined) outTail.meta = outgoing.meta;
    const p2 = { ...outTail.start };

    // Sweep flag: use cross product of incoming/outgoing direction
    const crossIO = inDx * outDy - inDy * outDx;
    const sweep = crossIO > 0 ? 1 : 0;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    const filletInsertMeta = inheritInsertMeta(incoming, outgoing);
    const arcCmd: TransformCmd = {
      command: 'a',
      args: [effectiveRadius, effectiveRadius, 0, 0, sweep, dx, dy],
      start: { ...p1 },
      end: { ...p2 },
      ...(filletInsertMeta !== undefined ? { meta: filletInsertMeta } : {}),
    };

    // inHead and outTail already computed during trim point calculation above

    if (isClosureCorner) {
      result[incomingIdx] = inHead;
      result[outgoingIdx] = outTail;
      result.push(arcCmd);
    } else {
      result.splice(incomingIdx, 2, inHead, arcCmd, outTail);
    }
  }

  if (isClosed) {
    const last = result[result.length - 1];
    const first = result[0];
    result.push({
      command: 'z',
      args: [],
      start: { ...last.end },
      end: { ...first.start },
      ...(zMeta !== undefined ? { meta: zMeta } : {}),
    });
  }

  return { commands: result, warnings };
}

/**
 * Elliptical fillet all corners or specific vertices.
 */
export function ellipticalFilletCommands(
  commands: TransformCmd[],
  rx: number,
  ry: number,
  rotation: number,
  vertexIndices: number[] | null,
): { commands: TransformCmd[]; warnings: string[] } {
  return applyEllipticalFilletOperations(commands, vertexIndices, rx, ry, rotation);
}

function applyEllipticalFilletOperations(
  commands: TransformCmd[],
  vertexIndices: number[] | null,
  rx: number,
  ry: number,
  rotation: number,
): { commands: TransformCmd[]; warnings: string[] } {
  const warnings: string[] = [];

  const resolved = resolveSmooth(commands);

  let isClosed = false;
  let zMeta: PathCommandMeta | undefined;
  const working = [...resolved];
  if (working.length > 0 && working[working.length - 1].command.toUpperCase() === 'Z') {
    const zCmd = working.pop()!;
    zMeta = zCmd.meta;
    isClosed = true;
    const zdx = zCmd.end.x - zCmd.start.x;
    const zdy = zCmd.end.y - zCmd.start.y;
    if (Math.abs(zdx) > 1e-10 || Math.abs(zdy) > 1e-10) {
      working.push({
        command: 'l',
        args: [zdx, zdy],
        start: { ...zCmd.start },
        end: { ...zCmd.end },
      });
    }
  }

  const drawCmds = working.filter((c) => c.command.toUpperCase() !== 'M');
  if (drawCmds.length < 2) return { commands: [...commands], warnings };

  const allCorners = identifyCornerVertices(drawCmds);
  if (isClosed && drawCmds.length >= 2) {
    allCorners.push(drawCmds.length - 1);
  }

  let targetCorners: number[];
  if (vertexIndices !== null) {
    targetCorners = [];
    for (const vi of vertexIndices) {
      if (vi < 0 || vi >= allCorners.length) {
        throw new Error(`ellipticalFillet vertex index ${vi} out of range [0, ${allCorners.length - 1}]`);
      }
      targetCorners.push(allCorners[vi]);
    }
  } else {
    targetCorners = [...allCorners];
  }

  if (targetCorners.length === 0) return { commands: [...commands], warnings };

  const targetSet = new Set(targetCorners);
  const sortedCorners = [...targetSet].sort((a, b) => b - a);

  const result = drawCmds.map((cmd) => ({
    command: cmd.command,
    args: [...cmd.args],
    start: { ...cmd.start },
    end: { ...cmd.end },
    ...(cmd.meta !== undefined ? { meta: cmd.meta } : {}),
  }));

  for (const cornerIdx of sortedCorners) {
    const isClosureCorner = isClosed && cornerIdx === drawCmds.length - 1;
    const incomingIdx = cornerIdx;
    const outgoingIdx = isClosureCorner ? 0 : cornerIdx + 1;

    if (incomingIdx >= result.length || outgoingIdx >= result.length) continue;

    const incoming = result[incomingIdx];
    const outgoing = result[outgoingIdx];

    const inUpper = incoming.command.toUpperCase();
    const outUpper = outgoing.command.toUpperCase();
    const isInLine = inUpper === 'L' || inUpper === 'H' || inUpper === 'V';
    const isOutLine = outUpper === 'L' || outUpper === 'H' || outUpper === 'V';
    if (!isInLine || !isOutLine) {
      warnings.push(`Elliptical fillet skipped at curve junction (index ${cornerIdx})`);
      continue;
    }

    const vertex = incoming.end;

    const inDx = vertex.x - incoming.start.x;
    const inDy = vertex.y - incoming.start.y;
    const inLen = Math.sqrt(inDx * inDx + inDy * inDy);

    const outDx = outgoing.end.x - vertex.x;
    const outDy = outgoing.end.y - vertex.y;
    const outLen = Math.sqrt(outDx * outDx + outDy * outDy);

    if (inLen < 1e-10 || outLen < 1e-10) continue;

    // Compute separate trim distances for each edge so the elliptical arc
    // is tangent to both edges. For a 90° corner this gives trimIn=rx, trimOut=ry
    // (matching CSS border-radius behavior).
    //
    // Algorithm: find the ellipse parameter t where the tangent is parallel to
    // each edge, then solve the 2×2 system that places the ellipse center such
    // that both tangent points lie on the respective edges.
    const upX = -inDx / inLen;  // unit from vertex toward incoming start
    const upY = -inDy / inLen;
    const uqX = outDx / outLen; // unit from vertex toward outgoing end
    const uqY = outDy / outLen;

    const cosRot = Math.cos(rotation);
    const sinRot = Math.sin(rotation);

    // Transform edge directions into ellipse-local frame
    const upLocalX = upX * cosRot + upY * sinRot;
    const upLocalY = -upX * sinRot + upY * cosRot;
    const uqLocalX = uqX * cosRot + uqY * sinRot;
    const uqLocalY = -uqX * sinRot + uqY * cosRot;

    // Tangent parameter where ellipse tangent is parallel to each edge.
    // Ellipse tangent at t: (-rx sin t, ry cos t) in local frame.
    // Parallel to (dx, dy) when: -rx sin(t) * dy = ry cos(t) * dx
    //   => tan(t) = -ry dx / (rx dy)
    // Two solutions per edge (opposite sides); we pick per-edge below.
    const t1a = Math.atan2(-ry * upLocalX, rx * upLocalY);
    const t2a = Math.atan2(-ry * uqLocalX, rx * uqLocalY);

    // Angle bisector (toward the inside of the corner) determines which
    // of the two ±π tangent candidates places the center on the correct side.
    const bisX = upX + uqX;
    const bisY = upY + uqY;
    const bisLen = Math.sqrt(bisX * bisX + bisY * bisY);
    if (bisLen < 1e-10) continue; // edges are anti-parallel

    // Try all 4 combinations of (t1a, t1a+π) × (t2a, t2a+π) and pick
    // the one where both trim distances are positive and center is on the
    // inside (positive dot with bisector).
    let bestTrimIn = -1;
    let bestTrimOut = -1;
    let bestP1 = { x: 0, y: 0 };
    let bestP2 = { x: 0, y: 0 };
    let found = false;

    for (const t1Offset of [0, Math.PI]) {
      for (const t2Offset of [0, Math.PI]) {
        const t1 = t1a + t1Offset;
        const t2 = t2a + t2Offset;

        // Ellipse tangent point offsets (in world frame) from center
        const e1x = rx * Math.cos(t1) * cosRot - ry * Math.sin(t1) * sinRot;
        const e1y = rx * Math.cos(t1) * sinRot + ry * Math.sin(t1) * cosRot;
        const e2x = rx * Math.cos(t2) * cosRot - ry * Math.sin(t2) * sinRot;
        const e2y = rx * Math.cos(t2) * sinRot + ry * Math.sin(t2) * cosRot;

        // Solve: dIn * uP - dOut * uQ = (e1 - e2)
        const rhsX = e1x - e2x;
        const rhsY = e1y - e2y;
        const det = upX * (-uqY) - (-uqX) * upY;
        if (Math.abs(det) < 1e-10) continue;

        const dIn = (-uqY * rhsX + uqX * rhsY) / det;
        const dOut = (-upY * rhsX + upX * rhsY) / det;

        if (dIn < -1e-10 || dOut < -1e-10) continue;

        // Check center is on the inside of the corner
        const cx = dIn * upX - e1x;
        const cy = dIn * upY - e1y;
        const dotBis = cx * bisX + cy * bisY;
        if (dotBis < -1e-10) continue;

        // Pick the solution with smallest total trim (most conservative)
        if (!found || (dIn + dOut < bestTrimIn + bestTrimOut)) {
          bestTrimIn = Math.max(0, dIn);
          bestTrimOut = Math.max(0, dOut);
          bestP1 = { x: vertex.x + upX * bestTrimIn, y: vertex.y + upY * bestTrimIn };
          bestP2 = { x: vertex.x + uqX * bestTrimOut, y: vertex.y + uqY * bestTrimOut };
          found = true;
        }
      }
    }

    if (!found) {
      warnings.push(`Elliptical fillet: no valid placement at vertex ${cornerIdx}`);
      continue;
    }

    let trimIn = bestTrimIn;
    let trimOut = bestTrimOut;
    let p1 = bestP1;
    let p2 = bestP2;

    // Clamp if trim exceeds edge length
    if (trimIn > inLen) {
      trimIn = inLen;
      p1 = { x: vertex.x + upX * trimIn, y: vertex.y + upY * trimIn };
      warnings.push(`Elliptical fillet clamped at vertex ${cornerIdx}`);
    }
    if (trimOut > outLen) {
      trimOut = outLen;
      p2 = { x: vertex.x + uqX * trimOut, y: vertex.y + uqY * trimOut };
      warnings.push(`Elliptical fillet clamped at vertex ${cornerIdx}`);
    }

    const crossIO = inDx * outDy - inDy * outDx;
    const sweep = crossIO > 0 ? 1 : 0;
    const rotDeg = (rotation * 180) / Math.PI;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    const ellipticalInsertMeta = inheritInsertMeta(incoming, outgoing);
    const arcCmd: TransformCmd = {
      command: 'a',
      args: [rx, ry, rotDeg, 0, sweep, dx, dy],
      start: { ...p1 },
      end: { ...p2 },
      ...(ellipticalInsertMeta !== undefined ? { meta: ellipticalInsertMeta } : {}),
    };

    const inTrimT = findTrimFromEndT(incoming, trimIn);
    const [inHead] = splitCommandAtParametricT(incoming, inTrimT);
    if (incoming.meta !== undefined) inHead.meta = incoming.meta;
    inHead.end = { ...p1 };

    const outTrimT = findTrimFromStartT(outgoing, trimOut);
    const [, outTail] = splitCommandAtParametricT(outgoing, outTrimT);
    if (outgoing.meta !== undefined) outTail.meta = outgoing.meta;
    outTail.start = { ...p2 };

    if (isClosureCorner) {
      result[incomingIdx] = inHead;
      result[outgoingIdx] = outTail;
      result.push(arcCmd);
    } else {
      result.splice(incomingIdx, 2, inHead, arcCmd, outTail);
    }
  }

  if (isClosed) {
    const last = result[result.length - 1];
    const first = result[0];
    result.push({
      command: 'z',
      args: [],
      start: { ...last.end },
      end: { ...first.start },
      ...(zMeta !== undefined ? { meta: zMeta } : {}),
    });
  }

  return { commands: result, warnings };
}

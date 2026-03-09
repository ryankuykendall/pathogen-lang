import { formatNum } from './format';
import {
  arcEndpointToCenter,
  arcPointFromCenter,
  calculateCommandLength,
  getParametricTForCommand,
  locateCommandAtFraction,
} from './sampling';

import type { Point } from './context';

/**
 * Minimal command interface — structurally compatible with PathBlockCommand
 */
interface TransformCmd {
  command: string;
  args: number[];
  start: Point;
  end: Point;
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

// ---- resolveSmooth: convert S→C and T→Q ----

export function resolveSmooth(commands: TransformCmd[]): TransformCmd[] {
  const result: TransformCmd[] = [];
  let lastCubicCP: Point | null = null; // last CP2 of C/S
  let lastQuadCP: Point | null = null; // last CP of Q/T

  for (const cmd of commands) {
    const upper = cmd.command.toUpperCase();

    if (upper === 'S') {
      // S x2 y2 dx dy → C cp1x cp1y x2 y2 dx dy
      const [x2, y2, dx, dy] = cmd.args;
      let cp1x: number;
      let cp1y: number;
      if (lastCubicCP) {
        // Reflected point = 2*start - lastCP2 (absolute)
        // Relative to start: (2*start - lastCP2) - start = start - lastCP2
        cp1x = cmd.start.x - lastCubicCP.x;
        cp1y = cmd.start.y - lastCubicCP.y;
      } else {
        cp1x = 0;
        cp1y = 0;
      }
      const newCmd: TransformCmd = {
        command: 'c',
        args: [cp1x, cp1y, x2, y2, dx, dy],
        start: { ...cmd.start },
        end: { ...cmd.end },
      };
      result.push(newCmd);
      // Track the absolute position of CP2
      lastCubicCP = { x: cmd.start.x + x2, y: cmd.start.y + y2 };
      lastQuadCP = null;
    } else if (upper === 'T') {
      // T dx dy → Q cpx cpy dx dy
      const [dx, dy] = cmd.args;
      let cpx: number;
      let cpy: number;
      if (lastQuadCP) {
        cpx = cmd.start.x - lastQuadCP.x;
        cpy = cmd.start.y - lastQuadCP.y;
      } else {
        cpx = 0;
        cpy = 0;
      }
      const newCmd: TransformCmd = {
        command: 'q',
        args: [cpx, cpy, dx, dy],
        start: { ...cmd.start },
        end: { ...cmd.end },
      };
      result.push(newCmd);
      lastQuadCP = { x: cmd.start.x + cpx, y: cmd.start.y + cpy };
      lastCubicCP = null;
    } else {
      result.push({
        command: cmd.command,
        args: [...cmd.args],
        start: { ...cmd.start },
        end: { ...cmd.end },
      });

      // Track control points for C and Q
      if (upper === 'C') {
        const [, , x2, y2] = cmd.args;
        lastCubicCP = { x: cmd.start.x + x2, y: cmd.start.y + y2 };
        lastQuadCP = null;
      } else if (upper === 'Q') {
        const [x1, y1] = cmd.args;
        lastQuadCP = { x: cmd.start.x + x1, y: cmd.start.y + y1 };
        lastCubicCP = null;
      } else {
        lastCubicCP = null;
        lastQuadCP = null;
      }
    }
  }

  return result;
}

// ---- reverse ----

export function reverseCommands(commands: TransformCmd[]): TransformCmd[] {
  if (commands.length === 0) return [];

  // Step 1: resolve S→C, T→Q
  const resolved = resolveSmooth(commands);

  // Step 2: check for closing z
  let wasClosed = false;
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
      });
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

// ---- offset ----

interface OffsetSegment {
  startOffset: Point; // offset applied to start point
  endOffset: Point; // offset applied to end point
  cmd: TransformCmd; // original command
}

function unitNormal(dx: number, dy: number): Point {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-12) return { x: 0, y: -1 }; // default upward
  // Left-hand normal in SVG coords (y-down): (dy, -dx) / len
  // For rightward (1,0) → (0,-1) = upward ✓
  return { x: dy / len, y: -dx / len };
}

export function offsetCommands(commands: TransformCmd[], distance: number): TransformCmd[] {
  if (commands.length === 0 || distance === 0)
    return commands.map((c) => ({
      command: c.command,
      args: [...c.args],
      start: { ...c.start },
      end: { ...c.end },
    }));

  // Step 1: resolve S→C, T→Q
  const resolved = resolveSmooth(commands);

  // Step 2: compute per-segment offsets
  const segments: OffsetSegment[] = [];

  for (const cmd of resolved) {
    const upper = cmd.command.toUpperCase();

    if (upper === 'M') {
      // Move commands don't draw — pass through (offset applied via join logic)
      segments.push({
        startOffset: { x: 0, y: 0 },
        endOffset: { x: 0, y: 0 },
        cmd,
      });
      continue;
    }

    if (upper === 'L' || upper === 'H' || upper === 'V') {
      const dx = cmd.end.x - cmd.start.x;
      const dy = cmd.end.y - cmd.start.y;
      const n = unitNormal(dx, dy);
      const offset = { x: n.x * distance, y: n.y * distance };
      segments.push({
        startOffset: offset,
        endOffset: offset,
        cmd,
      });
    } else if (upper === 'C') {
      const [cx1, cy1, cx2, cy2] = cmd.args;
      const dx = cmd.end.x - cmd.start.x;
      const dy = cmd.end.y - cmd.start.y;
      // Normal at t=0: perpendicular to P1-P0 direction
      let dx0 = cx1;
      let dy0 = cy1;
      if (Math.abs(dx0) < 1e-12 && Math.abs(dy0) < 1e-12) {
        // CP1 coincides with start, use CP2 direction
        dx0 = cx2;
        dy0 = cy2;
        if (Math.abs(dx0) < 1e-12 && Math.abs(dy0) < 1e-12) {
          dx0 = dx;
          dy0 = dy;
        }
      }
      const n0 = unitNormal(dx0, dy0);
      // Normal at t=1: perpendicular to P3-P2 direction
      let dx1 = dx - cx2;
      let dy1 = dy - cy2;
      if (Math.abs(dx1) < 1e-12 && Math.abs(dy1) < 1e-12) {
        dx1 = dx - cx1;
        dy1 = dy - cy1;
        if (Math.abs(dx1) < 1e-12 && Math.abs(dy1) < 1e-12) {
          dx1 = dx;
          dy1 = dy;
        }
      }
      const n1 = unitNormal(dx1, dy1);
      segments.push({
        startOffset: { x: n0.x * distance, y: n0.y * distance },
        endOffset: { x: n1.x * distance, y: n1.y * distance },
        cmd,
      });
    } else if (upper === 'Q') {
      const [qx1, qy1] = cmd.args;
      const dx = cmd.end.x - cmd.start.x;
      const dy = cmd.end.y - cmd.start.y;
      // Normal at t=0: perpendicular to CP-P0
      let dx0 = qx1;
      let dy0 = qy1;
      if (Math.abs(dx0) < 1e-12 && Math.abs(dy0) < 1e-12) {
        dx0 = dx;
        dy0 = dy;
      }
      const n0 = unitNormal(dx0, dy0);
      // Normal at t=1: perpendicular to P2-CP
      let dx1 = dx - qx1;
      let dy1 = dy - qy1;
      if (Math.abs(dx1) < 1e-12 && Math.abs(dy1) < 1e-12) {
        dx1 = dx;
        dy1 = dy;
      }
      const n1 = unitNormal(dx1, dy1);
      segments.push({
        startOffset: { x: n0.x * distance, y: n0.y * distance },
        endOffset: { x: n1.x * distance, y: n1.y * distance },
        cmd,
      });
    } else if (upper === 'A') {
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
        // For arcs, compute offset using tangent-derived normals
        // Arc tangent at start and end can be found from the parametric derivative
        const cosPhi = Math.cos(center.phi);
        const sinPhi = Math.sin(center.phi);

        // Tangent at t=0
        const { startAngle } = center;
        const dex0 = -center.rx * Math.sin(startAngle);
        const dey0 = center.ry * Math.cos(startAngle);
        let tx0 = cosPhi * dex0 - sinPhi * dey0;
        let ty0 = sinPhi * dex0 + cosPhi * dey0;
        if (center.deltaAngle < 0) {
          tx0 = -tx0;
          ty0 = -ty0;
        }
        const n0 = unitNormal(tx0, ty0);

        // Tangent at t=1
        const endAngle = center.startAngle + center.deltaAngle;
        const dex1 = -center.rx * Math.sin(endAngle);
        const dey1 = center.ry * Math.cos(endAngle);
        let tx1 = cosPhi * dex1 - sinPhi * dey1;
        let ty1 = sinPhi * dex1 + cosPhi * dey1;
        if (center.deltaAngle < 0) {
          tx1 = -tx1;
          ty1 = -ty1;
        }
        const n1 = unitNormal(tx1, ty1);

        const startN = { x: n0.x * distance, y: n0.y * distance };
        const endN = { x: n1.x * distance, y: n1.y * distance };

        segments.push({
          startOffset: startN,
          endOffset: endN,
          cmd,
        });
      } else {
        // Degenerate arc → treat as line
        const dx = cmd.end.x - cmd.start.x;
        const dy = cmd.end.y - cmd.start.y;
        const n = unitNormal(dx, dy);
        const offset = { x: n.x * distance, y: n.y * distance };
        segments.push({
          startOffset: offset,
          endOffset: offset,
          cmd,
        });
      }
    } else if (upper === 'Z') {
      const dx = cmd.end.x - cmd.start.x;
      const dy = cmd.end.y - cmd.start.y;
      if (Math.abs(dx) > 1e-10 || Math.abs(dy) > 1e-10) {
        const n = unitNormal(dx, dy);
        const offset = { x: n.x * distance, y: n.y * distance };
        segments.push({ startOffset: offset, endOffset: offset, cmd });
      } else {
        segments.push({ startOffset: { x: 0, y: 0 }, endOffset: { x: 0, y: 0 }, cmd });
      }
    } else {
      // Unknown command: pass through
      segments.push({
        startOffset: { x: 0, y: 0 },
        endOffset: { x: 0, y: 0 },
        cmd,
      });
    }
  }

  // Step 3: Apply offsets with miter joins
  const result: TransformCmd[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const upper = seg.cmd.command.toUpperCase();

    if (upper === 'M') {
      // For M commands, apply the next drawing segment's start offset if available
      let offset = { x: 0, y: 0 };
      if (i + 1 < segments.length) {
        offset = segments[i + 1].startOffset;
      }
      result.push({
        command: seg.cmd.command,
        args: [...seg.cmd.args],
        start: { x: seg.cmd.start.x + offset.x, y: seg.cmd.start.y + offset.y },
        end: { x: seg.cmd.end.x + offset.x, y: seg.cmd.end.y + offset.y },
      });
      continue;
    }

    // Compute the actual start position for this segment
    // Use miter join between previous segment's end offset and this segment's start offset
    let actualStartOffset = seg.startOffset;
    if (i > 0 && segments[i - 1].cmd.command.toUpperCase() !== 'M') {
      const prevEndOffset = segments[i - 1].endOffset;
      actualStartOffset = computeMiterJoin(segments[i - 1].cmd, seg.cmd, prevEndOffset, seg.startOffset, distance);
    }

    const newStart = { x: seg.cmd.start.x + actualStartOffset.x, y: seg.cmd.start.y + actualStartOffset.y };
    const newEnd = { x: seg.cmd.end.x + seg.endOffset.x, y: seg.cmd.end.y + seg.endOffset.y };

    if (upper === 'L') {
      result.push({
        command: 'l',
        args: [newEnd.x - newStart.x, newEnd.y - newStart.y],
        start: newStart,
        end: newEnd,
      });
    } else if (upper === 'H') {
      result.push({
        command: 'l', // Convert to l since offset may introduce y component
        args: [newEnd.x - newStart.x, newEnd.y - newStart.y],
        start: newStart,
        end: newEnd,
      });
    } else if (upper === 'V') {
      result.push({
        command: 'l', // Convert to l since offset may introduce x component
        args: [newEnd.x - newStart.x, newEnd.y - newStart.y],
        start: newStart,
        end: newEnd,
      });
    } else if (upper === 'C') {
      const [cx1, cy1, cx2, cy2] = seg.cmd.args;
      const p2 = { x: seg.cmd.start.x + cx2 + seg.endOffset.x, y: seg.cmd.start.y + cy2 + seg.endOffset.y };
      // Adjust CP1 relative to actual start (considering miter join)
      // CP1 keeps the same offset as the start normal for consistency
      const adjP1 = { x: seg.cmd.start.x + cx1 + actualStartOffset.x, y: seg.cmd.start.y + cy1 + actualStartOffset.y };
      result.push({
        command: 'c',
        args: [
          adjP1.x - newStart.x,
          adjP1.y - newStart.y,
          p2.x - newStart.x,
          p2.y - newStart.y,
          newEnd.x - newStart.x,
          newEnd.y - newStart.y,
        ],
        start: newStart,
        end: newEnd,
      });
    } else if (upper === 'Q') {
      const [qx1, qy1] = seg.cmd.args;
      // Average the start and end offsets for the control point
      const avgOffset = {
        x: (actualStartOffset.x + seg.endOffset.x) / 2,
        y: (actualStartOffset.y + seg.endOffset.y) / 2,
      };
      const cp = { x: seg.cmd.start.x + qx1 + avgOffset.x, y: seg.cmd.start.y + qy1 + avgOffset.y };
      result.push({
        command: 'q',
        args: [cp.x - newStart.x, cp.y - newStart.y, newEnd.x - newStart.x, newEnd.y - newStart.y],
        start: newStart,
        end: newEnd,
      });
    } else if (upper === 'A') {
      const [rx, ry, rotation, largeArcFlag, sweepFlag] = seg.cmd.args;
      const phi = (rotation * Math.PI) / 180;
      const center = arcEndpointToCenter(
        seg.cmd.start.x,
        seg.cmd.start.y,
        rx,
        ry,
        phi,
        largeArcFlag,
        sweepFlag,
        seg.cmd.end.x,
        seg.cmd.end.y,
      );

      if (center) {
        const sign = center.deltaAngle > 0 ? 1 : -1;
        const newRx = Math.max(0.001, center.rx + sign * distance);
        const newRy = Math.max(0.001, center.ry + sign * distance);
        result.push({
          command: 'a',
          args: [newRx, newRy, rotation, largeArcFlag, sweepFlag, newEnd.x - newStart.x, newEnd.y - newStart.y],
          start: newStart,
          end: newEnd,
        });
      } else {
        // Degenerate: treat as line
        result.push({
          command: 'l',
          args: [newEnd.x - newStart.x, newEnd.y - newStart.y],
          start: newStart,
          end: newEnd,
        });
      }
    } else if (upper === 'Z') {
      result.push({
        command: 'z',
        args: [],
        start: newStart,
        end: newEnd,
      });
    } else {
      result.push({
        command: seg.cmd.command,
        args: [...seg.cmd.args],
        start: newStart,
        end: newEnd,
      });
    }
  }

  return result;
}

/**
 * Compute miter join offset at the junction between two segments.
 * Returns the offset to apply at the shared vertex.
 */
function computeMiterJoin(
  prevCmd: TransformCmd,
  nextCmd: TransformCmd,
  prevEndOffset: Point,
  nextStartOffset: Point,
  distance: number,
): Point {
  // Get tangent directions at the junction
  const prevDir = getEndTangent(prevCmd);
  const nextDir = getStartTangent(nextCmd);

  // If tangents are roughly parallel, just average
  const cross = prevDir.x * nextDir.y - prevDir.y * nextDir.x;
  if (Math.abs(cross) < 1e-10) {
    return {
      x: (prevEndOffset.x + nextStartOffset.x) / 2,
      y: (prevEndOffset.y + nextStartOffset.y) / 2,
    };
  }

  // Compute intersection of the two offset lines
  // Line 1: prevEnd + prevEndOffset + t * prevDir
  // Line 2: nextStart + nextStartOffset + s * nextDir
  // They share the same original point, so:
  // prevEndOffset + t * prevDir = nextStartOffset + s * nextDir
  const dx = nextStartOffset.x - prevEndOffset.x;
  const dy = nextStartOffset.y - prevEndOffset.y;
  const t = (dx * nextDir.y - dy * nextDir.x) / cross;

  const miterX = prevEndOffset.x + t * prevDir.x;
  const miterY = prevEndOffset.y + t * prevDir.y;

  // Miter limit check
  const miterLen = Math.sqrt(miterX * miterX + miterY * miterY);
  if (miterLen > 4 * Math.abs(distance)) {
    return {
      x: (prevEndOffset.x + nextStartOffset.x) / 2,
      y: (prevEndOffset.y + nextStartOffset.y) / 2,
    };
  }

  return { x: miterX, y: miterY };
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
    }));
  }
  if (rightCmds.length === 0) {
    return leftCmds.map((cmd) => ({
      command: cmd.command,
      args: [...cmd.args],
      start: { ...cmd.start },
      end: { ...cmd.end },
    }));
  }

  // Deep-copy left commands (unchanged)
  const result: TransformCmd[] = leftCmds.map((cmd) => ({
    command: cmd.command,
    args: [...cmd.args],
    start: { ...cmd.start },
    end: { ...cmd.end },
  }));

  // Deep-copy right commands, offset start/end by leftEndPoint
  for (const cmd of rightCmds) {
    result.push({
      command: cmd.command,
      args: [...cmd.args],
      start: { x: cmd.start.x + leftEndPoint.x, y: cmd.start.y + leftEndPoint.y },
      end: { x: cmd.end.x + leftEndPoint.x, y: cmd.end.y + leftEndPoint.y },
    });
  }

  return result;
}

export function rotateAtVertexCommands(commands: TransformCmd[], vertexIndex: number, angle: number): TransformCmd[] {
  const vertices = extractVerticesFromCommands(commands);

  if (vertexIndex < 0 || vertexIndex >= vertices.length) {
    throw new Error(`rotateAtVertexIndex() vertex index ${vertexIndex} out of range [0, ${vertices.length - 1}]`);
  }

  const center = vertices[vertexIndex];
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

    return [middle];
  }

  // Different commands: tail of start + full middle commands + head of end
  const result: TransformCmd[] = [];

  // Tail of start command
  if (startParamT < 1) {
    const [, startTail] = splitCommandAtParametricT(drawCmds[startLoc.cmdIndex], startParamT);
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
    });
  }

  // Head of end command
  if (endParamT > 0) {
    const [endHead] = splitCommandAtParametricT(drawCmds[endLoc.cmdIndex], endParamT);
    const edx = endHead.end.x - endHead.start.x;
    const edy = endHead.end.y - endHead.start.y;
    const hasLength = endHead.args.length > 0 || Math.abs(edx) > 1e-10 || Math.abs(edy) > 1e-10;
    if (hasLength) result.push(endHead);
  }

  return result;
}

// Path context tracking for pathogen-lang
// Tracks current position, subpath start, and command history during evaluation

import { arcEndpointToCenter, arcTangentFromCenter } from './sampling';

/**
 * A point in 2D coordinate space
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Record of a single path command with its start and end positions
 */
export interface CommandHistoryEntry {
  command: string; // M, L, h, v, etc. (case-preserved)
  args: number[]; // Evaluated arguments
  start: Point; // Position before command
  end: Point; // Position after command
}

/**
 * Path context state tracking current position, subpath start, and command history
 */
export interface PathContext {
  position: Point; // Current pen position
  start: Point; // Subpath start (set by M, used by Z)
  commands: CommandHistoryEntry[];
  lastTangent?: number; // Tangent angle from last drawing command (radians)
  _lastQuadCP?: Point; // Previous quadratic control point (for T command tangent reflection)
  trackHistory: boolean; // Whether to store command history (performance optimization)
  _dirty: boolean; // Whether context has changed since last object conversion
  _cachedObject: Record<string, unknown> | null; // Cached object representation
}

/**
 * Options for creating a PathContext
 */
export interface PathContextOptions {
  trackHistory?: boolean; // Whether to track command history (default: false for performance)
}

/**
 * Create a new PathContext initialized at origin (0, 0)
 */
export function createPathContext(options: PathContextOptions = {}): PathContext {
  return {
    position: { x: 0, y: 0 },
    start: { x: 0, y: 0 },
    commands: [],
    trackHistory: options.trackHistory ?? false,
    _dirty: true,
    _cachedObject: null,
  };
}

/**
 * Deep copy a Point
 */
function copyPoint(p: Point): Point {
  return { x: p.x, y: p.y };
}

/**
 * Update the path context for a command and return the new position
 *
 * @param ctx - The path context to update (mutated in place)
 * @param command - The SVG path command letter (M, L, h, v, etc.)
 * @param args - The evaluated numeric arguments for the command
 */
export function updateContextForCommand(ctx: PathContext, command: string, args: number[]): void {
  const startPos = copyPoint(ctx.position);
  let endPos: Point;

  // Determine if command is relative (lowercase)
  const isRelative = command === command.toLowerCase();
  const cmd = command.toUpperCase();

  switch (cmd) {
    case 'M': {
      // MoveTo: sets new position and new subpath start
      const [x, y] = args;
      if (isRelative) {
        endPos = { x: ctx.position.x + x, y: ctx.position.y + y };
      } else {
        endPos = { x, y };
      }
      // M also sets the subpath start
      ctx.start = copyPoint(endPos);
      break;
    }

    case 'L': {
      // LineTo: draws line to new position
      const [x, y] = args;
      if (isRelative) {
        endPos = { x: ctx.position.x + x, y: ctx.position.y + y };
      } else {
        endPos = { x, y };
      }
      break;
    }

    case 'H': {
      // Horizontal line: only x changes
      const [x] = args;
      if (isRelative) {
        endPos = { x: ctx.position.x + x, y: ctx.position.y };
      } else {
        endPos = { x, y: ctx.position.y };
      }
      break;
    }

    case 'V': {
      // Vertical line: only y changes
      const [y] = args;
      if (isRelative) {
        endPos = { x: ctx.position.x, y: ctx.position.y + y };
      } else {
        endPos = { x: ctx.position.x, y };
      }
      break;
    }

    case 'C': {
      // Cubic bezier: C x1 y1 x2 y2 x y
      // End point is the last pair (x, y)
      const x = args[4];
      const y = args[5];
      if (isRelative) {
        endPos = { x: ctx.position.x + x, y: ctx.position.y + y };
      } else {
        endPos = { x, y };
      }
      break;
    }

    case 'S': {
      // Smooth cubic: S x2 y2 x y
      // End point is the last pair (x, y)
      const x = args[2];
      const y = args[3];
      if (isRelative) {
        endPos = { x: ctx.position.x + x, y: ctx.position.y + y };
      } else {
        endPos = { x, y };
      }
      break;
    }

    case 'Q': {
      // Quadratic bezier: Q x1 y1 x y
      // End point is the last pair (x, y)
      const x = args[2];
      const y = args[3];
      if (isRelative) {
        endPos = { x: ctx.position.x + x, y: ctx.position.y + y };
      } else {
        endPos = { x, y };
      }
      break;
    }

    case 'T': {
      // Smooth quadratic: T x y
      const [x, y] = args;
      if (isRelative) {
        endPos = { x: ctx.position.x + x, y: ctx.position.y + y };
      } else {
        endPos = { x, y };
      }
      break;
    }

    case 'A': {
      // Arc: A rx ry rotation large-arc sweep x y
      // End point is the last pair (x, y)
      const x = args[5];
      const y = args[6];
      if (isRelative) {
        endPos = { x: ctx.position.x + x, y: ctx.position.y + y };
      } else {
        endPos = { x, y };
      }
      break;
    }

    case 'Z': {
      // Close path: returns to subpath start
      endPos = copyPoint(ctx.start);
      break;
    }

    default:
      // Unknown command - don't change position
      endPos = copyPoint(ctx.position);
  }

  // Compute tangent direction for the command
  let clearQuadCP = true;
  switch (cmd) {
    case 'M':
      // Move clears tangent — no direction established
      ctx.lastTangent = undefined;
      break;

    case 'L': {
      const dx = endPos.x - startPos.x;
      const dy = endPos.y - startPos.y;
      if (dx !== 0 || dy !== 0) {
        ctx.lastTangent = Math.atan2(dy, dx);
      }
      // Zero-length: preserve previous tangent
      break;
    }

    case 'H': {
      const dx = endPos.x - startPos.x;
      if (dx !== 0) {
        ctx.lastTangent = dx > 0 ? 0 : Math.PI;
      }
      break;
    }

    case 'V': {
      const dy = endPos.y - startPos.y;
      if (dy !== 0) {
        ctx.lastTangent = dy > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      break;
    }

    case 'C': {
      // Cubic bezier: C x1 y1 x2 y2 x y — tangent from CP2 to endpoint
      const cp2x = isRelative ? startPos.x + args[2] : args[2];
      const cp2y = isRelative ? startPos.y + args[3] : args[3];
      let dx = endPos.x - cp2x;
      let dy = endPos.y - cp2y;
      if (dx === 0 && dy === 0) {
        // CP2 coincides with endpoint, fall back to CP1→endpoint
        const cp1x = isRelative ? startPos.x + args[0] : args[0];
        const cp1y = isRelative ? startPos.y + args[1] : args[1];
        dx = endPos.x - cp1x;
        dy = endPos.y - cp1y;
      }
      if (dx !== 0 || dy !== 0) {
        ctx.lastTangent = Math.atan2(dy, dx);
      }
      break;
    }

    case 'S': {
      // Smooth cubic: S x2 y2 x y — tangent from CP2 to endpoint
      const cp2x = isRelative ? startPos.x + args[0] : args[0];
      const cp2y = isRelative ? startPos.y + args[1] : args[1];
      const dx = endPos.x - cp2x;
      const dy = endPos.y - cp2y;
      if (dx !== 0 || dy !== 0) {
        ctx.lastTangent = Math.atan2(dy, dx);
      }
      break;
    }

    case 'Q': {
      // Quadratic bezier: Q x1 y1 x y — tangent from CP to endpoint
      const cpx = isRelative ? startPos.x + args[0] : args[0];
      const cpy = isRelative ? startPos.y + args[1] : args[1];
      const dx = endPos.x - cpx;
      const dy = endPos.y - cpy;
      if (dx !== 0 || dy !== 0) {
        ctx.lastTangent = Math.atan2(dy, dx);
      }
      // Store quad CP for T command reflection
      ctx._lastQuadCP = { x: cpx, y: cpy };
      clearQuadCP = false;
      break;
    }

    case 'T': {
      // Smooth quadratic: T x y — reflected CP from previous Q/T
      const reflectedCP = ctx._lastQuadCP
        ? { x: 2 * startPos.x - ctx._lastQuadCP.x, y: 2 * startPos.y - ctx._lastQuadCP.y }
        : { x: startPos.x, y: startPos.y };
      const dx = endPos.x - reflectedCP.x;
      const dy = endPos.y - reflectedCP.y;
      if (dx !== 0 || dy !== 0) {
        ctx.lastTangent = Math.atan2(dy, dx);
      }
      // Update _lastQuadCP to the reflected CP for subsequent T commands
      ctx._lastQuadCP = reflectedCP;
      clearQuadCP = false;
      break;
    }

    case 'A': {
      // Arc: A rx ry rotation large-arc sweep x y
      const rx = args[0];
      const ry = args[1];
      const rotation = (args[2] * Math.PI) / 180;
      const largeArcFlag = args[3];
      const sweepFlag = args[4];
      const center = arcEndpointToCenter(
        startPos.x,
        startPos.y,
        rx,
        ry,
        rotation,
        largeArcFlag,
        sweepFlag,
        endPos.x,
        endPos.y,
      );
      if (center) {
        ctx.lastTangent = arcTangentFromCenter(center, 1);
      }
      // Degenerate arc: preserve previous tangent
      break;
    }

    case 'Z': {
      const dx = endPos.x - startPos.x;
      const dy = endPos.y - startPos.y;
      if (dx !== 0 || dy !== 0) {
        ctx.lastTangent = Math.atan2(dy, dx);
      }
      // Already at start: preserve previous tangent
      break;
    }
  }

  // Clear quad CP for non-Q/T commands
  if (clearQuadCP) {
    ctx._lastQuadCP = undefined;
  }

  // Record the command in history only if tracking is enabled
  if (ctx.trackHistory) {
    ctx.commands.push({
      command,
      args: [...args],
      start: startPos,
      end: copyPoint(endPos),
    });
  }

  // Update current position
  ctx.position = endPos;

  // Mark context as dirty (needs re-conversion if accessed)
  ctx._dirty = true;
  ctx._cachedObject = null;
}

/**
 * Set the lastTangent value and mark context as dirty
 */
export function setLastTangent(ctx: PathContext, angle: number): void {
  ctx.lastTangent = angle;
  ctx._dirty = true;
  ctx._cachedObject = null;
}

/**
 * Create a plain object representation of the context for use in scope
 * This is what users will access via ctx.position.x, etc.
 * Uses lazy conversion with caching to avoid O(n^2) behavior.
 */
export function contextToObject(ctx: PathContext, transformState?: TransformState): Record<string, unknown> {
  // Return cached object if context hasn't changed
  if (!ctx._dirty && ctx._cachedObject) {
    // Always update transform state reference (it's mutable)
    if (transformState) {
      ctx._cachedObject._transformState = transformState;
    }
    return ctx._cachedObject;
  }

  const obj: Record<string, unknown> = {
    position: { x: ctx.position.x, y: ctx.position.y },
    start: { x: ctx.start.x, y: ctx.start.y },
    // Only include commands if history tracking is enabled
    commands: ctx.trackHistory
      ? ctx.commands.map((cmd) => ({
          command: cmd.command,
          args: [...cmd.args],
          start: { x: cmd.start.x, y: cmd.start.y },
          end: { x: cmd.end.x, y: cmd.end.y },
        }))
      : [],
  };
  // Include heading (user-facing name for lastTangent) if defined
  if (ctx.lastTangent !== undefined) {
    obj.heading = ctx.lastTangent;
  }

  // Attach transform state (accessed via .transform in evaluator)
  if (transformState) {
    obj._transformState = transformState;
  }

  // Cache the result
  ctx._cachedObject = obj;
  ctx._dirty = false;

  return obj;
}

// --- Transform types ---

export interface TransformState {
  translate: { x: number; y: number } | null;
  rotate: { angle: number; cx?: number; cy?: number } | null;
  scale: { x: number; y: number; cx?: number; cy?: number } | null;
}

export function createTransformState(): TransformState {
  return { translate: null, rotate: null, scale: null };
}

export function transformStateToSvg(t: TransformState): string | null {
  const parts: string[] = [];
  if (t.translate) parts.push(`translate(${t.translate.x}, ${t.translate.y})`);
  if (t.rotate) {
    const deg = (t.rotate.angle * 180) / Math.PI;
    if (t.rotate.cx != null && t.rotate.cy != null) {
      parts.push(`rotate(${deg}, ${t.rotate.cx}, ${t.rotate.cy})`);
    } else {
      parts.push(`rotate(${deg})`);
    }
  }
  if (t.scale) {
    if (t.scale.cx != null && t.scale.cy != null) {
      parts.push(`translate(${t.scale.cx}, ${t.scale.cy})`);
      parts.push(`scale(${t.scale.x}, ${t.scale.y})`);
      parts.push(`translate(${-t.scale.cx}, ${-t.scale.cy})`);
    } else {
      parts.push(`scale(${t.scale.x}, ${t.scale.y})`);
    }
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

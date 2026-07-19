/**
 * Resolution-aware path decimation.
 *
 * Removes path commands whose full spatial extent is smaller than `epsilon`
 * (in SVG user units) — for print export, epsilon is derived from one printed
 * dot at the chosen physical size, so every removed segment is by construction
 * below what the printer can reproduce. Dense generative artwork routinely
 * packs dozens of segments inside a single dot; culling them collapses the
 * operator count PDF viewers and print RIPs choke on.
 *
 * Guarantees:
 * - `M` and `Z` always survive; runs never merge across them.
 * - Visual deviation is bounded by epsilon: sub-epsilon runs accumulate and a
 *   synthetic `L` is emitted whenever the run's net displacement reaches
 *   epsilon; a run dropped at a boundary has net displacement < epsilon and
 *   the next command's absolute coordinates re-anchor the pen (SVG draws the
 *   implicit connection, which is what heals the gap).
 * - Output is absolute (see path-precision.ts for why that matters).
 *
 * Known approximations (all bounded by the sub-dot epsilon in practice):
 * - `T`'s reflected control point is not included in its extent metric.
 * - Dropping a tiny curve before an `S`/`T` shifts the reflection base by at
 *   most ~2·epsilon.
 */
import type { PathBlockCommand } from './types';
import { commandsToAbsoluteD, parsePathDataExpanded } from './path-data';

export interface DecimateResult {
  d: string;
  /** Drawing commands removed (input drawing commands − surviving). */
  removed: number;
  /** Drawing commands in the output (synthetic replacement lines included). */
  kept: number;
}

const isDrawingCommand = (command: string): boolean => {
  const upper = command.toUpperCase();
  return upper !== 'M' && upper !== 'Z';
};

/** Conservative spatial extent of a single-group command. */
function commandExtent(cmd: PathBlockCommand): number {
  const { start, end, args } = cmd;
  const chord = Math.hypot(end.x - start.x, end.y - start.y);
  const upper = cmd.command.toUpperCase();
  const isRelative = cmd.command !== upper;

  if (upper === 'C' || upper === 'S' || upper === 'Q') {
    // Bbox diagonal over start, end, and absolutized control points — catches
    // large-sweep curves whose endpoints nearly coincide. ('S' is defensive:
    // parsePathDataExpanded normalizes S→C, so it never reaches here from the
    // d-string entry point.)
    const controlCount = upper === 'C' ? 2 : 1;
    let minX = Math.min(start.x, end.x);
    let maxX = Math.max(start.x, end.x);
    let minY = Math.min(start.y, end.y);
    let maxY = Math.max(start.y, end.y);
    for (let i = 0; i < controlCount; i++) {
      const cx = isRelative ? start.x + args[i * 2] : args[i * 2];
      const cy = isRelative ? start.y + args[i * 2 + 1] : args[i * 2 + 1];
      minX = Math.min(minX, cx);
      maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy);
      maxY = Math.max(maxY, cy);
    }
    return Math.hypot(maxX - minX, maxY - minY);
  }

  if (upper === 'A') {
    // A near-closed large arc has a tiny chord but a big sweep — radii bound it.
    return Math.max(chord, Math.abs(args[0] ?? 0), Math.abs(args[1] ?? 0));
  }

  return chord;
}

/**
 * Remove drawing commands whose extent is below `epsilon` (SVG user units),
 * emitting absolute path data. `epsilon <= 0` (or non-finite) is a
 * passthrough: absolutized output, nothing removed.
 */
export function decimatePathData(d: string, epsilon: number): DecimateResult {
  const commands = parsePathDataExpanded(d);
  const inputDrawing = commands.filter((c) => isDrawingCommand(c.command)).length;

  if (!Number.isFinite(epsilon) || epsilon <= 0) {
    return { d: commandsToAbsoluteD(commands), removed: 0, kept: inputDrawing };
  }

  const out: PathBlockCommand[] = [];
  let runStart: { x: number; y: number } | null = null;

  for (const cmd of commands) {
    if (!isDrawingCommand(cmd.command)) {
      runStart = null; // pending run's net displacement < epsilon — drop it
      out.push(cmd);
      continue;
    }

    if (commandExtent(cmd) >= epsilon) {
      runStart = null;
      out.push(cmd);
      continue;
    }

    // Sub-epsilon command: accumulate; emit a synthetic line whenever the
    // run's net displacement reaches epsilon so long gentle chains (many tiny
    // steps, large total travel) are preserved to within epsilon.
    if (runStart === null) runStart = cmd.start;
    if (Math.hypot(cmd.end.x - runStart.x, cmd.end.y - runStart.y) >= epsilon) {
      out.push({
        command: 'L',
        args: [cmd.end.x, cmd.end.y],
        start: { x: runStart.x, y: runStart.y },
        end: { x: cmd.end.x, y: cmd.end.y },
      });
      runStart = null;
    }
  }

  const kept = out.filter((c) => isDrawingCommand(c.command)).length;
  return { d: commandsToAbsoluteD(out), removed: inputDrawing - kept, kept };
}

/**
 * The `ignored-move` warning (docs/debug.md "A move a shape ignores").
 *
 * The shape functions — circle(), rect(), roundRect(), polygon(), star(),
 * line(), quadratic(), cubic() — moveTo() and the grid functions start a new
 * subpath at the coordinates in their own arguments, with an absolute `M`
 * (docs/stdlib.md "Path Functions" has the table). A move right
 * before one has no effect: `M 85 52 roundRect(0, 0, 320, 220, 14);` draws
 * the rectangle at (0, 0). The output is left as it is; the warning says why.
 *
 * `M 85 52 roundRect(…)` on one line is two statements (a call is never a
 * move's argument; only a method call like `tile.draw()` can be), so the move
 * is always the last command this layer recorded before the call.
 *
 * Pure: the evaluator decides that the call is a plain stdlib function (not
 * a user fn, not a context-aware function) and hands over what it emitted.
 */
import { formatNum } from './format';

import type { PathBlockCommand, PathStore } from './types';
import type { SourceLocation } from '../parser/ast';

export interface IgnoredMove {
  message: string;
  loc?: SourceLocation;
}

/**
 * @param fnName the stdlib function the call statement (`name(…);`) calls
 * @param commands what the call emitted
 * @param store the layer's path store, before the call is recorded
 * @param callLoc where the call is, for the warning's position
 */
export function describeIgnoredMove(
  fnName: string,
  commands: readonly PathBlockCommand[],
  store: PathStore,
  callLoc: SourceLocation | undefined,
): IgnoredMove | null {
  const prev = store.records[store.records.length - 1];
  const move = prev?.commands[prev.commands.length - 1];
  const shapeStart = commands[0];
  // A pure move: `M x y` or `m dx dy`. Extra pairs (`M 10 10 20 20`) are
  // implicit lines, so that move was used. And only an ABSOLUTE M discards
  // it: a relative `m` (radialWedge, the splines) starts from where it left the pen.
  if (!move || !shapeStart) return null;
  if ((move.command !== 'M' && move.command !== 'm') || move.args.length !== 2) return null;
  if (shapeStart.command !== 'M') return null;
  const at = `(${formatNum(move.end.x)}, ${formatNum(move.end.y)})`;
  const moveLine = prev.loc?.line;
  const where = moveLine !== undefined && moveLine !== callLoc?.line ? `on line ${moveLine}` : 'before it';
  return {
    message: `${fnName}() draws at the coordinates in its own arguments, so the move to ${at} ${where} has no effect — put the position in its arguments instead`,
    loc: callLoc,
  };
}

/**
 * path-emit-guard — a path-emitting function must never write a non-number
 * into `d`.
 *
 * docs/syntax.md (Null) promises that using `null` "as a path argument throws a
 * descriptive error". Raw path commands always honoured that; stdlib shape
 * functions and context-aware functions did not — `circle(x, y, null)` compiled
 * cleanly to `a null null …` (and, tracked inside a `@{ }` block, to
 * `a undefined undefined … NaN NaN`), which browsers reject with "Expected
 * number" while the compiler reports success. This module is the single home of
 * the rule; both call chokepoints in the evaluator consult it.
 *
 * Messages are returned bare — the caller attaches the call-site position, the
 * same way it already does for errors thrown by stdlib functions themselves.
 */

import { pathFunctions } from '../stdlib/path';

import type { Expression } from '../parser/ast';

/**
 * Identity set derived from the stdlib export, so a shape function added to
 * `pathFunctions` is guarded on arrival. Identity (not name) because a user
 * binding may shadow a stdlib name.
 */
const PATH_EMITTING_FNS: ReadonlySet<unknown> = new Set(Object.values(pathFunctions));

export function isPathEmittingStdlib(fn: unknown): boolean {
  return PATH_EMITTING_FNS.has(fn);
}

/**
 * Too few arguments: the missing parameters are `undefined` inside the function
 * and surface as NaN (`circle(10)` → `M NaN undefined a undefined …`). `length`
 * counts only the leading required parameters, so optional and rest parameters
 * never trip this.
 */
export function describeMissingPathArgs(name: string, fn: unknown, argCount: number): string | null {
  const required = typeof fn === 'function' ? fn.length : 0;
  if (argCount >= required) return null;
  return `${name}() expects ${required} arguments, got ${argCount}`;
}

function describeValue(v: unknown): string | null {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' && !Number.isFinite(v)) return String(v);
  return null;
}

/**
 * First argument that cannot become a coordinate: `null`, or a non-finite
 * number. Names the variable when the argument is a plain identifier — that is
 * the binding the user has to chase (typically a destructured or
 * `.first`/`.last` value from an array shorter than expected).
 */
export function describeBadPathArg(name: string, argExprs: Expression[], args: unknown[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const bad = describeValue(args[i]);
    if (bad === null) continue;
    const expr = argExprs[i];
    const label = expr?.type === 'Identifier' ? ` (\`${expr.name}\`)` : '';
    const need = bad === 'null' ? 'a number' : 'a finite number';
    return `${name}(): argument ${i + 1}${label} is ${bad} — path functions need ${need} here`;
  }
  return null;
}

const NON_FINITE_TOKEN = /(?:^|[\s,])(-?NaN|-?Infinity|null|undefined)(?=$|[\s,])/;

const received = (n: number): string => ` (it received ${n} argument${n === 1 ? '' : 's'})`;

/**
 * Backstop on what was actually emitted: catches a non-number that reached the
 * path data by a route the argument check cannot see (a NaN nested inside a
 * structured argument, a NaN computed inside the function).
 *
 * For the context-aware functions this is the ARITY check too. They are cases
 * of one switch, not function objects, so there is no `fn.length` to compare
 * against, and the declared signatures do not mark optional parameters — a
 * hand-kept arity table would drift. A missing argument is `undefined` inside
 * the case and always surfaces as NaN, so checking the emission catches it
 * without a table; `receivedArgs` puts the count in the message, which is
 * usually all the hint a missing argument needs. Checking after dispatch is
 * safe even though these functions move the pen first: the language has no
 * try/catch, so a throw always ends the compile.
 */
export function describeNonFiniteEmit(name: string, emitted: string, receivedArgs?: number): string | null {
  const m = NON_FINITE_TOKEN.exec(emitted);
  if (!m) return null;
  const count = receivedArgs === undefined ? '' : received(receivedArgs);
  return `${name}() produced a non-numeric coordinate (${m[1]}) — check its arguments${count}`;
}

/**
 * What a context-aware function produced, checked by SHAPE rather than by name
 * so there is no per-function list to keep in step:
 *   - `PathSegment.value` / `PathWithResult.path` — emitted path text;
 *   - `ContextObject.value` — coordinates handed back to the program
 *     (`polarPoint` → `{x, y}`), which would otherwise reach `d` one statement
 *     later as `L NaN NaN`;
 *   - the heading itself — `turn()` and `heading()` emit nothing, so a missing
 *     argument there poisons the pen's direction instead of the path.
 */
export function describeNonFiniteContextResult(
  name: string,
  result: unknown,
  receivedArgs: number,
  headingAfter: number | undefined,
): string | null {
  if (typeof result === 'object' && result !== null) {
    const r = result as { type?: string; value?: unknown; path?: unknown };
    const emitted = r.type === 'PathSegment' ? r.value : r.type === 'PathWithResult' ? r.path : undefined;
    if (typeof emitted === 'string') {
      const bad = describeNonFiniteEmit(name, emitted, receivedArgs);
      if (bad) return bad;
    }
    if (r.type === 'ContextObject' && typeof r.value === 'object' && r.value !== null) {
      for (const [key, v] of Object.entries(r.value)) {
        if (typeof v === 'number' && !Number.isFinite(v)) {
          return `${name}() produced a non-numeric ${key} (${v}) — check its arguments${received(receivedArgs)}`;
        }
      }
    }
  }
  if (headingAfter !== undefined && !Number.isFinite(headingAfter)) {
    return `${name}() left the heading as ${headingAfter} — check its arguments${received(receivedArgs)}`;
  }
  return null;
}

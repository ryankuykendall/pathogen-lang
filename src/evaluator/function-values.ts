/**
 * Function values where a number is expected (docs/stdlib.md "Constants",
 * docs/debug.md "Output Format").
 *
 * A standard-library function named without its parentheses — `PI`, `sin` —
 * is a value: `let f = sin; f(0.5)` works. It is not a number, though, and the
 * places that needed one used to leak its JavaScript: `log(PI)` printed
 * `()=>Math.PI`, `-PI` said only "requires numeric operand", `sin(PI)`
 * returned NaN. These helpers give every such site one wording: name the
 * function and show the call. User fns and lambdas get the same wording.
 */
import { stdlib } from '../stdlib';

import type { UserFunction, Value } from './types';
import type { Expression } from '../parser/ast';

type StdlibFunction = (...args: never[]) => unknown;

/** The constants with an angle spelling, the `pi` suffix: π is `1pi` and τ is `2pi` (docs/syntax.md "Angle Units"). */
const ANGLE_SPELLING: Readonly<Record<string, string>> = { PI: '1pi', TAU: '2pi' };

// The first stdlib name bound to each function (an alias, should one appear, doesn't rename it).
const NAME_BY_FUNCTION = new Map<unknown, string>();
for (const [name, fn] of Object.entries(stdlib)) if (!NAME_BY_FUNCTION.has(fn)) NAME_BY_FUNCTION.set(fn, name);

export function isStdlibFunctionValue(v: Value): v is Value & StdlibFunction {
  return typeof v === 'function';
}

function isUserFunctionValue(v: Value): v is UserFunction {
  return typeof v === 'object' && v !== null && 'type' in v && v.type === 'UserFunction';
}

/** The stdlib name a function value is bound to (`PI`, `sin`). */
function stdlibFunctionName(fn: StdlibFunction): string {
  return NAME_BY_FUNCTION.get(fn) ?? (fn.name || 'function');
}

/** How `log()` and templates show a stdlib function value: `StdlibFunction(PI)`. */
export function formatStdlibFunction(fn: StdlibFunction): string {
  return `StdlibFunction(${stdlibFunctionName(fn)})`;
}

/**
 * Whether the function is called with no arguments (`PI()` rather than
 * `sin(…)` in the hint). A stdlib function's `length` counts its plain
 * parameters, but a rest parameter (`(...args)`: the splines and grids) and a
 * defaulted one also read 0 — so a zero length only means "no arguments"
 * when the parameter list itself is empty. Only the list is read, never the
 * body. Native functions (`Math.sin`) report their arity in `length`.
 */
function takesNoArguments(value: Value): boolean {
  if (isUserFunctionValue(value)) return value.params.length === 0;
  if (!isStdlibFunctionValue(value) || value.length !== 0) return false;
  const source = Function.prototype.toString.call(value);
  const open = source.indexOf('(');
  const arrow = source.indexOf('=>');
  // `x => …`: one unparenthesized parameter.
  if (arrow >= 0 && (open < 0 || arrow < open)) return false;
  return open >= 0 && source.slice(open + 1, source.indexOf(')', open)).trim() === '';
}

/** The named subject (`` `PI` ``) and the fix (`` call it: `PI()` ``) for one function value. */
function describe(value: Value, expr: Expression | undefined): { subject: string | null; fix: string } {
  const name = expr?.type === 'Identifier' ? expr.name : null;
  if (!name) return { subject: null, fix: 'call it with ( )' };
  const call = `\`${name}${takesNoArguments(value) ? '()' : '(…)'}\``;
  // Only for the constant written by its own name: `let f = PI; -f` gets the plain hint.
  const angle = isStdlibFunctionValue(value) && stdlibFunctionName(value) === name ? ANGLE_SPELLING[name] : undefined;
  return { subject: `\`${name}\``, fix: `call it: ${call}${angle ? ` (or, for an angle, write \`${angle}\`)` : ''}` };
}

/**
 * The error text for a function value used as a number (an operator's
 * operand), or undefined when the value is not a function, so the caller
 * keeps its own message.
 */
export function describeFunctionAsNumber(value: Value, expr: Expression | undefined): string | undefined {
  if (!isStdlibFunctionValue(value) && !isUserFunctionValue(value)) return undefined;
  const { subject, fix } = describe(value, expr);
  return subject ? `${subject} is a function, not a number — ${fix}` : `a function is not a number — ${fix}`;
}

/**
 * The error text for a function value handed to a standard-library function
 * (which takes numbers, points and arrays, never a function), or undefined
 * when no argument is one.
 */
export function describeFunctionArgument(
  fnName: string,
  argExprs: readonly Expression[],
  args: readonly Value[],
): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const value = args[i];
    if (!isStdlibFunctionValue(value) && !isUserFunctionValue(value)) continue;
    const { subject, fix } = describe(value, argExprs[i]);
    return `${fnName}(): argument ${i + 1}${subject ? ` (${subject})` : ''} is a function, not a number — ${fix}`;
  }
  return undefined;
}

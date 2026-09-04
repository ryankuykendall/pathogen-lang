// `switch` clause matching. The evaluator supplies a MatchHost that closes
// over its expression evaluation, destructuring binder, and error
// formatting; everything about which clause matches lives here exactly once.

import type {
  ArrayDestructuringPattern,
  CasePattern,
  Expression,
  ObjectDestructuringPattern,
  Statement,
  SwitchExpression,
  SwitchStatement,
} from '../parser/ast';
import { getStructDescriptor } from './struct-properties';
import { isTruthy, toNumber, valuesEqual } from './value-semantics';

import type { ArrayValue, ObjectValue, Value } from './types';

export interface MatchHost {
  /** Evaluate an expression in the case scope (bindings already visible). */
  evaluate(expr: Expression): Value;
  /** Bind a destructuring pattern in the case scope (the existing binder). */
  bind(pattern: ArrayDestructuringPattern | ObjectDestructuringPattern, value: Value): void;
  /** Throw an evaluator-formatted error carrying the switch's line. */
  fail(message: string): never;
}

type DestructuringPattern = ArrayDestructuringPattern | ObjectDestructuringPattern;

function isArrayLike(v: Value): v is ArrayValue {
  return typeof v === 'object' && v !== null && 'type' in v && v.type === 'ArrayValue';
}

function isObjectLike(v: Value): v is ObjectValue {
  return typeof v === 'object' && v !== null && 'type' in v && v.type === 'ObjectValue';
}

/**
 * Shape test only — never binds, never throws. An array pattern needs an
 * array of exactly that length (at least that length with a rest element).
 * An object pattern needs a plain object or a built-in struct (Point, Color,
 * Grid, …) that has every named property.
 */
export function destructuringShapeMatches(pattern: DestructuringPattern, value: Value): boolean {
  if (pattern.type === 'ArrayDestructuringPattern') {
    if (!isArrayLike(value)) return false;
    const len = value.elements.length;
    return pattern.rest ? len >= pattern.elements.length : len === pattern.elements.length;
  }
  if (isObjectLike(value)) {
    return pattern.properties.every((p) => value.properties.has(p.key));
  }
  const struct = getStructDescriptor(value);
  if (!struct) return false;
  return pattern.properties.every((p) => struct.has(value, p.key));
}

/** Does one pattern match? Binds destructured names on success. */
export function patternMatches(pattern: CasePattern, scrutinee: Value, host: MatchHost): boolean {
  switch (pattern.type) {
    case 'ValuePattern':
      return valuesEqual(scrutinee, host.evaluate(pattern.value)) === true;

    case 'RangePattern': {
      const n = toNumber(scrutinee);
      if (n === undefined) return false; // strings, structs: a range never matches
      if (pattern.start) {
        const lo = toNumber(host.evaluate(pattern.start));
        if (lo === undefined) host.fail('Range pattern bounds must be numeric');
        if (n < lo) return false;
      }
      if (pattern.end) {
        const hi = toNumber(host.evaluate(pattern.end));
        if (hi === undefined) host.fail('Range pattern bounds must be numeric');
        if (pattern.inclusive ? n > hi : n >= hi) return false;
      }
      return true;
    }

    default:
      if (!destructuringShapeMatches(pattern, scrutinee)) return false;
      host.bind(pattern, scrutinee);
      return true;
  }
}

/**
 * Does a case clause match? Alternatives are tried in order and the first
 * match binds; the guard then runs once, against those bindings, for the
 * whole clause.
 */
export function caseMatches(
  clause: { patterns: CasePattern[]; guard: Expression | null },
  scrutinee: Value,
  host: MatchHost,
): boolean {
  if (!clause.patterns.some((p) => patternMatches(p, scrutinee, host))) return false;
  return clause.guard === null || isTruthy(host.evaluate(clause.guard));
}

/**
 * Pick the body to run for a switch: the first matching case (in a fresh
 * case scope holding its bindings), else the default (in its own fresh
 * scope), else null. Failed clauses leave nothing behind because their
 * scope is discarded.
 */
export function selectSwitchClause<S>(
  stmt: SwitchStatement,
  scrutinee: Value,
  createCaseScope: () => S,
  hostFor: (caseScope: S) => MatchHost,
): { body: Statement[]; scope: S } | null {
  for (const clause of stmt.cases) {
    const caseScope = createCaseScope();
    if (caseMatches(clause, scrutinee, hostFor(caseScope))) {
      return { body: clause.body, scope: caseScope };
    }
  }
  if (stmt.defaultCase) return { body: stmt.defaultCase.body, scope: createCaseScope() };
  return null;
}

/**
 * The expression form: the first matching arm's value expression (in a fresh
 * arm scope holding its bindings), else the mandatory default's value.
 */
export function selectSwitchArm<S>(
  expr: SwitchExpression,
  scrutinee: Value,
  createArmScope: () => S,
  hostFor: (armScope: S) => MatchHost,
): { value: Expression; scope: S } {
  for (const arm of expr.arms) {
    const armScope = createArmScope();
    if (caseMatches(arm, scrutinee, hostFor(armScope))) return { value: arm.value, scope: armScope };
  }
  return { value: expr.defaultValue, scope: createArmScope() };
}

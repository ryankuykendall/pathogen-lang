// `switch` clause matching, shared by both evaluators. Each evaluator
// supplies a MatchHost that closes over its own expression evaluation,
// destructuring binder, and error formatting; everything about which
// clause matches lives here exactly once.

import type {
  ArrayDestructuringPattern,
  CasePattern,
  Expression,
  ObjectDestructuringPattern,
  Statement,
  SwitchStatement,
} from '../parser/ast';
import { getStructDescriptor } from './struct-properties';
import { isTruthy, toNumber, valuesEqual } from './value-semantics';

export interface MatchHost {
  /** Evaluate an expression in the case scope (bindings already visible). */
  evaluate(expr: Expression): unknown;
  /** Bind a destructuring pattern in the case scope (the existing binder). */
  bind(pattern: ArrayDestructuringPattern | ObjectDestructuringPattern, value: unknown): void;
  /** Throw an evaluator-formatted error carrying the switch's line. */
  fail(message: string): never;
}

type DestructuringPattern = ArrayDestructuringPattern | ObjectDestructuringPattern;

// Values are `unknown` here because index.ts and annotated.ts declare
// separate (structurally identical) Value unions; the checks are structural.
function isArrayLike(v: unknown): v is { type: 'ArrayValue'; elements: unknown[] } {
  return typeof v === 'object' && v !== null && 'type' in v && (v as { type: unknown }).type === 'ArrayValue';
}

function isObjectLike(v: unknown): v is { type: 'ObjectValue'; properties: Map<string, unknown> } {
  return typeof v === 'object' && v !== null && 'type' in v && (v as { type: unknown }).type === 'ObjectValue';
}

/**
 * Shape test only — never binds, never throws. An array pattern needs an
 * array of exactly that length (at least that length with a rest element).
 * An object pattern needs a plain object or a built-in struct (Point, Color,
 * Grid, …) that has every named property.
 */
export function destructuringShapeMatches(pattern: DestructuringPattern, value: unknown): boolean {
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
export function patternMatches(pattern: CasePattern, scrutinee: unknown, host: MatchHost): boolean {
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
  scrutinee: unknown,
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
  scrutinee: unknown,
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

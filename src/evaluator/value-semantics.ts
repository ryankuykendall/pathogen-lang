// Value semantics: numeric coercion, `==` equality, and truthiness. One
// implementation so `case` matching and `==` / `if` cannot drift apart (the
// inline copies this replaced had already diverged on `""` and `0deg`).

import type { BooleanValue, Value } from './types';
import { isAngleValue } from './angle';

export function isBooleanValue(value: unknown): value is BooleanValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'BooleanValue';
}

/**
 * Numeric view of a value: numbers as-is, booleans as 0/1, angles in
 * radians. Undefined for everything else (strings, structs, arrays, null).
 */
export function toNumber(v: Value): number | undefined {
  if (typeof v === 'number') return v;
  if (isBooleanValue(v)) return v.value;
  if (isAngleValue(v)) return v.radians;
  return undefined;
}

/**
 * `==` semantics, in three tiers:
 *   1. null equals only null;
 *   2. strings and booleans compare as strings (booleans stringify to
 *      "true"/"false" so enum-style string comparisons interoperate);
 *   3. everything toNumber understands compares numerically.
 * Returns undefined when the operands are not comparable at all (a Point
 * against a number, two colors, arrays, "1" against 1). `==` turns that
 * into an error; `case` matching treats it as a non-match.
 */
export function valuesEqual(a: Value, b: Value): boolean | undefined {
  if (a === null || b === null) return a === null && b === null;
  const as = typeof a === 'string' ? a : isBooleanValue(a) ? (a.value ? 'true' : 'false') : undefined;
  const bs = typeof b === 'string' ? b : isBooleanValue(b) ? (b.value ? 'true' : 'false') : undefined;
  if (as !== undefined && bs !== undefined) return as === bs;
  const an = toNumber(a);
  const bn = toNumber(b);
  if (an === undefined || bn === undefined) return undefined;
  return an === bn;
}

/**
 * Truthiness used by `if`, `? :`, `where` guards, and text-block
 * conditionals: null and zero (including `false` and `0deg`) are falsy;
 * any other numeric-like value is truthy; non-numeric values follow
 * JavaScript (so `""` is falsy, every object/array/string is truthy).
 */
export function isTruthy(v: Value): boolean {
  if (v === null) return false;
  const n = toNumber(v);
  return n !== undefined ? n !== 0 : Boolean(v);
}

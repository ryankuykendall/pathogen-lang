import { formatNum } from './format';
import { ANGLE_PRESERVING_ARGS } from '../stdlib/angle-preserving';

import type { AngleValue } from './types';

/**
 * First-class Angle value helpers, shared by the evaluator and the stdlib (like
 * struct-properties.ts and member-assign.ts). Radians are the canonical
 * measure; the written unit survives only for display.
 */

export function isAngleValue(v: unknown): v is AngleValue {
  return typeof v === 'object' && v !== null && 'type' in v && v.type === 'AngleValue';
}

export function angle(radians: number, unit: AngleValue['unit']): AngleValue {
  return { type: 'AngleValue', radians, unit };
}

/**
 * Radians → degrees with the deg→rad→deg float-noise snap
 * (30deg → 29.999999999999996 without it) so hue values and emitted CSS
 * stay clean.
 */
export function radiansToDegreesSnapped(radians: number): number {
  const degrees = (radians * 180) / Math.PI;
  return Math.round(degrees * 1e10) / 1e10;
}

/**
 * Radians → multiples of π, with the same float-noise snap as
 * radiansToDegreesSnapped (45deg → exactly 0.25).
 */
export function radiansToPiMultipleSnapped(radians: number): number {
  return Math.round((radians / Math.PI) * 1e10) / 1e10;
}

/** Radians → full circles, snapped like the other conversions. */
export function radiansToTurnsSnapped(radians: number): number {
  return Math.round((radians / (2 * Math.PI)) * 1e10) / 1e10;
}

/**
 * Display an Angle in its unit: 90deg, 0.5pi, 1.5708rad, 0.25turns.
 * Used by template literals and log().
 */
export function formatAngleForDisplay(a: AngleValue): string {
  if (a.unit === 'deg') return `${formatNum(radiansToDegreesSnapped(a.radians))}deg`;
  if (a.unit === 'pi') return `${formatNum(radiansToPiMultipleSnapped(a.radians))}pi`;
  if (a.unit === 'turns') return `${formatNum(radiansToTurnsSnapped(a.radians))}turns`;
  return `${formatNum(a.radians)}rad`;
}

/**
 * Invoke a plain stdlib function (a bare (…numbers) => value), unwrapping
 * AngleValue arguments to radians as the stdlib contract requires, then
 * re-wrapping the numeric result as an AngleValue when the function is
 * angle-preserving (see stdlib/angle-preserving.ts) and an Angle flowed into
 * one of its value-carrying slots. The display unit comes from the first such
 * Angle argument. Used by the evaluator's stdlib dispatch.
 */
export function callStdlibPreservingAngles(
  name: string,
  fn: (...ns: number[]) => unknown,
  rawArgs: unknown[],
): unknown {
  const args = rawArgs.map((v) => (isAngleValue(v) ? v.radians : v));
  const result = fn(...(args as number[]));
  if (typeof result !== 'number') return result;
  const relevant = ANGLE_PRESERVING_ARGS[name];
  if (!relevant) return result;
  const carriers = relevant === 'all' ? rawArgs : relevant.filter((i) => i < rawArgs.length).map((i) => rawArgs[i]);
  const unitSource = carriers.find(isAngleValue);
  return unitSource ? angle(result, unitSource.unit) : result;
}

/**
 * Angle method dispatch (.toDeg/.toRad/.toPi/.toTurns), shared by both
 * evaluators' evaluateMethodCall. Re-tagging returns the SAME angle with a
 * different display unit. Returns null for unknown method names so each
 * evaluator can raise its own formatted error.
 */
export function angleMethod(
  obj: AngleValue,
  method: string,
  argCount: number,
  fail: (message: string) => never,
): AngleValue | null {
  const units: Record<string, AngleValue['unit']> = {
    toDeg: 'deg',
    toRad: 'rad',
    toPi: 'pi',
    toTurns: 'turns',
  };
  const unit = units[method];
  if (!unit) return null;
  if (argCount !== 0) fail(`${method}() expects 0 arguments`);
  return angle(obj.radians, unit);
}

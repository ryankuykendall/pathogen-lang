// Number formatting — strings for templates, tables and labels.

/**
 * toFixed(value, digits) → string with exactly `digits` decimals, sign kept.
 * Angle values are unwrapped by the evaluator only when a unit is named
 * (see callStdlibPreservingAngles), so this sees plain numbers.
 */
function toFixed(value: unknown, digits: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('toFixed() expects a finite number as its first argument');
  }
  if (typeof digits !== 'number' || !Number.isInteger(digits) || digits < 0 || digits > 20) {
    throw new Error('toFixed() digits must be an integer from 0 to 20');
  }
  return value.toFixed(digits);
}

export const formatFunctions = {
  toFixed,
};

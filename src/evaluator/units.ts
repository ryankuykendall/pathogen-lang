import type { Expression } from '../parser/ast';

/**
 * Convert value based on unit suffix
 * - 'deg': converts degrees to radians
 * - 'pi': multiplies by Math.PI
 * - '%': divides by 100 (20% → 0.2)
 * - 'rad' or undefined: returns value unchanged (radians are internal standard)
 */
export function convertUnitSuffix(value: number, unit?: 'deg' | 'rad' | 'pi' | '%'): number {
  if (unit === 'deg') {
    return (value * Math.PI) / 180;
  }
  if (unit === 'pi') {
    return value * Math.PI;
  }
  if (unit === '%') {
    return value / 100;
  }
  return value; // rad or no unit = radians (internal standard)
}

/**
 * Check if an expression is a NumberLiteral with an angle unit (deg/rad/pi)
 */
export function hasAngleUnit(expr: Expression): boolean {
  if (expr.type === 'NumberLiteral') {
    return expr.unit === 'deg' || expr.unit === 'rad' || expr.unit === 'pi';
  }
  // For unary minus on a number with unit: -45deg
  if (expr.type === 'UnaryExpression' && expr.operator === '-') {
    return hasAngleUnit(expr.argument);
  }
  return false;
}

export type InferredUnit = 'angle' | 'scalar' | 'unknown';

/**
 * Static dimensional analysis over an expression: does it denote an angle?
 *
 * - angle-suffixed literals (deg/rad/pi) are angles; other literals (incl. %) are scalars
 * - +/- : angle if either side is an angle
 * - *   : angle × scalar → angle (angle × angle is rejected by checkAngleUnitMismatch)
 * - /   : angle / angle → scalar (the ratio cancels); angle / anything-else → angle
 * - calls, identifiers, and member access are 'unknown' — the walker never pierces
 *   a call boundary, so units are a property of how the expression is written
 */
export function inferUnit(expr: Expression): InferredUnit {
  switch (expr.type) {
    case 'NumberLiteral':
      return expr.unit === 'deg' || expr.unit === 'rad' || expr.unit === 'pi' ? 'angle' : 'scalar';
    case 'UnaryExpression':
      return expr.operator === '-' ? inferUnit(expr.argument) : 'unknown';
    case 'CalcExpression':
      return inferUnit(expr.expression);
    case 'TernaryExpression': {
      const c = inferUnit(expr.consequent);
      const a = inferUnit(expr.alternate);
      if (c === 'angle' || a === 'angle') return 'angle';
      if (c === 'scalar' && a === 'scalar') return 'scalar';
      return 'unknown';
    }
    case 'BinaryExpression': {
      const op = expr.operator;
      if (op !== '+' && op !== '-' && op !== '*' && op !== '/') {
        return 'unknown';
      }
      const l = inferUnit(expr.left);
      const r = inferUnit(expr.right);
      if (op === '/') {
        if (l === 'angle' && r === 'angle') return 'scalar';
        if (l === 'angle') return 'angle';
        if (l === 'scalar' && r === 'scalar') return 'scalar';
        return 'unknown';
      }
      // + - *
      if (l === 'angle' || r === 'angle') return 'angle';
      if (l === 'scalar' && r === 'scalar') return 'scalar';
      return 'unknown';
    }
    default:
      return 'unknown';
  }
}

/**
 * Check for angle unit misuse in binary arithmetic. Throws:
 * - '+'/'-' between an angle and a unitless scalar (ambiguous — which unit wins?)
 * - '*' between two angles (angle² has no meaning here)
 * Expressions involving unknowns (variables, calls) are never rejected.
 */
export function checkAngleUnitMismatch(left: Expression, right: Expression, operator: string): void {
  if (operator === '+' || operator === '-') {
    const l = inferUnit(left);
    const r = inferUnit(right);
    if ((l === 'angle' && r === 'scalar') || (l === 'scalar' && r === 'angle')) {
      const op = operator === '+' ? 'add' : 'subtract';
      const withUnit = l === 'angle' ? 'left' : 'right';
      const withoutUnit = l === 'angle' ? 'right' : 'left';
      throw new Error(
        `Cannot ${op} a number with angle unit (${withUnit}) and a number without unit (${withoutUnit}). ` +
          `Use explicit units: e.g., 90deg + 5deg or 1.57rad + 0.5rad`,
      );
    }
  } else if (operator === '*') {
    if (inferUnit(left) === 'angle' && inferUnit(right) === 'angle') {
      throw new Error(
        `Cannot multiply two numbers with angle units. Scale an angle by a plain number instead: e.g., 2 * 45deg`,
      );
    }
  }
}

/**
 * Interpret an already-evaluated color-method angle argument.
 * Color methods (hueShift, analogous, splitComplementary) take degrees for
 * bare numbers; when the argument expression is written with angle units
 * (deg/rad/pi), its evaluated value is radians and is converted to degrees.
 */
export function angleArgToDegrees(argExpr: Expression, value: number): number {
  if (inferUnit(argExpr) !== 'angle') return value;
  const degrees = (value * 180) / Math.PI;
  // Snap float noise from the deg→rad→deg round trip (30deg → 29.999999999999996)
  // so hue values and emitted CSS stay clean
  return Math.round(degrees * 1e10) / 1e10;
}

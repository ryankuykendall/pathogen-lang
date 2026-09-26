import { ANGLE_PARAMS } from '../angle-params';
import { radiansToDegreesSnapped } from './angle';
import { inferUnit } from './units';

import type { Expression } from '../parser/ast';

/**
 * Enforce that angle LITERALS carry a unit.
 *
 * This is a static rule, modelled on the ConicGradient `from`/`to` check in
 * member-assign.ts: it inspects the written expression, not the runtime value,
 * because that is the only way to tell a bare literal `45` from a variable that
 * happens to hold an angle. `inferUnit` gives three answers and each gets a
 * different treatment:
 *
 *   'angle'   45deg, calc(x * 1rad)        pass
 *   'scalar'  45, -45, calc(2 * 3)         ERROR
 *   'unknown' spin, tangent(0.5).angle     pass; a plain number still reads as radians
 *
 * So the rule closes the LITERAL trap, not the variable trap: `let spin = 45;
 * sq.rotate(spin)` still silently means radians. Closing that would mean making
 * every angle producer return an AngleValue, which changes what `${…}` prints.
 *
 * KNOWN LIMITATION — error ordering on the generic method path. Where a call
 * has its own null or arity guard, this check runs after it, because a missing
 * or miscounted argument is the more fundamental mistake: that ordering is
 * explicit in the stdlib and context-aware branches, in `PolarVector` and in
 * `transform.rotate.set`. The per-receiver method check in `evaluateMethodCall`
 * cannot do the same, because arity there is validated inside each of ~25
 * switch cases. So `pb.mirror(45, 10)` reports the missing unit rather than the
 * extra argument — both are true, but the user fixes them one at a time.
 * Encoding arity here to fix it would duplicate what each case already
 * enforces, and a second copy of that data is exactly the drift this registry
 * exists to prevent.
 */

/** `0` is 0 in any unit. sanitize.ts takes the same line for CSS angles. */
function isLiteralZero(expr: Expression): boolean {
  if (expr.type === 'NumberLiteral') return expr.value === 0;
  if (expr.type === 'UnaryExpression' && expr.operator === '-') return isLiteralZero(expr.argument);
  if (expr.type === 'CalcExpression') return isLiteralZero(expr.expression);
  return false;
}

/**
 * The literal's text, for an error that quotes what the author actually wrote.
 *
 * Deliberately not the path-data number formatter: `--to-fixed` mutates that,
 * so `rotate(45.6789) --to-fixed=2` would tell the user to "write 45.68rad" —
 * a different number than their source, quietly losing precision in the very
 * fix being suggested.
 */
function describeExpr(expr: Expression): string | null {
  if (expr.type === 'NumberLiteral') return String(expr.value);
  if (expr.type === 'UnaryExpression' && expr.operator === '-') {
    const inner = describeExpr(expr.argument);
    return inner === null ? null : `-${inner}`;
  }
  return null;
}

/**
 * The message for one offending argument, or null when it is acceptable.
 * `label` names the position for the reader: "rotate()" or "Marker.orient".
 */
export function describeMissingAngleUnit(key: string, label: string, expr: Expression): string | null {
  const spec = ANGLE_PARAMS[key];
  if (!spec) return null;
  // Degrees slots are exempt. The rule exists because a bare number silently
  // means RADIANS — `#{ rotate: 45; }` renders as rotate(2578.31). In a degrees
  // slot (the OKLCH hue family, the SVG arc rotation) a bare number already
  // means what the author wrote, so there is no trap to close and requiring a
  // unit would only churn working code. The unit tag still drives CONVERSION
  // for those slots; it just stops driving validation.
  if (spec.unit !== 'rad') return null;
  if (isLiteralZero(expr)) return null;
  if (inferUnit(expr) !== 'scalar') return null;

  const written = describeExpr(expr);
  if (written === null) {
    // A computed scalar such as calc(2 * 3): there is no literal to suffix, so
    // name the calc idiom rather than the rad()/deg() converters, which return
    // bare numbers and would only re-trigger this error.
    return (
      `${label} takes an angle, and this expression has no unit. As written it means radians — ` +
      `multiply by 1rad to keep radians, or by 1deg if it holds degrees.`
    );
  }

  // Two decimals: the point is to show how far off radians is, not to be exact.
  const asDegrees = String(Math.round(radiansToDegreesSnapped(Number(written)) * 100) / 100);
  return (
    `${label} takes an angle — ${written} needs a unit. As written it means ${written} radians (${asDegrees}deg). ` +
    `Write ${written}deg for degrees, or ${written}rad to keep radians.`
  );
}

/** The message for an angle-valued property assignment, or null. */
export function describeMissingAngleUnitForProp(key: string, property: string, expr: Expression): string | null {
  const spec = ANGLE_PARAMS[key];
  if (!spec?.props?.includes(property)) return null;
  return describeMissingAngleUnit(key, `${key}.${property}`, expr);
}

/**
 * Every object-literal field named by `fields`, however deeply the argument
 * nests arrays of objects — the spline families take `{ x, y, angle }` points
 * in an array, so the angle never appears in a positional slot.
 */
function walkFields(key: string, label: string, expr: Expression, fields: readonly string[], out: string[]): void {
  // A spread carries no literal this walker can see; it is skipped, like any
  // other expression the static rule cannot classify.
  if (expr.type === 'ArrayLiteral') {
    for (const element of expr.elements) {
      if (element.type !== 'SpreadElement') walkFields(key, label, element, fields, out);
    }
    return;
  }
  if (expr.type !== 'ObjectLiteral') return;
  for (const property of expr.properties) {
    if (property.type === 'SpreadElement' || !fields.includes(property.key)) continue;
    const message = describeMissingAngleUnit(key, `${label} '${property.key}'`, property.value);
    if (message) out.push(message);
  }
}

/** Every offending argument of a call, positional and nested, in source order. */
export function describeMissingAngleUnits(key: string, label: string, args: readonly Expression[]): string[] {
  const spec = ANGLE_PARAMS[key];
  if (!spec) return [];
  const out: string[] = [];
  for (const index of spec.args ?? []) {
    const arg = args[index];
    if (!arg) continue;
    const message = describeMissingAngleUnit(key, label, arg);
    if (message) out.push(message);
  }
  if (spec.fields) {
    for (const arg of args) walkFields(key, label, arg, spec.fields, out);
  }
  return out;
}

/**
 * The registry prefix for a method receiver. Tagged values are named
 * `<Name>Value` throughout the evaluator, so `PathBlockValue` keys as
 * `PathBlock.rotate`. Returns null for anything untagged, which simply means
 * the receiver has no angle parameters to check.
 */
export function receiverTypeName(obj: unknown): string | null {
  if (typeof obj !== 'object' || obj === null || !('type' in obj)) return null;
  const tag = obj.type;
  if (typeof tag !== 'string' || !tag.endsWith('Value')) return null;
  // Every filter shares the tag `FilterValue` and is told apart by `kind`
  // ('emboss', 'motion-blur', …), so the registry key comes from the kind.
  if (tag === 'FilterValue' && 'kind' in obj) {
    const kind = (obj as { kind: unknown }).kind;
    if (typeof kind !== 'string') return null;
    const camel = kind.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    return `${camel.charAt(0).toUpperCase()}${camel.slice(1)}Filter`;
  }
  return tag.slice(0, -'Value'.length);
}

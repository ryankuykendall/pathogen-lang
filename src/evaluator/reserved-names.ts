/**
 * The angle unit suffixes (`0.5pi`, `90deg`, `1.5rad`) are reserved
 * words: they exist ONLY as suffixes. They cannot be bound as
 * variable/function/parameter names, and a standalone variable
 * reference gets a pointer at the forms that do exist. Call position
 * (`PI()`, `deg(x)`, `rad(x)`) is unaffected — enforcement lives at
 * the binding funnel (setVariable) and the Identifier-reference sites,
 * deliberately NOT in lookupVariable, which also resolves call targets.
 *
 * Shared by both evaluators (which otherwise share almost nothing) so
 * the rule can never diverge between compile() and compileAnnotated().
 */

export const RESERVED_UNIT_NAMES: ReadonlySet<string> = new Set(['pi', 'deg', 'rad']);

const REFERENCE_HINTS: Record<string, string> = {
  pi: "write 0.5pi for an angle, or PI() for the number π",
  deg: 'write 90deg for an angle, or deg(x) to convert radians to degrees',
  rad: 'write 1.5rad for an angle, or rad(x) to convert degrees to radians',
};

/** Error text for attempting to BIND a reserved name (let, for, fn, params, destructuring). */
export function reservedNameBindingError(name: string): string {
  return `'${name}' is reserved — it is a unit suffix (0.5pi, 90deg, 1.5rad); it cannot be used as a variable name`;
}

/** Error text for REFERENCING a reserved name standalone as a variable. */
export function reservedNameReferenceError(name: string): string {
  return `'${name}' is a unit suffix, not a variable — ${REFERENCE_HINTS[name]}`;
}

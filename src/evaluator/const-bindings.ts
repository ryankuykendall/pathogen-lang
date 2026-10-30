/**
 * `const` (phase 0a step 4; docs/syntax.md "Variables" → "const"): the
 * messages, shared by the evaluator (run time) and the parser's static check
 * (src/parser/const-check.ts), so both say exactly the same thing.
 *
 * JavaScript semantics (decision 7): the binding is fixed, the contents are
 * not. Two `let`s of one name in one scope stay legal (the second replaces
 * the first); only a `const` makes a second declaration an error.
 */

/** Assigning to a const. */
export function constReassignError(name: string): string {
  return `Cannot assign to ${name} — it is a const. Declare it with let if it needs to change`;
}

/** A let, const or fn declaring a name that is already a const in the same scope. */
export function constRedeclareError(name: string): string {
  return `Cannot declare ${name} again in this scope — it is a const. Use another name`;
}

/** A const declaring a name that a let, fn or parameter already holds in the same scope. */
export function constOverExistingError(name: string): string {
  return `Cannot declare ${name} as a const — it is already declared in this scope. Use another name`;
}

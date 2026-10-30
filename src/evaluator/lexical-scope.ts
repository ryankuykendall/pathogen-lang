/**
 * Phase 0a step 3 (docs/syntax.md "Scoping: where a function finds its
 * names"): the sentence every lexical-scope miss hint carries, and how a
 * fallback recognizes such a miss.
 */
export const LEXICAL_RULE = 'a function sees the variables where it is written, not where it is called';

/**
 * Whether `e` is a lookup or assignment miss that the old caller-scope rule
 * would have resolved (its message carries the hint). A fallback that keeps
 * raw text when evaluation fails — style values, CSS function arguments —
 * must let these through: under the old rule the value resolved, so keeping
 * the raw name (`stroke: col` → stroke="col") would silently change the
 * output instead of stopping with the documented error.
 */
export function isLexicalScopeMiss(e: unknown): e is Error {
  return e instanceof Error && e.message.includes(LEXICAL_RULE);
}

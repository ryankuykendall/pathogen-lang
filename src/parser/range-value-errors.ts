/**
 * Errors for ranges used as VALUES. A range value is always parenthesized —
 * `(1..5)` — and a bare `1..5` outside a for header or a case arm is the
 * mistake users make first. Lezer's recovery reports it as a generic
 * "Missing ';'" that points at punctuation nowhere near the fix, so both
 * error paths (parse() for the CLI/playground compile error, getDiagnostics'
 * describeError for editor squiggles) ask this module first and show the
 * same text.
 */
import type { SyntaxNode } from '@lezer/common';

export const RANGE_NEEDS_BOTH_BOUNDS =
  'A range value needs both bounds: (start..end) — open-ended ranges only work as case patterns';

// Every clause is a cause seen in practice: a range where a coordinate belongs
// (calc() alone does not help — `calc((1..3))` is still an array, so the advice
// names a reducing member), a statement starting with `(` swallowed by the
// path command above it, and two numbers typed with no space (`1..3`).
export const RANGE_IN_PATH_ARGS =
  "A range cannot be used as a path argument — path arguments are numbers. To use one number from a range, read it inside calc(), e.g. calc((1..3).last). If this line was meant to start a new statement, end the path command above with ';'. If these are two numbers, put a space between them";

/** `case (100..)` — open-ended ranges ARE case patterns; the parentheses are the mistake. */
function openEndedPatternMessage(pattern: string | null): string {
  return `An open-ended case range takes no parentheses — write case ${pattern ?? '100..'}`;
}

/** Parents whose own grammar takes a bare range — never rewrite their errors. */
const BARE_RANGE_PARENTS = new Set([
  'ForLoop',
  'TextForLoop',
  'RangePattern',
  'CasePattern',
  'CaseClause',
  'CaseArm',
  'TextCaseClause',
]);

/** A bound simple enough to echo back verbatim: a number, a name, or a member chain. */
const SIMPLE_BOUND = String.raw`\d+(?:\.\d+)?|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*`;
const LEFT_BOUND = new RegExp(`(?:^|([=(\\[,?:])|\\b(return|in))\\s*(${SIMPLE_BOUND})\\s*$`);
const RIGHT_BOUND = new RegExp(`^\\s*(${SIMPLE_BOUND})\\s*(?=[;,)\\]:.]|$)`);

/**
 * The message for a range with a bound missing. `group` is the parenthesized
 * node (RangeExpression or ParenExpression); when it is the whole case
 * pattern the fix is to drop the parentheses, otherwise both bounds are needed.
 */
function missingBoundMessage(input: string, group: SyntaxNode): string {
  if (group.parent?.name !== 'CasePattern') return RANGE_NEEDS_BOTH_BOUNDS;
  const close = group.lastChild?.name === ')' ? group.lastChild.from : group.to;
  const inner = input.slice(group.from + 1, close).trim();
  return openEndedPatternMessage(/^[\w.<\s-]+$/.test(inner) ? inner.replace(/\s+/g, '') : null);
}

function isRangeOp(name: string | undefined): boolean {
  return name === 'RangeOp' || name === 'HalfOpenRangeOp';
}

/**
 * Recognize a bare range in value position from the error node recovery
 * leaves behind. Shapes (see project-docs/range-values/probes/error-shapes.ts):
 *
 *   let steps = 1..5;   ⚠[RangeOp]  prev = the left bound's last token
 *   let bad = (..5);    ⚠[RangeOp]  prev = "("            → missing bound
 *   let bad = (1..);    ⚠(empty)    parent RangeExpression → missing bound
 *
 * A missing bound inside a parenthesized group that IS a case pattern
 * (`case (100..)`, `case (..5)`) gets different advice: open-ended ranges are
 * legal there, bare — telling that user "open-ended ranges only work as case
 * patterns" would be telling them to do what they already did.
 *
 * Returns null for anything else, including `...` (spread) and errors inside
 * for headers and case arms.
 */
export function describeBareRange(input: string, errorNode: SyntaxNode): { message: string; offset: number } | null {
  const parent = errorNode.parent;
  if (!parent || BARE_RANGE_PARENTS.has(parent.name)) return null;

  // `(1..)` — the grammar got as far as RangeExpression and ran out of input.
  if (parent.name === 'RangeExpression') {
    return { message: missingBoundMessage(input, parent), offset: errorNode.from };
  }

  // Recovery wraps the stray operator in the error node; fall back to the
  // source text in case a future grammar change alters the wrapping.
  const atOperator =
    isRangeOp(errorNode.firstChild?.name) ||
    (input.startsWith('..', errorNode.from) && !input.startsWith('...', errorNode.from));
  if (!atOperator) return null;

  const prev = errorNode.prevSibling;
  if (!prev || prev.name === '(' || prev.name === '[' || prev.name === ',' || prev.name === '=') {
    // `(..5)` recovers as a ParenExpression; only that group can be a pattern.
    const message = prev?.name === '(' ? missingBoundMessage(input, parent) : RANGE_NEEDS_BOTH_BOUNDS;
    return { message, offset: errorNode.from };
  }

  const operator = input.startsWith('..<', errorNode.from) ? '..<' : '..';
  const lineStart = input.lastIndexOf('\n', errorNode.from - 1) + 1;
  const left = LEFT_BOUND.exec(input.slice(lineStart, errorNode.from));
  const right = RIGHT_BOUND.exec(input.slice(errorNode.from + operator.length, errorNode.from + operator.length + 120));
  const spelling = left && right ? `(${left[3]}${operator}${right[1]})` : `(start${operator}end)`;
  return {
    message: `A range used as a value needs parentheses — write ${spelling}`,
    offset: errorNode.from,
  };
}

import { matchFunctionNotation, splitTopLevel } from '../css-value-utils';
import type { Expression } from '../parser/ast';

/**
 * Evaluator hooks for {@link tryResolveCSSFunctionArgs}. The resolver is
 * parameterized by the evaluator's expression loop rather than importing
 * evaluator/index.ts (which would be circular).
 */
export interface CSSFunctionArgHooks {
  /** Parse a token as a standalone expression; null if it doesn't parse. */
  parseExpression(token: string): Expression | null;
  /**
   * Evaluate an expression and serialize it to a CSS string when it is a
   * typed value with a CSS representation (Color, CSSVar) or a number bound
   * to a variable/expression (never a literal token like `2px`, which must
   * stay verbatim); null otherwise. May throw (e.g. unresolved identifier) —
   * the caller treats a throw as "leave the token untouched".
   */
  resolveToCSS(expr: Expression): string | null;
}

/**
 * Try to resolve Pathogen expressions embedded within CSS function arguments,
 * e.g. the color variable in `drop-shadow(4px 4px 4px shadowColor)`. Only
 * substitutes tokens that evaluate to Color/CSSVar values — CSS tokens like
 * `16px` or `blue` are left untouched. Tokens are split on top-level
 * whitespace (native CSS syntax); comma validity is the validator's concern.
 *
 * Returns the rebuilt `name(args)` string when at least one token was
 * substituted, null when nothing resolved (caller keeps the raw value).
 */
// CSS numeric literal (2px, -90deg, 50%, 1.5, .5e2): must stay verbatim.
// Parsing these as Pathogen expressions would convert or strip the CSS unit
// (e.g. `-90deg` parses as UnaryExpression(NumberLiteral 90 deg) and
// evaluates to radians — substituting would emit a unitless radian value).
const CSS_NUMERIC_LITERAL_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?[a-z%]*$/i;

export function tryResolveCSSFunctionArgs(
  raw: string,
  hooks: CSSFunctionArgHooks,
  emittedVars?: string[],
): string | null {
  const match = matchFunctionNotation(raw);
  if (!match) {
    // Space-separated chain (`blur(2px) brightness(level)`): resolve each
    // segment independently. Single-segment input can't be a chain — return
    // null. This is also why the recursion is guaranteed to terminate: each
    // recursive call receives one already-split segment, so splitTopLevel on
    // it yields at most one segment and hits this base case.
    const segments = splitTopLevel(raw.trim());
    if (segments.length < 2) return null;
    let anyResolved = false;
    const out = segments.map((seg) => {
      const resolved = tryResolveCSSFunctionArgs(seg, hooks, emittedVars);
      if (resolved !== null) {
        anyResolved = true;
        return resolved;
      }
      return seg;
    });
    return anyResolved ? out.join(' ') : null;
  }

  const tokens = splitTopLevel(match.args);

  let anyResolved = false;
  const resolved = tokens.map((token) => {
    try {
      if (CSS_NUMERIC_LITERAL_RE.test(token.trim())) return token;

      const expr = hooks.parseExpression(token);
      if (!expr) return token;

      // Preserve raw hex color literals
      if (expr.type === 'ColorLiteral') {
        anyResolved = true;
        return expr.raw;
      }

      const css = hooks.resolveToCSS(expr);
      if (css !== null) {
        anyResolved = true;
        // Record compiler-emitted var() strings so the validator can allow
        // exactly these tokens and no other var() in the value.
        if (emittedVars && css.startsWith('var(')) emittedVars.push(css);
        return css;
      }

      // Don't substitute other types — they're CSS values
      return token;
    } catch {
      return token;
    }
  });

  if (!anyResolved) return null;
  return `${match.name}(${resolved.join(' ')})`;
}

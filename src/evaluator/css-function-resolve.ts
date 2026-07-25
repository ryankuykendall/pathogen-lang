import { matchFunctionNotation, splitTopLevel } from '../css-value-utils';
import type { Expression } from '../parser/ast';

/**
 * Evaluator hooks for {@link tryResolveCSSFunctionArgs}. Both evaluators
 * (index.ts and annotated.ts) have their own expression-evaluation loops but
 * identical Value shapes, so the shared resolver is parameterized by them
 * rather than importing either evaluator (which would be circular).
 */
export interface CSSFunctionArgHooks {
  /** Parse a token as a standalone expression; null if it doesn't parse. */
  parseExpression(token: string): Expression | null;
  /**
   * Evaluate an expression and serialize it to a CSS string when it is a
   * typed value with a CSS representation (Color, CSSVar); null otherwise.
   * May throw (e.g. unresolved identifier) — the caller treats a throw as
   * "leave the token untouched".
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
export function tryResolveCSSFunctionArgs(raw: string, hooks: CSSFunctionArgHooks): string | null {
  const match = matchFunctionNotation(raw);
  if (!match) return null;

  const tokens = splitTopLevel(match.args);

  let anyResolved = false;
  const resolved = tokens.map((token) => {
    try {
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

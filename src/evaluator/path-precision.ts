/**
 * Export-time coordinate precision trimming.
 *
 * Re-emits path data as ABSOLUTE commands with coordinates rounded to a fixed
 * number of decimals. Absolute emission is the load-bearing choice: rounding
 * relative deltas accumulates drift over long command chains (a thousand
 * `l .014 .014`s rounded at one decimal drift by whole units), while rounding
 * absolute coordinates bounds every point's error to half an ULP of the chosen
 * precision, forever.
 *
 * Used by the playground's Export with Legend "Precision" option; purely
 * additive — the evaluators' own full-precision serialization is untouched.
 */
import { commandsToAbsoluteD, parsePathDataExpanded } from './path-data';

/**
 * Re-emit `d` as absolute path data with non-integer coordinates rounded to
 * `decimals` places (trailing zeros stripped, `-0` normalized). Integers pass
 * through unchanged, matching setNumberFormat semantics — except that the
 * compile-time formatter keeps trailing zeros (`1.50`) while this pass strips
 * them (`1.5`); intentional cosmetic divergence, never double-applied.
 */
export function trimPathDataPrecision(d: string, decimals: number): string {
  const n = Math.min(20, Math.max(0, Math.trunc(decimals)));
  const fmt = (value: number): string => {
    if (Number.isInteger(value)) return String(value);
    let s = value.toFixed(n);
    if (n > 0) {
      s = s.replace(/0+$/, '').replace(/\.$/, '');
    }
    return s === '-0' ? '0' : s;
  };
  return commandsToAbsoluteD(parsePathDataExpanded(d), { format: fmt });
}

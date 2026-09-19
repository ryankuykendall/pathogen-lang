// Iteration plan for `for (i in start..end)` and `for (i in start..<end)`,
// shared by every range-loop site in the evaluator (statement bodies and
// the text-body walkers) so the inclusive/half-open rule lives once.

export interface RangePlan {
  /** true when counting up (start <= end); a half-open empty range counts as ascending. */
  ascending: boolean;
  /** Exact number of iterations the loop will run (used for the iteration-limit guard). */
  iterations: number;
  /** +1 or -1 */
  step: 1 | -1;
  /** Loop condition for the current value. */
  continues: (i: number) => boolean;
}

export function planRange(start: number, end: number, inclusive: boolean): RangePlan {
  const ascending = start <= end;
  const span = Math.abs(end - start);
  // `0..2.5` visits 0, 1, 2 (floor + 1); `0..<2.5` visits 0, 1, 2 (ceil); `0..<0` visits nothing.
  const iterations = inclusive ? Math.floor(span) + 1 : Math.ceil(span);
  const step: 1 | -1 = ascending ? 1 : -1;
  const continues = ascending
    ? (i: number) => (inclusive ? i <= end : i < end)
    : (i: number) => (inclusive ? i >= end : i > end);
  return { ascending, iterations, step, continues };
}

/**
 * The bound errors, once per phrasing: `loop` is a for header, `value` is a
 * parenthesized range value `(a..b)`. One table so the two cannot drift —
 * a range value promises the for loop's numbers, and its rejections too.
 */
export const RANGE_MESSAGES = {
  loop: {
    numeric: 'for loop range must be numeric',
    finite: 'for loop range must be finite (got Infinity or NaN)',
    cap: (count: number, max: number) => `for loop would run ${count} iterations (max ${max})`,
  },
  value: {
    numeric: 'range bounds must be numeric',
    finite: 'range bounds must be finite (got Infinity or NaN)',
    cap: (count: number, max: number) => `range would produce ${count} elements (max ${max})`,
  },
} as const;

export type RangeKind = keyof typeof RANGE_MESSAGES;

/**
 * The numbers a loop over the plan visits, in order. Deliberately the SAME
 * repeated addition the for loop performs (`i += step`), never
 * `start + k * step`: with a fractional start the two differ in the last
 * bits, and `(a..b)` is defined as exactly what `for (i in a..b)` binds.
 */
export function rangeValues(start: number, plan: RangePlan): number[] {
  const values: number[] = [];
  for (let i = start; plan.continues(i); i += plan.step) values.push(i);
  return values;
}

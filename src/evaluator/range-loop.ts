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

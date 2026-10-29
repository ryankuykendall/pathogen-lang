# Content review: `ctx.heading` reads `null` (docs/stdlib.md, 2026-10-28)

Multi-persona review of the two-line change to docs/stdlib.md "#### ctx.heading" that goes with the fix making `ctx.heading` read `null` when no direction is set (it used to throw while the docs said "undefined").

## Verdict

Approve with minor edits. The change is accurate (checked against `src/evaluator/struct-properties.ts` and `tests/ctx-heading.test.ts`) and doesn't conflict with the Tangent Functions note that `M` clears the heading. No docs page mentions the JS API's `result.context.heading`, so its staying `undefined` needs no mention.

## Findings and dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | "before anything has been drawn" is imprecise: `heading(90deg)` sets a direction without drawing. | Applied: "before anything has [set a direction]". |
| 2 | "until something sets a direction again" includes `turn()`, which requires an existing heading and throws without one. | Applied: names `heading()` or a drawing command. |
| 3 | No hint on testing for `null`; a rightward heading is `0`, also falsy, so `if (ctx.heading)` can't tell them apart. | Applied: "Test for it with `ctx.heading == null` (see [Null](#syntax-null)), not truthiness". |
| 4 | Voice: the mid-clause aside was hard to parse. | Applied with the rewrite. |
| — | Consider noting that `null` in arithmetic throws (`ctx.heading + 10deg` right after `M`). | Not added; the Null section covers it. |

Final text: "`M` (moveTo) clears the heading. Until `heading()` or a drawing command sets a direction (and at the start, before anything has), `ctx.heading` is `null`. Test for it with `ctx.heading == null` (see [Null](#syntax-null)), not truthiness: a rightward heading is `0`, which is also falsy."

## Synthesis

The UX engineer and product manager agree the fix replaces a false claim with true behaviour. The instructional designer and UX designer wanted the clause rewritten so it doesn't list `turn()` as a setter or bury the null-versus-`0` gotcha; the rewrite does both.

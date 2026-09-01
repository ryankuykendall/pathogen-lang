# Part 1 (broken-lines-stroke-geometry) — Agentic Review Synthesis

4-persona review, 2026-09-01. Condensed; ranked as delivered.

## Must fix (all applied)
- M1 cap-extension invariant (round/square extend width/2 per end; pieces
  stay discrete only when gap > stroke-width) was unnamed AND visibly bit
  two figures: 04 (24/14 gap vs 19 max width) and 05 (30/18 vs width 22 —
  slots fused). → Fourth "things to know" bullet added; 03 gains a dashed
  reference rule at the butt termination line; 04 retuned to 24 22;
  05 retuned to 26 26 @ width 16 (three discrete pills, clearance 10).
- M2 06's 0.08 phase step = 0.64 period → reads backward. → [0%, 4%, 8%]
  (0.32 period, forward march) + literal percent labels (percent literals
  coerce to numbers in templates, so labels are written out).
- M3 startAt() open-path two-run behavior stated up front.

## Should improve (applied)
- S1 union contrast: prose clause describing what raw would show.
- S2 start-point dots on 06's rings; ghost ring alpha raised.
- S3 "centerline" translated + why dash() rejects stroke-width.
- S4 duplicate in-image/caption sentences: captions shortened to API calls.
- S5 color semantics: 04 outlined fills → amber; 06 marchers → blue
  (scheme: slate = source/ghost, blue = centerline, amber = outlined).
- S6 friction-log promise made honest (two shipped, rest on the bench).
- S7 Cutting Room linked.
- C4 "more in the docs" line (dashoffset, dash-seam, % semantics).
- C5 06 top whitespace reclaimed (viewBox 210).

## Deferred (recorded)
- C1 column GroupLayers vs anchor arrays (reader-invisible; series-wide).
- C2 unified label placement convention (series-wide pass).
- C3 distinct composition for Example 2 (kept: t0 filter is load-bearing
  for part 3; noted for a future revision).
- C6 lead-off sample scaffolding weight (series-level decision).
- Filed observation: example-design-system.md specifies Helvetica Neue /
  letter-spacing no current sample uses — doc/practice seam.

## Verified non-issues
dash-seam in 06 (pattern ends mid-gap); 03 label centering; anchor slugs
(check-links passes); series scaffolding.

# The Cutting Room Feedback Loop — opportunity tracker

Friction log entries from FEATURE-OPPORTUNITIES.md, worked case by case:
rich summary → user collaboration → implementation (full compiler
lifecycle, docs first) → series update ("What this project taught the
language" closing sections + in-place sample upgrades) → one commit per
item. Process defined in ../plan-v2-feedback-loop-approved.md.

Each item gets a folder `NN-<slug>/` holding `summary.md` (the rich
deep-dive delivered for review), `decision.md` (the agreed design), and
iteration artifacts (drafts preserved, never overwritten).

## Status

Re-scoped 2026-08-23 after implementation-site-report.md showed five log
premises don't hold (see each item's folder). Re-scoped items are marked
† — their friction was real, but the fix is documentation, diagnostics,
a narrow bug, or deleting our own workaround, not the feature we logged.

| Item | Log entries | Title (post-report scope) | State |
|------|-------------|---------------------------|-------|
| A | #11 | offset(): miter spikes baked into curve frames; curve offset not curvature-aware († headline corrected — no direction flip) | **LANDED** — offsetCommands rewrite (joins + parallel curves + {join} option), 10 new tests, suite 4818, garment post section + yoke allowance restored |
| B | #1, #12 | ProjectedPath in-place draw() (strictly additive; drawTo invariant documented) | **LANDED** — draw() both evaluators, docs contract, 7 new tests, idiom swept across all 21 samples + both fences, closing sections in all four posts |
| B2 | #12 root | Truthful startPoint = "first inked point" (revive 2026-08-01 backlogged audit, preserved in B-projected-draw/) | queued after H |
| C | #10, #16 | † annotated-divergence sweep: text-if drop (annotated.ts:3695) AND stdlib-call blocks empty in annotated (found in B's review round) — narrow fixes + delete post41/04 workaround | queued |
| D | #2 | pieces.seams() group query (array-method fallthrough, index.ts:5327; twin pairs at boolean-ops.ts:4772) | queued |
| E | #3 | † normal(t) ALREADY material-outward on cut seams (canonical winding) — docs + possibly alias; delete tab flip dance | queued |
| F | #7 | Cutter label propagation — meta reaches stampCutSeam (boolean-ops.ts:3959) and is discarded at one line; + bridging-l at :4428 | queued |
| G | #8 | Unmerged-runs escape hatch (findLabeledRuns, segments.ts:260; options arg at 3 query sites) | queued |
| H | #6 | cut([k1, k2, ...]) ONLY (block-local absolute M dropped — superseded by L) | approved, implementing after B commits |
| L | #6 root, #15 | ctx as declared PathBlock argument (`@{\|ctx\| ...}`): origin deltas + .return() (relative purity), in-block label querying via ctx.query — user design sketch preserved in L-ctx-block-argument/ | fast-follow after current fixes |
| I | #4, #5 | † member path args ALREADY work (single-letter command shadowing is the trap → better diagnostic via describeError); pi is a literal suffix → constant binding or quick-fix | queued |
| J | #9 | † dynamic styling MOSTLY works (exprs, ternaries, fn calls in style values; dynamic define in loops; layer(\`tpl\`) routing) — real bug: postfix exprs in layer(...) flattened by ast-builder :1114 (fix: buildExpressionWithPostfix); delete round-robin if-chains | queued |
| K | #13 | Document string ternaries (+ style-value expressions) + if-reassignment | queued |

Cross-cutting constraint: every new method needs an annotated
counterpart or an explicit entry in annotated.ts:1836's unsupported
list (shipping requirement).

Working order: A → K as listed (bugs → cut-API → ergonomics → docs).
Each item may be re-scoped, deferred, or rejected during collaboration.

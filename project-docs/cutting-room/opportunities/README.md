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
| C | #10, #16 | † annotated-divergence sweep: text-if drop + stdlib-call blocks empty | **LANDED** — recursive text-block walker + PathSegment context tracking, 4 parity tests, no sample changes needed (04's counts design stays) | 
| D | #2 | pieces.seams() group query (seamId twin-stamping) | **LANDED** — array method both evaluators, 4 meta-passthrough fixes, 8 new tests incl. ownership-rule equivalence, fold-lines showcase rewritten |
| E | #3 | † normal(t) ALREADY material-outward — guarantee documented + pinned | **LANDED** — docs contract (holes + hand-authored caveats), 2 pinning tests, flip dance deleted from 41/03+06 with byte-identical outputs, alias rejected |
| F | #7 | Cutter label propagation — `cut.<name>` sub-labels via stampCutSeam carry; umbrella query; label-name validation (bare 'cut' reserved, `.` delimiter, `:` kept for future pseudo-selectors); also partially delivers #8 | LANDED (2026-08-25) |
| G | #8 | Query pseudo-selectors `:each` / `:first` / `:last` / `:nth(k)` (user chose full family) — parseSegmentQuery + queryLabeledRuns wrap findLabeledRuns; 3 dispatch sites; point/vertex guard | LANDED (2026-08-25) |
| H | #6 | cut([k1, k2, ...]) ONLY (block-local absolute M dropped — superseded by L) | **LANDED** — array cutters both receivers, 6 new tests, six knife samples rewritten as loops, closing entries in three posts |
| F2 | #7b | Annotated-mode label-name validation parity — compileAnnotated silently accepts labels main mode rejects (bare 'cut', punctuation); Item C class | fast-follow (review finding) |
| L | #6 root, #15 | ctx as declared PathBlock argument (`@{\|ctx\| ...}`): origin deltas + .return() (relative purity), in-block label querying via ctx.query — user design sketch preserved in L-ctx-block-argument/ | fast-follow after current fixes |
| I | #4, #5 | † shadowing rescue at both error paths (parse() + describeError, two tree shapes) + calc() quick fix + hover fix; pi/deg/rad RESERVED suffix-only (user chose strictness) via setVariable funnel + 6 Identifier sites, shared reserved-names.ts | LANDED (2026-08-25) |
| J | #9 | † dynamic styling MOSTLY works (exprs, ternaries, fn calls in style values; dynamic define in loops; layer(\`tpl\`) routing) — real bug: postfix exprs in layer(...) flattened by ast-builder :1114 (fix: buildExpressionWithPostfix); delete round-robin if-chains | queued |
| K | #13 | Document string ternaries (+ style-value expressions) + if-reassignment | queued |

Cross-cutting constraint: every new method needs an annotated
counterpart or an explicit entry in annotated.ts:1836's unsupported
list (shipping requirement).

Working order: A → K as listed (bugs → cut-API → ergonomics → docs).
Each item may be re-scoped, deferred, or rejected during collaboration.

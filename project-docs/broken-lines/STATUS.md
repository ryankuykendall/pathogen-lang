# Broken Lines — Series Status

5-post series on stroke geometry (`dash()` / `outline()` / `startAt()`),
run Cutting-Room-style with a live friction log (`FRICTION-LOG.md`) and
in-cycle fixes, closed by a friction wrap-up post.

| Part | Post | Slug | Samples | State |
|------|------|------|---------|-------|
| 1 | Stroke geometry overview | broken-lines-stroke-geometry | post45 (6) | reviewed + revised, awaiting user approval |
| 2 | Sashiko / hitomezashi | broken-lines-sashiko | post46 (5) | reviewed + revised, awaiting user approval |
| 3 | Leathercraft stitch holes | broken-lines-leathercraft | post47 (4) | reviewed + revised, awaiting user approval |
| 4 | Stencil bridges | broken-lines-stencils | post48 (5) | reviewed + revised, awaiting user approval |
| 5 | Friction wrap-up | broken-lines-what-it-taught | post49 (1) | reviewed + revised, awaiting user approval |

## Log

- **2026-09-01** — Cycle started. Workstream 1 (deferred v1 items) landed
  first: `dash-seam: merge` (closed-path seam-crossing dash pieces),
  `outline-overlap: union` (self-union cleanup), dasharray arithmetic-gotcha
  docs note, completion entries for both new properties. Full suite green
  (5128 tests). Series scaffolding created.
- **2026-09-01 (cont.)** — All five posts drafted; 20 samples compiled,
  formatter-clean, validate-samples 0 warnings across all dirs; BBWPs
  compiled for every sample (index updated). Friction log ran live:
  5 entries. **Two fixes landed mid-series**: expression-bodied lambdas
  (grammar + ast-builder + formatter; log #3) and the holed-subtrahend
  difference() bug (splitCmdsIntoSubpaths m-boundary; log #4). Samples
  upgraded in place to the lambda sugar. Full suite 5137 green after
  both. Entries #1 (style-value interpolation), #2 (stdlib-after-M
  diagnostic), #5 (offset-parameterized dash) deferred with diagnoses.
  (The comma-vs-arithmetic dash-array rule is a Workstream-1 docs note,
  not a log entry — part 5's tally credits it separately.)
  Agentic reviews dispatched.
- **2026-09-01 (review round)** — All five 4-persona reviews returned;
  syntheses saved under `reviews/`. Every must-fix and nearly every
  should-improve applied: part 1 (cap-extension invariant named + two
  figures retuned, percent-phase startAt march with start dots, color
  semantics), part 2 (two-sided stitch redesign, hash01 anchor, honest
  print math at 138 × 90 mm, contrast, sew fence, mending origin),
  part 3 (wallet rebuilt at 4 units/mm with derived stitch line +
  ISO-card sizing, endMargin safe-margin gotcha, saddle-stitch
  mechanism, uniform filter idiom), part 4 (example ladder split with
  new 02-dash-the-ring sample, leader annotations, causality panel,
  concentric-offset correction, laser-layer detail), part 5 (five-entry
  tally fix here AND in the post, prerequisites, distinct before/after
  fences, drift reconstruction marker, CTA). All 21 samples validate
  clean; blog + docs rebuilt; BBWPs recompiled. Deferred review items
  recorded per-synthesis. Awaiting user checkpoint before commits.
- **2026-09-01 (post-review rulings)** — Two user corrections after the
  review round: (1) the legacy `// viewBox="..."` comment convention is
  dropped — stripped from all 88 samples carrying it, prescribing docs
  corrected (blog CLAUDE.md, website CLAUDE.md), memory saved; (2) an
  inline lambda literal after `<<` is now a COMPILE ERROR by design
  (friction log #6, resolved same day) — `<<` applies workers defined
  elsewhere; inline callbacks use the trailing block. Both evaluators
  guard it, docs + tests updated, all series samples/posts converted to
  `filter {|piece| ...}`. Part 5 tally now six entries / three fixed.
- **2026-09-01 (highlighting fix)** — Friction log #7 (user report):
  Pathogen highlighted as JavaScript in blog fences (hljs) and
  mini-workspace (lang-javascript), splitting/mis-coloring dashed style
  properties. Both now use the real Lezer highlighter: highlightPathogen
  walks the editorParser (structured style-block tokens, new `pr` class →
  theme.css --code-pr + code-print-palette + github-theme CSS append in
  build-blog/build-docs); mini-workspace wraps PathogenLang.editorParser
  with /dist/highlight.global.js fallback. Screenshot-verified on both
  surfaces; suite 5,139 green. Part 5 tally: seven entries / four fixed.

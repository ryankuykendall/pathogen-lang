# The Cutting Room — 4-part tutorial series — Status

**Started 2026-08-23.** Plan: `plan-v1-approved.md` (user-approved:
new 4-part series, one-project-laddered posts, all four domains).

## Series

| Part | Slug | Domain | Samples | State |
|---|---|---|---|---|
| 1 | cutting-room-papercraft | Flat-pack papercraft | post41 | reviewed, ready |
| 2 | cutting-room-jigsaw | Jigsaw puzzle | post42 | reviewed, ready |
| 3 | cutting-room-garment | Garment pattern | post43 | reviewed, ready |
| 4 | cutting-room-stained-glass | Stained glass | post44 | reviewed, ready |

Format: Stdlib Primers template + Prerequisites callout. Not committed
until user review. Cross-cutting fix: pathblock-cutting.md:27/:125 stale
"labels don't survive" claims.

## Idioms verified against the evaluator (index.ts)

- Stroke a seam in place: `let s0 = seam.get(0); seam.drawTo(s0.x, s0.y);`
  (ProjectedPath has drawTo/get/tangent/normal/partition — no in-place
  draw(); get(0) recovers the absolute start).
- Dot a seam: `for (op in seam.partition(n)) circle(op.point...)`.
- Queries need the projected form: `p.project(x, y).segmentAll('cut')`.
- Identify pieces by kept labels: `p.segmentAll('top').length`.
- Known trap to test around: text-if inside loop bodies has a pre-existing
  discard bug (loop-control memory) — prefer unconditional text with
  interpolated content.

## Log

- 2026-08-26/27 (feedback loop, F2 + B2 + #18 LANDED — one combined
  cycle per user; L deferred until the revised blog posts are
  completed and pushed): (#18) PathArgs tokenizer consumes
  ? : < > = ! & | inside calc() parens — ternaries/comparisons work in
  path-argument position; top-level still breaks; 6 tests + docs line.
  (F2) label-name validation parity — pure labelNameError core moved
  to segments.ts (shared), annotated validates at both PathCommand
  sites (type/charset/reserved-cut/at-most-one) while labels stay
  emit-neutral; 9 parity tests. (B2) truthful startPoint = first
  inked point (user chose ONE COHERENT RULE): firstInkedPointOf in
  segments.ts; applied at both funnels (buildPathBlockFromCommands /
  buildProjectedPathFromCommands), @{} literals, and all
  recordsFromCommands construction sites in BOTH evaluators (identity
  for self-rebasing results); endPoint copy-paste ride-along fixed
  both evaluators; annotated bugs 2-3 logged as friction #19 (user
  decision). CONTRACT CHANGE, documented: drawTo(x,y) anchors the
  INKED start at the target (the garment footgun fixed at the root —
  its old misplacing line now draws correctly); `M x y` + draw() still
  seats the pen. Docs: property table, drawTo contract rewrite +
  pen-vs-ink distinction, types.ts day-one comment; 5 new B2 tests,
  1 contract-pin updated (rigidity now float-tolerant, anchor pinned),
  6 stale "always (0,0)" test names corrected; garment epilogue +
  papercraft entry updated. Suite 5022/5022. REVIEW-CRITICAL fix applied pre-commit: the first sweep missed the ProjectedPathValue transform family (offset/mirror/rotate/rotateAtVertexIndex/scale) and BOTH segment builders — 12 sites, reviewer-reproduced broken invariant (layer segment startPoint = pre-call cursor; chained transforms all broken); fixed with the same helper + 8 regression tests (invariant startPoint==get(0) through every chain); 43-sample zero-drift re-verified.

- 2026-08-26 (feedback loop, Item J LANDED — pending review + commit):
  Postfix-flattening class fixed (docs-first, failing-tests-first;
  user approved all-five + array-showcase + post40-in-sweep). The
  class grew to SIX sites during implementation: layer-apply target,
  buildForStatement range bounds, text-body range twin, layer-def
  name, LayerConstructor expression form (found by the failing
  matrix), ViewBox args — all one swap to buildExpressionWithPostfix.
  TWO cursor-discipline traps found by tests: (a) the walker rests ON
  RangeOp after a start bound → phase 2 never fired → end silently
  defaulted to 0 (and a first-draft test PASSED coincidentally via
  descending 2..0 = 3 iterations — fixture made count-distinguishing);
  (b) paren-less `variable.apply {}` — walker swallowed `.apply` as
  member access AND rested on Block (18 suite regressions caught it;
  unwrap + immediate Block grab; dedicated regression pin added).
  13-test coverage matrix (forms × sites). Docs: layers.md dynamic-
  names section expanded (round-robin example), syntax.md range-bounds
  note (with inclusive-range array-index warning), viewbox.md arg
  forms. Samples: if-chains deleted from post42/05 (array-of-layers
  showcase, byte-identical), post44/03 (template form,
  byte-identical), post40 shattered-glyph (template form, float-tail-
  only diff, render verified); jigsaw closing entry. Friction #9
  resolved. Suite 4984/4984.

- 2026-08-25 (feedback loop, Item I LANDED — pending review + commit):
  Reserved suffixes + shadowing diagnostics (docs-first,
  failing-tests-first, planned with G in plan mode). (#5) pi/deg/rad
  reserved: binding blocked at the setVariable funnel in BOTH
  evaluators (shared src/evaluator/reserved-names.ts — cannot drift);
  standalone reference errors at the 6 Identifier sites (NOT
  lookupVariable — deg(x)/rad(x) calls untouched); 36-case binding
  matrix + reference/annotated/legal-position pins incl. Angle members
  .pi/.deg/.rad. Own test templates hit the #4 trap (`h a` — a is the
  arc letter), proving the point. (#4) shadowing rescue: shared
  describeCommandShadowing in parser/index.ts wired into parse() (CLI)
  and describeError (editor); TWO tree shapes (following-command
  `L m 40`, own-command `L 5 V` — second found by the uppercase test);
  fires only when the letter is a declared VariableName (tree walk, no
  analyzeScopes plumbing); wrap-in-calc() quick fix replaces the
  previously WRONG add-semicolon fix; hover shows the variable at
  declaration sites and inside calc() (opaque PathArgs needed a paren
  scan), command hover pinned for real commands. syntax.md variables
  note corrected (single letters CAN be declared; bare path-arg
  position is the restriction). Suite 4969/4969.
- 2026-08-25 (feedback loop, Item G LANDED — pending review + commit):
  Query pseudo-selectors (docs-first, failing-tests-first; user chose
  the full family over :each-only in plan mode). parseSegmentQuery /
  queryLabeledRuns / pseudoRangeError / rejectPseudoOnNonSegmentQuery
  in segments.ts wrap the untouched findLabeledRuns; three dispatch
  sites migrated (layer/PathBlock/ProjectedPath) with unknown-label vs
  nth-range error split; point/vertex queries reject ':' names.
  Design point found while testing: :each yields DRAWING commands only
  (a labeled stdlib call includes its leading M — a move-only block
  carries no geometry). 8 new tests + cut-composition case. Honest
  framing preserved: no live series consumer (F dissolved the driver);
  papercraft closing entry tells that story; stained-glass gains the
  cut.rim:each sentence. Friction #8 resolved. Suite 4926/4926.

- 2026-08-25 (feedback loop, Item F LANDED — pending review + commit):
  Cutter label propagation (docs-first, failing-tests-first). A knife
  edge `as segment('valley')` heals into seams sub-labeled
  'cut.valley' (stampCutSeam carries the authored label; already-
  namespaced 'cut.x' passes through un-prefixed; bridges/cookies/
  unlabeled edges stay plain 'cut'). Umbrella query 'cut' matches the
  whole namespace merged (single predicate in findLabeledRuns);
  sub-label queries exact — the unmerged escape hatch (friction #8
  partial). NEW label-name validation at the evaluatePathAnnotations
  choke point: identifier-shaped names only, bare 'cut' reserved with
  opt-in `cut.<name>` (user decision after sweep found the published
  rim-join idiom), '.' chosen as delimiter with ':' deliberately kept
  free for future pseudo-selectors (user design discussion). ~50 new
  tests incl. punctuation coverage matrix. Docs: label-names section +
  seam-namespace contract in segment-labels.md + path-blocks.md; api
  docstrings + completions regenerated. Series: post41/02 rewritten as
  real mountain/valley accordion (labeled knives, routed dashes);
  post41/06 merged-V subPath surgery replaced by per-knife queries
  (float-tail-only diff + degenerate l 0 0 prefixes gone); post44/02
  migrated to 'cut.rim' opt-in (came geometry byte-identical — the
  umbrella-compat proof); closing entries in papercraft + stained
  glass; friction #7 resolved, #8 partial. Suite 4915/4915.
- 2026-08-23: plan approved; post41 sample authoring begun.
- 2026-08-23 (cont.): ALL FOUR POSTS DRAFTED + 21 samples compiled,
  validated, BBWP'd (post41: 6, post42: 5, post43: 5, post44: 5).
  Sample warnings at zero except two documented intentional/false-
  positive sets (post41/06 numbers-on-pieces, post43/05 caption bbox).
  pathblock-cutting.md stale label claims corrected (lines ~27/~125)
  + rotateAtVertexIndex workaround note now points at rotate().
  build:blog green; blog index groups the series; static pages +
  samples copied into public/ for the running dev server.
  In flight: content reviews (part 1 agent; parts 2-4 agent),
  check-links crawl.
- Bug found + preserved: offset() direction flip on curved edges of
  cut pieces — repro-offset-direction-bug.pathogen; garment post
  states the caveat, pattern sheet skips the yoke allowance.
  Running improvement log: FEATURE-OPPORTUNITIES.md (12 entries).
- Part 1 review round complete (4-persona agent): 4 MUST-FIX, 7
  SHOULD-FIX, 11 CONSIDER — all MUST/SHOULD applied + most CONSIDERs:
  sample 01 pieces nudged apart (both seams visible), sub-query
  rebase bullet corrected, centroid→bounding-box center sweep (posts
  + samples, parts 1-2), kit ghost demoted (#1e293b 1-5 dash), merge
  rule stated as command adjacency, prereqs + parametric sampling,
  Ex6 code-open, exploded drift 34, normal-direction explanation
  (left-hand normal + opposite traversal), 04 label-driven placement
  + color-keyed counts, printable promise dropped, wedge numbers
  derived from atan2 (order-independent), hoists + boundingBox-derived
  centers per §8, teaser fence literals, open-subject caveat.
  ADOPTED series-wide: `seam.drawTo(seam.startPoint.x, .y)` replaces
  the get(0) two-liner as the canonical idiom (reviewer CONSIDER #12;
  startPoint/endPoint property access verified in-language) — swept
  all 21 samples + both idiom fences. Deliberately skipped: #17 full
  composition re-layout (PM: polish), #19 design-system deviation
  (consistency with post40 chosen), #22 cosmetic l 0 0.
  All samples recompiled + revalidated (remaining warnings: 06's 18
  intentional numbers-on-pieces only). BBWPs refreshed for changed
  visuals; blog rebuilt + synced to public/.
- Parts 2-4 review round complete (second 4-persona agent). Blockers
  found + fixed: (a) my startPoint sweep had broken whole-piece draws
  in post43/03+05 (frame-origin vs first-command anchor — annotations
  63 units off; reverted those two panels to `M px py; p.draw()`;
  footgun logged as FEATURE-OPPORTUNITIES #12); (b) post43/05 isYoke
  magic number → neck-label query (also 02/04 layouts); (c) my
  stained-glass circle()-can't-take-as claim was FALSE (my probe had
  used double-quoted strings) — claim corrected, samples 44/02+05
  simplified to `circle(...) as segment(...)`; (d) nub knife
  re-authored into a true bulb+neck; (e) 44/04 knife moved so the
  upper half's sill reads as a stretch, legends precise, h→half;
  plus: 42/01 ghost plate under the knife (overshoot visible), 42/03
  teal inherited-rim strokes (mechanism visible), 43/01 'front' label
  on the fold z-edge (6-color legend), 43/02 caption leader lines,
  43/05 grainline min-length clamp, hashRange linked, notch-fraction
  comment, cross-post: all four finales code-open, part-1's
  description of part 2 corrected. All samples recompiled, validated
  0 warnings (except the two documented false-positive sets), BBWPs
  + blog + public re-synced. Final check-links crawl green (42 pages /
  1228 links / 0 broken).
- 2026-08-25 (Item E COMMITTED 17b09a5 + pushed): review verdict
  approve-with-followup — claim verified TRUE on both code paths
  (60/60 + 60/60 empirical isPointInFill), byte-identity confirmed
  both directions; findings applied pre-commit: 2 boolean-side
  pinning tests added (union boundary 10/10 outward; difference
  outer + hole rings, 20 samples classified by radius) closing the
  zero-coverage gap on the structurally separate boolean winding
  path, and docs reworded to "each canonicalize" (no shared-
  subroutine implication). Suite 4866/4866; final check-links green
  (42 pages / 1236 links / 0 broken).
- 2026-08-25 (feedback loop, Item E LANDED):
  Outward-seam-normal guarantee documented (normal(t) section: contract
  + hole footnote + hand-authored caveat; cut-section cross-ref) and
  PINNED by 2 tests (curved-cut both pieces 10/10, holed ring 5/5 into
  the hole). Flip dance deleted from 41/03+06 — compiled SVGs
  byte-identical (dead-code proof); 41/03 dropped unused center lets.
  Fresh session probes pre-verified 34/34 outward before any edit.
  outwardNormal alias rejected by design. Papercraft closing entry.
  Suite 4864/4864. Focused review round in flight (docs-claim accuracy
  incl. the boolean-results claim).
- 2026-08-24 (feedback loop, Item D LANDED — pending review + commit):
  pieces.seams() (docs-first, failing-tests-first, planned in plan
  mode): seamId stamped at cut time (twin halves share one id; cookies
  one id both windings; bridges fresh ids); passthroughs at the four
  verified meta-reconstruction sites (normalizeMeta, derivedMeta,
  split-fragment builder, shiftRingEndVertices); 'seams' array method
  in both evaluators (first-side-wins ownership); PathogenArray api +
  completions; docs section + anchor verified. 8 new tests incl. the
  hex merged-V case and a drawn-output equivalence proof vs the old
  ownership rule. Suite 4858/4858; build green. Fold-lines sample
  rewritten (render identical, one fold direction flipped); papercraft
  closing entry + stained-glass per-piece note. Log #2 resolved.
- 2026-08-24 (feedback loop, Item C LANDED — pending commit after H):
  Annotated-divergence pair fixed: (#10) recursive text-block walker —
  text inside if/for bodies reaches the elements accumulator (main was
  always correct; post41/04's counts design stays, it was never a real
  workaround); (#16) annotated stdlib calls now track PathSegment
  commands into the path context (index.ts parity) — stdlib-call
  blocks draw/cut/boolean under --annotated. 4 parity tests; suite
  4849/4849 with zero existing annotated tests disturbed. No sample or
  post changes required. Memory corrected (text-if bug fixed).
- 2026-08-24 (feedback loop, Item H LANDED — pending review + commit):
  cut() array cutters (docs-first, failing-tests-first): single
  resolveCutterCommands helper at both receiver sites; flat concat is
  safe because chains split on coordinate discontinuity downstream.
  6 new tests (array==combined byte equality, loop-built spokes+ring,
  mixed elements, projected receiver, error paths). Six knife samples
  rewritten as loop-built arrays — SVG diffs float-tail-only (knife
  ordering), renders verified identical; closing entries in papercraft,
  jigsaw, stained glass; api+completions; docs anchor
  path-blocks-cutcutter-array-of-pathblock verified. Suite 4845/4845;
  build green. Item L (ctx block argument, user design) recorded as
  fast-follow; block-local absolute M dropped as superseded. Log #6
  resolved.
- 2026-08-24 (feedback loop, Item B LANDED — pending review + commit):
  ProjectedPath.draw() (docs-first, failing-tests-first): in-place draw
  anchored on first command; in-block guard extended; annotated parity;
  api + completions; drawTo contract documented incl. the footgun. 7 new
  tests + 2 completion-surface assertions flipped (old "no draw on
  ProjectedPath" pins). Suite 4833/4833. Series: idiom swept across all
  21 samples (seam-idiom output byte-identical; 43/03+05 panels
  converted to placed.draw(), renders verified identical), both idiom
  fences updated, closing sections in all four posts (papercraft full
  story, garment footgun chapter, jigsaw + stained-glass pointers).
  Log #1 resolved, #12 resolved-by-bypass, B2 queued (startPoint audit
  revival, preserved in B-projected-draw/). User process feedback
  captured: summaries lead with side-by-side before/after (memory +
  retrofit); Item H reframed as in-block re-orientation per user
  diagnosis (H folder seeded).
- 2026-08-24 (feedback loop, Item A LANDED — pending review + commit):
  offsetCommands rewritten (docs-first, failing-tests-first). Root cause
  per summary-v2: miter spikes baked into curve frames + non-parallel
  curve offsetting + broken closure join — NOT the logged direction
  flip. New: per-segment normals, between-segment joins (miter ≤2d for
  line-line, bevel default, `offset(d, {join:'round'})` arcs),
  adaptive Tiller–Hanson parallel curves, label-carrying connectors,
  closure joins (rect offset finally symmetric). Options threaded
  through both evaluators; api + completions regenerated; 10 new tests;
  suite 4818/4818; npm run build green. Series: yoke allowance restored
  in post43/05, garment caveat → pointer, first "What this project
  taught the language" section written, part 1 friction-log framing
  added, docs offset anchor updated (…-options-…) in garment links.
  New friction entry #14: log()/ln collision on bare numeric calls.
  Naming sweep (user feedback) landed earlier as 10c2577 + guideline
  §6 rule + memory.
- 2026-08-23 (formatting round, user-requested): all 21 samples run
  through `format:samples` (formatDocument) — user screenshot showed
  one-line style blocks soft-wrapping badly in the mini-workspace
  panel. Verified formatting is purely cosmetic: all 21 recompiled
  SVGs byte-identical to pre-format baseline. Made formatting a
  REQUIRED step: new `npm run format:samples` script entry,
  validate-samples check #6 flags unformatted sources (verified: flags
  a deliberately unformatted file, silent on all 21 formatted ones),
  documented in website/blog/CLAUDE.md (step 1.5 + checklist + §3.5),
  saved as feedback memory. All 21 BBWPs regenerated (code panels show
  formatted source); blog rebuilt + public re-synced. Warning totals
  unchanged (18 intentional + 2 false-positive).

- 2026-08-26 (Item G naming follow-up, user review): `:each` renamed
  `:atomic` (user suggestion — compound/atomic vocabulary; ":each" was
  ambiguous since segmentAll already returns each run). Position trio
  kept deliberately after an array-duplication audit (:first/:nth are
  indexing duplicates, :last near-duplicate) — "anchoring the pseudo
  selector feature set". Audit + decision + verified comprehension
  probes in G-unmerged-runs/use-case-and-duplication-audit.md.

- 2026-08-26 (feedback loop, Items K + #17 LANDED — pending review +
  commit, run as one small cycle per user): (K/#13) ternaries
  documented — operators-table row + new "Conditional (Ternary)
  Expressions" section (value/string/interpolation/style-value forms,
  every fence compile-verified) + if-reassignment alternative +
  interpolation and style-value cross-mentions; garment closing entry
  ("a feature you can only learn from someone else's sample isn't
  finished"). (#17) both postfix walkers' bracket interiors now build
  postfix-aware with the ']'-rest discipline (interior chains rest ON
  ']' — skip only when stopped short); 6 tests: member/call/nested-
  index interiors, post-bracket chaining, statement position, plain-
  index regression pin. Suite 4993/4993; anchor
  syntax-conditional-ternary-expressions verified.

- 2026-08-28 (post-loop agentic review round — 4-persona, user-
  requested after the 'footgun' critique): footgun swept series-wide
  first (4 uses → trap/hazard/plain description; docs instance too;
  saved as memory with the broader tic-class findings). Review
  verdict: good shape, two blockers. ALL MUST-FIX applied: (1) if-
  chain remediation FINISHED — 42/05 lid loop + 44/05 finale routed
  (finale also adopts cut.rim, dropping its second came loop — amber
  deliberately reserved for the medallion, noted in prose), jigsaw
  antecedent + stained-glass bullets updated to match; (2) papercraft
  closing restructured 7→6 entries — the duplicated seams() waypoint
  merged into one "Example 2 grew up twice" entry, ordered by example;
  (3) merge-rule contradiction resolved (setup no longer over-
  promises; Ex6 body names :atomic, retires subPath spelling);
  (4) fold-legend mis-association fixed (valley caption now under the
  valley crease) + mountain-fold and ghost contrast raised.
  SHOULD-FIX applied: cut.<name> two-directions symmetry note in part
  4 Ex2; [w,i]→[wedge,i]; dup comment removed; tic pass ("And"
  openers ×3, earning metaphor ×3→1, bookkeeping ×8→2, sentence-frame
  dupe varied, winding + bevel jargon translated, framing aligned);
  caption dashes standardized. CONSIDER applied: 19 (hazard-fixed
  hedge in part 4 closing). Deliberately skipped (polish/pre-existing,
  consistent with prior rounds): 14-18 visual redesigns, 20 (44/02
  two-stroke knife), 22 lattice feel, 23 grayscale legend; em-dash
  density addressed where clustered only (retroactive stripping of
  correct single asides would harm the prose — recorded in memory as
  a write-time guideline). All changed samples recompiled + validated
  (18 intentional warnings only), 6 BBWPs refreshed, blog rebuilt +
  synced.

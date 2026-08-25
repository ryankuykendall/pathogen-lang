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

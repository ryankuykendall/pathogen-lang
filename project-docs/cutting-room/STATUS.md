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

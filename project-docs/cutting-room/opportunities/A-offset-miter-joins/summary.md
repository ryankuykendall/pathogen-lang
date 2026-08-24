# Item A (log #11): offset() corrupts curves at sharp corners — root cause

**Status:** rich summary, delivered 2026-08-23 for user review. No code
changed yet.

## The friction, as experienced

Building the garment post (part 3), Example 3 needed the sewing world's
most basic operation: a seam allowance — `piece.offset(7)` around the cut
bodice pieces. The body panel offset cleanly. The yoke's allowance came
out self-crossing: its neck curve swung down *through* the piece while
its straight edges moved outward correctly. We shipped the post with a
blunt caveat and no allowance on the yoke. Repro preserved:
`repro-offset-direction-bug.pathogen` (offsetting the yoke should grow
its bbox ~14 in each axis; instead height shrinks).

## Root cause (traced numerically, not hypothesized)

The original log entry guessed "direction flip on curved edges." That is
wrong — the per-segment normals are computed correctly. The defect is in
the **miter join**, and in **how a bad join deforms curve segments**.

`offsetCommands` (src/evaluator/path-transforms.ts:399) works in three
steps: per-segment left-hand normals → `computeMiterJoin` at each
junction (:730) → rebuild commands with the join vector as each
segment's `actualStartOffset`.

The yoke's contour begins `l 0 -31.86` (the fold edge, traveling up)
followed by the neck curve `c 16 18 34 20 46 6` (traveling right-down).
That corner turns ~48°, and the miter intersection for a corner that
sharp is a classic miter spike:

- fold endOffset = (−7, 0); neck startOffset ≈ (+5.23, −4.65) — both
  correctly OUTWARD
- computeMiterJoin: cross = 0.664, t = 18.4 →
  **miter = (−7, −18.4), length 19.7** — under the 4×distance limit
  (28), so it is accepted

For a line, a long miter just makes a pointy corner. But for a curve,
the rebuild bakes `actualStartOffset` into the segment's coordinate
frame while CP1 keeps its authored direction (:637-655): the curve's
drawn shape morphs by `(endOffset − actualStartOffset)` — here
(+1.7, +13.9), which is exactly the observed downward warp of the neck.
The join error doesn't stay at the corner; it deforms the whole
neighboring curve.

**Why the uncut bodice offsets fine:** its neck is the FIRST segment
(the fold is the implicit `z`), so no previous segment exists, no miter
fires, and the neck uses its own clean normals. The cut piece's
canonicalized contour puts an explicit fold line *before* the neck —
that ordering, not the cut itself, is the trigger. Any authored shape
with a sharp corner entering a curve hits the same defect.

## Generalized class (not just this yoke)

1. Sharp corners (interior angle ≲ 60°) produce miters up to 4× the
   offset distance that are accepted and applied.
2. When either adjoining segment is a curve, the join vector is folded
   into the curve's arg frame, warping the segment body instead of
   shaping the corner.
3. The >4× fallback (average of the two offsets) lands INSIDE the
   corner for wide turns — also wrong, differently.
4. There is no bevel/round join concept; every junction must share one
   corner point, which is geometrically impossible to do well for
   sharp corners under parallel offset.

## Design options

**Option 1 — connector joins (recommended).** Stop forcing a shared
corner offset. Offset each segment with its own start/end normals
(already computed correctly); where consecutive offset segments don't
meet (prev.newEnd ≠ next.newStart), insert a connector: a short `l`
(bevel) by default. Keep the true miter ONLY when its length is modest
(e.g. ≤ 2×distance) AND both neighbors are lines. Curves are never
deformed by join vectors — CP1/CP2 move by the curve's own normals.
- Pros: fixes the class, not the instance; simple geometry; matches how
  real offset implementations handle joins (miter-limit → bevel).
- Cons: output gains segments at sharp corners (bevel lines); existing
  offset outputs change at corners that previously mitered between 2×
  and 4× — CLI byte-snapshot fixtures and any offset-dependent tests
  need a deliberate update pass.

**Option 2 — round joins (arc connectors).** Same structure as Option 1
but insert an arc centered on the original vertex (true parallel-curve
behavior, like stroke-linejoin: round).
- Pros: the mathematically faithful offset; prettiest allowances.
- Cons: more geometry; arcs in output where users may expect lines;
  bigger diff to existing outputs.

**Option 3 — clamp the miter along the bisector.** Keep the shared-point
model, clamp miter length to k·distance along the angle bisector.
- Pros: smallest code change; no new segments.
- Cons: still deforms curves (the frame-baking bug remains unless also
  fixed); corners visibly cut in at sharp angles; two bugs patched with
  one heuristic.

My recommendation: **Option 1**, with the curve-frame fix as its core
(that part is non-negotiable in any option), bevel connectors as the
default join, and the miter kept for gentle line-line corners so
existing rectangular offsets stay byte-stable. Option 2 can be a later
`offset(d, {join: 'round'})` extension if we want it.

## Test plan

- Coverage-matrix unit tests (new describe in tests/path-blocks.test.ts
  or a dedicated offset section): line→line, line→curve, curve→line,
  curve→curve joins at gentle (~120°), right (90°), and sharp (~45°,
  ~20°) corners; both windings; open and closed contours; positive and
  negative distances. Assert: offset bbox grows by ~2d for outward
  closed offsets, no segment's drawn shape deviates from its authored
  shape beyond d + join allowance (sampled-point checks).
- Regression test from the preserved yoke repro: cut the bodice, offset
  the yoke, assert bbox grows in BOTH axes and the neck's offset stays
  on the outward side (sampled midpoint above the original).
- Byte-guards: rectangle/rounded offsets (gentle corners, line-line
  miters) must remain byte-identical.
- Annotated parity for any evaluator-visible change (none expected —
  offsetCommands is shared).
- CLI byte-snapshot fixtures: review diffs, update deliberately with
  `vitest run --update` per project convention if sharp-corner cases
  appear in fixtures.

## Series payoff once fixed

- Garment post: delete the "one blunt caveat" paragraph, restore the
  yoke allowance in Example 5's pattern sheet (the `isYoke == 0` guard
  goes away), and Example 3 can show BOTH pieces ringed.
- Closing-section entry: the friction (self-crossing allowance), the
  lesson (joins, not normals, were the bug — and curve frames must never
  absorb join vectors), the before/after render.
- FEATURE-OPPORTUNITIES #11 marked resolved; log entry corrected to the
  true root cause (miter joins, not direction flip).

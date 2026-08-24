# Item A (log #11) — summary v2 (supersedes summary.md; v1 preserved)

**Revised 2026-08-23** after the implementation-site report
(../implementation-site-report.md) contradicted the log's headline and
after independent re-verification. Both the original log entry and the
published garment-post caveat mischaracterize the defect.

## What is actually true (all measured, current HEAD)

1. **There is NO direction flip.** Offset direction on cut pieces is
   well-defined and outward everywhere — traversal-derived left normals
   plus cut()'s canonicalized winding ("material on the left",
   boolean-ops.ts:4066) compose correctly, including through hole
   boundaries (cookie-cut plate: 200→210, stamped disc: 40→50). My own
   probe: the yoke's neck midpoint offsets UP (outward), y 54.6 → 41.2.
   The old repro's shrink came from calling `reverse()` first, which
   legitimately flips the traversal the normals follow.
2. **The miter spike is real and lands inside curve frames.** The yoke's
   fold→neck corner (~48°) produces a 19.7-unit miter at distance 7
   (under the 4× clamp at path-transforms.ts:762-769, so accepted); the
   rebuild bakes it into the neck cubic's arg frame asymmetrically (CP1
   gets the miter, CP2 the raw end normal — :635-651), warping the curve
   body. Measured: yoke bbox grows +18.3/+25.7 for distance 7 where
   +14/+14 is expected; the entire top-edge excursion (18.4) is the
   traced miter's y-component.
3. **Curve offsetting is endpoint-translation, not a parallel curve.**
   Control points are translated with no curvature-aware scaling, so a
   strongly bowed cubic's midsection sits at roughly the original
   radius while its endpoints move by `distance`. Mild for gentle
   curves; visible on deep scoops.
4. **The >4× fallback averages the two offsets** (:764-768), which
   under-corrects wide corners — a third, milder defect in the same
   join code.
5. Labels DO survive offset generically (:719-720) — that part of the
   pipeline is healthy, as the garment post already demonstrates.

## Publications to correct when this lands

- garment post caveat says offset "can send a curve's offset to the
  wrong side" — wrong side is false; spiked-and-distorted is true. The
  caveat paragraph is deleted entirely once the fix ships (or reworded
  immediately if Item A is deferred).
- FEATURE-OPPORTUNITIES #11 headline corrected to joins/curve-frame
  distortion.

## Design options (revised)

**Option 1 — joins-only fix (recommended first step).** Never bake join
vectors into curve arg frames: curves offset by their own start/end
normals; where consecutive offset segments no longer meet, insert a
bevel connector (`l`). Keep the true miter only for line-line corners
with modest miter length (≤ ~2×distance) so rectangular offsets stay
byte-stable. Kills the spike; the yoke allowance becomes visually
correct; deep-curve midsection error (defect 3) remains but is
secondary.

**Option 2 — Option 1 + curvature-aware curve offset.** Additionally
subdivide cubics/quadratics and re-fit true parallel curves (sampled
normal displacement). Full quality; larger geometry lift; more output
churn; harder byte-guards.

**Option 3 — `offset(d, {join: 'round'})` follow-up.** Arc connectors as
an opt-in on top of Option 1's structure, later.

Recommendation: **Option 1 now**, measure the yoke allowance visually,
and only escalate to Option 2 (as its own follow-up item) if deep-scoop
allowances still read wrong in the garment renders. Option 3 parked.

## Test plan (unchanged from v1, plus)

- Coverage matrix: join types (line-line, line-curve, curve-line,
  curve-curve) × corner angles (~120°, 90°, ~45°, ~20°) × windings ×
  open/closed × ±distance. Home: tests/path-blocks.test.ts describe
  ('offset()') at :1151.
- Yoke regression: bbox grows ~2d in BOTH axes within tolerance
  (+14 ±2 for d=7), neck midpoint offsets outward.
- Byte-guards: existing gentle-corner offsets (rectangles) unchanged.
- CLI byte-snapshot fixtures reviewed; deliberate --update only where
  sharp corners appear.
- Docs: offset() section (docs/path-blocks.md:365) gains the join
  contract; no API surface change → no completions regen.

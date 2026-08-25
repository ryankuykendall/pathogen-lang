# Item E (log #3): normal(t) is already material-outward on cut seams — rich summary

**Delivered 2026-08-25 for user review.** No code changed yet. This is a
†-re-scoped item: the implementation-site report showed the logged
feature already exists structurally; the work is a documented guarantee,
a docs claim, and deleting our own workaround from two samples.

## Before / after

The glue-tab direction logic (post41/03, and its sibling in 41/06):

```pathogen
// BEFORE — the flip dance: compare the normal against the direction to
// the piece's own center, flip by PI() if it points inward
let n = seam.normal(calc((t0 + t1) / 2));
let toCenter = calc(cos(n.angle) * (cx - n.point.x) + sin(n.angle) * (cy - n.point.y));
let outwardAngle = calc(toCenter > 0 ? n.angle + PI() : n.angle);
```

```pathogen
// AFTER — the normal already points away from the piece's material
let outwardAngle = seam.normal(calc((t0 + t1) / 2)).angle;
```

| | Before | After |
|---|---|---|
| Outward direction on a cut seam | derived per tab via dot-product-against-center + conditional flip | `normal(t).angle`, by documented guarantee |
| Lines of ceremony per tab site | 3 (probe + dot product + ternary flip) | 0 |
| The guarantee's status | unstated; log #3 assumed it didn't exist | stated in docs with the mechanism (cut's winding canonicalization) |
| Piece-center computation (`cx`/`cy`) in 41/03 | needed only for the flip | deleted along with it |

## What was verified (not assumed)

- The implementation-site report measured it on squares, cookie cutters,
  and holes: `normal(t)` on a cut seam points away from the piece's own
  material on **both** sides of every seam, including hole boundaries —
  and the same rotation drives `offset()`, so `offset(+d)` growing
  pieces outward is the same fact.
- Structural, not luck: cut() canonicalizes ring winding so material
  lies on a fixed side of every directed boundary edge
  (boolean-ops.ts winding canonicalization, "the invariant the face
  walk depends on"), and `normal(t)` is a fixed rotation of the travel
  tangent — so the material side of the normal is pinned by
  construction.
- Fresh probes on the two deletion targets, this session: the flip
  branch never fires — glue-tabs geometry 10/10 sampled normals
  outward, hex-medallion V-runs 24/24. The flip is dead code in both.

## Proposed work

1. **Docs — the guarantee** (docs/path-blocks.md `### normal(t)`, plus
   a cross-ref in the Cutting section): on seams and boundary edges of
   `cut()` results (and boolean-op results — same canonicalization),
   `normal(t)` points away from the piece's material. State it as a
   contract, with one careful sentence on what it means for holes (the
   hole boundary's "outward" is into the hole). NOTE: the docs must
   define the general rule for hand-authored paths too — there the
   normal is simply the fixed left-of-travel rotation and which side is
   "outside" depends on your winding; the guarantee is specifically a
   product of cut's canonicalization.
2. **A pinning test** (tests/path-cut.test.ts): sampled normals on both
   pieces of a curved cut + a holed piece all satisfy
   `toCenter/toMaterial < 0` — locking the invariant so a future
   winding change can't silently break it (today nothing tests it; the
   guarantee is real but unpinned).
3. **Delete the flip dance** from post41/03 and post41/06 (byte-check:
   outputs must be identical since the flip never fired — the strongest
   possible proof the code was dead); 41/03 also loses its now-unused
   piece-center lets.
4. **Closing-section entry** (papercraft): the friction-log lesson in
   its purest form — the feature we wanted existed all along,
   undocumented; three lines of ceremony per tab existed only because
   the contract was unstated. Before/after fence.
5. Bookkeeping: log #3 resolved, tracker, CHANGELOG (docs+samples-only
   entry), STATUS.

## Explicitly out of scope

No new API. An `outwardNormal(t)` alias was considered and dropped: it
would imply `normal(t)` is NOT outward, muddying the very contract this
item exists to state. If hand-authored-path ergonomics ever demand a
winding-aware normal, that's a separate proposal.

## Payoff

Cheapest item in the queue (docs + one test + two sample
simplifications), and the sharpest possible closing-section story: the
fix is a sentence, and the sentence was the feature.

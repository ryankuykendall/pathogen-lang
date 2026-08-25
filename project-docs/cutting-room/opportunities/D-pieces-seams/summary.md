# Item D (log #2): pieces.seams() — rich summary

**Delivered 2026-08-24 for user review.** No code changed yet.

## Before / after

The fold-lines sample (post41/02) — dashed folds on an accordion card,
where naive per-piece stroking draws every interior seam twice and the
opposite-direction dashes fill each other's gaps:

```pathogen
// BEFORE — every panel dedupes by an ownership rule: stroke only the
// seams on your own right-hand side (post41/02 today, ~10 lines)
for (panel in panels) {
  let placed = panel.project(originX, originY);
  let bounds = placed.boundingBox();
  let panelCenterX = calc(bounds.x + bounds.width / 2);
  foldLayer.apply {
    for (seam in placed.segmentAll('cut')) {
      let mid = seam.get(0.5);
      if (mid.x > panelCenterX) {
        seam.draw();
      }
    }
  }
}
```

```pathogen
// AFTER — the cut result answers for its physical seams, each exactly
// once; no ownership rule, no double-draw possible
for (seam in panels.seams()) {
  foldLayer.apply {
    seam.project(originX, originY).draw();
  }
}
```

| | Before | After |
|---|---|---|
| Physical seam drawn | twice (once per adjacent piece) unless hand-deduped | once, by contract |
| Dedupe logic | ad-hoc geometric ownership rules per sample | none |
| Dashed seams | opposite-phase double-draw fills the gaps (visible bug class) | correct by construction |
| Coordinate frame | per-piece projected queries | seams keep **subject-local placement**, same convention as the pieces themselves — `M x y seam.draw()` or `seam.project(x, y).draw()` |

## The friction, as experienced

Every interior cut line exists twice — once in each adjacent piece — so
per-piece seam decoration double-draws it. Solid strokes hide this;
dashed strokes advertise it (two passes running opposite directions fill
each other's gaps — caught visually in the fold-lines sample). Both
affected samples ship ad-hoc dedupe: post41/02's right-hand-side
ownership rule, and the came layers in part 4 simply accept the
invisible solid-stroke double-draw.

## Design

**The pairing problem is the whole design.** Twin seam halves are
explicit at creation — both half-edges of a cutter fragment are stamped
from the same snapped-cutter entry (boolean-ops.ts:4770-4776) — but
that identity is discarded; pieces come back with only
`{segmentLabel: 'cut'}` per command. Re-deriving pairs geometrically at
query time is treacherous: run merging means piece A's V-shaped merged
run can span two physical seams whose twins live in two *different*
pieces, so run-level geometric matching fails exactly where the
medallion lives.

**Recommendation: thread a `seamId` through the stamp.** A counter in
`stampCutSeam`'s call sites gives both twin half-edges (and both cookie
winding copies) the same physical-seam id in command meta; face-walk
bridging `l`s get fresh ids (they are one-sided). Then:

- `pieces.seams()` — a new array method (array-method fallthrough,
  index.ts:5327 region) — collects every element's `seamId`-carrying
  commands, groups by id, keeps ONE side per id (first encountered;
  orientation documented as unspecified), and returns each physical
  seam as a PathBlock with subject-local placement — the same frame
  convention the pieces themselves use.
- Ripple containment: `seamId` lives in `PathCommandMeta` and rides
  every existing whole-meta spread automatically; `derivedMeta`
  deliberately drops it (seams() is defined on fresh cut results —
  documented), and `findLabeledRuns` never sees it (grouping is by id,
  not label), so run-merge semantics are untouched.
- Works on any array of PathBlocks (elements without seam ids simply
  contribute nothing); non-block elements error. `'seams'` is not in
  CALLBACK_METHODS — no `<<` interaction.

## Scope

- types.ts (`PathCommandMeta.seamId?`), boolean-ops.ts stamp sites
  (:4770 strokes, :4798 cookie loops, :4428 bridging l), index.ts array
  method + annotated array-method parity, pathogen-api PathogenArray
  (seams() declaration) + completions, docs (segment-labels "Querying"
  + path-blocks "Cutting" — the seams-once contract and the frame
  convention), tests (two-piece → 1; 3×3 wavy grid → 12; hex medallion
  → 6 — the merged-V case that breaks geometric pairing; cookie → 1;
  equivalence: seams() drawn output == post41/02's ownership-rule
  output; error paths; annotated parity).
- Series: post41/02 rewritten to the seams() loop (the showcase) +
  papercraft closing entry. OPTIONAL, your call: also single-stroke the
  came in part 4 (44/01–05) — visually identical for solid strokes,
  simpler code, but it would shift those examples' teaching away from
  per-piece querying ("the decoration IS the seam group"), so my
  recommendation is to leave part 4 as-is and mention seams() in its
  closing section only. Registration marks (42/04) stay per-piece by
  design — the marks belong on BOTH pieces.

## Payoff

The double-draw bug class becomes unwritable; the fold-lines sample
loses its cleverest-but-least-teachable code; and cut results gain
their first group-level query — a natural seed for later group queries
(the friction log's own future entries).

# Item F — Cutter label propagation (friction log #7)

**Status:** rich summary for user review — no code changed yet.

## Before / after

| Before (today) | After (proposal) |
|---|---|
| ```pathogen
// Two knives, two fold styles — but every
// seam lands in one anonymous 'cut' group.
let pieces = sheet.cut([mountainKnife, valleyKnife]);
for (seam in piece.segmentAll('cut')) {
  // Which knife made this edge?
  // There is no way to ask — one dash
  // style for every fold, or manual
  // geometry bookkeeping per seam.
}
``` | ```pathogen
let mountainKnife = @{
  lineTo(200, 0) as segment('mountain');
};
let valleyKnife = @{
  lineTo(0, 200) as segment('valley');
};
let pieces = sheet.cut([mountainKnife, valleyKnife]);
for (seam in piece.segmentAll('cut:mountain')) {
  mountainFolds.apply { seam.draw(); }
}
for (seam in piece.segmentAll('cut:valley')) {
  valleyFolds.apply { seam.draw(); }
}
// segmentAll('cut') still returns every seam.
``` |

The knife names its own edges with the ordinary `as segment(...)` syntax
users already know; the cut carries that name onto the healed seams as a
sub-label under the reserved `cut` namespace. No new syntax, one new
query form.

## What I hit (post41/02, papercraft)

Mountain-vs-valley folds are the heart of a real papercraft template:
different fold directions get different dash styles on the printed
sheet. Two knives express the two fold families perfectly at cut time —
and then the result erases the distinction. Every healed seam comes back
labeled `cut`, full stop. The post ships a prose caveat instead of the
feature ("all seams share one group"), and the medallion kit resorts to
a cross-product side test to tell its two radial edges apart.

## Verified mechanics (current HEAD, first-hand)

- The knife's authored labels **survive all the way to the stamp and die
  in one line**: arrangement splitting preserves meta (the
  split-fragment rebuilder, `boolean-ops.ts:1743-1748`, explicitly
  carries `segmentLabel` + `seamId` through), and then `stampCutSeam`
  (`boolean-ops.ts:3973-3976`) wholesale-replaces every seam command's
  meta with `{segmentLabel: 'cut', seamId}`.
- Three stamp sites, all funneling through that replacement or
  hardcoding it: per-fragment stamping (`:4786`), the cookie path
  (`:4813`), and the synthesized bridge `l` (`:4441`, hardcoded meta).
- Twin halves of a seam are built from the **same stamped command list**
  (reverse + re-stamp share `seamId` today) — so a sub-label placed at
  stamp time pairs across both adjacent pieces for free, exactly like
  `seamId` does.
- Label queries are **exact-match** (`segments.ts:271`), and merged runs
  form from contiguous same-label commands (`findLabeledRuns`,
  `segments.ts:267`).
- The current docs **promise the opposite**: "The cutter's own labels do
  not propagate" (`docs/path-blocks.md:1012`). This was a deliberate
  design decision — overturning it is a documented contract change, not
  a bug fix.

## Proposed design

1. **Source of identity: the knife's own `as segment('name')` labels.**
   No new syntax. Composes with Item H's cutter arrays — each knife in
   the array can carry its own name, which a call-level option like
   `cut(knife, {seamLabel})` could never distinguish.
2. **Stamping**: when the source cutter command carries authored label
   `L`, stamp the seam `segmentLabel: 'cut:' + L`; unlabeled cutter
   edges and synthesized bridges stay plain `'cut'`. One compound
   string — no new meta field, so every existing meta-passthrough site
   (the four hardened in Item D) carries it with zero changes.
3. **Querying — the reserved `cut` group becomes hierarchical, and only
   it**:
   - `segmentAll('cut')` matches `'cut'` **and** anything `'cut:*'`,
     returning them merged exactly as today (contiguous seam commands
     form one run regardless of sub-label). Every published sample and
     test keeps working unchanged.
   - `segmentAll('cut:mountain')` exact-matches the subgroup.
   - All other labels keep exact matching — no general hierarchy
     semantics introduced.
4. **`pieces.seams()`** is unaffected (groups by `seamId`), and the seam
   PathBlocks it returns keep the sub-labels — so `seams()` output is
   queryable by knife name too.

### Free side-effect: a partial answer to friction #8

Sub-label queries are exact, so `segmentAll('cut:k0')` on the medallion
wedge returns **one radial edge, not the merged V-run** — the unmerged
escape hatch friction #8 asks for, delivered for the cut case without
any `{merge: false}` option. The umbrella `'cut'` query keeps the merged
behavior, so nothing published shifts.

## Decision points

1. Identity source: authored knife labels (`cut:name`, recommended) vs
   a `cut(..., {seamLabel})` call option vs both.
2. Umbrella semantics: `segmentAll('cut')` continues to match all seams
   including sub-labeled ones (recommended, back-compat) vs plain
   `'cut'` only.
3. Reserved namespace: document `cut` and `cut:*` as reserved segment
   labels (a subject edge hand-labeled `'cut:x'` would be picked up by
   the umbrella query; recommend documenting the namespace as reserved
   rather than erroring).
4. Scope: segment labels only; knife **endpoint** labels stay
   non-propagating (endpoints land on arrangement nodes shared by many
   pieces — ambiguous owner; recommend deferring).

## Series payoff (if approved)

- post41/02: prose caveat replaced by a real mountain/valley
  demonstration; papercraft closing entry.
- post41/06: the V-run half-walking (`subPath(t0, t1)` at guessed
  fractions) can be revisited via per-knife queries — evaluate at
  implementation time whether the cross-product side test also falls.
- Friction log: #7 resolved; #8 annotated as partially delivered.

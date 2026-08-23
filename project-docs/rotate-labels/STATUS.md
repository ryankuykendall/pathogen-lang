# PathBlock.rotate() + family-wide label preservation — Status

**2026-08-22 — implemented, full suite green (4799), docs review in flight.**

Plan: `~/.claude/plans/i-would-like-to-partitioned-galaxy.md`. Both features
user-requested as cut() follow-ups; all five design forks user-approved
(frame-preserving rotate; origin default pivot; `rotate(angle, origin?: Point)`
signature matching Point.rotate; whole-family label scope; auto-labeled
'cut' seams).

## What shipped

- **`rotate(angle, origin?)`** on PathBlock + ProjectedPath, both evaluators.
  Kernel extracted as `rotateAboutPointCommands` (path-transforms.ts) from
  rotateAtVertexCommands (now a 2-line wrapper — byte-identical, existing
  tests pin it). Frame-preserving via `buildPathBlockFromCommands(..., {0,0})`
  (scale's convention); sub-epsilon residue snapped so right-angle rotations
  emit clean numbers. Declared in pathogen-api.ts (both interfaces),
  completions regenerated.
- **Label preservation, whole family**: new `derivedMeta()` (segments.ts)
  strips pending corner-ops at derived-value boundaries (they'd otherwise
  newly re-apply and change geometry — the byte-equality hazard the plan
  agent caught); builder meta-spreads in index.ts + annotated.ts (×2) +
  annotated's inline project mapper (fixed a pre-existing drawTo
  inconsistency). transformPathPoints/offsetCommands carry meta via a
  1:1 tail-attach; subPathCommands re-attaches caller-side around the
  meta-free splitCommandAtParametricT (endVertex only on true-end
  fragments); reverseCommands implements the endVertex SHIFT rule (labels
  name a command's END; reversal moves the vertex to the neighbor —
  mod-n wraparound on closed paths, z-attachment for the closed forward-last
  case, documented drop for the open-path final vertex). boolean-ops gained
  meta on its TransformCmd; splitCmdRange/reverseCmd/rebase carry;
  reverseRing/reverseSingleSubpath/buildRings-reverseB apply the ring shift.
- **Cut seams**: cutter half-edges stamped `{segmentLabel:'cut'}` at
  half-edge creation (both twin directions), cookie loops in both winding
  copies, traceCutFaces' bridging `l`. Subject labels survive on boundary
  fragments; cutter's own labels deliberately do not propagate.
- **Five wrapper inline maps collapsed** into buildPathBlockFromCommands
  (reverse/offset/mirror/rotateAtVertexIndex/subPath) — value-identical,
  kills the duplicate meta-dropping normalizers.
- **Annotated parity extras**: PathBlock draw()/drawTo() now pass
  bridgeOriginGap (pre-existing gap vs main, exposed by frame-preserving
  results with non-origin starts).
- **Docs**: path-blocks.md rotate section + ProjectedPath pivot note +
  cut/boolean label bullets; segment-labels.md "Labels Survive Derived
  Paths" section (family, exclusions, seam contract, caveats). Seam example
  uses the projected form for absolute coordinates (segment() sub-blocks
  rebase — caught via the demo, fixed before review).
- **Tests**: +40 across path-blocks (rotate A1-A6), segment-labels
  (byte-guards over the family + shift cases), boolean-ops (two-operand
  labels incl. B-reversal), path-cut (seams, cookie seams, group merge,
  byte-guard), annotated (parity). Full suite 4799 green.

## Implementation traps hit and resolved

- Python multi-site replace mangled the z→l blocks in the three corner-op
  appliers (duplicate close-vertex labels + undeclared var) — caught by the
  pre-existing z-chamfer vertexAll regression test, reverted precisely.
- Boolean two-operand test initially labeled a B edge that lies OUTSIDE A
  (difference correctly drops it) — test geometry fixed, behavior right.
- Demo/docs seam decoration must use `.project()` — segment()/segmentAll()
  sub-blocks are rebased to their own start.

## Verification

- Full suite 4799/4799; targeted suites green after each wave.
- `demo-rotate-seams.pathogen/.svg/.png` — cut plate, pieces spun in place
  via rotate() (no pivot compensation), seams dotted via
  placed.segmentAll('cut').partition — the full stack composing.
- Docs built; check-links + content-reviewer round in flight.

## Non-goals (documented in segment-labels.md)

variableOffset family excluded; annotated label queries stay unsupported;
authored-vs-finalized distinction not preserved on derived blocks;
corner-op suffixes never carry; cutter labels don't propagate (seams='cut').

## Docs review (2026-08-23)

The multi-persona round-table agent stalled three times on overnight machine
sleeps (stream watchdog), so the review completed as an INLINE four-lens pass
instead — rerun the full round table before publishing if desired. Findings,
all fixed:

1. Stray trailing ``` fence at EOF of docs/segment-labels.md — pre-existing
   in HEAD (the stalled reviewer's one surfaced clue); removed.
2. The rotate section's cut-shard example used undefined `shape`/`knife`
   (the same defect class the cut-post round table caught) — now
   self-contained and compile-verified (output shows both pieces rotated
   in place correctly).
3. "matching Point.rotate" overclaimed — Point.rotate's RUNTIME requires
   both args even though pathogen-api declares `origin?` optional; reworded
   to link without claiming behavioral equivalence.

Verified clean: all four new cross-reference anchors exist in the built HTML
(checked statically — check-links needs the dev server on :3000, which was
wedged post-sleep; re-run it when the stack is bounced); the seam example's
projected-form coordinates; multiline path-block style; the family list,
exclusions, and caveats all match verified behavior.

**Logged follow-up:** Point.rotate api/runtime optionality mismatch
(pathogen-api.ts:645 declares `origin?`; index.ts runtime throws unless 2
args) — reconcile by implementing the (0,0) default or fixing the
declaration.

## Code review round (2026-08-23)

Post-restart: full suite re-verified green (4799), check-links passed live
against :3000 (38 pages / 1165 links / 0 broken — closes the wedged-server
item above). code-reviewer agent found no critical issues; 3 warnings + 2
suggestions, all addressed in-session:

1. **Zero-length-`z` endpoint labels dropped by boolean ops/cut** (the
   parity gap vs reverseCommands' zeroZMeta): fixed in extractDrawCmds —
   the vanishing z's endpoint label re-attaches to the preceding draw
   command's end (same vertex; copy-on-write, coincidence-guarded,
   existing label wins). Tests: difference + cut zero-z survival with
   bbox-relative coordinate asserts; verified they fail without the fix.
   The sibling `m`-label gap (labels on `m` survive only point-mapping
   transforms, dropped by reverse/subPath/boolean/cut which rebuild from
   draw commands) is documented as an explicit caveat in
   segment-labels.md rather than half-fixed — reverse's m-filter is
   pre-existing and the reversal semantics for a start-vertex label are
   the same ambiguity as the documented open-path end-vertex drop.
2. **shiftRingEndVertices had no coordinate-level test**: added —
   difference with B fully inside A (hole-winding ring reversal),
   endpoint label asserts at its world coordinate via bbox-relative
   check.
3. **Annotated evaluator meta gap**: reverse/offset/mirror/
   rotateAtVertexIndex/subPath isBlock branches collapsed through
   annotated's buildPathBlockFromCommands (same five-wrapper collapse as
   main; scale already passed meta through raw, matching main). Added a
   six-op labeled-vs-plain annotated byte-guard family test.

Suggestions: path-blocks.md rotate Point link re-pointed
#syntax-rotateangle-origin → #syntax-points (built + verified);
CHANGELOG.md entry added (0.8.0 / 2026-08-23 section). +9 tests → 4808
expected. `npm run build` green after changes.

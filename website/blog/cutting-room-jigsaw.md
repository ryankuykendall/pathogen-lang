---
title: "Jigsaw: Pieces That Know Their Own Edges"
slug: cutting-room-jigsaw
date: 2026-08-25
description: "Part 2 of The Cutting Room: the knife is a path, so jigsaw nubs are just cubics — and after the cut, labels classify the pieces, partition marks register twin seams, and rotate() scatters everything without pivot bookkeeping."
series: "The Cutting Room"
seriesPart: 2
---

*Part 2 of 4 in The Cutting Room — projects that put `cut()` and
segment labels to work together.*

> **Series: The Cutting Room**
> 1. [Papercraft](/blog/cutting-room-papercraft) — cut lines, fold
>    lines, and glue tabs from one plate
> 2. **Jigsaw** (this post) — wavy knives, piece identity, and a
>    scattered puzzle
> 3. [Garment patterns](/blog/cutting-room-garment) — named edges, seam
>    allowances, and notches
> 4. [Stained glass](/blog/cutting-room-stained-glass) — tinted panes,
>    leading, and a rose window

> **Prerequisites:** [`PathBlock.cut()`](/blog/pathblock-cutting) and
> [segment labels](/blog/segment-labels-and-suffixes). Part 1's
> [seam-stroking idiom](/blog/cutting-room-papercraft) — project the
> piece, loop `segmentAll('cut')`, draw each seam on itself — is used
> here without re-introduction.

## What it does

A jigsaw puzzle is a shape whose *cuts are the product*. Nobody looks
at the rectangle; everyone looks at the wiggle. And because a Pathogen
knife is an ordinary path, the wiggle is yours to author: a cubic
knife cuts a cubic seam, and the healed edges on both sides are exact
copies of the arc the knife took through the material.

This post adds three tools to part 1's kit:

- **Knife design.** Nubs, waves, and hooks are plain `c` commands in
  the cutter block. Whatever you can draw, you can cut along.
- **Classification by label.** Label the plate's rim before cutting,
  and `segmentAll('rim').length` sorts border pieces from interior
  pieces with no geometry tests.
- **`rotate(angle, origin)`.** Frame-preserving rotation spins a piece
  around any pivot — its own center, say — with no re-basing and no
  pivot bookkeeping afterward.

## Why you'd use it

The same reason the puzzle industry uses dies instead of rulers: the
interesting cut is curved, interlocking, and repeated — miserable to
construct by intersection math, trivial to draw once as a stroke. Cut
geometry you author once multiplies across every piece, and the seams
come back queryable, so the decoration (registration marks, sorting,
scattering) is a loop, not a spreadsheet. The classification idiom:

```pathogen
if (piece.segmentAll('rim').length > 0) {
  // this piece kept some of the plate's labeled border
}
```

## Example 1 — The knife is a path

One lazy S-curve, dashed red over a ghost of the plate on the left, and
the two pieces it makes on the right. The amber strokes are each
piece's `segmentAll('cut')` — notice they are the *same curve* as the
knife, clipped to the material it actually crossed.

<mini-workspace src="samples/post42/01-wavy-knife.pathogen" caption="A cubic knife cuts a cubic seam; the healed edges echo the stroke." code-open></mini-workspace>

The knife overshoots the plate on both ends — a knife has to fully
cross material to cut ([part 5 of the PathBlock
series](/blog/pathblock-cutting) covers the rules) — and the seams
show only the part that drew blood.

## Example 2 — The interlocking nub

The jigsaw signature. Halfway down a straight knife, two cubics bulge
out into a knob with a narrow neck, then rejoin the line. One cut,
two pieces: the left one wears the knob, the right one the socket,
and both seams are the same mushroom silhouette.

<mini-workspace src="samples/post42/02-nub-knife.pathogen" caption="Two cubics make the knob; the cut hands one piece the nub and the other the socket." code-open></mini-workspace>

There is no special interlock feature here — that is the point. The
nub is knife authorship, nothing more, which means your puzzle's edge
style is a design decision you make in path commands.

## Example 3 — Which pieces touch the frame?

Puzzle solvers sort edge pieces first, and labels let the program do
the same. The plate names its entire boundary `as segment('rim')`
before four wavy knives make a 3×3 grid. Afterward, one question per
piece — *did you keep any rim?* — splits tray pieces from the one
interior piece, tinted amber. The teal strokes make the mechanism
visible: they are each piece's inherited rim runs, the very label the
classification asked about.

<mini-workspace src="samples/post42/03-frame-or-middle.pathogen" caption="Teal is the rim each piece kept — the label does the sorting, and the amber piece kept none." code-open></mini-workspace>

Worth noticing: the rim label rides the *plate's* edges, so it lands
on whichever pieces inherit those edges, automatically. Nothing about
the knives, the piece count, or the piece order is encoded in the
classification — cut a 5×5 next week and the same `if` still sorts it.

## Example 4 — Registration marks

Print-shop trick: put matching marks on both sides of a cut so
alignment is visible. Twin seams are the same curve, and
`partition(n)` samples at fixed fractions of arc length — including
both endpoints — so partitioning *each piece's own seam* puts rings at
identical spots on both copies. The dotted lines just make the pairing
visible across the gap.

<mini-workspace src="samples/post42/04-registration-marks.pathogen" caption="partition(3) on each twin seam: same fractions, same spots, guaranteed pairs." code-open></mini-workspace>

This works even though the two pieces' seams may run in opposite
directions: `partition`'s fraction set is symmetric (0, 1/3, 2/3, 1),
so a reversed twin lands its marks on the same points.

## Example 5 — The scattered puzzle

The finished scene. Nine pieces from the wavy grid; the middle piece —
found by the rim test, not by index — has gone missing under the sofa.
The rest spin in place with `rotate(angle, center)` around their own
bounding-box centers and drift apart with shoves from
[`hashRange`](/blog/primer-hashrange) — deterministic randomness, so
the scatter is the same on every compile. The box lid in the
corner keeps the assembled picture: every piece run through
`scale(0.44, 0.44)` and drawn at one shared origin, reassembling the
plate in miniature because scaled pieces keep their scaled placement.

<mini-workspace src="samples/post42/05-scattered-puzzle.pathogen" caption="rotate() spins each piece about its own center — no pivot bookkeeping — and the lid is the same cut, scaled." code-open></mini-workspace>

If you saw the [shattered-glyph
finale](/blog/pathblock-cutting) in the cutting post, compare the
spin: it needed `rotateAtVertexIndex` plus manual pivot compensation.
`rotate(angle, origin)` is frame-preserving — the piece turns around
the pivot and stays put — so the scatter is two lines per piece.

## What this project taught the language

This series doubles as a working friction log (part 1 explains the
convention). Since this post first ran, two of its idioms improved:
the seam idiom it borrows — draw a projected value where it lies —
became a real method (`seam.draw()` replaced the two-line
`drawTo(seam.startPoint.x, seam.startPoint.y)` re-anchor), and the
3×3 grid's four wavy knives are now built in a loop and passed to
`cut([...])` as an array — one knife per lane, no chained-move
arithmetic between strokes. Part 1's closing section has both
stories.

## Where to go next

- [Garment patterns](/blog/cutting-room-garment) — part 3 turns
  label-keeping into a workflow: pieces identified, offset for seam
  allowance, and notched.
- [Papercraft](/blog/cutting-room-papercraft) — part 1, if you skipped
  it: the seam-stroking idiom every example here leaned on.
- [PathBlock parametric sampling](/blog/pathblock-parametric-sampling)
  — `get`, `normal`, `partition`, and friends.
- Reference: [cutting paths](/docs#path-blocks-cutting-paths) and
  [rotate](/docs#path-blocks-rotateangle-origin-pathblock-projectedpath) in the docs.

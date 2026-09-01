---
title: "Leathercraft: Stitch Holes That Can't Disagree"
slug: broken-lines-leathercraft
date: 2026-09-03
description: "Third in Broken Lines: a punch hole is a near-zero dash outlined round, negative dash offsets center the run, and two mating seams derive their holes from one shared edge — so the counts match by construction."
series: "Broken Lines"
seriesPart: 3
---

*Part 3 of 5 in Broken Lines — projects that treat the stroke not as
paint, but as geometry you can hold.*

> **Series: Broken Lines**
> 1. [Stroke geometry](/blog/broken-lines-stroke-geometry) — dashes,
>    outlines, and start points as real paths
> 2. [Sashiko](/blog/broken-lines-sashiko) — running stitches from
>    binary sequences
> 3. **Leathercraft** (this post) — stitch holes that can't disagree
> 4. [Stencils](/blog/broken-lines-stencils) — bridges are just gaps
> 5. [What Broken Lines taught the language](/blog/broken-lines-what-it-taught)
>    — the friction log, resolved

> **Prerequisites:** Part 1's
> [`dash()` and `outline()`](/blog/broken-lines-stroke-geometry). The
> samples also use
> [expression-bodied lambdas](/docs#syntax-lambdas)
> (`{|prick| prick.kind == 'dash'}`),
> [`fillet()`](/docs#path-blocks-fillets) to round the stitch line's
> corners, [`difference()`](/docs#path-blocks-boolean-operations) to
> punch the holes for real, and
> [`<<` concatenation](/docs#path-blocks-concatenation) with
> `.reverse()` to build two pieces around one shared edge.

## What it does

Saddle-stitched leather is sewn through pre-punched holes at fixed
pitch — 3 to 4&nbsp;mm irons, hole after hole down every seam. Saddle
stitch means two needles working the *same hole* from opposite sides,
which is why everything below cares so much about where the holes go.
In dash terms a hole is a dash of nearly zero length, followed by a
pitch-sized gap. `stroke-dasharray: 0.01 16` puts a dash every 16
units; `outline()` with round caps turns each one into a dot of
exactly the punch's diameter. Walk a pricking iron down a seam and
the marks it leaves *are* the dash array. (Whether your iron marks
for an awl or a stitching chisel punches clean through, the template
is the same row of points.)

One craft rule dominates everything else, and it's worth stating
before any picture: **two pieces that share a seam must carry the same
hole count at the same spacing.** A wallet whose flap has 17 holes and
whose body has 18 does not assemble. Designers re-count after every
resize. This post's answer is structural: derive the holes from the
one shared edge, and the two rows *cannot* disagree, because they are
the same row.

## Why you'd use it

Because hole layout is the mechanical, error-prone step between a
shape and a template — the part designers do today with Illustrator's
Blend tool and a hand-typed step count, or by duplicating a dot and
eyeballing the run. Pitch, margins, corner behavior, and mating-seam
agreement are all arithmetic along a path, which is exactly what
`dash()` measures. Resize the piece and the holes re-derive; nothing
is re-counted by hand.

## Example 1 — The prick line

One seam. The dash array's first entry is `0.01` — a dash so short
it's a point — and the second is the pitch. Outline each one with
round caps at the punch diameter and the seam becomes a row of holes.

<mini-workspace src="samples/post47/01-holes-are-dashes.pathogen" caption="stroke-dasharray: 0.01 16 — a hole every 16 units, outlined to diameter 5." code-open></mini-workspace>

## Example 2 — Centering the run

The naive row starts with a hole exactly on the corner and dumps the
leftover length at the far end — every leatherworker's first-template
mistake. The fix is one negative dash offset: shift the pattern back
by half the remainder, and the margins agree at both ends.

<mini-workspace src="samples/post47/02-centered-holes.pathogen" caption="Top: offset 0 — margins 0 and 10. Bottom: centered — 5 and 5." code-open></mini-workspace>

One gotcha the centering trick hides: it guarantees *equal* end
margins, not *adequate* ones. When the leftover is tiny, "centered"
puts a hole a hair from the corner — where leather tears out. The
craft fix is to give up one hole and split a whole extra pitch across
the ends: `endMargin = (leftover + pitch) / 2`. The next two examples
do exactly that.

## Example 3 — One edge, two pieces

The heart of the post. A flap and a body share one seam — the same
sagging curve is the flap's bottom edge and the body's top edge, built
by [concatenating](/docs#path-blocks-concatenation) the shared
`seamEdge` into both outlines. (`<<` reads as *feed the left thing
the right thing* in both of its jobs here: gluing path pieces
together, and handing `filter()` its predicate. And note `.length` on
a path is arc length, while `.length` on the holes array is a count —
same word, two rulers.) The holes are derived *once*, from that edge,
and drawn onto both pieces — one array, drawn twice. They could not
differ if you tried.

<mini-workspace src="samples/post47/03-matched-seams.pathogen" caption="Exploded view: both hole rows are the same pieces, placed twice." code-open></mini-workspace>

This mirrors real practice, and honestly: irons are usually walked a
few millimeters *inside* the edge, through both glued layers at once —
one marked line, both pieces. Deriving a separate inset line per piece
with `offset()` would reintroduce the disagreement, because offsetting
changes a curve's length. Mark one line; punch through both. That gap
— dashing an inset line by the edge it came from — is this series'
deepest feature request, and it went straight into
[the friction log](/blog/broken-lines-what-it-taught) with this
wallet as its motivating artifact.

## Example 4 — The wallet template

The finished artifact, at an honest scale: 4 units to the
millimetre, a panel big enough for a real ISO card, a 4&nbsp;mm iron.
The pocket's stitch line is a `fillet()`-rounded U *derived* from
three named dimensions — resize the pocket and every hole re-derives
— with the safe end margin from Example 2's gotcha. Then, because
outlined holes are closed paths, every hole is subtracted from the
pocket with `difference()`. Until now the holes were painted white so
you could see them; here they're absent material — the darker panel
beneath shows through each one.

<mini-workspace src="samples/post47/04-card-wallet.pathogen" caption="A punch-ready pocket: derived stitch line, safe margins, really cut." code-open></mini-workspace>

## Where to go next

The stroke-geometry surface this post leaned on is documented in
[the reference](/docs#path-blocks-stroke-geometry). Holes are material
*removed* along a line. The
[next post](/blog/broken-lines-stencils) inverts the trick: stencils
survive because of the material you *keep* — bridges — and a bridge is
nothing but a gap, placed on purpose, in a stroke that's about to be
cut out.

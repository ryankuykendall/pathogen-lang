---
title: "Stencils: Bridges Are Just Gaps"
slug: broken-lines-stencils
date: 2026-09-04
description: "Fourth in Broken Lines: a stencil's islands fall out unless bridges hold them — and a bridge is a gap in a dashed centerline, outlined to the band width and cut with difference()."
series: "Broken Lines"
seriesPart: 4
---

*Part 4 of 5 in Broken Lines — projects that treat the stroke not as
paint, but as geometry you can hold.*

> **Series: Broken Lines**
> 1. [Stroke geometry](/blog/broken-lines-stroke-geometry) — dashes,
>    outlines, and start points as real paths
> 2. [Sashiko](/blog/broken-lines-sashiko) — running stitches from
>    binary sequences
> 3. [Leathercraft](/blog/broken-lines-leathercraft) — stitch holes
>    that can't disagree
> 4. **Stencils** (this post) — bridges are just gaps
> 5. [What Broken Lines taught the language](/blog/broken-lines-what-it-taught)
>    — the friction log, resolved

> **Prerequisites:** Part 1's
> [`dash()` and `outline()`](/blog/broken-lines-stroke-geometry), and
> the [boolean operations](/docs#path-blocks-boolean-operations) —
> every aperture here is a `difference()`. The seam-merge behavior uses
> [`dash-seam`](/docs#path-blocks-dashstyles-array-of-path-kind-t0-t1)
> from the stroke-geometry docs.

## What it does

A stencil is a sheet with shapes cut out — and one hard constraint:
every piece of the sheet must stay *connected*. Cut a ring and the
circle in the middle — stencil makers call it an island, typographers
call it a counter — is attached to nothing. It falls out on the workbench, and your "O" sprays as a
dot. The fix, as old as stenciling: **bridges**, small tabs of sheet
left uncut across the ring.

Today bridge placement is a manual chore — draw the shape, hand-draw
tabs across it, cut, discover the counter on the floor, iterate. But
look at what a bridged ring actually is: a centerline, cut *most* of
the way around, with a few deliberate interruptions. Cut segments and
interruptions. Dashes and gaps. The whole problem is a dash array.

## Why you'd use it

Because the recipe is three steps and it parameterizes everything a
stencil maker argues about — band width, bridge width, bridge count,
and (through the dash offset) where the bridges land — while
guaranteeing the geometry stays cuttable:

```pathogen
let cutLength = calc(centerline.length / bridgeCount - bridgeWidth);
let pieces = centerline.dash(${
  stroke-dasharray: ${cutLength} ${bridgeWidth};
  dash-seam: merge;
});
for (segment in pieces.filter {|piece| piece.kind == 'dash'}) {
  stencil = stencil.difference(segment.path.outline(${
    stroke-width: ${bandWidth};
  }));
}
```

Dash the centerline, `outline()` each dash to the band width,
`difference()` each one from the sheet. The gaps were never cut — they
*are* the bridges. Everything below is cut from mylar — the tough
polyester film most stencils are cut from — but the sheet material
never enters the math.

## Example 1 — The island problem

The failure mode first, per house rules. Left: the design — a clean
ring, counter in place. Right: the same cut on the bench — the counter
is attached to nothing, and gravity is undefeated.

<mini-workspace src="samples/post48/01-island-problem.pathogen" caption="An unbridged ring. The middle is an island; islands fall." code-open></mini-workspace>

## Example 2 — Dash the centerline first

Before anything is cut, dash the ring's centerline and just *look* at
the pieces — part 1's vocabulary, on a loop. The dark arcs are what
the blade will follow; the short green arcs are the bridges, and they
exist as geometry before any cutting happens. Bridge placement is the
dash offset: `stroke-dashoffset` shifts the pattern *within* the
path (part 1's `startAt()` moved the path's start instead — same
effect, different knob), and here a half-segment shift parks the four
bridges on the diagonals instead of the cardinals.

<mini-workspace src="samples/post48/02-dash-the-ring.pathogen" caption="The plan before the cut: dark will be cut, green never will." code-open></mini-workspace>

That shift has one consequence worth understanding. A closed path has
a seam — the point where it starts and ends, and where the dash
pattern begins. Shift the pattern half a segment and the seam lands
*mid-cut*, which would hand back two half-segments; `dash-seam: merge`
stitches them back into one, so the counts below stay honest.

## Example 2b — Outline and subtract

Now the cut. Each dash is outlined to the band width with `butt` caps
— flat bridge shoulders, the way a blade would leave them — and
subtracted from the sheet. The leader lines mark the three parameters.

<mini-workspace src="samples/post48/02-bridges-are-gaps.pathogen" caption="Four dashes cut, four gaps kept. The island is held by what you didn't cut." code-open></mini-workspace>

## Example 3 — Any loop will do

Nothing in the recipe mentions a circle. A rounded-rectangle band gets
the same treatment — and its rounded band corners come from a nice
piece of geometry: the centerline's fillets are already curves, so
`outline()` simply *offsets* them, concentrically — inner radius 16,
outer 36 around a radius-26 fillet. (The `stroke-linejoin` in the
sample is honest-to-goodness inert here: a tangent-continuous
centerline has no corner for a join to act on. It would matter on a
sharp-cornered `rect()` centerline.) The bridges land wherever the
offset puts them — drive the offset to move them. Swap the
centerline, keep the recipe.

<mini-workspace src="samples/post48/03-cornered-ring.pathogen" caption="Six segments around a filleted loop — the band offsets the fillets." code-open></mini-workspace>

Two practical floors before you scale this: `cutLength` goes negative
— a compile error, since negative dash entries are rejected — as soon
as `bridgeWidth × bridgeCount` reaches the centerline's length, so a
small ring caps how many bridges it can carry. And these are user
units; real bridges have a *material* minimum width (too narrow tears
during cutting or lifts under spray), which no geometry can supply.

## Example 4 — The trail marker

The finished artifact: a spray-ready sheet. The bridged ring from
Example 2, a solid arrow aperture (no island — no bridge needed), and
corner registration crosses derived from the sheet's dimensions. This
is the file you'd hand a laser — with one practitioner detail already
encoded: the crosses live on their own *layer*, because a cutter has
to be told which lines are cuts and which are reference. Send the
sheet layer to the blade; the registration layer is for aligning
pass two.

<mini-workspace src="samples/post48/04-trail-marker.pathogen" caption="One sheet: bridged ring, solid arrow, registration marks on their own layer." code-open></mini-workspace>

## Where to go next

Three crafts, one toolkit — the full surface is in the
[stroke geometry reference](/docs#path-blocks-stroke-geometry), and
the stitching posts this one leans against are
[sashiko](/blog/broken-lines-sashiko) and
[leathercraft](/blog/broken-lines-leathercraft). And there's a stack
of notes about everywhere the language pushed back while these posts
were being written: the
[closing post](/blog/broken-lines-what-it-taught) opens the friction
log — what hurt, what got fixed, and what the fixes look like.

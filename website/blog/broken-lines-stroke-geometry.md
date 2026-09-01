---
title: "Stroke Geometry: Dashes, Outlines, and Start Points as Real Paths"
slug: broken-lines-stroke-geometry
date: 2026-09-01
description: "First in Broken Lines, a five-part series on stroke geometry: dash() partitions a path into its dash and gap pieces, outline() turns a stroked line into a closed, fillable shape, and startAt() decides where a closed path begins."
series: "Broken Lines"
seriesPart: 1
seriesDescription: "Five posts on stroke geometry — dash(), outline(), and startAt() — from bare mechanism to three crafts built on interrupted lines: sashiko stitching, leather stitch holes, and stencil bridges. Written as a working friction log; the closing post reports what building these taught the language."
---

*Part 1 of 5 in Broken Lines — projects that treat the stroke not as
paint, but as geometry you can hold.*

> **Series: Broken Lines**
> 1. **Stroke geometry** (this post) — dashes, outlines, and start
>    points as real paths
> 2. [Sashiko](/blog/broken-lines-sashiko) — running stitches from
>    binary sequences
> 3. [Leathercraft](/blog/broken-lines-leathercraft) — stitch holes
>    that can't disagree
> 4. [Stencils](/blog/broken-lines-stencils) — bridges are just gaps
> 5. [What Broken Lines taught the language](/blog/broken-lines-what-it-taught)
>    — the friction log, resolved

> **Prerequisites:** This series builds on
> [PathBlocks](/blog/pathblock-introduction) — reusable path values you
> draw at a position — and touches the
> [boolean operations](/docs#path-blocks-boolean-operations)
> (`union`, `difference`) in a few places. Skim those first if either
> is new.

## What it does

When a renderer draws a dashed stroke, the dashes exist only as paint:
you can see them, but you can't ask for them. Three PathBlock methods
turn that paint back into geometry.

[`dash(styles)`](/docs#path-blocks-dashstyles-array-of-path-kind-t0-t1)
partitions a path using the same properties CSS uses, and hands back
every piece — the inked dashes *and* the spaces between them — as real
paths:

```pathogen
let pieces = wave.dash(${
  stroke-dasharray: 26 14;
});
// [{ path, kind: 'dash' | 'gap', t0, t1 }, ...]
```

[`outline(styles)`](/docs#path-blocks-outlinestyles-pathblock) converts
a stroked line into the **closed** path that outlines it — the same
operation as "Outline Stroke" in Illustrator or "Stroke to Path" in
Inkscape. Closed means fillable, and fillable means it works in boolean
operations.

[`startAt(t)`](/docs#path-blocks-startatt-pathblock-projectedpath)
re-anchors a path to begin at any fraction of its length — and since a
dash pattern starts wherever its path does, moving the start moves
every dash. On a closed path that's a seamless rotation; on an open
path the ends can't be rejoined, so the result is two runs — `t` to
the end, then a jump back for the remainder.

Four things to know before the pictures, because everything below
leans on them:

- **Pieces keep their place.** Every piece from `dash()` — and every
  outline — remembers exactly where it sat in the source path. Draw
  them all at one position and they reassemble the original. There is
  no coordinate bookkeeping in any example on this page.
- **The methods compose.** `dash()` gives centerline pieces — the bare
  line a stroke would be painted along, with no width of its own, which
  is why `dash()` rejects `stroke-width` outright. `outline()` is what
  gives a piece width, end caps, and corner treatment — *per piece*,
  which is the one thing a renderer's stroke can never do.
- **Caps extend the geometry.** With `round` or `square` caps,
  `outline()` extends a piece by half the stroke width at *each* end
  (`butt` adds nothing). Outlined dash pieces stay separate shapes only
  while the **gap is wider than the stroke** — narrower than that, and
  neighboring pieces fuse.
- **Style values are live expressions.** `stroke-width: calc(3 + piece.t0 * 16)`
  computes per piece. The flip side: a space-separated pair that reads
  as arithmetic (`stroke-dasharray: 10 -5`) is evaluated as math before
  `dash()` sees it — use commas in any list whose tokens could parse
  that way.

One more thing this series is: a **working friction log**, in
[the Cutting Room](/blog/cutting-room-papercraft) tradition. These
posts were built against the real language, and every place the work
exposed a gap, a bug, or a rough edge went into a log. Some of those
entries became fixes that shipped before the series ended; the rest
are on the bench with their diagnoses attached —
[part 5](/blog/broken-lines-what-it-taught) tells that story.

## Why you'd use it

Because a surprising number of real crafts are made of interrupted
lines. A sashiko pattern is running stitches — dashes. Leather seams
are rows of punched holes — very short dashes, outlined round. A
stencil survives because of its bridges — which are gaps, placed on
purpose. Each of those needs the pieces as *objects* — to place, to
thicken, to punch, to cut — not as paint. That's the series. This post
is the toolkit.

## Example 1 — The first partition

One wave, one dash array. The pieces come back alternating in path
order — dashes drawn solid here, gaps ghosted thin, both from the same
loop over the same array.

<mini-workspace src="samples/post45/01-first-dash.pathogen" caption="wave.dash() — drawn by kind." code-open></mini-workspace>

Every piece is a PathBlock. Anything a path can do — sample it, bound
it, transform it — a dash can do.

## Example 2 — Position rides with the piece

Each piece carries `t0` and `t1`, its start and end as fractions of
the path's length. Filtering on them needs no geometry at all: here
the first half of the wave goes blue, the rest amber.

<mini-workspace src="samples/post45/02-kinds-and-t.pathogen" caption="Routing on piece.t0 — no coordinate math." code-open></mini-workspace>

## Example 3 — outline() makes strokes into shapes

The same curve outlined three times at width 22, with the three CSS
cap styles. The thin dark line is the original centerline: the outline
straddles it exactly, because outlines keep their place too. The
dashed rule marks where the centerline ends — `butt` stops flush on
it; `round` and `square` reach half the stroke width past it. That
extension is the cap rule from the list above, drawn to scale.

<mini-workspace src="samples/post45/03-outline-caps.pathogen" caption="stem.outline(${ stroke-width: 22; stroke-linecap: ... }) — butt, round, square." code-open></mini-workspace>

These are closed, filled paths — not strokes. The amber is `fill`.

## Example 4 — Compose: a width per piece

Partition first, then thicken each dash with its own `outline()` call.
The width is an expression over the piece's own `t0`, so the dashes
swell along the wave. A renderer's `stroke-width` applies to the whole
path; this applies per piece, because each piece is its own path.

<mini-workspace src="samples/post45/04-compose.pathogen" caption="piece.path.outline() with a computed width, per piece." code-open></mini-workspace>

## Example 5 — Closed means boolean-ready

Because outlines are closed, they participate in boolean operations
directly. Left: each fat dash subtracted from a plate —
`plate.difference(slot)` — leaving three discrete pill-shaped slots
(the gap is wider than the stroke; the cap rule again). Right: two
crossing strokes outlined with `outline-overlap: union`. With the
default `raw`, the same cross would fill correctly but keep an
interior seam where the two contours overlap; `union` dissolves it
into one clean boundary — which matters the moment this shape becomes
a cutting path or a boolean operand.

<mini-workspace src="samples/post45/05-boolean-ready.pathogen" caption="Left: dashes as cutters. Right: crossing strokes welded into one outline." code-open></mini-workspace>

## Example 6 — startAt() slides the pattern

A dash pattern begins at its path's start point. `startAt(t)`
re-anchors a closed path to begin at fraction `t` — seamlessly, the
old seam healed — so chaining `startAt(phase).dash(...)` marches the
whole pattern around the ring. The amber dot on each ring is the
re-anchored start point, read straight off `startPoint`. Percent
literals read naturally: `startAt(8%)` is `startAt(0.08)`, and the
phases here are `0%`, `4%`, `8%`.

<mini-workspace src="samples/post45/06-startat-march.pathogen" caption="Same ring, same dasharray, three phases — the pattern walks." code-open></mini-workspace>

## Where to go next

The next three posts each take one craft built on interrupted lines
and build a real artifact with this toolkit:
[sashiko stitch patterns](/blog/broken-lines-sashiko), where the dash
*is* the craft; [leather stitch holes](/blog/broken-lines-leathercraft),
where matched seams must agree hole-for-hole; and
[stencil bridges](/blog/broken-lines-stencils), where the gaps are the
engineering. The full reference for everything here lives in the
[Stroke Geometry documentation](/docs#path-blocks-stroke-geometry) —
including pieces this post skipped: `stroke-dashoffset`,
`dash-seam: merge` for closed-path seams, and percentage dash entries,
which in Pathogen mean a fraction of *this path's* length rather than
SVG's viewport diagonal.

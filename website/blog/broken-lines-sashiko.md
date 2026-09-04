---
title: "Sashiko: Running Stitches from Binary Sequences"
slug: broken-lines-sashiko
date: 2026-09-02
description: "Second in Broken Lines: a running stitch is a dash pattern, hitomezashi is one bit of dash offset per line, and a 138 × 90 mm mend-patch template falls out of a nested loop."
series: "Broken Lines"
seriesPart: 2
---

*Part 2 of 5 in Broken Lines — projects that treat the stroke not as
paint, but as geometry you can hold.*

> **Series: Broken Lines**
> 1. [Stroke geometry](/blog/broken-lines-stroke-geometry) — dashes,
>    outlines, and start points as real paths
> 2. **Sashiko** (this post) — running stitches from binary sequences
> 3. [Leathercraft](/blog/broken-lines-leathercraft) — stitch holes
>    that can't disagree
> 4. [Stencils](/blog/broken-lines-stencils) — bridges are just gaps
> 5. [What Broken Lines taught the language](/blog/broken-lines-what-it-taught)
>    — the friction log, resolved

> **Prerequisites:** Part 1's
> [`dash()`](/blog/broken-lines-stroke-geometry) — partitioning a path
> into dash and gap pieces — is the whole toolkit here. The weave and
> patch examples also use [`hash01`](/docs#stdlib-hash-noise), the
> deterministic hash that turns an index into a repeatable 0-to-1
> value.

## What it does

Sashiko is Japanese running-stitch embroidery: even stitches, even
spaces, white thread on indigo cloth. It began as mending — rural
workwear reinforced stitch by stitch until reinforcement became a
decorative tradition of its own — which is why this post ends with a
patch. Look at one stitched line the
way a needle does and it is *exactly* a dash pattern — thread on top
of the fabric where the dashes are, thread passing underneath where
the gaps are. `dash()` isn't simulating the craft; the craft and the
method describe the same thing.

(And if you'll never hold a needle: what follows is also just a
deterministic, seedable, tileable pattern generator with a
two-integer control surface — the craft is the story, not a
requirement.)

That identity means one honest caveat up front: everything on this
page is template generation — where the stitches *should* go — not
stitching. Sashiko's soul is the hand process. What Pathogen offers is
the part stitchers already do on paper: gridding, counting, and
transferring, at exact pitch.

## Why you'd use it

The pattern family this post builds, **hitomezashi**, is a small
miracle of emergence. Every horizontal line carries the same stitch
pattern; every vertical line does too. The only decision, per line, is
a single bit: start on a stitch, or start on a space. Crosses, steps,
and interlocking blocks appear where the bits interact — nobody draws
them. It's a known math-art crossover, and it lives one
`stroke-dashoffset` away from part 1.

## Example 1 — Both sides of the cloth

One seam, one dash array, shown from both sides of the cloth: the
front is the dashes, and the reverse is the *inverse* pattern — the
same thread surfacing where the front has gaps. Same array, one `if`
on `kind`. One craft detail worth copying: the seam length is chosen
so the run starts *and* ends on a stitch — stitchers plan a seam to
come out even, and here that's one number.

<mini-workspace src="samples/post46/01-running-stitch.pathogen" caption="A running stitch is a dash pattern: 14 on top, 7 underneath." code-open></mini-workspace>

## Example 2 — One bit per row

Example 1's 14-on, 7-under is the classic sashiko proportion — the
stitch on top runs longer than the thread beneath. Hitomezashi is the
special case where stitch and space are *equal*, and that equality is
exactly what lets a half-cycle shift make neighboring rows interlock.
Which is hitomezashi's entire control surface: shift a row's pattern
by half a cycle, or don't. Six rows, six bits, `stroke-dashoffset: calc(bit * 16)`.
Where neighboring rows disagree, the stitches interlock.

<mini-workspace src="samples/post46/02-phase-rows.pathogen" caption="The same seam six times — the only difference is one bit of dash offset." code-open></mini-workspace>

## Example 3 — The full weave

Now both directions: sixteen rows and thirty columns, each line's bit
drawn from `hash01`. `round(hash01(rowIndex, 7))` is a repeatable
coin flip — a lookup, not a roll: the same index and seed produce the
same bit, every compile. Rows and columns draw from two *different*
seeds because the streams must be independent — a single seed would
hand row *i* and column *i* the same bit and print a diagonal
symmetry into the cloth. The stitch length equals the grid cell, so
horizontal and vertical stitches meet at corners — and the crosses,
steps, and boxes are all emergent.

<mini-workspace src="samples/post46/03-hitomezashi.pathogen" caption="hash01 decides each line's phase; the geometry decides everything else." code-open></mini-workspace>

The `sew` helper is the post's whole engine — dash the seam, keep the
dashes, place them at the line's anchor:

```pathogen
fn sew(seam, anchorX, anchorY, bit) {
  let stitches = seam.dash(#{
    stroke-dasharray: ${cell} ${cell};
    stroke-dashoffset: calc(bit * cell);
  });
  for (stitch in stitches) {
    if (stitch.kind == 'dash') {
      thread.apply {
        M anchorX anchorY stitch.path.draw()
      }
    }
  }
}
```

The style block reads the cell size from a variable, so pitch is one
knob.

## Example 4 — Stitches on curves

Nothing about a running stitch requires a grid. `dash()` measures
distance along the curve itself, not the straight line across it, so
stitches follow curves at even pitch for free —
here, staggered fans of stitched arcs make the classic seigaiha wave.

<mini-workspace src="samples/post46/04-seigaiha.pathogen" caption="Three arcs per fan, dashed at 7-and-4; the stagger makes the wave." code-open></mini-workspace>

## Example 5 — The mend patch

The finished artifact: a patch template at real pitch — one cell is
6&nbsp;mm, a common sashiko stitch length — with the seeds recorded on
the template itself, so any print of it carries its own provenance.
The stitched field is **138 × 90 mm** (5.4 × 3.5 in) — a jeans-knee
size — and the patch outline adds a 6 mm margin around it. Print it
scaled so the stitched field measures 138 mm across — measure, don't
trust a percentage — then transfer and stitch.

<mini-workspace src="samples/post46/05-mend-patch.pathogen" caption="A reproducible patch — open it in the playground and change either seed for a different fabric of blocks." code-open></mini-workspace>

## Where to go next

Everything here was one method — the
[`dash()` reference](/docs#path-blocks-dashstyles-array-of-path-kind-t0-t1)
covers the rest of its surface. The stitches here were centerlines —
ink where thread goes. The
[next post](/blog/broken-lines-leathercraft) moves to leather, where a
stitch is a *hole*: the dashes get shorter, `outline()` turns them
into punchable dots, and two mating seams have to agree hole-for-hole.

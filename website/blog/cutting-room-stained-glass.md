---
title: "Stained Glass: Seams as Leading, Pieces as Panes"
slug: cutting-room-stained-glass
date: 2026-08-27
description: "The Cutting Room finale: a rose window where the cut is the artwork — came stroked from the seam group, panes tinted by layer routing, labels from both boolean operands coexisting, and solder dots at every joint."
series: "The Cutting Room"
seriesPart: 4
---

*Part 4 of 4 in The Cutting Room — projects that put `cut()` and
segment labels to work together.*

> **Series: The Cutting Room**
> 1. [Papercraft](/blog/cutting-room-papercraft) — cut lines, fold
>    lines, and glue tabs from one plate
> 2. [Jigsaw](/blog/cutting-room-jigsaw) — wavy knives, piece identity,
>    and a scattered puzzle
> 3. [Garment patterns](/blog/cutting-room-garment) — named edges, seam
>    allowances, and notches
> 4. **Stained glass** (this post) — tinted panes, leading, and a rose
>    window

> **Prerequisites:** [`PathBlock.cut()`](/blog/pathblock-cutting) and
> [segment labels](/blog/segment-labels-and-suffixes). The
> [boolean operations post](/blog/pathblock-boolean-operations) helps
> for Example 4, and part 1's
> [seam-stroking idiom](/blog/cutting-room-papercraft) is assumed
> throughout.

## What it does

In every project so far, the seams were annotation — fold here, align
there. Stained glass inverts that: the seams *are* the picture. Lead
came is nothing but the network of joints between panes, which means a
stained-glass window is `segmentAll('cut')`, stroked wide, over pieces
that have been filled with color. The finale also brings in the last
label superpower this series has not used yet: **boolean results keep
the labels of both operands**, so a frame made by `difference()` still
answers for the outer shape's names *and* the opening's.

## Why you'd use it

Because "decorate every joint" is a one-loop job when joints are
queryable, and an evening of coordinate surgery when they are not.
The whole aesthetic rests on the idiom from part 1 — this time as the
main event rather than the annotation:

```pathogen
for (seam in placed.segmentAll('cut')) {
  seam.draw();    // stroked wide, this IS the leading
}
```

## Example 1 — Seams as the artwork

A glass disc, four straight knives through the center, eight panes.
The leading between panes is the seam group stroked at width 5 in the
background color — no leading was drawn as such; it is the cut,
made visible.

<mini-workspace src="samples/post44/01-rose-cuts.pathogen" caption="Eight panes; the came between them is segmentAll('cut') stroked wide." code-open></mini-workspace>

Compare part 1's Example 1, where the same query produced a thin amber
highlight. Same seams, same loop — the meaning of a seam is entirely
in how you draw it.

## Example 2 — Your own 'cut' label joins the came

`cut` is not a reserved word — it is an ordinary label the cut applies
for you, and labels with the same name form one group. So if you name
the disc's rim `as segment('cut')` yourself, the one came loop picks
it up with zero extra code. Left disc: rim labeled `'rim'`, and the
glass meets the stone bare. Right disc: rim labeled `'cut'`, full came.

<mini-workspace src="samples/post44/02-rim-joins-the-came.pathogen" caption="Same decoration loop on both windows; only the rim's label name differs." code-open></mini-workspace>

Note the labeling shortcut, too: an `as` clause on a stdlib call like
`circle()` names *everything the call draws*, so one clause labels the
whole rim — no need to author the arcs by hand.

## Example 3 — Tinted panes

The picture emerges. Pieces are full PathBlocks, so coloring them is
layer routing: four glass layers with jewel-tone fills, pieces dealt
round-robin, came stroked over the top. (The same routing pattern the
[cutting post](/blog/pathblock-cutting) used for its shattered glyph.)

<mini-workspace src="samples/post44/03-tinted-panes.pathogen" caption="Four glass layers, pieces routed by index, leading on top." code-open></mini-workspace>

Routing by index is the bluntest instrument — part 2 routed by *label*
(rim or not), and part 3 by *name*. Pick the classifier that matches
the design; the mechanism is the same `apply` block either way.

## Example 4 — The frame keeps both names

Boolean results carry labels from **both** operands. This window frame
is `outer.difference(opening)` — the outer square's bottom edge brought
`'sill'`, the opening's two side edges brought `'light'`, and the frame
answers for both names. Then a diagonal cut splits the frame, and
*each half* still answers for whatever it kept: the lower half holds
most of the sill, the upper half a shorter stretch of it, and each
keeps one of the opening's sides.

<mini-workspace src="samples/post44/04-frame-labels.pathogen" caption="difference() merges label sets; cut() distributes them to the halves." code-open></mini-workspace>

This is the compositional guarantee the whole series stands on:
labels survive *chains* of operations — draft, subtract, cut — not
just single steps.

## Example 5 — The rose window

The finale composes everything. One cutter block carries eight spoke
knives *and* a closed ring knife — a cookie cutter — so a single
`cut()` stamps out the golden center medallion and slices the
surrounding ring into eight panes. The spokes stop short of the ring,
leaving the medallion whole. Then:

- the **medallion** is found by classification — it is the piece that
  kept none of the rim label (part 2's trick, part 3's workflow);
- the **panes** are tinted by layer routing (Example 3);
- the **came** strokes two label groups — the healed seams and the
  authored rim — in one style;
- the **solder dots** sit at every seam's `startPoint` and `endPoint`,
  where real joints get soldered (on the medallion's closed boundary
  the two coincide — one dot, drawn twice, harmlessly).

<mini-workspace src="samples/post44/05-rose-window.pathogen" caption="One cut: cookie-cutter medallion plus eight spoke panes — came, tints, and solder all queried." code-open></mini-workspace>

Every technique in it was introduced as a bare mechanism somewhere in
these four posts. That is the shape of the whole series: the seams
know where they are, the pieces know what they kept, and everything
else is a loop.

## What this project taught the language

This series doubles as a working friction log (part 1 explains the
convention). The leading loop above originally read
`seam.drawTo(seam.startPoint.x, seam.startPoint.y)` — projected values
have since grown an in-place `draw()`, and every came stroke in this
post got one line simpler. Part 1's closing section tells the story;
the garment post's tells its darker sibling (the same expression
silently misplacing whole cut pieces).

## Where to go next

- Start over with [Papercraft](/blog/cutting-room-papercraft) if you
  arrived here first — the idioms build in order.
- [Cutting Paths](/blog/pathblock-cutting) — the full `cut()` rules:
  cookie cutters, donuts, open subjects, snapping.
- [Boolean operations](/blog/pathblock-boolean-operations) — union,
  difference, intersection, xor, and now with label carriage.
- Reference: [labels survive derived paths](/docs#segment-labels-labels-survive-derived-paths)
  and [cutting paths](/docs#path-blocks-cutting-paths) in the docs.

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

## Example 2 — Your own geometry joins the came

The seam group takes volunteers. `cut` itself is reserved — the
language stamps it on healed seams and won't let you author it, so
your geometry can never fuse *silently* into the seams — but
`cut.<name>` is the explicit opt-in: a label that says, out loud, "this
edge belongs with the seams." Name the disc's rim
`as segment('cut.rim')` and the one came loop picks it up with zero
extra code, because the umbrella query `segmentAll('cut')` answers the
whole namespace. Left disc: rim labeled `'rim'`, and the glass meets
the stone bare. Right disc: rim labeled `'cut.rim'`, full came — and
still addressable on its own as `segmentAll('cut.rim')` when the rim
needs its own pass, or arc by arc as `segmentAll('cut.rim:each')` via
[query pseudo-selectors](/docs#segment-labels-query-pseudo-selectors).
(See [label names](/docs#segment-labels-label-names) for the rules.)

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

The finale composes everything. The knives are built in a *loop* —
eight spokes pushed onto an array, plus a closed ring knife (a cookie
cutter) — and the whole set goes to one `cut([...])` call, which
stamps out the golden center medallion and slices the surrounding
ring into eight panes. The spokes stop short of the ring, leaving the
medallion whole. Then:

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

(The came loops in this post keep their per-piece form deliberately —
each pane declaring its own boundary *is* the teaching. When you want
each physical seam once instead — solder budgets, fold lines —
`pieces.seams()` now exists; part 1's closing section shows it.)

**And the rose window's knives became a loop.** The first version of
Example 5 hand-chained eight spokes in one cutter block — sixteen
lines of relative-move arithmetic between stroke endpoints, the same
bookkeeping that caused two authoring bugs elsewhere in the series.
`cut()` now [accepts an array of
cutters](/docs#path-blocks-cutcutter-array-of-pathblock), so the
spokes are pushed onto a list in a `for` loop and handed over in one
call — knife geometry you can *parameterize*. Change `0..7` to `0..11`
and the window grows four panes.

```pathogen
// before: one block, every m computed from the previous stroke's end
m calc(36 * cos45 - 112) calc(36 * cos45)
l calc(76 * cos45) calc(76 * cos45)
// ...six more chained pairs

// after: one knife per spoke, built in a loop
for (k in 0..7) {
  let spokeAngle = calc(k * PI() / 4);
  knives.push(@{
    m calc(36 * cos(spokeAngle)) calc(36 * sin(spokeAngle))
    l calc(76 * cos(spokeAngle)) calc(76 * sin(spokeAngle))
  });
}
let panes = disc.cut(knives);
```

**And Example 2's trick became a contract.** The rim-joins-the-came
demo originally leaned on an accident: `cut` was an ordinary label, so
naming your own geometry `'cut'` happened to merge it with the seams —
silently, and with no way back out. Working the friction log turned
the accident into [a named rule](/docs#segment-labels-label-names):
bare `'cut'` is now reserved (authoring it is a compile error), and
`cut.<name>` is the explicit opt-in the sample now uses. Same render,
byte for byte — but the rim reads as a decision instead of a
coincidence, and `segmentAll('cut.rim')` can still address it alone.

## Where to go next

- Start over with [Papercraft](/blog/cutting-room-papercraft) if you
  arrived here first — the idioms build in order.
- [Cutting Paths](/blog/pathblock-cutting) — the full `cut()` rules:
  cookie cutters, donuts, open subjects, snapping.
- [Boolean operations](/blog/pathblock-boolean-operations) — union,
  difference, intersection, xor, and now with label carriage.
- Reference: [labels survive derived paths](/docs#segment-labels-labels-survive-derived-paths)
  and [cutting paths](/docs#path-blocks-cutting-paths) in the docs.

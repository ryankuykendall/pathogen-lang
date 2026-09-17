---
title: "The Fretboard Is a Formula"
slug: the-fretboard-is-a-formula
date: 2026-09-20
description: "A fretboard placed from one scale length by the twelfth root of two, and a twin that numbers the frets, prints their distances, and fans at the end."
series: "Drawing Without Bookkeeping"
seriesPart: 5
---

*Part 5 of 5 in Drawing Without Bookkeeping — a form on one side, its
annotated twin on the other, and nothing copied between them.*

> **Series: Drawing Without Bookkeeping**
> 1. [Ask the Path](/blog/ask-the-path) — `query()` and `queryAll()`
> 2. [Thinking and Drawing in Parallel](/blog/thinking-and-drawing-in-parallel) — `subscribe()`
> 3. [A Linkage That Dimensions Itself](/blog/a-linkage-that-dimensions-itself) — a four-bar linkage
> 4. [The Panel Prints Its Own Drill Schedule](/blog/the-panel-prints-its-own-drill-schedule) — a Eurorack front panel
> 5. **The Fretboard Is a Formula** (this post) — a fretboard from one scale length

> **Prerequisites:** This post assumes the selector grammar from [Ask the
> Path](/blog/ask-the-path), the subscription model from [Thinking and
> Drawing in Parallel](/blog/thinking-and-drawing-in-parallel), and the
> millimetre trick from [part 4](/blog/the-panel-prints-its-own-drill-schedule):
> a group layer carries the page position and scale, and everything
> inside it is drawn in real units. The fretboard is long and thin, so
> the twin sits below the form instead of beside it.

A guitar's **scale length** is the vibrating length of an open string,
from the **nut** at the headstock end to the **saddle** at the bridge;
the saddle is then set a little past it for intonation, which is a
separate problem. Every fret follows from the scale length. Fret *n*
sits where the remaining string is *n* twelfths of an octave shorter,
which is the scale length divided by the twelfth root of two, *n* times
over. That root is about 1.0595, the step from one semitone to the next,
and twelve of them double the pitch. What the division takes off the
scale is the fret's distance from the nut:

```pathogen
fn fretFrom(scale, n) {
  return scale - scale / pow(2, n / 12);
}
```

That is the whole of equal temperament, and the whole of a fretboard
template. Builders get the numbers from a web calculator and mark the
board by hand. A **fanned-fret** or multi-scale instrument — a longer
scale on the bass side than the treble — doubles the arithmetic and the
chances of a slot in the wrong place. This post draws the board from the
formula and lets the twin do the luthier's tables.

## The form knows where the octave is

The form is a tapered outline and one slot per fret: a `for` loop over
22 frets, each slot a line from the top edge to the bottom edge at the
formula's *x*. The whole board is drawn in millimetres inside a scaled
group, and the nut is at *x* = 0. Every slot's *x* is therefore its
distance from the nut, with nothing to convert.

<mini-workspace src="samples/post56/01-bare-fretboard.pathogen" caption="Above: a 22-fret board for a 25.5-inch scale, 647.7 mm, tapering from 43 to 56 mm. Below: the slots layer asked for command(line) — 22 of them — and the twelfth, tinted, at half the scale length." code-open></mini-workspace>

The line under the second board is the octave check every luthier does
by eye. `command(line):nth(11)` is the twelfth slot; its `block` is
drawn back in gold and its `start.x` is 323.85, half of 647.7. Nothing
computed it twice.

## Numbered by ordinal

A subscription on `command(line)` delivers every slot in drawing order,
and its second parameter is the ordinal among the matches. The fret
number is that ordinal plus one, and the slot's own `start.x` is where
it goes:

```pathogen
slots.subscribe('command(line)') {|fret, i|
  numbers.apply {
    text(fret.start.x, -2.5)`${i + 1}`;
  }
};
```

<mini-workspace src="samples/post56/02-frets-numbered.pathogen" caption="One subscription on the slots layer: the ordinal plus one, placed at each slot's own x above the board." code-open></mini-workspace>

## The distance column

The table a luthier wants is the distance of every slot from the nut, to
a hundredth of a millimetre. It is the same subscription with a
different callback, and the number is `fret.start.x` itself. The label
hangs below its slot, turned a quarter turn at its anchor with the
third argument of `text()`, so 22 of them fit under a board 430 pixels
wide.

<mini-workspace src="samples/post56/03-distance-column.pathogen" caption="Every slot's distance from the nut, read from the slot and printed under it to 0.01 mm. The labels are turned −90° about their own anchors." code-open></mini-workspace>

There is no `toFixed`, so the samples carry part 4's `mm()` helper,
extended to two decimals and to negative numbers. Four lines became
thirteen; the friction log has said so twice now.

## Marker dots by range

Marker dots — the inlays on the face of the board that tell a player's
hand where it is — sit at frets 3, 5, 7, 9, 12, 15, 17, 19 and 21, and
the twelfth gets two. Two things about them are worth being precise
about. The frets themselves are picked with one `:nth` list, and `:nth`
counts from zero, so fret 3 is `:nth(2)`. A dot does not sit *on* its
fret. It sits in the space before it, halfway back to the previous slot,
on the board's centre line.

<mini-workspace src="samples/post56/04-marker-dots.pathogen" caption="command(line):nth(2, 4, 6, 8, 11, 14, 16, 18, 20) tints the nine marker frets. Each dot is placed halfway back to the previous slot, on the centre line the two slots' ends define; the twelfth gets two." code-open></mini-workspace>

The tint is a query drawn back onto the board: each match's `block` is
the slot on its own, and `fret.block.draw()` puts it down in place in
a second colour. The dots need the slot before as well as the slot
itself, so they come from the full list by fret number, which reads the
way a luthier would say it. That leaves the nine frets written twice,
once for `:nth` from zero and once from one, because `:nth` takes
literal indices; the friction log has the note.

## One scale length, or another

Change `scaleLength` and every slot, number and dot moves. The sample
draws two boards to make the comparison visible: a 25.5-inch scale on
top and a 24.75-inch scale below, the two most common choices, with the
same subscriptions and the same dot function on both.

<mini-workspace src="samples/post56/05-scale-length-wiggle.pathogen" caption="647.7 mm above, 628.65 mm below. The octave slot, tinted on both boards, moves from 323.85 to 314.33 mm; every slot, number and dot moves with it. No annotation code changed." code-open></mini-workspace>

## The fanned finale

A fanned-fret board has two scale lengths, one for each edge, and one
fret chosen to stand straight. Each slot runs from its bass-side
position to its treble-side position, and the treble side is shifted so
the chosen fret is perpendicular. The nut leans one way, the far end the
other, and every slot in between leans a little differently.

<mini-workspace src="samples/post56/06-fanned-finale.pathogen" caption="27 inches on the bass side, 25.5 on the treble, fret 7 straight. The same subscription numbers every leaning slot from its bass end; the first and last frets print their lean from their own tangents." code-open></mini-workspace>

The numbering did not change: a slot's `start` is still its bass end,
whatever angle the slot runs at. The lean of a fret is a new question,
and the struct answers it too. `fret.block.tangent(0).angle` is the
direction the slot runs, in radians. A straight slot points due down,
so the lean is `deg()` of that angle, less 90.

## What this project taught the language

This series doubles as a working friction log ([part
1](/blog/ask-the-path) explains the convention). Two entries this time,
and the first is a fix.

**A text layer's transform now reaches its text.** The distance column
was first written as a text layer turned a quarter turn with
`rotate: -0.5pi`, which the [layers
reference](/docs#layers-transform-convenience-properties) promises for
text layers. Every label came out unrotated. The evaluator computed the
transform and both emitters, the CLI's and the one the playground and
VS Code share, dropped it for text layers while honouring it for paths
and groups. Both now compose the layer's transform with a per-text
rotation. The samples ended up using that per-text form instead,
`text(x, y, -90deg)`, which turns each label about its own anchor and
is the better tool for a column of them.

**`:nth` takes literal indices.** The marker frets are written twice in
the fourth sample, `[3, 5, 7, 9, …]` for the dots and `:nth(2, 4, 6,
8, …)` for the tint, and the two lists are kept in step by hand. A
selector that accepted a list value, or an interpolated `:nth`, would
collapse them into one. The same sample also shipped a wrong lean
before `mm()` learned to keep a minus sign, which is the `toFixed`
entry from part 4 coming due.

## Where the series lands

Five posts, thirty samples, and one rule held throughout: the twin
never repeats a coordinate. Queries ask a path for things by kind and
get back structs that know their own geometry; subscriptions let the
asking happen wherever the drawing does. A linkage dimensioned itself,
a panel printed its own drill schedule, and a fretboard placed itself
from a formula. The friction log along the way turned into seven
evaluator fixes and two in the tooling, and a short list of things the
language still wants:
a circle-meets-circle helper, `toFixed`, per-subpath markers, a column
primitive for text.

The reference pages are [Path Queries](/docs#path-queries-path-queries)
and [Subscriptions](/docs#subscriptions-subscriptions). Every sample
above opens in the playground with one click: change the scale length
and watch the board re-solve.

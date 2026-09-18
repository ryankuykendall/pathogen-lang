---
title: "The Panel Prints Its Own Drill Schedule"
slug: the-panel-prints-its-own-drill-schedule
date: 2026-09-19
description: "A Eurorack front panel drawn in millimetres, with HP as the only parameter, that numbers its holes and prints the drill schedule the shop needs."
series: "Drawing Without Bookkeeping"
seriesPart: 4
---

*Part 4 of 5 in Drawing Without Bookkeeping — a form on one side, its
annotated twin on the other, and nothing copied between them.*

> **Series: Drawing Without Bookkeeping**
> 1. [Ask the Path](/blog/ask-the-path) — `query()` and `queryAll()`
> 2. [Thinking and Drawing in Parallel](/blog/thinking-and-drawing-in-parallel) — `subscribe()`
> 3. [A Linkage That Dimensions Itself](/blog/a-linkage-that-dimensions-itself) — a four-bar linkage
> 4. **The Panel Prints Its Own Drill Schedule** (this post) — a Eurorack front panel
> 5. [The Fretboard Is a Formula](/blog/the-fretboard-is-a-formula) — a fretboard from one scale length

> **Prerequisites:** This post assumes the selector grammar from [Ask the
> Path](/blog/ask-the-path), the subscription model from [Thinking and
> Drawing in Parallel](/blog/thinking-and-drawing-in-parallel), and the
> `call` noun in particular: everything one statement drew, as one match.
> The panel idiom is the series': a form on the left, its twin on the
> right. Group layers and their `scale` are in the
> [layers reference](/docs#layers-transform-convenience-properties).

A **Eurorack** module is a circuit behind a front panel, and the panel is
a constraint grid. It is **3U** tall, three rack units, which the rail
standard makes 128.5 mm. Its width is a whole number of **HP**, horizontal pitch, at
5.08 mm each, less a hair of clearance. Two **rail slots** near the top
and bottom edges take the mounting screws, at positions the standard
fixes from the left edge; wide panels get a second pair. Then come the
holes that matter to the circuit: jacks, pots, a LED. Builders keep these
numbers in wiki tables and re-derive them per module.

The one artifact the panel shop needs is the **drill schedule**: a table
of hole numbers, diameters and centre coordinates, in millimetres. Today
it is typed out by hand from the drawing, and it is wrong the moment a
jack moves. This post draws the panel as a form and lets the twin print
the schedule.

## Drawn in millimetres

Every sample draws the panel in millimetres. A group layer carries the
page position and a `scale` of 1.4, and everything inside it is authored
in real units:

```pathogen
let rightPanel = GroupLayer('right') #{
  translate-x: 220;
  translate-y: 40;
  scale: 1.4;
};
```

Layer records are kept in the layer's own coordinates, so a query on a
layer inside that group answers in millimetres, and a text layer inside
the group prints them without conversion. The schedule is true because
nothing between the hole and the table ever multiplied by 1.4. Hole 1
reports x = 15.1 in the schedule, which is millimetres across the panel.
On the page that same hole sits 21.1 units from the panel's left edge,
and no query ever sees that number.

The form itself is short. One number at the top, `hp`, sets the width.
A `slot()` function draws a rail slot where the standard puts it, and
`drawHoles()` places every control on quarters of whatever the width
turns out to be, each one a `circle()` call named where it is drawn:

```pathogen
circle(mid, 24, 3.5) as segment('rate');
circle(left, 82, 3) as segment('in');
```

The third argument is a radius, so those are the ⌀7 hole a 9 mm pot
needs and the ⌀6 a 3.5 mm jack needs; the LED is ⌀3.

<mini-workspace src="samples/post55/01-bare-panel.pathogen" caption="Left: a 6HP panel — outline, two rail slots, nine holes — from one number. Right: what the holes layer reports when asked for call(circle), call(slot) and segment, with the size the form was built from underneath." code-open></mini-workspace>

Read the right panel's third line. The slots were drawn by a function
called `slot`, and a `call` is the statement you wrote, so they answer
to `call(slot)` and never get mixed in with the circles. That is the
rule part 1 stated as a caveat, doing useful work. The circles sit
inside `drawHoles()` too, and they still answer to `call(circle)`:
statements written inside a layer's own `apply` block are that layer's
calls, wherever the block was opened. It is the call inside `slot()`
that is hidden behind the function's name.

## Numbered in drawing order

A subscription on `call(circle)` delivers each hole as it was recorded.
The callback gets the hole's block, and the block knows its centre and
its bounding box, which is to say the hole's position and diameter:

```pathogen
rightHoles.subscribe('call(circle)') {|hole, i|
  let centre = hole.block.centerPoint();
  let r = hole.block.boundingBox().width / 2;
  ...
};
```

<mini-workspace src="samples/post55/02-holes-numbered.pathogen" caption="One subscription on call(circle): a centre cross through every hole and its number just outside the rim, in drawing order. The slots are not circles and are left alone." code-open></mini-workspace>

The variable is `centre` and not `c`, for the reason part 3 gave: in
path-argument position, `c` is the cubic command.

## The schedule

The schedule is a query over the same layer, printed as a table in a
monospace text layer inside the group. Each row is the hole's number,
its diameter from the block's bounding box, and its centre. The numbers
are rounded to a tenth of a millimetre by a four-line `mm()` helper,
because there is no `toFixed` yet, and the friction log says so.

<mini-workspace src="samples/post55/03-drill-schedule.pathogen" caption="The drill schedule the panel shop needs: number, diameter, x and y for every hole, plus the slot count and the panel size, every value read from the holes layer in millimetres." code-open></mini-workspace>

Nothing in the table was typed, the slot size in the footer included:
it is the bounding box of the first `call(slot)`. Move a jack in
`drawHoles()` and its row follows; add a hole and the table grows by
one.

## The legend

The **legend** is the printing on the panel itself: a name under every
control and a scale arc round every pot, the 270° sweep with a tick at
each end and one at noon. The names came from the form, where every `circle()` was drawn
`as segment('…')`, so the twin asks for `segment` and gets the label
with the block. The pots are `segment(rate), segment(depth)`, and the
arc's radius is the hole's own radius plus a margin.

<mini-workspace src="samples/post55/04-legend-layer.pathogen" caption="The legend layer: a name under every named control, and a scale arc with three ticks round each pot, both placed from the hole's centre and diameter." code-open></mini-workspace>

## HP is the parameter

Change `hp` from 6 to 10; nothing about the panel is touched. The page
positions shift a little to fit the wider outline. The outline widens to
50.5 mm and the two jack columns re-flow onto the wider quarters. From
10 HP the sample adds a second pair of rail slots at the right edge, the
way wide panels are usually mounted. The schedule prints the new
coordinates.

<mini-workspace src="samples/post55/05-hp-wiggle.pathogen" caption="The same file at hp = 10: a wider outline, four rail slots, the columns re-flowed, and a schedule with the new coordinates and the new slot count. Nothing in the panel's own definition changed." code-open></mini-workspace>

## The handoff

Two drawings from one source, side by side: the panel the builder sees,
with its legend, and the drill drawing the panel shop gets, with its
numbered holes and its schedule. The left panel is no longer the bare
form. It is the form plus its legend, which is what the builder is
handed.

<mini-workspace src="samples/post55/06-handoff.pathogen" caption="Left: the finished panel with its legend. Right: the drill drawing with numbered holes and the schedule. One form, two audiences, no copying." code-open></mini-workspace>

## What this project taught the language

This series doubles as a working friction log ([part
1](/blog/ask-the-path) explains the convention). The panel was gentler
than the linkage: two entries, both about numbers as text.

**There is no `toFixed`.** A drill schedule wants `7.0`, not `7`, and
`22.6`, not `22.60000000000001`. `round()` gives an integer, so the
samples carry a nine-line `mm()` helper that rounds to tenths, keeps the
sign, and glues the whole and the fraction back together. It is fine for
one decimal and tedious for three, and its first draft was wrong for
negative numbers, which part 5's fanned board found. A `toFixed(n)` on
numbers, or a format argument on `text`, is the obvious addition.

**Per-text styles exist, and the samples missed them.** The schedule
wanted right-aligned numbers beside a left-aligned footer, and the
samples answer with two text layers, because `text-anchor` looked like a
layer property. It is also a per-call one: `text()` takes an optional
style block as its fourth argument, `text(x, y, 0deg, #{ text-anchor:
end; })`. The layers reference says so, in a section two hundred lines
below the one that introduces `text()`, and that introduction now points
at it. A column primitive, tab stops on a text layer, would still spare
a table its arithmetic, and it is logged.

## Where to go next

Part 5 ends the series on the luthier's bench: a fretboard whose every
slot is placed from one scale length by the twelfth root of two. The
twin numbers the frets, prints their distances from the nut, and drops
the marker dots by `:nth` range, then does it all again for a
fanned-fret board with two scale lengths.

The reference pages are [Path Queries](/docs#path-queries-path-queries)
and [Subscriptions](/docs#subscriptions-subscriptions). Every sample
above opens in the playground with one click: change `hp` and watch the
schedule follow.

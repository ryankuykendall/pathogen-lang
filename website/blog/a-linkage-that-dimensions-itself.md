---
title: "A Linkage That Dimensions Itself"
slug: a-linkage-that-dimensions-itself
date: 2026-09-18
description: "A four-bar linkage drawn once, and a twin that names its pivots, dimensions its links and runs the Grashof test on numbers it asked for."
series: "Drawing Without Bookkeeping"
seriesPart: 3
---

*Part 3 of 5 in Drawing Without Bookkeeping — a form on one side, its
annotated twin on the other, and nothing copied between them.*

> **Series: Drawing Without Bookkeeping**
> 1. [Ask the Path](/blog/ask-the-path) — `query()` and `queryAll()`
> 2. [Thinking and Drawing in Parallel](/blog/thinking-and-drawing-in-parallel) — `subscribe()`
> 3. **A Linkage That Dimensions Itself** (this post) — a four-bar linkage
> 4. [The Panel Prints Its Own Drill Schedule](/blog/the-panel-prints-its-own-drill-schedule) — a Eurorack front panel
> 5. [The Fretboard Is a Formula](/blog/the-fretboard-is-a-formula) — a fretboard from one scale length

> **Prerequisites:** This post assumes the selector grammar from [Ask the
> Path](/blog/ask-the-path) and the subscription model from [Thinking and
> Drawing in Parallel](/blog/thinking-and-drawing-in-parallel), and it
> reuses their panel idiom: a form on the left, a twin on the right, both
> drawing the same block. Labels are the `as segment(...)` and
> `as endpoint(...)` clauses from [Name Your
> Corners](/blog/segment-labels-and-suffixes).

A four-bar linkage is four bars and four pivots. Two pivots are fixed to
the **ground**; the **crank** turns about one of them, the **rocker**
swings about the other, and the **coupler** joins the two moving ends.
It is the first mechanism in every kinematics course and the drive
behind windscreen wipers, bicycle brakes and a good share of robot
grippers. The drawing a teacher or a robotics mentor hands out is not
the linkage but the *dimensioned* linkage. Every pivot is named, every
bar carries its length, the crank angle is marked, measured from the
ground line, and the whole thing is checked against the one rule that
says whether the shortest bar can turn all the way round.

Today that drawing is made twice. The bars go in one tool, the callouts
go on by hand, and the two part company the moment a link length
changes. This post builds the linkage as a form and lets the twin
annotate it entirely from what the form knows about itself. Four lengths
and an angle at the top of every file are the whole design:

```pathogen
let ground = 120;
let crank = 35;
let coupler = 95;
let rocker = 70;
let crankAngle = 60deg;
```

Change any of them and everything on the right re-solves; the first
sample below is the place to try it.

## The form knows its own numbers

The form is a labelled path block. Each bar is a relative line, each bar
is named `as segment`, and each bar ends at a pivot named `as endpoint`:

```pathogen
return @{
  l toA.x toA.y as segment('crank'), endpoint('A');
  l toB.x toB.y as segment('coupler'), endpoint('B');
  l toO4.x toO4.y as segment('rocker'), endpoint('O4');
  z as segment('ground'), endpoint('O2');
};
```

The pivot positions come from a small solver above it. The crank end is
trigonometry; the coupler end is where the coupler's reach from that
point meets the rocker's reach from its ground pivot, which the law of
cosines settles in a few lines. The names `pinA` and `pinB` are not a
stylistic choice: `A` alone is the arc command, and the friction log
below has more to say about that.

<mini-workspace src="samples/post54/01-bare-linkage.pathogen" caption="Left: the form, drawn from four numbers. Right: the same form asked for segment — one line per named bar, with the length the bar already knows." code-open></mini-workspace>

The right panel is the first annotation and the smallest: `queryAll('segment')`
returns the four bars in drawing order, each with its label and its
length, and a loop prints them level with the bars they describe.
Nothing on the right knows the number 95; it asked.

## Pivots, named where they were drawn

The pivot names came from the form, so the twin only has to put them
somewhere sensible. A subscription on the twin's bars layer delivers
each `Endpoint` with its label. The direction to push the name is the
one from part 2: the incoming bar's end tangent, turned by half the
joint's own `turn`, which points away from the bars whichever way the
linkage bends.

<mini-workspace src="samples/post54/02-pivots-named.pathogen" caption="One subscription on endpoint: a dot at every pivot and its own label beside it, pushed outward along the joint's bisector. O2 and O4 are the fixed pivots, A and B ride the bars." code-open></mini-workspace>

## A dimension line, written once

A **dimension line** is the drafting convention for "this is how long":
a line parallel to the bar, an arrowhead at each end, short **extension
lines** reaching toward the bar with a small gap, and the value beside
it. The post writes one function for it, and the function takes a
`Segment`, not coordinates:

```pathogen
fn dimension(link, offset) {
  let bar = link.commands[0];
  let barNormal = link.block.normal(0.5);
  ...
}
```

Everything the drawing needs is on that struct. The bar's `start` and
`end` place the extension lines. Its `length` is the value. Its `label`
is the caption. `link.block.normal(0.5)` gives the same side of every
bar relative to travel, which for a loop drawn this way is the outside,
so one call dimensions a bar that runs left, right, up or at 23 degrees.
The arrowheads are one small block with its tip at the origin, rotated
into place at each end.

<mini-workspace src="samples/post54/03-link-dimensions.pathogen" caption="dimension(link, 12) called once per segment. The extension lines, the arrows and the value all come from the bar's own ends, length, label and normal — the offset is the only thing passed in." code-open></mini-workspace>

## Two angles

The **crank angle** is measured at the crank's ground pivot, from the
ground line to the crank. Both directions are on the pivot:
`query('endpoint(O2)')` returns it, `next` is the bar that leaves and
its start tangent is the crank's heading, `command` is the ground bar
arriving and its end tangent, reversed, is the ground line. An arc from
the one to the other, the short way round, is the textbook mark.

The second angle is the one that decides whether the mechanism is any
good. The **transmission angle** is the angle between the coupler and
the rocker at pivot B. Force passes from one to the other through it,
and when it drops toward zero the rocker binds instead of moving; a rule
of thumb keeps it between 40 and 140 degrees, no more than 50 degrees
away from square. The path already turns at B by some
amount, and the transmission angle is what is left of a straight line
after that turn.

<mini-workspace src="samples/post54/04-crank-angle.pathogen" caption="Left: the form. Right: the crank angle at O2 between the ground bar's heading and the crank's, and the transmission angle at B from the joint's turn — 79°, comfortably inside the 40°–140° rule of thumb." code-open></mini-workspace>

Both arcs come from one helper that takes a centre and two headings.
The transmission angle is `180° − |turn|`, printed by the note without
the arc ever being measured.

## Five positions, no new code

This is the sample that argues for the whole series. A loop draws four
more positions, 72 degrees apart, into a ghost layer, with the working
position drawn on top. The annotation code is the subscription from
part 2, narrowed to the two moving pivots and pointed at the ghost layer
as well as the bars. Every moving pivot of every position gets its ring,
and each ghost crank is labelled with the angle read from the bar that
arrives at it.

<mini-workspace src="samples/post54/05-five-positions.pathogen" caption="Four ghosts from one loop, the working position on top. The same endpoint subscription rings every moving pivot of every position; a query for endpoint(B) traces the arc B rides about O4." code-open></mini-workspace>

The dashed trace is a query, not a subscription: after the loop,
`queryAll('endpoint(B)')` on the ghost layer returns every B in
crank-angle order, and a polyline through them is the arc B rides about
O4, the rocker's swing sampled four times. Add a fifth ghost to the
loop and both the rings and the trace follow.

## The worksheet

The finished figure puts everything on one twin: names, four dimension
lines, both angles, and a verdict. The **Grashof condition** is the rule
that says whether the shortest bar can rotate fully: the shortest plus
the longest must not exceed the sum of the other two. The twin sorts the
four lengths it queried and prints the test with its numbers.

<mini-workspace src="samples/post54/06-worksheet.pathogen" caption="Every number on the right was asked of the form on the left. The note runs the Grashof test on the four queried lengths: 35 + 120 ≤ 165 holds, and since the shortest link is the crank, this is a crank-rocker and the crank turns all the way round." code-open></mini-workspace>

Change `crank` to 60 at the top of the file. The pivots move, the
dimension values change, the two angles re-solve, and the note reads
`non-Grashof: 60 + 120 ≤ 165`, the test it just failed. That is the
whole reason to build the drawing this way.

## What this project taught the language

This series doubles as a working friction log ([part
1](/blog/ask-the-path) explains the convention). The linkage was the
first form built as a labelled block and drawn twice, and it found more
than the first two posts together.

**Labels now travel with a drawn block.** The form is a labelled `@{ }`
block, drawn into each panel's bars layer with `M 16 100 form.draw()`,
and the twin asks that layer for `endpoint(A)`. The first attempt
answered "available endpoint labels: none". The relative serializer had
carried every label in the commands it tracked, but only the emitted
text reached the layer's record, which re-parsed it from scratch. Part 1's
comb never noticed because its labels were authored inside the layer's
own apply block. The statement now keeps its arguments' tracked commands
and copies their labels back onto the parsed ones by position. [Labels
travel with their block](/docs#segment-labels-segment-labels-corner-suffixes)
through `draw()` and `drawTo()` alike, and a block's corner operations
are not applied a second time on the way in.

**`A` is the arc command.** Every kinematics text names the moving
pivots A and B, and `L A.x A.y` inside a block is a parse error, because
in path-argument position a single letter that is a path command is the
command. The same rule caught a test that named a lambda parameter `s`.
So the pivots are `pinA` and `pinB` in code and `'A'` and `'B'` in their
labels, and the first sample says so in a comment. Not a bug, but the
domain post has to say it early.

**There is no circle-meets-circle, and blocks are relative-only.** The
solver needs the point where the coupler's reach meets the rocker's
reach; `intersectionPoints()` works on bounding boxes, so the samples
use the law of cosines. A block also cannot be written from absolute
pivots, so each bar is the step from the pivot before it. Both are
documented; both are exactly the arithmetic the series promised to take
away. A `Command.heading` member would also spare the samples
`pivot.next.block.tangent(0).angle`.

**Markers are per element, not per subpath.** The first dimension lines
used `marker-start` and `marker-end` for the arrowheads, and four lines
in one layer got two arrows, at the first vertex of the first line and
the last vertex of the last. The samples rotate one arrowhead block into
place instead. A layer option that emits each subpath as its own element
when markers are set is the language-side answer, and it is logged.

**Two gates in the sample pipeline were wrong, and both are fixed.** The
first validation of this post's six figures reported 51 collisions,
because the check compared each label with the bounding box of a whole
path, and a label inside the linkage's hull overlaps the bars' box. It
now samples the label's rectangle against the geometry's real stroke
and fill, and the same six figures report none. Then a slip in how the
samples were generated left `#{{ … }}` around ten style blocks, and the
formatter rewrote every one as `#{}` and reported success: it falls back
to an error-recovery parse so a missing semicolon can still be
formatted, and the recovered tree simply omitted the unparseable text.
The playground and VS Code format through the same function. It now
refuses when the recovery skipped real text. One more gate came out of
the review: a label that strays across the panel divider is invisible to
an area test, so the validator now flags any text crossing a hairline
divider.

## Where to go next

Part 4 leaves the classroom for the workbench. A Eurorack front panel
prints its own drill schedule from `queryAll('call(circle)')`, the table
of hole numbers, diameters and coordinates the panel shop needs.

The reference pages are [Path Queries](/docs#path-queries-path-queries)
and [Subscriptions](/docs#subscriptions-subscriptions). Every sample
above opens in the playground with one click: change a link length at
the top and watch the worksheet re-solve.

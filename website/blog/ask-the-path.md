---
title: "Ask the Path"
slug: ask-the-path
date: 2026-09-16
description: "query() and queryAll() ask a path for things by kind — every arc, every corner, everything one circle() drew — and hand back objects that know their own geometry."
series: "Drawing Without Bookkeeping"
seriesPart: 1
seriesDescription: "Drawing and designing in parallel: a form on one side, its schematic twin on the other, nothing copied between them. Queries, subscriptions, then a linkage, a front panel and a fretboard."
---

*Part 1 of 5 in Drawing Without Bookkeeping — a form on one side, its
annotated twin on the other, and nothing copied between them.*

> **Series: Drawing Without Bookkeeping**
> 1. **Ask the Path** (this post) — `query()` and `queryAll()`
> 2. [Thinking and Drawing in Parallel](/blog/thinking-and-drawing-in-parallel) — `subscribe()`
> 3. [A Linkage That Dimensions Itself](/blog/a-linkage-that-dimensions-itself) — a four-bar linkage
> 4. [The Panel Prints Its Own Drill Schedule](/blog/the-panel-prints-its-own-drill-schedule) — a Eurorack front panel
> 5. [The Fretboard Is a Formula](/blog/the-fretboard-is-a-formula) — a fretboard from one scale length

> **Prerequisites:** This post assumes [path block
> basics](/blog/pathblock-introduction) — the `@{ }` sigil, `draw()`,
> `drawTo()` — and the `as segment(...)` / `as endpoint(...)` clauses from
> [Name Your Corners](/blog/segment-labels-and-suffixes). Labels are
> optional here: most of what follows needs none.

Every sample in this series has the same shape. On the left, a **form**:
the thing being drawn. On the right, its **twin**: the same form again
with schematic information on top — dots, centres, boxes, tints. The
rule is that the twin never repeats a coordinate. Whatever it knows about
the form, it asked for.

Here is the smallest version of that rule. A tab with two arcs, and a dot
on every corner. The left panel types six coordinates a second time. The
right panel asks:

```pathogen
rightDots.apply {
  for (corner in rightForm.queryAll('endpoint')) {
    circle(corner.x, corner.y, 3);
  }
}
```

<mini-workspace src="samples/post52/01-twice-vs-once.pathogen" caption="Left: six circles, six coordinates copied by hand. Right: one queryAll('endpoint') — change the tab and the dots follow." code-open></mini-workspace>

`queryAll` returns one **Endpoint** per drawing command, in drawing
order. Each one knows its `x` and `y`, the command that ends there, the
command that leaves, and the turn the path makes at that point. That is
the whole idea: you ask a path for things by *kind*, and what comes back
already knows its own geometry. The reference is the [Path Queries
docs](/docs#path-queries-path-queries); this post is about what it
unlocks.

## Before you lean on it

The sharp edges first, so nothing below feels like a trick.

- **Queries answer finished geometry.** A corner rounded by `with fillet`
  has already been rounded when you ask; the arc the fillet inserted is a
  real arc and `command(a)` will find it, and `endpoint(name)` on that
  corner answers the trimmed tangent point, not the joint you typed. The
  older `point('name')` keeps its documented preference for the sharp
  corner; `query` does not.
- **`endpoint` skips pure moves.** A move is where drawing starts, not
  where anything ends. A `z` that has length counts.
- **Coordinates come from the receiver.** A `PathBlock` answers relative
  to its own origin; a layer, or the `ProjectedPath` that `drawTo()`
  returns (the block once it is placed on the page), answers in page
  coordinates. Every twin here asks the form where things are, so none
  of them re-types a coordinate the form already knows.
- **`query` insists, `queryAll` doesn't.** `query` returns one match and
  errors if there is none, listing what the path actually has, so a typo
  is caught where you wrote it. `queryAll` returns an array, empty if
  nothing matched, so it loops safely over things that might not exist.
- **Command letters are case-insensitive.** Path blocks report lowercase
  relative commands whatever you typed, so `command(a)` and `command(A)`
  mean the same arcs.

## Ask by kind

Five nouns cover everything a path is made of. Each takes, in
parentheses, the natural way to name some of its kind:

- `command(a)` — by letter, or by shape word: `line`, `arc`, `curve`
- `call(circle)` — by the function that emitted it
- `segment(rib)` — by the label you gave the run
- `endpoint(base)` — by the label you gave the joint
- `subpath(1..2)` — by position

Leave the parentheses off and you get all of them.

The first noun is the one that makes labels optional. An arc command
carries its radii and flags; the `Command` it returns adds the centre
those imply.

<mini-workspace src="samples/post52/02-every-arc.pathogen" caption="command(a) finds five arcs — the two drawn, the one the fillet inserted, and the circle's two halves — and each one knows its own centre." code-open></mini-workspace>

Read the count on the right. Two arcs were typed. The `with fillet(16)`
on the closing edge added a third when the path was finished, and
`circle()` emits two half-circles, so the query reports five. Nothing
was labelled; nothing was counted by hand. Each spoke runs from the arc's
midpoint to `arc.center`, two things the same result knows — a result is
a *struct*, a small object whose members you read with a dot.

## Labels through the same grammar

Labels did not go anywhere. They are the argument to `segment` and
`endpoint`, mirroring the way you wrote them: `as segment('tooth')` is
asked back with `segment(tooth)`, `as endpoint('root')` with
`endpoint(root)`. A space between two parts means *inside*: the right
part is searched only within the left, exactly as a CSS descendant
selector reads.

<mini-workspace src="samples/post52/03-labels-through-query.pathogen" caption="segment(tooth) tints each labelled run; segment(tooth) endpoint finds the tip at the end of each run; endpoint(root) finds the joints by their own name." code-open></mini-workspace>

The middle query is the one to notice. `segment(tooth) endpoint` is "the
joint at the end of each tooth," and it works because a `Segment` is a
run of commands and an `Endpoint` belongs to the command it ends. No
index, no offset, no counting teeth.

## Everything one statement drew

Shape functions emit several commands at once: a `circle()` is a move and
two arcs, a `roundRect()` is lines and quadratics. The `call` noun groups
commands by the statement that produced them, which is usually the unit
you were thinking in.

<mini-workspace src="samples/post52/04-what-a-call-drew.pathogen" caption="queryAll('call') returns one Call per statement, each with the commands it emitted, a block to measure, and the name of the function that drew it." code-open></mini-workspace>

Each `Call` carries `name`, its `commands`, and a `block` you can measure
or redraw. The twin draws a box around every statement's bounding box
and leads a label out to the side. `call(circle)` narrows to the three
circles; `call(circle) command(a)` is their arcs. One rule to know: a
call is the statement you wrote. A `circle()` inside a function you
called is reachable as `call(myFn)`, not as `call(circle)`.

## Filters, and ranges the language already knows

Square brackets test one scalar property of each match, with the
comparison operators you expect. Position pseudo-selectors pick from
whatever list the rest of the query built, and `:nth` takes the same
spellings `for` loops and `.slice()` use: a single index, `a..b`,
`a..<b`, and negative numbers that count from the end.

<mini-workspace src="samples/post52/05-filters-and-ranges.pathogen" caption="Three queries on three squares: command(line, close)[length>40] tints every edge longer than 40 — the closing edge counts when it has length — subpath(1..2) fills the second and third runs, endpoint:nth(-3..-1) marks the last three corners drawn." code-open></mini-workspace>

`:nth` counts inside whatever came before it. `subpath(1) command:nth(0)`
is the first command *of that subpath*; `command:nth(0)` is the first
command of the whole path. The [docs](/docs#path-queries-subpath-versus-commandnth)
walk through a three-square example if the distinction is not yet
sitting right.

## Same word, two jobs

There is a `subPath()` method on path blocks that predates all of this,
and it does something different: it slices a path between two arc-length
fractions. The `subpath` noun selects whole pen-down runs, the SVG
notion: a run starts at every move, and again after a `z` if drawing
continues without one. One word, two unrelated jobs, and both are useful.

<mini-workspace src="samples/post52/06-subpath-vs-subPath.pathogen" caption="Middle: the subpath noun, one colour per run. Right: subPath(0.2, 0.7), a slice by arc length that crosses from the square into the curve — the move between them survives." code-open></mini-workspace>

If you want a run, ask with the noun. If you want twenty to seventy
percent of the ink, call the method.

## What comes back

Every result is a struct: read members with `.`, or destructure with
`let { x, y } = corner;`. `Command` has the command letter, `args`,
`start` and `end`, `index`, `length`, a one-command `block`, its labels,
and kind-specific members — `cp1` and `cp2` for cubics, `cp` for
quadratics, `rx`, `ry`, `rotation`, `largeArc`, `sweep` and `center` for
arcs. `Endpoint` has `point`, `label`, `command`, `next`, `turn` and
`isJoint`, plus the corner operations the old vertex handle had. `Call`,
`Segment` and `Subpath` each carry their commands and a block. The full
tables are in [What comes back](/docs#path-queries-what-comes-back).

Two consequences fall out. `PathBlock.commands` now returns the same
`Command` struct, so a program that read `cmd.end` before keeps working
and now also sees labels. And `segment()`, `point()` and `vertex()`, the
label shortcuts from [Name Your Corners](/blog/segment-labels-and-suffixes),
are unchanged — they are the shortest spelling when all you want is a
labelled block or point, and the docs list [what each is sugar
for](/docs#path-queries-the-legacy-methods).

## What this project taught the language

One more thing this series is: a **working friction log**. Every sample
was built against the real language, and where one exposed a bug or a
missing piece, the fix went back into Pathogen before the post shipped.
Each post grows this closing section to tell that story, ordered by the
example that hit it.

**The one-line draw idiom started recording what it draws.** Every
panel in this post draws its form with `M 0 0 tab.draw()` on one line,
the spelling the formatter itself produces. The layer's emitted path was
always right, but its structured record kept only the `M`, and the
block's commands were tracked from the pen position *before* the move.
So the first twin had no dots: `queryAll('endpoint')` found nothing past
the move, and `ctx.position` after the statement sat at the move rather
than the block's end. The evaluator now snapshots the context before a
command's arguments evaluate and replays the whole emitted fragment in
order when an argument drew something. [Path
Queries](/docs#path-queries-path-queries) and every layer query since
depend on it.

**A circle finally measures its circumference.** The second sample's
note originally read the circle's `length` back to prove the arc struct
was real, and the number was `4r`. Arc length had always been taken from
the chord alone, so a half circle counted as its diameter and a large arc
as its minor complement. Arcs now go through the same endpoint-to-centre
solver that gives `Command.center`: circular arcs exactly, elliptical
ones by integrating the true speed. `partition()` and `get(t)` on a path
that mixes lines with half circles weight the arc correctly for the first
time. Published sample output was byte-identical before and after.

**Blocks taken from a layer draw in place whatever case you typed.**
The faint `subpath(1..2)` fills in the fifth sample first landed nowhere
near their squares. A run copied from a layer keeps the letters you
authored, and the relative serializer compared them case-sensitively, so
a run beginning with your `M` was emitted with an absolute letter and
relative numbers. It compares lowercase now, which also fixes an
uppercase `L` in a `segment()` drawn in place.

**`subPath()` keeps the move between runs.** The sixth sample's slice
crosses from the square into the curve, and the first render drew a
straight line across the gap. Moves had been filtered out to measure arc
length and never put back, so the second run's curve was spliced onto the
end of the first run's `z`. A gap between fragments is now a move. And
when a slice cuts a closed run short, its `z` now closes the run's real
edge rather than snapping back to the slice's own start, which is what
the right-hand panel shows.

```pathogen
// before: the slice ran the curve from where the z ended
l 0 34 h -40 z c 1.78 -10.19 3.66 -16.97 5.65 -21.26

// after: the close is a real edge, the move survives, the curve starts where it should
l 0 34 h -40 l 0 -54 m 56 54 c 1.78 -10.19 3.66 -16.97 5.65 -21.26
```

**Two members had to dodge keywords.** `fn` and `layer` are reserved
words, so the obvious `call.fn` and `subscription.layer` cannot be
parsed after a dot. The members are `Call.name` and, in the next post,
`Subscription.source`. The docs say so where each struct is listed.

**The design system and the style sanitizer disagreed about fonts.** The
example design system asks for a quoted font stack; the style-value
allow-list rejects the quotes. Every sample here binds a bare
`sans-serif`, as the published samples before it quietly did. One of the
two documents is wrong, and that is logged rather than papered over.

## Where to go next

Part 2 lets a layer answer these questions by itself: `subscribe` a
selector to a layer and the twin's annotations are drawn for you once the
program finishes, once per match, in drawing order, wherever in the
program the drawing happened. The finished pieces start in part 3, where
three projects put both to work: a linkage, a front panel, a fretboard.

The reference is [Path Queries](/docs#path-queries-path-queries). Every
sample above is live in one step: the code panel is read-only, but the
"Open in playground workspace" button drops it into an editor where you
can add a command, move a corner, change a radius, and watch the twin
follow. Or start from a blank one in the [playground](/).

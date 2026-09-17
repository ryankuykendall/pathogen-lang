---
title: "Thinking and Drawing in Parallel"
slug: thinking-and-drawing-in-parallel
date: 2026-09-17
description: "subscribe a selector to a layer and the annotations follow the drawing — the window, the ordering, the rounds, and the one closure caveat."
series: "Drawing Without Bookkeeping"
seriesPart: 2
---

*Part 2 of 5 in Drawing Without Bookkeeping — a form on one side, its
annotated twin on the other, and nothing copied between them.*

> **Series: Drawing Without Bookkeeping**
> 1. [Ask the Path](/blog/ask-the-path) — `query()` and `queryAll()`
> 2. **Thinking and Drawing in Parallel** (this post) — `subscribe()`
> 3. [A Linkage That Dimensions Itself](/blog/a-linkage-that-dimensions-itself) — a four-bar linkage
> 4. [The Panel Prints Its Own Drill Schedule](/blog/the-panel-prints-its-own-drill-schedule) — a Eurorack front panel
> 5. [The Fretboard Is a Formula](/blog/the-fretboard-is-a-formula) — a fretboard from one scale length

> **Prerequisites:** This post assumes [Ask the Path](/blog/ask-the-path)
> — the selector grammar and the structs it returns — and reuses its
> panel idiom without re-introducing it: a form layer on the left, a twin
> on the right, both drawing the same block. Lambdas and trailing blocks
> are covered in [The Shape of a Stroke](/blog/lambdas-come-to-pathogen).

Part 1 asked a path questions after it was drawn. Asking removed the
coordinates from the annotation and left the *ordering* in place.
You drew, then you queried, then you drew the annotation, and the three
had to stay in that order every time the program grew.

A subscription is a query that runs itself. You hand a layer a selector
and a block, and the compiler calls the block once per match. The calls
come in the order the geometry was drawn, wherever in the program the
drawing happened. The annotation is declared once, and it follows.

```pathogen
rightForm.subscribe('endpoint') {|corner|
  rightDots.apply {
    circle(corner.x, corner.y, 3);
  }
};
```

<mini-workspace src="samples/post53/01-declared-first.pathogen" caption="The subscription is registered before a single command is drawn. The dots arrive at program end, one per joint, in drawing order." code-open></mini-workspace>

Everything that follows is about what "runs itself" means precisely,
because the precision is where the useful behaviour comes from. The
reference is the [Subscriptions docs](/docs#subscriptions-subscriptions).

## When, exactly

Nothing is matched while you draw. The compiler keeps every layer in
memory until the last statement has run, then works through the
subscriptions. Each one runs its selector once over the finished
geometry inside the stretch of drawing it is watching, its **window**,
and the results are replayed in the order the geometry was drawn. Two
subscriptions on different layers interleave the way the drawing did,
and two on the same statement fire in the order they were registered.

That timing has consequences worth stating before the pictures, in the
spirit of [the docs' first section](/docs#subscriptions-things-to-know-first):

- **A callback sees the finished picture.** Corner operations are
  already applied; every `Endpoint` knows its `next` and `turn`; other
  layers are complete.
- **Variables hold their final values.** The block is a closure, and it
  runs last. Change a variable after subscribing and the callback reads
  the changed value. The last sample makes this visible.
- **A callback may not draw into the layer it subscribed to.** Drawing
  there is an error the moment it happens. Subscriptions annotate other
  layers.
- **Subscription output lands after everything drawn directly into the
  target.** That moves where a dash pattern sits in its cycle and where
  markers land. Give annotations their own layer and it never matters.
- **Only drawing after the `subscribe` call is delivered.** Query the
  layer for what came before.
- **Only path layers can be subscribed to.** Text and group layers have
  no geometry to observe, so `subscribe` on one is an error. They are
  fine as targets: a callback writes into any layer it likes.

## One block, two layers

The block receives up to three parameters: the match, its index among
this subscription's matches starting at 0, and the subscription itself.
Because the callback runs as ordinary top-level code, it can open `apply`
blocks on as many layers as it likes, text layers included.

```pathogen
rightForm.subscribe('endpoint') {|corner, i, sub|
  // corner: the match — i: its index, from 0 — sub: the subscription
};
```

<mini-workspace src="samples/post53/02-fan-out.pathogen" caption="One subscription, two target layers: a dot on every joint and its number beside it, placed a fixed distance out along the joint's own turn." code-open></mini-workspace>

The number is pushed away from the corner along a direction the match
already knows: the incoming command's end tangent, turned by half the
joint's own `turn`. That is the whole of the label-placement problem,
answered by the struct rather than by a table of offsets. Parts 3 to 5
lean on the same move.

## Windows

`subscribe` opens a window over the layer and `unsubscribe()` closes
it. Drawing between the two calls is what gets delivered:

<mini-workspace src="samples/post53/03-windows.pathogen" caption="Two squares on the same layer. The subscription is closed between them, so only the first is annotated." code-open></mini-workspace>

Inside a callback, `unsubscribe()` means something slightly different:
the window is already fixed by then, so it cancels the matches that have
not fired yet. A callback that stops after the third match reads
`if (i >= 2) { sub.unsubscribe(); }`.

## Selectors that need the whole window

Position pseudo-selectors that count from the end, `:last` and negative
`:nth`, cannot be answered until the window is complete. That is
exactly when callbacks run, so they simply work:

<mini-workspace src="samples/post53/04-last-three.pathogen" caption="Left: every joint numbered in drawing order. Right: endpoint:nth(-3..-1) under a subscription — the selector runs once over the finished window before anything is delivered, so it marks joints 3, 4 and 5 and no others." code-open></mini-workspace>

If subscriptions fired while you drew, this would be impossible; a
"last" would keep moving. End-of-program delivery is what makes a
completed window askable at all.

## Annotations, annotated

A callback may draw into a layer that has subscriptions of its own.
Those fire in a following round, and the rounds continue until no new
drawing appears:

<mini-workspace src="samples/post53/05-annotate-the-annotations.pathogen" caption="Round one puts a dot on every joint. Round two: a subscription on the dots layer draws a ring around every circle() the first callback produced." code-open></mini-workspace>

A loop that never settles stops after eight rounds and reports the chain
it found, `shape → dots → shape` style. The self-write from the list
above is the shortest such loop and is caught at once.

## The caveat, made visible

The closure rule is the one thing here that can surprise, so it gets a
picture. A radius is bound, a subscription reads it, the form is drawn,
and then the radius changes:

<mini-workspace src="samples/post53/06-final-values.pathogen" caption="Left: a plain queryAll loop draws with the radius as it was at that line, 3. Right: the subscription's callback runs at program end and sees 7." code-open></mini-workspace>

Bind what a callback needs before subscribing, or put it in the
selector. If you need the value *as of a line*, that is what a query at
that line is for.

## The handle

`subscribe` returns a `Subscription`. `source` and `selector` say what it
watches. `active` is true while the window is open and nothing has
cancelled it. `count` is how many matches have been delivered, which is
the number you want inside a callback. `log(handle)` prints
`Subscription(shape: 'endpoint', 4 delivered)`. The [docs
table](/docs#subscriptions-the-subscription-value) has the rest.

## What this project taught the language

This series doubles as a working friction log ([part
1](/blog/ask-the-path) explains the convention). One entry this time,
surfaced by the sample that draws rings around dots.

**A run that begins with a move answers for its own geometry.** The
ring sample asks the dots layer for `call(circle)` and centres a ring on
each block. Every `circle()` begins with a move, and that move's recorded
start is the pen position *before* it, which belongs to the previous
statement. The block's bounding box reached back to that point, so every
ring sat halfway to the previous dot. A quieter version of the same error
had put the boxes part 1 drew around each `call` at the panel origin.
Blocks
taken from a layer now begin where their move lands. The [Path
Queries](/docs#path-queries-what-comes-back) tables describe `block` as
the run alone; it is now true.

## Where to go next

The next three posts put both mechanisms to work on real drawings. A
four-bar linkage has its pivots numbered and its links dimensioned. A
front panel prints its own drill schedule. A fretboard places and labels
every fret from one scale length.

The reference is [Subscriptions](/docs#subscriptions-subscriptions).
Every sample above opens in the playground with one click: move a
subscribe call, add a statement after an unsubscribe, and watch what is
and is not delivered.

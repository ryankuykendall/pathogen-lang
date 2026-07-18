---
title: "Name Your Corners: Segment Labels and Corner Suffixes"
slug: segment-labels-and-suffixes
date: 2026-07-18
description: "Pathogen paths become collections of richly defined segments — label edges and vertices where you draw them, round corners at the point of definition, and query it all back by name."
---

A path used to be something you could only write. As of this release, it's something you can **address**.

Two small clauses now attach to any path command. `as` gives an edge or a vertex a name. `with` attaches a fillet or chamfer to the joint a command creates, right where you draw it:

```pathogen
M 10 10
h 60 as segment('lid');
v 40 with fillet(8) as endpoint('corner');
h -60;
```

And everything you name can be looked up later — `segment('lid')` returns that edge with the full sampling API, `point('corner')` returns the vertex as a drawTo-ready Point, and `vertex('corner')` returns a handle that can round or cut that specific joint. The full reference lives in the [Segment Labels & Corner Suffixes docs](/docs#segment-labels-syntax); this post is about why the feature exists and what it unlocks.

## Rounding a corner where you draw it

Before this release, rounding one corner mid-path meant doing the trigonometry yourself: shorten the incoming edge, thread a `tangentArc` between the edges, shorten the outgoing edge. The authored code stops looking like the shape you meant.

```pathogen
// before: the 60×60 corner, hand-assembled from three pieces
let manual = @{
  h 45
  tangentArc(15, 0.5pi);
  v 45
};

// after: write the edges you mean, name the rounding where it happens
let suffixed = @{
  h 60
  v 60 with fillet(15)
};
```

<mini-workspace src="samples/post28/before-after-fillet.pathogen" caption="Same rounded corner — hand-assembled tangent arc on the left, `with fillet(15)` on the right" code-open></mini-workspace>

The two are exactly equivalent: `fillet(15)` trims 15 units off each 60-unit edge, which is precisely the 45 the hand-built version has to write out — except now the compiler does that arithmetic, not you.

The suffix form is **recorded at definition and applied at finalization** — the same trim-and-splice machinery as the post-hoc [`fillet` methods](/blog/pathblock-fillets-chamfers), just addressed by adjacency instead of index. Your authored extents stay intact: `ctx.position` mid-path still reflects the sharp corner you wrote, and the trimming happens when the path block closes or the layer emits. `with chamfer(d)` and `with ellipticalFillet(rx, ry)` work the same way.

There's a design lesson hiding in the syntax. Our first sketch was `v 20 joinPreviousWithFillet(5)` — a function-call suffix. It read badly because a fillet isn't a property of an edge; it's a property of the **joint between two edges**. Every system that solved this before us — PostScript's `arct` operator, TikZ's `rounded corners`, CSS's per-corner `border-radius` — attaches rounding to the corner. `with fillet(...)` names the operation on the joint the command creates, and the clunkiness disappears.

## Labels turn paths into structures

The deeper change is `as`. SVG path data is a 1999-era pen-plotter stream — single-letter opcodes and coordinates, no names, no structure. Everything Pathogen does ultimately compiles down to that stream, but *you* shouldn't have to think in it.

```pathogen
let card = @{
  h 160 as segment('lid');
  v 80 with fillet(22);
  h -160 with chamfer(14);
  z
};
```

`'lid'` names the top edge. That name survives everything that happens to the path — fillets trimming it, projection moving it — and it answers questions:

<mini-workspace src="samples/post28/segment-decoration.pathogen" caption="`card.segment('lid').partition(6)` — decorating evenly along one named edge" code-open></mini-workspace>

`segment('lid')` hands back the labeled range as a real PathBlock, so `partition`, `get`, `tangent`, `normal`, and `boundingBox` all work on just that edge. No index arithmetic, no measuring where the lid starts and stops.

Vertices work the same way. `as endpoint('name')` names the point a command lands on, and `point('name')` retrieves it — an anchor that follows the geometry instead of a hand-computed coordinate:

<mini-workspace src="samples/post28/point-anchor.pathogen" caption="Bolt heads anchored to named corners — `placed.point('mount-east')` instead of coordinates" code-open></mini-workspace>

## Names don't break; indices do

We already shipped vertex-targeted fillets: `filletAtVertex(1, 12)` rounds "the second corner." The problem is what happens next week, when you add a notch earlier in the path — every index shifts, and your fillet silently lands on the wrong corner. CAD systems call this the topological naming problem, and their answer is the same one we've adopted: name the geometry at definition, address it by name forever.

```pathogen
fn tab(withNotch) {
  return @{
    h 30
    if (withNotch) {
      v 8
      h 10
      v -8
    } else {
      h 10
    }
    h 40 as endpoint('spout')
    v 55
    h -80
    z
  };
}

let plain = tab(false).vertex('spout').fillet(12);
let notched = tab(true).vertex('spout').fillet(12);
```

<mini-workspace src="samples/post28/robust-names.pathogen" caption="The notch adds three commands before the corner — `vertex('spout')` rounds the same joint in both variants" code-open></mini-workspace>

The notched variant has three extra commands before the corner. An index-based fillet would need updating; `vertex('spout')` doesn't care.

## Layers answer questions now

The quiet structural win: layers built with `apply { }` used to be write-only. You could route commands into them, but a layer could never tell you anything about its own geometry. Labels change that — `layer('name').segment(...)`, `.point(...)`, and `.vertex(...)` read named geometry back out of any path layer:

<mini-workspace src="samples/post28/layer-query.pathogen" caption="A ticks layer cross-hatching a named stretch of the road layer — one layer reading another's geometry by name" code-open></mini-workspace>

The ticks layer never hard-codes where the straightaway is. It asks the road layer, gets a ProjectedPath in absolute coordinates, and decorates along it. Reshape the road and the ticks follow.

## Under the hood, and what's next

Making this work took more than syntax. Both evaluators now track every emitted fragment as a **structured record** — the byte-exact output string paired with its commands, labels, and recorded corner ops — instead of an append-only string list. Zero-annotation programs emit byte-identical output to the previous release (our render snapshots enforce this), while annotated programs get finalization, label-preserving trims, and the query APIs on top of the same store.

That structured store is the foundation for what's next: labels give the compiler stable handles into path interiors, which opens the door to editing named segments in place, per-segment styling, and richer inspector tooling. The [docs page](/docs#segment-labels-syntax) covers the full syntax, the error catalogue, and the querying rules — everything in it compiles verbatim against this release.

Every sample above is a live editor — change a radius, rename a label, add a command before a named corner and watch the queries follow. Or start from scratch in the [playground](/).

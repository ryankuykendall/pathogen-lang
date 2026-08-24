---
title: "Cutting Paths: Slicing Shapes Apart with cut()"
slug: pathblock-cutting
date: 2026-08-22
description: "PathBlock.cut() slices a shape along the strokes of a second PathBlock — a knife — and returns the pieces: closed shapes healed shut along the cut, open paths severed into fragments."
series: "PathBlock Extensions"
seriesPart: 5
---

*Part 5 of 5 in our series on PathBlock extensions.*

> **Series: PathBlock Extensions**
> 1. [Introduction to PathBlocks](/blog/pathblock-introduction)
> 2. [Exploring Parametric Sampling](/blog/pathblock-parametric-sampling)
> 3. [Fillets and Chamfers](/blog/pathblock-fillets-chamfers)
> 4. [Boolean Operations](/blog/pathblock-boolean-operations)
> 5. **Cutting Paths** (this post)

> **Prerequisites:** This post assumes familiarity with PathBlock basics — the
> `@{}` sigil, `.draw()`, and `.project()`. If you're new to Pathogen, start
> with [Introduction to PathBlocks](/blog/pathblock-introduction). The
> [Boolean Operations post](/blog/pathblock-boolean-operations) is useful
> contrast but not required.

[Boolean operations](/blog/pathblock-boolean-operations) combine two closed shapes into one. [`cut()`](/docs#path-blocks-cutting-paths) goes the other direction: it takes a shape apart.

You draw a second PathBlock whose strokes act as a knife — open lines and curves, as many as you like — and `shape.cut(knife)` hands back an array of pieces. Each piece is a complete PathBlock, sealed shut along the lines that cut it. And because every piece is a real PathBlock, nearly everything you already know applies: give each piece its own fill, measure it with `boundingBox()`, offset it, rotate it, cut it again. Since this post first ran, labels made the trip too: pieces keep the subject's `as segment(...)` names on their surviving edges, and every healed seam answers `segmentAll('cut')` — [The Cutting Room series](/blog/cutting-room-papercraft) is four projects built on exactly that.

## One rectangle, one stroke

The barest possible picture: a rectangle, a single straight stroke through it, two pieces.

```pathogen
let box = @{
  h 140
  v 100
  h -140
  z
};
let knife = @{
  m 90 -15
  l 0 130
};
let pieces = box.cut(knife);
log(pieces.length);    // 2
```

Two things to notice before anything fancier. First, the knife overshoots the box on both ends — a stroke cuts wherever it *fully crosses* the shape, so the safe habit is to draw strokes a little longer than they need to be. Second, the pieces come back exactly where they were: drawing them all at the same position reassembles the rectangle, and nudging each one apart produces an exploded view. That's the left and right halves of this demo — same pieces, two ways of placing them:

<mini-workspace src="samples/post40/first-cut.pathogen" caption="One cut, two pieces. Left: drawn at the same position, the shape reassembles. Right: each piece nudged away from the cut line." code-open></mini-workspace>

## The cut that started it

This feature began with a sketch: the letter 'O', one two-stroke knife, two positions. On the left, both strokes cross the whole glyph — four pieces. On the right, the same knife sits so its strokes run into the letter's *counter* (the hole in the middle) and stop there — they only sever the left ring, so you get two pieces.

<mini-workspace src="samples/post40/o-cut-two-ways.pathogen" caption="The same two-stroke knife at two positions: four pieces, then two."></mini-workspace>

The right-hand case is worth a second look. Those strokes *look* like they stop mid-letter — but the middle of an 'O' is a hole, and the part of a stroke that lands in a hole (or outside the shape) is simply ignored. Each stroke crosses the left ring completely, outer edge to inner edge, so the left ring severs cleanly. Behind it is the rule the whole feature is built on: **a stroke must fully cross material to cut it — one that dead-ends inside solid material cuts nothing.**

This sample also shows how a knife is positioned. Both blocks overlay in block-local coordinates, exactly like the boolean operations, and you slide the knife with [`project()`](/docs#path-blocks-projecting-without-drawing): the right-hand cut is `o.cut(knife.project(-95, 0))` — the same knife, 95 units further left relative to the glyph.

## What doesn't cut

Naming the sharp edges now, before the pretty pictures:

- **Dead-end strokes.** As above — a stroke that stops inside solid material leaves that region whole. `cut()` never invents geometry to finish your stroke for you.
- **Almost-touching endpoints are forgiven.** If a stroke's endpoint lands *on* the boundary — or within about half a unit of it at typical drawing scales — it snaps onto the boundary and the cut completes there, like a T-junction. The same forgiveness applies to strokes passing through a corner vertex.
- **Grazes and edge-riders.** A stroke that only touches the boundary tangentially, or runs along an edge without crossing it, doesn't cut.
- **`--annotated` debug mode doesn't support `cut()` yet.** The CLI's annotated output reports a clear error; everything else — normal CLI compilation, the playground, the VS Code preview — works.
- **Piece order is deterministic but unspecified.** The same program always produces the same array, but don't assume which index is which piece — inspect pieces (`boundingBox()`, [`subPathCount`](/docs#path-blocks-pathblock)) or just iterate.

The full contract lives in the [Cutting Paths documentation](/docs#path-blocks-cutting-paths).

## Cutting through holes

Shapes with holes — a donut, a glyph with a counter — cut the way you'd hope. When the knife crosses the hole, each piece's boundary heals across *both* contours: outer edge, cut line, inner edge, cut line. A donut split through its middle becomes two C-shapes, each a single clean closed contour.

And when the knife *misses* the hole? The hole isn't lost — it rides along as an extra subpath (a separate contour inside the same piece) in whichever piece contains it. Cut a sliver off a donut and the big remaining piece still has its hole; each piece's [`contours`](/docs#path-blocks-contours) property exposes that structure when you want to look inside.

<mini-workspace src="samples/post40/donut-cuts.pathogen" caption="Left: the knife crosses the hole — two C-shapes. Right: the knife misses it — the hole rides along in the larger piece." code-open></mini-workspace>

## Cookie cutters

Every stroke so far has been open. A *closed* stroke — a loop — acts as a cookie cutter: it stamps the region inside it out of the shape. You get the stamped piece and the shape it left behind, which now carries a hole.

```pathogen
let plate = @{ roundRect(0, 0, 220, 150, 18); };
let stamp = @{ circle(0, 0, 42); };
let pieces = plate.cut(stamp.project(140, 60));
```

Since piece order is unspecified, this demo tells the pieces apart by structure instead: the stamped disk has one subpath (`subPathCount == 1`), the plate-with-a-hole has two. That's usually the most robust way to route pieces to different treatments.

<mini-workspace src="samples/post40/cookie-cutter.pathogen" caption="A closed loop stamps a disk out of the plate; the plate keeps the hole." code-open></mini-workspace>

One nicety: the loop doesn't have to be authored as a single closed subpath. Separate strokes whose endpoints meet are recognized as a loop geometrically — draw four sides in any order and they still stamp.

## Severing open paths

Everything above cut closed outlines. Open paths cut too, with simpler results: each crossing severs the path, and you get the open fragments back. No healing — there's no interior to close.

<mini-workspace src="samples/post40/open-path-dashes.pathogen" caption="Nine vertical strokes turn one wave into alternating-color dashes." code-open></mini-workspace>

Here one long quadratic wave is crossed by nine vertical strokes and comes back as ten open fragments, drawn alternately from two differently-styled layers. (Alternating by index is fine here — it only needs the order to be *stable*, which determinism guarantees. It's assigning *meaning* to a particular index that the earlier gotcha warns against.) The payoff: real, individually addressable dash pieces that follow the curve, not a `stroke-dasharray` illusion.

## Finale: shattering a wordmark

Everything in one place: the full "pathogen.studio" wordmark, every glyph shattered.

<mini-workspace src="samples/post40/shattered-glyph.pathogen" caption="Every glyph laid out by advance width, cut with its own knife, every fragment drifting and rotating a little."></mini-workspace>

The composition stacks four ideas from this series:

1. **Layout** — each glyph comes from [`PathBlock.fromGlyph`](/docs#path-blocks-pathblockfromglyphtext-styles) and is placed by accumulating [`advanceWidth`](/docs#path-blocks-advancewidth), the same technique as the [glyph extraction post](/blog/pathblock-glyph-extraction).
2. **A knife per glyph** — two strokes whose position and slant vary per letter via [`hashRange`](/blog/primer-hashrange) (a deterministic random pick — same inputs, same answer, forever), so every glyph shatters differently but *deterministically*: the composition renders identically on every compile.
3. **Per-piece drift** — each fragment moves a few units outward from its glyph's center, plus a little hashed jitter.
4. **Per-piece rotation** — each fragment turns up to ±4° with [`rotateAtVertexIndex`](/docs#path-blocks-rotateatvertexindexindex-angle-pathblock-projectedpath).

One honest gotcha from building it: like the other transforms, `rotateAtVertexIndex` normalizes its result to start at the origin — the rotated piece forgets where it lived inside its glyph. The fix is to read the pivot's position first (`p.vertices[0]`) and add it back when placing the shard. The sample's comments show the pattern; the first draft without it rendered the wordmark as very legible confetti. (The newer [`rotate(angle, origin)`](/docs#path-blocks-rotateangle-origin-pathblock-projectedpath) is frame-preserving and skips this bookkeeping entirely — [the jigsaw post](/blog/cutting-room-jigsaw) shows the two-line version.)

## Where to go next

The [Cutting Paths documentation](/docs#path-blocks-cutting-paths) has the full behavior contract — tolerances, the degenerate cases, and what happens to mixed open-and-closed subjects. The [Boolean Operations post](/blog/pathblock-boolean-operations) covers the combining half of this toolbox: `union`, `difference`, `intersection`, and `xor`.

And since every piece is a PathBlock, the rest of the series applies to each one: [sample along a piece's edge](/blog/pathblock-parametric-sampling), [round a piece's corners](/blog/pathblock-fillets-chamfers), query the [labels it kept and the seams it gained](/blog/cutting-room-papercraft), or cut the pieces again.

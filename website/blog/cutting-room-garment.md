---
title: "Garment Patterns: Edges with Names Sewn In"
slug: cutting-room-garment
date: 2026-08-26
description: "Part 3 of The Cutting Room: draft a half-bodice with every edge named, split it at the yoke, and let the labels run the workflow — pieces identify themselves, allowances offset without losing their names, and notches land matched on both halves."
series: "The Cutting Room"
seriesPart: 3
---

*Part 3 of 4 in The Cutting Room — projects that put `cut()` and
segment labels to work together.*

> **Series: The Cutting Room**
> 1. [Papercraft](/blog/cutting-room-papercraft) — cut lines, fold
>    lines, and glue tabs from one plate
> 2. [Jigsaw](/blog/cutting-room-jigsaw) — wavy knives, piece identity,
>    and a scattered puzzle
> 3. **Garment patterns** (this post) — named edges, seam allowances,
>    and notches
> 4. [Stained glass](/blog/cutting-room-stained-glass) — tinted panes,
>    leading, and a rose window

> **Prerequisites:** [`PathBlock.cut()`](/blog/pathblock-cutting) and
> [segment labels](/blog/segment-labels-and-suffixes), plus part 1's
> [seam-stroking idiom](/blog/cutting-room-papercraft). Parts 1 and 2
> asked pieces about the *automatic* `cut` label; this post is where
> your own names do the heavy lifting.

## What it does

A sewing pattern is a shape whose edges have jobs. The hem gets folded
twice; the side seam gets 7 units of allowance; the armhole gets eased;
notches tell you which edge meets which. Pattern drafting software is,
to a first approximation, software for *remembering which edge is
which* — and that is precisely what `as segment('name')` does:

```pathogen
let bodice = @{
  c 16 18 34 20 46 6 as segment('neck')
  l 22 8 as segment('shoulder')
  // ...armhole, side, hem — Example 1 has the full draft
};
```

Name the edges once, at drafting time, and every downstream operation —
cutting the yoke off, offsetting for allowance — carries the names
along. The workflow stops being coordinate bookkeeping and becomes a
series of questions: *who kept the neckline? where is the side seam
now?*

(An earlier draft of this post carried a blunt caveat here: offsetting
the yoke produced a distorted, spiked allowance, and the pattern sheet
shipped without it. Building this very post got that fixed — the full
story is at the bottom of the post, under *What this project taught
the language*.)

## Why you'd use it

Because the alternative is what pattern makers call "walking the
pattern" — manually re-measuring every edge after every change. When
the edges answer by name, grading and decorating survive redesigns:
re-draft the armhole deeper, and the same queries still find the same
jobs. The identification idiom this post adds to the kit:

```pathogen
let name = 'body';
if (piece.segmentAll('neck').length > 0) {
  name = 'yoke';    // whoever kept the neckline is the yoke
}
```

## Example 1 — The draft speaks

A half-bodice front, drafted to the right of a center-front fold — the
`z` edge, named `'front'` like the rest, dashed because real patterns
are cut on the fold, so drafting half is the honest shape. Six edges,
six names, six colors: each stroke is one `segmentAll` query answered
by the block and drawn over the outline.

<mini-workspace src="samples/post43/01-labeled-draft.pathogen" caption="Every edge named at drafting time; every color is one segmentAll query." code-open></mini-workspace>

This is the whole trick of the post, shown before any cutting: the
draft carries its own vocabulary. Everything after this is asking.

## Example 2 — The yoke split

One curved knife across the chest and the bodice becomes yoke + body.
Neither piece is found by position, index, or size — each is asked
what it kept. The neckline stayed with the top piece, so it announces
itself as the yoke; the hem stayed with the bottom, so it is the body.

<mini-workspace src="samples/post43/02-yoke-split.pathogen" caption="Identity by inheritance: keeping the neckline makes you the yoke." code-open></mini-workspace>

The captions are computed, not typed per piece — the same loop handles
both, and would handle a three-way split unchanged. That is the
difference between labeling geometry and labeling *your assumptions
about piece order*.

## Example 3 — Seam allowance is an offset

The cutting line a seamstress actually scissors along sits 7 units
outside the stitch line. That is `offset(7)` on the projected piece:
the red ring is the offset, the dashed original is the stitch line —
and because labels survive `offset()`, the amber stroke finds the side
seam *on the allowance outline*, not the original.

<mini-workspace src="samples/post43/03-seam-allowance.pathogen" caption="offset(7) makes the cutting line; the side seam still answers by name on it." code-open></mini-workspace>

Query-after-offset is the point to take away: the allowance is not
dumb geometry. If the next step were "add extra width only along the
side seam for grading," the run you'd need is already addressable.

## Example 4 — Notches

Sewists cut small ticks on both halves of a seam so the halves align
at the machine. Both pieces get a single notch 30% along the join seam
and a double notch at 70% — but twin seams can run opposite
directions, so a naive `get(0.3)` might land at 30% on one piece and
70% on the other. The sample normalizes first: compare the seam's two
endpoints, and if it runs right-to-left, flip `t`.

<mini-workspace src="samples/post43/04-notches.pathogen" caption="Normalize the walk direction, then the same fractions land matched ticks on both pieces." code-open></mini-workspace>

Part 2's registration marks dodged this problem by using `partition`'s
symmetric fractions; notches are *asymmetric* on purpose (that is how
they encode orientation), so the direction fix stops being optional.

## Example 5 — The pattern sheet

The deliverable: both pieces laid out side by side — placed by
`boundingBox()`, tops aligned, no piece order assumed — with stitch
lines dashed, every piece's cutting line offset in red (curves and
all), notches matched across the join seam, a grainline arrow down
each piece, and computed names. "Cut 1 on fold" is real pattern
language, and the fold is the `z` edge from Example 1.

<mini-workspace src="samples/post43/05-pattern-sheet.pathogen" caption="The finished sheet: layout, allowance, notches, grainlines, and names — all queried, none hand-placed." code-open></mini-workspace>

Every annotation on this sheet is derived: move the yoke line, deepen
the neck, or widen the hem, and the sheet re-annotates itself on the
next compile. That is the payoff of edges with names sewn in.

## What this project taught the language

The Cutting Room series doubles as a working friction log: building
each project against the real language surfaced bugs and gaps, and
this section records what got fixed because of it.

**The panel labels' idioms made it into the manual.** The pattern
sheets in Examples 2 and 5 lean on two spellings this post used
before the docs admitted they existed: string ternaries —
`` `${count > 1 ? 'pieces' : 'piece'}` `` inside interpolation, and in
style values — and plain reassignment inside `if` branches for
multi-step choices. Both were always real; they are now
[documented](/docs#syntax-conditional-ternary-expressions), because a
feature you can only learn by reading someone else's sample isn't
finished.

**Seam allowances exposed an offset bug — and got parallel curves
fixed properly.** The first draft of this post could not put an
allowance on the yoke: `offset(7)` produced a spiked, distorted ring
around it, and Example 5 shipped with the yoke bare and a caveat in
the intro. Tracing it revealed two defects, neither the one we
guessed. At the sharp corner where the fold line enters the neck
curve, the *miter join* — the extended corner point — grew to almost
three times the offset distance and was folded into the neck curve's
own coordinates, warping the curve body. And curve offsetting merely
translated control points, so a deep scoop's offset midsection sat at
the wrong distance even without a bad corner.

The fix restructured how `offset()` builds its result: every segment
is offset with its own normals, join geometry lives *between*
segments (a sharp corner now gets a short bevel — or an arc with
`offset(d, { join: 'round' })` — instead of deforming its neighbor),
and curves subdivide and re-fit as true parallel curves. The
[offset docs](/docs#path-blocks-offsetdistance-options-pathblock-projectedpath)
carry the new join contract. For this post, the payoff is the sheet
above: both pieces ringed, the neck scoop's allowance a constant
seven units along its whole length, no caveat required.

```pathogen
// before: the yoke's allowance came out spiked and distorted —
// the sheet shipped without it
let allow = placed.offset(7);      // body panel only, by guard

// after: every piece gets its cutting line, curves and all
let allow = placed.offset(7);      // any piece — or
let round = placed.offset(7, { join: 'round' });
```

A lesson worth keeping from the diagnosis: the bug we *logged* — "the
offset flips to the wrong side" — was not the bug that existed.
Direction was always correct; the joins were at fault. Friction logs
earn their keep, but each entry deserves a fresh trace before it
becomes a fix.

**The pattern sheet also exposed a placement footgun — and got
projected values a real `draw()`.** An early draft of Example 5 drew
each piece with `placed.drawTo(placed.startPoint.x,
placed.startPoint.y)` — "draw yourself where you are" — and every
annotation landed 63 units away from its piece. The cause: a cut
piece's projected `startPoint` is its *frame origin*, not its first
command, so the innocent-looking re-anchor silently shifted the piece
by its own local offset (seam runs, where the two coincide, worked
fine — which is what made it treacherous). Projected values now have
[`draw()`](/docs#path-blocks-drawing-a-projectedpath-in-place), which
anchors on the first command by definition; the sheet above uses it,
and the `drawTo` anchor contract is documented where it can't surprise
the next person.

```pathogen
// before: correct for seam runs, silently wrong for cut pieces
placed.drawTo(placed.startPoint.x, placed.startPoint.y);

// after: correct for both, and says what it means
placed.draw();
```

*Epilogue:* the footgun itself is now gone at the root. `startPoint`
had been hardcoded to the frame origin since the language's first
commit — the original spec comment even described the correct
behavior, unimplemented. It now reports the **first inked point** on
every value, `get(0)` always agrees with it, and
[`drawTo`](/docs#path-blocks-drawing-a-projectedpath-in-place) anchors
the ink at its target — so even the "before" line above, the one that
misplaced this pattern sheet, draws correctly today. `draw()` remains
the idiomatic spelling.

## Where to go next

- [Stained glass](/blog/cutting-room-stained-glass) — the series
  finale: labels from *both* operands of a boolean, and seams as the
  artwork itself.
- [Papercraft](/blog/cutting-room-papercraft) and
  [Jigsaw](/blog/cutting-room-jigsaw) — parts 1 and 2, where the seam
  idioms used here were introduced.
- Reference: [labels survive derived paths](/docs#segment-labels-labels-survive-derived-paths)
  and [offset](/docs#path-blocks-offsetdistance-options-pathblock-projectedpath) in the docs.

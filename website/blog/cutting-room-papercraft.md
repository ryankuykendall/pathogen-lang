---
title: "Papercraft: Cut Lines, Fold Lines, and Glue Tabs from One Plate"
slug: cutting-room-papercraft
date: 2026-08-24
description: "First in The Cutting Room, a four-project series on cut() + segment labels: fold lines, glue tabs, named pieces, and an exploded view, all queried from the pieces themselves — not bookkept."
series: "The Cutting Room"
seriesPart: 1
seriesDescription: "Four projects that put PathBlock.cut() and segment labels to work together — papercraft, a jigsaw, a garment pattern, and a stained-glass window. Each starts from one bare mechanism and climbs to a finished composition."
---

*Part 1 of 4 in The Cutting Room — projects that put `cut()` and
segment labels to work together.*

> **Series: The Cutting Room**
> 1. **Papercraft** (this post) — cut lines, fold lines, and glue tabs
>    from one plate
> 2. [Jigsaw](/blog/cutting-room-jigsaw) — wavy knives, piece identity,
>    and a scattered puzzle
> 3. [Garment patterns](/blog/cutting-room-garment) — named edges, seam
>    allowances, and notches
> 4. [Stained glass](/blog/cutting-room-stained-glass) — tinted panes,
>    leading, and a rose window

> **Prerequisites:** This series builds on
> [`PathBlock.cut()`](/blog/pathblock-cutting) — slicing a shape along
> the strokes of a second PathBlock — and on
> [segment labels](/blog/segment-labels-and-suffixes), the
> `as segment('name')` clause that makes parts of a path queryable.
> Examples 3 and 6 also lean on the
> [parametric sampling tools](/blog/pathblock-parametric-sampling)
> (`get`, `normal`, `subPath`). Skim those first if any are new.

## What it does

When `cut()` slices a closed shape apart, every piece comes back healed
shut — and every healed edge remembers that it used to be a wound. (An
open subject severs into open fragments instead; the healing is for
closed material.) Each seam carries the automatic segment label `cut`,
so a piece can be asked, after the fact, *where was I cut?*

```pathogen
let pieces = plate.cut(knife);
let placed = pieces[0].project(20, 30);
placed.segmentAll('cut');   // every healed edge, as drawable runs
```

Two things to know before the pictures, because everything below leans
on them:

- **Query the projected form.** A piece is a PathBlock, and a
  PathBlock answers sub-queries in its own frame — each returned run is
  rebased so its own start is `(0, 0)`. Call `project(x, y)` first and
  the same queries answer in canvas coordinates, ready to draw with.
- **Adjacent commands with the same label merge into one run.** Ask
  `segmentAll` for two labeled edges that follow each other and you get
  one queryable run, not two. That is a feature — a fold line that
  turns a corner is still one fold — and when you *do* want the pieces
  back individually, the language has answers: Example 6 shows the rule
  and the way around it.

Your own labels survive the cut too: name an edge `as segment('roof')`
before cutting and whichever piece keeps that edge still answers for
the name. That is the other half of this series' toolkit.

One more thing this series is: a **working friction log**. These
projects were built against the real language, and where they exposed
a bug or a missing piece, the fix went back into Pathogen — each post
that hit something grows a closing section, *What this project taught
the language*, telling that story.

## Why you'd use it

Papercraft is the cleanest possible demonstration, because a paper
template is nothing *but* annotated cuts: solid lines to scissor,
dashed lines to fold, tabs to glue. Before seam labels, decorating a
cut meant re-deriving where the knife went — intersecting lines by
hand, tracking which piece got which fragment. Now the pieces carry the
answer. The idiom the whole series leans on:

```pathogen
for (seam in placed.segmentAll('cut')) {
  seam.draw();
}
```

A projected value knows where it lives, so `draw()` draws it exactly
there — into whatever layer is active, with whatever stroke style that
layer carries. Dashed layer, fold lines. Amber layer, highlights. The
seam is just a path; the meaning comes from where you draw it.

## Example 1 — The first seam

One rectangular plate, one S-curved knife, two pieces. On the left, the
pieces drawn plain, reassembled. On the right, the same two pieces
nudged apart, after each was asked for its healed seams — stroked in
amber with the idiom above.

<mini-workspace src="samples/post41/01-first-seams.pathogen" caption="Left: the cut pieces, reassembled. Right: the pieces apart — each strokes its own segmentAll('cut')." code-open></mini-workspace>

Note that *each piece* answers separately: two amber curves, one per
piece, each the exact edge where that piece was healed. Seams come from
the piece you ask, which is what makes everything downstream per-piece
by construction.

## Example 2 — Cut lines and fold lines

The first real template. An accordion card is one plate cut by three
vertical creases — and an accordion's creases *alternate*: mountain,
valley, mountain. That's three line styles, not two, and the knife
itself carries the distinction. Name a knife's edge
`as segment('mountain')` and the seams it heals come back labeled
`cut.mountain` — so the plate's boundary is where scissors go (solid
red), and one loop over the seams routes each fold to its dash style by
asking which knife made it.

<mini-workspace src="samples/post41/02-fold-lines.pathogen" caption="The outline is the cut line; each named knife's seams keep its name — mountain and valley folds dash differently." code-open></mini-workspace>

One thing the sample does *not* have to do: dedupe. Each interior fold
is shared by two panels, so asking every panel for its seams would
stroke each fold twice — and two dashed strokes running opposite
directions fill in each other's gaps. `panels.seams()`, asked of the
cut result as a whole, answers with each *physical* seam exactly once,
so the fold pass is one loop with no ownership rules. (Per-piece
`segmentAll('cut')` is still the right query when you want each
piece's own view of its edges — Example 1 and the tabs to come.)

## Example 3 — Glue tabs that grow on seams

Tabs are the first payoff that would genuinely hurt to do by hand. The
seam is a parametric path, so `get(t)` walks along it and `normal(t)`
points straight out of it — which is all a trapezoid tab needs. The
left piece grows three tabs along its healed edge, every other seventh
of the way; the outer boundary, which was never cut, stays clean.

<mini-workspace src="samples/post41/03-glue-tabs.pathogen" caption="get(t) walks the seam, normal(t) aims the tab; the uncut boundary grows nothing." code-open></mini-workspace>

The one judgment call in the sample is direction. `normal(t)` always
returns the left-hand normal of the path's travel — but Example 1
showed that the two pieces traverse their shared seam in *opposite
directions*, so "left of the seam" lands inside one piece and outside
the other. The sample settles it by comparing the normal against the
direction to the piece's own center — if it points inward, flip it by
adding `PI()`.

## Example 4 — Pieces that introduce themselves

So far the seams did all the talking. This example is about *your*
labels: a house-shaped plate names its roof `as segment('roof')` and
its floor `as segment('base')`, then a horizontal cut splits it. Each
piece still answers for the names it kept — the roof piece strokes and
counts its roof, the base piece its base.

<mini-workspace src="samples/post41/04-named-pieces.pathogen" caption="Labels survive the cut: each piece strokes and counts the names it kept." code-open></mini-workspace>

The counts are the quiet star. `segmentAll('roof')` on the top piece
has length 1, on the bottom piece length 0 — which means a program can
*identify* pieces by what they kept, with no geometry tests at all.
The sample practices what it preaches: even the up-or-down placement
of each piece is decided by the roof query, not by a coordinate check.
The garment-pattern post (part 3) builds its whole workflow on this.

## Example 5 — The exploded view

Assembly diagrams pull pieces apart along rays from the center, and
`boundingBox()` gives every piece its own ray for free. The ghost of
the uncut plate stays behind, dashed; each drifted piece strokes its
seams amber, so mating edges face each other across the gaps.

<mini-workspace src="samples/post41/05-exploded-view.pathogen" caption="Pieces drift along rays to their bounding-box centers; amber seam faces amber seam." code-open></mini-workspace>

Nothing here is new — it is Example 1's stroke and a square root — but
this is the moment the toolkit starts reading as a *diagram* rather
than a demo: the seams are doing the explanatory work a technical
illustrator would do with a highlighter.

## Example 6 — The kit sheet

Everything at once: a hexagonal medallion, three straight knives
through the center, six numbered wedges exploded into a ring around the
assembled ghost. Each wedge tabs one of its healed edges (red — cut
around the tab) and fold-dashes the other (glue your neighbor's tab
under it), and wears its piece number — derived from its angle around
the ring, because `cut()` makes no promise about the order pieces come
back in.

<mini-workspace src="samples/post41/06-medallion-kit.pathogen" caption="The finished kit sheet: tab the red edge, fold the dashed one, rejoin in order." code-open></mini-workspace>

And here is the merge rule from the top of the post, doing real
work. A wedge's two radial edges meet at the hexagon's center, and
under the umbrella query `segmentAll('cut')` they come back as **one**
V-shaped run (adjacent seam commands merge regardless of which knife
made them). But the knives are named — `k0`, `k1`, `k2` — and each
wedge's two edges come from two *different* knives, so the exact
queries `segmentAll('cut.k0')`… hand each edge back on its own. The
sample decides tab-or-fold per edge by which side of the wedge's
center ray it lies on. If you ever ask for two seams and receive one,
the umbrella merge is why — and a named knife (or, for a run one label
covers, the
[`:atomic` pseudo-selector](/docs#segment-labels-query-pseudo-selectors))
re-divides it.

## What this project taught the language

The friction-log promise from the top of the post, kept — what building
this project changed in Pathogen:

**The seam idiom became a real `draw()`.** When this series first
shipped, the loop above took two lines per seam:
`seam.drawTo(seam.startPoint.x, seam.startPoint.y)` — "draw yourself
where you already are," said with two property reads and a re-anchor.
Worse, the same expression applied to a *whole cut piece* silently drew
it in the wrong place, because a piece's projected `startPoint` was, at
the time, its frame origin rather than its first command (the garment
post tells that part of the story — including the epilogue where
`startPoint` itself was later made truthful). Projected values now have
an in-place
[`draw()`](/docs#path-blocks-drawing-a-projectedpath-in-place): it
anchors on the value's first command by definition, so the misplacement
cannot be written at all and the idiom is one self-evident line.

```pathogen
// before
seam.drawTo(seam.startPoint.x, seam.startPoint.y);

// after
seam.draw();
```

**Example 2 grew up twice.** The fold lines you see above are the
result of two rounds of the loop. First, dedup: the original sample
kept shared folds from double-drawing with an ownership rule — each
panel stroked only the seams on its right-hand side, a
midpoint-versus-center comparison that worked and taught nothing. Cut
results now answer
[`pieces.seams()`](/docs#path-blocks-seams-array-of-pathblock): each
physical seam exactly once, subject-local like the pieces themselves,
so the double-draw bug class (opposite-phase dashes filling each
other's gaps) is unwritable. Second, direction: even deduped, every
fold shipped in one dash style, because all seams shared one anonymous
`cut` group and mountain-versus-valley — *the* distinction a real
accordion template turns on — was inexpressible. Knife labels now
[ride through the cut](/docs#segment-labels-label-names): an edge
authored `as segment('mountain')` heals into seams labeled
`cut.mountain`, the umbrella `segmentAll('cut')` still answers
everything, and sub-label queries answer one knife at a time.

```pathogen
// original: per-panel ownership rule (~10 lines)
for (seam in placed.segmentAll('cut')) {
  let mid = seam.get(0.5);
  if (mid.x > panelCenterX) {
    seam.draw();
  }
}

// today: each physical seam once, routed by the knife that made it
for (seam in panels.seams()) {
  if (seam.segmentAll('cut.mountain').length > 0) {
    mountainLayer.apply {
      seam.project(originX, originY).draw();
    }
  } else {
    valleyLayer.apply {
      seam.project(originX, originY).draw();
    }
  }
}
```

The knife names paid off a second time in Example 6: a wedge's two
radial edges come from two *different* knives, so exact sub-label
queries return each edge on its own, and the merged-V `subPath`
surgery at guessed fractions is gone.

**The tabs' direction test turned out to be dead code.** Example 3
settles which way a tab points by reading the seam normal — and the
original sample compared it against the piece's center, flipping when
it aimed inward: three lines of ceremony per tab. Working the friction
log revealed the flip never fires. A cut always orients each piece's
outline the same way around its material, so a seam normal points out
of the piece *by construction*. The guarantee
[is now documented](/docs#path-blocks-normalt-point-angle) and pinned
by tests, and both tab samples dropped the dance — with byte-identical
output, the strongest proof the code was dead. The purest friction-log
lesson in the series: the feature existed all along; the fix was a
sentence, and the sentence was the feature.

```pathogen
// before: probe, dot product, conditional flip
let n = seam.normal(tabMid);
let toCenter = calc(cos(n.angle) * (cx - n.point.x) + sin(n.angle) * (cy - n.point.y));
let outwardAngle = calc(toCenter > 0 ? n.angle + PI() : n.angle);

// after: the normal already faces out of the material
let outwardAngle = seam.normal(tabMid).angle;
```

**The medallion's knives stopped doing arithmetic.** Example 6's three
knives were originally one cutter block whose strokes chained together
with hand-computed relative moves — and one of those moves shipped
wrong before review caught it. `cut()` now accepts an
[array of cutters](/docs#path-blocks-cutcutter-array-of-pathblock), so
the sample builds one single-stroke knife per angle in a loop and
hands the set over in a single call. A knife that states only "start
here, cut this" has no arithmetic to get wrong.

**The query language grew its `:` half.** When knife names landed
(Example 2's second act, above), the `.` in `cut.mountain` was only
half of a deliberate decision: label names reserve *all* punctuation,
with `:` explicitly held back for CSS-style pseudo-selectors that
didn't exist yet. Now they do — [`:atomic`, `:first`, `:last`, and
`:nth(k)`](/docs#segment-labels-query-pseudo-selectors). `:atomic` is the
merge rule's official escape hatch (one block per drawing command — a
labeled `circle()` hands back its individual arcs), and the position
family selects whole runs from a group. Honest accounting: nothing in
this series *needs* them anymore — the sub-labels above already
dissolved the case that demanded an escape hatch — which is exactly why
they shipped as query syntax rather than yet another method: the
grammar was already paid for.

```pathogen
// before: recover an individual edge by fraction guessing
let firstArc = run.subPath(0, 0.5);

// after: ask for it
let arcs = wheel.segmentAll('rim:atomic');
let lastTooth = comb.segment('tooth:last');
```

**The traps got fences.** Two hazards this series stepped on
never bit the published samples only because a style guideline banned
the ammunition. Both are now language rules instead of etiquette.
Single-letter variables that shadow path commands (`let m = 25;` then
`L m 40`) used to fail with a `Missing ';'` pointed at punctuation
nowhere near the mistake; the compiler and the editor now say what
actually happened (`'m' is a path command here — write calc(m), or
rename the variable`), with a one-click calc() wrap in the playground.
And the angle-suffix names `pi`, `deg`, and `rad` are now
[reserved words](/docs#syntax-variables): suffix only, never a
variable, so `calc(pi)` explains itself instead of reporting an
undefined variable two spellings away from three working ones
(`0.5pi`, `PI()`, `deg(x)`).

## Where to go next

- [Jigsaw: pieces that know their own edges](/blog/cutting-room-jigsaw)
  — part 2 cuts with wavy knives and sorts pieces by the rim label
  they kept.
- [Cutting Paths](/blog/pathblock-cutting) — the full `cut()` tour this
  series builds on: cookie cutters, donuts, open subjects.
- [PathBlock parametric sampling](/blog/pathblock-parametric-sampling)
  — `get`, `normal`, and `partition`, the seam-walking tools used here.
- Reference: [labels survive derived paths](/docs#segment-labels-labels-survive-derived-paths)
  and [cutting paths](/docs#path-blocks-cutting-paths) in the docs.

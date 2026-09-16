# Blog synopsis v1 — path queries + subscriptions (2026-09-15)

Proposed shape: a two-part series, **"Drawing Without Bookkeeping"**, published on
consecutive days. Part 1 covers milestone 1 (`query` / `queryAll`), part 2 covers
milestone 2 (`subscribe`). Alternative: one long post; rejected here because each
milestone carries six samples and its own gotchas.

Audience: people who build things with code (per voice-and-audience.md). Assumes
PathBlock basics and the segment-labels post; links both as prerequisites.

## Part 1 — "Ask the Path" (working title; alternates: "Every Arc, Every Corner";
## "No Coordinate Twice")

Synopsis (~250 words): A path is a list of commands, and until now the only way to
get anything back out of it was to write the coordinates a second time or to
label every joint by hand. This post introduces `query()` and `queryAll()`: one
CSS-flavoured string that asks a path for things by kind — every arc, every
corner, everything one `circle()` call drew — and hands back objects that already
know their own geometry. It opens with the contrast row the docs use (dots on
every corner, written twice vs. asked once), then ladders through the nouns:
`command(a)` with the arc's own `center`, labels through the same grammar
(`segment(tooth)`, `endpoint(root)`), the descendant combinator (`segment(tooth)
endpoint`), `call(circle)` as the unit a statement emits, filters and the
language's own range spellings (`command(line)[length>30]`, `endpoint:nth(-3..-1)`),
and `subpath(1..2)`. One section is reserved for the naming collision we found:
the `subpath` noun selects pen-down runs by the SVG rule while the existing
`.subPath(t0, t1)` method slices by arc length — same word, two jobs, with a
diagram of both on one path. Closes with the "things to know first" list
(finalized geometry, endpoints skip moves, case-insensitive letters, page
coordinates from projections) and the arc-length fix (ISSUE-021) as a footnote,
since `Command.length` on a circle finally says 2πr.

Samples (post52): 01-contrast (twice vs once), 02-every-arc (tab + fillet arc
centres spoked), 03-labels-through-query (comb, combinator), 04-call (face:
bounding boxes per statement), 05-filters-and-ranges (three squares with
indexes), 06-subpath-vs-subPath (diagram).

## Part 2 — "Thinking and Drawing in Parallel" (Ryan's working title)

Synopsis (~250 words): Part 1 answered questions after the drawing was done. This
post lets a layer answer them by itself: `layer.subscribe(selector) {|match, i,
sub| …}` registers a query that runs itself, and the annotations follow the
drawing wherever it happens. The mental model is the one we settled in design: a
subscription is a window over the layer's records — `subscribe` opens it,
`unsubscribe()` closes it — and nothing is matched while you draw. At program
end each selector runs once over the finalized geometry in its window (so
`:last` and `:nth(-3..-1)` deliver exactly the final items), the global queue is
replayed in program order, and callbacks run as ordinary top-level code that can
open apply blocks on any other layer, text layers included. The post shows
fan-out (dots and numbered labels from one subscription), windows (annotate one
apply block among several; a late subscription), completion-only selectors, and
chains (rings around the dots: annotations annotated, rounds to a fixpoint). It
states the sharp edges early and honestly: variables hold their final values
inside a callback, output lands after direct drawing in the target layer, a
callback may not draw into its own source, and a cycle errors naming the chain.
It ends with the idea from the research prompt — bookkeeping was never the
interesting part of a drawing — and points at what is deferred (target-centric
`observe`, observing path blocks).

Samples (post53): 01-declared-first (dots before drawing), 02-fan-out (dots +
labels), 03-windows (two shapes, one annotated), 04-last-three, 05-chain (rings),
06-final-values (the closure caveat made visible).

## Open for Ryan

1. Series vs one post. 2. Titles. 3. Whether the ISSUE-021 note belongs in part 1
or in a separate short changelog-style post. 4. Sample count per part (six each).

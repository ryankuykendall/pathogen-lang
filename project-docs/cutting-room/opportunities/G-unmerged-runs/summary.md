# Item G — Unmerged-runs escape hatch (friction log #8, post-F scope)

**Status:** rich summary for user review — no code changed yet.

## Before / after (under the recommended design)

Before (today):
```pathogen
// circle() labels BOTH its arcs as one run — getting the arcs back
// individually is subPath surgery at guessed fractions.
let wheel = @{
  circle(0, 0, 40) as segment('rim');
};
let run = wheel.segment('rim');       // ONE run: both arcs fused
let firstArc = run.subPath(0, 0.5);   // hope the split is at t=0.5
```

After (proposal — the first query pseudo-selector):
```pathogen
let arcs = wheel.segmentAll('rim:each');  // [arc1, arc2] — one block
                                          // per command, merge undone
```

## Where this stands after Item F

Honesty first: **the case that drove this log entry no longer exists.**
Friction #8 was logged because post41/06's wedges answered one merged
V-run for two radial edges; Item F's per-knife sub-labels
(`segmentAll('cut.k0')`) dissolved that exact case, and the sample now
ships without any `subPath` surgery. What remains is the *general*
version: adjacent commands sharing one authored label always fuse
(`findLabeledRuns`, `segments.ts:267` — merge-by-adjacency is the
documented contract), and there is no way to un-fuse them. Verified
remaining shapes:

- A stdlib call labels everything it draws as one run (`circle(...)
  as segment('rim')` → one 2-arc run — the docs advertise this as a
  shortcut, and it is, until you want the halves).
- Consecutive same-labeled commands authored in a loop with nothing
  between them.
- Two seams of the SAME named knife meeting at a corner (F unmerges
  different knives only).

**No published sample currently needs any of these.** That makes
"close as delivered-enough" a defensible answer.

## Verified mechanics

- `findLabeledRuns` (`segments.ts:267`) is the sole matcher; three call
  sites (`index.ts:2282` layer, `:2601` PathBlock, `:3254`
  ProjectedPath) all funnel through it (Item F review re-verified).
- Annotated mode lists every segment query as unsupported in one
  message (`annotated.ts:1861`) — a new query *form* needs no annotated
  work, just the existing entry.
- Authored labels cannot contain `:` (Item F validation) — so a pseudo
  suffix in a query string is collision-free by construction, and `:`
  was reserved for exactly this (the user's own F-era design note).

## Design options

1. **`:each` — the first query pseudo-selector (recommended).**
   `segmentAll('rim:each')` returns one block per command; the bare
   query keeps merging. Cashes in the `:` namespace deliberately
   reserved in Item F with the smallest possible grammar
   (`name(:pseudo)?`, one pseudo). Unknown pseudos error listing the
   available set. Segment queries only (vertex/point queries have no
   merge concept).
2. **Options argument**: `segmentAll('rim', {merge: false})`. Works,
   but spends an options-bag on what the query string was designed to
   express, and leaves the reserved `:` space unused.
3. **Close #8 as delivered-enough.** F resolved the driving case; add
   a docs note that same-label unmerging is `subPath` (or distinct
   labels) until a real consumer appears.

Also worth deciding if option 1 is taken: whether to add the position
family (`:first` / `:last` / `:nth(k)`) now — your F-era sketch
(`segment('cut.my-label:last')`) — or hold the grammar at `:each`
until a consumer demands more. My lean: `:each` only, grammar built so
the family drops in later.

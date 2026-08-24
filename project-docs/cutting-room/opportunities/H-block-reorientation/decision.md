# Item H — decision (2026-08-24)

User reviewed the summary and proposed a richer route for mechanism 1:
ctx as a declared PathBlock block argument (`@{|ctx| ...}`) with
`ctx.origin` deltas / `ctx.origin.return()` (relative purity — desugar
to `m dx dy`, not absolute M) and in-block label querying
(`ctx.query.point('name')`). User invited pushback given the scope
increase; pushback given and accepted per their contingency: the ctx
design is **recorded as fast-follow Item L**
(../L-ctx-block-argument/intent.md) and mechanism 1 (block-local
absolute `M`) is **dropped** — it would be superseded by the ctx
surface and would churn the samples twice.

**Item H ships mechanism 2 only: `cut()` accepts an array of cutters.**
`plate.cut([k1, k2, k3])` — flat-map of PathBlock/ProjectedPath
commands into the existing multi-chain pipeline; enables loop-built
knives (rose-window spokes) and keeps per-knife blocks trivially
relative (no chaining arithmetic).

Sequencing: implement after Item B's review round closes and B is
committed (clean per-item diffs).

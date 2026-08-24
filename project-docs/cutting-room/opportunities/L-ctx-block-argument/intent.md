# Item L (fast-follow): ctx as a declared PathBlock argument + in-block label querying

**Recorded 2026-08-24 from user design sketch during the Item H
collaboration. Deferred by agreement (user pre-authorized: "record the
basic intent... so that we can fast follow on it after we wrap up these
fixes"). Supersedes Item H's mechanism 1 (block-local absolute `M`),
which will NOT ship — the ctx route is the intended re-orientation
surface and shipping both would churn the samples twice and split the
idiom.**

## The user's sketch (preserved)

```pathogen
let myPB = @{|ctx| //-- Get rid of magical presence of ctx and make it a block argument (plus support block arguments in PathBlocks...
  h 20
  v 40
  let {dx, dy} = ctx.origin;
  m dx dy
  h 50
  v 50 as endpoint('fifties');
  ctx.origin.return(); //-- Since we are capable doing the positioning book keeping, I would rather this be a relative move of 'm dx dy' rather than an M 0 0 to retain relative positioning purity.
  m 20 10
  let myFiftiesEndpoint = ctx.query.point('fifties');
  l calc(myFiftiesEndpoint.x - 20) calc(myFiftiesEndpoint.y - 10)
};
```

## Design principles (user-stated)

1. **De-magic ctx**: the block's context becomes an explicit block
   argument — `@{|ctx| ... }` — mirroring the existing lambda/worker
   `{|a, b| ...}` convention. PathBlocks gain block arguments.
2. **Relative purity**: re-orientation stays expressed as relative
   moves. `ctx.origin` yields the delta `{dx, dy}` back to the block
   origin (destructurable); `ctx.origin.return()` emits the `m dx dy`
   itself. Explicitly preferred over absolute `M 0 0` — the language
   keeps the blocks-are-relative invariant at the surface.
3. **In-block label querying**: `ctx.query.point('name')` (and
   presumably segment/vertex) answers labels authored EARLIER IN THE
   SAME BLOCK, in block-local coordinates — enabling "draw a line back
   to that corner" self-referential geometry.

## Interactions to spec before implementation

- Grammar/AST/builder: block params on `@{` — the heaviest lifecycle
  row (new syntax construct: Lezer grammar, ast-builder, both
  evaluators, TextMate + Lezer highlighting, language services incl.
  ctx member completions inside blocks).
- The in-block ctx freeze (position pinned at (0,0)) is deliberate —
  context-aware stdlib fns already have defined in-block behavior
  (polarLine emits relative, etc.). A live, queryable block ctx must be
  specced against those (does ctx.position exist? only origin + query?).
- Mid-build label queries hit the authored-vs-finalized rule: corner-op
  suffixes apply at finalization, so a query mid-build should answer
  AUTHORED geometry (consistent with the existing PathBlock
  authored-position preference) — needs an explicit statement + tests.
- Naming: `ctx.origin` as delta-to-origin vs a Point; `.return()` as an
  emitting method (a method with side effects inside a block) — decide
  whether emission-from-expression fits the statement model or whether
  it should be a statement form.
- Whether the bare (non-argument) `@{ ... }` form keeps working
  unchanged (it must — 21 published samples).

## Motivating friction

Log #6 (knife chaining) + the Item H diagnosis: re-orientation inside
relative-only blocks forces pen bookkeeping. Interim relief ships as
Item H = `cut(array)` only (loop-built knives kill most chaining).
The remaining re-orientation need lands here, done right.

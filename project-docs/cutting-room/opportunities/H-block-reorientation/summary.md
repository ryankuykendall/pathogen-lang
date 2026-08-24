# Item H (log #6): in-block re-orientation — rich summary

**Delivered 2026-08-24 for user review.** No code changed yet. Framing
per user diagnosis (diagnosis.md): the knife-chaining bugs were forced
pen-position bookkeeping; the need is a way to re-orient inside a
PathBlock without tracking the pen.

## Before / after — the actual knife blocks

**Hex medallion knives (post41/06).** Three strokes through the center;
each `m` must be computed from the previous stroke's endpoint — the site
of one of the two authoring bugs:

```pathogen
// BEFORE — chained relative moves (each m depends on the previous end)
let knives = @{
  m calc(0 - knifeReach) 0
  l calc(knifeReach * 2) 0
  m calc(0 - knifeReach - knifeReach * cos60) calc(0 - knifeReach * sin60)
  l calc(knifeReach * 2 * cos60) calc(knifeReach * 2 * sin60)
  m 0 calc(0 - knifeReach * 2 * sin60)
  l calc(0 - knifeReach * 2 * cos60) calc(knifeReach * 2 * sin60)
};
```

```pathogen
// AFTER (mechanism 1: block-local absolute M) — every stroke stated
// independently: where it starts, what it draws. No chaining.
let knives = @{
  M calc(0 - knifeReach) 0
  l calc(knifeReach * 2) 0
  M calc(0 - knifeReach * cos60) calc(0 - knifeReach * sin60)
  l calc(knifeReach * 2 * cos60) calc(knifeReach * 2 * sin60)
  M calc(knifeReach * cos60) calc(0 - knifeReach * sin60)
  l calc(0 - knifeReach * 2 * cos60) calc(knifeReach * 2 * sin60)
};
```

**Rose-window spokes (post44/05).** Eight spokes + a ring knife,
hand-chained today (16 lines of delta arithmetic). With mechanism 2
the knives become a *loop*:

```pathogen
// AFTER (mechanism 2: cut takes an array) — knives built
// programmatically; impossible in one cutter block today.
let knives = [];
for (k in 0..7) {
  let spokeAngle = calc(k * PI() / 4);
  knives.push(@{
    m calc(36 * cos(spokeAngle)) calc(36 * sin(spokeAngle))
    l calc(76 * cos(spokeAngle)) calc(76 * sin(spokeAngle))
  });
}
knives.push(@{
  circle(0, 0, 36) as segment('ring');
});
let panes = disc.cut(knives);
```

## Mechanism comparison

| | Today | 1: block-local `M` | 2: `cut(array)` | `returnToOrigin()` | Live block `ctx` |
|---|---|---|---|---|---|
| Jump to a known point mid-block | chained `m` deltas (the bug site) | `M x y` | per-knife blocks start fresh | origin only | `m calc(x - ctx.position.x) …` |
| Programmatic knife generation | impossible in one block | still one literal block | loop + `push` ✓ | — | — |
| Return to origin | `m -66 -228` hand-computed | `M 0 0` | — | `returnToOrigin()` | `m ctx.toOrigin.dx …` |
| Implementation | — | eval-time rejection relaxed for `M` only; desugars to relative `m` at block build (position is tracked there); both evaluators + docs + tests | argument-validation sites ×2 (7 lines each, flat-map commands; pathCut already multi-chain) + api + docs + tests | one statement fn — subsumed by `M 0 0` | requires unfreezing the deliberately frozen in-block ctx — real semantic step |
| Risk | — | low: uppercase parses today, rejected at eval; only the check moves. Other uppercase commands (L, C…) stay rejected | low: additive argument form | — | medium: freeze exists for context-fn determinism |

## Recommendation

Ship **mechanisms 1 + 2 together** as Item H:

1. **Block-local absolute `M`** — `M x y` inside `@{}` means "move to
   (x, y) in this block's own frame," desugared to a relative `m` while
   the block is built (the builder already knows the pen position).
   Only `M`; every other uppercase command keeps today's rejection (the
   error message gains a hint that `M` is allowed). This is the
   re-orientation mechanism your diagnosis named — and `M 0 0` *is*
   `returnToOrigin()`, so no extra API.
2. **`cut()` accepts an array of cutters** — `plate.cut([k1, k2, k3])`
   flat-maps the knives' commands; pathCut already treats the cutter as
   independent chains, so composition is argument plumbing. This
   unlocks loop-built knives (the rose window's eight spokes) and keeps
   single-stroke knives trivially relative.

Defer: live in-block `ctx` (the freeze is deliberate; revisit only if a
use case survives mechanisms 1+2). `returnToOrigin()` not needed.

## Scope (if approved)

- Docs first: path-blocks.md block-rules list (rule 6 "relative-only"
  amended), the "Cutting Paths" cutter contract (array form), syntax.md
  if it repeats the rule.
- Evaluators: evaluatePathBlockStatement uppercase check (index.ts:1933
  region) + the annotated twin; the M→m desugar where block position is
  tracked; cut() argument sites ×2 (annotated cut stays unsupported).
- pathogen-api: cut signature (cutter | cutter[]); completions regen.
- Tests: M in blocks (top level, loops, fns-in-blocks), M 0 0 return,
  other uppercase still rejected, annotated parity, cut(array) both
  receivers, mixed block/projected arrays, empty array error, labels
  from array cutters, byte-guards (samples rewritten must render
  byte-identical geometry).
- Series: rewrite knife blocks in 41/06, 42/03, 42/05, 44/01, 44/03,
  44/05 (spokes → loop); closing-section entries in papercraft,
  jigsaw, stained glass.

## Payoff

The two authoring-bug sites become unwriteable; knife geometry reads as
"start here, cut this"; and programmatic cutters open compositions the
series couldn't attempt (parametric radial cuts, grids from loops).

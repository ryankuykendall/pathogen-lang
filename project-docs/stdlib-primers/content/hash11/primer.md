---
fn: hash11
title: "hash11 — The same dice, rolled between −1 and 1"
hook: "The same dice, rolled between −1 and 1."
order: 2
docsAnchor: stdlib-hash-noise
---

## What it does

`hash11(n, seed?)` is [`hash01`](./hash01.html)'s twin for *nudges*. Same
deterministic lookup, same seeds-as-decks behavior, same "truncates to
whole numbers" rule — but the answer lands between **−1 and 1** (−1
inclusive, 1 exclusive) instead of 0 and 1.

The relationship is exact and worth seeing once:
`hash11(n)` is precisely `hash01(n) * 2 - 1`. Everything you learned in
the `hash01` primer — determinism, bit-exactness across machines, seeds,
integer truncation — carries over unchanged, so this page won't repeat it.

## Why you'd use it

Because most design randomness isn't "pick a value" — it's "**start from
the right value and drift a little, either direction**." Signed means the
drift can be negative: a push left as easily as right, down as easily as
up. Baseline wobble, tilt, breathing room, hand-drawn looseness — they're
all symmetric drifts around a deliberate center, and `[−1, 1)` is their
natural shape.

The idiom to memorize (it's all over the Pathogen blog):

```
let wobble = 1 + hash11(i, layerIndex) * 0.2;
```

That's "a ±20% factor, per index, per layer" — multiply it onto a width, a
radius, a spacing, anything. The `0.2` is the amplitude dial; the seed
keeps each layer's wobble independent.

## Example 1 — Above and below the line

The range, visually: 48 dots whose height is `hash11(i) * 43` measured
from a center axis. About half land above, half below, at unrelated
heights.

{{example:01-above-below}}

Note the y expression: `95 - hash11(i) * 43`. Screen y grows downward, so
subtracting a positive answer moves the dot *up* — the sign of `hash11`
maps directly onto "which side of the line."

## Example 2 — Hand-set type

The simplest real use: baseline jitter. Both rows are the same 26 bars;
the bottom row drops each baseline by `hash11(i) * 5` and leans each bar
by `hash11(i, 1) * 4`.

{{example:02-hand-set-type}}

Five pixels of drop and four of lean — tiny numbers, big warmth. Because
the amounts are signed, bars drift both up *and* down, left *and* right;
with `hash01` you'd get a row that only ever sagged one way.

## Example 3 — The jitter knob

Jitter amplitude as a single tunable dial. Three copies of one 10×6 grid,
with every dot offset by `(hash11(idx) * j, hash11(idx, 1) * j)` — and
`j` set to 0, 2, and 5.

{{example:03-jitter-knob}}

Read it left to right: rigid, relaxed, scattered. Same underlying pattern,
same hashed offsets — the *entire* difference is one number. This is what
"randomness as a design decision" means in practice: the amount of chaos
is a parameter you tune, not a property you hope for.

## Example 4 — ±20% on a stroke

The house idiom applied to a variable-width stroke. Both ribbons share one
smooth width profile (a [`bump`](./bump.html) — covered in primer 05);
the bottom one multiplies each stop's width by `1 + hash11(i) * 0.25`.

A quick gloss on the stroke machinery, since this is its first appearance
in the series: `compoundVariableOffset` turns a path into a ribbon by
placing width *stops* along it — each `vo.stop(t, w, ..., -w, ...)` call
says "at position t, extend w units each side." The builder function is
applied with the `<<` operator, `CurveContinuity.G1` means "no kinks
between stops," and `Cap.tapered` closes the ends to points. Full story in
the [variable-offset docs](https://pathogen.studio/docs#variable-offset-variable-offset);
here, all that matters is *the width at each stop is a number you compute*.

{{example:04-stroke-jitter}}

The smooth profile is the *design*; the wobble factor is the *texture*.
Keeping them separate — a clean profile times a signed jitter — means you
can retune either without touching the other. This is exactly how the
sixteen-layer glow in
["The Reliable Line"](https://pathogen.studio/blog/the-reliable-line)
gets its shimmer.

## Example 5 — Sketchy circles

A finished effect: five concentric "pencil" rings, each drawn twice like
overlapping pencil passes. Every ring is a 64-sided polygon whose vertex
radius wobbles by ±7%, with the ring-and-pass number as the seed — so
every pass wobbles its own way.

{{example:05-sketchy-circles}}

Two passes at 65% opacity is what sells the pencil: where the passes agree
the line darkens, where they disagree it feathers. The whole effect is
one signed wobble (`r * (1 + hash11(k, seed) * 0.07)`) plus disciplined
seeds — pass A and pass B of ring 2 read decks 4 and 5, so no two strokes
ever wobble in sync.

## Where to go next

- [`hashRange`](./hashRange.html) — when the drift should live in a
  min/max band instead of around a center.
- [`bump`](./bump.html) — the smooth width profiles this primer's
  example 4 jitters.
- [`noise`](./noise.html) — when neighboring indices should *agree*
  instead of drifting independently.
- Reference: [Hash & Noise docs](https://pathogen.studio/docs#stdlib-hash-noise).

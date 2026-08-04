---
title: "hash11: The Same Dice, Rolled Between −1 and 1"
slug: primer-hash11
date: 2026-08-05
description: "Part 2 of the stdlib primers: hash11 is hash01's twin for nudges — signed, deterministic jitter in [−1, 1). Baseline wobble, tilt, and the ±20% idiom that textures the blog's glow strokes."
---

*Part 2 of 7 in our series of stdlib primers — the deterministic hash, noise, and shaping functions.*

> **Series: Stdlib Primers**
> 1. [hash01](/blog/primer-hash01) — a random number that never changes its mind
> 2. **hash11** (this post) — the same dice, rolled between −1 and 1
> 3. [hashRange](/blog/primer-hashrange) — randomRange with a memory
> 4. [smoothstep](/blog/primer-smoothstep) — the S-curve that turns a cliff into a ramp
> 5. [bump](/blog/primer-bump) — a hill you can put anywhere
> 6. [noise](/blog/primer-noise) — randomness with a smooth ride
> 7. [noise2](/blog/primer-noise2) — a weather map of smooth randomness

## What it does

`hash11(n, seed?)` is [`hash01`](/blog/primer-hash01)'s twin for *nudges*.
Same deterministic lookup, same seeds-as-decks behavior, same "truncates
to whole numbers" rule — but the answer lands between **−1 and 1** (−1
inclusive, 1 exclusive) instead of 0 and 1.

The relationship is exact and worth seeing once:
`hash11(n)` is precisely `hash01(n) * 2 - 1`. Everything you learned in
part 1 — determinism, bit-exactness across machines, seeds, integer
truncation — carries over unchanged, so this post won't repeat it.

## Why you'd use it

Because most design randomness isn't "pick a value" — it's "**start from
the right value and drift a little, either direction**." Signed means the
drift can be negative: a push left as easily as right, down as easily as
up. Baseline wobble, tilt, breathing room, hand-drawn looseness — they're
all symmetric drifts around a deliberate center, and `[−1, 1)` is their
natural shape.

The idiom to memorize (it's all over this blog):

```pathogen
let wobble = 1 + hash11(i, layerIndex) * 0.2;
```

That's "a ±20% factor, per index, per layer" — multiply it onto a width, a
radius, a spacing, anything. The `0.2` is the amplitude dial; the seed
keeps each layer's wobble independent.

## Example 1 — Above and below the line

The range, visually: 48 dots whose height is `hash11(i) * 43` measured
from a center axis. About half land above, half below, at unrelated
heights.

<mini-workspace src="samples/post34/01-above-below.pathogen" caption="48 dots at hash11(i) · 43 from the center axis — ticks mark −1, 0, and +1." code-open></mini-workspace>

Note the y expression: `95 - hash11(i) * 43`. Screen y grows downward, so
subtracting a positive answer moves the dot *up* — the sign of `hash11`
maps directly onto "which side of the line."

## Example 2 — Hand-set type

The simplest real use: baseline jitter. Both rows are the same 26 bars;
the bottom row drops each baseline by `hash11(i) * 5` and leans each bar
by `hash11(i, 1) * 4`.

<mini-workspace src="samples/post34/02-hand-set-type.pathogen" caption="The same 26 bars twice: machine-set above, baseline-and-lean jittered below." code-open></mini-workspace>

Five pixels of drop and four of lean — tiny numbers, big warmth. Because
the amounts are signed, bars drift both up *and* down, left *and* right;
with `hash01` you'd get a row that only ever sagged one way.

## Example 3 — The jitter knob

Jitter amplitude as a single tunable dial. Three copies of one 10×6 grid,
with every dot offset by `(hash11(idx) * j, hash11(idx, 1) * j)` — and
`j` set to 0, 2, and 5.

<mini-workspace src="samples/post34/03-jitter-knob.pathogen" caption="One 10×6 grid, three amplitudes: j = 0, 2, 5." code-open></mini-workspace>

Read it left to right: rigid, relaxed, scattered. Same underlying pattern,
same hashed offsets — the *entire* difference is one number. This is what
"randomness as a design decision" means in practice: the amount of chaos
is a parameter you tune, not a property you hope for.

## Example 4 — ±20% on a stroke

The house idiom applied to a variable-width stroke. Both ribbons share one
smooth width profile (a [`bump`](/blog/primer-bump) — covered in part 5);
the bottom one multiplies each stop's width by `1 + hash11(i) * 0.25` —
the memorized idiom with its amplitude dialed up to 0.25.

A quick gloss on the stroke machinery, since this is its first appearance
in the series: `compoundVariableOffset` turns a path into a ribbon by
placing width *stops* along it — each `vo.stop(t, w, ..., -w, ...)` call
says "at position t, extend w units each side." The builder function is
applied with the `<<` operator, `CurveContinuity.G1` means "no kinks
between stops," and `Cap.tapered` closes the ends to points. Full story in
the [variable-offset docs](/docs#variable-offset-variable-offset); here,
all that matters is *the width at each stop is a number you compute*.

<mini-workspace src="samples/post34/04-stroke-jitter.pathogen" caption="One smooth width profile, twice: clean above, times 1 + hash11(i) · 0.25 below. The profile is the design; the wobble factor is the texture — and each is tunable without touching the other." code-open></mini-workspace>

The smooth profile is the *design*; the wobble factor is the *texture*.
Keeping them separate — a clean profile times a signed jitter — means you
can retune either without touching the other. This is exactly how the
sixteen-layer glow in
["The Reliable Line"](/blog/the-reliable-line) gets its shimmer.

## Example 5 — Sketchy circles

A finished effect: five concentric "pencil" rings, each drawn twice like
overlapping pencil passes. Every ring is a 64-sided polygon whose vertex
radius wobbles by ±7%, with the ring-and-pass number as the seed — so
every pass wobbles its own way.

<mini-workspace src="samples/post34/05-sketchy-circles.pathogen" caption="Two passes per ring at 65% opacity: where they agree the line darkens, where they disagree it feathers — a pencil, from one signed wobble and disciplined seeds." code-open></mini-workspace>

Two passes at 65% opacity is what sells the pencil: where the passes agree
the line darkens, where they disagree it feathers. The whole effect is
one signed wobble (`r * (1 + hash11(k, seed) * 0.07)`) plus disciplined
seeds — pass A and pass B of ring 2 read decks 4 and 5, so no two strokes
ever wobble in sync.

## Where to go next

- [`hashRange`](/blog/primer-hashrange) — when the drift should live in a
  min/max band instead of around a center.
- [`bump`](/blog/primer-bump) — the smooth width profiles this post's
  example 4 jitters.
- [`noise`](/blog/primer-noise) — when neighboring indices should *agree*
  instead of drifting independently.
- Reference: [Hash & Noise docs](/docs#stdlib-hash-noise).

---
title: "hashRange: randomRange with a Memory"
slug: primer-hashrange
date: 2026-08-06
description: "Part 3 of the stdlib primers: hashRange(i, min, max) is the deterministic drop-in for randomRange — put an index in front and the pick keeps its word forever. Ranges become the design's tuning panel."
series: "Stdlib Primers"
seriesPart: 3
---

*Part 3 of 7 in our series of stdlib primers — the deterministic hash, noise, and shaping functions.*

> **Series: Stdlib Primers**
> 1. [hash01](/blog/primer-hash01) — a random number that never changes its mind
> 2. [hash11](/blog/primer-hash11) — the same dice, rolled between −1 and 1
> 3. **hashRange** (this post) — randomRange with a memory
> 4. [smoothstep](/blog/primer-smoothstep) — the S-curve that turns a cliff into a ramp
> 5. [bump](/blog/primer-bump) — a hill you can put anywhere
> 6. [noise](/blog/primer-noise) — randomness with a smooth ride
> 7. [noise2](/blog/primer-noise2) — a weather map of smooth randomness

## What it does

`hashRange(n, min, max, seed?)` picks a value between `min` and `max` —
deterministically, keyed by the whole-number index `n`. It's
[`hash01`](/blog/primer-hash01) scaled into your range:
`min + hash01(n, seed) * (max - min)`, exactly.

The pitch is the title of this post: **`randomRange` that keeps its word.**
Same idea, same feel, one extra argument — the index that pins the answer.
`randomRange(4, 12)` re-rolls on every compile; `hashRange(i, 4, 12)` gives
element `i` the same answer forever.

One notation note: the result lives in **[min, max)** — it can land
exactly on `min` and gets arbitrarily close to `max` without ever hitting
it. In graphics you will never see the difference, and it has one genuinely
useful consequence: `floor(hashRange(i, 0, 3))` divides *perfectly evenly*
into buckets 0, 1, 2 — no edge case where the answer lands on 3.

## Why you'd use it

Two reasons, one practical and one about how you think:

1. **Migration.** If your sketches are sprinkled with `randomRange` and
   you're tired of the artwork reshuffling every time you save, the
   rewrite is mechanical: add an index as the first argument, move on
   with your life.
2. **Ranges read like a spec.** `hashRange(i, 35, 125)` says "buildings
   between 35 and 125 tall" — the design intent is *in the call*.
   Tightening the numbers tightens the design; the ranges become the
   tuning panel for the whole piece.

Everything about seeds, determinism, and integer truncation is inherited
from [`hash01`](/blog/primer-hash01) — this post won't repeat it.

## Example 1 — The drop-in swap

Both rows size 40 dots from the same 1.5-to-5 range. The top row asks
`randomRange`; the bottom asks `hashRange` with the loop index in front.

<mini-workspace src="samples/post35/01-drop-in-swap.pathogen" caption="Forty dots sized from the same 1.5–5 range: randomRange above, hashRange(i, ...) below." code-open></mini-workspace>

On the page they look equivalent — that's the point; you give up nothing
visually. The difference is behavioral: **paste this into the playground
and recompile — the top row reshuffles while the bottom row doesn't
move.** (This is the one `randomRange` appearance in this post; the
contrast is the lesson.)

## Example 2 — Skyline

One range per design property. Building height comes from
`hashRange(i, 35, 125)`, width from `hashRange(i, 10, 22, 1)`, and a
subtle facade shade from a third stream.

<mini-workspace src="samples/post35/02-skyline.pathogen" caption="The two range calls ARE the spec: heights 35–125, widths 10–22. Edit the height line to (i, 50, 90) and the same code draws a suburb." code-open></mini-workspace>

Read the two range calls as the spec they are: "heights 35–125, widths
10–22." Now imagine editing just the height line to `(i, 50, 90)` — the
towers even out and the same code draws a suburb. That's the tuning-panel
idea: structure stays, character is in the numbers.

## Example 3 — Confetti, spec'd

Four properties, four ranges, four seeds — a complete scatter system in
four lines: position (x, y), size, and hue.

<mini-workspace src="samples/post35/03-confetti.pathogen" caption="Four lines, four independent streams: x, y, radius, hue. Each range line is a design decision you can tighten or loosen without touching the others." code-open></mini-workspace>

Two things worth copying. First, each property gets its **own seed**
(0, 1, 2, 3) so streams stay independent — reusing a seed would correlate,
say, size with hue. Second, notice every value is bound to a `let` before
the drawing call. That's a readability choice, not a requirement (a
`calc(...)` expression works directly in an argument) — but it's what
makes the four lines read as a spec sheet.

## Example 4 — Rain

Ranges can pick *categories*, not just quantities. Each of 80 streaks
computes `floor(hashRange(i, 0, 3, 2))` — an even three-way pick — and the
bucket routes it to a near, middle, or far layer with matching opacity.

<mini-workspace src="samples/post35/04-rain.pathogen" caption="floor(hashRange(i, 0, 3, 2)) buckets every streak into exactly {0, 1, 2} with equal shares — the half-open range earning its keep. One population, three depth styles." code-open></mini-workspace>

This is the half-open range earning its keep: `[0, 3)` floors to exactly
{0, 1, 2} with equal shares. The same loop runs in all three layers and
each keeps only its own bucket — a common Pathogen pattern for "one
population, several styles."

## Example 5 — Pebble beach

The finale is a tuning exercise. Four overlapping rows of pebbles, back to
front; each pebble's width, squash, position, and warmth come from named
ranges, and nearer rows draw from bigger width ranges.

<mini-workspace src="samples/post35/05-pebble-beach.pathogen" caption="Four overlapping rows, back to front — width, squash, position, and warmth all named ranges, with nearer rows drawing from bigger ones." code-open></mini-workspace>

Here's the workflow this function buys you. Suppose the beach feels too
busy: narrow the width range on the front row (`18, 42` → `24, 38`) and
recompile. **Every pebble in the rows behind stays exactly where it
was.** With `randomRange`, that one edit would have re-rolled the entire
beach — you'd be judging a different design, not your adjustment.
Deterministic ranges turn tuning into a controlled experiment.

## Where to go next

- [`hash01`](/blog/primer-hash01) — the mechanics underneath (seeds,
  determinism, truncation).
- [`hash11`](/blog/primer-hash11) — when the natural range is a symmetric
  ±drift around a center.
- [`noise`](/blog/primer-noise) — when neighboring picks should flow into
  each other instead of being independent.
- Reference: [Hash & Noise docs](/docs#stdlib-hash-noise).

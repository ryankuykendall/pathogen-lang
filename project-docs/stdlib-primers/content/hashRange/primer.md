---
fn: hashRange
title: "hashRange — randomRange with a memory"
hook: "randomRange with a memory."
order: 3
docsAnchor: stdlib-hash-noise
---

## What it does

`hashRange(n, min, max, seed?)` picks a value between `min` and `max` —
deterministically, keyed by the whole-number index `n`. It's
[`hash01`](./hash01.html) scaled into your range:
`min + hash01(n, seed) * (max - min)`, exactly.

The pitch is the name of this page: **`randomRange` that keeps its word.**
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
from [`hash01`](./hash01.html) — this primer won't repeat it.

## Example 1 — The drop-in swap

Both rows size 40 dots from the same 1.5-to-5 range. The top row asks
`randomRange`; the bottom asks `hashRange` with the loop index in front.

{{example:01-drop-in-swap}}

On this static page they look equivalent — that's the point; you give up
nothing visually. The difference is behavioral: **rebuild this page and
the top row reshuffles while the bottom row doesn't move.** (This is the
one `randomRange` appearance in this primer; the contrast is the lesson.)

## Example 2 — Skyline

One range per design property. Building height comes from
`hashRange(i, 35, 125)`, width from `hashRange(i, 10, 22, 1)`, and a
subtle facade shade from a third stream.

{{example:02-skyline}}

Read the two range calls as the spec they are: "heights 35–125, widths
10–22." Now imagine editing just the height line to `(i, 50, 90)` — the
towers even out and the same code draws a suburb. That's the tuning-panel
idea: structure stays, character is in the numbers.

## Example 3 — Confetti, spec'd

Four properties, four ranges, four seeds — a complete scatter system in
four lines: position (x, y), size, and hue.

{{example:03-confetti}}

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

{{example:04-rain}}

This is the half-open range earning its keep: `[0, 3)` floors to exactly
{0, 1, 2} with equal shares. The same loop runs in all three layers and
each keeps only its own bucket — a common Pathogen pattern for "one
population, several styles."

## Example 5 — Pebble beach

The finale is a tuning exercise. Four overlapping rows of pebbles, back to
front; each pebble's width, squash, position, and warmth come from named
ranges, and nearer rows draw from bigger width ranges.

{{example:05-pebble-beach}}

Here's the workflow this function buys you. Suppose the beach feels too
busy: narrow the width range on the front row (`18, 42` → `24, 38`) and
recompile. **Every other pebble stays exactly where it was.** With
`randomRange`, that one edit would have re-rolled the entire beach — you'd
be judging a different design, not your adjustment. Deterministic ranges
turn tuning into a controlled experiment.

## Where to go next

- [`hash01`](./hash01.html) — the mechanics underneath (seeds, determinism,
  truncation).
- [`hash11`](./hash11.html) — when the natural range is a symmetric ±drift
  around a center.
- [`noise`](./noise.html) — when neighboring picks should flow into each
  other instead of being independent.
- Reference: [Hash & Noise docs](https://pathogen.studio/docs#stdlib-hash-noise).

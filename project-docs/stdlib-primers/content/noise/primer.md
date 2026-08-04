---
fn: noise
title: "noise — Randomness with a smooth ride"
hook: "Randomness with a smooth ride."
order: 6
docsAnchor: stdlib-hash-noise
---

## What it does

[`hash01`](./hash01.html) rolls dice. `noise(x, seed?)` draws the smooth
curve *through* the dice rolls.

The mental model is **pins and a glide**. At every whole number there's a
pin at a random height — in fact, exactly the `hash01` of that number:
`noise(3)` *equals* `hash01(3)`, precisely. Between pins, the curve glides
using the same S-shaped ease as [`smoothstep`](./smoothstep.html),
flattening as it touches each pin. So the result is never jumpy and never
cornered: continuous randomness you can drive along without the wheels
leaving the road. Answers stay in [0, 1), seeds pick independent pin
sequences, and negative `x` works fine.

The one knob that matters is **input scale = frequency**: `noise(t * 8)`
passes 8 pins while `t` goes 0→1, so it wobbles 8 times as fast as
`noise(t)`. You don't configure the character of the wobble — you just
drive faster or slower past the pins.

One difference from its integer cousin: as the `hash01` primer noted, the
hash shrugs at weird input (anything non-finite is treated as label 0) —
but `noise` assumes you're driving along a real road. Feed it Infinity or
NaN and you get NaN back.

## Why you'd use it

Whenever *neighbors should agree*. Hashed randomness gives each index its
own unrelated answer — perfect for scatter, wrong for anything that should
feel like one continuous thing. Surfaces, edges, paths, lighting, and
motion all read as organic only when nearby samples rise and fall
together. `noise` is that agreement, with the amount of change per unit
distance under your control.

## Example 1 — The curve through the dice

The exact relationship, plotted. Dots mark `hash01(k)` at the whole
numbers 0 through 8; the curve is `noise(x)` sampled 160 times across the
same span.

{{example:01-curve-through-dice}}

The curve doesn't approximate the dots — it passes *exactly* through
every one, because at whole numbers `noise` **is** `hash01`. And watch how
it arrives: flat at every pin, courtesy of the smoothstep glide. Those two
facts are the entire function.

## Example 2 — The frequency knob

Three wandering lines, one seed, three input scales: `t*3`, `t*6`,
`t*12`.

{{example:02-frequency-knob}}

Slow swells, undulation, chatter — the whole personality range is
multiplication on the input. No settings, no modes. When something
noise-driven feels too busy or too sleepy, tune the factor, nothing else.
(One perceptual note: the slow line also *looks* smaller in amplitude —
crossing only three pins, it rarely reaches the range extremes. That's
frequency at work, not a different amplitude setting.)

## Example 3 — Smooth color

The same randomness source, sampled two ways. Both rows color 60 bars by
lightness; the top asks `hash01(i)`, the bottom asks `noise(i * 0.15)`.

{{example:03-smooth-color}}

Top: neighbors are strangers — it reads as static. Bottom: each bar sits
0.15 of the way to the next pin from its neighbor, so consecutive bars
*agree* — and the row reads as light moving across one surface. Same
determinism, same range; the only change is sampling with a glide.

## Example 4 — A stroke with texture

Every ingredient so far on one ribbon (machinery glossed in the
[`hash11` primer](./hash11.html)). The width is
`(2 + noise(t*6) * 13)` — organic undulation — times the
[`smoothstep`](./smoothstep.html) end-window `smoothstep(0, 0.08, t) *
smoothstep(1, 0.92, t)`, which eases both tips to a point.

{{example:04-textured-stroke}}

Walk the width line from the inside out: `noise(t*6)` is the texture
(frequency 6 — moderate undulation), `2 +` keeps a minimum body, `* 13`
sets the amplitude, and the end-window multiplies the whole thing so the
ribbon enters and exits cleanly. Compare the shimmer of
[`hash11`](./hash11.html)'s jittered ribbon: there, adjacent stops
disagree on purpose; here they cooperate — that's the whole difference
between *jitter* and *texture*.

## Example 5 — Parallax ridges

A finished scene from seeds and frequencies. Four filled ridgelines, back
to front — each its own seeded stream, with nearer ridges darker, with
bigger swings and finer detail. The front ridge stacks **two** streams: a
slow, tall one for shape plus a fast, quiet one for detail.

{{example:05-parallax-ridges}}

That stacking line — `noise(t*3, 4) * 55 + noise(t*9, 5) * 12` — is a
technique worth naming: big slow waves carry the form, small fast waves
carry the texture, and adding them gives you both at once. Graphics people
call the layers *octaves* and build entire terrains this way — now you can
too, and the whole scene stays as reproducible as everything else in this
series: same seeds, same mountains, every compile. To turn these
ridgelines into fog, water, or anything else that varies in *two*
directions, you need the second dimension — that's
[`noise2`](./noise2.html).

## Where to go next

- [`noise2`](./noise2.html) — the same idea spread across a surface.
- [`hash01`](./hash01.html) — the pins themselves.
- [`smoothstep`](./smoothstep.html) — the glide between them.
- Reference: [Hash & Noise docs](https://pathogen.studio/docs#stdlib-hash-noise).

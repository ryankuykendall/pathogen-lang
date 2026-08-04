---
fn: smoothstep
title: "smoothstep — The S-curve that turns a cliff into a ramp"
hook: "The S-curve that turns a cliff into a ramp."
order: 4
docsAnchor: stdlib-interpolation-clamping
---

## What it does

`smoothstep(edge0, edge1, x)` is a **dimmer between two markers**. As `x`
travels from `edge0` to `edge1`, the answer glides from 0 up to 1. Outside
the window it just holds: 0 before, 1 after — it *saturates*, never
overshooting in either direction.

What makes it special is the shape of the glide. It's an S-curve whose
slope is **zero at both ends** — it leaves the floor flat and arrives at
the ceiling flat. (The math name is a Hermite curve; all you need is the
flat-at-both-ends part.) That flatness is why things driven by
`smoothstep` never kink: whatever you attach to it — a size, a color, a
width — eases out of "off" and eases into "on."

Two idioms are worth learning as vocabulary:

- **Reversed markers run the ramp downhill.** `smoothstep(1.0, 0.6, t)`
  fades from 1 down to 0 as `t` climbs through 0.6→1.0. (Shader languages
  leave this case undefined; Pathogen defines and tests it.)
- **The plateau: uphill × downhill = a flat-topped window.**
  `smoothstep(0.1, 0.3, t) * smoothstep(0.9, 0.7, t)` rises, holds at 1,
  and falls — the standard way to build "on in the middle, off at the
  ends."

One gentle warning: keep the markers apart. `smoothstep(e, e, x)` collapses
to a hard step (and exactly *at* the shared edge, the math divides zero by
zero and answers NaN).

## Why you'd use it

Every time a hard boundary looks mechanical: fading elements in near an
edge, easing a stroke width to zero at its tips, blending two colors
across a horizon, weighting anything by "how far into this zone are we?"
It replaces both the `if (x > threshold)` cliff *and* the straight-line
ramp with something that reads as designed. And like everything in this
series, it's a pure function of its inputs — the fades you tune today
render identically on every future compile. It's also the workhorse under
two of its siblings: [`bump`](./bump.html) is a hill built from the same
easing idea, and [`noise`](./noise.html) uses this exact glide between its
random pins.

## Example 1 — Cliff, ramp, S-curve

Three ways from 0 to 1 across the same window. The dashed line is a hard
step. The thin line is a straight ramp. The bold line is `smoothstep`.

{{example:01-cliff-ramp-scurve}}

Look at where the bold curve meets the floor and ceiling: it lands flat
both times. The straight ramp has corners at both markers — attach a
width or a motion to it and you'll *see* those corners. The S-curve is
corner-free by construction.

## Example 2 — Fade a row in — and out

The dimmer applied spatially. Top row: dot sizes fade in over the left
half. Bottom row: the markers are **reversed** — `smoothstep(1.0, 0.6, t)`
— so the fade runs the other way.

{{example:02-fade-in-out}}

Reversed markers are the idiomatic way to say "fade out": no `1 - s`
arithmetic, just swap the edges and the ramp runs downhill.

## Example 3 — The plateau

The flagship idiom. One lambda —
`smoothstep(0.1, 0.3, t) × smoothstep(0.9, 0.7, t)` — drives both the
plot (top) and the bar heights (bottom).

{{example:03-plateau}}

Read the two factors: the first is 0 until t=0.1, then rises to 1 by
t=0.3 and *stays* 1. The second stays 1 until t=0.7, then falls to 0 by
t=0.9. Multiplied, you get rise–hold–fall with a genuinely flat top
(touching the dashed 1.0 line). Any "active in the middle" behavior —
visibility, width, intensity — is this one expression with your own four
numbers.

## Example 4 — No more blunt ends

A stroke-width application. The top ribbon has constant width, so it ends
in chopped-off vertical edges. The bottom multiplies the same width by an
end-window: `smoothstep(0, 0.12, t) * smoothstep(1, 0.88, t)`. (The
ribbon machinery — `compoundVariableOffset`, `vo.stop`, the `<<` worker —
is glossed in the [`hash11` primer](./hash11.html); the only part that
matters here is that each stop's width is a number we compute.)

{{example:04-blunt-ends}}

Same plateau idiom, tighter windows: the width is full-strength for the
middle 76% of the stroke and eases to zero over the first and last 12%.
Both tips taper to a point — and because smoothstep arrives flat, the
taper has no corner where it meets the full width.

## Example 5 — Horizon

A dusk seascape with no gradients. Sixty horizontal strips each compute
one mix factor — `m = smoothstep(0.38, 0.58, t)` where `t` is vertical
position — and use it to blend lightness, hue, and chroma from "sky
values" to "sea values." The sun's halo rings shrink by a reversed
smoothstep of ring index.

{{example:05-horizon}}

The blend pattern is worth keeping:
`value = skyValue + (seaValue - skyValue) * m` — with `m` eased, every
channel crosses the horizon softly and *in sync*, because they all share
one `m`. Every soft edge in this scene is the same three-argument call
wearing different numbers.

## Where to go next

- [`bump`](./bump.html) — when you want a hill that touches 1 and leaves,
  rather than a ramp that holds. (The plateau reappears there as its
  flat-topped cousin.)
- [`noise`](./noise.html) — smoothstep is the glue between its random
  pins.
- Reference:
  [Interpolation & Clamping docs](https://pathogen.studio/docs#stdlib-interpolation-clamping)
  and the callable [Easing family](https://pathogen.studio/docs#stdlib-easing)
  (`smoothstep(0, 1, t)` is `Easing.Smoothstep`).

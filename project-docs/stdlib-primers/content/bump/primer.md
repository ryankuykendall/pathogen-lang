---
fn: bump
title: "bump — A hill you can put anywhere"
hook: "A hill you can put anywhere."
order: 5
docsAnchor: stdlib-interpolation-clamping
---

## What it does

`bump(t, center, spread)` is one smooth hill: **exactly 1** at the center
you pick, easing down to **exactly 0** at a distance of `spread` on either
side — and flat everywhere it matters. Flat at the peak, and flat where
the feet touch the floor.

The shape is a *raised cosine* — which just means: take one arch of a
cosine wave and lift it so its feet rest on the ground. It's the smoothest
hill you can cut from a single wave. Think of it as a tent with rounded
everything: rounded peak, rounded feet, no poles poking out.

The load-bearing property is what happens **outside** the feet: beyond
`center ± spread`, `bump` is not "small" — it is *exactly zero, arriving
flat*. That's what makes bumps composable. Put two hills on the same shelf
and they don't interfere; overlap them and they **sum** into a bigger
landform with no seams or kinks anywhere.

Two honest footnotes:

- **`spread` must be positive.** A zero spread is a nothing-hill (and
  exactly at its center the math falls apart into NaN); a *negative*
  spread quietly answers 1 everywhere. If a picture unexpectedly goes
  all-on, check your spread.
- **Determinism:** same everywhere for practical purposes, but `bump` is
  built on cosine, so it's pinned per browser engine rather than
  bit-for-bit across all engines the way the
  [hash family](./hash01.html) is.

## Why you'd use it

Anywhere you want "strong here, fading to nothing there" without an
if-statement: a spotlight of emphasis in a row of elements, a swell in a
stroke's width, a peak in a skyline, a pocket of influence in a layout.
And because bumps sum cleanly, they're a *vocabulary*: tall-narrow,
low-wide, and combinations of them describe surprisingly rich profiles in
one readable expression — profiles that, like everything in this series,
land identically on every recompile. If [`smoothstep`](./smoothstep.html) is the ramp
("off → on"), `bump` is the visit ("off → on → off").

## Example 1 — Center and spread

The two knobs, plotted. Three hills: two share a center (one with wider
feet), and one is simply moved.

{{example:01-center-spread}}

`center` places the peak; `spread` is the distance from peak to each foot.
Every hill touches 1 at its dashed line and rests at 0 outside its feet —
not near zero, *at* zero.

## Example 2 — Spotlight a row

The simplest application: attention. Top row — dot size follows one bump,
a spotlight at the middle. Bottom row — **two bumps added in one
expression**, two spotlights.

{{example:02-spotlight}}

No conditionals, no ranges to check: outside the feet, the bump
*contributes* exactly nothing (the dots keep their small base radius —
that's the `0.8 +` in the expression, not the bump). And the sum in the
bottom row is safe precisely because each bump is zero outside its own
window — the two spotlights can't contaminate each other.

## Example 3 — Build a mountain from hills

Sums scale up. This skyline's height is one expression:
`45·bump(t, 0.25, 0.28) + 95·bump(t, 0.52, 0.3) + 38·bump(t, 0.82, 0.16)`
— a shoulder, a main peak, a small right summit. A second, softer layer
uses two more bumps as mist.

{{example:03-mountain}}

`amplitude × bump(t, center, spread)` is a term you can say out loud:
"ninety-five tall, centered just past the middle, feet 0.3 wide." Three
sayable terms describe the whole ridge — and moving one peak is editing
one number, not redrawing a curve.

## Example 4 — The silhouette is the envelope

On a straight spine, a stroke's silhouette *is* its width profile — which
makes ribbons the perfect x-ray for width functions. (Ribbon machinery
glossed in the [`hash11` primer](./hash11.html).) Three ribbons: a plain
bump, the same bump **squared**, and an asymmetric sum.

{{example:04-envelope-triptych}}

Squaring a bump (`pow(bump(...), 2)`) is a one-token remix: values below
1 shrink when squared, so the peak stays put while the flanks pull in —
a sharper swell with even softer feet. The third ribbon shows the same
summing trick as the mountain, now shaping ink instead of terrain.

## Example 5 — The glow

The finale: twelve translucent layers on one curved spine. Every layer's
width is the same three-term bump expression scaled by its layer index
`k`, with a per-layer hue shift — bump algebra alone carries the whole
effect.

{{example:05-glow}}

This is the deterministic glow from
["The Reliable Line"](https://pathogen.studio/blog/the-reliable-line) with
the jitter deliberately removed, so you can see exactly what the envelope
contributes: the swells sit where the centers put them, on every layer, on
every compile. To add texture back, the sibling primers pick up exactly
here — [`hash11`](./hash11.html) adds per-stop shimmer, and
[`noise2`](./noise2.html) makes the whole glow flow as one surface.

## Where to go next

- [`smoothstep`](./smoothstep.html) — the ramp to this function's hill;
  use its plateau when you want to *hold* at 1 instead of touching and
  leaving.
- [`hash11`](./hash11.html) / [`noise2`](./noise2.html) — texture on top
  of bump-shaped envelopes.
- Reference:
  [Interpolation & Clamping docs](https://pathogen.studio/docs#stdlib-interpolation-clamping).

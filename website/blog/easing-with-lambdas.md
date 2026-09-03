---
title: "Ease Once, Apply Everywhere: Easing with Lambdas"
slug: easing-with-lambdas
date: 2026-09-07
description: "A practical walkthrough of Pathogen's easing curves through lambdas: build an eased t once, then feed it to ranges, amplitudes, and cycles and half-cycles, ending with a finished piece."
---

> **Prerequisites:** the samples lean on [lambdas](/blog/lambdas-come-to-pathogen)
> (the `{|t| ...}` closures), the [`smoothstep` primer](/blog/primer-smoothstep),
> and [layers](/docs#layers-defining-layers) without introducing them. The
> curves themselves are documented in the
> [stdlib's Easing section](/docs#stdlib-easing).

## The one idea

Every example below rests on one idea: **an easing curve is a function that
takes `t` and hands back a reshaped `t`.**

Picture `t` as a slider you drag at a steady speed from 0 to 1. Under the
slider sits a cam — a shaped wheel. The slider turns it at a constant rate,
and the cam's profile decides how fast the thing riding on it rises: slowly
and then in a rush, quickly and then settling, or past the top and back
down. The cam is the easing curve. Swap the cam and everything riding on it
changes character; the slider never notices.

One correction for anyone arriving from CSS: here the curves shape
**space, not time**. Nothing animates. `t` is a loop counter divided by its
last value, and the cam decides where the twelfth dot lands, how wide the
stroke is at its midpoint, which color a strip gets. The same handle
numbers you would give a transition end up describing a still picture.

In Pathogen a cam is a lambda:

```pathogen
let smooth = {|t| cubicBezier(0.42, 0, 0.58, 1, t)};
let bounce = {|t| ease(Easing.BounceOut, t)};
```

Two functions make the cams. `cubicBezier` takes the same four handle
numbers a CSS `cubic-bezier()` takes — paste them from a stylesheet or a
curve tool — and then `t`. `ease` takes a named curve from the `Easing`
family (`Easing.SineInOut`, `Easing.BackOut`, `Easing.ElasticOut`,
`Easing.BounceIn`, and twenty-two more) and then `t`. The older trio
`easeIn`/`easeOut`/`easeInOut` and `smoothstep(0, 1, t)` are cams too.
Whichever you pick, the lambda names it once; from then on your code just
says `smooth(t)`.

Four things worth knowing before the pictures:

- **Two families leave the box.** `back` and `elastic` return values below
  0 and above 1 — that is their whole point — and so does `cubicBezier` when
  a `y` handle sits outside 0..1. Nothing clamps them. If the number is about
  to become an opacity, a radius, or anything that cannot go negative, clamp
  it yourself: `clamp(back(t), 0, 1)`.
- **The `x` handles are checked.** `cubicBezier` refuses `x1` or `x2` outside
  0..1 with a compile error, because such a curve would double back on
  itself. Curve tools never produce one, but a typo can.
- **`t` is clamped for you** by `ease` and `cubicBezier`: anything below 0
  reads as 0 and anything above 1 as 1, with no extrapolation past the ends.
  A cam you write by hand, like the `{|t| t}` in Example 1, clamps nothing.
- **Lambdas take exactly the arguments they declare.** A cam is `{|t| ...}`
  and is called with one number. When you need the same shape with
  different numbers, a factory returns a lambda with those numbers baked in
  (Example 5); calling the cam with extra arguments is an error.

Every sample below is live: the code panel is read-only, but the
"Open in playground workspace" button in each one drops the sample into an
editor where the handle numbers can be changed and the picture recompiles.

## Example 1 — Five cams

The bare mechanism. Five lambdas, each plotted over `t` from 0 to 1. The
dashed box is the 0..1 range; the line is where each cam sends `t`.

<mini-workspace src="samples/post51/01-curve-gallery.pathogen" caption="Left to right: the slider itself (linear), the quadratic easeInOut, CSS ease-in-out via cubicBezier, then BackOut and ElasticOut, which leave the box." code-open></mini-workspace>

Read the first three as one family: the straight line is the slider, and
the two S-curves bend it so the ride starts slow and ends slow. The last
two are the ones to remember for later: `BackOut` overshoots the top and
comes back; `ElasticOut` overshoots and wobbles before it settles. Both are
one line of code and both really do go past 1.

The array of lambdas is doing quiet work here. `curves[col]` picks a cam,
`let shape = curves[col];` names it, and `shape(t)` calls it — the loop body
never knows which curve it is drawing.

## Example 2 — Ranges

An eased `t` is only useful once it moves something. The simplest something
is a range: `lerp(start, end, smooth(t))` slides a value from `start` to
`end` along the cam. And because `smooth(t)` is just a number between 0
and 1, everything else that takes a ratio accepts it too.

<mini-workspace src="samples/post51/02-ranges.pathogen" caption="Top: nine dots placed by bare t. Bottom: the same dots placed by smooth(t), and the same smooth(t) picks each dot's color and radius." code-open></mini-workspace>

One lambda drives three channels — position through `lerp`, color through
`blue.mix(pink, ...)`, radius through another `lerp` — and they move in
sync because they share one number. Change the four handle numbers in
`smooth` and all three follow. That is the practical payoff of naming the
cam: the tuning lives in one place.

It is also where the first gotcha bites. The radius channel is
`lerp(2, 5, smooth(t))`, which only stays between 2 and 5 while `smooth`
stays inside the box. Swap in `back` or `elastic` and the smallest dots go
negative — so a radius, an opacity, or a stroke width driven by an
overshooting cam wants `clamp(..., 0, 1)` around the eased value.

## Example 3 — Amplitudes

Position is the obvious thing to ease. Amplitude is the next one: how big
a wave is. Each row below is `mid - amplitude(t) * sin(TAU() * cycles * t)`
with three full cycles, and only `amplitude` changes.

<mini-workspace src="samples/post51/03-amplitude.pathogen" caption="Same three cycles, three amplitude lambdas: a constant, a sine-in that grows the wave from nothing, and a smoothstep window that fades it in and back out." code-open></mini-workspace>

The middle row is `18 * ease(Easing.SineIn, t)`: the wave starts silent and
swells. The bottom row multiplies two `smoothstep`s — the plateau idiom
from the [primer](/blog/primer-smoothstep) — so the wave is silent at both
ends and full in the middle. Whatever you multiply into an eased `t`
becomes that thing's envelope: a second shape that scales the first one
from end to end.

## Example 4 — Cycles and half-cycles

A wave needs a count as well as a size. `sin(TAU() * cycles * t)` runs
`cycles` whole waves across the range. Counting in half-cycles instead,
`sin(PI() * halfCycles * t)`, counts lobes: one bulge, two, three, four.

<mini-workspace src="samples/post51/04-half-cycles.pathogen" caption="Each row is a straight rise, lerp(bottom, top, t), with a sine offset of 1, 2, 3 and 4 half-cycles riding on it." code-open></mini-workspace>

Two things the rows show. Every whole number of half-cycles lands the wave
back on its guide line at `t = 1`, so the shape always arrives cleanly. And
odd counts give an odd number of lobes — up, down, up — which whole cycles
can never do. That is why half-cycles is the natural unit when you are
drawing a shape rather than timing a loop.

The rows are also the standard recipe for "go from here to there, wobbling
on the way": a `lerp` for the journey, plus an offset for the wobble. Ease
the `lerp`'s `t` and the journey itself gets a cam; ease the amplitude and
the wobble gets an envelope. They stay independent.

## Example 5 — Factories

When the same shape is needed with different numbers, write a `fn` that
returns the lambda. The returned lambda keeps the numbers it was built
with, so `makeWave(12, 5)` is a wave you call with just `t`, and
`makeEase(0.34, 1.56, 0.64, 1)` is a cam with its handles baked in.

<mini-workspace src="samples/post51/05-lambda-factories.pathogen" caption="Three waves from one factory, one overshooting dot row from the other: the dashed tick is the 1.0 mark the dots pass and come back to." code-open></mini-workspace>

Those four handle numbers are the standard cubic-bézier fit of back-out —
the same shape Example 1 drew with `ease(Easing.BackOut, t)`, reached by
the other route. The two are close, not identical: one is a formula, the
other a curve fitted to it, and either works as a cam.

Return a lambda, not a named `fn`. A named `fn` looks up free names where
it is *called*; a lambda captures them where it is *made*, which is what
lets `amplitude` and `halfCycles` travel inside the returned value. The
[lambdas post](/blog/lambdas-come-to-pathogen) covers that difference in
detail.

## Example 6 — A plume

Everything at once. Twelve strands fan out from one point. The fan's
spread is `ease(Easing.BackInOut, strandT)`, which bunches the strands
toward the middle and sends the ones just inside the edges past their
outer neighbors, so the tips cross before they settle. Each strand's wave
amplitude rides a `smoothstep` window so it is silent at both ends; its
lobe count is a small number of half-cycles; and its color is mixed by the
same strand `t` that placed it.

<mini-workspace src="samples/post51/06-plume.pathogen" caption="Twelve strands: spread by BackInOut, waves windowed by smoothstep, lobes counted in half-cycles, colors mixed by the strand's own t." code-open></mini-workspace>

There is no new mechanism in this picture. It is Example 2's range, Example
3's envelope and Example 4's half-cycles, each fed by a named cam. That is
the habit the post is arguing for: name the curve once, then let it drive
whichever numbers the picture needs.

## Where to go next

- Open any sample above in the playground and swap one cam for another:
  `Easing.BounceOut` into the plume's spread, an elastic curve into the
  ranges row. The whole point is that nothing else has to change.
- The [Easing reference](/docs#stdlib-easing) has the full family table and
  a paste-ready list of `cubicBezier` handle values for the classic curves.
- The same names drive [`TopoGradient.easing`](/docs#gradients-topogradient),
  where the eased elevation is clamped onto the color ramp.
- [`bump`](/blog/primer-bump) is a hill built from the same easing idea,
  handy when an envelope should peak somewhere specific.
- [Lambdas come to Pathogen](/blog/lambdas-come-to-pathogen) for the
  closure rules that make the factories in Example 5 work.

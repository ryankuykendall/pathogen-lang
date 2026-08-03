---
title: "The Reliable Line: Hash, Noise, and Envelopes Join the Stdlib"
slug: the-reliable-line
date: 2026-08-03
description: "'The Shape of a Stroke' ended with a glow built on a hand-rolled hash and a hand-rolled envelope. Both are now built in — and the built-in hash is a better one: bit-identical on every JavaScript engine, not just deterministic on yours. This post rebuilds the glow on hash11() and bump(), then goes somewhere the hash can't: continuous texture with noise() and a coherent 2D field with noise2()."
---

*Part 3 of 3 in our series on variable-width strokes.*

> **Series: Variable-Width Strokes**
> 1. [The Swelling Line](/blog/the-swelling-line) — variableOffset and compoundVariableOffset
> 2. [The Shape of a Stroke](/blog/lambdas-come-to-pathogen) — envelopes, bulges, and lambdas
> 3. **The Reliable Line** (this post) — hash, noise, and envelopes join the stdlib

[The Shape of a Stroke](/blog/lambdas-come-to-pathogen) closed on a promise: a glow whose fuzz was *designed* — a hash of the stop index instead of `randomRange` — so that recompiling the program reproduced it exactly. To get there it had to define two helper functions by hand: `bulge`, a raised-cosine envelope kernel, and `hash01`, the shader-folklore one-liner that turns an integer into a repeatable "random" number.

Those helpers did their job so well that they've stopped being helpers. As of this release, the whole toolkit is in the [standard library](/docs#stdlib-hash-noise): `hash01`, its signed sibling `hash11`, `hashRange`, the envelope kernel `bump`, `smoothstep`, a callable easing trio — and two functions the hand-rolled versions couldn't reach: `noise()` and `noise2()`, which trade per-index jitter for *continuous* texture.

This post does three things: explains why the built-in hash is deliberately **not** the one from part 2, rebuilds the glow shorter than ever, and then pushes past jitter into noise fields.

## Why not the folklore hash?

Part 2's hash is a classic for a reason — one line, no dependencies, instantly random-looking:

```
fn hash01(i) {
  let s = sin(i * 12.9898) * 43758.5453;
  return s - floor(s);
}
```

But it has a quiet flaw for a language that promises *byte-identical recompiles*: it leans on `sin`, and the ECMAScript standard does not pin `Math.sin` to the bit. Engines are free to differ in the last decimal place — and multiplying by 43758.5453 amplifies that last bit into a visibly different fraction. Your glow is reproducible *on your machine*. Compile the same program in a different browser engine, and "byte-identical" quietly becomes "almost identical". It also degrades at large inputs, where float precision starts eating the fractional bits the hash lives on.

The built-in [`hash01`](/docs#stdlib-hash-noise) takes a different route: integer bit-mixing (a lowbias32 finalizer), built exclusively from operations the standard specifies exactly — `Math.imul`, bit operations, IEEE arithmetic. No trigonometry anywhere. The result is a hash that returns the identical value for identical arguments on **every** machine and JavaScript engine: CLI, playground, and VS Code preview agree, today and on every future recompile.

<mini-workspace src="samples/post32/01-two-hashes.pathogen" caption="72 indices through both hashes. Visually interchangeable — the difference is contractual, not aesthetic. The bottom row is bit-specified on every engine; the top row inherits Math.sin's engine-dependence." code-open></mini-workspace>

Two contracts worth knowing before you use it:

- **It hashes integers.** `hash01(0.9)` equals `hash01(0)` — inputs truncate to 32-bit integers. For a smooth function of a continuous input, that's what `noise()` is for (below).
- **The seed is an argument.** "The Shape of a Stroke" smuggled a per-layer stream through prime arithmetic — `hash01(i * 7 + haloIndex * 1013)`. The built-in makes the stream a parameter: `hash01(i, haloIndex)`. Two seeds are two genuinely independent sequences, not shifted copies.

(One naming note: the sample above calls its folklore hash `sinFract`, not `hash01`, for a load-bearing reason — a user-defined `fn hash01` would *shadow* the built-in, which is exactly the mechanism that keeps part 2's published samples byte-stable. More on that below.)

And `randomRange` users get a drop-in — same call shape, an index in front:

```
let r = randomRange(4, 12);    // different every compile
let r = hashRange(i, 4, 12);   // pinned to index i, forever
```

## The glow, third build, shortest yet

Here is part 2's finale rebuilt on the stdlib. Both helper `fn`s are gone. `bump(t, center, spread)` **is** the raised cosine — term-for-term, the same formula `bulge` computed — and the jitter collapses to a single call: `hash11(i, haloIndex)` returns signed values in `[-1, 1)`, so "±20% wobble, per-layer stream" is just `1 + hash11(i, haloIndex) * 0.2`.

<mini-workspace src="samples/post32/02-halo-builtins.pathogen" caption="Sixteen compound-offset layers, zero helper fns. bump() replaces bulge, hash11(i, haloIndex) replaces the hash-plus-remap, and the per-layer salt became the seed argument. The lambdas still capture haloIndex — that part 'The Shape of a Stroke' got right the first time. The builder mk is a named lambda, so it's applied with << (see the worker rules in the docs); samples 3 and 4 below pass their builders as literal blocks instead." code-open></mini-workspace>

The character of the glow is unchanged; the individual sparkle differs, because integer mixing lands on different values than sin-fract. That's the trade made consciously: the published samples in "The Shape of a Stroke" keep their exact pixels — user-defined `fn hash01` shadows the built-in, so old programs are untouched — while new programs get the portable hash.

One honest caveat: in this glow, the *jitter* is the bit-pinned part. The envelope isn't — `bump` uses cosine and the layer widths flow through `pow`, both implementation-approximated, so the shape is reproducible on any one engine rather than byte-identical across all of them. The randomness is the part that used to drift, and that's the part that's now pinned.

## The envelope vocabulary, built in

"The Shape of a Stroke" spent a whole section defining envelope shapes by hand — tent, smoothstep, raised cosine — to argue that the raised cosine enters and leaves its bulge with zero slope. That vocabulary is now one call each, and it composes:

<mini-workspace src="samples/post32/03-envelope-builtins.pathogen" caption="Three envelope idioms, each one stdlib call: bump() is the raised-cosine hill; two opposing smoothsteps multiply into a flat-topped plateau; easeInOut() is the Easing enum, now callable. Below: the bump-shaped stroke on a straight spine — the silhouette is the envelope." code-open></mini-workspace>

The plateau idiom deserves a highlight: `smoothstep(0.1, 0.3, t) * smoothstep(0.9, 0.7, t)` — a rising ease times a falling ease (note the reversed edges) — is the standard way to build a smooth window with a flat top, and it's now a one-liner.

The easing trio (`easeIn`, `easeOut`, `easeInOut`) are the callable forms of the [`Easing` enum](/docs#syntax-built-in-enums) you already use for gradient easing, with the same quadratic formulas — the curve `easeInOut(t)` traces is the curve the gradient renderer applies for `Easing.EaseInOut`. The full mapping is in the [stdlib docs](/docs#stdlib-easing).

## From jitter to texture: noise()

Everything so far assigns each stop its own unrelated value. That's what *jitter* is — and it's also its limit: adjacent stops can't cooperate, so the edge can shimmer but never *undulate*.

`noise(x, seed?)` is the continuous upgrade. It equals `hash01` exactly at every integer, and blends smoothly in between (value noise with a smoothstep fade — zero slope at every lattice point). One knob controls the whole character of the result: scale the input, and you scale the frequency.

<mini-workspace src="samples/post32/04-noise-stroke.pathogen" caption="The same noise stream at three input scales. noise(t * 2) is one slow swell; noise(t * 11) chatters. Frequency is just multiplication — no new API." code-open></mini-workspace>

Because `noise` is built on `hash01`, it inherits the portability contract: identical arguments, identical results, every engine. Your organic wobble is exactly as reproducible as your straight lines.

## A field of texture: noise2()

One dimension of noise textures a stroke. Two dimensions texture a *family* of strokes.

In the rebuilt glow above, each layer jitters independently — layer 7 has no idea what layer 8 is doing. `noise2(x, y, seed?)` makes the texture a **field**: run `t` along the stroke and the layer index across it, and because the field is continuous in both directions, neighboring layers sample neighboring rows — and swell together.

<mini-workspace src="samples/post32/05-noise2-glow.pathogen" caption="The finale: one noise2 field textures all sixteen layers. t runs along the spine, haloIndex * 0.3 runs across the glow, and the layers breathe together instead of shimmering independently. In the hash-jittered glow above, sixteen edges move independently; here they move as one surface." code-open></mini-workspace>

This is the payoff of the whole series in one image. [The Swelling Line](/blog/the-swelling-line) gave the line a width. [The Shape of a Stroke](/blog/lambdas-come-to-pathogen) made the width a designed object. This post makes the design *portable* — reliable across engines, surfaces, and time — and gives it weather.

## The determinism contract

What's guaranteed, precisely — the dividing line is whether the standard specifies the operations *exactly* or leaves them *implementation-approximated*:

- **Bit-exact everywhere**: `hash01`, `hash11`, `hashRange`, `noise`, `noise2` — and every function built only from exactly-specified operations: `smoothstep`, `lerp`, `clamp`, `map`, the easing trio, `abs`, `floor`, `min`, `max`, `sqrt`. Same arguments, same bits — across machines, engines, surfaces, and time.
- **Deterministic per engine**: anything built on an implementation-approximated `Math` operation — `bump` (cosine), `sin`/`cos`/`tan`, `pow`, `exp`, `log`. Reproducible on the engine you're on; not contractually pinned across engines.
- **Not deterministic at all**: `random()` and `randomRange()` — still there when you genuinely want fresh entropy every compile.

The full reference lives in the [Hash & Noise](/docs#stdlib-hash-noise), [Interpolation & Clamping](/docs#stdlib-interpolation-clamping), and [Easing](/docs#stdlib-easing) sections of the stdlib docs.

If you have a generative sketch driven by `randomRange`, the one-line substitution — `hashRange(i, min, max)` with your loop index — makes it reproducible; everything else stays the same. And if your program defines its own `fn hash01`, nothing changes at all: your function shadows the built-in, by design.

The hand-rolled versions of these functions served three blog posts faithfully. They've earned the promotion.

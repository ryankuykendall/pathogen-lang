---
title: "hash01: A Random Number That Never Changes Its Mind"
slug: primer-hash01
date: 2026-08-04
description: "First in a seven-part tour of Pathogen's deterministic stdlib: hash01 gives every whole-number label a random-looking value that is really a lookup — same label, same answer, on every machine, forever. Scatter, jitter, and texture you can ship."
---

*Part 1 of 7 in our series of stdlib primers — the deterministic hash, noise, and shaping functions.*

> **Series: Stdlib Primers**
> 1. **hash01** (this post) — a random number that never changes its mind
> 2. [hash11](/blog/primer-hash11) — the same dice, rolled between −1 and 1
> 3. [hashRange](/blog/primer-hashrange) — randomRange with a memory
> 4. [smoothstep](/blog/primer-smoothstep) — the S-curve that turns a cliff into a ramp
> 5. [bump](/blog/primer-bump) — a hill you can put anywhere
> 6. [noise](/blog/primer-noise) — randomness with a smooth ride
> 7. [noise2](/blog/primer-noise2) — a weather map of smooth randomness

## What it does

`hash01(n)` takes a whole number — an index, a loop counter, any integer
label — and hands back a number between 0 (inclusive) and 1 (exclusive)
that *looks* random. It isn't random at all: it's a **lookup**. The same
label always produces the same answer, on every machine, in every browser,
on every recompile, forever.

Under the hood it's a **hash** — which is just a scrambler: a fixed recipe
of bit-mixing that turns the label `7` into `0.9646…` so thoroughly that
neighboring labels produce completely unrelated outputs. `hash01(7)` and
`hash01(8)` have nothing to do with each other. And because every step of
the recipe is pinned down exactly by the JavaScript standard — no
trigonometry, no rounding wiggle room — there is no drift between engines.
Your artwork compiles to the same bytes in the CLI, the playground, and the
VS Code preview.

The second argument is a **seed**: `hash01(i, 3)` reads the same card
number `i` from a *different shuffled deck*. `hash01(i, 0)` and
`hash01(i, 1)` are two unrelated sequences over the same indices — which is
how one loop index can drive many independent random-looking properties at
once. (Leaving the seed off means deck 0.)

## Why you'd use it

Because `random()` and `randomRange()` re-roll on every compile. That's
fine for exploring, but the moment you *like* what you see, you want it to
stay. `hash01` is the version with a memory: randomness as a **design
decision** rather than a dice throw. Scatter, jitter, texture, variation —
all reproducible, all tunable, all shippable.

Two things to know before the examples:

- **It reads only the label, not the fraction.** Inputs are truncated to
  whole numbers, so `hash01(0.9)` is the same as `hash01(0)` — and
  anything that isn't a real number at all (a divide-by-zero infinity, a
  NaN) is quietly treated as label 0. If you want a *smooth* function of a
  continuously varying input, that's what [`noise()`](/blog/primer-noise)
  is for.
- **The range is 0 up to (but never exactly) 1** — written [0, 1). In
  practice you'll multiply it into whatever range you need, and the
  missing endpoint never matters visually.

## Example 1 — Ask twice, same answer

The whole function in one picture. The first two rows ask `hash01(i)` the
same 48 questions from two *separate* loops. The third row asks
`randomRange(0, 1)` instead.

<mini-workspace src="samples/post33/01-ask-twice.pathogen" caption="Three rows of 48 dots: two separate hash01 loops (blue), one randomRange loop (red)." code-open></mini-workspace>

The two blue rows are identical — not similar, identical — because
`hash01` is a lookup, not a roll. And here's the part worth trying
yourself: **drop this code in the playground and recompile — only the red
row changes.** The blue rows are fixtures; the red row is weather. (This
is the one example in this post that uses `randomRange` — the contrast is
the whole lesson.)

## Example 2 — One label, three decks: a starfield

One index `i`, three seeds. The x-position reads deck 0, the y-position
deck 1, the size deck 2 — three independent random-looking properties from
one loop counter.

<mini-workspace src="samples/post33/02-starfield.pathogen" caption="140 stars from one loop: x from seed 0, y from seed 1, radius from seed 2. Three independent streams, one index — and the same sky on every compile." code-open></mini-workspace>

If x and y came from the *same* deck, every star would sit on the diagonal
(x always equal to y, scaled). The seeds are what make the scatter
two-dimensional. This is the core `hash01` idiom: **one index in, as many
independent properties out as you have seeds.**

## Example 3 — A grid that isn't boring

Regular structure plus hashed variation. Every tile in this 14×8 grid
sits exactly on its grid cell, but its lightness comes from one stream and
its hue from another — a woven-textile effect from two lines of code.

<mini-workspace src="samples/post33/03-woven-grid.pathogen" caption="Structure from the grid, variation from two hashed streams: lightness on one deck, hue on another. row * 14 + col gives every cell its own integer label." code-open></mini-workspace>

Note how the index is built: `row * 14 + col` gives every cell its own
integer label. That little arithmetic pattern — flattening a 2D position
into one index — is how you hash grids, and it shows up again in
[`noise2`](/blog/primer-noise2), where the grid itself becomes the random
thing.

## Example 4 — The hand-drawn ruler

Rigid layouts read as mechanical; a few hashed nudges make them read as
human. The bottom ruler jitters each tick's x-position, lean, and length
by small hashed amounts.

<mini-workspace src="samples/post33/04-hand-drawn-ruler.pathogen" caption="Same ruler twice: machine-perfect above, three small hashed nudges below. The lean line's * 2 - 1 remap — 'either direction' instead of 'one way' — is the next post's whole reason to exist." code-open></mini-workspace>

Look at the lean line: `hash01(i, 1) * 2 - 1`. That `* 2 - 1` remaps
[0, 1) into [-1, 1) — "nudge either direction" instead of "nudge one way."
It's such a common move that it has its own function:
[`hash11`](/blog/primer-hash11), the next post in this series.

## Example 5 — A meadow that ships

Everything at once: ninety grass blades and a dozen seed heads, with
position, height, lean, and color each drawn from its own seeded stream,
composed into a finished little landscape.

<mini-workspace src="samples/post33/05-meadow.pathogen" caption="Ninety grass blades and a dozen seed heads — position, height, lean, and color each on its own seeded stream." code-open></mini-workspace>

The payoff of determinism is right here: this meadow is *done*. It will
render exactly like this in a blog post, a client deliverable, or a print
export, next week and next year. And it's still one knob away from being a
different meadow — bump any seed constant (`hash01(i, 3)` → `hash01(i, 7)`)
and every blade re-lands in a new, equally settled arrangement. Randomness
you can direct.

## Where to go next

- [`hash11`](/blog/primer-hash11) — the same dice, rolled between −1 and 1
  (the `* 2 - 1` remap, built in).
- [`hashRange`](/blog/primer-hashrange) — `randomRange` with a memory.
- [`noise`](/blog/primer-noise) — the smooth version, for continuously
  varying input.
- Reference: [Hash & Noise docs](/docs#stdlib-hash-noise).

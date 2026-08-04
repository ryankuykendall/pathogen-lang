---
fn: hash01
title: "hash01 — A random number that never changes its mind"
hook: "A random number that never changes its mind."
order: 1
docsAnchor: stdlib-hash-noise
---

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
  continuously varying input, that's what [`noise()`](./noise.html) is
  for.
- **The range is 0 up to (but never exactly) 1** — written [0, 1). In
  practice you'll multiply it into whatever range you need, and the
  missing endpoint never matters visually.

## Example 1 — Ask twice, same answer

The whole function in one picture. The first two rows ask `hash01(i)` the
same 48 questions from two *separate* loops. The third row asks
`randomRange(0, 1)` instead.

{{example:01-ask-twice}}

The two blue rows are identical — not similar, identical — because
`hash01` is a lookup, not a roll. And here's the part a static page can't
fully show: **recompile this file and only the red row changes.** The blue
rows are fixtures; the red row is weather. (This is the one example in
this primer that uses `randomRange` — the contrast is the whole lesson.)

## Example 2 — One label, three decks: a starfield

One index `i`, three seeds. The x-position reads deck 0, the y-position
deck 1, the size deck 2 — three independent random-looking properties from
one loop counter.

{{example:02-starfield}}

If x and y came from the *same* deck, every star would sit on the diagonal
(x always equal to y, scaled). The seeds are what make the scatter
two-dimensional. This is the core `hash01` idiom: **one index in, as many
independent properties out as you have seeds.**

## Example 3 — A grid that isn't boring

Regular structure plus hashed variation. Every tile in this 14×8 grid
sits exactly on its grid cell, but its lightness comes from one stream and
its hue from another — a woven-textile effect from two lines of code.

{{example:03-woven-grid}}

Note how the index is built: `row * 14 + col` gives every cell its own
integer label. That little arithmetic pattern — flattening a 2D position
into one index — is how you hash grids, and it shows up again in the
[`noise2`](./noise2.html) primer, where the grid itself becomes the random
thing.

## Example 4 — The hand-drawn ruler

Rigid layouts read as mechanical; a few hashed nudges make them read as
human. The bottom ruler jitters each tick's x-position, lean, and length
by small hashed amounts.

{{example:04-hand-drawn-ruler}}

Look at the lean line: `hash01(i, 1) * 2 - 1`. That `* 2 - 1` remaps
[0, 1) into [-1, 1) — "nudge either direction" instead of "nudge one way."
It's such a common move that it has its own function:
[`hash11`](./hash11.html), the next primer in this series.

## Example 5 — A meadow that ships

Everything at once: ninety grass blades and a dozen seed heads, with
position, height, lean, and color each drawn from its own seeded stream,
composed into a finished little landscape.

{{example:05-meadow}}

The payoff of determinism is right here: this meadow is *done*. It will
render exactly like this in a blog post, a client deliverable, or a print
export, next week and next year. And it's still one knob away from being a
different meadow — bump any seed constant (`hash01(i, 3)` → `hash01(i, 7)`)
and every blade re-lands in a new, equally settled arrangement. Randomness
you can direct.

## Where to go next

- [`hash11`](./hash11.html) — the same dice, rolled between −1 and 1
  (the `* 2 - 1` remap, built in).
- [`hashRange`](./hashRange.html) — `randomRange` with a memory.
- [`noise`](./noise.html) — the smooth version, for continuously varying
  input.
- Reference: [Hash & Noise docs](https://pathogen.studio/docs#stdlib-hash-noise).

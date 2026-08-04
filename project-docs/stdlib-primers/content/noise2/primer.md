---
fn: noise2
title: "noise2 — A weather map of smooth randomness"
hook: "A weather map of smooth randomness."
order: 7
docsAnchor: stdlib-hash-noise
---

## What it does

[`noise`](./noise.html) wanders along a line. `noise2(x, y, seed?)`
spreads the same smooth randomness across a **surface** — fog, terrain,
water, or "many strokes that agree with their neighbors."

Extend the pins model to a **pegboard**: random heights pinned at every
whole-number grid corner. Anywhere inside a cell, the answer smoothly
mixes the four surrounding corner pins — nearer corners count more. That
one sentence is the whole mechanism. As with 1D noise, the mixing uses the
flat-arriving [`smoothstep`](./smoothstep.html) glide, so the field has no
seams, and answers stay in [0, 1).

The second coordinate wears three costumes in practice:

1. **A real y** — you're sampling an actual 2D field (fog, terrain).
2. **A layer index** — line or layer `j` samples row `j * someScale`, so
   siblings stay *coherent*: neighbors in the stack sample neighboring
   rows of one field.
3. **A phase/time** — slide `y` slowly to animate a 1D wobble. (Worth
   knowing about; not built in these examples.)

One honesty note: this is the simple corner-value kind of noise, not the
fancier "Perlin" kind that stores slopes at the pins. At large scales you
can spot faint row-and-column grain in it; at the scales in this primer,
you won't.

## Why you'd use it

Whenever smooth randomness needs to vary in *two* directions at once —
across a grid of cells, over the area of a texture, or **across a family
of related strokes**. That last one is the sleeper use: give each stroke
in a stack its own row of one shared field and the whole stack starts
behaving like a single surface. It's the difference between sixteen
strokes that shimmer independently and one glow that flows.

## Example 1 — Fog on a grid

The 2D field made visible, against its opposite. Both panels shade a
16×16 grid from the same palette; the left asks `hash01` of each cell's
index, the right asks `noise2` of each cell's position.

{{example:01-fog-grid}}

Static versus weather. In the right panel, every cell agrees with its
neighbors *up, down, left, and right* — that's the "nearer corners count
more" mixing at work. (Implementation note: the shades are bucketed into
eight layers instead of one layer per cell — a useful economy whenever a
grid gets large.)

## Example 2 — Swelling dot field

Sampling the field at each element's own position. A 30×18 dot grid where
each radius is `0.6 + 3 * noise2(col * 0.12, row * 0.12)`.

{{example:02-dot-field}}

The sizes swell in blobs, like rain intensity across pavement. The
`* 0.12` on both coordinates is the [frequency knob](./noise.html) in 2D:
smaller factors give bigger weather systems, larger factors give choppier
ones — tune it exactly as you did in the 1D primer.

## Example 3 — Rows of one field

The layer-index costume, and the visual argument for this function's
existence. Left: line `j` samples `noise2(t*4, j*0.3)` — twelve rows of
*one field*, so neighboring lines rise and fall together and the stack
reads as a flowing sheet. Right: the same twelve lines with independent
1D streams — they ignore each other.

{{example:03-rows-of-field}}

The only difference between the stacks is where the second number goes:
`noise2(t*4, j*0.3)` versus `noise(t*4, j)`. As a *coordinate*, `j` puts
the lines on the same continuous surface; as a *seed*, it isolates them.
Choosing between those two spellings is choosing between coherence and
independence.

## Example 4 — Warp a grid

Displacement: two fields make a push direction. Every vertex of a ruled
grid moves horizontally by field 0 and vertically by field 1 —
`(noise2(x, y) - 0.5) * 14` each way (the `- 0.5` recenters [0,1) into a
signed push, the same remap trick from [`hash11`](./hash11.html)).

{{example:04-warp-grid}}

The grid billows like a flag because both displacement fields are smooth:
neighboring vertices get nearly the same push, so the rules bend instead
of scattering. Warping positions through a pair of fields like this is
the doorway to flow fields, fabric, and water — all "move everything, but
smoothly, and differently everywhere."

## Example 5 — The flowing glow

The series finale, combining five primers. Twelve glow layers whose width
profile is [`bump`](./bump.html) algebra, each multiplied by a texture
factor `1 + (noise2(t*6, k*0.3) - 0.5) * 0.6` — with `t` running along
the stroke and layer index `k` running *across* the field.

{{example:05-flowing-glow}}

This series has now built the same glow three ways, and the differences
are the lesson. [`bump`](./bump.html)'s finale is clean architecture —
smooth swells, nothing else. [`hash11`](./hash11.html)'s ±wobble would
make it shimmer, every stop independent. This one makes it **flow**: look
along any edge and you'll see the undulation travel smoothly, and the
neighboring layers swell *together*, because everything samples one
continuous field. One argument's costume change (seed → row coordinate)
is the entire difference between shimmer and weather.

## Where to go next

- [`noise`](./noise.html) — the 1D story: pins, glide, frequency.
- [`bump`](./bump.html) — the width profiles under this finale's texture.
- [`hash01`](./hash01.html) — the 1D pins. (noise2's corners hash *both*
  coordinates as a pair, so there's no direct `hash01` equivalence in 2D —
  the exact-identity story is a 1D privilege.)
- Reference: [Hash & Noise docs](https://pathogen.studio/docs#stdlib-hash-noise).

# Primer: Oscillating circle size along a flow-field walk

*Internal primer — uses only existing Pathogen features (`calc`, `sin`/`cos`, `circle`).
Not published to `docs/`.*

## Your starting point

```
for (k in 1..itemLength) {
  let angle = field.sampleBilinear(start.y, start.x);
  next = start.polarTranslate(angle, 3.6);
  drawingLayer.apply {
    let diameter = calc(k * 1.05);
    if (k > calc(itemLength / 2)) {
      diameter = calc((itemLength - k) * 1.07);
    }
    circle(start.x, start.y, diameter);
  }
  start = next;
}
```

This is a **triangular envelope**: the size ramps linearly up to the midpoint, then ramps
linearly back down. You want the size to *oscillate* instead. `sin` is the right tool.

### Two things to know before you start

1. **`circle(cx, cy, r)`'s third argument is a RADIUS, not a diameter.** Your `diameter`
   variable is really the radius, so the drawn circle is twice as wide as the number
   suggests. Keep that in mind when you pick an amplitude — a `base` of 2 with `amp` of 8
   means circles swing between radius ~−6 and ~10, i.e. up to 20px wide. (Clamp to keep it
   positive — see below.)
2. **Math needs `calc(...)`.** Any arithmetic in a `let` binding or a path-arg position must
   be wrapped: `let r = calc(2 + 8 * sin(k * 0.5));`. Trig is in **radians**
   (`sin`, `cos`, `PI()`, `TAU()`, `%`, `atan2`, `lerp`, `clamp`, `map` are all available).

## The menu: three ways to size the circles

Pick whichever shape you want. All three are drop-in replacements for the
`let diameter = ...; if (...) { ... }` block inside your `drawingLayer.apply { }`.

Tunables used below:
- `base` — the minimum radius (floor),
- `amp` — how far the radius swings,
- `freq` — how many wobble cycles happen across the whole walk (bigger = more, tighter waves).

### 1. Pure oscillation — replace the ramp entirely

The radius just rises and falls as you walk. No taper.

```
let base = 3;
let amp  = 5;
let freq = 0.6;
let radius = calc(base + amp * sin(k * freq));
circle(start.x, start.y, radius);
```

- `cos` instead of `sin` only shifts the phase (starts at the peak instead of the middle).
- Want it to never get tiny/negative? Use `abs`: `calc(base + amp * abs(sin(k * freq)))`
  gives a "bouncing" pulse that touches `base` at the bottom and never inverts.

### 2. Oscillation × envelope — a wobble that fades in and out

This keeps the spirit of your original (small at the ends, large in the middle) but makes
the *envelope smooth* (a half-sine instead of a triangle) and rides a wobble on top of it.
`env` is 0 at both ends of the walk and 1 at the midpoint:

```
let base = 1;
let amp  = 9;
let freq = 0.9;
let t   = calc(k / itemLength);          // 0 .. 1 along the walk
let env = calc(sin(PI() * t));           // 0 at ends, 1 at middle (half-sine)
let radius = calc(base + amp * env * (0.5 + 0.5 * sin(k * freq)));
circle(start.x, start.y, radius);
```

The `(0.5 + 0.5 * sin(...))` term is a wobble remapped into the `0..1` range so it only ever
*reduces* the enveloped size, never flips it negative.

### 3. Oscillation + envelope — keep your taper, add a ripple

If you like your existing triangular taper and just want a ripple superimposed on it, keep
your `if`-based ramp and add a sin term:

```
let ramp = calc(k * 1.05);
if (k > calc(itemLength / 2)) {
  ramp = calc((itemLength - k) * 1.07);
}
let radius = calc(ramp + 2 * sin(k * 1.2));   // ripple of amplitude 2 on top of the ramp
circle(start.x, start.y, radius);
```

## Folding it into your loop

Only the inner sizing block changes; `start`, `next`, `sampleBilinear`, and the
`polarTranslate` walk stay exactly as you have them. Example with strategy 2:

```
for (k in 1..itemLength) {
  let angle = field.sampleBilinear(start.y, start.x);
  next = start.polarTranslate(angle, 3.6);
  drawingLayer.apply {
    let t   = calc(k / itemLength);
    let env = calc(sin(PI() * t));
    let radius = calc(1 + 9 * env * (0.5 + 0.5 * sin(k * 0.9)));
    circle(start.x, start.y, radius);
  }
  start = next;
}
```

## Side note: `sampleBilinear` argument order

`Grid.sampleBilinear(x, y)` takes `(x, y)` in canvas coordinates. Your call passes
`(start.y, start.x)` — that's transposed. If your field is symmetric, or you *want* the
transposed sampling, ignore this; otherwise swap to `field.sampleBilinear(start.x, start.y)`.

## See also

- [`incremental-pathblock-proposal.md`](incremental-pathblock-proposal.md) — building the
  walk into a single reusable PathBlock, then placing these oscillating circles along it with
  `.partition()` / `.get(t)` instead of re-walking the field.

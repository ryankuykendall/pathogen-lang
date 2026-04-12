---
title: "Strange Attractors: Clifford Attractor Art with Pathogen"
slug: clifford-attractor
date: 2026-04-14
description: "Build Clifford attractor visualizations from scratch — iterative chaos math, efficient point rendering, color mapping strategies, and where the language hits its limits."
---

> **Prerequisites:** This post uses [for loops](/pathogen/docs#syntax-for-loops), [user-defined functions](/pathogen/docs#syntax-functions), [layers](/pathogen/docs#layers-defining-layers), and [Color.palette](/pathogen/docs#color-palette). If you're new to Pathogen, start with the [getting started guide](/pathogen/docs#getting-started).

Every previous blog post on this site has built geometry by design — placing shapes, computing curves, arranging data. This post is different. We're going to write a tight loop, iterate a pair of equations ten thousand times, and watch structure emerge from arithmetic. The result is a **Clifford attractor**: a strange attractor discovered by [Clifford Pickover](https://en.wikipedia.org/wiki/Clifford_A._Pickover) and documented beautifully by [Paul Bourke](https://paulbourke.net/fractals/clifford/).

Strange attractors are the visual fingerprints of chaotic dynamical systems. You feed a point through a set of equations, and the output becomes the input for the next iteration. The trajectory never repeats, never diverges, but settles into a bounded region of space — tracing intricate, self-similar patterns along the way.

Pathogen turns out to be a surprisingly capable tool for this kind of work. Its trig functions, variable mutation in loops, and multi-layer system handle the core algorithm cleanly. But the exercise also reveals friction — places where the language's design, optimized for geometry construction, bumps against the needs of iterative generative art. We'll build the attractor first, then talk honestly about what could be better.

## The Math

The Clifford attractor is defined by two equations:

```
xₙ₊₁ = sin(a · yₙ) + c · cos(a · xₙ)
yₙ₊₁ = sin(b · xₙ) + d · cos(b · yₙ)
```

Four parameters — `a`, `b`, `c`, `d` — control the shape. Starting from a seed point `(x₀, y₀)`, each iteration produces a new point. The trajectory doesn't converge to a fixed point or diverge to infinity — it's trapped in a bounded region, orbiting forever without repeating. That region is the attractor.

<mini-workspace src="samples/post23/iteration-concept.pathogen" caption="Iteration trajectory — each point maps to the next through the Clifford equations"></mini-workspace>

The diagram above shows the first 8 iterations from seed point `(0.1, 0.1)` with parameters `a = -1.4, b = 1.6, c = 1.0, d = 0.7`. The points jump unpredictably — that's the chaos — but they stay bounded roughly within `[-3, 3]` on both axes. Draw enough points and the attractor's structure emerges.

## First Implementation: A Sparse Point Cloud

Let's start with just 100 iterations. The core pattern is a `for` loop that computes each new point from the previous one:

```pathogen
let a = -1.4;
let b = 1.6;
let c = 1.0;
let d = 0.7;

let scale = 70;
let cx = 200;
let cy = 200;

let x = 0.1;
let y = 0.1;

for (i in 0..99) {
  let nx = calc(sin(a * y) + c * cos(a * x));
  let ny = calc(sin(b * x) + d * cos(b * y));
  circle(calc(cx + nx * scale), calc(cy + ny * scale), 3);
  x = nx;
  y = ny;
}
```

A few things to notice:

**Temporary variables are essential.** Both `nx` and `ny` depend on the *current* `x` and `y`. If you updated `x` before computing `ny`, you'd be mixing old and new values — a classic pitfall in iterative algorithms. The pattern `let nx = ...; let ny = ...; x = nx; y = ny;` keeps both computations reading from the same state.

**Coordinate mapping.** The attractor lives in a small mathematical space (roughly `[-3, 3]`). To render in SVG, we scale by `70` and offset to the canvas center `(200, 200)`. This `calc(cx + value * scale)` pattern is the same coordinate transform you'd write in any graphics system.

**`circle()` for visibility.** At 100 points, individual dots need to be large enough to see. We use radius `3` here — we'll optimize this later.

<mini-workspace src="samples/post23/first-attractor.pathogen" caption="100 iterations — the attractor's skeleton is just barely visible" code-open></mini-workspace>

With only 100 points, you can see individual dots scattered across the canvas. Some clustering is visible — the attractor's structure is already hinting at itself — but the image is sparse. We need more iterations.

## Scaling Up: 10,000 Points

Pathogen's `for` loop supports up to 10,000 iterations (a safety limit to prevent runaway programs). Let's use all of them.

But first, an optimization. Each `circle()` call generates two SVG arc commands — for 10,000 circles, that's 20,000 arc commands plus 10,000 moves. Instead, we can render each point as a zero-length line segment: `M x y l 0 0`. With `stroke-linecap: round` set on the layer, SVG renders this as a circular dot. Two commands per point instead of three, and the visual result is identical.

```pathogen
define default PathLayer('attractor') ${
  stroke: oklch(0.35 0.15 260);
  stroke-width: 0.8;
  stroke-linecap: round;
  fill: none;
}

M calc(cx + x * scale) calc(cy + y * scale)

for (i in 1..9999) {
  let nx = calc(sin(a * y) + c * cos(a * x));
  let ny = calc(sin(b * x) + d * cos(b * y));
  x = nx;
  y = ny;
  M calc(cx + nx * scale) calc(cy + ny * scale) l 0 0
}
```

The `M x y l 0 0` idiom is a well-known SVG trick for point rendering, but it's admittedly non-obvious. A dedicated `dot(x, y)` function would communicate intent more clearly — we'll return to this idea later.

<mini-workspace src="samples/post23/full-attractor.pathogen" caption="10,000 iterations — the full Clifford attractor emerges" code-open></mini-workspace>

At 10,000 points, the attractor's character is unmistakable. The classic parameter set `(a = -1.4, b = 1.6, c = 1.0, d = 0.7)` produces a figure that resembles overlapping leaf forms, with dense filaments tracing the trajectories that the system visits most often.

## Color Mapping with Layers

A single-color attractor is striking, but color can reveal the attractor's temporal structure — how the trajectory evolves over time. In many attractor renderers, each point's color is determined by its iteration index or by the local density of visits. Pathogen's layer system gives us a clean way to approximate this.

The idea: split 10,000 iterations into 5 chunks of 2,000 each. Each chunk renders to a different layer with a different color from a palette. Early iterations (exploring the attractor's outline) get one color; later iterations (filling in the dense interior) get another.

```pathogen
let colors = Color.palette(Color('#1e40af'), Color('#f97316'), 5);

let l0 = PathLayer('c0') ${ stroke: colors[0]; stroke-width: 1; stroke-linecap: round; fill: none; };
let l1 = PathLayer('c1') ${ stroke: colors[1]; stroke-width: 1; stroke-linecap: round; fill: none; };
let l2 = PathLayer('c2') ${ stroke: colors[2]; stroke-width: 1; stroke-linecap: round; fill: none; };
let l3 = PathLayer('c3') ${ stroke: colors[3]; stroke-width: 1; stroke-linecap: round; fill: none; };
let l4 = PathLayer('c4') ${ stroke: colors[4]; stroke-width: 1; stroke-linecap: round; fill: none; };

let layers = [l0, l1, l2, l3, l4];
```

With the layers stored in an array, the nested loop structure handles both iteration and color dispatch:

```pathogen
for (chunk in 0..4) {
  let target = layers[chunk];
  for (i in 0..1999) {
    let nx = calc(sin(a * y) + c * cos(a * x));
    let ny = calc(sin(b * x) + d * cos(b * y));
    x = nx;
    y = ny;
    target.apply {
      M calc(cx + nx * scale) calc(cy + ny * scale) l 0 0
    }
  }
}
```

The outer loop selects a layer; the inner loop draws 2,000 points to it. Since `x` and `y` are declared in the outer scope, they persist across chunks — the attractor's trajectory is continuous even though the color changes.

<mini-workspace src="samples/post23/color-attractor.pathogen" caption="Temporal color mapping — blue (early iterations) to orange (late iterations)" code-open></mini-workspace>

The color reveals something the monochrome version hides: the attractor doesn't fill uniformly. Early iterations (blue) trace the broad outline. Later iterations (orange) concentrate in the densest filaments, reinforcing the paths the system visits repeatedly. This temporal layering is a rough proxy for the density-based histogram rendering that professional attractor tools use.

## Parameter Exploration

The four parameters are the soul of the attractor. Small changes produce dramatically different forms. Here are three parameter sets that show the range of visual character a Clifford attractor can take:

<mini-workspace src="samples/post23/parameter-gallery.pathogen" caption="Three parameter sets — each producing a distinct attractor form"></mini-workspace>

The implementation extracts the Clifford step into a reusable function:

```pathogen
fn cliffordStep(x, y, a, b, c, d) {
  return {
    x: calc(sin(a * y) + c * cos(a * x)),
    y: calc(sin(b * x) + d * cos(b * y))
  };
}
```

The function returns an object with `x` and `y` properties, which the caller destructures. This pattern — packaging both return values in an object — avoids the temporary-variable dance when the computation is factored out of the loop.

## Interactive Colors

Since the attractor parameters control the *geometry* and must be baked in at compile time, we can't make them reactive via CSS variables. But we *can* make the color palette reactive. The sample below uses `CSSVar` for the early and late colors — try changing them in the playground's CSS variable panel to see the palette update in real time:

<mini-workspace src="samples/post23/interactive-attractor.pathogen" caption="Reactive color palette — change --early-color and --late-color to restyle the attractor" code-open></mini-workspace>

This works because `Color.palette()` generates CSS color functions that reference the underlying variables. The geometry stays fixed, but the visual character transforms instantly.

## Where the Language Could Grow

Building this attractor was a satisfying exercise, but it also exposed genuine friction. These aren't bugs — they're places where Pathogen's design, shaped by geometry construction, meets the different demands of iterative generative art.

### A `dot()` function

The `M x y l 0 0` idiom for rendering individual points works, but it's an SVG implementation detail leaking into the language. A `dot(x, y)` function (optionally `dot(x, y, radius)`) would express intent clearly and let the compiler choose the most efficient SVG representation. This is a small addition to [stdlib](/pathogen/docs#stdlib) — analogous to how `circle()` wraps two arc commands — but it would make point-cloud rendering feel like a first-class use case rather than a clever workaround.

### Configurable iteration limits

The 10,000-iteration cap is a reasonable safety default for geometry programs, but generative art routinely wants 50,000 or 100,000 iterations for high-resolution output. A compiler option like `--max-iterations=50000` or a pragma would let users opt in to higher limits when they know what they're doing, without changing the safe default for everyone else.

The nested-loop workaround (outer loop over chunks, inner loop over iteration batches) does get you there today — the 10,000 limit is per-loop, and `x`/`y` persist across the outer scope. But it feels like you're working around the system rather than with it.

### Per-segment styling

All segments within a layer share one stroke color. To color-map an attractor by iteration index, we split work across multiple layers with different colors — which works, but it's a discrete approximation of what should ideally be a continuous gradient. True per-point coloring would require SVG `<circle>` elements (each independently styleable) rather than a single `<path>` — a fundamental architectural shift.

This is as much an SVG constraint as a Pathogen one. But the language could help by providing something like a `scatter()` function that emits individual `<circle>` elements from an array of `{x, y, color}` objects, trading path efficiency for per-element styling. Even without that, the multi-layer approach shown above produces compelling results — the 5-color temporal gradient reveals the attractor's density structure effectively.

## What We Built

Starting from two lines of math, we built:

1. A **100-point sparse point cloud** showing the basic algorithm and the temporary-variable pattern
2. A **10,000-point full render** using the `M x y l 0 0` optimization for efficient SVG output
3. A **5-layer color-mapped visualization** that reveals temporal structure through nested loops and array-dispatched layers
4. A **parameter gallery** comparing three distinct attractor forms via a reusable `cliffordStep()` function
5. An **interactive variant** with reactive CSS variable colors

The Clifford attractor is a small window into a vast space. Pathogen handles the core workflow — iterate, map coordinates, render — cleanly. The friction points we identified aren't blockers; they're signposts for where the language wants to grow as generative art becomes a larger part of its story.

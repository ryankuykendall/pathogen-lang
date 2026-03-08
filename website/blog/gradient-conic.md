---
title: "Beyond CSS: Conic Gradients with WebGPU Rendering"
date: "2026-03-03"
slug: "gradient-conic"
description: "SVG has no conic gradient primitive. Pathogen adds one with partial sweeps, inner radius, direction control, and a WebGPU rendering pipeline that falls back gracefully to Canvas 2D."
---

CSS has `conic-gradient()`. SVG does not. This is not an oversight — the SVG spec simply never included angular gradients. If you want a color wheel, a gauge, or a pie chart rendered as an SVG gradient, you are out of luck. You can fake it with dozens of wedge-shaped paths, or you can embed a rasterized image and lose the vector benefits.

Pathogen takes a different approach. `ConicGradient` is a first-class gradient type that compiles to a base64-encoded `<pattern>` element. The rasterization happens at compile time via WebGPU (or Canvas 2D as a fallback), producing a pixel-perfect image embedded directly in the SVG. The author writes gradient code. The viewer sees a standard SVG.

## The Color Wheel

The simplest conic gradient is a full 360-degree sweep. `ConicGradient` takes an ID and a center point in absolute coordinates (not `objectBoundingBox` — conic gradients are rasterized at a fixed resolution, so pixel coordinates make more sense).

```pathogen
let wheel = ConicGradient('wheel', 200, 200) {|g|
  g.stop(0,    Color('#e63946'));
  g.stop(0.17, Color('#f9c74f'));
  g.stop(0.33, Color('#43aa8b'));
  g.stop(0.50, Color('#277da1'));
  g.stop(0.67, Color('#5e60ce'));
  g.stop(0.83, Color('#9b5de5'));
  g.stop(1,    Color('#e63946'));
};
wheel.interpolation = 'oklch';
```

Stops at 0 and 1 should match to avoid a hard seam at the join. With OKLCH interpolation enabled, the transitions stay vibrant across the entire hue wheel — no desaturated dead zones between complementary colors.

The color wheel below uses `innerRadius` to create a donut effect and `.inherit()` to create a smaller inner disc with a different fill mode. One gradient definition, two visual treatments.

<mini-workspace src="samples/post2/color-wheel.pathogen" caption="Full 360-degree sweep with innerRadius donut and OKLCH interpolation" code-open></mini-workspace>

## Partial Sweeps

Not every conic gradient needs to go all the way around. The `from` and `to` properties define the angular range of the sweep, in degrees. A gauge that covers 270 degrees (from 135 to 405) leaves a gap at the bottom — a natural fit for speedometers, progress rings, and dial indicators.

```pathogen
let gauge = ConicGradient('speed', 120, 150) {|g|
  g.stop(0,   Color('#43aa8b'));
  g.stop(0.5, Color('#f9c74f'));
  g.stop(1,   Color('#e63946'));
};
gauge.from = 135deg;
gauge.to = 405deg;
gauge.innerRadius = 38;
gauge.innerFill = 'center';
```

The `from` and `to` values use degree syntax. Values above 360 are valid — `405deg` is equivalent to `45deg` but makes the intent clear: a 270-degree arc that wraps past the top. The dashboard below shows three gauges with different angular ranges and inner radii.

<mini-workspace src="samples/post2/gauge-dashboard.pathogen" caption="Three gauges using partial sweeps — 270-degree and 180-degree arcs" code-open></mini-workspace>

## Direction: CW and CCW

By default, conic gradients sweep clockwise. Setting `.direction = 'ccw'` reverses the sweep direction. The color stops stay in the same order, but the angular progression runs counter-clockwise. This is useful when mirroring UI elements or creating paired visual effects.

```pathogen
let grad = ConicGradient('grad', 200, 200) {|g|
  g.stop(0,    Color('#e07a5f'));
  g.stop(0.33, Color('#f2cc8f'));
  g.stop(0.66, Color('#3d85c6'));
  g.stop(1,    Color('#264653'));
};
grad.direction = 'ccw';
```

<mini-workspace src="samples/post2/direction-comparison.pathogen" caption="Same four stops — clockwise vs counter-clockwise"></mini-workspace>

## Inner Radius and Fill Modes

The `innerRadius` property carves out a hole in the center of the gradient, creating a donut shape. What fills that hole is controlled by `innerFill`, which supports four modes:

- **transparent**: A hard cutout. The area inside the inner radius is fully transparent.
- **transparent-blend**: A smooth fade from the gradient edge to full transparency at the center.
- **center**: The first color stop extends inward, filling the center with a solid disc.
- **Color(...)**: A custom color fills the center.

```pathogen
let grad = ConicGradient('grad', 200, 200) {|g|
  g.stop(0, Color('#7c3aed'));
  g.stop(1, Color('#7c3aed'));
};
grad.innerRadius = 35;
grad.innerFill = 'transparent-blend';
```

<mini-workspace src="samples/post2/inner-radius-showcase.pathogen" caption="Four innerFill modes: transparent, transparent-blend, center, and custom color" code-open></mini-workspace>

## OKLCH on Conics

OKLCH interpolation matters even more on conic gradients than on linear ones. A full-sweep color wheel interpolated in sRGB produces muddy bands wherever complementary colors meet. In OKLCH, the transitions trace a perceptually uniform arc through the hue wheel, maintaining chroma and lightness throughout.

The comparison below renders the same color pairs as both sRGB and OKLCH conic gradients. The sRGB versions show visible desaturation at the midpoints. The OKLCH versions maintain vivid color throughout the full rotation.

<mini-workspace src="samples/post2/oklch-conic.pathogen" caption="sRGB vs OKLCH on conics — muddy midpoints vs vibrant arcs"></mini-workspace>

Conic gradients also support the same `spreadMethod` options as linear and radial gradients. When using a partial sweep, `reflect` and `repeat` can produce interesting patterns in the gap region. The `conic-spread-modes` sample explores this.

## How It Renders

Conic gradients cannot be expressed as native SVG elements. Instead, Pathogen rasterizes them at compile time and embeds the result as a base64-encoded PNG inside a `<pattern>` element. The rendering pipeline has three tiers:

1. **WebGPU**: When available (playground, `--render-gpu` CLI flag), a fragment shader computes per-pixel colors. This is fast and produces the highest quality output with correct OKLCH interpolation.

2. **Canvas 2D**: When WebGPU is unavailable, a Canvas 2D fallback renders the gradient using the native `createConicGradient()` API with manual stop processing.

3. **Wedge paths**: The CLI's default mode generates a series of thin wedge-shaped `<path>` elements, each filled with a solid color sampled from the gradient. This requires no browser environment but produces larger SVG output.

In all three cases, the author writes the same `ConicGradient` code. The rendering path is an implementation detail — the compiled SVG looks identical regardless of which pipeline produced it.

## What Comes Next

Conic gradients fill a gap in SVG's rendering model. But there are gradient types that no web standard has ever supported: grid-based mesh gradients and scatter-based freeform gradients. In the [next post](/pathogen/blog/gradient-mesh-freeform), we implement both.

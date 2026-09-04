---
title: "Painting with Math: Linear and Radial Gradients in Pathogen"
date: "2026-03-02"
slug: "gradient-linear-radial"
description: "How Pathogen turns SVG's linearGradient and radialGradient into programmable, composable building blocks with OKLCH interpolation, spread methods, and gradient inheritance."
---

SVG has had `<linearGradient>` and `<radialGradient>` since the 1.1 spec. They work. They are also tedious to write by hand, impossible to compose, and stuck interpolating through sRGB. Pathogen treats gradients as first-class objects — define them with code, inherit from them, assign them to layers, and let the compiler emit the correct SVG elements.

This post builds up from a single linear gradient to a full themed palette using inheritance and OKLCH color interpolation. Every demo below is interactive — click "Open in Playground" to experiment with the source.

## The Gradient Model

A `LinearGradient` maps color stops onto a line defined by two points in `objectBoundingBox` coordinates. The coordinate space is normalized: `(0, 0)` is the top-left of the bounding box, `(1, 1)` is the bottom-right. This means a gradient defined once works at any scale — it stretches to fit whatever shape you fill with it.

```pathogen
let sky = LinearGradient('sky', 0, 0, 0, 1) {|g|
  g.stop(0,    Color('#0d1b2a'));
  g.stop(0.45, Color('#1b4965'));
  g.stop(0.75, Color('#c56b5a'));
  g.stop(1,    Color('#f4a261'));
};
```

The constructor takes an ID string and four coordinates: `x1, y1, x2, y2`. Color stops are added inside the initialization block using `g.stop(position, color)`, where position is a value between 0 and 1. Once defined, assign the gradient to a layer's `fill` property:

```pathogen
let sky_layer = PathLayer('sky-fill') #{ fill: sky; stroke: none; };
sky_layer.apply { rect(0, 0, 400, 300) }
```

The landscape below uses four linear gradients — a vertical sky, a diagonal mountain range, a horizontal sun streak, and a vertical ground fill — layered with Pathogen's `GroupLayer` to compose the scene.

<mini-workspace src="samples/post1/linear-basics.pathogen" caption="Four linear gradients composing a layered landscape" code-open></mini-workspace>

## Gradient Direction

The `x1, y1 → x2, y2` coordinates control the gradient's angle. A vertical gradient uses `(0, 0, 0, 1)`. A horizontal one uses `(0, 0, 1, 0)`. Diagonals use any combination. Reversing the coordinates reverses the color flow — `(1, 0, 0, 0)` runs right to left.

There is no `angle` property. The two-point model is more flexible: you can offset the start or end to create gradients that begin or end partway through an element, or run along arbitrary diagonals. The six swatches below show the same three color stops at six different directions.

<mini-workspace src="samples/post1/angle-fan.pathogen" caption="Same stops, six directions — the two-point model controls angle"></mini-workspace>

## RadialGradient

`RadialGradient` works the same way, but radiates outward from a center point. The constructor takes `(id, cx, cy, r)`, where `cx` and `cy` are the center coordinates (again in `objectBoundingBox` space) and `r` is the radius as a fraction of the bounding box.

```pathogen
let glow = RadialGradient('glow', 0.5, 0.5, 0.6) {|g|
  g.stop(0,   Color('#f4a261'));
  g.stop(0.4, Color('#c56b5a'));
  g.stop(1,   Color('#0d1b2a'));
};
```

Radial gradients are natural fits for glows, spotlights, and vignettes. The scene below composes four radial gradients — a nebula background, two star types, and a planet with an off-center highlight — to build a cosmic scene entirely from radial falloffs and transparent stops.

<mini-workspace src="samples/post1/radial-glow.pathogen" caption="Four radial gradients — nebula, stars, and a ringed planet" code-open></mini-workspace>

### Focal Points

The basic constructor centers the gradient's falloff at `(cx, cy)`. But `RadialGradient` also accepts two extra arguments — `fx` and `fy` — that shift the *focal point* away from the geometric center. The gradient still fills the same circle, but the highlight moves, creating the illusion of directional light on a 3D surface.

```pathogen
// Same radius, different highlight positions
let sphere = RadialGradient('s', 0.5, 0.5, 0.5, 0.3, 0.3) {|g|
  g.stop(0,   Color('#ffffff'));
  g.stop(0.5, Color('#2563eb'));
  g.stop(1,   Color('#0a1428'));
};
```

The three spheres below use identical color stops. Only `fx` and `fy` differ — the highlight shifts from top-left to center to top-right.

<mini-workspace src="samples/post1/radial-focal.pathogen" caption="Same gradient stops, three focal points — the highlight shifts with fx, fy"></mini-workspace>

## OKLCH Interpolation

By default, SVG gradients interpolate in sRGB. This is the web platform default, and it produces muddy midpoints when transitioning between colors that are far apart on the hue wheel. Blue to yellow passes through gray. Red to cyan desaturates through brown.

OKLCH interpolation solves this. OKLCH (Okay Lightness, Chroma, Hue) is a perceptually uniform color space where interpolation follows a natural arc through the hue wheel instead of cutting through the middle of the RGB cube. Setting `.interpolation = 'oklch'` on any gradient enables this.

```pathogen
let grad = LinearGradient('grad', 0, 0, 1, 0) {|g|
  g.stop(0, Color('#2563eb'));
  g.stop(1, Color('#eab308'));
};
grad.interpolation = 'oklch';
```

The comparison below shows three color pairs — blue/yellow, red/cyan, magenta/green — in both sRGB and OKLCH. The difference is dramatic: sRGB midpoints are desaturated and dull, while OKLCH transitions stay vibrant and chromatic.

<mini-workspace src="samples/post1/oklch-vs-srgb.pathogen" caption="sRGB vs OKLCH — same stops, dramatically different midpoints" code-open></mini-workspace>

## Spread Methods

When a gradient covers less than the full bounding box, the `spreadMethod` property controls what happens outside the defined range. SVG supports three modes:

- **pad**: The last stop color extends to fill the remaining space. This is the default.
- **reflect**: The gradient reverses direction and plays back, creating a mirror effect.
- **repeat**: The gradient tiles, repeating its pattern continuously.

```pathogen
let grad = LinearGradient('grad', 0, 0, 0.3, 0) {|g|
  g.stop(0,    Color('#e63946'));
  g.stop(0.33, Color('#f4a261'));
  g.stop(0.66, Color('#2a9d8f'));
  g.stop(1,    Color('#264653'));
};
grad.spreadMethod = 'reflect';
```

The three strips below use the same gradient that covers only the first 30% of each element. The vertical lines mark the gradient's defined range. Beyond that boundary, each spread method produces a different visual pattern.

<mini-workspace src="samples/post1/spread-modes.pathogen" caption="pad, reflect, repeat — same narrow gradient, three spread behaviors" code-open></mini-workspace>

## Gradient Inheritance

When you need variations of a gradient — reversed, rotated, desaturated — copying and modifying the stop list is fragile. Pathogen's `.inherit()` method creates a new gradient that shares the parent's stop definitions but can override any property.

```pathogen
let base = LinearGradient('warm-base', 0, 0, 1, 0) {|g|
  g.stop(0,    Color('#e63946'));
  g.stop(0.35, Color('#f4a261'));
  g.stop(0.65, Color('#e9c46a'));
  g.stop(1,    Color('#2a9d8f'));
};

let cool = base.inherit('cool-variant');
cool.gradientTransform = 'rotate(180, 0.5, 0.5)';

let vertical = base.inherit('vertical-variant');
vertical.gradientTransform = 'rotate(90, 0.5, 0.5)';
```

One base gradient, three variants. Change the base and all inherited gradients update. This is the foundation of a themeable gradient system — define your palette once, derive everything else.

<mini-workspace src="samples/post1/inheritance-theme.pathogen" caption="One base gradient spawns a family of variants via inherit()" code-open></mini-workspace>

## CSS Variable Reactivity

Pathogen's gradients compose naturally with the [reactive color system](/blog/reactive-color-svg). When gradient stops reference CSS custom properties, the compiled SVG responds to runtime changes — swap a theme variable and every gradient updates instantly.

The demo below puts three overlapping radial glows on a dark background. Each glow's center color is bound to a CSS variable (`--light-a`, `--light-b`, `--light-c`) — use the color pickers to remix the scene in real time.

<mini-workspace src="samples/post1/radial-reactive.pathogen" caption="Drag the color pickers to recolor three overlapping radial lights" code-open></mini-workspace>

This is the payoff of treating gradients as first-class objects: they participate in the same variable binding, OKLCH manipulation, and reactive update system as every other part of the language.

## What Comes Next

Linear and radial gradients map directly to SVG elements — the compiler emits `<linearGradient>` and `<radialGradient>` and the browser handles rendering. But SVG has no `<conicGradient>`. In the [next post](/blog/gradient-conic), we build one from scratch using WebGPU shaders and rasterized `<pattern>` elements.

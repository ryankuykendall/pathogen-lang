---
title: "The Full Filter Family: Glow, Emboss, Shadows, Pixelate"
date: "2026-05-12"
slug: "custom-filters-family"
description: "Five more custom filters that close the gaps native CSS leaves open: outer/inner glow, embossed surfaces, Material-style elevation shadows, inset shadows, and pixelation — all configured by named parameters, all composable via GroupLayer."
---

> **Part 2 of 2** in our series on Pathogen's custom filter pipeline. [Part 1](./custom-filters-pipeline) covered the architecture and ergonomics anchored by `NoiseFilter`. This post walks through the rest of the family with side-by-side parameter sweeps.

**Series:**
1. [Custom Filters in Pathogen: First-Class Visual Effects](./custom-filters-pipeline)
2. **The Full Filter Family: Glow, Emboss, Shadows, Pixelate** ← you are here

## The family at a glance

<mini-workspace src="samples/post26/01-hero-family.pathogen" caption="Six filters, one shape per cell. Each is a single language-level value: NoiseFilter, GlowFilter, EmbossFilter, ElevationShadowFilter, InnerShadowFilter, PixelateFilter." code-open></mini-workspace>

The same ergonomic story from [Part 1](./custom-filters-pipeline) applies to every filter on this page: each is a first-class value, configured by name in a trailing block, accepts the same auto-wrapping `filter:` assignment in a style block, exposes read-side property access on every configurable knob, and composes with other filters via [`GroupLayer`](/docs/layers) stacking.

What changes filter-to-filter is the **specific capability gap** each one closes against native CSS and the **specific knobs** each one exposes. Let's walk through them.

## GlowFilter — two glow modes in one value

CSS `drop-shadow()` gives you one kind of glow: a colored outer halo. Pathogen's `GlowFilter` gives you two — `GlowMode.Outer` and `GlowMode.Inner` — packed into one filter value that you can flip with a single property write.

<mini-workspace src="samples/post26/02-glow-modes.pathogen" caption="Outer halo and inner edge light. Same constructor, same color, same radius — only the mode property differs." code-open></mini-workspace>

The two modes share most of their plumbing — both use `feGaussianBlur` against `SourceAlpha`, both apply `feFlood` for the color, both composite into a `feMerge` at the end. The difference is one composite operator: outer mode merges the blurred silhouette underneath the source; inner mode inverts the blur against the source alpha so the glow rides the inside edge instead.

A `spread` parameter is also available in both modes — it dilates the silhouette in Outer mode (fattening the halo before the blur) and erodes it in Inner mode (pushing the inner light further inset). The two knobs that do the most visible work in either mode are `radius` and `opacity`.

<mini-workspace src="samples/post26/03-glow-radius-sweep.pathogen" caption="Radius controls the blur stdDeviation — wider radius produces a softer, broader halo." code-open></mini-workspace>

<mini-workspace src="samples/post26/04-glow-opacity-sweep.pathogen" caption="Opacity scales the flood-opacity on the glow color. Subtle ambient lighting at 0.3; full-strength halo at 0.9." code-open></mini-workspace>

For inner glow, an additional `spread` parameter erodes the silhouette before blurring so the glow has more inset distance — useful for pressed-glass and bezeled-button effects. See [docs/filters § GlowFilter](/pathogen/docs#filters-glowfilter) for the full property reference.

## EmbossFilter — `feSpecularLighting` wrapped in named parameters

The SVG primitive for embossed surfaces is `feSpecularLighting` + `feDistantLight`. It's powerful and unergonomic: you write XML, you choose which child light type to nest, you spec `surfaceScale` and `specularConstant` and `specularExponent` and `lighting-color`, you composite the highlight pass back against `SourceAlpha`, and then you blend it onto `SourceGraphic`. Five primitives, half a dozen attributes, no semantic shortcuts.

`EmbossFilter` wraps that whole chain into seven named parameters you can sweep without leaving Pathogen.

```
let emboss = EmbossFilter() {|f|
  f.angle = 135deg;     // light azimuth — top-left
  f.elevation = 45deg;  // light elevation — overhead-ish
  f.depth = 3;          // surface scale — bevel depth
  f.strength = 1.0;     // specular constant — highlight brightness
  f.shininess = 20;     // specular exponent — highlight tightness
  f.lightColor = Color('white');
  f.smooth = 1;         // pre-blur for softer bevel edges
};
```

### angle — the light direction

The most visible knob. Sweeping `angle` rotates the simulated light around the surface; the highlight follows.

<mini-workspace src="samples/post26/05-emboss-angle-sweep.pathogen" caption="Six light azimuths around the clock. The highlight tracks the light source." code-open></mini-workspace>

### depth — the bevel surface scale

`depth` maps to `surfaceScale` on `feSpecularLighting` — the perceived height of the embossed surface. Higher values produce a more pronounced bevel.

<mini-workspace src="samples/post26/06-emboss-depth-sweep.pathogen" caption="depth = 1 reads as a flat panel with a hint of light. depth = 8 reads as a dramatically raised tile." code-open></mini-workspace>

### strength — the highlight brightness

`strength` maps to `specularConstant`. It controls how much of the simulated light reaches the surface — higher values brighten the highlight, lower values dial it down toward a flat appearance.

<mini-workspace src="samples/post26/07-emboss-strength-sweep.pathogen" caption="Same angle and depth. strength = 0.3 is a barely-lit surface; 1.5 is dramatic studio lighting." code-open></mini-workspace>

The ergonomic win here isn't just that you don't write the XML — it's that you can sweep any parameter live and watch the result, because every knob is a property write you can prototype directly. The raw-SVG equivalent is editing `<feSpecularLighting>` attribute values by hand and reloading.

## ElevationShadowFilter — Material depth in one knob

Material Design's depth shadows aren't single drop-shadows. They're three coordinated drop-shadows stacked under a single elevation concept — a tight shadow for the close-in contact zone, a mid shadow for the bulk of the cast, and a soft shadow for the far falloff. The result reads as physical lift in a way one shadow can't.

You can't express that in CSS as `drop-shadow(...)` because `drop-shadow()` is one layer. You'd write three `filter: drop-shadow(...) drop-shadow(...) drop-shadow(...)` and hand-tune the offset/blur/opacity for each layer. Three times the typing, three times the chance of mistuning the layers, and zero introspection on the result.

`ElevationShadowFilter` gives you one knob — `elevation` — and does the layering for you.

<mini-workspace src="samples/post26/08-elevation-sweep.pathogen" caption="One value, six elevations. elevation = 0 emits no shadow; elevation = 24 produces a deeply lifted floating element." code-open></mini-workspace>

Internally, `elevation` parameterizes three sub-shadows with tuned distance, blur, and opacity ratios — `0.3 / 0.5 / 0.30` for the tight layer, `0.6 / 1.0 / 0.18` for the mid, `1.0 / 2.0 / 0.12` for the soft. Multiply each by `elevation`, project the offset along `direction` (default `90deg` = down), and you get a shadow stack that scales coherently from "barely lifted" to "dramatically floating."

### tightness — scaling the ratios

For finer control over the shadow character at a fixed elevation, the `tightness` property scales the per-layer distance and blur ratios. `0.5` reads as a tighter, crisper depth; `2.0` reads as a wider, hazier cast.

<mini-workspace src="samples/post26/09-elevation-tightness-sweep.pathogen" caption="Same elevation (6), three tightness values. The shadow widens and softens as tightness grows." code-open></mini-workspace>

### Why three layers beats one

Side by side: the left card uses a single CSS `drop-shadow(0 6px 12px black)` at 40% opacity. The right card uses `ElevationShadowFilter` with `elevation = 6`. Same approximate "depth budget" — the elevation knob and the drop-shadow params land in the same neighborhood — but the three-layer chain reads as something hovering above the page rather than something with a shadow under it.

<mini-workspace src="samples/post26/10-elevation-vs-drop-shadow.pathogen" caption="Single CSS drop-shadow on the left; three-layer ElevationShadowFilter on the right. The contact zone, falloff, and outer haze tell different stories." code-open></mini-workspace>

This isn't a knock on `drop-shadow()` — it's the right tool for a specific job. It's a demonstration that *Material depth* is a different visual language than *offset shadow*, and that having a first-class language value for the former is the difference between expressing it directly and re-inventing the layering by hand each time.

## InnerShadowFilter — the inset capability CSS can't reach

CSS `drop-shadow()` is outer-only. There is no `drop-shadow(... inset)` keyword and no other CSS filter function that produces an inset shadow. Pressed buttons, recessed wells, engraved-text effects, carved-look artwork — all of these reach for `box-shadow: inset ...`, which works on box backgrounds but not on SVG paths.

`InnerShadowFilter` is the capability that closes that gap.

<mini-workspace src="samples/post26/11-inner-shadow-blur-sweep.pathogen" caption="Four blur radii. blur = 2 reads as a hard-edged debossed groove; blur = 16 reads as a soft recessed well." code-open></mini-workspace>

The primitive chain is the inverse of an outer shadow: blur `SourceAlpha`, offset it, composite against the original silhouette using `operator="out"` (which keeps only the part NOT covered by the offset blur), color-fill, clip to the source, then merge under the source graphic.

### The offset compass

`offsetX` and `offsetY` together control where the shadow falls *inside* the shape — and therefore where the perceived light source sits *outside* it. A positive `offsetY` (the default of `2`) pushes the shadow down, which reads as light coming from above. Negative `offsetY` flips that. Diagonal offsets simulate raking light.

<mini-workspace src="samples/post26/12-inner-shadow-compass.pathogen" caption="Eight offset directions on the same disc. Each label is the (offsetX, offsetY) pair; the shadow lands opposite the implied light source." code-open></mini-workspace>

The compass view also illustrates something the other parameter sweeps can't: the inner shadow technique works on any shape, not just rectangles. Roundrects, circles, stars, freeform paths — `InnerShadowFilter` clips to whatever silhouette you painted.

## PixelateFilter — a four-primitive recipe collapsed into one constructor

Pixelation in raw SVG is a sample-flood-tile-composite-dilate technique: flood a small region with a sample color, expand the region into one tile cell, tile that cell across the filter region, composite against the source to keep only the pixels at sample positions, then dilate each sample into a block. Four primitives, three intermediate `result` names to thread together, and a `filterUnits` attribute you have to get right or the whole thing renders blank.

`PixelateFilter` collapses all of that into one constructor with three numeric knobs and gives you the choice of positional or block-style configuration:

```
let pix = PixelateFilter(width, height, radius);
```

- `width` and `height` are the stride between sampled pixels (and therefore the block size in the output)
- `radius` is the dilation distance — how far each sample expands

The constructor accepts both positional arguments (as above) and the trailing-block form for consistency with the other filters:

```
let pix = PixelateFilter() {|f|
  f.width = 12;
  f.height = 12;
  f.radius = 6;
};
```

### Block size sweep

Three positional values, four block sizes. Larger `width` produces coarser pixelation.

<mini-workspace src="samples/post26/13-pixelate-block-sweep.pathogen" caption="PixelateFilter(4, 4, 2) through PixelateFilter(32, 32, 16). radius = width / 2 keeps blocks touching with no gap or overlap." code-open></mini-workspace>

### Radius regime

At fixed `width` and `height`, `radius` controls three visually distinct regimes:

<mini-workspace src="samples/post26/14-pixelate-radius-regime.pathogen" caption="Width = height = 16 in all three. Radius below width/2 leaves gaps; equal to width/2 makes blocks touch; above width/2 makes them overlap." code-open></mini-workspace>

The gap regime gives you a halftone-print look. The touching regime is the canonical "8-bit pixel" appearance. The overlap regime softens the block edges by letting adjacent samples merge — useful when you want pixelation without the harsh grid.

## Stacking filters via GroupLayer

A single `filter:` declaration in a Pathogen style block accepts **either** a custom filter value **or** a chain of native CSS filter functions — not both at once. That's the v1 limit on filter chaining.

The composition workaround is straightforward and ergonomic: nest the layer in a [`GroupLayer`](/docs/layers) carrying one filter, and put the second filter on the inner layer.

<mini-workspace src="samples/post26/15-composition-card.pathogen" caption="A card raised above its surface (ElevationShadow on the outer GroupLayer) and visually recessed on its top edge (InnerShadow on the inner PathLayer)." code-open></mini-workspace>

Two filters, one rectangle. The card reads as physically lifted above its surface AND as having a pressed-in lip along its top edge — a combination you can't express in a single CSS `filter:` declaration, and that you wouldn't want to write by hand as a raw `<filter>` def either.

## Ergonomic recap

Looking back across both posts, the six custom filters fit the same shape:

- **Defined once** with a trailing block of named property assignments.
- **Referenced many times** via a single `let` binding, producing one `<filter>` def in the output regardless of reference count.
- **Configured by preset where presets exist** (NoiseFilter's `style`, GlowFilter's `mode`) and by named numeric parameters everywhere else (no positional ambiguity).
- **Introspectable** — every configurable property is also readable from the value.
- **Composable** with gradients (filters apply on top of any fill, including gradients) and with each other (via `GroupLayer` stacking).
- **Cross-surface consistent** — the same source compiles to identical SVG in the CLI, the playground, and the VS Code preview.

That's the ergonomic story we wanted to tell. The visual capabilities are real — Material elevation, inset shadows, the full noise family, the rest — but they're available in raw SVG too. What custom filters add is making those capabilities easy to reach for, easy to reuse, and easy to compose.

For the full reference, see [docs/filters](/docs/filters). For the architecture story and the NoiseFilter deep-dive, see [Part 1](./custom-filters-pipeline). To experiment with any of these in your browser, open the [playground](/pathogen).

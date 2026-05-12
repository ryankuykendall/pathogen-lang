---
title: "Custom Filters in Pathogen: First-Class Visual Effects"
date: "2026-05-11"
slug: "custom-filters-pipeline"
description: "Pathogen's custom filters are first-class language values — defined once, reused, introspected, and composed in ways native CSS filter functions can't match. A walkthrough of the pipeline, anchored by NoiseFilter."
---

> **Part 1 of 2** in our series on Pathogen's custom filter pipeline. In this post we cover the architecture and ergonomics, anchored by `NoiseFilter`. In [Part 2](./custom-filters-family) we walk through the full family — `GlowFilter`, `EmbossFilter`, `ElevationShadowFilter`, `InnerShadowFilter`, and `PixelateFilter` — with side-by-side parameter sweeps.

**Series:**
1. **Custom Filters in Pathogen: First-Class Visual Effects** ← you are here
2. [The Full Filter Family: Glow, Emboss, Shadows, Pixelate](./custom-filters-family)

## Five primitives, one named value

<mini-workspace src="samples/post25/01-hero-grain.pathogen" caption="Five SVG filter primitives behind a single named value. A NoiseFilter you can reuse across layers, log, override by name, and pass to any layer's filter: style property." code-open></mini-workspace>

That snippet does three things. It defines a custom filter — `NoiseFilter()` with the `Grain` preset — assigns it to a variable, and applies it to a layer via a style block. The output SVG contains a single `<filter>` element wrapping `feTurbulence` → `feComposite` → `feColorMatrix` → `feComponentTransfer` → `feBlend`, plus a `filter="url(#pathogen-noise-1)"` attribute on the painted `<path>`.

Doing this in vanilla SVG means hand-authoring the five-primitive chain along with its filter region, primitive subregions, and blend mode — and re-declaring the whole thing inline every time you want to reuse it. In vanilla CSS the option doesn't exist at all: `filter: blur(...) brightness(...)` covers a fixed set of effects and `filter: drop-shadow(...)` covers exactly one shadow style. Anything richer demands raw `<filter>` markup.

Pathogen's custom filters close that gap by making filters **first-class language values**. Define one, name it, use it like any other variable — the shape of your program stays small, regardless of how rich the effect underneath gets.

## What native CSS leaves on the table

The argument for custom filters isn't that CSS filter functions are bad — `filter: blur(2px) brightness(1.2);` is fine for what it covers — it's that the ergonomic ceiling is low. Specifically:

- **No reuse.** A CSS filter chain is inline text. To apply the same look across three layers, you copy the string three times. Change your mind, change three places.
- **No introspection.** `drop-shadow(2px 4px 6px black)` is an opaque token. There's no way to read back the offset, blur, or color from elsewhere in your program.
- **No presets.** The blur radius is a number; the color is a color. There's no `BlurStyle.Soft` you can swap in.
- **No composition with custom recipes.** If you want noise blended with shadow blended with grain, you're writing a custom `<filter>` def either way.
- **No inset shadows.** `drop-shadow()` is outer-only. Pressed buttons, recessed wells, and engraved-text effects need a different path entirely.
- **No layered depth.** Material Design's depth shadows are three carefully tuned shadow layers stacked under a single elevation knob. `drop-shadow()` gives you one.

Raw SVG `<filter>` solves all of these, but at a steep verbosity cost — you're hand-writing primitive chains, naming intermediate results, and matching `in=`/`in2=` pipes. The expressive ceiling is high; the ergonomic floor is the ground.

## Pathogen filters: define once, reuse, override, introspect

Here's a `NoiseFilter` configured by name, applied to a layer, and asked for its id from elsewhere in the program:

```
let grain = NoiseFilter() {|f|
  f.style = NoiseFilterStyle.Speckle;
  f.amount = 0.6;
  f.blend = BlendMode.SoftLight;
};

log("filter id:", grain.id);     // pathogen-noise-1
log("amount:",    grain.amount); // 0.6

define PathLayer('disc') ${ fill: oklch(70% 0.20 30); filter: grain; }
```

That snippet exercises four ergonomic wins at once:

1. **Trailing-block named overrides.** Inside `{|f| ... }` you assign properties by name. Order doesn't matter, mismatches throw with a clear message, and the IDE knows the property set.
2. **Preset enums.** `NoiseFilterStyle.Speckle` is one of five presets — `Grain`, `Paper`, `Speckle`, `Static`, `Gradient` — each tuned to a specific look. The compiler validates the choice; the IDE autocompletes it.
3. **Auto-wrapping `filter:` style property.** Assigning a `FilterValue` to `filter:` inside a style block resolves to `filter="url(#pathogen-noise-1)"` in the output SVG. No string interpolation, no manual `url(#...)` plumbing.
4. **Read-side property access.** `grain.id`, `grain.amount`, `grain.blend` — every configurable property is also readable. Useful for debug, conditional logic, and downstream computation.

The runtime cost is the same as raw SVG: one `<filter>` def in `<defs>`, one `url(#id)` reference per layer. The difference is everything around the runtime cost — declarable, nameable, reusable, introspectable.

## NoiseFilter — five presets, one shape

`NoiseFilter` ships with five style presets. The primitive chain is the same across all of them; what changes is which `feTurbulence` type runs, which blend mode mixes the result back into the source, and where the defaults for `scale`, `octaves`, `amount`, `monochrome`, `contrast`, and `stitch` land.

<mini-workspace src="samples/post25/02-preset-gallery.pathogen" caption="The five NoiseFilterStyle presets applied to identical discs. Same shape, same fill. Different chain defaults." code-open></mini-workspace>

Each preset is a starting point you tune. `style = NoiseFilterStyle.Grain` gives you filmic grain by default; you can then bump `amount` to make it heavier, set `monochrome = false` to keep color variance in the noise, or override `blend` to switch from `color-burn` to `multiply`. Read the [filters reference](/docs/filters) for the full property list.

### scale — the noise frequency knob

`scale` maps directly to SVG's `baseFrequency`. Higher number means a finer, denser pattern; lower number means larger, coarser features. The `'fine' | 'medium' | 'coarse'` string aliases give you common values without remembering the numeric mapping (`'fine'` = 5.0, `'medium'` = 1.0, `'coarse'` = 0.3).

<mini-workspace src="samples/post25/03-scale-sweep.pathogen" caption="Same disc, same Grain preset. Only scale changes — from coarse pebbles at 0.3 to fine static at 8.0." code-open></mini-workspace>

### amount — visible intensity

`amount` is a 0–1 multiplier on the alpha of the noise pass before it blends with the source. 0 disables the effect entirely; 1 hits full strength. It interacts predictably with `blend`: at `amount = 0.5` you see roughly half the contribution of the chosen blend mode.

<mini-workspace src="samples/post25/04-amount-sweep.pathogen" caption="Grain at four amounts. The chain stays the same; the alpha ramp does the heavy lifting." code-open></mini-workspace>

A note on cost: `octaves` is the number of layered noise frequencies. The presets stay between 2 and 8; values above 8 compound `feTurbulence`'s render cost noticeably on lower-end devices, so reach for that ceiling deliberately.

### monochrome — strip color variance

The `feTurbulence` primitive produces RGB-valued noise by default — different intensities per channel, which reads as faintly colored static. Setting `monochrome = true` inserts an `feColorMatrix` step that maps the noise to a single luminance channel, so the grain reads as pure light-and-dark texture independent of the source fill.

<mini-workspace src="samples/post25/05-monochrome-comparison.pathogen" caption="Same Speckle preset, same seed. monochrome = true (left) reads as flat texture; false (right) preserves the per-channel color variance." code-open></mini-workspace>

## Pairing filters with gradients

Filters apply on top of whatever the layer's `fill` resolved to. That includes Pathogen's gradient values, which means a noisy gradient is just a layer with a gradient fill and a `NoiseFilter` filter — no separate plumbing.

<mini-workspace src="samples/post25/06-gradient-pairing.pathogen" caption="LinearGradient fill plus Grain filter. The grain rides the gradient — and the Gradient preset is tuned for exactly this case, pumping contrast on the noise so it reads through saturated stops." code-open></mini-workspace>

The `Gradient` preset pumps contrast on the noise before the final blend so the grain reads cleanly against saturated gradient stops — without that, the noise would muddy out against the brightest mid-tones. You can apply the same pattern with `Linear`, `Radial`, `Conic`, `Mesh`, or `Freeform` gradients; see the [gradients reference](/docs/gradients) for the full set.

## One filter, many layers — one `<filter>` def

Because a `NoiseFilter` is a value, you can assign it to a `let` once and reference it from as many layers as you want. The output SVG contains exactly one `<filter>` element regardless of reference count — every layer points at the same `url(#pathogen-noise-1)`.

<mini-workspace src="samples/post25/07-reuse-pattern.pathogen" caption="Six layers with different fills, one shared Grain filter. Inspect the compiled SVG: a single <filter> def, six url(#…) references." code-open></mini-workspace>

This is the kind of thing that's tedious to do by hand in raw SVG — you'd be copy-pasting `<filter>` markup, or hand-managing ids, or referencing the wrong one and getting confused output. Pathogen's auto-id machinery generates `pathogen-noise-N` for each call site, and the style-block evaluator wraps the value to `url(#pathogen-noise-N)` at the point of use.

## Introspection: filter values you can log and pass around

Read-side property access is a small thing on the surface and a big thing in practice. You can `log()` a filter's id and seed for debugging, branch on its style in downstream logic, or compose a filter value into another expression.

<mini-workspace src="samples/post25/08-introspection.pathogen" caption="Open the console panel: every configurable property is also readable. The seed is auto-derived from the filter's id; set it explicitly to lock the noise pattern across edits." code-open></mini-workspace>

The auto-derived `seed` is one place where introspection pays off immediately. `NoiseFilter` hashes the filter's id (`pathogen-noise-1`, etc.) into a deterministic seed so the same source program produces the same noise across compiles. Reordering filter declarations shifts the auto-ids — which shifts the seeds — which visibly changes the grain pattern. If you want a specific filter's noise locked down across edits, log the id, then set the seed explicitly:

```
let signature = NoiseFilter() {|f|
  f.style = NoiseFilterStyle.Grain;
  f.seed = 42;   // stable across edits regardless of declaration order
};
```

## What's in Part 2

`NoiseFilter` is the flagship demonstration of the pipeline, but it's one of six custom filters that ship. The other five close specific gaps native CSS can't:

- **`GlowFilter`** — outer halo or inner edge light, picked by a single `mode` property.
- **`EmbossFilter`** — `feSpecularLighting` wrapped into named parameters you can sweep.
- **`ElevationShadowFilter`** — Material-style depth as a single `elevation` knob, layering three shadows for you.
- **`InnerShadowFilter`** — inset shadow. The capability CSS `drop-shadow()` cannot express.
- **`PixelateFilter(w, h, r)`** — mosaic / pixelation; positional or block-style configuration.

[Part 2](./custom-filters-family) walks through each one with side-by-side parameter sweeps. The ergonomic story stays the same — first-class values, named overrides, presets, introspection, reuse — applied to five more visual languages.

For the full reference, see [docs/filters](/docs/filters). To experiment in your browser, open the [playground](/pathogen).

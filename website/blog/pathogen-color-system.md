---
title: "Reactive Color in SVG: From Static Paths to Dynamic Themes"
date: "2026-02-27"
slug: "reactive-color-svg"
description: "How Pathogen's Color system turns SVG into a reactive medium — from OKLCH color manipulation to CSS-variable-driven theming that updates at runtime."
---

SVG is the web's vector format. It lives in the DOM, responds to CSS, and can be styled with custom properties. Yet most tools treat SVG as a static export — a snapshot frozen at build time. Colors baked in. Themes impossible without regeneration.

Pathogen's Color system changes this. By combining a first-class `Color` type with CSS custom properties, Pathogen compiles SVG illustrations that are *reactive* — change a CSS variable at runtime and every derived color updates instantly. No JavaScript. No recompilation. Just CSS doing what CSS does best.

This post walks through the system from first principles, building up from a single color to full light/dark adaptive themes. The demos below are live — pick a color and watch the SVG respond.

## Starting with Color

Color in Pathogen is a first-class type backed by the OKLCH color space. OKLCH stands for **O**kay **L**ightness, **C**hroma, **H**ue — a perceptually uniform color model where equal numeric steps produce equal visual differences. This matters: lightening a red by 0.15 and lightening a blue by 0.15 should look like the same amount of change. In sRGB hex they don't. In OKLCH they do.

Creating a color is straightforward:

```js
let c = Color('#e63946');

// Access OKLCH components
log(c.lightness);  // ~0.52
log(c.chroma);     // ~0.19
log(c.hue);        // ~27

// Output in any format
log(c.hex);   // #e63946
log(c.oklch); // oklch(0.52 0.19 27)
log(c.hsl);   // hsl(355, 78%, 56%)
```

Pathogen accepts any CSS color format as input — hex, `rgb()`, `hsl()`, named colors — and immediately converts to OKLCH internally. From there, all manipulation happens in perceptual space.

You can also construct colors directly in OKLCH:

```js
let sky = Color(0.75, 0.12, 230); // L, C, H
```

## Color Manipulation

Every `Color` value exposes a set of manipulation methods. Each returns a new Color — nothing mutates.

```js
let base = Color('#e63946');

let lighter = base.lighten(0.18);    // bump lightness
let darker  = base.darken(0.18);     // reduce lightness
let vivid   = base.saturate(1.5);    // scale chroma up
let muted   = base.desaturate(0.4);  // scale chroma down
let shifted = base.hueShift(90);     // rotate hue
let comp    = base.complement();     // hue + 180
let semi    = base.alpha(0.5);       // set transparency
let blended = base.mix(Color('#457b9d'), 0.5); // interpolate
```

All of this operates in OKLCH, so a `.lighten(0.18)` on a deeply saturated red doesn't accidentally desaturate it — it shifts only lightness while preserving chroma and hue. Try it: pick a color below and watch each method derive its swatch.

<mini-workspace src="samples/post24/methods-radial.pathogen" caption="Pick a color. Eight OKLCH manipulation methods fan around a central base-color hub — each sector shows the same derivation expression applied to your choice." code-open></mini-workspace>

What makes this reactive? The SVG above was compiled *once*. There is no JavaScript updating colors. The fill values use CSS relative color syntax:

```
fill="oklch(from var(--demo-color, #e63946) calc(l + 0.18) c h)"
```

The browser resolves `var(--demo-color)`, extracts its OKLCH components, applies `calc(l + 0.18)`, and renders. When the color picker updates `--demo-color`, the browser recalculates everything automatically.

## Harmonies and Palettes

Color theory provides recipes for colors that work well together. Pathogen generates these directly:

```js
let base = Color('#e63946');

// Harmony groups
let analog = base.analogous();         // 3 colors: hue -30, 0, +30
let triad  = base.triadic();           // 3 colors: hue 0, +120, +240
let tetrad = base.tetradic();          // 4 colors: hue 0, +90, +180, +270
let split  = base.splitComplementary(); // 3 colors: hue 0, +150, +210
```

Each harmony method returns an array of Colors you can iterate:

```js
for ([color, i] in base.triadic()) {
  define PathLayer(`swatch-${i}`) ${ fill: color; }
  layer(`swatch-${i}`).apply { roundRect(x, y, 40, 40, 6) }
}
```

Palettes go further. `Color.palette()` generates lightness ramps or interpolation sequences:

```js
let ramp  = Color.palette(base, 5);          // 5-step lightness ramp
let blend = Color.palette(base, accent, 5);  // 5-step interpolation
```

The lightness ramp spreads evenly from dark (L=0.15) to light (L=0.95). The interpolation variant uses `color-mix()` when backed by CSS variables, so the browser handles the blending at render time.

<mini-workspace src="samples/post24/harmonies-wheel.pathogen" caption="Pick a base color. The 12-sector hue wheel is the reference; the harmony chord overlays show where analogous, triadic, tetradic, and split-complement partners sit — with live base-derived chips at each vertex." code-open></mini-workspace>

Notice the palette rows. The lightness ramp uses CSS relative color syntax to override the `l` component at fixed steps:

```
fill="oklch(from var(--harmony-color) 0.35 c h)"
```

The interpolation row uses `color-mix()`:

```
fill="color-mix(in oklch, var(--harmony-color), #457b9d 50%)"
```

Both are resolved by the browser at render time. Change the base color and five lightness steps and five interpolation steps recalculate instantly.

## CSSVar: The Reactive Layer

The magic behind these live demos is `CSSVar()` — Pathogen's bridge between compile-time computation and runtime CSS.

```js
let base = Color(CSSVar('--base-color', '#e63946'));
```

This does two things. At compile time, `Color('#e63946')` resolves to an OKLCH value for use in any computation that needs concrete color data. At render time, the SVG references `var(--base-color, #e63946)` — a CSS custom property with a fallback.

When you call methods on a CSSVar-backed Color, Pathogen emits CSS relative color expressions instead of baking the result:

```js
let lighter = base.lighten(0.15);
// Compiled output: oklch(from var(--base-color, #e63946) calc(l + 0.15) c h)

let blended = base.mix(accent, 0.5);
// Compiled output: color-mix(in oklch, var(--base-color), var(--accent-color) 50%)
```

This is the key insight: **compile once, theme at runtime**. A Pathogen source file is compiled to a static SVG that contains no JavaScript. But because colors are expressed as CSS functions referencing custom properties, any container that sets those properties will see the SVG adapt.

The pattern works for entire illustrations. Define a few CSSVar-backed colors, derive everything from them, and the compiled SVG becomes a themeable asset:

```js
let bg      = Color(CSSVar('--bg', '#f5f5f5'));
let primary = Color(CSSVar('--primary', '#e63946'));
let secondary = Color(CSSVar('--secondary', '#457b9d'));
let accent  = Color(CSSVar('--accent', '#2a9d8f'));

// Derived colors — all reactive
let primaryLight  = primary.lighten(0.2);
let primaryDark   = primary.darken(0.15);
let secondaryMuted = secondary.desaturate(0.5);
let accentShift   = accent.hueShift(60);
```

<mini-workspace src="samples/post24/theme-combined.pathogen" caption="Four CSS variables drive one composition twice: the top half shows the theme as a geometric system of relationships; the bottom half shows the same colors as a presentational triptych." code-open></mini-workspace>

This composition has two halves. The top half is a geometric system — a central star (primary), orbiting circles (secondary), corner diamonds plus linking arcs and a halo (accent), all sitting on a dashed reference ring. The bottom half is the same theme as a presentational triptych: primary, secondary, and accent as first-class design elements. The star fill uses `oklch(from var(--primary) calc(l + 0.15) c h)` for a lighter shade, the corner diamonds use `oklch(from var(--accent) l c calc(h + 60))` for a hue-shifted variation, and each triptych card carries auto-contrasting ink against its own fill. One source file, infinite themes.

## @property: Enabling Transitions

When using CSSVar-backed colors, the compiler automatically generates CSS `@property` declarations:

```css
@property --base-color {
  syntax: "<color>";
  inherits: true;
  initial-value: #e63946;
}
```

This tells the browser that `--base-color` is a color, not an arbitrary string. Without `@property`, CSS custom properties are opaque tokens — the browser can't interpolate between `#e63946` and `#457b9d` because it doesn't know they're colors. With `@property`, CSS transitions and animations work on custom properties, meaning you can smoothly animate theme changes:

```css
.svg-container {
  transition: --primary 0.3s ease;
}
```

Pathogen collects these declarations during compilation and embeds them in the SVG's `<style>` block. Each `Color(CSSVar('--name', fallback))` call registers one `@property` rule — first occurrence wins, duplicates are skipped.

## Light/Dark: Adaptive SVGs

Modern CSS has `light-dark()`, a function that resolves to one of two values depending on the document's color scheme. Pathogen exposes this through `Color.lightDark()`:

```js
let fg      = Color.lightDark(Color('#333'), Color('#eee'));
let accent  = Color.lightDark(accent, darkAccent);
```

In the compiled SVG, the fill becomes:

```
fill="light-dark(#333333, #eeeeee)"
```

At compile time, properties like `.hex` and `.lightness` resolve against the light variant so your code can do concrete math. At render time, the browser picks the appropriate value based on the user's `prefers-color-scheme` setting. You can also combine `lightDark()` with `CSSVar()`:

```js
let themed = Color.lightDark(
  Color(CSSVar('--fg-light', '#333')),
  Color(CSSVar('--fg-dark', '#eee'))
);
// Output: light-dark(var(--fg-light, #333), var(--fg-dark, #eee))
```

This gives you theme-aware SVGs that respond to both system preferences and runtime CSS variable overrides — two axes of customization from a single compiled file.

## The Full Picture

Everything comes together in a single composition that tests the whole system against two backgrounds at once. A `ConicGradient` carries the light→dark backdrop across the canvas; seven `radialWedge` chips span both plateaus, so every OKLCH manipulation method reads against both bg states in one view.

```js
let bg_light = Color(CSSVar('--bg-light', '#d0d7f0'));
let bg_dark  = Color(CSSVar('--bg-dark',  '#12131a'));
let base     = Color(CSSVar('--base-color', '#e63946'));

// Backdrop: light plateau (0–40%), 15% transition, dark plateau (55–100%)
let ld = ConicGradient('ld-bg', cx, cy) {|g|
  g.stop(0,    bg_light);
  g.stop(0.4,  bg_light);
  g.stop(0.55, bg_dark);
  g.stop(1,    bg_dark);
};
ld.from = -50deg; ld.to = 50deg;
ld.interpolation = 'oklch';

// Seven derivations, each a radialWedge spanning both plateaus
let methods = [
  base, base.lighten(0.18), base.darken(0.18),
  base.saturate(1.5), base.desaturate(0.4),
  base.hueShift(90), base.complement(),
];
```

<mini-workspace src="samples/post24/lightdark-conic.pathogen" caption="A conic gradient anchors the light/dark backdrop; seven radialWedge chips span both plateaus so every manipulation method reads against both bg states at once." code-open></mini-workspace>

The gradient places each chip in a different angular slice of the bg. Chips near the top sit on the light plateau, chips near the bottom on the dark plateau, and every chip crosses the transition band at its middle — a single-color wedge visibly rendered against the full spectrum. Move the `--base-color` picker and every chip recomputes; move a bg picker and the whole gradient re-interpolates.

Three CSS variables. One gradient. Seven method derivations, each visible against the full light/dark spectrum. Compiled once, reactive forever.

## What This Means

The traditional workflow for themeable SVG is painful: generate variants, swap files, or embed JavaScript to manipulate the DOM. Pathogen's approach eliminates all of that. You write color logic at a high level — harmonies, palettes, lightness ramps — and the compiler translates it into CSS that browsers already know how to execute.

The result is SVG illustration that participates in the web platform's theming infrastructure. Set CSS custom properties from your design system. Let `prefers-color-scheme` drive light and dark variants. Animate color transitions with CSS. No runtime JavaScript needed, no asset pipeline for variants.

SVG was always a dynamic format hiding behind static tooling. The Color system gives it the vocabulary to express what it was designed for.

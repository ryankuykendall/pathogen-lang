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

<reactive-svg vars="--demo-color:#e63946" caption="Pick a color to see 8 manipulation methods applied in real time.">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 350 210" width="350" height="210">
  <style>
    @property --demo-color {
      syntax: "<color>";
      inherits: true;
      initial-value: #e63946;
    }
  </style>
  <rect width="100%" height="100%" fill="#f5f5f5"/>
  <text x="55" y="106" font-family="system-ui, sans-serif" font-size="10" fill="#888" text-anchor="middle">base</text>
  <text x="119" y="106" font-family="system-ui, sans-serif" font-size="10" fill="#888" text-anchor="middle">lighten</text>
  <text x="183" y="106" font-family="system-ui, sans-serif" font-size="10" fill="#888" text-anchor="middle">darken</text>
  <text x="247" y="106" font-family="system-ui, sans-serif" font-size="10" fill="#888" text-anchor="middle">saturate</text>
  <text x="311" y="106" font-family="system-ui, sans-serif" font-size="10" fill="#888" text-anchor="middle">desaturate</text>
  <text x="55" y="196" font-family="system-ui, sans-serif" font-size="10" fill="#888" text-anchor="middle">hueShift</text>
  <text x="119" y="196" font-family="system-ui, sans-serif" font-size="10" fill="#888" text-anchor="middle">complement</text>
  <text x="183" y="196" font-family="system-ui, sans-serif" font-size="10" fill="#888" text-anchor="middle">alpha(0.5)</text>
  <text x="247" y="196" font-family="system-ui, sans-serif" font-size="10" fill="#888" text-anchor="middle">mix</text>
  <path d="M 38 40 L 72 40 Q 80 40 80 48 L 80 82 Q 80 90 72 90 L 38 90 Q 30 90 30 82 L 30 48 Q 30 40 38 40 Z" fill="var(--demo-color, #e63946)" stroke="#ddd" stroke-width="1"/>
  <path d="M 102 40 L 136 40 Q 144 40 144 48 L 144 82 Q 144 90 136 90 L 102 90 Q 94 90 94 82 L 94 48 Q 94 40 102 40 Z" fill="oklch(from var(--demo-color, #e63946) calc(l + 0.18) c h)" stroke="#ddd" stroke-width="1"/>
  <path d="M 166 40 L 200 40 Q 208 40 208 48 L 208 82 Q 208 90 200 90 L 166 90 Q 158 90 158 82 L 158 48 Q 158 40 166 40 Z" fill="oklch(from var(--demo-color, #e63946) calc(l - 0.18) c h)" stroke="#ddd" stroke-width="1"/>
  <path d="M 230 40 L 264 40 Q 272 40 272 48 L 272 82 Q 272 90 264 90 L 230 90 Q 222 90 222 82 L 222 48 Q 222 40 230 40 Z" fill="oklch(from var(--demo-color, #e63946) l calc(c * 1.5) h)" stroke="#ddd" stroke-width="1"/>
  <path d="M 294 40 L 328 40 Q 336 40 336 48 L 336 82 Q 336 90 328 90 L 294 90 Q 286 90 286 82 L 286 48 Q 286 40 294 40 Z" fill="oklch(from var(--demo-color, #e63946) l calc(c * 0.4) h)" stroke="#ddd" stroke-width="1"/>
  <path d="M 38 130 L 72 130 Q 80 130 80 138 L 80 172 Q 80 180 72 180 L 38 180 Q 30 180 30 172 L 30 138 Q 30 130 38 130 Z" fill="oklch(from var(--demo-color, #e63946) l c calc(h + 90))" stroke="#ddd" stroke-width="1"/>
  <path d="M 102 130 L 136 130 Q 144 130 144 138 L 144 172 Q 144 180 136 180 L 102 180 Q 94 180 94 172 L 94 138 Q 94 130 102 130 Z" fill="oklch(from var(--demo-color, #e63946) l c calc(h + 180))" stroke="#ddd" stroke-width="1"/>
  <path d="M 166 130 L 200 130 Q 208 130 208 138 L 208 172 Q 208 180 200 180 L 166 180 Q 158 180 158 172 L 158 138 Q 158 130 166 130 Z" fill="oklch(from var(--demo-color, #e63946) l c h / 0.5)" stroke="#ddd" stroke-width="1"/>
  <path d="M 230 130 L 264 130 Q 272 130 272 138 L 272 172 Q 272 180 264 180 L 230 180 Q 222 180 222 172 L 222 138 Q 222 130 230 130 Z" fill="color-mix(in oklch, var(--demo-color, #e63946), #457b9d 50%)" stroke="#ddd" stroke-width="1"/>
</svg>
</reactive-svg>

<p style="text-align:right;margin-top:-0.5rem;font-size:0.8125rem"><a href="#src-color-methods"><em>view full source</em></a></p>

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

<reactive-svg vars="--harmony-color:#e63946" caption="Pick a base color to generate harmonies and palettes.">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 450" width="460" height="450">
  <style>
    @property --harmony-color {
      syntax: "<color>";
      inherits: true;
      initial-value: #e63946;
    }
  </style>
  <rect width="100%" height="100%" fill="#f5f5f5"/>
  <text x="20" y="74" font-family="system-ui, sans-serif" font-size="11" fill="#777">analogous</text>
  <text x="20" y="132" font-family="system-ui, sans-serif" font-size="11" fill="#777">triadic</text>
  <text x="20" y="190" font-family="system-ui, sans-serif" font-size="11" fill="#777">tetradic</text>
  <text x="20" y="248" font-family="system-ui, sans-serif" font-size="11" fill="#777">splitComp</text>
  <text x="20" y="354" font-family="system-ui, sans-serif" font-size="11" fill="#777">lightness</text>
  <text x="20" y="412" font-family="system-ui, sans-serif" font-size="11" fill="#777">interpolate</text>
  <text x="20" y="28" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#555">Harmonies</text>
  <text x="20" y="306" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#555">Palettes</text>
  <path d="M 146 50 L 174 50 Q 180 50 180 56 L 180 84 Q 180 90 174 90 L 146 90 Q 140 90 140 84 L 140 56 Q 140 50 146 50 Z" fill="oklch(from var(--harmony-color, #e63946) l c calc(h + -30))" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 198 50 L 226 50 Q 232 50 232 56 L 232 84 Q 232 90 226 90 L 198 90 Q 192 90 192 84 L 192 56 Q 192 50 198 50 Z" fill="var(--harmony-color, #e63946)" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 250 50 L 278 50 Q 284 50 284 56 L 284 84 Q 284 90 278 90 L 250 90 Q 244 90 244 84 L 244 56 Q 244 50 250 50 Z" fill="oklch(from var(--harmony-color, #e63946) l c calc(h + 30))" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 146 108 L 174 108 Q 180 108 180 114 L 180 142 Q 180 148 174 148 L 146 148 Q 140 148 140 142 L 140 114 Q 140 108 146 108 Z" fill="var(--harmony-color, #e63946)" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 198 108 L 226 108 Q 232 108 232 114 L 232 142 Q 232 148 226 148 L 198 148 Q 192 148 192 142 L 192 114 Q 192 108 198 108 Z" fill="oklch(from var(--harmony-color, #e63946) l c calc(h + 120))" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 250 108 L 278 108 Q 284 108 284 114 L 284 142 Q 284 148 278 148 L 250 148 Q 244 148 244 142 L 244 114 Q 244 108 250 108 Z" fill="oklch(from var(--harmony-color, #e63946) l c calc(h + 240))" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 146 166 L 174 166 Q 180 166 180 172 L 180 200 Q 180 206 174 206 L 146 206 Q 140 206 140 200 L 140 172 Q 140 166 146 166 Z" fill="var(--harmony-color, #e63946)" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 198 166 L 226 166 Q 232 166 232 172 L 232 200 Q 232 206 226 206 L 198 206 Q 192 206 192 200 L 192 172 Q 192 166 198 166 Z" fill="oklch(from var(--harmony-color, #e63946) l c calc(h + 90))" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 250 166 L 278 166 Q 284 166 284 172 L 284 200 Q 284 206 278 206 L 250 206 Q 244 206 244 200 L 244 172 Q 244 166 250 166 Z" fill="oklch(from var(--harmony-color, #e63946) l c calc(h + 180))" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 302 166 L 330 166 Q 336 166 336 172 L 336 200 Q 336 206 330 206 L 302 206 Q 296 206 296 200 L 296 172 Q 296 166 302 166 Z" fill="oklch(from var(--harmony-color, #e63946) l c calc(h + 270))" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 146 224 L 174 224 Q 180 224 180 230 L 180 258 Q 180 264 174 264 L 146 264 Q 140 264 140 258 L 140 230 Q 140 224 146 224 Z" fill="var(--harmony-color, #e63946)" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 198 224 L 226 224 Q 232 224 232 230 L 232 258 Q 232 264 226 264 L 198 264 Q 192 264 192 258 L 192 230 Q 192 224 198 224 Z" fill="oklch(from var(--harmony-color, #e63946) l c calc(h + 150))" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 250 224 L 278 224 Q 284 224 284 230 L 284 258 Q 284 264 278 264 L 250 264 Q 244 264 244 258 L 244 230 Q 244 224 250 224 Z" fill="oklch(from var(--harmony-color, #e63946) l c calc(h + 210))" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 20 282 L 440 282" fill="none" stroke="#e0e0e0" stroke-width="1"/>
  <path d="M 146 330 L 174 330 Q 180 330 180 336 L 180 364 Q 180 370 174 370 L 146 370 Q 140 370 140 364 L 140 336 Q 140 330 146 330 Z" fill="oklch(from var(--harmony-color, #e63946) 0.15 c h)" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 198 330 L 226 330 Q 232 330 232 336 L 232 364 Q 232 370 226 370 L 198 370 Q 192 370 192 364 L 192 336 Q 192 330 198 330 Z" fill="oklch(from var(--harmony-color, #e63946) 0.35 c h)" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 250 330 L 278 330 Q 284 330 284 336 L 284 364 Q 284 370 278 370 L 250 370 Q 244 370 244 364 L 244 336 Q 244 330 250 330 Z" fill="oklch(from var(--harmony-color, #e63946) 0.55 c h)" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 302 330 L 330 330 Q 336 330 336 336 L 336 364 Q 336 370 330 370 L 302 370 Q 296 370 296 364 L 296 336 Q 296 330 302 330 Z" fill="oklch(from var(--harmony-color, #e63946) 0.75 c h)" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 354 330 L 382 330 Q 388 330 388 336 L 388 364 Q 388 370 382 370 L 354 370 Q 348 370 348 364 L 348 336 Q 348 330 354 330 Z" fill="oklch(from var(--harmony-color, #e63946) 0.95 c h)" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 146 388 L 174 388 Q 180 388 180 394 L 180 422 Q 180 428 174 428 L 146 428 Q 140 428 140 422 L 140 394 Q 140 388 146 388 Z" fill="color-mix(in oklch, var(--harmony-color, #e63946), #457b9d 0%)" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 198 388 L 226 388 Q 232 388 232 394 L 232 422 Q 232 428 226 428 L 198 428 Q 192 428 192 422 L 192 394 Q 192 388 198 388 Z" fill="color-mix(in oklch, var(--harmony-color, #e63946), #457b9d 25%)" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 250 388 L 278 388 Q 284 388 284 394 L 284 422 Q 284 428 278 428 L 250 428 Q 244 428 244 422 L 244 394 Q 244 388 250 388 Z" fill="color-mix(in oklch, var(--harmony-color, #e63946), #457b9d 50%)" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 302 388 L 330 388 Q 336 388 336 394 L 336 422 Q 336 428 330 428 L 302 428 Q 296 428 296 422 L 296 394 Q 296 388 302 388 Z" fill="color-mix(in oklch, var(--harmony-color, #e63946), #457b9d 75%)" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 354 388 L 382 388 Q 388 388 388 394 L 388 422 Q 388 428 382 428 L 354 428 Q 348 428 348 422 L 348 394 Q 348 388 354 388 Z" fill="color-mix(in oklch, var(--harmony-color, #e63946), #457b9d 100%)" stroke="#ddd" stroke-width="0.5"/>
</svg>
</reactive-svg>

<p style="text-align:right;margin-top:-0.5rem;font-size:0.8125rem"><a href="#src-harmonies"><em>view full source</em></a></p>

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

<reactive-svg vars="--bg:#f5f5f5;--primary:#e63946;--secondary:#457b9d;--accent:#2a9d8f" caption="Four color pickers control an entire illustration. Derived colors update automatically.">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 260" width="500" height="260">
  <style>
    @property --bg {
      syntax: "<color>";
      inherits: true;
      initial-value: #f5f5f5;
    }
    @property --primary {
      syntax: "<color>";
      inherits: true;
      initial-value: #e63946;
    }
    @property --secondary {
      syntax: "<color>";
      inherits: true;
      initial-value: #457b9d;
    }
    @property --accent {
      syntax: "<color>";
      inherits: true;
      initial-value: #2a9d8f;
    }
  </style>
  <rect width="100%" height="100%" fill="#f5f5f5"/>
  <path d="M 0 0 L 500 0 L 500 260 L 0 260 Z" fill="var(--bg, #f5f5f5)" stroke="none" stroke-width="2"/>
  <path d="M 250 75 L 266.45798706418924 107.34752415750147 L 302.3081083962334 113.00406530937789 L 276.6295824562643 138.65247584249852 L 282.328188876086 174.4959346906221 L 250 158 L 217.67181112391398 174.4959346906221 L 223.3704175437357 138.65247584249852 L 197.69189160376655 113.00406530937789 L 233.54201293581076 107.34752415750148 Z" fill="oklch(from var(--primary, #e63946) calc(l + 0.2) c h)" stroke="var(--primary, #e63946)" stroke-width="2" stroke-linejoin="round"/>
  <path d="M 336 130 A 14 14 0 1 1 364 130 A 14 14 0 1 1 336 130 M 236 200 A 14 14 0 1 1 264 200 A 14 14 0 1 1 236 200 M 136 130 A 14 14 0 1 1 164 130 A 14 14 0 1 1 136 130 M 235.99999999999997 60 A 14 14 0 1 1 264 60 A 14 14 0 1 1 235.99999999999997 60 M 336 129.99999999999997 A 14 14 0 1 1 364 129.99999999999997 A 14 14 0 1 1 336 129.99999999999997" fill="oklch(from var(--secondary, #457b9d) l calc(c * 0.5) h)" stroke="var(--secondary, #457b9d)" stroke-width="1.5"/>
  <path d="M 40 22 L 58 40 L 40 58 L 22 40 Z M 460 22 L 478 40 L 460 58 L 442 40 Z M 40 202 L 58 220 L 40 238 L 22 220 Z M 460 202 L 478 220 L 460 238 L 442 220 Z" fill="oklch(from var(--accent, #2a9d8f) l c calc(h + 60))" stroke="var(--accent, #2a9d8f)" stroke-width="1"/>
  <path d="M 70 130 A 40 40 0 0 1 110 130 M 390 130 A 40 40 0 0 1 430 130" fill="none" stroke="oklch(from var(--primary, #e63946) calc(l - 0.15) c h)" stroke-width="2" stroke-linecap="round"/>
  <path d="M 208 130 A 42 42 0 1 1 292 130 A 42 42 0 1 1 208 130" fill="none" stroke="var(--accent, #2a9d8f)" stroke-width="1" stroke-dasharray="4 3"/>
</svg>
</reactive-svg>

<p style="text-align:right;margin-top:-0.5rem;font-size:0.8125rem"><a href="#src-theme"><em>view full source</em></a></p>

This SVG has a central star (primary), orbiting circles (secondary), corner diamonds (accent), and a background — all themeable from four CSS variables. The star fill uses `oklch(from var(--primary) calc(l + 0.2) c h)` for a lighter shade, the corner diamond fills use `oklch(from var(--accent) l c calc(h + 60))` for a hue-shifted variation. One source file, infinite themes.

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

Everything comes together in a comprehensive swatch showcase. Three CSSVar-backed colors generate an entire dual-panel visualization: methods, harmonies, palettes, and theme-aware colors, rendered side by side for light and dark contexts.

```js
let base       = Color(CSSVar('--base-color', '#e63946'));
let accent     = Color(CSSVar('--accent-color', '#457b9d'));
let darkAccent = Color(CSSVar('--dark-accent', '#f4a261'));

// Light panel: derive from base
let lighter = base.lighten(0.15);
let darker  = base.darken(0.15);
let triad   = base.triadic();
let ramp    = Color.palette(base, accent, 5);

// Dark panel: derive from darkAccent
let dkTriad = darkAccent.triadic();
let dkRamp  = Color.palette(darkAccent, base, 5);

// Theme-aware colors
let themeFg     = Color.lightDark(Color('#333'), Color('#eee'));
let themeAccent = Color.lightDark(accent, darkAccent);
```

<reactive-svg vars="--base-color:#e63946;--accent-color:#457b9d;--dark-accent:#f4a261" caption="Three colors drive a dual-panel showcase: methods, harmonies, palettes, and light-dark adaptive colors.">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 570 340" width="570" height="340">
  <style>
    @property --base-color {
      syntax: "<color>";
      inherits: true;
      initial-value: #e63946;
    }
    @property --accent-color {
      syntax: "<color>";
      inherits: true;
      initial-value: #457b9d;
    }
    @property --dark-accent {
      syntax: "<color>";
      inherits: true;
      initial-value: #f4a261;
    }
  </style>
  <rect width="100%" height="100%" fill="#f5f5f5"/>
  <path d="M 0 0 L 280 0 Q 280 0 280 0 L 280 340 Q 280 340 280 340 L 0 340 Q 0 340 0 340 L 0 0 Q 0 0 0 0 Z" fill="#f5f5f5" stroke="none" stroke-width="2"/>
  <path d="M 290 0 L 570 0 Q 570 0 570 0 L 570 340 Q 570 340 570 340 L 290 340 Q 290 340 290 340 L 290 0 Q 290 0 290 0 Z" fill="#222266" stroke="none" stroke-width="2"/>
  <text x="8" y="18" font-family="system-ui, sans-serif" font-size="9" font-weight="bold" fill="#555">Methods</text>
  <text x="8" y="86" font-family="system-ui, sans-serif" font-size="9" font-weight="bold" fill="#555">Triadic</text>
  <text x="8" y="146" font-family="system-ui, sans-serif" font-size="9" font-weight="bold" fill="#555">Palette</text>
  <text x="8" y="210" font-family="system-ui, sans-serif" font-size="9" font-weight="bold" fill="#555">lightDark()</text>
  <text x="26" y="56" font-family="system-ui, sans-serif" font-size="7" fill="#888" text-anchor="middle">base</text>
  <text x="55" y="56" font-family="system-ui, sans-serif" font-size="7" fill="#888" text-anchor="middle">light</text>
  <text x="84" y="56" font-family="system-ui, sans-serif" font-size="7" fill="#888" text-anchor="middle">dark</text>
  <text x="113" y="56" font-family="system-ui, sans-serif" font-size="7" fill="#888" text-anchor="middle">vivid</text>
  <text x="142" y="56" font-family="system-ui, sans-serif" font-size="7" fill="#888" text-anchor="middle">muted</text>
  <text x="171" y="56" font-family="system-ui, sans-serif" font-size="7" fill="#888" text-anchor="middle">shift</text>
  <text x="200" y="56" font-family="system-ui, sans-serif" font-size="7" fill="#888" text-anchor="middle">compl</text>
  <text x="26" y="248" font-family="system-ui, sans-serif" font-size="7" fill="#888" text-anchor="middle">fg</text>
  <text x="55" y="248" font-family="system-ui, sans-serif" font-size="7" fill="#888" text-anchor="middle">accent</text>
  <text x="298" y="18" font-family="system-ui, sans-serif" font-size="9" font-weight="bold" fill="#aab">Methods</text>
  <text x="298" y="86" font-family="system-ui, sans-serif" font-size="9" font-weight="bold" fill="#aab">Triadic</text>
  <text x="298" y="146" font-family="system-ui, sans-serif" font-size="9" font-weight="bold" fill="#aab">Palette</text>
  <text x="298" y="210" font-family="system-ui, sans-serif" font-size="9" font-weight="bold" fill="#aab">lightDark()</text>
  <text x="316" y="56" font-family="system-ui, sans-serif" font-size="7" fill="#889" text-anchor="middle">base</text>
  <text x="345" y="56" font-family="system-ui, sans-serif" font-size="7" fill="#889" text-anchor="middle">light</text>
  <text x="374" y="56" font-family="system-ui, sans-serif" font-size="7" fill="#889" text-anchor="middle">dark</text>
  <text x="403" y="56" font-family="system-ui, sans-serif" font-size="7" fill="#889" text-anchor="middle">vivid</text>
  <text x="432" y="56" font-family="system-ui, sans-serif" font-size="7" fill="#889" text-anchor="middle">muted</text>
  <text x="461" y="56" font-family="system-ui, sans-serif" font-size="7" fill="#889" text-anchor="middle">shift</text>
  <text x="490" y="56" font-family="system-ui, sans-serif" font-size="7" fill="#889" text-anchor="middle">compl</text>
  <text x="316" y="248" font-family="system-ui, sans-serif" font-size="7" fill="#889" text-anchor="middle">fg</text>
  <text x="345" y="248" font-family="system-ui, sans-serif" font-size="7" fill="#889" text-anchor="middle">accent</text>
  <path d="M 17 24 L 35 24 Q 38 24 38 27 L 38 43 Q 38 46 35 46 L 17 46 Q 14 46 14 43 L 14 27 Q 14 24 17 24 Z" fill="var(--base-color, #e63946)" stroke="#ccc" stroke-width="0.5"/>
  <path d="M 46 24 L 64 24 Q 67 24 67 27 L 67 43 Q 67 46 64 46 L 46 46 Q 43 46 43 43 L 43 27 Q 43 24 46 24 Z" fill="oklch(from var(--base-color, #e63946) calc(l + 0.15) c h)" stroke="#ccc" stroke-width="0.5"/>
  <path d="M 75 24 L 93 24 Q 96 24 96 27 L 96 43 Q 96 46 93 46 L 75 46 Q 72 46 72 43 L 72 27 Q 72 24 75 24 Z" fill="oklch(from var(--base-color, #e63946) calc(l - 0.15) c h)" stroke="#ccc" stroke-width="0.5"/>
  <path d="M 104 24 L 122 24 Q 125 24 125 27 L 125 43 Q 125 46 122 46 L 104 46 Q 101 46 101 43 L 101 27 Q 101 24 104 24 Z" fill="oklch(from var(--base-color, #e63946) l calc(c * 1.4) h)" stroke="#ccc" stroke-width="0.5"/>
  <path d="M 133 24 L 151 24 Q 154 24 154 27 L 154 43 Q 154 46 151 46 L 133 46 Q 130 46 130 43 L 130 27 Q 130 24 133 24 Z" fill="oklch(from var(--base-color, #e63946) l calc(c * 0.5) h)" stroke="#ccc" stroke-width="0.5"/>
  <path d="M 162 24 L 180 24 Q 183 24 183 27 L 183 43 Q 183 46 180 46 L 162 46 Q 159 46 159 43 L 159 27 Q 159 24 162 24 Z" fill="oklch(from var(--base-color, #e63946) l c calc(h + 60))" stroke="#ccc" stroke-width="0.5"/>
  <path d="M 191 24 L 209 24 Q 212 24 212 27 L 212 43 Q 212 46 209 46 L 191 46 Q 188 46 188 43 L 188 27 Q 188 24 191 24 Z" fill="oklch(from var(--base-color, #e63946) l c calc(h + 180))" stroke="#ccc" stroke-width="0.5"/>
  <path d="M 8 70 L 272 70 M 8 130 L 272 130 M 8 194 L 272 194" fill="none" stroke="#ddd" stroke-width="0.5"/>
  <path d="M 17 92 L 35 92 Q 38 92 38 95 L 38 111 Q 38 114 35 114 L 17 114 Q 14 114 14 111 L 14 95 Q 14 92 17 92 Z" fill="var(--base-color, #e63946)" stroke="#ccc" stroke-width="0.5"/>
  <path d="M 46 92 L 64 92 Q 67 92 67 95 L 67 111 Q 67 114 64 114 L 46 114 Q 43 114 43 111 L 43 95 Q 43 92 46 92 Z" fill="oklch(from var(--base-color, #e63946) l c calc(h + 120))" stroke="#ccc" stroke-width="0.5"/>
  <path d="M 75 92 L 93 92 Q 96 92 96 95 L 96 111 Q 96 114 93 114 L 75 114 Q 72 114 72 111 L 72 95 Q 72 92 75 92 Z" fill="oklch(from var(--base-color, #e63946) l c calc(h + 240))" stroke="#ccc" stroke-width="0.5"/>
  <path d="M 17 152 L 35 152 Q 38 152 38 155 L 38 171 Q 38 174 35 174 L 17 174 Q 14 174 14 171 L 14 155 Q 14 152 17 152 Z" fill="color-mix(in oklch, var(--base-color, #e63946), var(--accent-color, #457b9d) 0%)" stroke="#ccc" stroke-width="0.5"/>
  <path d="M 46 152 L 64 152 Q 67 152 67 155 L 67 171 Q 67 174 64 174 L 46 174 Q 43 174 43 171 L 43 155 Q 43 152 46 152 Z" fill="color-mix(in oklch, var(--base-color, #e63946), var(--accent-color, #457b9d) 25%)" stroke="#ccc" stroke-width="0.5"/>
  <path d="M 75 152 L 93 152 Q 96 152 96 155 L 96 171 Q 96 174 93 174 L 75 174 Q 72 174 72 171 L 72 155 Q 72 152 75 152 Z" fill="color-mix(in oklch, var(--base-color, #e63946), var(--accent-color, #457b9d) 50%)" stroke="#ccc" stroke-width="0.5"/>
  <path d="M 104 152 L 122 152 Q 125 152 125 155 L 125 171 Q 125 174 122 174 L 104 174 Q 101 174 101 171 L 101 155 Q 101 152 104 152 Z" fill="color-mix(in oklch, var(--base-color, #e63946), var(--accent-color, #457b9d) 75%)" stroke="#ccc" stroke-width="0.5"/>
  <path d="M 133 152 L 151 152 Q 154 152 154 155 L 154 171 Q 154 174 151 174 L 133 174 Q 130 174 130 171 L 130 155 Q 130 152 133 152 Z" fill="color-mix(in oklch, var(--base-color, #e63946), var(--accent-color, #457b9d) 100%)" stroke="#ccc" stroke-width="0.5"/>
  <path d="M 17 216 L 35 216 Q 38 216 38 219 L 38 235 Q 38 238 35 238 L 17 238 Q 14 238 14 235 L 14 219 Q 14 216 17 216 Z" fill="light-dark(#333333, #eeeeee)" stroke="#ccc" stroke-width="0.5"/>
  <path d="M 46 216 L 64 216 Q 67 216 67 219 L 67 235 Q 67 238 64 238 L 46 238 Q 43 238 43 235 L 43 219 Q 43 216 46 216 Z" fill="light-dark(var(--accent-color, #457b9d), var(--dark-accent, #f4a261))" stroke="#ccc" stroke-width="0.5"/>
  <path d="M 307 24 L 325 24 Q 328 24 328 27 L 328 43 Q 328 46 325 46 L 307 46 Q 304 46 304 43 L 304 27 Q 304 24 307 24 Z" fill="var(--dark-accent, #f4a261)" stroke="#444" stroke-width="0.5"/>
  <path d="M 336 24 L 354 24 Q 357 24 357 27 L 357 43 Q 357 46 354 46 L 336 46 Q 333 46 333 43 L 333 27 Q 333 24 336 24 Z" fill="oklch(from var(--dark-accent, #f4a261) calc(l + 0.15) c h)" stroke="#444" stroke-width="0.5"/>
  <path d="M 365 24 L 383 24 Q 386 24 386 27 L 386 43 Q 386 46 383 46 L 365 46 Q 362 46 362 43 L 362 27 Q 362 24 365 24 Z" fill="oklch(from var(--dark-accent, #f4a261) calc(l - 0.15) c h)" stroke="#444" stroke-width="0.5"/>
  <path d="M 394 24 L 412 24 Q 415 24 415 27 L 415 43 Q 415 46 412 46 L 394 46 Q 391 46 391 43 L 391 27 Q 391 24 394 24 Z" fill="oklch(from var(--dark-accent, #f4a261) l calc(c * 1.4) h)" stroke="#444" stroke-width="0.5"/>
  <path d="M 423 24 L 441 24 Q 444 24 444 27 L 444 43 Q 444 46 441 46 L 423 46 Q 420 46 420 43 L 420 27 Q 420 24 423 24 Z" fill="oklch(from var(--dark-accent, #f4a261) l calc(c * 0.5) h)" stroke="#444" stroke-width="0.5"/>
  <path d="M 452 24 L 470 24 Q 473 24 473 27 L 473 43 Q 473 46 470 46 L 452 46 Q 449 46 449 43 L 449 27 Q 449 24 452 24 Z" fill="oklch(from var(--dark-accent, #f4a261) l c calc(h + 60))" stroke="#444" stroke-width="0.5"/>
  <path d="M 481 24 L 499 24 Q 502 24 502 27 L 502 43 Q 502 46 499 46 L 481 46 Q 478 46 478 43 L 478 27 Q 478 24 481 24 Z" fill="oklch(from var(--dark-accent, #f4a261) l c calc(h + 180))" stroke="#444" stroke-width="0.5"/>
  <path d="M 298 70 L 562 70 M 298 130 L 562 130 M 298 194 L 562 194" fill="none" stroke="#445" stroke-width="0.5"/>
  <path d="M 307 92 L 325 92 Q 328 92 328 95 L 328 111 Q 328 114 325 114 L 307 114 Q 304 114 304 111 L 304 95 Q 304 92 307 92 Z" fill="var(--dark-accent, #f4a261)" stroke="#444" stroke-width="0.5"/>
  <path d="M 336 92 L 354 92 Q 357 92 357 95 L 357 111 Q 357 114 354 114 L 336 114 Q 333 114 333 111 L 333 95 Q 333 92 336 92 Z" fill="oklch(from var(--dark-accent, #f4a261) l c calc(h + 120))" stroke="#444" stroke-width="0.5"/>
  <path d="M 365 92 L 383 92 Q 386 92 386 95 L 386 111 Q 386 114 383 114 L 365 114 Q 362 114 362 111 L 362 95 Q 362 92 365 92 Z" fill="oklch(from var(--dark-accent, #f4a261) l c calc(h + 240))" stroke="#444" stroke-width="0.5"/>
  <path d="M 307 152 L 325 152 Q 328 152 328 155 L 328 171 Q 328 174 325 174 L 307 174 Q 304 174 304 171 L 304 155 Q 304 152 307 152 Z" fill="color-mix(in oklch, var(--dark-accent, #f4a261), var(--base-color, #e63946) 0%)" stroke="#444" stroke-width="0.5"/>
  <path d="M 336 152 L 354 152 Q 357 152 357 155 L 357 171 Q 357 174 354 174 L 336 174 Q 333 174 333 171 L 333 155 Q 333 152 336 152 Z" fill="color-mix(in oklch, var(--dark-accent, #f4a261), var(--base-color, #e63946) 25%)" stroke="#444" stroke-width="0.5"/>
  <path d="M 365 152 L 383 152 Q 386 152 386 155 L 386 171 Q 386 174 383 174 L 365 174 Q 362 174 362 171 L 362 155 Q 362 152 365 152 Z" fill="color-mix(in oklch, var(--dark-accent, #f4a261), var(--base-color, #e63946) 50%)" stroke="#444" stroke-width="0.5"/>
  <path d="M 394 152 L 412 152 Q 415 152 415 155 L 415 171 Q 415 174 412 174 L 394 174 Q 391 174 391 171 L 391 155 Q 391 152 394 152 Z" fill="color-mix(in oklch, var(--dark-accent, #f4a261), var(--base-color, #e63946) 75%)" stroke="#444" stroke-width="0.5"/>
  <path d="M 423 152 L 441 152 Q 444 152 444 155 L 444 171 Q 444 174 441 174 L 423 174 Q 420 174 420 171 L 420 155 Q 420 152 423 152 Z" fill="color-mix(in oklch, var(--dark-accent, #f4a261), var(--base-color, #e63946) 100%)" stroke="#444" stroke-width="0.5"/>
  <path d="M 307 216 L 325 216 Q 328 216 328 219 L 328 235 Q 328 238 325 238 L 307 238 Q 304 238 304 235 L 304 219 Q 304 216 307 216 Z" fill="light-dark(#333333, #eeeeee)" stroke="#555" stroke-width="0.5"/>
  <path d="M 336 216 L 354 216 Q 357 216 357 219 L 357 235 Q 357 238 354 238 L 336 238 Q 333 238 333 235 L 333 219 Q 333 216 336 216 Z" fill="light-dark(var(--accent-color, #457b9d), var(--dark-accent, #f4a261))" stroke="#555" stroke-width="0.5"/>
  <text x="140" y="330" font-family="system-ui, sans-serif" font-size="9" font-weight="bold" fill="#bbb" text-anchor="middle">LIGHT</text>
  <text x="430" y="330" font-family="system-ui, sans-serif" font-size="9" font-weight="bold" fill="#557" text-anchor="middle">DARK</text>
</svg>
</reactive-svg>

<p style="text-align:right;margin-top:-0.5rem;font-size:0.8125rem"><a href="#src-swatches"><em>view full source</em></a></p>

The light panel derives from `--base-color`, the dark panel from `--dark-accent`. The palette rows use `color-mix()` to interpolate between the panel's base and the other panel's color. The `lightDark()` row shows theme-aware colors that automatically switch based on system color scheme preference.

Three CSS variables. Two panels. Seven method variants, three harmony colors, five palette steps, and two theme-adaptive colors per panel. All compiled from a single Pathogen source file, all reactive at runtime.

## What This Means

The traditional workflow for themeable SVG is painful: generate variants, swap files, or embed JavaScript to manipulate the DOM. Pathogen's approach eliminates all of that. You write color logic at a high level — harmonies, palettes, lightness ramps — and the compiler translates it into CSS that browsers already know how to execute.

The result is SVG illustration that participates in the web platform's theming infrastructure. Set CSS custom properties from your design system. Let `prefers-color-scheme` drive light and dark variants. Animate color transitions with CSS. No runtime JavaScript needed, no asset pipeline for variants.

SVG was always a dynamic format hiding behind static tooling. The Color system gives it the vocabulary to express what it was designed for.

---

## View All Sources

The Pathogen source files that produce the interactive demos above. Each is compiled once to a static SVG containing CSS `var()` references — the color pickers simply set CSS custom properties on the container.

<h3 id="src-color-methods">Color Methods Demo</h3>

Produces the [manipulation swatches](#color-manipulation) — one CSSVar-backed color, eight derived swatches.

```js
// Color Methods Demo — base color → 8 derived swatches
// CSSVar-backed for reactive color picker updates

let base = Color(CSSVar('--demo-color', '#e63946'));

let lighter   = base.lighten(0.18);
let darker    = base.darken(0.18);
let vivid     = base.saturate(1.5);
let muted     = base.desaturate(0.4);
let shifted   = base.hueShift(90);
let comp      = base.complement();
let semi      = base.alpha(0.5);
let mixed     = base.mix(Color('#457b9d'), 0.5);

// Layout
let sw = 50;
let sh = 50;
let sr = 8;
let gap = 14;
let startX = 30;
let row1Y = 40;
let row2Y = 130;

// Row 1: base + lighten, darken, saturate, desaturate
let row1 = [base, lighter, darker, vivid, muted];
let row1names = ['base', 'lighten', 'darken', 'saturate', 'desaturate'];

define TextLayer('labels') ${
  font-family: system-ui, sans-serif;
  font-size: 10;
  fill: #888;
  text-anchor: middle;
}

for ([color, i] in row1) {
  let x = calc(startX + i * (sw + gap));
  define PathLayer(`r1_${i}`) ${ fill: color; stroke: #ddd; stroke-width: 1; }
  layer(`r1_${i}`).apply { roundRect(x, row1Y, sw, sh, sr) }
}

layer('labels').apply {
  for ([name, i] in row1names) {
    text(calc(startX + i * (sw + gap) + sw / 2), calc(row1Y + sh + 16))`${name}`
  }
}

// Row 2: hueShift, complement, alpha, mix
let row2 = [shifted, comp, semi, mixed];
let row2names = ['hueShift', 'complement', 'alpha(0.5)', 'mix'];

for ([color, i] in row2) {
  let x = calc(startX + i * (sw + gap));
  define PathLayer(`r2_${i}`) ${ fill: color; stroke: #ddd; stroke-width: 1; }
  layer(`r2_${i}`).apply { roundRect(x, row2Y, sw, sh, sr) }
}

layer('labels').apply {
  for ([name, i] in row2names) {
    text(calc(startX + i * (sw + gap) + sw / 2), calc(row2Y + sh + 16))`${name}`
  }
}
```

<h3 id="src-harmonies">Harmonies and Palettes Demo</h3>

Produces the [harmony and palette rows](#harmonies-and-palettes) — four harmony types plus lightness ramp and color interpolation.

```js
// Harmonies Demo — base color → harmony rows + palette rows
// CSSVar-backed for reactive color picker updates

let base = Color(CSSVar('--harmony-color', '#e63946'));

// Harmonies
let analog = base.analogous();
let triad  = base.triadic();
let tetrad = base.tetradic();
let split  = base.splitComplementary();

// Palettes
let ramp   = Color.palette(base, 5);
let interp = Color.palette(base, Color('#457b9d'), 5);

// Layout
let sw = 40;
let sh = 40;
let sr = 6;
let gap = 12;
let startX = 140;
let labelX = 20;

define TextLayer('labels') ${
  font-family: system-ui, sans-serif;
  font-size: 11;
  fill: #777;
}

define TextLayer('section') ${
  font-family: system-ui, sans-serif;
  font-size: 13;
  font-weight: bold;
  fill: #555;
}

// Section: Harmonies
layer('section').apply { text(labelX, 28)`Harmonies` }

let rows = [analog, triad, tetrad, split];
let rowNames = ['analogous', 'triadic', 'tetradic', 'splitComp'];
let rowYs = [50, 108, 166, 224];

for ([harmony, ri] in rows) {
  let y = rowYs[ri];
  layer('labels').apply { text(labelX, calc(y + sw / 2 + 4))`${rowNames[ri]}` }
  for ([color, ci] in harmony) {
    let x = calc(startX + ci * (sw + gap));
    define PathLayer(`h${ri}_${ci}`) ${ fill: color; stroke: #ddd; stroke-width: 0.5; }
    layer(`h${ri}_${ci}`).apply { roundRect(x, y, sw, sh, sr) }
  }
}

// Divider
define PathLayer('div1') ${ stroke: #e0e0e0; stroke-width: 1; fill: none; }
layer('div1').apply { M labelX 282 L 440 282 }

// Section: Palettes
layer('section').apply { text(labelX, 306)`Palettes` }

layer('labels').apply { text(labelX, calc(330 + sw / 2 + 4))`lightness` }
for ([color, i] in ramp) {
  let x = calc(startX + i * (sw + gap));
  define PathLayer(`ramp_${i}`) ${ fill: color; stroke: #ddd; stroke-width: 0.5; }
  layer(`ramp_${i}`).apply { roundRect(x, 330, sw, sh, sr) }
}

layer('labels').apply { text(labelX, calc(388 + sw / 2 + 4))`interpolate` }
for ([color, i] in interp) {
  let x = calc(startX + i * (sw + gap));
  define PathLayer(`interp_${i}`) ${ fill: color; stroke: #ddd; stroke-width: 0.5; }
  layer(`interp_${i}`).apply { roundRect(x, 388, sw, sh, sr) }
}
```

<h3 id="src-theme">Theme Demo</h3>

Produces the [themeable geometric illustration](#cssvar-the-reactive-layer) — four CSSVar-backed colors drive a star, orbiting circles, corner diamonds, and decorative arcs.

```js
// Theme Demo — geometric composition with CSSVar theming
// Multiple CSS variables drive the entire illustration

let bg      = Color(CSSVar('--bg', '#f5f5f5'));
let primary = Color(CSSVar('--primary', '#e63946'));
let secondary = Color(CSSVar('--secondary', '#457b9d'));
let accent  = Color(CSSVar('--accent', '#2a9d8f'));

// Derived reactive colors
let primaryLight  = primary.lighten(0.2);
let primaryDark   = primary.darken(0.15);
let secondaryMuted = secondary.desaturate(0.5);
let accentShift   = accent.hueShift(60);

// Background
define PathLayer('bg') ${ fill: bg; stroke: none; }
layer('bg').apply { rect(0, 0, 500, 260) }

// Central star — primary color
define PathLayer('star') ${ stroke: primary; fill: primaryLight; stroke-width: 2; stroke-linejoin: round; }
layer('star').apply { star(250, 130, 55, 28, 5) }

// Orbiting circles — secondary color
define PathLayer('orbits') ${ stroke: secondary; fill: secondaryMuted; stroke-width: 1.5; }
layer('orbits').apply {
  for (i in 0..4) {
    let angle = calc(i / 4 * TAU());
    let cx = calc(250 + cos(angle) * 100);
    let cy = calc(130 + sin(angle) * 70);
    circle(cx, cy, 14)
  }
}

// Corner diamonds — accent color
define PathLayer('diamonds') ${ stroke: accent; fill: accentShift; stroke-width: 1; }
layer('diamonds').apply {
  polygon(40, 40, 18, 4)
  polygon(460, 40, 18, 4)
  polygon(40, 220, 18, 4)
  polygon(460, 220, 18, 4)
}

// Decorative arcs — dark primary
define PathLayer('arcs') ${ stroke: primaryDark; fill: none; stroke-width: 2; stroke-linecap: round; }
layer('arcs').apply {
  M 70 130
  A 40 40 0 0 1 110 130
  M 390 130
  A 40 40 0 0 1 430 130
}

// Inner ring — accent
define PathLayer('ring') ${ stroke: accent; fill: none; stroke-width: 1; stroke-dasharray: 4 3; }
layer('ring').apply { circle(250, 130, 42) }
```

<h3 id="src-swatches">Dual-Panel Swatch Showcase</h3>

Produces the [full picture](#the-full-picture) — light and dark panels side by side, featuring methods, harmonies, palettes, and `Color.lightDark()` theme-aware colors.

```js
// Swatches Demo — simplified version of the full swatch showcase
// Light panel on left, dark panel on right
// CSSVar-backed for reactive color picker updates

let base   = Color(CSSVar('--base-color', '#e63946'));
let accent = Color(CSSVar('--accent-color', '#457b9d'));
let darkAccent = Color(CSSVar('--dark-accent', '#f4a261'));

// Derived colors (light panel)
let lighter = base.lighten(0.15);
let darker  = base.darken(0.15);
let vivid   = base.saturate(1.4);
let muted   = base.desaturate(0.5);
let shifted = base.hueShift(60);
let comp    = base.complement();

// Harmonies
let triad  = base.triadic();
let ramp   = Color.palette(base, accent, 5);

// Dark panel derived
let dkLighter = darkAccent.lighten(0.15);
let dkDarker  = darkAccent.darken(0.15);
let dkVivid   = darkAccent.saturate(1.4);
let dkMuted   = darkAccent.desaturate(0.5);
let dkShifted = darkAccent.hueShift(60);
let dkComp    = darkAccent.complement();
let dkTriad   = darkAccent.triadic();
let dkRamp    = Color.palette(darkAccent, base, 5);

// Theme-aware colors
let themeFg     = Color.lightDark(Color('#333'), Color('#eee'));
let themeAccent = Color.lightDark(accent, darkAccent);

// Layout
let panelW = 280;
let gapX = 10;
let darkX = calc(panelW + gapX);
let sw = 24;
let sh = 22;
let sr = 3;
let colGap = 5;
let startX = 14;

// Light panel background
define PathLayer('light-bg') ${ fill: #f5f5f5; stroke: none; }
layer('light-bg').apply { roundRect(0, 0, panelW, 340, 0) }

// Dark panel background
define PathLayer('dark-bg') ${ fill: #222266; stroke: none; }
layer('dark-bg').apply { roundRect(darkX, 0, panelW, 340, 0) }

// Shared text styles
define TextLayer('section') ${
  font-family: system-ui, sans-serif;
  font-size: 9;
  font-weight: bold;
  fill: #555;
}

define TextLayer('labels') ${
  font-family: system-ui, sans-serif;
  font-size: 7;
  fill: #888;
  text-anchor: middle;
}

define TextLayer('dk-section') ${
  font-family: system-ui, sans-serif;
  font-size: 9;
  font-weight: bold;
  fill: #aab;
}

define TextLayer('dk-labels') ${
  font-family: system-ui, sans-serif;
  font-size: 7;
  fill: #889;
  text-anchor: middle;
}

// ── LIGHT PANEL ──────────────────────────────────

// Methods row
layer('section').apply { text(8, 18)`Methods` }

let ltRow = [base, lighter, darker, vivid, muted, shifted, comp];
let ltNames = ['base', 'light', 'dark', 'vivid', 'muted', 'shift', 'compl'];
for ([color, i] in ltRow) {
  let x = calc(startX + i * (sw + colGap));
  define PathLayer(`lt_m${i}`) ${ fill: color; stroke: #ccc; stroke-width: 0.5; }
  layer(`lt_m${i}`).apply { roundRect(x, 24, sw, sh, sr) }
}
layer('labels').apply {
  for ([name, i] in ltNames) {
    text(calc(startX + i * (sw + colGap) + sw / 2), calc(24 + sh + 10))`${name}`
  }
}

// Divider
define PathLayer('lt-div') ${ stroke: #ddd; stroke-width: 0.5; fill: none; }
layer('lt-div').apply { M 8 70 L calc(panelW - 8) 70 }

// Harmony row
layer('section').apply { text(8, 86)`Triadic` }
for ([color, i] in triad) {
  let x = calc(startX + i * (sw + colGap));
  define PathLayer(`lt_h${i}`) ${ fill: color; stroke: #ccc; stroke-width: 0.5; }
  layer(`lt_h${i}`).apply { roundRect(x, 92, sw, sh, sr) }
}

// Palette row
layer('lt-div').apply { M 8 130 L calc(panelW - 8) 130 }
layer('section').apply { text(8, 146)`Palette` }
for ([color, i] in ramp) {
  let x = calc(startX + i * (sw + colGap));
  define PathLayer(`lt_p${i}`) ${ fill: color; stroke: #ccc; stroke-width: 0.5; }
  layer(`lt_p${i}`).apply { roundRect(x, 152, sw, sh, sr) }
}

// Theme-aware colors
layer('lt-div').apply { M 8 194 L calc(panelW - 8) 194 }
layer('section').apply { text(8, 210)`lightDark()` }

define PathLayer('lt-ld-fg') ${ fill: themeFg; stroke: #ccc; stroke-width: 0.5; }
layer('lt-ld-fg').apply { roundRect(startX, 216, sw, sh, sr) }

define PathLayer('lt-ld-accent') ${ fill: themeAccent; stroke: #ccc; stroke-width: 0.5; }
layer('lt-ld-accent').apply { roundRect(calc(startX + sw + colGap), 216, sw, sh, sr) }

layer('labels').apply {
  text(calc(startX + sw / 2), calc(216 + sh + 10))`fg`
  text(calc(startX + sw + colGap + sw / 2), calc(216 + sh + 10))`accent`
}

// ── DARK PANEL ──────────────────────────────────

// Methods row
layer('dk-section').apply { text(calc(darkX + 8), 18)`Methods` }

let dkRow = [darkAccent, dkLighter, dkDarker, dkVivid, dkMuted, dkShifted, dkComp];
let dkNames = ['base', 'light', 'dark', 'vivid', 'muted', 'shift', 'compl'];
for ([color, i] in dkRow) {
  let x = calc(darkX + startX + i * (sw + colGap));
  define PathLayer(`dk_m${i}`) ${ fill: color; stroke: #444; stroke-width: 0.5; }
  layer(`dk_m${i}`).apply { roundRect(x, 24, sw, sh, sr) }
}
layer('dk-labels').apply {
  for ([name, i] in dkNames) {
    text(calc(darkX + startX + i * (sw + colGap) + sw / 2), calc(24 + sh + 10))`${name}`
  }
}

// Divider
define PathLayer('dk-div') ${ stroke: #445; stroke-width: 0.5; fill: none; }
layer('dk-div').apply { M calc(darkX + 8) 70 L calc(darkX + panelW - 8) 70 }

// Harmony row
layer('dk-section').apply { text(calc(darkX + 8), 86)`Triadic` }
for ([color, i] in dkTriad) {
  let x = calc(darkX + startX + i * (sw + colGap));
  define PathLayer(`dk_h${i}`) ${ fill: color; stroke: #444; stroke-width: 0.5; }
  layer(`dk_h${i}`).apply { roundRect(x, 92, sw, sh, sr) }
}

// Palette row
layer('dk-div').apply { M calc(darkX + 8) 130 L calc(darkX + panelW - 8) 130 }
layer('dk-section').apply { text(calc(darkX + 8), 146)`Palette` }
for ([color, i] in dkRamp) {
  let x = calc(darkX + startX + i * (sw + colGap));
  define PathLayer(`dk_p${i}`) ${ fill: color; stroke: #444; stroke-width: 0.5; }
  layer(`dk_p${i}`).apply { roundRect(x, 152, sw, sh, sr) }
}

// Theme-aware colors
layer('dk-div').apply { M calc(darkX + 8) 194 L calc(darkX + panelW - 8) 194 }
layer('dk-section').apply { text(calc(darkX + 8), 210)`lightDark()` }

define PathLayer('dk-ld-fg') ${ fill: themeFg; stroke: #555; stroke-width: 0.5; }
layer('dk-ld-fg').apply { roundRect(calc(darkX + startX), 216, sw, sh, sr) }

define PathLayer('dk-ld-accent') ${ fill: themeAccent; stroke: #555; stroke-width: 0.5; }
layer('dk-ld-accent').apply { roundRect(calc(darkX + startX + sw + colGap), 216, sw, sh, sr) }

layer('dk-labels').apply {
  text(calc(darkX + startX + sw / 2), calc(216 + sh + 10))`fg`
  text(calc(darkX + startX + sw + colGap + sw / 2), calc(216 + sh + 10))`accent`
}

// Panel labels
define TextLayer('panel-light') ${
  font-family: system-ui, sans-serif;
  font-size: 9;
  font-weight: bold;
  fill: #bbb;
  text-anchor: middle;
}
layer('panel-light').apply { text(calc(panelW / 2), 330)`LIGHT` }

define TextLayer('panel-dark') ${
  font-family: system-ui, sans-serif;
  font-size: 9;
  font-weight: bold;
  fill: #557;
  text-anchor: middle;
}
layer('panel-dark').apply { text(calc(darkX + panelW / 2), 330)`DARK` }
```

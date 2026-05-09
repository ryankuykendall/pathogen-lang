---
title: "Drop the Quotes: Color Literals in Pathogen"
slug: color-literals
date: 2026-03-14
description: "A UX bug became a language feature — bare hex codes, CSS color functions, and the percent suffix are now first-class expressions in Pathogen."
---

A UX bug became a language feature.

When users changed colors via the playground's color picker on `Color('#cc0000')`, the picker stripped the quotes — producing `Color(#cc0000)`, which failed to compile. Rather than just fixing the quoting, we asked: why require quotes at all?

The result is **color literals** — bare hex codes and CSS color functions that are first-class expressions. Writing colors now feels like writing CSS, not calling an API. No `Color()` wrapper, no string quoting — just `#cc0000` directly in your code. Everything is backwards-compatible; existing `Color()` calls continue to work unchanged.

<mini-workspace src="samples/post10/before-after.pathogen" caption="Before and After — Color('#cc0000') vs #cc0000 produce identical output"></mini-workspace>

The left panel shows the old way: wrap a string in `Color()`, call methods with decimal arguments. The right panel shows the new way: bare hex literal, percent suffix. Both produce the same three swatches. The `Color()` wrapper still works — it now accepts bare hex values as a pass-through — but you no longer need it for hex colors.

## Hex Literals

Hex color codes are first-class expressions anywhere a value is expected:

```pathogen
let c = #cc0000;            // 6-digit hex
let c = #f00;               // 3-digit shorthand
let c = #cc000080;          // 8-digit with alpha
let c = #f008;              // 4-digit with alpha
```

Wrap in parentheses for method chaining:

```pathogen
let lighter = (#cc0000).lighten(20%);
let shifted = (#0066ff).hueShift(60);
```

From a single hex literal you can build full color palettes — lighten, darken, shift hue, adjust saturation, set alpha. The demo below starts from `#0066ff` and derives an entire palette using method chaining and the percent suffix:

<mini-workspace src="samples/post10/hex-palette.pathogen" caption="Lightness, hue, and saturation ramps derived from a single hex literal" code-open></mini-workspace>

## CSS Color Function Literals

All major CSS color functions work as bare expressions. You can paste any CSS color value directly into Pathogen code and it will just work — `%` and `/` inside function arguments are treated as literal characters, not operators:

```pathogen
let c = rgb(255, 0, 0);
let c = hsl(0, 100%, 50%);
let c = oklch(0.6 0.15 30);
let c = oklch(0.6 0.15 30 / 0.5);  // slash alpha
let c = hwb(0 0% 0%);
let c = lab(50 40 59.5);
let c = lch(50 64 30);
let c = oklab(0.6 -0.1 0.15);
```

Method chaining works directly — no wrapper needed:

```pathogen
let lighter = rgb(255, 0, 0).lighten(20%);
let muted = hsl(210, 80%, 50%).desaturate(50%);
```

The demo below expresses the same red in seven different color spaces. Every format converts to [OKLCH](/docs#stdlib-color) internally, so the swatches are near-identical — minor rounding differences between color spaces are invisible at screen resolution:

<mini-workspace src="samples/post10/color-spaces.pathogen" caption="The same red expressed via seven CSS color function syntaxes — all converge to OKLCH internally" code-open></mini-workspace>

> **Note:** CSS color function names (`rgb`, `rgba`, `hsl`, `hsla`, `oklch`, `hwb`, `lab`, `lch`, `oklab`) are effectively reserved — they always produce color literals, even if a user-defined function of the same name exists. The `a`-suffixed legacy forms (`rgba`, `hsla`) are also supported. See the [syntax reference](/docs#syntax-color-literals) for the full list.

## The Percent Suffix

The `%` suffix converts a number to its decimal form: `20%` becomes `0.2`, `50%` becomes `0.5`. This reads naturally with color methods — "lighten by 20%" instead of "lighten by 0.2":

```pathogen
let c = #e63946;
let tint  = c.lighten(20%);      // 20% → 0.2
let shade = c.darken(15%);       // 15% → 0.15
let faded = c.alpha(50%);        // 50% → 0.5
let muted = c.desaturate(40%);   // 40% → 0.4
```

The percent suffix isn't limited to color methods — it works anywhere a number is expected. `50%` is `0.5` whether it's a color alpha, a mix ratio, or a variable assignment.

**Disambiguation:** `20%` (no space) is a percent literal. `20 % 5` (with spaces) is the [modulus operator](/docs#syntax-percent-suffix). Existing code that uses modulus with spaces continues to work unchanged.

<mini-workspace src="samples/post10/percent-tints.pathogen" caption="Tint, shade, and alpha scales using the percent suffix" code-open></mini-workspace>

## Reactive Colors

Color literals compose naturally with Pathogen's [CSSVar-backed reactive colors](/blog/reactive-color-svg). Use a bare hex as the fallback value in `Color(CSSVar(...))` to create colors that update at runtime when the CSS custom property changes:

```pathogen
let base = Color(CSSVar('--base-color', #0066ff));
let light = base.lighten(20%);
let comp = base.complement();
let triad = base.triadic();
```

Change `--base-color` and every derived value recalculates — lighten, complement, triadic harmony, everything. The compiler emits `@property` declarations so the browser knows these are interpolatable `<color>` values.

The first demo below shows a full reactive palette — lightness ramp, color transformations, and triadic harmony, all driven by a single CSS variable. Use the color picker to change `--base-color` and watch every swatch update:

<mini-workspace src="samples/post10/reactive-palette.pathogen" caption="Reactive palette — change --base-color to update all swatches" code-open></mini-workspace>

The second demo shows a tint/shade scale — seven lighten steps and seven darken steps from a single reactive base:

<mini-workspace src="samples/post10/reactive-tints.pathogen" caption="Reactive tint/shade scale — change --tint-color to update every swatch" code-open></mini-workspace>

## What Still Needs `Color()`

The `Color()` wrapper isn't going away. You still need it for:

- **Named colors**: `Color('coral')`, `Color('dodgerblue')` — all [148 CSS named colors](/docs#stdlib-color)
- **Direct OKLCH construction**: `Color(0.6, 0.15, 30)` — numeric L, C, H values
- **String-based input**: `Color('rgb(255, 0, 0)')` — when the color format is in a string variable

Everything is backwards-compatible. Existing `Color('#cc0000')` calls continue to work — `Color()` now accepts a bare `ColorValue` as a pass-through.

## Try It

Open the [Pathogen playground](/), start from `#0066ff`, and build your own palette — lighten, shift hue, take the complement. The full API reference is in the [Color documentation](/docs#stdlib-color), and the syntax details are in the [Color Literals](/docs#syntax-color-literals) and [Percent Suffix](/docs#syntax-percent-suffix) sections.

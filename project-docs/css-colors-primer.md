# CSS Colors Primer for Pathogen

## Purpose

Research primer exploring the CSS color landscape (2020–2025) and its relevance to the Pathogen language and playground. This document maps what's now possible in browser-rendered SVGs, identifies where Pathogen currently stands, and outlines the opportunity space for richer color control.

---

## Where Pathogen Stands Today

Colors in Pathogen are **opaque strings**. The full pipeline:

1. **Parser** (`src/parser/index.ts`): Style block values are extracted via regex as raw strings — `stroke: oklch(0.7 0.15 180);` is captured as the string `"oklch(0.7 0.15 180)"`.

2. **Evaluator** (`src/evaluator/index.ts`, `evaluateStyleBlockLiteral()`): Attempts to parse each value as an expression (to resolve variables and `calc()`). If parsing fails (as it does for `rgb(...)`, `#hex`, named colors), the raw string is kept as-is.

3. **Output** (`src/cli.ts`, `playground/components/svg-preview-pane.js`): Strings are written directly into SVG attributes — `fill="${fill}"`. No validation, no conversion, no manipulation.

4. **Playground color picker** (`playground/utils/cm-color-picker.js`): A CodeMirror extension that parses hex, rgb, rgba, hsl, hsla, and named colors. Provides inline color chips, native OS picker, alpha slider, and format cycling (hex → rgb → hsl). Does **not** understand oklch, oklab, color-mix, or relative color syntax.

**Bottom line:** Any valid CSS color string works in Pathogen today because it's passed through verbatim. But there's no ability to *manipulate*, *derive*, or *compose* colors within the language itself.

---

## Security: Style Value Injection

The raw-string-pass-through design creates a concrete injection vulnerability in the CLI output path.

### The Problem

In `src/cli.ts`, style property values are interpolated directly into SVG XML strings via template literals:

```typescript
// cli.ts line 71 — text layer styles
const attrs = Object.entries(layer.styles)
  .map(([k, v]) => `${k}="${v}"`).join(' ');

// cli.ts line 92 — extra path attributes
const extraAttrs = Object.entries(layer.styles)
  .filter(([key]) => !handled.has(key))
  .map(([key, value]) => `${key}="${value}"`)
  .join(' ');

// cli.ts line 96 — core path attributes
return `  <path d="..." fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${extra}/>`;

// cli.ts line 107 — mask/clipPath IDs
defsContent.push(`  <mask id="${mask.id}">`);
```

A malicious style value like `none" onclick="alert(1)` would break out of the attribute context:

```xml
<path fill="none" onclick="alert(1)" stroke="..."/>
```

An `escapeXml()` function exists (line 51) but is **only applied to `<text>` content** (lines 75, 81), not to attribute values.

### Playground Is Safe

The playground uses `element.setAttribute(key, value)` (DOM API) which auto-escapes attribute values. No injection possible there.

### What We Need

A two-layer defense:

**Layer 1 — Output escaping (immediate fix).** Apply `escapeXml()` to all style property values and IDs before interpolating into XML strings in `cli.ts`. This is a mechanical fix: wrap every `${value}` in attribute context with the existing escape function. Property names are already safe (parser regex restricts them to `[a-zA-Z][a-zA-Z0-9-]*`).

**Layer 2 — Style value validation (evaluator-level).** Add validation in `evaluateStyleBlockLiteral()` that recognizes legitimate CSS value patterns and warns or errors on anything unrecognized. This serves dual purpose:

1. **Security** — Blocks injection payloads that contain characters like `"`, `<`, `>`, `&`
2. **UX** — Catches typos and invalid values early with descriptive error messages

A reasonable allowlist approach for style property values:

| Pattern | Examples |
|---------|----------|
| Hex colors | `#rgb`, `#rrggbb`, `#rrggbbaa` |
| Named colors | `red`, `blue`, `transparent`, `none`, `currentColor` |
| CSS functions | `rgb()`, `rgba()`, `hsl()`, `hsla()`, `oklch()`, `oklab()`, `color-mix()`, `color()`, `light-dark()`, `var()`, `url()`, `calc()` |
| Numeric values | `2`, `0.5`, `4 1 2 3` (stroke-dasharray) |
| Simple keywords | `round`, `butt`, `miter`, `evenodd`, `nonzero`, `visible`, `hidden` |

Values not matching any pattern would produce a **warning** (not a hard error — we don't want to block valid CSS we haven't anticipated). The warning message should be descriptive: *"Unrecognized style value '{value}' for property '{name}'. If this is intentional, you can ignore this warning."*

Characters that should **never** appear in a style property value: `"`, `<`, `>`, `\n`, `\r`. These should be a hard error.

### Where to Implement

| Change | File | Scope |
|--------|------|-------|
| XML-escape all attribute values | `src/cli.ts` | Apply `escapeXml()` to all `${value}` in attribute contexts |
| Validate style values | `src/evaluator/index.ts`, `evaluateStyleBlockLiteral()` | Add validation after expression resolution |
| Validate mask/clipPath IDs | `src/evaluator/index.ts`, `Mask()`/`ClipPath()` constructors | Reject IDs containing dangerous characters |

---

## What Changed in CSS Colors (2020–2025)

### 1. New Perceptually Uniform Color Spaces: OKLab and OKLCH

**What:** Two new color functions based on Björn Ottosson's 2020 research that model human color perception far more accurately than RGB or HSL.

- `oklab(L a b)` — Lightness (0–1), green-red axis, blue-yellow axis
- `oklch(L C H)` — Lightness (0–1), Chroma (saturation intensity), Hue (0–360 degrees)

**Why it matters:** OKLCH is the first CSS color space where "increase lightness by 20%" actually looks 20% lighter to the human eye. HSL's lightness axis is notoriously non-uniform — `hsl(60, 100%, 50%)` (yellow) looks far brighter than `hsl(240, 100%, 50%)` (blue) despite identical L values.

**Browser support:** Chrome 111+, Safari 15.4+, Firefox 113+. Universally supported since mid-2023.

**SVG compatibility:** Fully supported as attribute values. `fill="oklch(0.7 0.15 180)"` renders correctly in all modern browsers. Also works in SVG gradient `<stop>` elements via `stop-color`.

### 2. `color-mix()` — Blend Two Colors in Any Color Space

**What:** A CSS function that mixes two colors at a specified ratio in a chosen interpolation space.

```css
color-mix(in oklch, #e63946 60%, #457b9d)
color-mix(in srgb, red, blue)
color-mix(in oklch longer hue, oklch(0.7 0.15 30), oklch(0.7 0.15 330))
```

**Key parameters:**
- **Color space** (required): `srgb`, `srgb-linear`, `oklab`, `oklch`, `lab`, `lch`, `hsl`, `hwb`, `display-p3`, `xyz`, etc.
- **Hue interpolation** (polar spaces only): `shorter`, `longer`, `increasing`, `decreasing`
- **Percentages** (optional): Default 50/50 split

**Why it matters:** Enables palette generation, tinting, shading, and color blending without JavaScript. Mixing in `oklch` avoids the muddy grays that plague RGB interpolation.

**Browser support:** Baseline since May 2023 (Chrome 111, Firefox 113, Safari 16.2).

**SVG compatibility:** Works in SVG presentation attributes. `fill="color-mix(in oklch, red 70%, blue)"` renders correctly.

### 3. Relative Color Syntax — Derive Colors from Other Colors

**What:** The `from` keyword inside any color function lets you decompose an origin color into channel variables, then manipulate them.

```css
/* Lighten by 20% in OKLCH */
oklch(from var(--base) calc(l + 0.2) c h)

/* Desaturate */
oklch(from #e63946 l calc(c * 0.5) h)

/* Set alpha to 50% */
rgb(from #e63946 r g b / 0.5)

/* Shift hue by 180° (complement) */
oklch(from var(--primary) l c calc(h + 180))
```

**Why it matters:** This is the biggest unlock for programmatic color work. It replaces entire JavaScript color libraries — lighten, darken, saturate, desaturate, adjust alpha, complementary colors, analogous palettes — all in pure CSS, resolved at render time.

**Browser support:** Baseline since September 2024 (Chrome 129, Firefox 128, Safari 18).

**SVG compatibility:** Works in SVG attributes. Can reference CSS custom properties with `var()`.

### 4. `light-dark()` — Theme-Aware Color Selection

**What:** Returns one of two colors based on the computed `color-scheme`.

```css
color: light-dark(#333, #eee);
```

**Browser support:** Baseline since May 2024 (Chrome 123, Firefox 120, Safari 17.5).

**SVG compatibility:** Works when the SVG inherits `color-scheme` from the document.

### 5. `contrast-color()` — Automatic Contrast Selection

**What:** Returns black or white (whichever has more contrast) against a given color.

```css
color: contrast-color(var(--bg));
```

**Browser support:** Safari Technology Preview only (as of early 2026). Not yet in Chrome or Firefox. Specified in CSS Color Level 5.

**SVG compatibility:** Will work when supported, but too early to rely on.

### 6. `@property` — Typed CSS Custom Properties

**What:** Registers a CSS custom property with a type, initial value, and inheritance behavior.

```css
@property --accent {
  syntax: "<color>";
  inherits: true;
  initial-value: oklch(0.7 0.18 250);
}
```

**Why it matters:** Regular `var(--accent)` is a string — the browser can't interpolate it in transitions. `@property` with `syntax: "<color>"` makes the browser treat it as a true color value, enabling smooth animated transitions between color values.

**Browser support:** Baseline since July 2024 (Chrome 85+, Firefox 128, Safari 15.4).

**SVG compatibility:** SVG elements inherit registered properties and can animate them.

### 7. Wide-Gamut Color Spaces: Display P3, Rec. 2020

**What:** Color spaces that represent colors outside the sRGB gamut — the vivid reds, greens, and blues that modern displays can show but `rgb()` and `#hex` cannot encode.

```css
color(display-p3 1 0.2 0.1)
oklch(0.65 0.29 29)  /* vivid red, beyond sRGB */
```

**Why it matters:** Modern Apple displays (since 2016), many Android screens, and increasingly desktop monitors support Display P3. Colors that look identical in sRGB can be distinguished in wider gamuts.

**Browser support:** Chrome 111+, Safari 15+, Firefox 113+.

**SVG compatibility:** Supported in SVG attributes. Browsers that don't support wide gamut gracefully fall back to the nearest sRGB color.

---

## SVG + CSS Custom Properties: The Parameterization Story

The user's original observation — using `var(--color-start, red)` inside SVG gradient stops — highlights a powerful pattern. Here's the current state:

### What Works Today

CSS custom properties (`var()`) work in SVG presentation attributes and style properties when the SVG is **inline in the DOM** (not loaded via `<img>` or as a CSS `background-image`):

```html
<style>
  :root { --primary: oklch(0.6 0.2 250); }
</style>
<svg>
  <circle fill="var(--primary)" r="40" cx="50" cy="50"/>
  <linearGradient id="g">
    <stop offset="0%" stop-color="var(--primary)"/>
    <stop offset="100%" stop-color="color-mix(in oklch, var(--primary), white 60%)"/>
  </linearGradient>
</svg>
```

This means Pathogen-generated SVGs can be **parameterized at the consumption site** — the same SVG responds to different CSS variables.

### What Doesn't Work

- `var()` in SVGs loaded via `<img src="...">` or CSS `background-image: url(...)` — the SVG is sandboxed from the document's CSS.
- `var()` in standalone `.svg` files opened directly — no parent document to inherit from.

### `@property` in SVG

Registered custom properties with `syntax: "<color>"` enable:
- Animated color transitions on SVG elements
- Type checking (invalid values fall back to `initial-value`)
- Inheritance control per property

---

## Opportunity Space for Pathogen

### Tier 1: Language-Level Color Manipulation (High Impact)

**A first-class `Color` type** that wraps CSS color values and exposes manipulation methods, compiled down to CSS color functions in the SVG output.

```
// Construction
let c = Color('#e63946');
let c = Color(oklch(0.6 0.2 250));

// Manipulation (returns new Color)
c.lighten(0.2)          → oklch(from <base> calc(l + 0.2) c h)
c.darken(0.15)          → oklch(from <base> calc(l - 0.15) c h)
c.saturate(1.5)         → oklch(from <base> l calc(c * 1.5) h)
c.desaturate(0.5)       → oklch(from <base> l calc(c * 0.5) h)
c.alpha(0.5)            → oklch(from <base> l c h / 0.5)
c.hueShift(180)         → oklch(from <base> l c calc(h + 180))
c.complement()          → shorthand for hueShift(180)

// Mixing
Color.mix(c1, c2, 0.3)  → color-mix(in oklch, <c1> 30%, <c2>)
Color.mix(c1, c2, 0.5, 'srgb')  → color-mix(in srgb, <c1>, <c2>)

// Access
c.css                    → the CSS string for style blocks
c.oklch                  → oklch(...) representation
```

**Compile strategy:** Two options to evaluate.

1. **CSS-function output** — `c.lighten(0.2)` compiles to `oklch(from #e63946 calc(l + 0.2) c h)` in the SVG. Browser resolves at render time. Pros: Composable with `var()`, theme-responsive. Cons: Requires modern browser.

2. **Compile-time resolution** — The compiler resolves colors to concrete values (e.g., `#f06b75`). Pros: Works everywhere. Cons: Loses dynamism.

Option 1 aligns better with the parameterized SVG vision. Option 2 could be a fallback mode.

### Tier 2: Palette and Gradient Utilities (Medium Impact)

Built on top of the Color type:

```
// Generate a palette
let palette = Color.palette('#e63946', 5);  // 5-step lightness ramp
// → [oklch(0.3 ...), oklch(0.4 ...), ... oklch(0.9 ...)]

// Analogous colors
let analogous = c.analogous(30);  // ±30° hue shift
// → [c.hueShift(-30), c, c.hueShift(30)]

// Use in loops
for (i in 0..5) {
  define PathLayer(concat('line-', i)) ${ stroke: palette[i].css; }
}
```

### Tier 3: CSS Variable Integration (Medium Impact)

Allow Pathogen to emit SVGs with `var()` references for parameterization:

```
// Declare a CSS variable with default
let primary = CSSVar('--primary', '#e63946');

define PathLayer('main') ${ stroke: primary; fill: none; }
// Output: stroke="var(--primary, #e63946)"
```

This makes exported SVGs theme-responsive — consumers override `--primary` in their CSS to restyle the SVG without editing it.

### Tier 4: Playground Color Tools (Lower Priority, High Polish)

- **Color picker upgrade:** Add OKLCH and OKLab to the format cycle. Show the perceptual lightness/chroma/hue values. Display gamut warnings for colors outside sRGB.
- **Palette visualization:** A sidebar panel showing all colors used in the current program, grouped by layer.
- **Live CSS variable panel:** For SVGs using `var()`, expose a panel of sliders/pickers to experiment with variable values without editing code.

### Tier 5: `@property` and Animation (Future)

If Pathogen ever supports SVG animations or interactive SVGs, `@property` registration enables smooth color transitions. This is speculative but worth noting as the foundation.

---

## Compatibility Matrix

| Feature | Chrome | Firefox | Safari | SVG Attrs | SVG Gradient Stops |
|---------|--------|---------|--------|-----------|--------------------|
| `oklch()` / `oklab()` | 111+ | 113+ | 15.4+ | Yes | Yes |
| `color-mix()` | 111+ | 113+ | 16.2+ | Yes | Yes |
| Relative color syntax | 129+ | 128+ | 18+ | Yes | Yes |
| `light-dark()` | 123+ | 120+ | 17.5+ | Yes* | Yes* |
| `contrast-color()` | No | No | TP only | — | — |
| `var()` in SVG | Yes | Yes | Yes | Inline only | Inline only |
| `@property` | 85+ | 128+ | 15.4+ | Inherits | Inherits |
| Display P3 / wide gamut | 111+ | 113+ | 15+ | Yes | Yes |

*Requires `color-scheme` inheritance from parent document.

---

## Recommended Exploration Path

0. **Fix style value injection** (Security) — Apply `escapeXml()` to CLI output and add style value validation in the evaluator. This is a prerequisite that should be addressed before adding any new color features, since new features will increase the surface area of values flowing through the style pipeline.

1. **Start with a Color type** (Tier 1) — this is the foundational primitive everything else builds on. The key design decision is compile-time vs. render-time resolution.

2. **Upgrade the playground color picker** (Tier 4, partial) — add OKLCH awareness so users can see and edit colors in the perceptually uniform space while using the existing language.

3. **Add palette utilities** (Tier 2) — once Color exists, palette generation is a natural stdlib extension.

4. **CSS variable support** (Tier 3) — this is orthogonal to Color and could be explored independently. It changes the output contract (SVGs become parameterized rather than self-contained).

---

## Sources

- [OKLCH in CSS: why we moved from RGB and HSL — Evil Martians](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl)
- [oklch() — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/oklch)
- [oklab() — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value/oklab)
- [color-mix() — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value/color-mix)
- [color-mix() — CSS-Tricks](https://css-tricks.com/almanac/functions/c/color-mix/)
- [Using relative colors — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Colors/Using_relative_colors)
- [CSS relative color syntax — Chrome for Developers](https://developer.chrome.com/blog/css-relative-color-syntax/)
- [CSS Relative Colors — Ahmad Shadeed](https://ishadeed.com/article/css-relative-colors/)
- [light-dark() — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value/light-dark)
- [contrast-color() — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value/contrast-color)
- [contrast-color() — WebKit](https://webkit.org/blog/16929/contrast-color/)
- [@property: Next-gen CSS variables — web.dev](https://web.dev/blog/at-property-baseline)
- [The Ultimate OKLCH Guide](https://oklch.org/posts/ultimate-oklch-guide)
- [Falling For OKLCH — Smashing Magazine](https://www.smashingmagazine.com/2023/08/oklch-color-spaces-gamuts-css/)
- [SVG and CSS — MDN](https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorials/SVG_from_scratch/SVG_and_CSS)
- [Gradients in SVG — MDN](https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorials/SVG_from_scratch/Gradients)
- [Creating color palettes with CSS color-mix() — MDN Blog](https://developer.mozilla.org/en-US/blog/color-palettes-css-color-mix/)
- [Relative Color Syntax — Basic Use Cases — Frontend Masters](https://frontendmasters.com/blog/relative-color-syntax-basic-use-cases/)

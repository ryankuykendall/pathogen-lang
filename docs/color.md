# Color Type

The `Color` type provides first-class color manipulation in OKLCH color space. Colors are resolved at compile time to concrete CSS values.

## Color Literals

Hex color codes are first-class expressions — no quotes or `Color()` wrapper needed:

```
let c = #cc0000;                      // 6-digit hex → ColorValue
let c = #f00;                         // 3-digit shorthand
let c = #cc000080;                    // 8-digit with alpha
let c = #f008;                        // 4-digit with alpha
```

Color literals support method chaining via parentheses:

```
let lighter = (#cc0000).lighten(20%); // 20% → 0.2
let faded = (#0066ff).alpha(50%);     // 50% → 0.5
```

`Color()` accepts color literals as pass-through (no-op for backwards compatibility):

```
let c = Color(#cc0000);               // same as: let c = #cc0000;
```

## CSS Color Function Literals

CSS color functions are first-class expressions with raw capture (content between parens is captured as-is):

```
let c = rgb(255, 0, 0);
let c = rgba(255, 0, 0, 0.5);
let c = hsl(0, 100%, 50%);           // % inside parens is literal
let c = hsla(0, 100%, 50%, 0.5);
let c = oklch(0.6 0.15 30);
let c = oklch(0.6 0.15 30 / 0.5);    // / for alpha is literal
let c = oklab(0.6 -0.1 0.15);
let c = hwb(0 0% 0%);
let c = lab(50 40 59.5);
let c = lch(50 64 30);
```

Method chaining works directly:

```
let lighter = rgb(255, 0, 0).lighten(20%);
```

> **Note:** CSS color function names (`rgb`, `hsl`, `oklch`, etc.) are effectively reserved — they always produce color literals, even if a user-defined function of the same name exists.

## Constructor

The `Color()` wrapper is still available for string-based construction and named colors:

```
let c = Color('#e63946');              // hex (3, 6, or 8 digit)
let c = Color('red');                  // named CSS color (all 148)
let c = Color('rgb(255, 0, 0)');       // rgb/rgba
let c = Color('hsl(0, 100%, 50%)');    // hsl/hsla
let c = Color('oklch(0.6 0.15 30)');   // oklch
let c = Color(0.6, 0.15, 30);         // direct OKLCH (L, C, H)
let c = Color(0.6, 0.15, 30, 0.5);    // OKLCH + alpha
let c = Color(#cc0000);               // pass-through (accepts ColorValue)
```

All input formats are converted to OKLCH internally for perceptually uniform manipulation.

## Properties

Read-only properties for inspecting color values:

| Property | Type | Description |
|----------|------|-------------|
| `.css` | string | Hex if opaque, `rgba()` if transparent |
| `.hex` | string | `#rrggbb` (ignores alpha) |
| `.oklch` | string | `oklch(L C H)` or `oklch(L C H / a)` |
| `.hsl` | string | `hsl(H, S%, L%)` |
| `.rgb` | string | `rgb(R, G, B)` |
| `.lightness` | number | OKLCH lightness (0–1) |
| `.chroma` | number | OKLCH chroma (0–~0.4) |
| `.hue` | number | OKLCH hue (0–360) |
| `.a` | number | Alpha (0–1) |

```
let c = Color('#e63946');
log(c.hex);        // #e63946
log(c.lightness);  // ~0.52
log(c.hue);        // ~27
log(c.a);          // 1
```

## Methods

All methods return a new Color — they never mutate the original.

### Lightness

```
let c = Color('#e63946');
let lighter = c.lighten(0.2);   // increase L by 0.2
let darker = c.darken(0.15);    // decrease L by 0.15
log(lighter.hex);  // lighter red
log(darker.hex);   // darker red
```

### Saturation

```
let c = Color('#e63946');
let vivid = c.saturate(1.5);     // multiply chroma by 1.5
let muted = c.desaturate(0.5);   // multiply chroma by 0.5
```

### Alpha

```
let c = Color('#e63946');
let semi = c.alpha(0.5);
log(semi.css);  // rgba(230, 57, 70, 0.5)
```

### Flattening

`flatten(background?)` merges a translucent color down onto a background color, the way an image editor flattens layers — the result is the color you actually see when the translucent color is drawn over that background. Reach for it when transparency has to go: print and [PDF export](#exporting-pdf-export-print-ready) is the canonical case — paper has no alpha channel, so a tint designed as a translucent overlay becomes its equivalent opaque ink.

```
let ink = (#ff0000).alpha(0.5);   // 50%-opaque red
let onWhite = ink.flatten();      // background defaults to white
let onBlack = ink.flatten(#000);  // any Color works as the background
log(onWhite.hex);  // ≈#ff8080 — half red, half white, per channel
log(onWhite.a);    // 1 — transparency is gone
```

Compositing uses the standard source-over formula on gamma-encoded sRGB channels, matching how a browser paints a translucent color over a solid background with normal blending — so for in-gamut colors `flatten()` returns the color you already see on screen, with the transparency baked in. Because the math runs in sRGB, a color outside the sRGB gamut is clipped into it, even when it is already opaque.

Flattening an already-opaque, in-gamut color returns it unchanged, and flattening a fully transparent color returns the background. The background may itself be translucent: the result then keeps the correctly composited alpha (`out = srcAlpha + bgAlpha * (1 - srcAlpha)`); flattening onto any opaque background always produces a fully opaque color.

Theme-dynamic colors are rejected: calling `flatten()` on (or with) a color backed by `CSSVar(...)` or `Color.lightDark(...)` is an error, because CSS has no equivalent of alpha compositing — the result could no longer follow the theme. Flatten the underlying static color instead.

### Hue

```
let c = Color('#e63946');
let shifted = c.hueShift(180);   // shift hue by 180°
let comp = c.complement();       // shorthand for hueShift(180)
```

`hueShift` takes **degrees** when given a bare number — so you can write the angle in whatever unit the surrounding code already uses, without hand-converting. An [Angle value](#syntax-angle-units) (anything written with a `deg`, `rad`, or `pi` **suffix**, including `calc()` arithmetic over angle-suffixed literals) is converted to degrees exactly, no matter how it reaches the call:

```
let c = Color('#e63946');
let quarterTurn = c.hueShift(90);    // 90° — bare numbers are degrees
let sameByDeg = c.hueShift(90deg);   // 90° — angle units auto-convert
let sameByPi = c.hueShift(0.5pi);    // 90° — π/2 radians
```

```
// A hue wheel in nine swatches — the 2pi literal makes this an angle
let c = Color('#e63946');
for (i in 1..9) {
  let swatch = PathLayer(`shift-${i}`) #{
    stroke: none;
    fill: c.hueShift(calc(i / 9 * 2pi));
  };
  swatch.apply { rect(0, calc(i * 24), 20, 20); }
}
```

> **An angle is an angle wherever it flows.** `calc(i / 9 * 2pi)` is an [Angle value](#syntax-angle-units), and it stays one through a `let`, an array, a function call, or an [angle-preserving standard-library function](#stdlib-angle-preserving-functions) like `clamp`, `lerp`, or `randomRange` — hoisting it into a variable does not change the shift. Only a genuinely bare number is read as degrees — and results of angle-*consuming* functions are bare numbers, so `calc(sin(t) * 180)` is degrees.
>
> **Behavior change:** angle units used to be consumed at the literal — `let t = 0.5pi; c.hueShift(t)` shifted 1.57°, not 90°. Angles now survive variables, so that program shifts 90°. They also survive angle-preserving standard-library calls: `c.hueShift(randomRange(-0.5pi, 0.5pi))` used to shift by a near-invisible ±1.57° (the angle range was flattened to bare radians, read as degrees) and now shifts within ±90°.

```
let c = Color('#e63946');
let sweep = calc(6 / 9 * 2pi);           // an Angle — 240°
let a = c.hueShift(sweep);               // 240° — angle-ness survives the let
let b = c.hueShift(deg(sweep));          // 240° — deg() returns a plain number of degrees
let d = c.hueShift(calc(sin(1) * 180));  // ≈151° — sin() returns a plain number, read as degrees
let e = c.hueShift(randomRange(-0.5pi, 0.5pi));  // random shift in ±90° — the angle survives randomRange
```

The same rules apply to [`analogous()`](#color-analogousangle) and [`splitComplementary()`](#color-splitcomplementaryangle), and to colors backed by `CSSVar(...)` — the emitted CSS hue expression uses degrees. `Color(L, C, H)` follows suit: a bare `H` is degrees and an Angle `H` auto-converts, so `Color(0.6, 0.15, 90deg)` stores a hue of 90. The `.hue` property returns a plain number in degrees.

### Mixing

Mix two colors in OKLCH space:

```
let a = Color('#e63946');
let b = Color('#457b9d');
let mid = a.mix(b, 0.5);         // 50/50 mix
let mostly_a = a.mix(b, 0.2);    // 80% a, 20% b
```

### Method Chaining

Methods return new Colors, so they chain naturally:

```
let c = Color('#e63946')
  .lighten(0.1)
  .desaturate(0.8)
  .alpha(0.9);
```

## Color Harmonies

Generate sets of harmonious colors based on color theory. All harmony methods return an array of Colors, preserving lightness, chroma, and alpha. `analogous` and `splitComplementary` take an angle argument (`triadic` and `tetradic` are fixed at 120° and 90° spacing). Angle arguments are in **degrees** for bare numbers, with the same auto-conversion as [`hueShift`](#color-hue): `analogous(30deg)` and `analogous(30)` are equivalent.

### .analogous(angle?)

Returns 3 colors: `[hue - angle, self, hue + angle]`. Default angle: 30.

```
let c = Color('#e63946');
let colors = c.analogous();       // 3 colors at -30°, 0°, +30°
let wide = c.analogous(45);       // wider spread at ±45°
```

### .triadic()

Returns 3 colors evenly spaced at 120° intervals: `[self, hue + 120, hue + 240]`.

```
let c = Color('#e63946');
let colors = c.triadic();
```

### .tetradic()

Returns 4 colors evenly spaced at 90° intervals: `[self, hue + 90, hue + 180, hue + 270]`.

```
let c = Color('#e63946');
let colors = c.tetradic();
```

### .splitComplementary(angle?)

Returns 3 colors: `[self, hue + 180 - angle, hue + 180 + angle]`. Default angle: 30.

```
let c = Color('#e63946');
let colors = c.splitComplementary();     // flanks of complement at ±30°
let narrow = c.splitComplementary(15);   // tighter split
```

### Using Harmonies

Harmony methods return arrays, so use `for-each` to iterate:

```
let c = Color('#e63946');
for ([color, i] in c.triadic()) {
  define PathLayer(`p${i}`) #{ fill: color; stroke: none; }
  layer(`p${i}`).apply { circle(calc(50 + i * 60), 100, 25) }
}
```

### Complete Example

A full color swatch showcase demonstrating base methods, harmonies, palettes, and derived colors across multiple tiers. Uses `CSSVar`-backed Colors so that changing `--base-color` or `--accent-color` in the playground's CSS var panel reactively updates every swatch. Connecting lines show how colors flow from a single base color through transformations.

Canvas: `600 × 700` viewBox with four sections flowing top-to-bottom.

```
// ═══════════════════════════════════════════════════════════
// Color Swatch Showcase — full demo of Color manipulation,
// harmonies, palettes, and derived colors
// ═══════════════════════════════════════════════════════════

let base = Color(CSSVar('--base-color', '#e63946'));
let accent = Color(CSSVar('--accent-color', '#457b9d'));

// ── Tier 0: Base Methods ──────────────────────────────────

let lighter   = base.lighten(0.15);
let darker    = base.darken(0.15);
let vivid     = base.saturate(1.4);
let muted     = base.desaturate(0.5);
let shifted   = base.hueShift(60);
let comp      = base.complement();
let semi      = base.alpha(0.6);
let mixed     = base.mix(accent, 0.5);

// ── Tier 1: Harmonies ────────────────────────────────────

let analog  = base.analogous();
let triad   = base.triadic();
let tetrad  = base.tetradic();
let split   = base.splitComplementary();

// ── Tier 1b: Palettes ────────────────────────────────────

let ramp   = Color.palette(base, 5);
let interp = Color.palette(base, accent, 5);

// ── Tier 2: Derived Colors ───────────────────────────────

let tri1       = triad[1];
let tri1Light  = tri1.lighten(0.15);
let tri1Dark   = tri1.darken(0.15);
let tri1Vivid  = tri1.saturate(1.4);

let rampMid      = ramp[2];
let rampShifted  = rampMid.hueShift(60);
let rampComp     = rampMid.complement();
let rampAlpha    = rampMid.alpha(0.5);

// ═══════════════════════════════════════════════════════════
// Layers
// ═══════════════════════════════════════════════════════════

define PathLayer('connectors') #{
  stroke: #999;
  stroke-width: 1;
  fill: none;
}

define TextLayer('section-labels') #{
  font-family: system-ui, sans-serif;
  font-size: 13;
  font-weight: bold;
  fill: #555;
}

define TextLayer('labels') #{
  font-family: system-ui, sans-serif;
  font-size: 9;
  fill: #777;
  text-anchor: middle;
}

// ── Swatch sizing ────────────────────────────────────────

let sx = 64;
let sp = 96;
let sw = 36;
let sh = 36;
let sr = 6;

// ═══════════════════════════════════════════════════════════
// Tier 0: Base Method Swatches
// ═══════════════════════════════════════════════════════════

// Row 1: base, lighten, darken, saturate, desaturate
let row1 = [base, lighter, darker, vivid, muted];
let row1names = ['base', 'lighten', 'darken', 'saturate', 'desat'];
for ([color, i] in row1) {
  let x = calc(sx + i * sp);
  define PathLayer(`t0r1_${i}`) #{ fill: color; stroke: #ccc; stroke-width: 0.5; }
  layer(`t0r1_${i}`).apply { roundRect(calc(x - sw / 2), calc(50 - sh / 2), sw, sh, sr) }
}

// Row 2: hueShift, complement, alpha, mix, accent
let row2 = [shifted, comp, semi, mixed, accent];
let row2names = ['hueShift', 'compl.', 'alpha', 'mix', 'accent'];
for ([color, i] in row2) {
  let x = calc(sx + i * sp);
  define PathLayer(`t0r2_${i}`) #{ fill: color; stroke: #ccc; stroke-width: 0.5; }
  layer(`t0r2_${i}`).apply { roundRect(calc(x - sw / 2), calc(115 - sh / 2), sw, sh, sr) }
}

// Section header
layer('section-labels').apply {
  text(10, 20)`Base Methods`
}

// Row 1 labels
layer('labels').apply {
  for ([name, i] in row1names) {
    text(calc(sx + i * sp), calc(50 + sh / 2 + 12))`${name}`
  }
}

// Row 2 labels
layer('labels').apply {
  for ([name, i] in row2names) {
    text(calc(sx + i * sp), calc(115 + sh / 2 + 12))`${name}`
  }
}

// Section divider
layer('connectors').apply {
  M 10 170
  L 590 170
}

// ═══════════════════════════════════════════════════════════
// Tier 1: Harmonies
// ═══════════════════════════════════════════════════════════

layer('section-labels').apply {
  text(10, 195)`Harmonies`
}

let hsx = 160;
let hsp = 55;
let hsw = 30;
let hsh = 30;
let hsr = 5;

// Row 3: analogous
for ([color, i] in analog) {
  let x = calc(hsx + i * hsp);
  define PathLayer(`analog_${i}`) #{ fill: color; stroke: #ccc; stroke-width: 0.5; }
  layer(`analog_${i}`).apply {
    roundRect(calc(x - hsw / 2), calc(220 - hsh / 2), hsw, hsh, hsr)
  }
}

// Row 4: triadic
for ([color, i] in triad) {
  let x = calc(hsx + i * hsp);
  define PathLayer(`triad_${i}`) #{ fill: color; stroke: #ccc; stroke-width: 0.5; }
  layer(`triad_${i}`).apply {
    roundRect(calc(x - hsw / 2), calc(275 - hsh / 2), hsw, hsh, hsr)
  }
}

// Row 5: tetradic
for ([color, i] in tetrad) {
  let x = calc(hsx + i * hsp);
  define PathLayer(`tetrad_${i}`) #{ fill: color; stroke: #ccc; stroke-width: 0.5; }
  layer(`tetrad_${i}`).apply {
    roundRect(calc(x - hsw / 2), calc(330 - hsh / 2), hsw, hsh, hsr)
  }
}

// Row 6: splitComplementary
for ([color, i] in split) {
  let x = calc(hsx + i * hsp);
  define PathLayer(`split_${i}`) #{ fill: color; stroke: #ccc; stroke-width: 0.5; }
  layer(`split_${i}`).apply {
    roundRect(calc(x - hsw / 2), calc(385 - hsh / 2), hsw, hsh, hsr)
  }
}

// Harmony row labels
define TextLayer('hlabels') #{
  font-family: system-ui, sans-serif;
  font-size: 10;
  fill: #888;
}
layer('hlabels').apply {
  text(30, 224)`analogous`
  text(30, 279)`triadic`
  text(30, 334)`tetradic`
  text(30, 389)`splitComp.`
}

// Section divider
layer('connectors').apply {
  M 10 420
  L 590 420
}

// ═══════════════════════════════════════════════════════════
// Tier 1b: Palettes
// ═══════════════════════════════════════════════════════════

layer('section-labels').apply {
  text(10, 445)`Palettes`
}

// Row 7: lightness ramp
for ([color, i] in ramp) {
  let x = calc(hsx + i * hsp);
  define PathLayer(`ramp_${i}`) #{ fill: color; stroke: #ccc; stroke-width: 0.5; }
  layer(`ramp_${i}`).apply {
    roundRect(calc(x - hsw / 2), calc(470 - hsh / 2), hsw, hsh, hsr)
  }
}

// Row 8: interpolation
for ([color, i] in interp) {
  let x = calc(hsx + i * hsp);
  define PathLayer(`interp_${i}`) #{ fill: color; stroke: #ccc; stroke-width: 0.5; }
  layer(`interp_${i}`).apply {
    roundRect(calc(x - hsw / 2), calc(525 - hsh / 2), hsw, hsh, hsr)
  }
}

// Palette row labels
layer('hlabels').apply {
  text(30, 474)`palette(c,5)`
  text(30, 529)`palette(a,b,5)`
}

// Section divider
layer('connectors').apply {
  M 10 560
  L 590 560
}

// ═══════════════════════════════════════════════════════════
// Tier 2: Derived Colors
// ═══════════════════════════════════════════════════════════

layer('section-labels').apply {
  text(10, 583)`Derived Colors`
}

let dsx = 260;
let dsp = 70;

// Row 9: triadic[1] → lighten, darken, saturate
define PathLayer('tri1_parent') #{ fill: tri1; stroke: #666; stroke-width: 1; }
layer('tri1_parent').apply {
  roundRect(calc(hsx - hsw / 2), calc(605 - hsh / 2), hsw, hsh, hsr)
}

let derived1 = [tri1Light, tri1Dark, tri1Vivid];
let derived1names = ['lighten', 'darken', 'saturate'];
for ([color, i] in derived1) {
  let x = calc(dsx + i * dsp);
  define PathLayer(`d1_${i}`) #{ fill: color; stroke: #ccc; stroke-width: 0.5; }
  layer(`d1_${i}`).apply {
    roundRect(calc(x - hsw / 2), calc(605 - hsh / 2), hsw, hsh, hsr)
  }
}

// Row 10: ramp[2] → hueShift, complement, alpha
define PathLayer('ramp2_parent') #{ fill: rampMid; stroke: #666; stroke-width: 1; }
layer('ramp2_parent').apply {
  roundRect(calc(hsx - hsw / 2), calc(660 - hsh / 2), hsw, hsh, hsr)
}

let derived2 = [rampShifted, rampComp, rampAlpha];
let derived2names = ['hueShift', 'compl.', 'alpha'];
for ([color, i] in derived2) {
  let x = calc(dsx + i * dsp);
  define PathLayer(`d2_${i}`) #{ fill: color; stroke: #ccc; stroke-width: 0.5; }
  layer(`d2_${i}`).apply {
    roundRect(calc(x - hsw / 2), calc(660 - hsh / 2), hsw, hsh, hsr)
  }
}

// Derived row labels
layer('hlabels').apply {
  text(30, 609)`triad[1] →`
  text(30, 664)`ramp[2] →`
}

// Derived swatch labels
layer('labels').apply {
  for ([name, i] in derived1names) {
    text(calc(dsx + i * dsp), calc(605 + hsh / 2 + 12))`${name}`
  }
  for ([name, i] in derived2names) {
    text(calc(dsx + i * dsp), calc(660 + hsh / 2 + 12))`${name}`
  }
}

// ── Connecting lines (reactivity chain) ──────────────────

layer('connectors').apply {
  // Vertical from base swatch down to tier 1 divider
  M sx calc(50 + sh / 2)
  L sx 170

  // Connector: triadic[1] down to derived row 9
  M calc(hsx + 1 * hsp) calc(275 + hsh / 2)
  L calc(hsx + 1 * hsp) calc(605 - hsh / 2 - 5)
  L hsx calc(605 - hsh / 2 - 5)
  L hsx calc(605 - hsh / 2)

  // Arrow: parent → derived in row 9
  M calc(hsx + hsw / 2) 605
  L calc(dsx - hsw / 2) 605

  // Connector: ramp[2] down to derived row 10
  M calc(hsx + 2 * hsp) calc(470 + hsh / 2)
  L calc(hsx + 2 * hsp) calc(660 - hsh / 2 - 5)
  L hsx calc(660 - hsh / 2 - 5)
  L hsx calc(660 - hsh / 2)

  // Arrow: parent → derived in row 10
  M calc(hsx + hsw / 2) 660
  L calc(dsx - hsw / 2) 660
}
```

Compile with: `pathogen-lang --output-svg-file=swatches.svg --viewBox="0 0 600 700" --width="600" --height="700"`

## Static Methods

### Color.mix(c1, c2, ratio)

Mix two colors at a given ratio (0 = all c1, 1 = all c2):

```
let a = Color('#e63946');
let b = Color('#457b9d');
let mid = Color.mix(a, b, 0.5);
```

### Color.palette(color, n)

Generate a lightness ramp of `n` colors from dark (L=0.15) to light (L=0.95), preserving hue and chroma:

```
let c = Color('#e63946');
let shades = Color.palette(c, 5);   // 5 shades from dark to light
```

### Color.palette(c1, c2, n)

Generate `n` evenly interpolated colors between two colors:

```
let a = Color('#e63946');
let b = Color('#457b9d');
let gradient = Color.palette(a, b, 7);   // 7-step gradient
```

`n` must be an integer >= 2.

### Color.lightDark(light, dark)

Create a theme-aware color that uses CSS `light-dark()` in style output:

```
let fg = Color.lightDark(Color('#333'), Color('#eee'));
// Style output: light-dark(#333333, #eeeeee)
```

Works with CSSVar-backed colors for full customizability:

```
let fg = Color.lightDark(
  Color(CSSVar('--fg-light', '#333')),
  Color(CSSVar('--fg-dark', '#eee'))
);
// Style output: light-dark(var(--fg-light, #333), var(--fg-dark, #eee))
```

Both arguments must be Colors. At compile time, `.hex`, `.lightness`, and other properties resolve to the **light** variant. Method calls (`.lighten()`, `.hueShift()`, etc.) operate on the light variant and lose the light-dark semantics.

## @property Declarations

When you create a `Color(CSSVar('--name', fallback))`, the compiler automatically collects a CSS `@property` declaration for that custom property. This enables browsers to interpolate the property in transitions and animations.

The collected declarations appear in `CompileResult.cssProperties` and are emitted as a `<style>` block in CLI SVG output:

```xml
<svg ...>
  <style>
    @property --base-color {
      syntax: "<color>";
      inherits: true;
      initial-value: #e63946;
    }
  </style>
  ...
</svg>
```

Only Color-typed CSSVars produce `@property` declarations — plain `CSSVar('--width', 2)` does not. When the same variable name appears multiple times, the first occurrence wins.

## Style Block Auto-Conversion

Colors auto-convert to CSS strings when used in style blocks:

```
let primary = Color('#e63946');
let light = primary.lighten(0.2);

layer PathLayer('main') #{
  stroke: primary;
  fill: light;
}
```

This outputs `stroke="#e63946"` and `fill` as the lightened hex value — no `.css` property needed.

## Template Literals

Colors display as `Color(#hex)` in template literals and `log()`:

```
let c = Color('#e63946');
log(c);              // Color(#e63946)
log(`color: ${c}`);  // color: Color(#e63946)
```

## Roundtrip Fidelity

Standard CSS colors roundtrip exactly:

```
let c = Color('#ff0000');
log(c.hex);  // #ff0000
```

## Named Colors

All 148 CSS named colors are supported:

```
let c = Color('coral');
let c = Color('dodgerblue');
let c = Color('mediumseagreen');
```

Named color lookup is case-insensitive.

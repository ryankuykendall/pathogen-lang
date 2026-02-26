# Color Type

The `Color` type provides first-class color manipulation in OKLCH color space. Colors are resolved at compile time to concrete CSS values.

## Constructor

Create colors from any CSS color format:

```
let c = Color('#e63946');              // hex (3, 6, or 8 digit)
let c = Color('red');                  // named CSS color (all 148)
let c = Color('rgb(255, 0, 0)');       // rgb/rgba
let c = Color('hsl(0, 100%, 50%)');    // hsl/hsla
let c = Color('oklch(0.6 0.15 30)');   // oklch
let c = Color(0.6, 0.15, 30);         // direct OKLCH (L, C, H)
let c = Color(0.6, 0.15, 30, 0.5);    // OKLCH + alpha
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

### Hue

```
let c = Color('#e63946');
let shifted = c.hueShift(180);   // shift hue by 180°
let comp = c.complement();       // shorthand for hueShift(180)
```

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

## Static Methods

### Color.mix(c1, c2, ratio)

Mix two colors at a given ratio (0 = all c1, 1 = all c2):

```
let a = Color('#e63946');
let b = Color('#457b9d');
let mid = Color.mix(a, b, 0.5);
```

## Style Block Auto-Conversion

Colors auto-convert to CSS strings when used in style blocks:

```
let primary = Color('#e63946');
let light = primary.lighten(0.2);

layer PathLayer('main') ${
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

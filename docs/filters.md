# Filters

Filters apply post-render visual effects — film grain, paper texture, glow, emboss, layered depth shadows, inner shadows, pixelation — to any layer. Native CSS filter functions like `blur(2px)` and `brightness(1.2)` already work directly inside a style block. **Custom filters** go further: each one synthesizes a real `<filter>` definition in the output SVG with a thoughtfully tuned chain of primitives, so you get the look you want without writing `<feTurbulence>`, `<feSpecularLighting>`, `<feMorphology>`, or `<feMerge>` by hand.

Pathogen ships seven custom filter constructors:

- [`NoiseFilter`](#filters-noisefilter) — grain, paper, speckle, TV static, grainy gradient
- [`GlowFilter`](#filters-glowfilter) — soft outer or inner glow
- [`EmbossFilter`](#filters-embossfilter) — light-source-based embossed surface
- [`ElevationShadowFilter`](#filters-elevationshadowfilter) — Material-style layered depth shadow
- [`InnerShadowFilter`](#filters-innershadowfilter) — inset shadow (no native CSS equivalent)
- [`PixelateFilter`](#filters-pixelatefilter) — mosaic / pixelation
- [`MotionBlurFilter`](#filters-motionblurfilter) — directional and progressive blur (no native CSS equivalent)

Custom filters live in the shared `<defs>` block alongside [gradients](./gradients.md), patterns, masks, and [markers](./markers.md), and are referenced via `url(#id)`. They compile to stock SVG filter primitives, so they render identically in the CLI, the playground, and the VS Code preview — with one documented exception for progressive motion blur in non-Chromium engines (see [MotionBlurFilter](#filters-motionblurfilter)).

## NoiseFilter

`NoiseFilter()` produces grain, paper texture, speckle, TV static, or a grainy gradient overlay. A single `style` enum picks the recipe; everything else is an optional knob.

```
let grain = NoiseFilter() {|f|
  f.style = NoiseFilterStyle.Grain;
};

define PathLayer('portrait') ${
  fill: oklch(70% 0.18 30);
  filter: grain;
}

layer('portrait').apply {
  M 50 50
  C 50 100 150 100 150 50
  Z
}
```

Constructor signature: `NoiseFilter()` — no positional arguments. The trailing block `{|f| ... }` binds the new filter to `f`; assign properties on `f` to override the preset's defaults.

The filter can be reused: a single `let grain = NoiseFilter() {...};` followed by `filter: grain;` on N layers emits **one** `<filter>` definition referenced N times. An anonymous inline form `filter: NoiseFilter();` (with default Grain settings) also works. The inline form does **not** support the trailing configuration block — `filter: NoiseFilter() {|f| ...; };` will not parse because the style-block tokenizer stops at the first `;`. Assign to a `let` binding when you need to customise.

## NoiseFilterStyle Presets

`style` selects the primitive chain and a parameter baseline. Override individual properties on `f` after setting `style` to fine-tune.

| Style | Visual | Best for |
|-------|--------|----------|
| `Grain` | Fine, color-burned grain that respects the source colors | Photographic illustrations, portraits |
| `Paper` | Soft multiplicative texture | Posters, document mockups, bookplate art |
| `Speckle` | Coarse, irregular flecks | Risograph, screen-print effects |
| `Static` | Sharp, high-contrast monochrome noise | TV static, glitch backgrounds |
| `Gradient` | Stitched fractal noise pumped with contrast and overlaid | Grainy gradients, atmospheric backgrounds |

### Per-Style Defaults

The chain shape is the same across all five styles (see [Generated SVG Output](#filters-generated-svg-output)); per-style differences come from these defaults. Every value is overridable on the bound parameter.

| Style | turbulence type | `scale` | `octaves` | `amount` | `monochrome` | `blend` | `contrast` | `stitch` |
|---|---|---|---|---|---|---|---|---|
| `Grain` | `fractalNoise` | 5.0 | 6 | 0.4 | true | `color-burn` | 1.0 | false |
| `Paper` | `fractalNoise` | 1.0 | 3 | 0.5 | true | `multiply` | 1.0 | false |
| `Speckle` | `turbulence` | 0.3 | 2 | 0.6 | false | `multiply` | 1.0 | false |
| `Static` | `fractalNoise` | 5.0 | 8 | 0.7 | true | `hard-light` | 1.0 | false |
| `Gradient` | `fractalNoise` | 1.0 | 3 | 0.6 | false | `overlay` | 1.7 | true |

```
let grainy = NoiseFilter() {|f| f.style = NoiseFilterStyle.Grain; };
let paper  = NoiseFilter() {|f| f.style = NoiseFilterStyle.Paper; };
let flecks = NoiseFilter() {|f| f.style = NoiseFilterStyle.Speckle; };
let snow   = NoiseFilter() {|f| f.style = NoiseFilterStyle.Static; };
let smudge = NoiseFilter() {|f| f.style = NoiseFilterStyle.Gradient; };
```

If `style` is omitted, the filter defaults to `Grain`.

## Properties

After construction, properties on the bound parameter can be reassigned. Defaults come from the chosen `style`; user assignments take precedence.

| Property | Type | Default | Effect |
|---|---|---|---|
| `style` | `NoiseFilterStyle` | `Grain` | Selects the primitive chain and per-property defaults |
| `scale` | number or `NoiseFilterScale` | per `style` | Grain density. `scale` maps directly to SVG `baseFrequency`: higher number → finer, denser pattern; lower number → larger, coarser features. Use the `NoiseFilterScale` enum for common values (see the table below the property list), or assign a finite positive number directly |
| `octaves` | integer 1–10 | per `style` | Layered noise frequencies. 1 = single smooth pattern; 8+ = fine fractal detail. Each octave compounds render cost — see [Browser Caveats](#filters-browser-caveats) |
| `amount` | number 0–1 | per `style` | Visible intensity. `0` = no effect; `1` = full strength. Modulates the alpha of the noise before it blends with the source |
| `monochrome` | boolean | per `style` | When true, strips color variance via `feColorMatrix luminanceToAlpha` so the grain reads as pure light/dark texture |
| `seed` | number | derived from `id` | Deterministic seed for `feTurbulence`. See **Seed stability** below |
| `blend` | `BlendMode` | per `style` | Final blend mode against the source graphic |
| `contrast` | number ≥ 0 | per `style` (`1.0`, `1.7` for `Gradient`) | Post-noise contrast pump. `1` = no pump; higher values produce sharper, sparkier grain. Insert point is just after `feTurbulence`, so it affects every style |
| `stitch` | boolean | per `style` (`true` for `Gradient`, `false` otherwise) | When true, sets `stitchTiles="stitch"` to avoid visible tiling seams across large surfaces or repeating textures |

```
let pronounced = NoiseFilter() {|f|
  f.style = NoiseFilterStyle.Grain;
  f.amount = 0.7;                       // stronger
  f.scale = NoiseFilterScale.Medium;    // coarser than the Grain default
  f.monochrome = false;                 // keep some color variance
  f.seed = 42;                          // pin to a specific noise seed
};
```

### NoiseFilterScale

`NoiseFilterScale` packages the three common `scale` values so they're discoverable through IDE autocompletion. The members evaluate to the same string values the `scale` write handler accepts directly, so `f.scale = NoiseFilterScale.Fine` and `f.scale = 'fine'` are equivalent.

| Member | Underlying value | `baseFrequency` |
|---|---|---|
| `NoiseFilterScale.Fine` | `'fine'` | 5.0 |
| `NoiseFilterScale.Medium` | `'medium'` | 1.0 |
| `NoiseFilterScale.Coarse` | `'coarse'` | 0.3 |

For values outside these three buckets, assign a finite positive number directly: `f.scale = 2.5;`.

### Seed Stability

`seed` defaults to a deterministic hash of the filter's auto-generated `id`. The id follows the pattern `pathogen-noise-N`, where `N` is the 1-based index of the `NoiseFilter()` call in evaluation order. As long as your source file doesn't reorder, add, or remove `NoiseFilter()` declarations, the seed (and the noise pattern) is stable across compiles.

The footgun: adding a new `NoiseFilter()` above an existing one shifts every subsequent filter's auto-id, which shifts every derived seed, which visibly changes every existing grain pattern. Set `seed` explicitly on any filter whose noise pattern you want to lock down across future edits:

```
let signature = NoiseFilter() {|f|
  f.style = NoiseFilterStyle.Grain;
  f.seed = 42;   // stable across edits regardless of declaration order
};
```

## Reading Properties

`NoiseFilter` values support read-side property access — useful for reusing the same id elsewhere, conditional logic, or debug output:

```
let grain = NoiseFilter() {|f|
  f.style = NoiseFilterStyle.Speckle;
  f.amount = 0.6;
};

log(grain.id);       // → "pathogen-noise-1"
log(grain.style);    // → "speckle"
log(grain.amount);   // → 0.6
log(grain.blend);    // → "multiply"
```

All properties from the table above are readable.

## GlowFilter

`GlowFilter()` produces a soft glow around (or inside) a painted shape. The `mode` property picks outer vs. inner; the rest of the knobs are color, radius, spread, and opacity.

```
let glow = GlowFilter() {|f|
  f.mode = GlowMode.Outer;
  f.color = oklch(85% 0.20 60);
  f.radius = 8;
  f.opacity = 0.8;
};

define PathLayer('star') ${
  fill: oklch(70% 0.20 30);
  filter: glow;
}
layer('star').apply { star(100, 100, 50, 22, 5); }
```

Constructor signature: `GlowFilter()` — no positional arguments. The trailing block `{|f| ... }` binds the new filter to `f`.

### Properties

| Property | Type | Default | Effect |
|---|---|---|---|
| `mode` | `GlowMode` | `GlowMode.Outer` | Outer halo (default) or inner light along the inside edge of the shape |
| `color` | `Color` | white | Glow color |
| `radius` | number ≥ 0 | 4 | Blur radius (`stdDeviation`); larger values produce a softer, wider glow |
| `spread` | number ≥ 0 | 0 | Pre-blur morphology: dilates (Outer mode) or erodes (Inner mode) the silhouette before blurring |
| `opacity` | number 0–1 | 0.8 | Glow strength |

### Generated SVG Output

For `GlowFilter() {|f| f.mode = GlowMode.Outer; f.color = oklch(85% 0.20 60); f.radius = 8; }`:

```xml
<filter id="pathogen-glow-1" x="-50%" y="-50%" width="200%" height="200%">
  <feGaussianBlur in="SourceAlpha" stdDeviation="8" result="blur"/>
  <feFlood flood-color="#ffa800" flood-opacity="0.8" result="flood"/>
  <feComposite in="flood" in2="blur" operator="in" result="coloredGlow"/>
  <feMerge>
    <feMergeNode in="coloredGlow"/>
    <feMergeNode in="SourceGraphic"/>
  </feMerge>
</filter>
```

(The OKLCH color literal is resolved to a hex string at compile time, so the emitted SVG contains a concrete color value rather than a `oklch(...)` CSS function.)

When `spread > 0`, an extra `feMorphology` is inserted before `feGaussianBlur` to expand (Outer) or contract (Inner) the silhouette. In Inner mode, a `feComposite operator="out"` step inverts the blur so the glow rides the inside edge.

The filter region is `-50% / 200%` so outer glows have room to extend beyond the painted bounds.

## EmbossFilter

`EmbossFilter()` produces an embossed appearance via SVG's `feSpecularLighting` primitive — the painted shape catches simulated light from a distant source and gains highlights along the lit edges.

```
let emboss = EmbossFilter() {|f|
  f.angle = 135deg;
  f.depth = 3;
  f.strength = 1.0;
};

define PathLayer('badge') ${
  fill: oklch(75% 0.15 60);
  filter: emboss;
}
layer('badge').apply { circle(100, 100, 60); }
```

Constructor signature: `EmbossFilter()` — no positional arguments. Configure via the trailing block.

### Properties

| Property | Type | Default | Effect |
|---|---|---|---|
| `angle` | angle (deg/rad/pi) | `135deg` | Azimuth of the light source. `0deg` = right; `90deg` = top; `180deg` = left; `270deg` = bottom |
| `elevation` | angle | `45deg` | Light elevation (`feDistantLight elevation`). Lower values flatten the highlight; 90° is overhead |
| `depth` | number ≥ 0 | 2 | `surfaceScale` — visual depth of the bevel |
| `strength` | number ≥ 0 | 0.8 | `specularConstant` — brightness of the highlight |
| `shininess` | number ≥ 1 | 20 | `specularExponent` — sharpness of the highlight (higher = tighter) |
| `lightColor` | `Color` | white | Color of the simulated light |
| `smooth` | number ≥ 0 | 1 | Pre-blur `stdDeviation` for softer bevel edges; `0` disables |

### Generated SVG Output

For `EmbossFilter() {|f| f.angle = 135deg; f.depth = 3; f.strength = 1.0; }`:

```xml
<filter id="pathogen-emboss-1" x="-10%" y="-10%" width="120%" height="120%">
  <feGaussianBlur in="SourceAlpha" stdDeviation="1" result="blur"/>
  <feSpecularLighting in="blur" surfaceScale="3" specularConstant="1" specularExponent="20" lighting-color="rgb(255, 255, 255)" result="spec">
    <feDistantLight azimuth="135" elevation="45"/>
  </feSpecularLighting>
  <feComposite in="spec" in2="SourceAlpha" operator="in" result="masked"/>
  <feComposite in="SourceGraphic" in2="masked" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>
</filter>
```

The final `feComposite arithmetic` adds the masked highlight on top of `SourceGraphic`, so the original colors show through everywhere except where the bevel catches light.

## ElevationShadowFilter

`ElevationShadowFilter()` produces a Material Design–style depth shadow: three stacked soft shadow layers (tight, mid, soft) tuned by a single `elevation` knob. The result reads as **physical depth** rather than the single offset shadow CSS `drop-shadow()` provides.

```
let card = ElevationShadowFilter() {|f|
  f.elevation = 6;
  f.color = oklch(20% 0.02 280);
};

define PathLayer('card') ${
  fill: white;
  filter: card;
}
layer('card').apply { roundRect(40, 60, 120, 80, 12); }
```

Constructor signature: `ElevationShadowFilter()` — no positional arguments. Configure via the trailing block.

### Properties

| Property | Type | Default | Effect |
|---|---|---|---|
| `elevation` | number 0–24 | 4 | Depth from the surface. `0` = flat (no shadow emitted); `2` = resting card; `8+` = pronounced lift |
| `color` | `Color` | near-black | Shadow color (blended with the three layer opacities) |
| `direction` | angle | `90deg` | Direction the shadow falls toward; `90deg` = down (the most common) |
| `tightness` | number ≥ 0 | 1.0 | Scales the per-layer distance/blur ratios. `0.5` = tighter, crisper depth; `2.0` = wider, hazier |

### Layer Decomposition

`elevation` parameterizes three drop-shadow-equivalent layers. Offsets are projected along `direction` (default `90deg` = positive Y):

| Layer | offset (× `elevation × tightness`) | blur stdDeviation (× `elevation × tightness`) | opacity multiplier |
|---|---|---|---|
| tight | 0.3 | 0.5 | 0.30 |
| mid | 0.6 | 1.0 | 0.18 |
| soft | 1.0 | 2.0 | 0.12 |

### Generated SVG Output

For `ElevationShadowFilter() {|f| f.elevation = 6; f.color = oklch(20% 0.02 280); }`:

```xml
<filter id="pathogen-elevation-shadow-1" x="-100%" y="-100%" width="300%" height="300%">
  <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="b1"/>
  <feOffset in="b1" dx="0" dy="1.8" result="o1"/>
  <feFlood flood-color="#14151f" flood-opacity="0.3" result="f1"/>
  <feComposite in="f1" in2="o1" operator="in" result="s1"/>
  <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="b2"/>
  <feOffset in="b2" dx="0" dy="3.6" result="o2"/>
  <feFlood flood-color="#14151f" flood-opacity="0.18" result="f2"/>
  <feComposite in="f2" in2="o2" operator="in" result="s2"/>
  <feGaussianBlur in="SourceAlpha" stdDeviation="12" result="b3"/>
  <feOffset in="b3" dx="0" dy="6" result="o3"/>
  <feFlood flood-color="#14151f" flood-opacity="0.12" result="f3"/>
  <feComposite in="f3" in2="o3" operator="in" result="s3"/>
  <feMerge>
    <feMergeNode in="s1"/>
    <feMergeNode in="s2"/>
    <feMergeNode in="s3"/>
    <feMergeNode in="SourceGraphic"/>
  </feMerge>
</filter>
```

The filter region expands to `-100% / 300%` so the softest layer's blur fits without clipping at typical elevations on typical shapes. For very small painted regions (e.g., 20px on a 200px viewport) combined with high `elevation` values, the soft layer's blur radius can still exceed the filter region; the shadow will appear clipped at the boundary. Either reduce `elevation` or render the shape into a larger painted region.

When `elevation = 0`, the filter is emitted but the three shadow layers are suppressed — the output is just `SourceGraphic`.

## InnerShadowFilter

`InnerShadowFilter()` produces an inset shadow — the capability CSS `drop-shadow()` cannot express. Use it for pressed/recessed UI elements, embossed text wells, or carved-look graphics.

```
let press = InnerShadowFilter() {|f|
  f.offsetX = 0;
  f.offsetY = 3;
  f.blur = 4;
  f.color = oklch(20% 0.02 280);
  f.opacity = 0.5;
};

define PathLayer('button') ${
  fill: oklch(80% 0.06 230);
  filter: press;
}
layer('button').apply { roundRect(40, 80, 120, 40, 12); }
```

Constructor signature: `InnerShadowFilter()` — no positional arguments. Configure via the trailing block.

### Properties

| Property | Type | Default | Effect |
|---|---|---|---|
| `offsetX` | number | 0 | Horizontal offset (positive = right). The shadow appears on the opposite side of the offset, like light coming from that direction |
| `offsetY` | number | 2 | Vertical offset (positive = down) |
| `blur` | number ≥ 0 | 4 | Blur `stdDeviation` |
| `color` | `Color` | near-black | Shadow color |
| `opacity` | number 0–1 | 0.5 | Shadow strength |

### Generated SVG Output

For `InnerShadowFilter() {|f| f.offsetX = 0; f.offsetY = 3; f.blur = 4; f.color = oklch(20% 0.02 280); f.opacity = 0.5; }`:

```xml
<filter id="pathogen-inner-shadow-1" x="-10%" y="-10%" width="120%" height="120%">
  <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur"/>
  <feOffset in="blur" dx="0" dy="3" result="offset"/>
  <feComposite in="SourceAlpha" in2="offset" operator="out" result="inverted"/>
  <feFlood flood-color="#14151f" flood-opacity="0.5" result="flood"/>
  <feComposite in="flood" in2="inverted" operator="in" result="innerShadow"/>
  <feComposite in="innerShadow" in2="SourceAlpha" operator="in" result="clipped"/>
  <feMerge>
    <feMergeNode in="SourceGraphic"/>
    <feMergeNode in="clipped"/>
  </feMerge>
</filter>
```

The final `feComposite SourceAlpha in` step clips the shadow to the original silhouette so it doesn't bleed past the shape's edge. The filter region stays at `-10% / 120%` since the shadow is bounded by the source.

## PixelateFilter

`PixelateFilter()` produces a mosaic / pixelation effect by sampling tiny points across the painted region and dilating each sample into a square block. Useful for retro pixel-art looks, blurred-out faces, and low-res rendering effects.

```
// Positional form (canonical):
let pix = PixelateFilter(12, 12, 6);

define PathLayer('portrait') ${
  fill: oklch(70% 0.18 30);
  filter: pix;
}
layer('portrait').apply { circle(100, 100, 60); }
```

Constructor signature: `PixelateFilter(width, height, radius)` — three positional numbers, **or** no arguments with a trailing block setting the same three properties:

```
// Block form (consistent with the other filter constructors):
let pix = PixelateFilter() {|f|
  f.width = 12;
  f.height = 12;
  f.radius = 6;
};
```

Mixing the two forms (positional arguments **and** a trailing block) is an error.

### Properties

| Property | Type | Default | Effect |
|---|---|---|---|
| `width` | number > 0 | 10 | Horizontal stride between sampled pixels (= horizontal block size in the output) |
| `height` | number > 0 | 10 | Vertical stride between sampled pixels |
| `radius` | number > 0 | 5 | Dilation radius. `radius = width / 2` produces blocks that just touch; larger values cause overlap, smaller leaves gaps |

### Generated SVG Output

For `PixelateFilter(12, 12, 6)`:

```xml
<filter id="pathogen-pixelate-1" x="0%" y="0%" width="100%" height="100%" filterUnits="userSpaceOnUse">
  <feFlood x="3" y="3" width="2" height="2" flood-color="#000"/>
  <feComposite width="12" height="12"/>
  <feTile result="a"/>
  <feComposite in="SourceGraphic" in2="a" operator="in"/>
  <feMorphology operator="dilate" radius="6"/>
</filter>
```

The 2×2 flood positioned at `(radius/2, radius/2)` is the sample-positioning fragment. `feComposite` widens it to one tile cell (`width × height`), `feTile` repeats it across the filter region, the second `feComposite in` keeps only the source pixels that land inside the tiled samples, and `feMorphology dilate` expands each kept sample into a block.

The filter uses `filterUnits="userSpaceOnUse"` (instead of the default `objectBoundingBox`) so the literal pixel coordinates on `feFlood` / `feComposite` / `feMorphology` are interpreted as user-space distances rather than fractions of the source's bounding box. The region is `0% / 100%` of the viewport — `userSpaceOnUse` makes `%` relative to the SVG viewport.

## MotionBlurFilter

`MotionBlurFilter()` adds directional and progressive blur — effects CSS cannot express today (they are still only a [proposal](https://github.com/w3c/csswg-drafts/issues/11134)). Pathogen synthesizes them from SVG filter primitives. Linear blur renders in every SVG engine; Progressive blur relies on `feImage` and needs a Chromium-class engine (see [Renderer support](#filters-renderer-support) below). Two `type`s are available:

- **`Linear`** — a directional smear along an angle, the way a fast-moving object blurs along its path of travel.
- **`Progressive`** — blur that ramps across the element (sharp at one edge, increasingly blurred toward the other), the "variable blur" popularized by iOS frosted surfaces.

```
let smear = MotionBlurFilter() {|f|
  f.type = MotionBlurType.Linear;
  f.distance = 20;
  f.angle = 30deg;
  f.samples = 12;
};

define PathLayer('car') ${
  fill: oklch(60% 0.2 250);
  filter: smear;
}
layer('car').apply { roundRect(40, 80, 120, 40, 8); }
```

Constructor signature: `MotionBlurFilter()` — no positional arguments. Configure via the trailing block.

`distance` and `angle` use the same coordinate conventions as the rest of the language: `distance` is in **user-space units** (the same units as your `viewBox`, *not* CSS pixels), and `angle` takes an angle unit — `0deg` points right (+x), `90deg` points down (+y), matching `EmbossFilter` and `ElevationShadowFilter`.

### Properties

| Property | Type | Default | Effect |
|---|---|---|---|
| `type` | `MotionBlurType` | `Linear` | `Linear` (directional smear) or `Progressive` (spatial ramp) |
| `distance` | number ≥ 0 | 10 | **Linear:** smear length. **Progressive:** maximum blur radius at the far edge |
| `angle` | number (angle unit) | `0deg` | **Linear:** smear direction. **Progressive:** ramp direction (sharp → blurred) |
| `samples` | integer 2–32 | 12 | Tap count / quality. **Linear only** — Progressive is continuous and ignores it. Higher = smoother smear at more cost |

### Generated SVG Output — Linear

For `MotionBlurFilter() {|f| f.type = MotionBlurType.Linear; f.distance = 20; f.angle = 30deg; f.samples = 4; }` (`samples = 4` reduced from the default of 12 for a readable chain):

```xml
<filter id="pathogen-motion-blur-1" x="-50%" y="-50%" width="200%" height="200%">
  <feOffset in="SourceGraphic" dx="-8.660254" dy="-5" result="t0o"/>
  <feComponentTransfer in="t0o" result="acc0"><feFuncA type="linear" slope="0.25"/></feComponentTransfer>
  <feOffset in="SourceGraphic" dx="-2.886751" dy="-1.666667" result="t1o"/>
  <feComponentTransfer in="t1o" result="t1s"><feFuncA type="linear" slope="0.25"/></feComponentTransfer>
  <feComposite in="acc0" in2="t1s" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="acc1"/>
  <feOffset in="SourceGraphic" dx="2.886751" dy="1.666667" result="t2o"/>
  <feComponentTransfer in="t2o" result="t2s"><feFuncA type="linear" slope="0.25"/></feComponentTransfer>
  <feComposite in="acc1" in2="t2s" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="acc2"/>
  <feOffset in="SourceGraphic" dx="8.660254" dy="5" result="t3o"/>
  <feComponentTransfer in="t3o" result="t3s"><feFuncA type="linear" slope="0.25"/></feComponentTransfer>
  <feComposite in="acc2" in2="t3s" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="acc3"/>
  <feGaussianBlur in="acc3" stdDeviation="5.196152 3"/>
</filter>
```

Physical motion blur is the *average* of the source translated along the motion vector over the shutter interval. Each of the `samples` taps is one `feOffset` copy, centered on the source (`t ∈ [-0.5, +0.5]` so the smear is symmetric rather than a one-sided ghost). Each tap is scaled to `1/samples` alpha by `feFuncA slope`, and the taps are **summed** with `feComposite operator="arithmetic"` (`k2=k3=1`). Summation — not `feMerge` — is what makes it a true average: `feMerge` over-composites, biasing the result toward the last tap and brightening it.

A finite number of taps would otherwise read as discrete ghost copies on a hard-edged shape, so a final `feGaussianBlur` fuses them into a continuous smear. Its `stdDeviation` is a **two-value, direction-aligned** blur (`stdDeviation="σ·cos σ·sin"`, here `30°` → `"5.196 3"`) sized to the tap spacing — it blurs *along* the motion to merge the copies while leaving the perpendicular edge (the object's cross-section) crisp. A higher `samples` count tightens the tap spacing and shrinks this smoothing automatically.

### Generated SVG Output — Progressive

For `MotionBlurFilter() {|f| f.type = MotionBlurType.Progressive; f.distance = 8; f.angle = 90deg; }`:

```xml
<linearGradient id="pathogen-motion-blur-1-ramp" x1="0.5" y1="0" x2="0.5" y2="1" gradientUnits="objectBoundingBox">
  <stop offset="0" stop-color="#000" stop-opacity="0"/>
  <stop offset="1" stop-color="#000" stop-opacity="1"/>
</linearGradient>
<rect id="pathogen-motion-blur-1-mask" x="0" y="0" width="100%" height="100%" fill="url(#pathogen-motion-blur-1-ramp)"/>
<filter id="pathogen-motion-blur-1" x="-10%" y="-10%" width="120%" height="120%">
  <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blurred"/>
  <feImage href="#pathogen-motion-blur-1-mask" result="ramp"/>
  <feComponentTransfer in="ramp" result="invRamp"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer>
  <feComposite in="SourceGraphic" in2="invRamp" operator="in" result="sharpPart"/>
  <feComposite in="blurred" in2="ramp" operator="in" result="blurPart"/>
  <feComposite in="sharpPart" in2="blurPart" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>
</filter>
```

Progressive blur **crossfades** the sharp source and a blurred copy along a gradient. The sibling `<linearGradient>` runs in `objectBoundingBox` units, and the mask `<rect>` fills 100% of it, so the ramp automatically tracks the **element's own bounding box** — a small element gets the full sharp→blurred ramp across its own extent, not the viewport's. The `feImage` pulls that ramp into the filter; the sharp source is masked by the inverted ramp and the blurred copy by the ramp, so the near edge shows only the sharp pixels and the far edge only the blur. The two halves are **summed** with `feComposite operator="arithmetic"` rather than merged: the masks are exact complements (`invRamp + ramp = 1`), so the sum holds full opacity across the crossfade — a plain `feMerge` would over-composite and dip a solid shape to ~75% alpha through the midband, lightening it. The region is kept tight (`-10% / 120%`) because an oversized region would compress the ramp to a middle band and wash the effect out. Because the gradient vector is set from `angle`, any direction works (a non-square element skews a diagonal ramp slightly, an inherent `objectBoundingBox` gradient behavior).

### Renderer support

> The limitation is about the **rendering engine**, not which surface or embedding you use. Progressive blur relies on `feImage` referencing a local gradient. In **Chromium-class engines** (Chrome, Edge, and the Electron-based VS Code preview) it renders correctly in every context we tested — inline in a page, embedded as `<img>`, and rasterized to a canvas (so playground previews and PNG thumbnails are fine). Support is **weaker in non-Chromium engines, notably Firefox**, where progressive blur may not render as intended; because the playground and CLI output delegate `feImage` to the host browser, that applies wherever the output is opened in such an engine. **If you need Progressive blur to be engine-independent, prerender the blurred region as a raster, or fall back to `Linear`**, which uses only `feOffset` / `feComposite` and renders everywhere. This is the same class of cross-engine filter concern covered in [Browser Caveats](#filters-browser-caveats).

## BlendMode

`BlendMode` is a regular built-in enum — usable anywhere a CSS blend-mode keyword is expected.

| Member | CSS keyword |
|---|---|
| `BlendMode.Normal` | `normal` |
| `BlendMode.Multiply` | `multiply` |
| `BlendMode.Screen` | `screen` |
| `BlendMode.Overlay` | `overlay` |
| `BlendMode.ColorBurn` | `color-burn` |
| `BlendMode.ColorDodge` | `color-dodge` |
| `BlendMode.HardLight` | `hard-light` |
| `BlendMode.SoftLight` | `soft-light` |
| `BlendMode.Darken` | `darken` |
| `BlendMode.Lighten` | `lighten` |
| `BlendMode.Difference` | `difference` |
| `BlendMode.Exclusion` | `exclusion` |

```
let custom = NoiseFilter() {|f|
  f.style = NoiseFilterStyle.Paper;
  f.blend = BlendMode.SoftLight;
};
```

## GlowMode

`GlowMode` selects the kind of glow a `GlowFilter` produces.

| Member | String value | Effect |
|---|---|---|
| `GlowMode.Outer` | `outer` | Glow halo extends outward from the painted silhouette |
| `GlowMode.Inner` | `inner` | Glow rides along the inside edge of the painted silhouette |

```
let halo = GlowFilter() {|f|
  f.mode = GlowMode.Outer;
  f.color = oklch(85% 0.20 60);
  f.radius = 10;
};

let edge = GlowFilter() {|f|
  f.mode = GlowMode.Inner;
  f.color = white;
  f.radius = 4;
};
```

## MotionBlurType

`MotionBlurType` selects which blur a `MotionBlurFilter` produces.

| Member | String value | Effect |
|---|---|---|
| `MotionBlurType.Linear` | `linear` | Directional smear along `angle` — averaged offset copies |
| `MotionBlurType.Progressive` | `progressive` | Blur ramps across the element along `angle`, sharp edge → blurred edge |

```
let pan = MotionBlurFilter() {|f|
  f.type = MotionBlurType.Linear;
  f.distance = 28;
  f.angle = 0deg;
};

let frosted = MotionBlurFilter() {|f|
  f.type = MotionBlurType.Progressive;
  f.distance = 10;
  f.angle = 90deg;
};
```

## Using a Filter in a Style Block

Reference a filter the same way you reference a gradient or marker — by assignment to the `filter` property:

```
let grain = NoiseFilter() {|f| f.style = NoiseFilterStyle.Grain; };

define PathLayer('disc') ${
  fill: oklch(80% 0.15 50);
  filter: grain;            // → filter="url(#auto-id)"
}
```

The `filter` style property is auto-wrapping: when assigned a `NoiseFilter` value, the style-block evaluator converts it to `url(#id)` automatically. You can also reference it explicitly via `filter: url(#${grain.id})` (using the `.id` read), or use the raw id literal if you happen to know it.

## Layering with Native CSS Filters

A single `filter:` declaration accepts **either** a `NoiseFilter` value **or** a chain of native CSS filter functions like `blur(2px) brightness(1.2)` — not both at once. To combine custom and native filters, nest the layer in a [`GroupLayer`](./layers.md):

> **Native CSS syntax — spaces, not commas.** CSS filter functions are space-separated: `drop-shadow(4px 4px 8px oklch(0.65 0.26 357))`, and chains are space-separated too: `blur(2px) brightness(1.2)`. Writing Pathogen-style commas (`drop-shadow(4px, 4px, 4px, color)`) is a compile error with a fix-it message — previously this silently emitted invalid CSS that browsers dropped. See [CSS Function Values](syntax.md#css-function-values). The editor suggests correctly-shaped filter functions and any in-scope filter variables after `filter:`.

```
let grain = NoiseFilter() {|f| f.style = NoiseFilterStyle.Grain; };

let inner = PathLayer('inner') ${
  fill: hotpink;
  filter: grain;
};
layer('inner').apply { circle(100, 100, 60); }

let halo = GroupLayer('halo') ${ filter: blur(2px); };
halo.append(inner);
```

The grain renders on `inner`; the blur applies to the wrapping group.

Native filter arguments can be dynamic. A bare variable substitutes where the function takes a **unitless** number (`brightness`, `contrast`, `grayscale`, `invert`, `opacity`, `saturate`, `sepia`); lengths and angles need a unit, so splice those with a template fragment — see [Variables and Interpolation in Values](#layers-variables-and-interpolation-in-values):

```
let level = randomRange(1.1, 1.4);
let softness = randomRange(1, 3);

let art = PathLayer('art') ${ fill: hotpink; };
layer('art').apply { circle(100, 100, 60); }

let shimmer = GroupLayer('shimmer') ${
  filter: brightness(level) blur(`${softness}`px);
};
shimmer.append(art);
```

## Pairing with Gradients

Custom filters compose cleanly with every [gradient](./gradients.md) kind. The filter applies to the layer's painted result, so a grainy gradient is just a layer with a gradient `fill` and a `NoiseFilter` `filter`. The `Gradient` style preset is tuned for this case — its primitive chain pumps contrast before blending so the grain reads through saturated gradient stops without looking muddy.

### LinearGradient

```
let sky = LinearGradient('sky', 0, 0, 1, 1) {|g|
  g.stop(0, oklch(70% 0.20 70));
  g.stop(0.5, oklch(55% 0.22 30));
  g.stop(1, oklch(30% 0.18 280));
};

let grainy = NoiseFilter() {|f|
  f.style = NoiseFilterStyle.Gradient;
  f.amount = 0.6;
};

define PathLayer('panel') ${ fill: sky; filter: grainy; }
layer('panel').apply { rect(0, 0, 200, 200); }
```

### RadialGradient

```
let glow = RadialGradient('glow', 0.5, 0.5, 0.5) {|g|
  g.stop(0, oklch(92% 0.18 80));
  g.stop(0.5, oklch(60% 0.20 40));
  g.stop(1, oklch(20% 0.05 280));
};

let grainy = NoiseFilter() {|f|
  f.style = NoiseFilterStyle.Gradient;
  f.amount = 0.55;
};

define PathLayer('orb') ${ fill: glow; filter: grainy; }
layer('orb').apply { rect(0, 0, 200, 200); }
```

### ConicGradient

```
let wheel = ConicGradient('wheel', 100, 100) {|g|
  g.stop(0, oklch(70% 0.20 0));
  g.stop(0.5, oklch(70% 0.20 180));
  g.stop(1, oklch(70% 0.20 360));
};

let grainy = NoiseFilter() {|f|
  f.style = NoiseFilterStyle.Gradient;
  f.amount = 0.6;
  f.contrast = 1.4;
};

define PathLayer('wheel') ${ fill: wheel; filter: grainy; }
layer('wheel').apply { circle(100, 100, 90); }
```

`Grain`, `Paper`, `Speckle`, and `Static` work with gradient fills too — they just bias toward different visual outcomes. Mix and match freely.

Mesh, freeform, and topographical gradients are also supported; the noise filter rides on top of the rasterized gradient output produced by the playground or `--render-gpu`. See [gradients.md](./gradients.md) for the full list of gradient kinds.

## Generated SVG Output

Each `NoiseFilter` compiles into a `<filter>` element in `<defs>` whose primitive chain is selected by the chosen `style`. The chain shape is the same across all styles; per-style differences flow through the preset defaults table above.

For the default Grain filter on a path:

```
let grain = NoiseFilter() {|f| f.style = NoiseFilterStyle.Grain; };

define PathLayer('disc') ${ fill: oklch(70% 0.18 30); filter: grain; }
layer('disc').apply { circle(100, 100, 80); }
```

The output SVG contains (verbatim from `pathogen-lang --output-svg-file`):

```xml
<defs>
  <filter id="pathogen-noise-1" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="6" seed="53252" result="turb"/>
    <feComposite in="turb" in2="SourceAlpha" operator="in" result="masked"/>
    <feColorMatrix in="masked" type="luminanceToAlpha" result="mono"/>
    <feComponentTransfer in="mono" result="noise">
      <feFuncA type="linear" slope="0.4"/>
    </feComponentTransfer>
    <feBlend in="SourceGraphic" in2="noise" mode="color-burn"/>
  </filter>
</defs>
<path d="M 20 100 a 80 80 0 1 1 160 0 a 80 80 0 1 1 -160 0" fill="oklch(70% 0.18 30)" filter="url(#pathogen-noise-1)"/>
```

The `seed="53252"` is the deterministic hash of `pathogen-noise-1` — it is exactly what the compiler emits for this source; it does not need to be assigned by hand. See [Seed Stability](#filters-seed-stability) for how to lock the seed across edits.

The filter region (`x="-10%" y="-10%" width="120%" height="120%"`) extends 10% beyond the bounding box so grain reads cleanly along strokes and edges.

Setting `contrast` to any value other than `1` inserts an `feComponentTransfer` "pump" between `feTurbulence` and `feComposite`, multiplying each RGB channel around the 0.5 midpoint to sharpen the noise before it blends.

Setting `monochrome = false` removes the `feColorMatrix luminanceToAlpha` step, leaving color variance from the turbulence in the final blend.

## Browser Caveats

`feTurbulence` is a native browser primitive, so the visual character of each preset reads identically across Chromium, Firefox, and Safari — grain still looks like grain, static still looks like static. Pixel-level diffs between browsers will not match (Safari smooths fractal noise slightly differently than Chromium and Firefox), but the design intent is preserved. If your design depends on exact pixel reproducibility across browsers, prerender the noisy region as a raster.

`numOctaves > 5` and very small `baseFrequency` values can be expensive to render, especially over large surfaces. The presets are tuned to stay under that threshold; if you raise `octaves` above 8, expect a noticeable cost on lower-end devices.

## Recipes

#### Filmic portrait grain

Subtle filmic texture that respects the source colors — pair with photo-illustrative artwork.

```
let grain = NoiseFilter() {|f|
  f.style = NoiseFilterStyle.Grain;
  f.amount = 0.4;
};
```

#### Heavy paper texture

Pronounced multiplicative texture for posters or bookplate-style art. The non-default `amount = 0.8` is what makes this read as heavy rather than subtle; `stitch = true` keeps the texture seamless across large background rectangles.

```
let paper = NoiseFilter() {|f|
  f.style = NoiseFilterStyle.Paper;
  f.amount = 0.8;
  f.stitch = true;
};
```

#### Risograph speckle

Coarser, more pronounced flecks than the Speckle default — the override of `octaves = 3` adds a second frequency layer that gives the speckles a printed-on-cheap-paper feel.

```
let riso = NoiseFilter() {|f|
  f.style = NoiseFilterStyle.Speckle;
  f.amount = 0.85;
  f.octaves = 3;
};
```

#### Subtle TV static

Dialed-down static that reads as an atmospheric overlay rather than full glitch.

```
let snow = NoiseFilter() {|f|
  f.style = NoiseFilterStyle.Static;
  f.amount = 0.3;
  f.blend = BlendMode.SoftLight;
};
```

#### High-contrast grainy gradient

Aggressively pumped grain over a saturated gradient — `contrast = 2.4` overshoots the Gradient default of `1.7` to push the noise toward stark light/dark flecks.

```
let grainy = NoiseFilter() {|f|
  f.style = NoiseFilterStyle.Gradient;
  f.amount = 0.7;
  f.contrast = 2.4;
};
```

#### Warm outer glow

A soft warm halo for icons or featured shapes. The `radius` does most of the work; `opacity = 0.6` keeps the halo readable without overpowering the source.

```
let halo = GlowFilter() {|f|
  f.mode = GlowMode.Outer;
  f.color = oklch(82% 0.22 60);
  f.radius = 10;
  f.opacity = 0.6;
};
```

#### Inner edge light

A subtle inner glow that traces the inside edge — useful for letterforms, badges, and pressed-glass effects.

```
let edge = GlowFilter() {|f|
  f.mode = GlowMode.Inner;
  f.color = white;
  f.radius = 3;
  f.spread = 1;
  f.opacity = 0.7;
};
```

#### Soft emboss

A gentle bevel that catches light from the top-left. Lower `depth` and `strength` keep the highlight subtle for fine work.

```
let soft = EmbossFilter() {|f|
  f.angle = 135deg;
  f.depth = 2;
  f.strength = 0.6;
  f.smooth = 2;
};
```

#### Material card shadow

A resting-card depth shadow at `elevation = 4` — pairs with rounded rectangles and surface cards.

```
let card = ElevationShadowFilter() {|f|
  f.elevation = 4;
  f.color = oklch(20% 0.02 280);
};
```

#### Pressed button

An inset shadow that makes a button look pressed into the surface. Slight `offsetY` simulates light coming from above.

```
let press = InnerShadowFilter() {|f|
  f.offsetX = 0;
  f.offsetY = 3;
  f.blur = 4;
  f.color = oklch(20% 0.02 280);
  f.opacity = 0.45;
};
```

#### Chunky pixelation

A coarse 16×16 pixel block effect — useful for retro looks or anonymizing portraits.

```
let pix = PixelateFilter(16, 16, 8);
```

## Error Handling

| Error | Cause |
|---|---|
| `NoiseFilter() takes no positional arguments — configure via the trailing block` | Calling `NoiseFilter(...)` with any arguments |
| `Invalid value '<x>' for NoiseFilter.style. Valid values: grain, paper, speckle, static, gradient` | Assigning a non-enum string to `f.style` |
| `NoiseFilter.style must be a NoiseFilterStyle enum value` | Assigning a non-string to `f.style` |
| `NoiseFilter.scale must be a finite positive number` | `f.scale = 0`, negative, `Infinity`, or `NaN` |
| `NoiseFilter.scale must be a positive number or one of 'fine' \| 'medium' \| 'coarse'` | Assigning an unrecognized string or invalid type to `f.scale` (use the `NoiseFilterScale` enum to avoid typos) |
| `NoiseFilter.octaves must be an integer between 1 and 10` | Non-integer, out of range, or wrong type assignment |
| `NoiseFilter.amount must be a number between 0 and 1` | Out-of-range, `Infinity`, or `NaN` |
| `NoiseFilter.monochrome must be a boolean` | Assigning a non-boolean value |
| `NoiseFilter.seed must be a finite number` | `f.seed = Infinity`, `NaN`, or non-number |
| `Invalid value '<x>' for NoiseFilter.blend. Valid values: normal, multiply, screen, ...` | Assigning an unrecognized blend mode |
| `NoiseFilter.blend must be a BlendMode enum value` | Assigning a non-string to `f.blend` |
| `NoiseFilter.contrast must be a finite non-negative number` | Negative, `Infinity`, or `NaN` |
| `NoiseFilter.stitch must be a boolean` | Assigning a non-boolean value |
| `Cannot assign to NoiseFilter property '<x>'` | Assigning to an unrecognized property name |
| `Property '<x>' does not exist on NoiseFilter` | Reading an unrecognized property |
| `GlowFilter() takes no positional arguments — configure via the trailing block` | Calling `GlowFilter(...)` with any arguments |
| `GlowFilter.mode must be a GlowMode enum value` | Assigning a non-string to `f.mode` |
| `Invalid value '<x>' for GlowFilter.mode. Valid values: outer, inner` | Assigning an unrecognized string to `f.mode` |
| `GlowFilter.color must be a Color value` | Assigning a non-Color value to `f.color` |
| `GlowFilter.radius must be a finite non-negative number` | `f.radius = -1`, `Infinity`, or `NaN` |
| `GlowFilter.spread must be a finite non-negative number` | `f.spread = -1`, `Infinity`, or `NaN` |
| `GlowFilter.opacity must be a number between 0 and 1` | Out-of-range or wrong type |
| `EmbossFilter() takes no positional arguments — configure via the trailing block` | Calling `EmbossFilter(...)` with any arguments |
| `EmbossFilter.angle must be a finite number (with angle unit)` | Non-number, `Infinity`, or `NaN` on `f.angle` |
| `EmbossFilter.elevation must be a finite number (with angle unit)` | Non-number, `Infinity`, or `NaN` on `f.elevation` |
| `EmbossFilter.depth must be a finite non-negative number` | Negative, `Infinity`, or `NaN` |
| `EmbossFilter.strength must be a finite non-negative number` | Negative, `Infinity`, or `NaN` |
| `EmbossFilter.shininess must be a finite number >= 1` | Below 1, `Infinity`, or `NaN` |
| `EmbossFilter.lightColor must be a Color value` | Assigning a non-Color value |
| `EmbossFilter.smooth must be a finite non-negative number` | Negative, `Infinity`, or `NaN` |
| `ElevationShadowFilter() takes no positional arguments — configure via the trailing block` | Calling with any arguments |
| `ElevationShadowFilter.elevation must be a finite number between 0 and 24` | Out-of-range, `Infinity`, or `NaN` |
| `ElevationShadowFilter.color must be a Color value` | Assigning a non-Color value |
| `ElevationShadowFilter.direction must be a finite number (with angle unit)` | Non-number, `Infinity`, or `NaN` |
| `ElevationShadowFilter.tightness must be a finite non-negative number` | Negative, `Infinity`, or `NaN` |
| `InnerShadowFilter() takes no positional arguments — configure via the trailing block` | Calling with any arguments |
| `InnerShadowFilter.offsetX must be a finite number` | `Infinity`, `NaN`, or wrong type |
| `InnerShadowFilter.offsetY must be a finite number` | `Infinity`, `NaN`, or wrong type |
| `InnerShadowFilter.blur must be a finite non-negative number` | Negative, `Infinity`, or `NaN` |
| `InnerShadowFilter.color must be a Color value` | Assigning a non-Color value |
| `InnerShadowFilter.opacity must be a number between 0 and 1` | Out-of-range or wrong type |
| `PixelateFilter() expects 0 or 3 arguments (width, height, radius)` | Calling with 1, 2, or 4+ args |
| `PixelateFilter() cannot combine positional arguments with a trailing block` | Mixing positional and block forms |
| `PixelateFilter() arguments must be finite positive numbers` | Any of `width`, `height`, `radius` is non-number, non-positive, `Infinity`, or `NaN` |
| `PixelateFilter.width must be a finite positive number` | Wrong type or non-positive on `f.width` |
| `PixelateFilter.height must be a finite positive number` | Wrong type or non-positive on `f.height` |
| `PixelateFilter.radius must be a finite positive number` | Wrong type or non-positive on `f.radius` |
| `MotionBlurFilter() takes no positional arguments — configure via the trailing block` | Calling `MotionBlurFilter(...)` with any arguments |
| `Invalid value '<x>' for MotionBlurFilter.type. Valid values: linear, progressive` | Assigning an unrecognized string to `f.type` |
| `MotionBlurFilter.type must be a MotionBlurType enum value` | Assigning a non-string to `f.type` |
| `MotionBlurFilter.distance must be a finite non-negative number` | Negative, `Infinity`, or `NaN` |
| `MotionBlurFilter.angle must be a finite number (with angle unit)` | Non-number, `Infinity`, or `NaN` on `f.angle` |
| `MotionBlurFilter.samples must be an integer between 2 and 32` | Non-integer, out of range, or wrong type |
| `Cannot assign to MotionBlurFilter property '<x>'` | Assigning to an unrecognized property name |
| `Property '<x>' does not exist on MotionBlurFilter` | Reading an unrecognized property |
| `Cannot assign to GlowFilter property '<x>'` | Assigning to an unrecognized property name on a GlowFilter |
| `Cannot assign to EmbossFilter property '<x>'` | Same, EmbossFilter |
| `Cannot assign to ElevationShadowFilter property '<x>'` | Same, ElevationShadowFilter |
| `Cannot assign to InnerShadowFilter property '<x>'` | Same, InnerShadowFilter |
| `Cannot assign to PixelateFilter property '<x>'` | Same, PixelateFilter |
| `Property '<x>' does not exist on GlowFilter` | Reading an unrecognized property on a GlowFilter |
| `Property '<x>' does not exist on EmbossFilter` | Same, EmbossFilter |
| `Property '<x>' does not exist on ElevationShadowFilter` | Same, ElevationShadowFilter |
| `Property '<x>' does not exist on InnerShadowFilter` | Same, InnerShadowFilter |
| `Property '<x>' does not exist on PixelateFilter` | Same, PixelateFilter |

## See Also

- [Gradients](./gradients.md) — pair `NoiseFilter` with linear, radial, conic, mesh, freeform, or topo gradients
- [Layers](./layers.md) — `GroupLayer` composition for stacking custom and native CSS filters
- [Markers](./markers.md) — another defs-producing constructor following the same trailing-block convention
- [Syntax](./syntax.md) — style blocks, trailing blocks, and template-literal interpolation


# Filters

Filters apply post-render visual effects — film grain, paper texture, TV static, grainy gradients — to any layer. Native CSS filter functions like `blur(2px)` and `brightness(1.2)` already work directly inside a style block. **Custom filters** like `NoiseFilter` go further: each one synthesizes a real `<filter>` definition in the output SVG with a thoughtfully tuned chain of primitives, so you get the look you want without writing `<feTurbulence>`, `<feColorMatrix>`, or `<feBlend>` by hand.

Custom filters live in the shared `<defs>` block alongside [gradients](./gradients.md), patterns, masks, and [markers](./markers.md), and are referenced via `url(#id)`.

`NoiseFilter` compiles to stock SVG filter primitives, so it renders identically in the CLI, the playground, and the VS Code preview.

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
| `scale` | number, or `'fine' \| 'medium' \| 'coarse'` | per `style` | Grain density. `scale` maps directly to SVG `baseFrequency`: higher number → finer, denser pattern; lower number → larger, coarser features. String aliases: `'fine'` = 5.0, `'medium'` = 1.0, `'coarse'` = 0.3. Numbers must be finite and positive |
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
  f.amount = 0.7;       // stronger
  f.scale = 'medium';   // coarser than the Grain default
  f.monochrome = false; // keep some color variance
  f.seed = 42;          // pin to a specific noise seed
};
```

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

```
let grain = NoiseFilter() {|f| f.style = NoiseFilterStyle.Grain; };

let inner = define PathLayer('inner') ${
  fill: hotpink;
  filter: grain;
}

define GroupLayer('halo') ${
  filter: blur(2px);
}.append(inner)
```

The grain renders on `inner`; the blur applies to the wrapping group.

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

## Error Handling

| Error | Cause |
|---|---|
| `NoiseFilter() takes no positional arguments — configure via the trailing block` | Calling `NoiseFilter(...)` with any arguments |
| `Invalid value '<x>' for NoiseFilter.style. Valid values: grain, paper, speckle, static, gradient` | Assigning a non-enum string to `f.style` |
| `NoiseFilter.style must be a NoiseFilterStyle enum value` | Assigning a non-string to `f.style` |
| `NoiseFilter.scale must be a finite positive number` | `f.scale = 0`, negative, `Infinity`, or `NaN` |
| `NoiseFilter.scale must be a positive number or one of 'fine' \| 'medium' \| 'coarse'` | Assigning an unrecognized string or invalid type to `f.scale` |
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

## See Also

- [Gradients](./gradients.md) — pair `NoiseFilter` with linear, radial, conic, mesh, freeform, or topo gradients
- [Layers](./layers.md) — `GroupLayer` composition for stacking custom and native CSS filters
- [Markers](./markers.md) — another defs-producing constructor following the same trailing-block convention
- [Syntax](./syntax.md) — style blocks, trailing blocks, and template-literal interpolation


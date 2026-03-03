# Gradients

Gradients define SVG paint servers (`<linearGradient>` and `<radialGradient>`) that can be used as `fill` or `stroke` values on layers.

## LinearGradient

Create a linear gradient with an ID and coordinates defining the gradient axis:

```
let fade = LinearGradient('fade', 0, 0, 1, 1) {|g|
  g.stop(0, Color('#e63946'));
  g.stop(0.5, Color('#f4a261'));
  g.stop(1, Color('#2a9d8f'));
};
```

Constructor signature: `LinearGradient(id, x1, y1, x2, y2)` — coordinates are in `objectBoundingBox` units by default (0–1 range).

## RadialGradient

Create a radial gradient with an ID, center point, and radius:

```
let glow = RadialGradient('glow', 0.5, 0.5, 0.5) {|g|
  g.stop(0, Color('#ffffff'));
  g.stop(1, Color('#000000').alpha(0));
};
```

Constructor signature: `RadialGradient(id, cx, cy, r)` — optional focal point: `RadialGradient(id, cx, cy, r, fx, fy)`.

## Trailing Block Syntax

Both constructors accept a trailing block `{|g| ... }` where `g` is bound to the newly created gradient. Use `g.stop(offset, color)` inside the block to add color stops:

- **offset** — a number from 0 to 1 (position along the gradient axis)
- **color** — any Color value (`Color('#hex')`, `Color('named')`, OKLCH constructor, etc.)

The block is optional — you can create an empty gradient and add stops later or use `.inherit()` to derive from another gradient.

```
let empty = LinearGradient('empty', 0, 0, 1, 0);
```

## Using Gradients in Styles

Reference a gradient in `fill` or `stroke` style properties. The compiler automatically wraps the gradient ID as `url(#id)`:

```
let g = LinearGradient('sunset', 0, 0, 1, 0) {|g|
  g.stop(0, Color('#e63946'));
  g.stop(1, Color('#2a9d8f'));
};

define PathLayer('bg') ${ fill: g; stroke: none; }

layer('bg').apply {
  M 0 0 L 200 0 L 200 200 L 0 200 Z
}
```

This produces `fill="url(#sunset)"` on the output `<path>` element, with a `<linearGradient id="sunset">` in `<defs>`.

## Gradient Attributes

Set optional attributes via property assignment after creation:

```
let g = LinearGradient('repeat-fade', 0, 0, 0.25, 0) {|g|
  g.stop(0, Color('#e63946'));
  g.stop(1, Color('#2a9d8f'));
};

g.spreadMethod = 'repeat';
g.gradientUnits = 'userSpaceOnUse';
g.gradientTransform = 'rotate(45)';
```

| Property | Values | Default |
|----------|--------|---------|
| `spreadMethod` | `'pad'`, `'reflect'`, `'repeat'` | `'pad'` |
| `gradientUnits` | `'objectBoundingBox'`, `'userSpaceOnUse'` | `'objectBoundingBox'` |
| `gradientTransform` | SVG transform string | none |
| `interpolation` | `'srgb'`, `'oklch'`, `'linearRGB'` | `'srgb'` |
| `steps` | Number of intermediate stops per unit offset | `10` |

## Color Interpolation

Control how colors transition between stops using the `interpolation` property.

### OKLCh Interpolation

Set `interpolation = 'oklch'` for perceptually uniform transitions. The compiler expands stops at compile time using OKLCh color mixing, avoiding the muddy midpoints common with sRGB interpolation:

```
let smooth = LinearGradient('smooth', 0, 0, 1, 0) {|g|
  g.stop(0, Color('#e63946'));
  g.stop(1, Color('#2a9d8f'));
};
smooth.interpolation = 'oklch';
smooth.steps = 12;  // 12 intermediate stops per unit offset (default: 10)
```

The `steps` property controls the density of generated intermediate stops. Higher values produce smoother transitions but increase SVG output size. The compiler:

1. Iterates adjacent stop pairs
2. Generates `ceil(steps * offsetSpan) - 1` intermediate stops between each pair
3. Uses `mixColors()` for shortest-arc hue interpolation in OKLCh space
4. Always preserves the original stops at their exact offsets

### linearRGB Interpolation

Set `interpolation = 'linearRGB'` for physically linear color transitions. This uses the native SVG `color-interpolation` attribute — no stop expansion is needed:

```
let physical = LinearGradient('physical', 0, 0, 1, 0) {|g|
  g.stop(0, Color('#ff0000'));
  g.stop(1, Color('#0000ff'));
};
physical.interpolation = 'linearRGB';
```

This emits `color-interpolation="linearRGB"` on the gradient element. The browser handles the interpolation natively.

### Default (sRGB)

When `interpolation` is not set (or set to `'srgb'`), the browser's default sRGB interpolation is used. No additional attributes or stop expansion occur.

## Reactive Gradient Stops

Use `Color(CSSVar(...))` in gradient stops to create live-updating gradients that respond to CSS custom property changes:

```
let accent = Color(CSSVar('--accent', '#e63946'));
let reactive = LinearGradient('reactive', 0, 0, 1, 0) {|g|
  g.stop(0, accent);            // → stop-color="var(--accent, #e63946)"
  g.stop(1, Color('#2a9d8f'));
};
```

The compiler preserves the `var()` reference in the `stop-color` attribute, allowing the gradient to update when the custom property changes at runtime.

CSSVar stops are skipped during OKLCh expansion — since their actual color is determined at runtime, the compiler cannot interpolate them at compile time. Non-CSSVar stops adjacent to CSSVar stops will not have intermediate stops generated between them.

## Pattern Paint Server

Create a tiling pattern with an ID, position, and tile dimensions:

```
let dot = @{ circle(10, 10, 3) };
let dots = Pattern('dots', 0, 0, 20, 20) {|p|
  p.append(dot, ${ fill: Color('#e63946'); });
};
dots.patternUnits = 'userSpaceOnUse';
```

Constructor signature: `Pattern(id, x, y, width, height)` — defines the tile origin and size.

### Pattern Methods

Use `.append(pathBlock, styles?)` inside the trailing block to add path elements to the pattern. This works the same way as `Mask.append()`:

- **pathBlock** — a PathBlock (`@{ ... }`) or ProjectedPath
- **styles** — optional style block for the path element

```
let line = @{ m 0 0 l 20 20 };
let hatch = Pattern('hatch', 0, 0, 20, 20) {|p|
  p.append(line, ${ stroke: Color('#999'); stroke-width: 1; });
};
```

### Pattern Properties

| Property | Values | Default |
|----------|--------|---------|
| `patternUnits` | `'objectBoundingBox'`, `'userSpaceOnUse'` | `'objectBoundingBox'` |
| `patternTransform` | SVG transform string | none |
| `patternContentUnits` | `'objectBoundingBox'`, `'userSpaceOnUse'` | `'userSpaceOnUse'` |

### Using Patterns in Styles

Reference a pattern in `fill` or `stroke` style properties, just like gradients:

```
define PathLayer('bg') ${ fill: dots; stroke: none; }
layer('bg').apply { M 0 0 L 200 0 L 200 200 L 0 200 Z }
```

This produces `fill="url(#dots)"` on the output `<path>` element.

### Pattern SVG Output

```xml
<defs>
  <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
    <path d="M 7 10 A 3 3 0 0 1 13 10 A 3 3 0 0 1 7 10" fill="#e63946"/>
  </pattern>
</defs>
```

## Conic Gradient

Create a conic (angular) gradient with an ID and center point:

```
let wheel = ConicGradient('wheel', 100, 100) {|g|
  g.stop(0, Color('#e63946'));
  g.stop(0.33, Color('#2a9d8f'));
  g.stop(0.66, Color('#264653'));
  g.stop(1, Color('#e63946'));
};
```

Constructor signature: `ConicGradient(id, cx, cy)` — center coordinates in user space.

Conic gradients use the same `.stop(offset, color)` method as linear and radial gradients. Stops map to the angular sweep: offset 0 is the start angle, offset 1 is the end angle.

### Conic Gradient Properties

| Property | Values | Default |
|----------|--------|---------|
| `from` | Start angle (requires unit: `deg`, `rad`, `pi`) | `0rad` (3 o'clock) |
| `to` | End angle (requires unit) | `from + 2pi` (full revolution) |
| `direction` | `'cw'`, `'ccw'` | `'cw'` |
| `spread` | `'clamp'`, `'repeat'`, `'transparent'` | `'clamp'` |
| `innerRadius` | Number (pixels) | `0` |
| `innerFill` | `'transparent'`, `'transparent-blend'`, `'center'`, or `Color(...)` | `'transparent'` |
| `interpolation` | `'srgb'`, `'oklch'`, `'linearRGB'` | `'srgb'` |
| `steps` | Intermediate stop density | `10` |

### Angle Units Required

The `from` and `to` properties **require** an angle unit suffix on literal numbers:

```
gauge.from = 135deg;     // degrees → converted to radians
gauge.to = 2.356rad;     // radians (used as-is)
gauge.from = 0.75pi;     // multiples of π

gauge.from = 135;        // ERROR: requires angle unit. Use 135deg
```

Computed expressions and function results are accepted without unit checks (they are assumed to already be in radians):

```
gauge.from = rad(135);   // OK — rad() returns radians
```

### Partial Sweep

Set `from` and `to` for arcs less than (or greater than) a full revolution:

```
// Gauge: 270° arc with gap at bottom
let gauge = ConicGradient('gauge', 100, 100) {|g|
  g.stop(0, Color('#2a9d8f'));
  g.stop(0.5, Color('#e9c46a'));
  g.stop(1, Color('#e63946'));
};
gauge.from = 135deg;
gauge.to = 405deg;
```

### Direction

`direction` controls which way colors sweep within the arc:

- `'cw'` (default) — colors flow clockwise from `from` to `to`
- `'ccw'` — colors flow counter-clockwise (stop offsets are reversed)

```
let reversed = ConicGradient('rev', 100, 100) {|g|
  g.stop(0, Color('#000'));
  g.stop(1, Color('#fff'));
};
reversed.direction = 'ccw';
```

### Spread Modes

`spread` controls what happens outside the `[from, to]` arc for partial sweeps:

| Spread | Effect |
|--------|--------|
| `'clamp'` | Edge colors extend to fill remaining area |
| `'repeat'` | Pattern tiles to fill remaining area |
| `'transparent'` | Outside-arc area is empty (no wedges emitted) |

### Inner Radius

Set `innerRadius` to create a smooth center plateau — the area within `innerRadius` pixels of the center blends smoothly into the angular sweep:

```
gauge.innerRadius = 30;
```

By default, the center area is transparent with a hard edge (a "donut hole"). Use `innerFill` to control what fills inside the inner radius:

| Value | Effect |
|-------|--------|
| `'transparent'` | Hard cutoff — empty center (default) |
| `'transparent-blend'` | Smooth blend from transparent at center to gradient at edge |
| `'center'` | Smooth blend from first stop color at center to gradient at edge |
| `Color(...)` | Smooth blend from custom color at center to gradient at edge |

```
gauge.innerFill = 'transparent';        // hard donut hole (default)
gauge.innerFill = 'transparent-blend';  // soft transparent fade
gauge.innerFill = 'center';             // first-stop color, blends outward
gauge.innerFill = Color('#1a1a2e');     // custom color, blends outward
```

This is useful for donut-style gauges and ring charts. Inner radius rendering requires WebGPU, which is only available in the playground. The CLI wedge-path renderer ignores `innerRadius` and emits a warning when it is set.

```
// Ring gauge with transparent center and partial sweep
let ring = ConicGradient('ring', 100, 100) {|g|
  g.stop(0, Color('#2a9d8f'));
  g.stop(0.5, Color('#e9c46a'));
  g.stop(1, Color('#e63946'));
};
ring.from = 135deg;
ring.to = 405deg;
ring.innerRadius = 30;
ring.innerFill = 'transparent';  // donut hole
```

### Rendering

Since SVG has no native conic gradient element, the output depends on the consumer:

- **CLI** (`--output-svg-file`): Wedge-path SVG approximation wrapped in `<pattern>`. Each ~1° slice is an individual `<path>` element with an interpolated fill color.
- **Playground**: Canvas 2D `createConicGradient()` → rendered to a PNG image → injected as `<pattern><image/></pattern>` for higher quality.

Both approaches are referenced via `url(#id)` in `fill`/`stroke`, identical to native gradients.

### OKLCh Interpolation

Conic gradients support OKLCh interpolation via the shared `interpolation` and `steps` properties:

```
let smooth = ConicGradient('smooth', 100, 100) {|g|
  g.stop(0, Color('#e63946'));
  g.stop(1, Color('#2a9d8f'));
};
smooth.interpolation = 'oklch';
smooth.steps = 15;
```

### Conic Gradient CSS Variable Limitation

Conic gradients are rasterized at compile time (Canvas 2D in the playground, wedge-path approximation in the CLI). This means `Color(CSSVar(...))` stops in conic gradients are **baked out** — the fallback color is extracted and used directly in the rasterized output.

Unlike linear and radial gradients, which use native SVG elements with live `var()` references, conic gradients will **not** update when CSS custom properties change at runtime.

Unfortunately, live-updating CSS variable colors is only available in the playground at this time. The compiler emits a warning when conic gradients contain CSSVar stops.

### Conic Gradient Inheritance

Use `.inherit(newId)` to create child conic gradients. All conic-specific properties (`from`, `to`, `direction`, `spread`, `innerRadius`, `innerFill`) propagate to the child:

```
let child = wheel.inherit('child-wheel');
child.from = 90deg;
```

## Gradient Inheritance

Create a new gradient that inherits stops and attributes from an existing one using `.inherit(newId)`:

```
let base = LinearGradient('base', 0, 0, 1, 0) {|g|
  g.stop(0, Color('#e63946'));
  g.stop(0.5, Color('#f4a261'));
  g.stop(1, Color('#2a9d8f'));
};

let rotated = base.inherit('rotated');
rotated.gradientTransform = 'rotate(90, 0.5, 0.5)';
```

The inherited gradient uses SVG's `href` attribute to reference the parent. It inherits all stops and attributes from the parent, and you can override specific attributes on the child. Inherited gradients with no stops of their own produce self-closing elements.

## Property Access

| Expression | Returns |
|------------|---------|
| `gradient.id` | The gradient's string ID |
| `gradient.spreadMethod` | Current spreadMethod or `undefined` |
| `gradient.gradientUnits` | Current gradientUnits or `undefined` |
| `gradient.gradientTransform` | Current gradientTransform or `undefined` |
| `gradient.interpolation` | Current interpolation mode or `null` |
| `gradient.steps` | Current steps value or `null` |
| `gradient.from` | Conic: start angle in radians (default `0`) |
| `gradient.to` | Conic: end angle in radians (default `2π`) |
| `gradient.direction` | Conic: `'cw'` or `'ccw'` (default `'cw'`) |
| `gradient.spread` | Conic: spread mode (default `'clamp'`) |
| `gradient.innerRadius` | Conic: center plateau radius in pixels (default `0`) |
| `gradient.innerFill` | Conic: inner fill mode — `'transparent'`, `'transparent-blend'`, `'center'`, or Color value |
| `pattern.id` | The pattern's string ID |
| `pattern.patternUnits` | Current patternUnits or `null` |
| `pattern.patternTransform` | Current patternTransform or `null` |
| `pattern.patternContentUnits` | Current patternContentUnits or `null` |

## Dynamic Stop Generation

Use loops and expressions inside the trailing block for programmatic stops:

```
let ramp = LinearGradient('ramp', 0, 0, 1, 0) {|g|
  let colors = ['#e63946', '#f4a261', '#2a9d8f', '#264653', '#e9c46a'];
  for ([color, i] in colors) {
    g.stop(calc(i / 4), Color(color));
  }
};
```

Any statement valid in the language can appear inside the block — `for` loops, `if` statements, `let` bindings, function calls, etc.

## SVG Output

The compiler produces gradient definitions in the `<defs>` section:

```xml
<defs>
  <linearGradient id="fade" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="rgb(89.56% 22.41% 27.51%)"/>
    <stop offset="0.5" stop-color="rgb(95.69% 63.53% 38.04%)"/>
    <stop offset="1" stop-color="rgb(16.47% 61.57% 56.08%)"/>
  </linearGradient>
</defs>
```

Radial gradients use the `<radialGradient>` tag with `cx`, `cy`, `r` (and optionally `fx`, `fy`) attributes.

Inherited gradients use `href`:

```xml
<linearGradient id="rotated" href="#base" gradientTransform="rotate(90, 0.5, 0.5)"/>
```

## Output Format

When using the JavaScript API, gradients appear in `result.gradients`:

```js
const result = compile(`
  let g = LinearGradient('fade', 0, 0, 1, 1) {|g|
    g.stop(0, Color('#e63946'));
    g.stop(1, Color('#2a9d8f'));
  };
`);

// result.gradients:
// [
//   {
//     id: 'fade',
//     type: 'linear',
//     attrs: { x1: '0', y1: '0', x2: '1', y2: '1' },
//     stops: [
//       { offset: 0, color: 'rgb(89.56% 22.41% 27.51%)' },
//       { offset: 1, color: 'rgb(16.47% 61.57% 56.08%)' }
//     ]
//   }
// ]
```

## Error Handling

| Error | Cause |
|-------|-------|
| `Duplicate defs ID 'x'` | ID conflicts with another gradient, mask, clipPath, or pattern |
| `LinearGradient() expects 5 arguments` | Wrong argument count |
| `RadialGradient() expects 4-6 arguments` | Wrong argument count |
| `ConicGradient() expects 3 arguments` | Wrong argument count |
| `Pattern() expects 5 arguments` | Wrong argument count |
| `First argument must be a string` | Non-string ID |
| `stop() offset must be a number` | Non-numeric stop offset |
| `stop() color must be a Color value` | Non-Color stop color |
| `requires an angle unit` | Bare number on conic `from`/`to` (use `135deg`) |
| `direction must be 'cw' or 'ccw'` | Invalid conic direction |
| `spread must be 'clamp', 'repeat', or 'transparent'` | Invalid conic spread |
| `innerRadius must be a number` | Non-numeric innerRadius |
| `innerRadius must be >= 0` | Negative innerRadius |
| `innerFill must be 'transparent', 'transparent-blend', 'center', or a Color value` | Invalid innerFill |

## Full Example

```
// Define a gradient palette
let warm = LinearGradient('warm', 0, 0, 0, 1) {|g|
  g.stop(0, Color('#e63946'));
  g.stop(0.5, Color('#f4a261'));
  g.stop(1, Color('#e9c46a'));
};

let cool = RadialGradient('cool', 0.5, 0.5, 0.5) {|g|
  g.stop(0, Color('#2a9d8f'));
  g.stop(1, Color('#264653'));
};

// Use in layer styles
define PathLayer('bg') ${ fill: warm; stroke: none; }
define PathLayer('circle') ${ fill: cool; stroke: none; }

layer('bg').apply {
  M 0 0 L 200 0 L 200 200 L 0 200 Z
}

layer('circle').apply {
  circle(100, 100, 60)
}
```

## Conic Gradient Rendering

Conic gradients are rasterized to bitmap and injected as SVG `<pattern>` elements because SVG has no native conic gradient primitive.

**Playground (browser):** When WebGPU is available (Chrome 113+), all conic gradients render through a WGSL fragment shader. This enables `innerRadius`/`innerFill` and consistent quality. Rendered textures are cached — unchanged gradients skip re-rendering. When WebGPU is unavailable (Firefox, Safari), the playground falls back to Canvas 2D's `createConicGradient()`, which does not support `innerRadius` or `innerFill`.

**CLI:** Conic gradients render as wedge-shaped SVG paths (pure math, no GPU). The `innerRadius` and `innerFill` properties are ignored with a warning.

## Mesh Gradient

Create a mesh gradient with an ID, dimensions, and grid size:

```
let mesh = MeshGradient('terrain', 200, 200, 4, 3) {|g|
  g.getPoint(0, 0).color = Color('#264653');
  g.getPoint(0, 3).color = Color('#2a9d8f');
  g.getPoint(2, 0).color = Color('#e9c46a');
  g.getPoint(2, 3).color = Color('#e63946');
};
```

Constructor signature: `MeshGradient(id, width, height, cols, rows)` — creates a `rows × cols` grid of control points evenly spaced across the given dimensions.

- `cols` and `rows` must be >= 2 (at least one patch)
- All points start transparent (`oklch(0 0 0 / 0)`)
- The trailing block `{|g| ... }` is optional

### Grid Access Methods

| Method | Arguments | Returns | Description |
|--------|-----------|---------|-------------|
| `getPoint(row, col)` | row, col (numbers) | MeshPoint | Single control point at grid position |
| `getRow(row)` | row (number) | Array of MeshPoints | All points in a row |
| `getCol(col)` | col (number) | Array of MeshPoints | All points in a column |
| `colorAll(color)` | Color value | — | Set every point to the same color |

### MeshPoint Properties

Each point returned by `getPoint`, `getRow`, or `getCol` has:

| Property | Read | Write | Type |
|----------|------|-------|------|
| `x` | yes | yes | number |
| `y` | yes | yes | number |
| `color` | yes | yes | Color |

### MeshPoint Methods

| Method | Arguments | Description |
|--------|-----------|-------------|
| `translate(dx, dy)` | numbers | Shift the point position |

### Mesh Gradient Properties

| Expression | Returns |
|------------|---------|
| `mesh.id` | The gradient's string ID |
| `mesh.cols` | Number of columns |
| `mesh.rows` | Number of rows |
| `mesh.width` | Width in user-space units |
| `mesh.height` | Height in user-space units |

### Mesh Gradient Example

```
let m = MeshGradient('heat', 200, 200, 3, 3) {|g|
  // Color the corners
  g.getPoint(0, 0).color = Color('#264653');
  g.getPoint(0, 2).color = Color('#2a9d8f');
  g.getPoint(2, 0).color = Color('#e9c46a');
  g.getPoint(2, 2).color = Color('#e63946');

  // Shift a point for artistic control
  g.getPoint(1, 1).translate(10, -5);
  g.getPoint(1, 1).color = Color('#f4a261');
};

define PathLayer('bg') ${ fill: m; stroke: none; }
layer('bg').apply {
  M 0 0 L 200 0 L 200 200 L 0 200 Z
}
```

### Rendering

Mesh gradients are rasterized via WebGPU using bilinear patch interpolation. Each quad cell in the grid is rendered as a smooth color blend between its four corner points.

- **Playground**: WebGPU shader renders each patch; the result is injected as `<pattern><image/></pattern>`, same as conic gradients.
- **CLI**: Mesh gradients are not supported in the CLI wedge-path renderer. A warning is emitted and the gradient renders as transparent.

## Freeform Gradient

Create a freeform (scattered-point) gradient with an ID and dimensions:

```
let ff = FreeformGradient('glow', 200, 200) {|g|
  g.point(100, 100, Color('#ffffff'));
  g.point(0, 0, Color('#264653'));
  g.point(200, 0, Color('#2a9d8f'));
  g.point(200, 200, Color('#e63946'));
  g.point(0, 200, Color('#e9c46a'));
};
```

Constructor signature: `FreeformGradient(id, width, height)` — creates an empty gradient canvas. Add points with `.point(x, y, color)`.

### Methods

| Method | Arguments | Description |
|--------|-----------|-------------|
| `point(x, y, color)` | x, y (numbers), color (Color) | Add a color point at the given position |

### Freeform Gradient Properties

| Expression | Returns |
|------------|---------|
| `ff.id` | The gradient's string ID |
| `ff.width` | Width in user-space units |
| `ff.height` | Height in user-space units |
| `ff.falloff` | Distance falloff exponent (default `2.0`) |

### Falloff

The `falloff` property controls how quickly colors blend with distance. Higher values create sharper boundaries around each point; lower values create smoother blends:

```
ff.falloff = 1.0;   // very smooth, linear falloff
ff.falloff = 2.0;   // default — inverse-square (natural)
ff.falloff = 4.0;   // tight halos around each point
```

`falloff` must be a positive number.

### Freeform Gradient Example

```
let nebula = FreeformGradient('nebula', 300, 300) {|g|
  g.point(150, 150, Color('#ffffff'));
  g.point(50, 80, Color('#e63946'));
  g.point(250, 80, Color('#2a9d8f'));
  g.point(80, 250, Color('#f4a261'));
  g.point(220, 250, Color('#264653'));
};
nebula.falloff = 3.0;

define PathLayer('bg') ${ fill: nebula; stroke: none; }
layer('bg').apply {
  M 0 0 L 300 0 L 300 300 L 0 300 Z
}
```

### Rendering

Freeform gradients are rasterized via WebGPU using inverse-distance weighted interpolation. Each pixel's color is a weighted average of all control points, where the weight is `1 / distance^falloff`.

- **Playground**: WebGPU shader computes IDW per-pixel; the result is injected as `<pattern><image/></pattern>`.
- **CLI**: Freeform gradients are not supported in the CLI. A warning is emitted and the gradient renders as transparent.

A warning is also emitted at compile time if a freeform gradient has fewer than 2 points.

### Error Handling

| Error | Cause |
|-------|-------|
| `MeshGradient() expects 5 arguments` | Wrong argument count |
| `MeshGradient() first argument must be a string` | Non-string ID |
| `MeshGradient() width, height, cols, rows must be numbers` | Non-numeric dimensions |
| `MeshGradient() cols and rows must be >= 2` | Grid too small |
| `FreeformGradient() expects 3 arguments` | Wrong argument count |
| `FreeformGradient() first argument must be a string` | Non-string ID |
| `FreeformGradient() width and height must be numbers` | Non-numeric dimensions |
| `getPoint(row, col) out of bounds` | Index outside grid |
| `getRow(row) out of bounds` | Row index outside grid |
| `getCol(col) out of bounds` | Column index outside grid |
| `point() expects 3 arguments (x, y, color)` | Wrong argument count |
| `FreeformGradient falloff must be positive` | Non-positive falloff |

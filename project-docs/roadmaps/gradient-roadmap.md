# Gradient Feature Roadmap

A multi-phase plan for bringing gradient support to Pathogen, from native SVG gradients through WebGPU-rendered mesh, freeform, and topological gradients.

**Current state**: Pathogen has zero gradient support but has a solid foundation — OKLCH color math (`src/color.ts`), per-layer style blocks with `fill`/`stroke` properties, `<defs>` generation for masks and clip-paths, and a clean parser → evaluator → serialization pipeline. The Color type already supports `.mix()`, palettes, and OKLCH-space manipulation.

---

## Preamble: Gradient Landscape Across Web Platform APIs

### SVG Native Gradients

SVG provides two paint server elements in `<defs>`:

- **`<linearGradient>`** — axis-aligned or angled linear blends via `x1/y1/x2/y2` coordinates. Supports `gradientUnits` (userSpaceOnUse vs objectBoundingBox), `gradientTransform`, and `spreadMethod` (pad, reflect, repeat).
- **`<radialGradient>`** — circular/elliptical blends via `cx/cy/r` (outer) and `fx/fy/fr` (focal). Same units/transform/spread attributes.
- **`<stop>`** children define color/opacity at positions along the gradient axis.
- **Color interpolation**: `color-interpolation` attribute offers `sRGB` (default, perceptually non-uniform) or `linearRGB` (physically linear). No native OKLCh support.
- **Inheritance**: gradients can use `href` to inherit stops and attributes from another gradient.
- **Missing**: No conic gradients. No mesh gradients (SVG2 `<meshGradient>` specified but unimplemented by browsers). No freeform gradients.

### CSS Gradients

CSS adds `conic-gradient()` alongside `linear-gradient()` and `radial-gradient()`, all supporting:

- Arbitrary stop counts with percentage/length positions
- `repeating-*` variants
- Color hint syntax (midpoint control)
- `color-interpolation` via `in oklch` / `in oklab` (CSS Color Level 4)

CSS gradients are image values — usable in `background-image` but not directly as SVG paint servers. No mesh or freeform support.

### Canvas 2D

`CanvasRenderingContext2D` offers:

- `createLinearGradient(x0, y0, x1, y1)` + `.addColorStop(offset, color)`
- `createRadialGradient(x0, y0, r0, x1, y1, r1)` + stops
- `createConicGradient(startAngle, cx, cy)` + stops

Fixed to sRGB interpolation. No programmatic access to per-pixel color computation. Mesh/freeform gradients require manual per-pixel rasterization (slow but possible as a fallback).

### WebGL / WebGPU

Fragment shaders compute color per-pixel with full control:

- Any interpolation space (OKLab/OKLCh in ~10 lines of WGSL)
- Coons patch mesh interpolation via parametric evaluation
- Freeform gradients via distance-weighted blending
- SDF computation for topological gradients
- Laplace equation solving via Jacobi iteration in compute shaders
- Storage buffers for large control-point arrays (WebGPU)
- Render-to-texture for single-render caching

WebGPU is the rendering backbone for Phases 3–5. Output is rasterized to a texture and injected into SVG via `<pattern><image/></pattern>`.

### Summary

| Capability | SVG | CSS | Canvas 2D | WebGPU |
|---|---|---|---|---|
| Linear | Yes | Yes | Yes | Yes |
| Radial | Yes | Yes | Yes | Yes |
| Conic | No | Yes | Yes | Yes |
| OKLCh interpolation | No | Yes | No | Yes |
| Mesh (Coons patch) | Spec only | No | Manual | Yes |
| Freeform (IDW) | No | No | Manual | Yes |
| Topological (SDF) | No | No | No | Yes |

Each phase of this roadmap targets a column of that table, progressing from left to right.

---

## Phase 1: Native SVG Gradients

First-class `<linearGradient>` and `<radialGradient>` paint servers in Pathogen.

### Goals

- Define gradients as named values in Pathogen source
- Emit `<defs>` gradient elements in compiled SVG output
- Reference gradients in `fill`/`stroke` via `url(#id)` paint server syntax
- Support all SVG gradient attributes
- Integrate with the existing Color type for stop colors

### Syntax

**Linear gradient constructor:**

```pathogen
let fade = LinearGradient('fade', 0, 0, 1, 1) {
  stop(0, Color('#e63946'))
  stop(0.5, Color('#f4a261'))
  stop(1, Color('#2a9d8f'))
};
```

Arguments: `LinearGradient(id, x1, y1, x2, y2) { stops }`. Coordinates default to `objectBoundingBox` units (0–1 range).

**Radial gradient constructor:**

```pathogen
let glow = RadialGradient('glow', 0.5, 0.5, 0.5) {
  stop(0, Color('#ffffff'))
  stop(1, Color('#000000').alpha(0))
};
```

Arguments: `RadialGradient(id, cx, cy, r) { stops }`. Optional focal point: `RadialGradient(id, cx, cy, r, fx, fy)`.

**Usage in style blocks:**

```pathogen
define PathLayer('bg') ${ fill: fade; stroke: none; }
define PathLayer('highlight') ${ fill: glow; stroke: none; }

layer('bg').apply { rect(0, 0, 200, 200) }
layer('highlight').apply { circle(100, 100, 60) }
```

Gradient values auto-wrap to `url(#fade)` / `url(#glow)` when used in `fill`/`stroke` — same mechanism as `Mask.id` and `ClipPath.id`.

**Gradient attributes:**

```pathogen
let g = LinearGradient('striped', 0, 0, 0.1, 0) {
  stop(0, Color('#333'))
  stop(1, Color('#999'))
};
g.spreadMethod = 'repeat';
g.gradientTransform = 'rotate(45)';
```

**Stop with opacity:**

```pathogen
stop(0.5, Color('#e63946').alpha(0.5))
```

**Gradient inheritance:**

```pathogen
let base = LinearGradient('base', 0, 0, 1, 0) {
  stop(0, Color('#e63946'))
  stop(1, Color('#2a9d8f'))
};

let rotated = base.inherit('rotated');
rotated.gradientTransform = 'rotate(90, 0.5, 0.5)';
```

Emits `<linearGradient id="rotated" href="#base" gradientTransform="rotate(90, 0.5, 0.5)"/>`.

**Colors from variables and expressions:**

```pathogen
let primary = Color('#e63946');
let palette = Color.palette(primary, 5);

let ramp = LinearGradient('ramp', 0, 0, 1, 0) {
  for ([color, i] in palette) {
    stop(calc(i / 4), color)
  }
};
```

### SVG Output

```xml
<defs>
  <linearGradient id="fade" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#e63946"/>
    <stop offset="0.5" stop-color="#f4a261"/>
    <stop offset="1" stop-color="#2a9d8f"/>
  </linearGradient>
</defs>
<path d="..." fill="url(#fade)"/>
```

### Technical Implementation

**Parser** (`src/parser/index.ts`):

- Add `LinearGradient` and `RadialGradient` to the function call parser, similar to `Mask()` and `ClipPath()`
- Parse `stop(offset, color)` calls inside the body block
- Parse optional property assignments (`.spreadMethod`, `.gradientTransform`, `.gradientUnits`)

**Evaluator** (`src/evaluator/index.ts`):

- Create `GradientValue` interface:
  ```ts
  interface GradientStop { offset: number; color: string; }
  interface GradientValue {
    type: 'GradientValue';
    gradientType: 'linear' | 'radial';
    id: string;
    attrs: Record<string, string>;  // x1, y1, cx, cy, r, fx, fy, etc.
    stops: GradientStop[];
    spreadMethod?: 'pad' | 'reflect' | 'repeat';
    gradientUnits?: 'objectBoundingBox' | 'userSpaceOnUse';
    gradientTransform?: string;
    href?: string;  // inheritance
  }
  ```
- Add `gradients: Map<string, GradientValue>` to `EvaluationState`
- Support `.id` property returning `url(#id)` string
- Auto-wrap gradient values in `fill`/`stroke` style properties (same as mask/clip-path)
- Duplicate ID protection (same registry as masks/clip-paths)

**Compile result** (`src/compiler.ts` or equivalent):

- Add `gradients: GradientValue[]` to `CompileResult`
- Serialize to `<linearGradient>`/`<radialGradient>` elements in `<defs>`

**Key files affected:**

- `src/parser/index.ts` — gradient constructors, stop parser
- `src/evaluator/index.ts` — GradientValue, evaluation, scope integration
- `src/color.ts` — no changes (Color already provides `.css` output)
- `playground/src/components/svg-renderer.ts` — render `<defs>` gradients
- `tests/gradients.test.ts` — **new file**

### Dependencies

None — this is the foundational phase.

### Acceptance Criteria

- [ ] `LinearGradient()` and `RadialGradient()` constructors parse and evaluate
- [ ] Stops accept Color values, hex strings, and named colors
- [ ] Gradient values work in `fill` and `stroke` style properties
- [ ] `<defs>` output includes correct gradient elements with all specified attributes
- [ ] `spreadMethod`, `gradientUnits`, `gradientTransform` attributes serialize correctly
- [ ] Gradient inheritance via `.inherit()` emits `href` attribute
- [ ] Loops and expressions work inside stop blocks (dynamic stop generation)
- [ ] Duplicate gradient IDs produce a compile error
- [ ] Playground renders gradients correctly

---

## Phase 2: Advanced Gradient Features

Color interpolation control, reactive gradients, gradients as first-class values, pattern paint servers, and conic gradient support.

### Goals

- Perceptually uniform color interpolation (OKLCh) via stop expansion
- CSSVar-backed gradient parameters for live reactivity
- Gradients as first-class values (store, pass, merge)
- `<pattern>` paint server support
- Conic gradient via pattern fallback

### Syntax

**OKLCh interpolation via stop expansion:**

```pathogen
let smooth = LinearGradient('smooth', 0, 0, 1, 0) {
  stop(0, Color('#e63946'))
  stop(1, Color('#2a9d8f'))
  interpolation: oklch
  steps: 12           // expand to 12 intermediate stops
};
```

When `interpolation: oklch` is set, the compiler generates intermediate `<stop>` elements by interpolating in OKLCh space via `Color.mix()`, producing perceptually uniform transitions that SVG's native sRGB interpolation cannot achieve.

**linearRGB interpolation (native SVG):**

```pathogen
let physical = LinearGradient('physical', 0, 0, 1, 0) {
  stop(0, Color('#ff0000'))
  stop(1, Color('#0000ff'))
  interpolation: linearRGB
};
```

Emits `color-interpolation="linearRGB"` on the gradient element — no stop expansion needed.

**Reactive gradients via CSSVar:**

```pathogen
let accent = Color(CSSVar('--accent', '#e63946'));
let bg = Color(CSSVar('--bg', '#1a1a2e'));

let theme = LinearGradient('theme', 0, 0, 0, 1) {
  stop(0, accent)
  stop(1, bg)
};

// Generates @property declarations for --accent and --bg
// Gradient updates live when CSS custom properties change
```

**Gradients as first-class values:**

```pathogen
fn makeRamp(id, c1, c2, direction) {
  let g = LinearGradient(id, 0, 0, 1, 0) {
    stop(0, c1)
    stop(1, c2)
  };
  if (direction == 'vertical') {
    g.gradientTransform = 'rotate(90, 0.5, 0.5)';
  }
  return g;
}

let warm = makeRamp('warm', Color('#e63946'), Color('#f4a261'), 'horizontal');
let cool = makeRamp('cool', Color('#2a9d8f'), Color('#264653'), 'vertical');
```

**Pattern paint server:**

```pathogen
let dots = Pattern('dots', 0, 0, 20, 20) {
  circle(10, 10, 4)
  styles: ${ fill: Color('#e63946'); }
};
dots.patternUnits = 'userSpaceOnUse';

define PathLayer('dotted') ${ fill: dots; }
```

Emits:

```xml
<defs>
  <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
    <circle cx="10" cy="10" r="4" fill="#e63946"/>
  </pattern>
</defs>
```

**Conic gradient (via canvas-rendered pattern):**

Since SVG has no native conic gradient, `ConicGradient` renders via `CanvasRenderingContext2D.createConicGradient()` and injects as `<pattern><image/></pattern>`. This establishes the pattern-injection pipeline used more heavily in Phases 3–5.

**Full parameter set:**

| Parameter | Default | Description |
|---|---|---|
| `cx, cy` | required | Center position (can be off-bounds) |
| `from` | `0deg` | Start angle (0 = 3 o'clock) |
| `to` | `from + 360deg` | End angle; partial sweep when `to - from < 360°` |
| `direction` | `cw` | Sweep direction (`cw` or `ccw`) |
| `spread` | `clamp` | How pixels outside the arc are colored |
| `innerRadius` | `0` | Smooth center plateau — **deferred to Phase 3** (requires WebGPU) |

When `to` is omitted, `to = from + 360deg` — a full revolution. When `to` is present, the stop range `[0, 1]` maps onto the arc `[from, to]`. This is the only semantic change; all other behavior follows from it.

**Basic full-revolution conic:**

```pathogen
let wheel = ConicGradient('wheel', 100, 100) {
  stop(0, Color('#e63946'))
  stop(0.33, Color('#2a9d8f'))
  stop(0.66, Color('#264653'))
  stop(1, Color('#e63946'))
};
```

**Partial sweep — fan/wedge gradient:**

```pathogen
// 90° sweep in the upper-right quadrant
let fan = ConicGradient('fan', 0, 200) {
  from: 270deg
  to: 360deg
  stop(0, Color('#e63946'))
  stop(1, Color('#2a9d8f'))
};
```

Stops map across the 90-degree arc only. Pixels outside the arc are handled by `spread`.

**Partial sweep — gauge/dial:**

```pathogen
// 270° arc with gap at bottom (classic dashboard gauge)
let gauge = ConicGradient('gauge', 100, 100) {
  from: 135deg
  to: 405deg             // 270° sweep, 90° gap at bottom
  stop(0, Color('#2a9d8f'))
  stop(0.5, Color('#e9c46a'))
  stop(1, Color('#e63946'))
};
```

**Partial sweep — spotlight arc:**

```pathogen
// Narrow 30° band, transparent outside
let spot = ConicGradient('spot', 200, 200) {
  from: -15deg
  to: 15deg
  spread: transparent
  stop(0, Color('#000000').alpha(0))
  stop(0.5, Color('#ffffff'))
  stop(1, Color('#000000').alpha(0))
};
```

**`spread` — how pixels outside the arc are colored:**

| Value | Behavior | Use case |
|---|---|---|
| `clamp` (default) | Nearest edge stop color extends to fill the remaining arc | Solid backgrounds, gauge fills |
| `repeat` | The sweep tiles rotationally to fill 360° | Repeating fan patterns, starburst |
| `transparent` | Pixels outside the arc are fully transparent | Compositing partial sweeps, spotlights |

`clamp` matches SVG's `spreadMethod: pad` convention — the same default behavior users encounter on linear/radial gradients in Phase 1. The term `spread` is chosen to mirror SVG's `spreadMethod`, since it solves the identical problem: what color to assign beyond the defined gradient range.

**Off-center conic:**

The center coordinates can be placed anywhere — including well outside the gradient's rendered bounds. Canvas 2D's `createConicGradient(startAngle, x, y)` takes global coordinates, so the gradient is conceptually infinite and the canvas clips it to its pixel grid. This enables dramatic sweep effects where only a portion of the full rotation is visible:

```pathogen
// Center placed far off-canvas — produces near-parallel sweep lines
let dramatic = ConicGradient('dramatic', -200, 150) {
  stop(0, Color('#264653'))
  stop(0.5, Color('#e9c46a'))
  stop(1, Color('#264653'))
};
```

**Sweep direction:**

```pathogen
// Counter-clockwise sweep
let ccw_sweep = ConicGradient('ccw_sweep', 100, 100) {
  from: 0deg
  to: 270deg
  direction: ccw
  stop(0, Color('#e63946'))
  stop(1, Color('#2a9d8f'))
};
```

`direction: ccw` is implemented as a math transform — stop offsets are reversed (`1 - offset`) and the start angle is negated. No rendering-tier constraint.

**Center radius — deferred to Phase 3:**

A center radius ("plane cutting the top of the cone") replaces the point-singularity at the center with a flat plateau of uniform color, then transitions smoothly into the angular sweep. This is valuable artistically — it eliminates the center pinch artifact and opens up annular sweep designs.

However, neither Canvas 2D `createConicGradient()` nor CSS `conic-gradient()` support an inner radius. A compositing workaround (draw conic, then stamp a filled circle on top) only produces a **hard edge** — not the smooth transition that makes this feature worth having. Per-pixel shader control is needed for the smooth falloff between the center plateau and the sweep, so center radius is deferred to Phase 3 where WebGPU provides that control. See the Phase 3 section for the `innerRadius` syntax and WGSL implementation.

### Technical Implementation

**Stop expansion algorithm** (OKLCh):

```
For each adjacent stop pair (s1, s2):
  n = ceil(steps * (s2.offset - s1.offset))
  for i in 1..n-1:
    t = i / n
    offset = mix(s1.offset, s2.offset, t)
    color = Color.mix(s1.color, s2.color, t)  // OKLCH interpolation
    emit intermediate <stop>
```

This leverages the existing `Color.mix()` method which already interpolates in OKLCH space with shortest-arc hue handling.

**Pattern injection pipeline** (for conic gradients):

1. Detect `ConicGradient` in compile result
2. Render to `OffscreenCanvas` (or regular `<canvas>` fallback) using `createConicGradient()`
3. Export as data URL via `canvas.toDataURL('image/png')`
4. Inject `<pattern><image href="data:..."/></pattern>` into `<defs>`

**Key files affected:**

- `src/evaluator/index.ts` — stop expansion logic, Pattern/ConicGradient evaluation
- `src/color.ts` — possibly expose `Color.mix()` as static for batch interpolation
- `src/parser/index.ts` — `Pattern()`, `ConicGradient()` constructors, `interpolation` property
- `playground/src/components/svg-renderer.ts` — conic gradient canvas rendering
- `tests/gradients.test.ts` — extended

### Dependencies

- Phase 1 (gradient infrastructure, `<defs>` pipeline, paint server references)

### Acceptance Criteria

- [ ] `interpolation: oklch` produces expanded stops with perceptually uniform transitions
- [ ] `interpolation: linearRGB` emits `color-interpolation="linearRGB"` attribute
- [ ] CSSVar-backed stop colors generate `@property` declarations and update reactively
- [ ] Gradients can be stored in variables, passed to functions, and returned
- [ ] `Pattern()` constructor produces `<pattern>` elements in `<defs>`
- [ ] `ConicGradient()` renders via canvas and injects as pattern
- [ ] Conic `from`/`to` defines sweep arc; stops map onto `[from, to]` range
- [ ] Partial sweep (`to - from < 360°`) renders correctly with gap outside arc
- [ ] `spread: clamp` fills outside-arc pixels with nearest edge stop color
- [ ] `spread: repeat` tiles the sweep rotationally to fill 360°
- [ ] `spread: transparent` leaves outside-arc pixels fully transparent
- [ ] `direction: ccw` reverses the sweep
- [ ] Off-center conic (center outside gradient bounds) renders correctly
- [ ] Omitting `to` defaults to `from + 360deg` (full revolution, backward compatible)
- [ ] Expanded stops are visually smooth (no banding with >= 8 steps)

---

## Phase 3: WebGPU Rendering Pipeline

The infrastructure phase. Establishes the GPU rendering → SVG injection pipeline used by Phases 4 and 5.

### Goals

- Initialize WebGPU device and render pipeline
- Render gradient textures to `OffscreenCanvas` (in workers where supported)
- Export textures as blob URLs (live preview) or data URLs (SVG export)
- Inject rendered textures into SVG `<defs>` as `<pattern><image/></pattern>`
- Cache rendered textures, invalidating only when gradient parameters change
- Unlock conic gradient center radius (deferred from Phase 2)

### Conic Gradient: Center Radius (Phase 2 Enhancement)

With the WebGPU pipeline available, conic gradients gain the `innerRadius` property — a smooth transition from a flat center plateau into the angular sweep. This eliminates the point-singularity at the center and enables annular sweep designs.

**Syntax:**

```pathogen
let ring = ConicGradient('ring', 150, 150) {
  innerRadius: 30       // pixels — flat center plateau
  from: 0deg
  stop(0, Color('#e63946'))
  stop(0.5, Color('#2a9d8f'))
  stop(1, Color('#e63946'))
};
```

Pixels within `innerRadius` of the center receive the color at the angular sweep position but at full blend — no convergence toward a singularity. The transition from the plateau edge into the normal sweep is smooth (controlled by a built-in ease-out curve).

**Combined with Phase 2 parameters:**

```pathogen
// Annular partial sweep — 270° gauge with center plateau
let annular_gauge = ConicGradient('annular-gauge', 100, 100) {
  innerRadius: 25
  from: 135deg
  to: 405deg
  spread: transparent     // gap at bottom is transparent
  stop(0, Color('#2a9d8f'))
  stop(0.5, Color('#e9c46a'))
  stop(1, Color('#e63946'))
};

// Off-center CCW with inner radius
let vortex = ConicGradient('vortex', 50, 50) {
  innerRadius: 20
  direction: ccw
  from: 45deg
  stop(0, Color('#264653'))
  stop(0.5, Color('#e9c46a'))
  stop(1, Color('#264653'))
};
```

**WGSL implementation:**

The Phase 3 shader handles the full conic parameter set — `from`, `to`, `spread`, `direction`, and `innerRadius` — in a single pass:

```wgsl
struct ConicParams {
  center: vec2f,
  from_angle: f32,       // radians
  to_angle: f32,         // radians
  inner_radius: f32,     // pixels (0 = no plateau)
  direction: f32,        // 1.0 = CW, -1.0 = CCW
  spread: u32,           // 0 = clamp, 1 = repeat, 2 = transparent
}

@group(0) @binding(0) var<uniform> params: ConicParams;

@fragment
fn conic(@builtin(position) coord: vec4f) -> @location(0) vec4f {
  let d = coord.xy - params.center;
  let dist = length(d);

  // Pixel angle relative to sweep start
  var angle = atan2(d.y, d.x);
  angle = select(angle, -angle, params.direction < 0.0);  // CCW flip

  // Normalize to [0, 1] within the from→to arc
  let arc = params.to_angle - params.from_angle;
  var t = (angle - params.from_angle) / arc;

  // Handle pixels outside the swept arc
  var alpha = 1.0;
  if (t < 0.0 || t > 1.0) {
    switch (params.spread) {
      case 0u: { t = clamp(t, 0.0, 1.0); }           // clamp
      case 1u: { t = fract(t); }                       // repeat
      case 2u: { alpha = 0.0; }                        // transparent
      default: { t = clamp(t, 0.0, 1.0); }
    }
  }

  let color = sample_ramp(t);

  // Inner radius: smooth transition from center plateau into sweep
  let blend = smoothstep(0.0, params.inner_radius, dist);
  let center_color = sample_ramp(0.5);
  let blended = mix(center_color, color, blend);

  return vec4f(blended, alpha);
}
```

When `innerRadius` is 0 (default) and `to` is omitted (`arc = 2π`), this shader reduces to a standard full-revolution conic gradient — no behavioral change for the common case. The Phase 2 Canvas 2D renderer handles the same `from`/`to`/`spread`/`direction` parameters in its own implementation; the WebGPU shader only becomes necessary when `innerRadius > 0`.

**Acceptance criteria for center radius:**

- [ ] `innerRadius` property on `ConicGradient` produces a smooth center plateau
- [ ] Transition from plateau to sweep uses smooth falloff (no hard edge)
- [ ] `innerRadius: 0` (default) produces identical output to Phase 2 Canvas 2D rendering
- [ ] Combines correctly with all Phase 2 parameters: off-center, `from`/`to`, `spread`, `direction`
- [ ] `innerRadius` + partial sweep + `spread: transparent` produces annular arc segments

### Pipeline Architecture

```
Pathogen Source
    |
    v
  Compile  -->  gradient definition (control points, colors, type, target bounds)
    |
    v
  GPU Render  -->  WebGPU fragment shader computes gradient per-pixel
    |                on OffscreenCanvas
    v
  Export  -->  canvas.convertToBlob() --> URL.createObjectURL()  (live preview)
         -->  canvas.toDataURL()                                  (SVG export)
    |
    v
  Inject  -->  <pattern><image href="..."/></pattern> in SVG <defs>
    |
    v
  Paint  -->  fill="url(#gradient-pattern)" on target path
```

### SVG Output

```xml
<defs>
  <pattern id="mesh-grad-1"
           patternUnits="userSpaceOnUse"
           x="0" y="0" width="400" height="300">
    <image href="blob:..." width="400" height="300"/>
  </pattern>
</defs>
<path d="..." fill="url(#mesh-grad-1)"/>
```

For export (static SVG file), `blob:` URLs are replaced with `data:image/png;base64,...` URLs.

### Technical Implementation

**WebGPU initialization:**

```ts
interface GradientRenderer {
  device: GPUDevice;
  renderPipeline: GPURenderPipeline;

  render(params: GradientParams): Promise<OffscreenCanvas>;
  toBlob(canvas: OffscreenCanvas): Promise<string>;     // blob URL
  toDataURL(canvas: OffscreenCanvas): Promise<string>;   // data URL
  invalidate(gradientId: string): void;
}
```

```ts
const adapter = await navigator.gpu.requestAdapter();
const device = await adapter.requestDevice();

const canvas = new OffscreenCanvas(width, height);
const context = canvas.getContext('webgpu');
context.configure({
  device,
  format: navigator.gpu.getPreferredCanvasFormat(),
});
```

**Shader module pattern:**

Each gradient type (mesh, freeform, topological) provides its own WGSL fragment shader. The vertex shader is shared (full-screen triangle).

```wgsl
// Shared vertex shader — full-screen triangle
@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let pos = array<vec2f, 3>(
    vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3)
  );
  return vec4f(pos[i], 0, 1);
}
```

**Storage buffers for gradient data:**

WebGPU storage buffers pass large arrays of control points, colors, and parameters to shaders without texture encoding:

```ts
const pointBuffer = device.createBuffer({
  size: points.byteLength,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(pointBuffer, 0, points);
```

**Caching strategy:**

- Key: hash of gradient parameters (control points, colors, interpolation mode)
- GPU render only when the hash changes
- Path edits (which don't affect gradient parameters) reuse the cached texture
- Cache eviction: LRU with configurable max entries
- Playground: blob URLs for instant preview, revoked on invalidation
- Export: data URLs generated on-demand (no caching needed)

**Resolution auto-sizing:**

```ts
function gradientResolution(bounds: BBox, dpr: number = 1): [number, number] {
  return [
    Math.ceil(bounds.width * dpr),
    Math.ceil(bounds.height * dpr),
  ];
}
```

For the playground, `dpr` defaults to `window.devicePixelRatio`. For export, configurable (default 2x).

**Fallback (no WebGPU):**

Canvas 2D manual rasterization. Slower but functional. The freeform/mesh shaders translate to equivalent JS loops. Topological gradients fall back to a simplified distance-field computed on CPU.

**Key files affected:**

- `src/gpu/renderer.ts` — **new**: WebGPU device init, pipeline creation, render loop
- `src/gpu/shaders/` — **new directory**: WGSL shader modules (including `conic.wgsl` for center radius)
- `src/gpu/cache.ts` — **new**: texture caching with hash-based invalidation
- `src/evaluator/index.ts` — gradient params extraction for GPU pipeline, `innerRadius` on ConicGradient
- `playground/src/components/svg-renderer.ts` — pattern injection, blob URL management

### Dependencies

- Phase 2 (pattern injection pipeline established for conic gradients)

### Acceptance Criteria

- [ ] WebGPU device initializes successfully with graceful fallback to Canvas 2D
- [ ] `OffscreenCanvas` renders gradient textures at correct resolution
- [ ] Blob URLs work in `<image href>` for live playground preview
- [ ] Data URLs work for static SVG export
- [ ] Pattern injection produces valid SVG with correct `patternUnits` and dimensions
- [ ] Texture cache prevents re-rendering when only path geometry changes
- [ ] Cache invalidates correctly when gradient parameters change
- [ ] Worker rendering does not block the main thread (where `OffscreenCanvas` is supported)

---

## Phase 4: Mesh & Freeform Gradients

Built on the Phase 3 WebGPU pipeline. Coons patch mesh gradients and arbitrary-point freeform gradients.

### Goals

- `@mesh-gradient` declaration with grid of Coons patch control points and vertex colors
- `@freeform-gradient` with arbitrary color points and distance-weighted blending
- OKLab/OKLCh interpolation in WGSL shaders
- Resolution auto-sized from element bounding box

### Syntax

**Mesh gradient (Coons patch grid):**

```pathogen
@mesh-gradient fire (200, 200) {
  interpolation: oklch

  row {
    point(0, 0, Color('#ff4500'))
    point(100, 0, Color('#ff8c00'))
    point(200, 0, Color('#ffd700'))
  }
  row {
    point(0, 100, Color('#ff6347'))
    point(100, 100, Color('#ff4500'))
    point(200, 100, Color('#ff8c00'))
  }
  row {
    point(0, 200, Color('#8b0000'))
    point(100, 200, Color('#ff4500'))
    point(200, 200, Color('#ff6347'))
  }
}

define PathLayer('flame') ${ fill: mesh(fire); }
layer('flame').apply { rect(0, 0, 200, 200) }
```

The `(200, 200)` after the name specifies the render resolution. Rows define a grid of control points with positions and colors. Adjacent rows form Coons patches.

**Mesh gradient with Bezier control handles:**

```pathogen
@mesh-gradient wave (300, 200) {
  row {
    point(0, 0, Color('#264653'))
      handles(30, 0, 0, 30)     // right-handle-dx, dy, bottom-handle-dx, dy
    point(150, 0, Color('#2a9d8f'))
      handles(30, 0, 0, 30)
    point(300, 0, Color('#e9c46a'))
  }
  row {
    point(0, 200, Color('#e76f51'))
    point(150, 200, Color('#f4a261'))
    point(300, 200, Color('#e63946'))
  }
}
```

Handles allow curved patch boundaries (Coons patches with cubic Bezier edges).

**Freeform gradient (distance-weighted):**

```pathogen
@freeform-gradient nebula (400, 300) {
  interpolation: oklch

  point(50, 50, Color('#e63946'))
  point(350, 80, Color('#f4a261'))
  point(200, 250, Color('#2a9d8f'))
  point(100, 180, Color('#264653'))
  point(300, 200, Color('#e9c46a'))
}

define PathLayer('bg') ${ fill: freeform(nebula); }
layer('bg').apply { rect(0, 0, 400, 300) }
```

Each pixel's color is computed as the distance-weighted average of all color points (inverse distance weighting / IDW).

**Freeform gradient with explicit falloff:**

```pathogen
@freeform-gradient spots (400, 300) {
  falloff: 2.5    // exponent for distance weighting (default: 2.0)

  point(100, 100, Color('#e63946'))
  point(300, 200, Color('#2a9d8f'))
}
```

Higher `falloff` values produce tighter color halos around each point; lower values produce smoother blends.

**Programmatic points:**

```pathogen
@freeform-gradient generated (400, 300) {
  interpolation: oklch

  let colors = Color.palette(Color('#e63946'), Color('#2a9d8f'), 8);
  for ([c, i] in colors) {
    let angle = calc(i * 0.25pi);
    point(calc(200 + 120 * cos(angle)), calc(150 + 90 * sin(angle)), c)
  }
}
```

### Technical Implementation

**Coons patch interpolation (WGSL):**

For a single patch with corner colors `C00, C10, C01, C11` and parametric coords `u, v`:

```wgsl
fn coons_color(u: f32, v: f32, c00: vec3f, c10: vec3f, c01: vec3f, c11: vec3f) -> vec3f {
  // Bilinear interpolation in OKLab space
  let bottom = mix(c00, c10, u);
  let top = mix(c01, c11, u);
  return mix(bottom, top, v);
}
```

Full Coons patch interpolation with curved boundaries uses the formula:

```
C(u,v) = (1-v)*C_bottom(u) + v*C_top(u)
       + (1-u)*C_left(v)   + u*C_right(v)
       - [(1-u)(1-v)*C00 + u(1-v)*C10 + (1-u)v*C01 + uv*C11]
```

Where boundary color functions `C_bottom(u)`, `C_top(u)`, etc. interpolate colors along the cubic Bezier boundary curves.

**Freeform gradient (WGSL):**

```wgsl
struct ColorPoint {
  pos: vec2f,
  color: vec3f,
}

@group(0) @binding(0) var<storage> points: array<ColorPoint>;
@group(0) @binding(1) var<uniform> params: vec4f;  // falloff, point_count, width, height

@fragment
fn fs(@builtin(position) coord: vec4f) -> @location(0) vec4f {
  let uv = coord.xy / params.zw;
  let falloff = params.x;
  let count = u32(params.y);

  var totalColor = vec3f(0.0);
  var totalWeight = 0.0;

  for (var i = 0u; i < count; i++) {
    let d = distance(uv, points[i].pos);
    let w = 1.0 / pow(d, falloff) + 0.001;
    totalColor += points[i].color * w;
    totalWeight += w;
  }

  let rgb = oklab_to_srgb(totalColor / totalWeight);
  return vec4f(rgb, 1.0);
}
```

**OKLab/OKLCh conversion in WGSL:**

```wgsl
fn srgb_to_oklab(c: vec3f) -> vec3f {
  let l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  let m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  let s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  let l_ = pow(l, 1.0/3.0); let m_ = pow(m, 1.0/3.0); let s_ = pow(s, 1.0/3.0);
  return vec3f(
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
  );
}

fn oklab_to_srgb(c: vec3f) -> vec3f {
  let l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  let m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  let s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  let l = l_ * l_ * l_; let m = m_ * m_ * m_; let s = s_ * s_ * s_;
  return vec3f(
     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}
```

**Key files affected:**

- `src/parser/index.ts` — `@mesh-gradient`, `@freeform-gradient` block parsing
- `src/evaluator/index.ts` — mesh/freeform evaluation, point collection
- `src/gpu/shaders/mesh.wgsl` — **new**: Coons patch fragment shader
- `src/gpu/shaders/freeform.wgsl` — **new**: IDW fragment shader
- `src/gpu/shaders/oklab.wgsl` — **new**: shared OKLab conversion functions
- `tests/mesh-gradient.test.ts` — **new**
- `tests/freeform-gradient.test.ts` — **new**

### Dependencies

- Phase 3 (WebGPU rendering pipeline and pattern injection)

### Acceptance Criteria

- [ ] `@mesh-gradient` parses row/point grid and renders via WebGPU
- [ ] `@freeform-gradient` parses arbitrary points and renders via IDW blending
- [ ] OKLCh interpolation produces perceptually uniform color transitions in shaders
- [ ] Bezier control handles produce smooth curved patch boundaries
- [ ] `falloff` parameter controls freeform gradient tightness
- [ ] Loops and expressions work inside gradient declarations (programmatic points)
- [ ] Render resolution auto-sizes from the declared dimensions
- [ ] Canvas 2D fallback produces acceptable (if slower) results
- [ ] Pattern injection matches Phase 3 pipeline (`<pattern><image/></pattern>`)

---

## Phase 5: Topological Gradients

The novel concept. Gradients defined by closed-path contours at specified elevations, mapped to colors through a ramp — like a topographic map rendered as a smooth surface.

### Goals

- `@topo` declaration with closed-path contours at specified elevations
- Color ramp mapping elevation to color
- GPU rendering via SDF computation → elevation interpolation → color lookup
- Per-contour and global easing functions
- Multiple peaks and islands (non-nested contours)
- Optional Laplace solver for maximum smoothness
- Integration with Pathogen variables/expressions for parameterized contours

### Mental Model

Users define a scalar **elevation field** shaped by closed path contours. Think of a topographic map: each contour line represents a constant elevation, and the surface rises smoothly between them. The elevation at each pixel is then mapped to a color through a ramp.

```
┌─────────────────────────────────────┐
│ ocean (elev 0.0)                    │
│   ┌───────────────────────┐         │
│   │ shore (elev 0.3)      │         │
│   │   ┌───────────────┐   │         │
│   │   │ lowland (0.55) │   │         │
│   │   │   ┌───────┐   │   │         │
│   │   │   │ peak  │   │   │         │
│   │   │   │ (0.8) │   │   │         │
│   │   │   └───────┘   │   │         │
│   │   └───────────────┘   │         │
│   └───────────────────────┘         │
│                     ┌─────┐         │
│                     │ 0.3 │ ← island│
│                     │┌─┐  │         │
│                     ││.6│ │         │
│                     │└─┘  │         │
│                     └─────┘         │
└─────────────────────────────────────┘
```

### Syntax

**Basic topological gradient:**

```pathogen
let ocean = Color('#1a5276');
let shore = Color('#f9e79f');
let lowland = Color('#27ae60');
let highland = Color('#6e2c00');
let snow = Color('#ffffff');

@topo terrain (400, 300) {
  colors {
    0.0  ocean
    0.25 shore
    0.5  lowland
    0.8  highland
    1.0  snow
  }

  easing: ease-in-out

  contour(0.3) {
    M 50 50 C 150 10 300 80 350 150
    C 320 260 80 270 50 50 Z
  }

  contour(0.55) {
    M 100 90 C 180 50 280 110 260 190
    C 220 240 120 220 100 90 Z
  }

  contour(0.8) {
    M 160 120 C 210 90 260 140 240 180
    C 210 210 160 190 160 120 Z
  }
}

define PathLayer('map') ${ fill: topo(terrain); }
layer('map').apply { rect(0, 0, 400, 300) }
```

The `(400, 300)` specifies render resolution. Each `contour(elevation)` defines a closed path at a fixed elevation. The `colors` block maps elevations to colors. Pixels between contours interpolate smoothly.

**Multiple peaks / islands:**

```pathogen
@topo archipelago (600, 400) {
  colors {
    0.0  Color('#1a5276')    // deep water
    0.2  Color('#3498db')    // shallow water
    0.35 Color('#f9e79f')    // sand
    0.5  Color('#27ae60')    // grass
    0.85 Color('#6e2c00')    // rock
    1.0  Color('#ffffff')    // snow
  }

  easing: ease-in-out

  // Main island
  contour(0.35) {
    M 50 50 C 150 10 300 80 350 150
    C 320 260 80 270 50 50 Z
  }
  contour(0.55) { M 100 90 C 180 50 280 110 260 190 C 220 240 120 220 100 90 Z }
  contour(0.85) { M 160 120 C 210 90 260 140 240 180 C 210 210 160 190 160 120 Z }

  // Small island (separate feature, not nested)
  contour(0.35) {
    M 400 250 C 440 230 500 260 490 310
    C 470 350 420 340 400 250 Z
  }
  contour(0.6) {
    M 430 270 C 460 255 485 275 475 300
    C 465 320 440 315 430 270 Z
  }
}
```

Non-nested contours at the same elevation create separate features. The algorithm automatically handles this — each pixel's elevation is determined by its innermost containing contour.

**Per-contour easing:**

```pathogen
@topo cliffs (400, 300) {
  colors {
    0.0  Color('#3498db')
    0.3  Color('#f9e79f')
    1.0  Color('#6e2c00')
  }

  easing: ease-in-out             // global default

  contour(0.3) {
    M 50 50 C 150 10 300 80 350 150
    C 320 260 80 270 50 50 Z
  }

  contour(0.8, easing: steps(1)) {  // hard cliff edge
    M 160 120 C 210 90 260 140 240 180
    C 210 210 160 190 160 120 Z
  }
}
```

| Easing | Effect |
|---|---|
| `linear` | Constant slope between contours |
| `ease-in-out` | Gentle transitions, natural terrain feel |
| `steps(1)` | Hard terraces — flat plateaus with sharp cliffs |
| `ease-out` | Steep near lower contour, gentle approach to upper |
| `cubic-bezier(a, b, c, d)` | Full control over transition curve |

**Parametric contours with variables:**

```pathogen
let peak_height = 0.9;
let cx = 200;
let cy = 150;
let r = 60;

@topo mountain (400, 300) {
  colors {
    0.0  Color('#3498db')
    0.4  Color('#27ae60')
    1.0  Color('#ffffff')
  }

  contour(0.4) {
    M calc(cx - r * 2) cy
    A calc(r * 2) calc(r * 2) 0 1 1 calc(cx + r * 2) cy
    A calc(r * 2) calc(r * 2) 0 1 1 calc(cx - r * 2) cy Z
  }

  contour(peak_height) {
    M calc(cx - r) cy
    A r r 0 1 1 calc(cx + r) cy
    A r r 0 1 1 calc(cx - r) cy Z
  }
}
```

Variables and `calc()` expressions work inside contour path definitions, enabling parametric topography.

**Laplace solver mode:**

```pathogen
@topo smooth_terrain (400, 300) {
  method: laplace         // vs default 'distance'
  iterations: 300         // Jacobi iterations (default: 200)

  colors {
    0.0  Color('#1a5276')
    1.0  Color('#ffffff')
  }

  contour(0.3) { /* ... */ }
  contour(0.7) { /* ... */ }
}
```

The Laplace solver (solving `nabla^2 h = 0`) produces a mathematically "natural" smooth surface that minimizes curvature — like a rubber sheet stretched between the contour boundaries. It's more computationally expensive than the distance-based approach but produces smoother, more natural-looking results.

### The GPU Algorithm

**Distance-based approach** (default `method: distance`):

**Step 1 — Base elevation per pixel:**
- Rasterize each contour as a filled shape (using the path's fill rule)
- Each pixel's base elevation = maximum elevation among all contours that contain it
- Implementation: render each contour to a texture channel, take max

**Step 2 — Signed distance to contour boundaries:**
- Compute signed distance field (SDF) for each contour path
- For each pixel, determine the floor contour (current elevation plateau) and ceiling contour (next higher elevation level)
- Calculate distance to both: `dist_to_floor` and `dist_to_ceiling`
- SDF computation from Bezier curves is well-studied for GPU (segment-based, per-pixel minimum)

**Step 3 — Interpolate elevation:**
```
t = dist_to_floor / (dist_to_floor + dist_to_ceiling)
elevation = mix(floor_elevation, ceiling_elevation, easing(t))
```

The easing function shapes the transition between contour levels. Per-contour easing overrides the global easing for specific transitions.

**Step 4 — Elevation to color:**
- 1D texture lookup using the color ramp
- Maps continuous elevation (0–1) to color
- Ramp defined by the `colors` block, interpolated in OKLab space

**Laplace solver approach** (`method: laplace`):

Instead of Steps 2–3, solve `nabla^2 h = 0` (the Laplace equation) with contour paths as boundary conditions:

- Initialize elevation texture: contour pixels fixed at their elevation, all others = 0
- Jacobi iteration in WebGPU compute shader:
  ```wgsl
  @compute @workgroup_size(8, 8)
  fn jacobi(@builtin(global_invocation_id) id: vec3u) {
    let idx = vec2i(id.xy);
    if (is_boundary[idx]) { return; }  // contour pixels stay fixed
    let avg = (
      elevation[idx + vec2i(1,0)] +
      elevation[idx + vec2i(-1,0)] +
      elevation[idx + vec2i(0,1)] +
      elevation[idx + vec2i(0,-1)]
    ) / 4.0;
    elevation_out[idx] = avg;
  }
  ```
- Ping-pong between two textures for N iterations (typically 100–500)
- Convergence depends on resolution; 200 iterations at 400x300 is usually sufficient
- Result: pixel elevations that form the smoothest possible surface between contour boundaries
- Then apply Step 4 (elevation → color) as normal

### Constraints and Considerations

- **Closed paths only**: Contour paths must be closed (end with `Z`). Open paths have no well-defined "inside."
- **Self-intersecting paths**: Ambiguous interior; the fill rule (nonzero vs evenodd) resolves it, but may produce unexpected results. Warn at compile time.
- **Performance**: SDF computation is O(pixels x path_segments) — the primary bottleneck. For complex contours, consider path simplification or lower resolution.
- **Resolution**: Fixed pixel output, auto-sized from the declared dimensions and device pixel ratio.

### Key files affected

- `src/parser/index.ts` — `@topo` block parsing (contours, color ramp, easing, method)
- `src/evaluator/index.ts` — topo evaluation, contour path collection, variable resolution
- `src/gpu/shaders/topo-distance.wgsl` — **new**: SDF-based elevation shader
- `src/gpu/shaders/topo-laplace.wgsl` — **new**: Jacobi iteration compute shader
- `src/gpu/shaders/color-ramp.wgsl` — **new**: elevation → color lookup
- `tests/topo-gradient.test.ts` — **new**

### Dependencies

- Phase 3 (WebGPU pipeline, pattern injection, caching)
- Phase 4 (OKLab WGSL utilities, shared shader infrastructure)

### Acceptance Criteria

- [ ] `@topo` declaration parses with contours, color ramp, easing, and method
- [ ] Distance-based method renders smooth elevation fields between contour boundaries
- [ ] Laplace solver method produces natural-looking smooth surfaces
- [ ] Per-contour easing overrides produce visible transition differences
- [ ] Multiple peaks/islands render as separate features
- [ ] Color ramp interpolation is perceptually uniform (OKLab space)
- [ ] Variables and `calc()` expressions work in contour path definitions
- [ ] `steps(1)` easing produces sharp cliff edges (hard contour terracing)
- [ ] Self-intersecting contour paths produce a compile warning
- [ ] Output integrates via pattern injection (`<pattern><image/></pattern>`)

---

## Phase 6: Gradient Application Modes

How gradients map onto geometry — particularly strokes. Three modes control the relationship between gradient space and path space.

### Goals

- Mode A (show-through): gradient as fixed background, path as stencil
- Mode B (along-path): gradient flows from path start to end
- Mode C (across-width): gradient flows across stroke thickness
- Integrate with all gradient types from Phases 1–5

### Mode A: Show-Through (Window / Cutout)

The gradient occupies a fixed rectangle. The path acts as a stencil — you see the gradient wherever the fill or stroke exists. This is the default behavior for SVG paint servers with `patternUnits="userSpaceOnUse"`.

```
┌───────────────────────────────┐
│  gradient fills the bounding  │
│  box as a fixed backdrop      │
│     ╱  stroke path  ╲        │  ← gradient color visible only
│    ╱                  ╲       │     where stroke/fill pixels exist
│   ╱                    ╲      │
└───────────────────────────────┘
```

**Syntax:**

```pathogen
// Default — no mode specifier needed
define PathLayer('art') ${ fill: fade; }
define PathLayer('outline') ${ stroke: fade; stroke-width: 8; }
```

This is the native behavior of `fill="url(#...)"` / `stroke="url(#...)"` in SVG. No special implementation beyond Phase 1.

**Works well for**: fills, thick strokes, geometry aligned with gradient direction.

### Mode B: Along-Path

The gradient flows along the path direction — color changes from the start of the path to the end.

```
start ─────────── mid ─────────── end
 red    →     orange    →    yellow    →    white
```

**Syntax:**

```pathogen
define PathLayer('trail') ${
  stroke: gradient(fade, along-path);
  stroke-width: 4;
};

// With segment count control:
define PathLayer('smooth-trail') ${
  stroke: gradient(fade, along-path, segments: 200);
  stroke-width: 4;
};
```

**Implementation strategy — path segmentation:**

Pathogen's compiler already understands path geometry (positions, subpath starts, command history). This enables a compile-time segmentation approach:

1. Compute total path length at compile time
2. Divide path into N segments (default 100, configurable via `segments`)
3. Sample gradient color at each segment's normalized position `t = segment_position / total_length`
4. Emit N individual `<path>` elements, each with a solid `stroke` color

```xml
<!-- Compiled output for along-path with 4 segments (simplified) -->
<path d="M 10 10 L 35 30" stroke="#e63946" stroke-width="4"/>
<path d="M 35 30 L 60 50" stroke="#d4724a" stroke-width="4"/>
<path d="M 60 50 L 85 70" stroke="#5fab85" stroke-width="4"/>
<path d="M 85 70 L 100 100" stroke="#2a9d8f" stroke-width="4"/>
```

This is a CPU-only operation — no GPU needed. The color at each segment position is sampled from the gradient (using `Color.mix()` for OKLCh interpolation between stops).

**Trade-offs:**

| Segments | File size | Visual quality | Performance |
|---|---|---|---|
| 50 | Small | Visible color steps on curves | Fast |
| 100 | Medium | Good for most paths | Fast |
| 200+ | Larger | Smooth even on complex paths | Still fast (CPU only) |

### Mode C: Across-Width

The gradient flows across the stroke thickness — from one edge to the other. Creates pseudo-3D tube effects: dark outer edges, bright center.

```
  outer edge: dark
  ╱──────────────────╲
 │   center: bright    │   ← gradient across stroke width
  ╲──────────────────╱
  outer edge: dark
```

**Syntax:**

```pathogen
define PathLayer('tube') ${
  stroke: gradient(metallic, across-width);
  stroke-width: 12;
};

let metallic = LinearGradient('metallic', 0, 0, 1, 0) {
  stop(0, Color('#333333'))
  stop(0.3, Color('#cccccc'))
  stop(0.5, Color('#ffffff'))
  stop(0.7, Color('#cccccc'))
  stop(1, Color('#333333'))
};
```

**Implementation — stroke-to-outline conversion:**

This mode requires converting the stroke into a filled shape, then applying the gradient as a fill with UV mapping:

1. Expand the stroke into an outline path (offset curves at +/- half stroke-width)
2. Map gradient U-axis along the path direction, V-axis across the width
3. Render the outlined shape as a filled `<path>` with the gradient pattern

This is the most complex mode and may use the WebGPU pipeline for UV-mapped gradient rendering, or approximate with segmented filled quads.

**Key files affected:**

- `src/evaluator/index.ts` — gradient application mode parsing and evaluation
- `src/compiler.ts` — path segmentation for along-path mode
- `src/gpu/shaders/stroke-gradient.wgsl` — **new**: across-width UV mapping (if GPU)
- `src/path-utils.ts` — **new or extended**: path length computation, point-at-length sampling, stroke-to-outline
- `tests/gradient-modes.test.ts` — **new**

### Dependencies

- Phase 1 (gradient definitions, paint server references)
- Phase 3 (WebGPU pipeline, for across-width mode)

### Acceptance Criteria

- [ ] Show-through mode works with no additional syntax (default SVG behavior)
- [ ] Along-path mode segments the path and applies interpolated solid colors
- [ ] `segments` parameter controls along-path visual quality vs. output size
- [ ] Along-path uses OKLCh interpolation for color sampling between stops
- [ ] Across-width mode converts stroke to outline and applies gradient across thickness
- [ ] All three modes work with linear, radial, and programmatic gradients
- [ ] Along-path and across-width modes work together (gradient along path AND across width)

---

## Cross-Cutting Concerns

### Playground Integration

**Phase 1–2**: Standard SVG rendering — gradients in `<defs>` render natively. No special playground work.

**Phase 2** (conic): Canvas-rendered conic gradient preview. First use of pattern injection in the playground.

**Phase 3+**: GPU-rendered gradients require:
- WebGPU availability detection (with Canvas 2D fallback messaging)
- Blob URL lifecycle management (create on render, revoke on re-render or dispose)
- Gradient parameter editor UI (color stops, control points, easing curves)
- Real-time preview as gradient parameters change (leveraging the cache)

**Gradient editors** (playground components):
- Color ramp editor (draggable stops on a bar, color picker per stop)
- Mesh point editor (draggable control points on a 2D canvas)
- Contour elevation editor (for topological gradients — adjust elevation per contour)
- Easing curve preview (per-contour and global)

### Performance

| Phase | Rendering | Expected cost |
|---|---|---|
| 1–2 | Native SVG | Zero overhead — browser handles gradients natively |
| 2 | Conic (Canvas 2D) | One-time canvas render per gradient, cached (off-center/CCW: no extra cost) |
| 3 | Conic + innerRadius (WebGPU) | One-time GPU render, upgrades Phase 2 conics when center radius is used |
| 3–5 | WebGPU | One-time GPU render per gradient, cached as texture |
| 6 | Along-path segmentation | CPU path math, proportional to segment count |
| 6 | Across-width | GPU render or segmented fill approximation |

**Key principle**: gradient textures are rendered once and cached. Only gradient parameter changes trigger re-rendering. Path edits reuse the cached `<pattern>`.

### Export Pipeline

**Live preview** (playground): `canvas.convertToBlob()` → `URL.createObjectURL()` → `<image href="blob:...">`

**Static SVG export**: `canvas.toDataURL('image/png')` → `<image href="data:image/png;base64,...">`. Self-contained — no external dependencies.

**Optimization**: For Phase 1–2 gradients (native SVG), export uses native `<linearGradient>`/`<radialGradient>` elements with no rasterization. Only Phases 3–5 (GPU-rendered) require embedded images.

### Documentation

Each phase should ship with:
- Language reference additions in `docs/` (gradient syntax, constructors, attributes)
- Examples in the playground gallery
- A "Gradients" section in the language guide

### Dependency Graph

```
Phase 1: Native SVG Gradients
    |
    v
Phase 2: Advanced Gradient Features (conic via Canvas 2D: off-center, CW/CCW, start angle)
    |
    v
Phase 3: WebGPU Rendering Pipeline ──────────────┬───────────────────────────┐
    |                                              |                           |
    |   enhances Phase 2 conic:                    |                           |
    |   + innerRadius (smooth center plateau)      |                           |
    |                                              v                           v
    v                                  Phase 6: Gradient App Modes    (Mode A: Phase 1 only)
Phase 4: Mesh & Freeform Gradients     (Mode B: CPU path math)
    |                                  (Mode C: benefits from Phase 3)
    v
Phase 5: Topological Gradients
```

Phase 3 retroactively enhances Phase 2's conic gradients with the `innerRadius` property — the only conic feature that requires per-pixel shader control.

Phase 6 is partially independent — Mode A (show-through) works immediately after Phase 1, and Mode B (along-path) needs only CPU path math. Mode C (across-width) benefits from Phase 3's GPU pipeline but can be approximated without it.

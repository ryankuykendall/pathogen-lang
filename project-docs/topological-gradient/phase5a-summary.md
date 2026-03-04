# Phase 5A: Topological Gradient (Distance-Based SDF)

## Overview

Phase 5A adds **TopoGradient** — gradients defined by closed-path contours at specific elevations, with color mapped through each contour. Think topographic maps rendered as smooth gradient surfaces.

## Key Design Decision: Contour-is-the-Color-Stop

The user preferred a model where each contour carries its own color, rather than separating color stops from contour geometry. This means:

- `g.contour(path, elevation, color)` — each contour defines shape, elevation, AND color
- `topo.baseColor = Color(...)` — sets the base color outside all contours (elevation 0)
- No separate `g.stop()` mechanism for topo gradients
- The color ramp is automatically built from contour colors sorted by elevation

### Interface

```typescript
interface TopoContour {
  elevation: number;           // 0–1 normalized
  commands: PathBlockCommand[];
  dString: string;
  color: OKLCH;
  colorCSS: string;
}
```

## Architecture

### Evaluator (`src/evaluator/index.ts`)
- `TopoContour` interface with elevation + color
- Extended `GradientValue` and `GradientOutput` with `gradientType: 'topo'`
- `TopoGradient(id, width, height)` constructor (3-arg, trailing block)
- `.contour(path, elevation, color)` method — validates ProjectedPathValue, range, closedness
- Property access/assignment: `easing`, `method`, `baseColor`, `width`, `height`, `id`, `interpolation`
- Output serialization: builds `stopsWithOklch` from contours + baseColor

### GPU Rendering (`playground/gpu/`)
- **svg-path-parser.js** — Flattens SVG d-strings to line segments (`Float32Array`)
- **topo-shader.js** — WGSL SDF fragment shader (ray-cast containment, distance interpolation, easing, OKLab)
- **topo-pipeline.js** — WebGPU render pipeline (4 bind group entries)
- **gradient-service.js** — `renderTopoGradients()` + Canvas 2D fallback

### Playground Integration
- **workspace-view.js** — Topo added to pre-rendering Promise.all
- **svg-preview-pane.js** — Topo added to pattern injection condition
- **texture-cache.js** — Hash key for topo gradients

### CLI (`src/cli.ts`)
- Warning emitted, solid-color approximation (baseColor or first contour color)

## Algorithm: Distance-Based Elevation

Per pixel:
1. **Containment test**: Ray-cast even-odd rule for each contour
2. **Floor**: Highest elevation among containing contours
3. **Ceiling**: Lowest elevation among non-containing contours above floor
4. **Distance interpolation**: `t = dist_floor / (dist_floor + dist_ceil)`, apply easing
5. **Color**: Sample ramp at `mix(floorElev, ceilElev, t)`

## Test Coverage

35 new tests covering:
- Constructor validation (6 tests)
- `.contour()` method validation (10 tests)
- Properties: easing, method, baseColor (10 tests)
- Output serialization (3 tests)
- Validation warnings (1 test)
- Log formatting (1 test)
- Fill/stroke integration (2 tests)
- Programmatic contours via loops (1 test)

## Files Changed/Created

### New Files
- `playground/gpu/topo-shader.js`
- `playground/gpu/topo-pipeline.js`
- `playground/gpu/svg-path-parser.js`

### Modified Files
- `src/evaluator/index.ts` — TopoContour, GradientValue, GradientOutput, constructor, methods, properties, serialization
- `src/cli.ts` — Topo fallback
- `playground/gpu/gradient-service.js` — renderTopoGradients, WebGPU + Canvas 2D render paths
- `playground/gpu/texture-cache.js` — Hash key for topo
- `playground/components/workspace-view.js` — Pre-rendering
- `playground/components/svg-preview-pane.js` — Pattern injection
- `tests/gradients.test.ts` — 35 new tests
- `docs/gradients.md` — TopoGradient section

## Phase 5B Placeholder

- Laplace solver (Jacobi iteration on ping-pong textures)
- Per-contour easing
- `method = 'laplace'` currently throws "not yet implemented"

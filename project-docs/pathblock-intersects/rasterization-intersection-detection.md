# Rasterization-Based Intersection Detection

**Date**: 2026-04-02  
**Status**: Exploratory / Educational  
**Context**: Challenges verifying boolean operations (XOR, union) on complex geometry, particularly during radialWedge corner radius work.

## Core Idea

Rasterize paths using distinct colors at low alpha (e.g., 20%), then walk pixels to find blending regions that indicate geometric intersections or overlapping geometry. Increase alpha at path vertices to identify which sub-segments to focus on. Could use HTML Canvas `getImageData()` or WebGPU compute shaders.

## Alpha Compositing Math

Standard Porter-Duff "over" compositing is **not** additive — alpha compounds multiplicatively:

```
α_out = α_src + α_dst × (1 - α_src)
```

- Two 20% alpha layers: `0.2 + 0.2 × 0.8 = 0.36` (not 0.4)
- Three layers: `0.36 + 0.2 × 0.64 = 0.488`

Alpha alone can't precisely count overlaps, but can threshold (α > 0.2 = at least two paths overlap). Better approach: **use distinct color channels** — path A in red, path B in blue. Any pixel with both R > 0 and B > 0 is an intersection region. Supports up to 3 paths via RGB.

## Prior Art

1. **Stencil buffer CSG** — Classic GPU technique. Render each path incrementing a stencil buffer; stencil ≥ 2 = intersection. Used in OpenGL/WebGL CSG since the 1990s. Cleaner than alpha blending (exact counting, no compositing math).

2. **Image-space boolean operations** — Some SVG renderers (notably Skia/Chrome) use rasterization for boolean fill rules internally. Even-odd and winding number rules are pixel-level inside/outside classification.

3. **Broad-phase / narrow-phase collision detection** — From physics engines. Rasterization fits as a "medium phase" between cheap bounding-box tests and expensive curve-curve intersection.

4. **Coverage masks in font rasterization** — FreeType and similar rasterizers use per-pixel coverage analysis conceptually similar to this approach.

## Detection vs. Construction

**Detection** (finding *where* intersections occur) — rasterization works well:
- Debugging/verification (e.g., the radialWedge scenario)
- Approximate area computation via pixel counting
- Narrowing down which segments intersect before running expensive geometric tests
- Visual confirmation that a boolean op produced the correct result

**Construction** (producing the output path of a boolean operation) — rasterization alone is insufficient. Boolean ops require:
1. Exact intersection points (parametric t-values on curves)
2. Path splitting at those points
3. Walking split segments choosing correct inside/outside portions
4. Reconstructing new path geometry

Rasterization gives approximate regions, not exact parametric coordinates. However, it can serve as a **segment-level filter**: rasterize each segment with a unique ID, find overlapping pixel regions, then only run exact intersection on segment pairs that share pixels. This uses the GPU as a spatial index.

## WebGPU Opportunities

- **Compute shader approach**: Rasterize hundreds of path segments into a grid in parallel, then detect overlapping cells in a second pass. Dramatically faster than CPU bounding-box tests for complex paths.
- **Stencil-equivalent in compute**: Storage buffers with atomics — each path increments a counter per pixel. Final pass reads cells where counter > 1. No alpha math needed.
- **Vertex highlighting**: Writing distinct markers at control points and on-curve points identifies not just *that* paths intersect but approximately *which vertices* are near the intersection.

## Performance Assessment

- **Simple cases** (two paths, few segments): Overhead of rasterization + GPU dispatch + readback exceeds brute-force segment-pair intersection.
- **Complex cases** (many paths, hundreds of segments, repeated queries): GPU parallelism scales better. Rasterize once, query many times.
- **Debugging/verification**: Almost certainly valuable in developer time savings — computationally identifying problem regions vs. visual squinting at SVG output.

## Potential Directions

1. **Visual debugging tool**: Canvas overlay rasterizing input paths in distinct colors, highlighting intersection regions, marking control points, drawing crosshairs at approximate intersection locations.
2. **Broad-phase optimization**: Use rasterization as a segment-pair filter before exact curve-curve intersection when boolean ops hit performance walls on complex geometry.
3. **Standalone educational exploration**: Implement the technique as a learning exercise in GPU compute and image-space geometry.

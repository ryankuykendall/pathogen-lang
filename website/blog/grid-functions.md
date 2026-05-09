---
title: "Procedural Grids: Square, Triangle, and Hexagon Patterns in Pathogen"
slug: grid-functions
date: 2026-03-23
description: "Three stdlib functions that generate complete grid geometries — squares, equilateral triangles, and hexagons — with four visual pattern types each."
---

Grid patterns show up everywhere — engineering overlays, graph paper, game boards, architectural plans, generative art backgrounds. Building one from scratch means nested loops, coordinate math, and careful edge deduplication for triangles and hexagons. Pathogen's three new grid functions collapse all of that into a single call.

`squareGrid`, `triangleGrid`, and `hexagonGrid` each generate complete path geometry within a bounding rectangle. A [`GridPatternType`](/docs#stdlib-grid-functions) enum selects the visual style — **Shape**, **Dot**, **Intersection**, or **Partial** — and all three return `PathSegment` values, so they compose with [layers](/docs#layers-defining-layers), transforms, and clip paths just like `circle()` or `polygon()`.

## Square Grids

```pathogen
squareGrid(type, x, y, width, height, cellSize)
```

| Parameter | Description |
|-----------|-------------|
| `type` | `GridPatternType` — `.Shape`, `.Dot`, `.Intersection`, or `.Partial` |
| `x, y` | Top-left origin |
| `width, height` | Bounding dimensions |
| `cellSize` | Side length of each square cell |

The grid fills as many complete cells as fit: `floor(width / cellSize)` columns and `floor(height / cellSize)` rows. Extra space is ignored.

<mini-workspace src="samples/post15/square-grid-patterns.pathogen" caption="squareGrid — four pattern types with reactive colors" code-open></mini-workspace>

## Triangle Grids

```pathogen
triangleGrid(type, x, y, width, height, cellSize)
```

Same parameters as `squareGrid`, but `cellSize` is the triangle **height** (altitude of the equilateral triangle). The side length is derived: `side = 2 × cellSize / √3`. Triangles alternate between point-up and point-down orientations, with odd rows offset by half a side length to form a seamless tessellation.

The intersection marks on triangle grids are edge-aligned — six arms at 60° intervals (three bidirectional lines), matching the grid's natural symmetry where six edges meet at each interior vertex.

<mini-workspace src="samples/post15/triangle-grid-patterns.pathogen" caption="triangleGrid — equilateral triangle tessellation in four pattern types" code-open></mini-workspace>

## Hexagon Grids

```pathogen
hexagonGrid(type, x, y, width, height, cellSize, orientation?)
```

The hexagon function adds a seventh parameter: `orientation`. It accepts the `HexagonOrientation` enum — `.Edge` for flat-top hexagons (an edge faces up) or `.Vertex` for pointy-top (a vertex faces up). When omitted, it defaults to `.Edge`.

| Orientation | Top | cellSize meaning |
|-------------|-----|-----------------|
| `HexagonOrientation.Edge` | Flat edge | Flat-to-flat height |
| `HexagonOrientation.Vertex` | Pointed vertex | Point-to-point height |

Intersection marks on hex grids are 3-arm radial marks — matching the three edges that meet at each vertex.

<mini-workspace src="samples/post15/hexagon-grid-patterns.pathogen" caption="hexagonGrid — flat-top hexagons in four pattern types" code-open></mini-workspace>

### Orientation Comparison

The two orientations produce visually distinct tessellations from the same cell size:

<mini-workspace src="samples/post15/hexagon-orientations.pathogen" caption="HexagonOrientation.Edge (flat-top) vs HexagonOrientation.Vertex (pointy-top)" code-open></mini-workspace>

## Four Pattern Types

All three grid functions share the same `GridPatternType` enum:

| Pattern | Visual | Description |
|---------|--------|-------------|
| **Shape** | Cell outlines | Complete grid lines — every edge drawn once |
| **Dot** | Small circles | Dots at every grid vertex |
| **Intersection** | Edge-aligned marks | Marks where edges meet — axis-aligned `+` for squares, 6-arm stars for triangles (3 bidirectional lines at 60°), 3-arm Y for hexagons |
| **Partial** | Centered segments | 40% of each edge length, centered on the edge midpoint |

Pattern proportions are relative to `cellSize`: dot radius is 2.5%, intersection arm length is 7.5%.

## Putting It Together

Grid functions are most useful as background textures layered behind other geometry. Combine them with [layer transforms](/docs#layers-defining-layers) for rotation, and use `Color` methods to derive palette variations from a single reactive base color:

<mini-workspace src="samples/post15/grid-composition.pathogen" caption="Layered composition — rotated partial grid, hex outline, and triangle intersections" code-open></mini-workspace>

The composition uses three techniques worth noting:

- **Rotation via transforms** — `gridLayer.ctx.transform.rotate.set(0.08pi)` tilts the background grid. The grid area is oversized (`-40, -40, 480, 480`) to prevent gaps at the rotated corners.
- **Layered grid types** — a partial square grid as subtle texture, hex outlines as mid-ground structure, and triangle intersection marks as a focal accent. Each gets its own `PathLayer` with distinct styling.
- **Color derivation** — all three grid colors derive from a single `--grid-color` variable via `.lighten()` and `.hueShift()`, so changing the base color recolors the entire composition.

The core pattern is always the same: create a styled `PathLayer`, optionally set a transform, then call the grid function inside `layer.apply {}`.

Three functions, four pattern types, two hexagon orientations — enough to cover graph paper, game boards, engineering overlays, and generative art backgrounds without writing a single loop. Try changing the `--grid-color` and `--bg-color` variables in any of the examples above to see how the reactive colors work.

For the full function signatures and parameter details, see the [stdlib reference](/docs#stdlib-grid-functions). For layer management and transforms, see the [layers documentation](/docs#layers-defining-layers). For combining grids with reusable path blocks, see the [PathBlock introduction](/blog/pathblock-introduction).

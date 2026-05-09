---
title: "Topological Gradients: Painting with Signed Distance Fields"
date: "2026-03-05"
slug: "gradient-topological"
description: "What if gradient color stops were not positions on a line, but closed paths? TopoGradient uses signed distance fields and Laplace solvers to create terrain-like gradients from arbitrary contour shapes."
---

Every gradient type we have covered so far places colors at geometric positions — along a line, around a circle, at grid intersections, at scattered points. The geometry is abstract: coordinates in a normalized space that the renderer interpolates between.

What if the color stops were not positions, but shapes? What if a gradient followed the contour of a path — radiating outward from an organic curve instead of a straight line? This is what `TopoGradient` does. It takes closed paths at specified elevations and uses signed distance fields to blend between them, producing topographic map-like gradients where the color follows the shape of the terrain.

## Contours as Color Stops

A `TopoGradient` replaces the linear stop list with a set of contour definitions. Each contour is a closed path placed at an elevation between 0 and 1. The `baseColor` fills elevation 0 (the "sea level"), and contours define higher-elevation regions with their own colors.

```pathogen
let outer = @{
  m 0 0
  c 120 -50 260 30 280 120
  c -20 120 -260 130 -280 -120
  z
};

let topo = TopoGradient('terrain', 400, 400) {|g|
  g.contour(outer.project(60, 60), 0.25, Color('#f9e79f'))
  g.contour(mid.project(90, 90),   0.5,  Color('#27ae60'))
  g.contour(peak.project(180, 170), 0.8, Color('#6e2c00'))
};
topo.baseColor = Color('#1a5276');
topo.easing = 'smoothstep';
topo.interpolation = 'oklch';
```

Contour paths are defined as path variables using the `@{ ... }` syntax and positioned using `.project(x, y)`. The `.contour()` method takes three arguments: a projected path, an elevation scalar, and a `Color`. The path must be closed (ending with `z`).

The elevation value determines where this contour sits in the gradient's range. At elevation 0.0, the `baseColor` applies. At 0.25, the first contour's color takes over. Between contours, the renderer interpolates based on the signed distance from each contour boundary.

<mini-workspace src="samples/post4/topo-basics.pathogen" caption="Three nested contours at elevations 0.25, 0.5, and 0.8 — terrain from paths" code-open></mini-workspace>

## Multiple Peaks

Contours do not need to be nested. Two separate closed paths at the same elevation create independent features — like two islands in an ocean. The distance field solver treats each contour independently, producing smooth gradients around each shape that merge naturally in the shared base region.

```pathogen
let topo = TopoGradient('twins', 500, 350) {|g|
  // Left peak — warm tones
  g.contour(island.project(30, 60),  0.3, Color('#f9e79f'))
  g.contour(summit.project(130, 120), 0.7, Color('#e74c3c'))

  // Right peak — cool tones
  g.contour(island.project(260, 80),  0.3, Color('#aed9e0'))
  g.contour(summit.project(360, 140), 0.7, Color('#5e60ce'))
};
```

The twin peaks below use the same base shape (an organic blob) projected to two different positions. Each peak has its own color palette — warm tones on the left, cool on the right — but shares the same dark ocean base color.

<mini-workspace src="samples/post4/topo-twin-peaks.pathogen" caption="Two independent peaks at the same elevation — warm and cool palettes"></mini-workspace>

## Distance vs Laplace

`TopoGradient` supports two solver methods that control how elevation is computed between contours.

### Distance (SDF)

The default method. For each pixel, the renderer computes the signed distance to every contour boundary and maps the result to an elevation value. This produces concentric gradient bands that follow the exact shape of each contour, like the rings of a topographic map.

Distance solving is fast (O(pixels * contour_segments)) and produces predictable results. The bands are always parallel to the contour boundaries. This is the right choice when you want a clean, cartographic look.

### Laplace Solver

The Laplace method treats contour elevations as boundary conditions and solves Laplace's equation using Jacobi iteration. The result is a smooth potential field — like temperature distribution on a surface where each contour is held at a fixed value.

Where the distance method produces sharp, contour-following bands, the Laplace solver produces organic, flowing transitions that smooth out geometric details. It also handles concave shapes and intersecting contours more naturally.

```pathogen
topo.method = 'laplace';
topo.iterations = 300;
```

The `iterations` property controls convergence (default 200, max 2000). Higher values produce smoother results at the cost of render time. For most cases, 200-400 iterations are sufficient.

<mini-workspace src="samples/post4/method-comparison.pathogen" caption="Same three contours — distance (concentric) vs Laplace (smooth potential field)" code-open></mini-workspace>

## Easing

The `.easing` property controls how elevation values are interpolated between contours. Five modes are available:

- **linear**: Uniform transition. Equal distance produces equal color change.
- **smoothstep**: An S-curve that eases in and out. The most natural-looking default.
- **ease-in**: Slow start, fast finish. Color change accelerates toward higher elevations.
- **ease-out**: Fast start, slow finish. Color change decelerates toward higher elevations.
- **ease-in-out**: Slow start and finish, fast middle. A more pronounced S-curve than smoothstep.

Easing is applied after the solver computes the raw elevation — it remaps the value through the chosen curve before looking up the color. This means the same contour geometry produces different visual densities depending on the easing mode.

<mini-workspace src="samples/post4/easing-modes.pathogen" caption="Five easing modes applied to the same two contours" code-open></mini-workspace>

The `easing-organic` sample demonstrates these curves on more complex contour shapes, where the visual difference is even more pronounced.

## Terrain Map

With five elevation bands and the Laplace solver, `TopoGradient` can produce convincing terrain maps. Each contour represents a different geographic feature — ocean, beach, lowland, forest, ridge, summit — with colors chosen to match cartographic conventions.

The sample below nests five contour shapes, each slightly smaller than the last, at increasing elevations. The Laplace solver (400 iterations) produces the smooth, flowing transitions between bands. An embedded legend labels each elevation.

<mini-workspace src="samples/post4/terrain-map.pathogen" caption="Five elevation bands with Laplace solver — ocean to summit"></mini-workspace>

## Artistic Composition

TopoGradient is not limited to cartography. When contours overlap, the solver blends their influence regions, creating complex color fields that emerge from simple shape definitions. Overlapping blobs at different elevations produce layered, painterly effects.

The abstract composition below uses six contours — two warm clusters, two cool clusters, and a center overlap — with the Laplace solver and ease-in-out easing. The three contour groups interact where their influence regions meet, producing a result that looks hand-painted but is fully defined by code.

<mini-workspace src="samples/post4/topo-abstract.pathogen" caption="Overlapping contour clusters with Laplace blending — abstract topography"></mini-workspace>

### Geometric Contours

When contour shapes are angular rather than organic, the results change character. Nested rotated rectangles produce sharp ridgelines and faceted valleys — the Laplace solver smooths the transitions between angular boundaries while preserving the geometric feel. The schematic on the right shows each contour outline with its elevation value and color, so you can trace how the gradient follows the shape geometry.

<mini-workspace src="samples/post4/topo-nested-rects-annotated.pathogen" caption="Nested rotated rectangles — four angular contours at increasing elevations with annotated contour map"></mini-workspace>

Multi-cluster polygonal contours create crystal-like formations. Three separate shape clusters — a central blue faceted core, a magenta wedge in the lower right, and a green shard in the upper left — compete for influence across the canvas. Where their distance fields overlap, the Laplace solver blends them into smooth transitions that emerge from purely angular geometry.

<mini-workspace src="samples/post4/topo-crystal-annotated.pathogen" caption="Crystal formation — eight polygonal contours across three clusters with annotated contour map"></mini-workspace>

### Organic Methods Compared

The method choice matters most with complex organic contours. The same three shapes — a sweeping coastline curve, a flat-topped mesa, and a sharp triangular spire — produce markedly different results under the two solvers. Distance (SDF) creates concentric bands that follow every curve and corner exactly. The Laplace solver diffuses those boundaries into flowing transitions, softening the mesa's flat top and the spire's sharp point into a continuous potential field.

<mini-workspace src="samples/post4/method-organic-annotated.pathogen" caption="Distance vs Laplace with organic contours — annotated schematic shows the three shared shapes"></mini-workspace>

## What Comes Next

This is the sixth gradient type in Pathogen's system — linear, radial, conic, mesh, freeform, and topological. In the [final post](/blog/gradient-pipeline) of this series, we step back and look at the infrastructure that makes it all work: `GroupLayer` for scene composition, the CLI's `--render-gpu` flag for headless GPU rendering, the mini-workspace component that powers these interactive demos, and the build pipeline that turns `.pathogen` source files into the blog you are reading now.

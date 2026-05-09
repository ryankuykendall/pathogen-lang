---
title: "Mesh and Freeform: Gradients That SVG Forgot"
date: "2026-03-04"
slug: "gradient-mesh-freeform"
description: "SVG2 proposed mesh gradients, then abandoned them. Pathogen implements both grid-based mesh gradients and scatter-based freeform gradients with GPU-accelerated rendering."
---

The SVG2 draft spec included a `<meshGradient>` element. It described a grid of color patches with bilinear interpolation — the kind of gradient that tools like Adobe Illustrator have supported for decades. The spec was never finalized. No browser implemented it. The feature was quietly dropped.

Pathogen brings it back, along with a second model that was never even proposed: freeform gradients where color points are placed at arbitrary positions and blended using inverse-distance weighting. Both types are GPU-rendered at compile time, producing base64-encoded `<pattern>` elements identical to conic gradients.

## MeshGradient: The Grid Model

A `MeshGradient` defines a rectangular grid of control points, each with an assigned color. Between the points, colors are interpolated bilinearly — smoothly blending across rows and columns. The constructor takes an ID, pixel dimensions, and the grid size:

```pathogen
let mesh = MeshGradient('corners', 400, 400, 2, 2) {|g|
  g.getPoint(0, 0).color = Color('#e63946');
  g.getPoint(0, 1).color = Color('#f4a261');
  g.getPoint(1, 0).color = Color('#264653');
  g.getPoint(1, 1).color = Color('#2a9d8f');
};
mesh.interpolation = 'oklch';
```

A 2x2 grid is the simplest case — four corners, each a different color, with smooth blending across the surface. The result looks like what you might get from a CSS four-corner gradient, except it is rendered as a high-resolution image embedded in SVG.

<mini-workspace src="samples/post3/mesh-basics.pathogen" caption="2x2 mesh — four corner colors with bilinear OKLCH interpolation" code-open></mini-workspace>

## Working with the Grid

Larger grids give more control. A 3x3 grid has 9 control points, allowing you to define a center color distinct from the edges. The `getPoint(row, col)` method returns a point object whose `.color` property you set.

Beyond color assignment, mesh points support `.translate(dx, dy)` to shift their position away from the uniform grid. This breaks the regularity, creating organic warps and distortions. The bilinear interpolation follows the deformed grid, producing gradient shapes that would be impossible with uniform blending.

```pathogen
let deformed = MeshGradient('deformed', 200, 280, 3, 3) {|g|
  g.getPoint(0, 0).color = Color('#7c3aed');
  // ... assign all 9 colors ...

  g.getPoint(1, 1).translate(40, -30);  // shift center
  g.getPoint(0, 1).translate(0, 20);    // warp top edge
};
```

<mini-workspace src="samples/post3/mesh-deformation.pathogen" caption="Uniform grid vs deformed grid — same colors, different point positions"></mini-workspace>

The `getRow(n)` method returns all points in a row, useful for applying consistent colors across a horizontal band. For more complex scenes, higher-resolution grids (4x4, 5x5) with translated points can simulate terrain, fabric folds, or atmospheric effects. The `mesh-landscape` sample demonstrates a 4x3 grid producing a stylized landscape.

## FreeformGradient: The Scatter Model

Where `MeshGradient` constrains colors to a grid, `FreeformGradient` places them anywhere. You specify color points at arbitrary pixel coordinates, and the renderer blends them using inverse-distance weighting (IDW). Each pixel's color is a weighted average of all points, with closer points contributing more.

```pathogen
let nebula = FreeformGradient('nebula', 400, 400) {|g|
  g.point(60,  70,  Color('#e63946'));
  g.point(340, 60,  Color('#f4a261'));
  g.point(200, 200, Color('#9b5de5'));
  g.point(80,  340, Color('#2a9d8f'));
  g.point(330, 320, Color('#f72585'));
  g.point(200, 80,  Color('#4cc9f0'));
};
nebula.falloff = 2.0;
nebula.interpolation = 'oklch';
```

The `g.point(x, y, color)` method places a color source at absolute coordinates. Six points with OKLCH interpolation produce a smooth nebula-like color field. The small dots in the demo below mark where each color point is placed.

<mini-workspace src="samples/post3/freeform-scatter.pathogen" caption="Six color points blended with inverse-distance weighting" code-open></mini-workspace>

## Controlling Falloff

The `.falloff` property is an exponent that controls how quickly a point's influence decreases with distance. It defaults to 2.0 (inverse-square), which produces natural-looking blending. Lower values create smoother, more uniform blends. Higher values create tight halos around each point with sharper boundaries.

- **falloff = 1.0**: Linear falloff. Colors blend gradually across the entire surface. Each point's influence extends far, producing a uniformly mixed result.
- **falloff = 2.0**: Inverse-square. The natural default. Points dominate their local neighborhood but still blend at medium distances.
- **falloff = 4.0**: Tight halos. Each point's color is concentrated in a small region, with rapid transitions between adjacent points.

<mini-workspace src="samples/post3/falloff-comparison.pathogen" caption="Same five points at three falloff exponents: 1.0, 2.0, 4.0" code-open></mini-workspace>

## Mesh vs Freeform

The two gradient types serve different design needs. MeshGradient excels at structured, predictable blending — backgrounds, UI surfaces, and any case where you want precise control over the transition boundaries. FreeformGradient is better for organic, painterly effects — glows, nebulae, abstract art.

The comparison below places the same nine colors using both methods. The mesh version (left) uses a 3x3 grid with bilinear interpolation, producing clean diagonal transitions. The freeform version (right) uses the same colors at similar positions with IDW blending, producing rounder, more diffuse regions.

<mini-workspace src="samples/post3/mesh-vs-freeform.pathogen" caption="Same 9 colors — bilinear grid vs inverse-distance scatter" code-open></mini-workspace>

In practice, the choice depends on the visual you are after. Mesh gradients give you the regularity of a grid with optional deformation for organic touches. Freeform gradients give you complete spatial freedom at the cost of less predictable boundaries. Both are tools in the same system — you can use them in the same Pathogen source file, assign them to different layers, and compose them freely.

## Rendering Pipeline

Mesh and freeform gradients use the same GPU rendering pipeline as conic gradients. In the playground and when using `--render-gpu` in the CLI, a WebGPU compute shader processes each gradient:

- **MeshGradient**: A bilinear interpolation shader that maps each output pixel to the enclosing grid cell, computes the local UV coordinates, and blends the four corner colors.
- **FreeformGradient**: An IDW shader that evaluates the weighted contribution of every color point for each output pixel, with the falloff exponent controlling the distance curve.

Both shaders support OKLCH interpolation natively — the blending happens in OKLCH space when enabled, then converts to sRGB for the final output image. The result is embedded as a base64 PNG in a `<pattern>` element, identical to the conic gradient output.

When WebGPU is unavailable, a Canvas 2D fallback renders the gradient at reduced resolution (4x downscale) and upsamples with bilinear filtering. The visual quality is slightly lower but the output is functionally identical.

## What Comes Next

Linear, radial, conic, mesh, and freeform gradients all share a common pattern: colors are placed at geometric positions (along a line, around a circle, at grid intersections, at scattered points) and interpolated between them. The [next post](/blog/gradient-topological) introduces a fundamentally different model — topological gradients, where colors follow the contours of arbitrary path shapes using signed distance fields and Laplace solvers.

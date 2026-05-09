---
title: "Fillets and Chamfers: Rounding and Cutting Corners"
slug: pathblock-fillets-chamfers
date: 2026-03-12
description: "Chamfer, fillet, and elliptical fillet operations on PathBlocks — cut corners with straight lines, round them with circular arcs, or shape them with ellipses."
---

*Part 3 of 4 in our series on PathBlock extensions.*

> **Series: PathBlock Extensions**
> 1. [Introduction to PathBlocks](/blog/pathblock-introduction)
> 2. [Exploring Parametric Sampling](/blog/pathblock-parametric-sampling)
> 3. **Fillets and Chamfers** (this post)
> 4. [Boolean Operations](/blog/pathblock-boolean-operations)

Sharp corners are the default in SVG paths. Every junction between two line segments creates a hard vertex. Chamfers and fillets transform these corners — chamfers cut them with straight lines, fillets round them with arcs. Both operations work on [PathBlocks](/blog/pathblock-introduction) and return new PathBlocks, so you can chain them with other transforms.

When should you reach for a chamfer vs. a fillet? Chamfers produce a machined, technical look — think hardware enclosures, PCB traces, or geometric badges. Fillets produce organic, smooth corners — rounded UI elements, product forms, or anything that needs to feel softer. The choice is aesthetic: same trim-and-replace infrastructure, different visual character.

## Chamfers

A [chamfer](/docs#path-blocks-chamfers) replaces a corner vertex with a straight line. The incoming and outgoing edges are trimmed by a distance, and a line segment connects the two trim points. The result is a beveled corner.

### Symmetric Chamfer

The simplest form trims equal amounts from both edges at every corner:

```pathogen
let box = @{ h 70 v 70 h -70 z };
let beveled = box.chamfer(10);
beveled.drawTo(20, 20)
```

### Asymmetric Chamfer

Pass two distances to trim different amounts on the incoming and outgoing edges — [`chamfer(d1, d2)`](/docs#path-blocks-chamferd1-d2-pathblock-projectedpath):

```pathogen
let asym = box.chamfer(5, 25);
asym.drawTo(20, 20)
```

### Per-Vertex Chamfer

[`chamferAtVertex(index, distance)`](/docs#path-blocks-chamferatvertexindex-distance-pathblock-projectedpath) targets a single corner. The index comes from the PathBlock's `.vertices` array:

```pathogen
let box = @{ h 70 v 70 h -70 z };
// vertices: (0,0), (70,0), (70,70), (0,70)
let oneCorner = box.chamferAtVertex(1, 15);
```

You can chain `chamferAtVertex` calls to selectively bevel specific corners with different distances.

The anatomy diagram below shows the geometric construction: the red dot is the original vertex, green dots are the trim points at distance `d` along each edge, and the blue line connects them. The yellow dimension arrows show `d1` (incoming) and `d2` (outgoing) trim distances.

<mini-workspace src="samples/post8/chamfer-anatomy.pathogen" caption="Chamfer anatomy — geometric construction at a right-angle corner"></mini-workspace>

<mini-workspace src="samples/post8/chamfer-gallery.pathogen" caption="Chamfer variations — symmetric, large, asymmetric, per-vertex, and chained" code-open></mini-workspace>

The dashed outlines show the original 70×70 box. Each chamfered version demonstrates a different configuration: small symmetric (8px), large symmetric (20px), asymmetric (5px/25px), single vertex (index 1), and two-vertex chaining.

## Fillets

A [fillet](/docs#path-blocks-fillets) replaces a corner with a circular arc tangent to both edges. The trim distance is calculated from the radius and the half-angle between the edges:

```
trimDistance = radius / tan(halfAngle)
```

This ensures the arc is tangent to both edges at the trim points. The sweep direction is determined by the cross product of the edge vectors.

**Important:** Fillets currently work at **line-line junctions only**. At curve junctions (where a curve meets a line, or two curves meet), the fillet is skipped and a warning is logged. This covers the vast majority of practical cases — rectangles, polygons, stars, and polylines are all line-line. See the [documentation](/docs#path-blocks-fillets) for details.

### All Corners

[`fillet(radius)`](/docs#path-blocks-filletradius-pathblock-projectedpath) rounds every corner:

```pathogen
let box = @{ h 70 v 70 h -70 z };
let rounded = box.fillet(10);
rounded.drawTo(20, 20)
```

### Per-Vertex

[`filletAtVertex(index, radius)`](/docs#path-blocks-filletatvertexindex-radius-pathblock-projectedpath) rounds a single corner:

```pathogen
let oneRound = box.filletAtVertex(1, 20);
oneRound.drawTo(20, 20)
```

The fillet anatomy diagram shows how a circular arc is constructed at a 90° corner. The arc center (at distance `r` from both edges) and the trim formula `trim = r / tan(halfAngle)` are labeled. For a right angle, `trim = r`.

<mini-workspace src="samples/post8/fillet-anatomy.pathogen" caption="Fillet anatomy — arc center, trim points, and radius at a 90° corner"></mini-workspace>

## Elliptical Fillets

[Elliptical fillets](/docs#path-blocks-elliptical-fillets) replace corners with elliptical arcs instead of circular ones. If you've used CSS `border-radius` with two values (e.g., `border-radius: 15px / 8px`), you've already seen elliptical fillets in action — they produce the same asymmetric corner rounding. This gives you control over the corner shape's aspect ratio, useful for UI components, pill shapes, and organic forms where a circular arc is too uniform.

### Basic Elliptical

[`ellipticalFillet(rx, ry)`](/docs#path-blocks-ellipticalfilletrx-ry-pathblock-projectedpath) uses two radii:

```pathogen
let box = @{ h 70 v 70 h -70 z };
let eFilleted = box.ellipticalFillet(15, 8);
eFilleted.drawTo(20, 20)
```

### With Rotation

[`ellipticalFillet(rx, ry, rotation)`](/docs#path-blocks-ellipticalfilletrx-ry-rotation-pathblock-projectedpath) adds an ellipse rotation in radians:

```pathogen
let rotated = box.ellipticalFillet(15, 8, 0.3);
rotated.drawTo(20, 20)
```

### Per-Vertex Variants

[`ellipticalFilletAtVertex`](/docs#path-blocks-ellipticalfilletatvertexindex-rx-ry-pathblock-projectedpath) targets individual corners, with an optional rotation parameter.

### Adapting to Corner Angles

The elliptical fillet computes separate trim distances for each edge based on the tangent parameters of the ellipse. At a 90° corner with `ellipticalFillet(rx, ry)`, the horizontal edges are trimmed by `rx` and the vertical edges by `ry` — matching CSS `border-radius` behavior. The diagram below shows two configurations — `ellipticalFillet(32, 16)` (wider) and `ellipticalFillet(24, 48)` (taller) — at eight different corner angles.

<mini-workspace src="samples/post8/elliptical-fillet-angles.pathogen" caption="Elliptical fillet at various angles — adapts trim distances per-edge"></mini-workspace>

<mini-workspace src="samples/post8/fillet-gallery.pathogen" caption="Fillet gallery — circular (small, large), elliptical, single-vertex, and rotated elliptical" code-open></mini-workspace>

The gallery shows five variations: small circular (r=5), large circular (r=15), elliptical (15×8), single-vertex circular (r=20 at vertex 1), and rotated elliptical (15×8, 0.3 rad).

## Edge Cases and Clamping

Both chamfers and fillets handle edge cases gracefully. From the [documentation](/docs#path-blocks-edge-cases):

- **Radius/distance too large**: If the trim distance exceeds the available edge length, it's clamped to the edge length and a warning is logged. This prevents the operation from failing on small shapes.
- **Out-of-range vertex index**: Throws a descriptive error.
- **Closed paths**: The `z` command is expanded to an explicit line before the corner operation, then the path is re-closed. This means corners at the closure junction are handled correctly.
- **Open paths**: Corners at both endpoints are skipped (there's no second edge to trim).

## Chaining with Other Operations

Because chamfers and fillets return PathBlocks, you can chain them with any other PathBlock method — [`.draw()`](/docs#path-blocks-drawing-a-path-block), [`.drawTo()`](/docs#path-blocks-drawing-a-path-block), [`.project()`](/docs#path-blocks-projecting-without-drawing), [parametric sampling](/docs#path-blocks-parametric-sampling), or [boolean operations](/docs#path-blocks-boolean-operations):

```pathogen
let box = @{ h 60 v 40 h -60 z };
let rounded = box.fillet(8);
let pts = rounded.partition(20);
for (p in pts) {
  // Place dots along the rounded rectangle
}
```

## What's Next

The final post in this series covers [boolean operations](/blog/pathblock-boolean-operations) — combining two closed paths using union, difference, intersection, and xor. Since everything returns a PathBlock, you'll see how these operations compose with the fillets and chamfers covered here.

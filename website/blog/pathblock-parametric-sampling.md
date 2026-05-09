---
title: "Parametric Sampling: Placing Elements Along Curves"
slug: pathblock-parametric-sampling
date: 2026-03-11
description: "How to query points, tangents, and normals along any path — and use partition() to distribute elements evenly along curves."
---

*Part 2 of 4 in our series on PathBlock extensions.*

> **Series: PathBlock Extensions**
> 1. [Introduction to PathBlocks](/blog/pathblock-introduction)
> 2. **Exploring Parametric Sampling** (this post)
> 3. [Fillets and Chamfers](/blog/pathblock-fillets-chamfers)
> 4. [Boolean Operations](/blog/pathblock-boolean-operations)

The [previous post](/blog/pathblock-introduction) introduced PathBlocks as reusable shape primitives — define once, draw anywhere. But drawing is just the beginning. Parametric sampling lets you ask questions about a path's geometry: where is the midpoint? What direction is the curve heading at 30% of the way? What's the perpendicular at every quarter mark? These answers let you place elements precisely along arbitrary curves.

## The Parameter `t`

All sampling methods use a parameter `t` that ranges from 0 (start of path) to 1 (end of path). This isn't the raw parametric value of the underlying Bézier or arc — it's measured by **arc length**. That means `t = 0.5` is always the geometric midpoint of the path, regardless of how the control points are distributed.

This is a critical distinction. A cubic Bézier with uneven control point spacing has a non-uniform speed along its raw parameter. Arc-length parameterization normalizes this so that equal increments of `t` correspond to equal distances along the curve.

## Querying Points

The simplest query is [`.get(t)`](/docs#path-blocks-gett-point), which returns the `Point` at arc-length fraction `t`:

```pathogen
let curve = @{ c 0 -100 200 -100 200 0 };
let mid = curve.get(0.5);
log(mid);  // Point near the apex of the curve
```

This works on both PathBlocks (relative coordinates from origin) and ProjectedPaths (absolute coordinates). See [Sampling on ProjectedPath](/docs#path-blocks-sampling-on-projectedpath) for the coordinate behavior.

## Tangents and Normals

[`.tangent(t)`](/docs#path-blocks-tangentt-point-angle) returns both a point and the direction of travel at that point:

```pathogen
let curve = @{ c 0 -100 200 -100 200 0 };
let tan = curve.tangent(0.0);
log(tan.point);   // Point(0, 0) — start of curve
log(tan.angle);   // angle in radians — direction of travel
```

[`.normal(t)`](/docs#path-blocks-normalt-point-angle) returns the left-hand perpendicular — the tangent angle minus π/2. This is useful for placing elements that should point "outward" from the curve:

```pathogen
let n = curve.normal(0.5);
// n.angle is tangent angle - π/2
// Use with cos/sin to offset perpendicular to the curve
```

The anatomy diagram below visualizes all three queries at `t = 0.4` on a cubic Bézier. The red dot is `.get(0.4)`, the green arrow is `.tangent(0.4)`, and the yellow arrow is `.normal(0.4)` — the left-hand perpendicular.

<mini-workspace src="samples/post7/sampling-anatomy.pathogen" caption="Sampling anatomy — .get(), .tangent(), and .normal() visualized at t = 0.4"></mini-workspace>

## Sampling Multiple Points

You can sample any number of points by calling `.get(t)` at specific values. Here's a curve with four markers at the quarter marks:

```pathogen
let curve = @{ c 0 -80 200 -80 200 0 };
curve.drawTo(20, 60)
let proj = curve.project(20, 60);
for (t in [0.25, 0.5, 0.75]) {
  let p = proj.get(t);
  @{ a 3 3 0 1 1 6 0  a 3 3 0 1 1 -6 0 }.drawTo(p.x - 3, p.y)
}
```

This works but is manual — you pick the t-values yourself. For evenly-spaced distributions, `partition()` automates this pattern.

## Sampling Points Along a Curve

The demo below shows parametric sampling in action. A sine-like curve is defined with two cubic Béziers, then 8 points are placed along it using `partition()`, and tangent lines are drawn at regular intervals.

<mini-workspace src="samples/post7/sampling-points.pathogen" caption="Points and tangent lines sampled along a cubic Bézier curve" code-open></mini-workspace>

The red dots use [`partition(8)`](/docs#path-blocks-partitionn-orientedpoint) to divide the curve into 8 equal segments. Each partition point includes `.point`, `.angle`, and `.t` properties. The green tangent lines use `tangent(t)` at each eighth to show the direction of travel.

## Even Distribution with `partition(n)`

[`partition(n)`](/docs#path-blocks-partitionn-orientedpoint) is the workhorse for distributing elements along a path. It returns `n + 1` oriented points (both endpoints included), evenly spaced by arc length:

```pathogen
let path = @{ h 100 };
let pts = path.partition(4);
// 5 points at t = 0, 0.25, 0.5, 0.75, 1.0
```

Each oriented point has three properties:

| Property | Type | Description |
|---|---|---|
| `point` | `Point` | Position on the path |
| `angle` | `number` | Tangent angle (radians) |
| `t` | `number` | Arc-length fraction |

The demo below shows `partition(8)` on an S-curve. Each of the 9 points (fence posts at both ends) is labeled with its `t` value. Notice the even spacing — the points are equidistant along the curve, not along the x-axis.

<mini-workspace src="samples/post7/sampling-tvalues.pathogen" caption="partition(8) with t-value labels — 9 evenly-spaced points along an S-curve"></mini-workspace>

## Building a Fence Along a Curve

Here's a practical example: fence posts distributed evenly along a winding road. The posts are placed using `partition(16)`, then oriented perpendicular to the road using `normal()`. Rails connect adjacent posts at 1/3 and 2/3 height.

<mini-workspace src="samples/post7/partition-fence.pathogen" caption="Fence posts and rails distributed along a curved road" code-open></mini-workspace>

The key pattern is:

1. Define the base curve (the road)
2. Use `.project(x, y)` to get a [ProjectedPath](/docs#path-blocks-projecting-without-drawing) with absolute coordinates
3. Call `.partition(n)` to get evenly-spaced points
4. Use `.normal(t)` to find the perpendicular direction at each point
5. Place elements using `cos(angle)` and `sin(angle)` offsets

This pattern works for any curve — Béziers, arcs, polylines, or combinations. The arc-length parameterization ensures even spacing regardless of the curve's complexity.

## Curve Support

Sampling works uniformly on every SVG path command type — lines, cubic and quadratic Béziers, and arcs. A path that mixes segment types (say, a line into a cubic into an arc) samples seamlessly across segment boundaries. The arc-length lookup table is built once per path and cached, so repeated sampling calls are efficient. See the [Curve Support](/docs#path-blocks-curve-support) documentation for implementation details.

## What's Next

Sampling tells you about a path's geometry. The next post covers [fillets and chamfers](/blog/pathblock-fillets-chamfers) — operations that modify the geometry itself by rounding or cutting corners. These use the same trim-and-split infrastructure under the hood: arc-length parameterization to find exact split points along edges.

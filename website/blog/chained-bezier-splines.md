---
title: "Smooth Curves Made Simple: Chained Bézier Splines in Pathogen"
slug: chained-bezier-splines
date: 2026-03-21
description: "Three stdlib functions that turn waypoints into G1-continuous Bézier curves — cubicSpline for explicit tangent control, quadSpline for implicit angles, and clippedQuadSpline for eccentricity dampening."
---

Drawing a single cubic Bézier in SVG is straightforward: `C x1 y1 x2 y2 x y`. Drawing a *chain* of them that flows smoothly from one segment to the next is not. Each join point needs its incoming and outgoing control points to be collinear — lined up on the same tangent line — or the curve develops a visible kink. Get one control point wrong and the whole shape looks broken.

Here's the kind of thing you'd write by hand for a three-segment smooth curve — six control point coordinates per segment, each carefully calculated to maintain tangent continuity at the joins:

```
M 50 150
C 115.8 144.9  120 54.5  180 50
C 233.1 45.9  255 137.5  320 140
C 367.6 141.7  410.9 72.6  470 70
```

In practice, getting those control points right means calculating sines and cosines, enforcing collinearity constraints, and adjusting handles by trial and error. Pathogen's new [spline functions](/docs#stdlib-cubicsplinepoints) replace all of that with a declarative description of what you actually care about — waypoints, tangent angles, and handle lengths:

```pathogen
cubicSpline([
  { x: 50, y: 150, angle: -20deg, exit: 70 },
  { x: 180, y: 50,  angle: 15deg,  entry: 60, exit: 55 },
  { x: 320, y: 140, angle: -30deg, entry: 65, exit: 55 },
  { x: 455, y: 65,  angle: 10deg,  entry: 60 }
])
```

Four waypoints, guaranteed smooth, and the intent is readable. The compiler handles all control point placement — you describe where the curve should go and how it should enter and leave each waypoint.

Whether you're building animation paths, smooth data visualization curves, decorative borders, or logo outlines, chained Bézier splines turn what was tedious manual calculation into a declarative, readable specification.

Three functions cover different tradeoffs between control and convenience:

- **`cubicSpline`** — explicit angles at every point, full art-direction control
- **`quadSpline`** — only the first angle is explicit, the rest are derived geometrically; produces quadratic Bézier segments (fewer degrees of freedom than cubic, but simpler to specify)
- **`clippedQuadSpline`** — adds eccentricity dampening to control how much curves bulge

## cubicSpline: Explicit Tangent Control

`cubicSpline` takes an array of points, each specifying its position, tangent angle, and handle distances.

Angles follow SVG's coordinate conventions: 0 is rightward, and positive angles rotate clockwise (toward the positive y-axis, which points downward in SVG). Use the `deg` suffix for degrees.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `x` | number | yes | X coordinate |
| `y` | number | yes | Y coordinate |
| `angle` | number | yes | Tangent direction (radians; use `deg` suffix for degrees) |
| `exit` | number | yes (except last point) | Distance forward along tangent to outgoing CP |
| `entry` | number | yes (except first point) | Distance backward along tangent to incoming CP |

The anatomy diagram below shows how these properties map to the geometry. Blue dots are the on-curve waypoints. Red circles are exit control points (placed `exit` distance forward along the tangent). Green circles are entry control points (placed `entry` distance backward). Orange arcs show the tangent angle at each point.

<mini-workspace src="samples/post13/cubic-spline-anatomy.pathogen" caption="cubicSpline anatomy — waypoints, control points, tangent lines, and angle arcs" code-open></mini-workspace>

### Why It's Smooth: G1 Continuity

The smoothness guarantee comes from a simple geometric constraint: at every join point, the exit control point of the outgoing segment and the entry control point of the incoming segment lie on the same line — the tangent line defined by `angle`. Because both control points are collinear through the join, the curve's direction doesn't change abruptly.

<mini-workspace src="samples/post13/g1-continuity.pathogen" caption="G1 continuity — exit and entry CPs are collinear through the join point" code-open></mini-workspace>

### Examples

Three `cubicSpline` curves: a two-segment S-curve, a five-point sine wave approximation, and a closed loop where the first and last points coincide.

<mini-workspace src="samples/post13/cubic-spline-demos.pathogen" caption="cubicSpline examples — S-curve, sine wave, and closed loop" code-open></mini-workspace>

A single-point array emits only a move command. Two or more points are needed to produce curve segments.

## quadSpline: Implicit Angles

If specifying an angle at every point feels like too much control, `quadSpline` derives intermediate tangents automatically. Only the start point needs an explicit angle — at each subsequent point, the tangent direction is inferred from the geometry: it points from the previous control point through the current waypoint. You don't need to think about the math — the curves just flow naturally from one segment to the next.

| Argument | Properties | Description |
|----------|-----------|-------------|
| `start` | `{ x, y, angle, exit }` | First point with explicit angle |
| `points` | `[{ x, y, exit }, ...]` | Intermediate waypoints (angle derived) |
| `end` | `{ x, y }` | Final waypoint |

```pathogen
quadSpline(
  { x: 50, y: 140, angle: -30deg, exit: 65 },   // start: explicit angle
  [
    { x: 170, y: 50,  exit: 60 },                // intermediates: angle derived
    { x: 300, y: 150, exit: 55 },
    { x: 420, y: 45,  exit: 50 }
  ],
  { x: 500, y: 120 }                              // end: no angle needed
)
```

<mini-workspace src="samples/post13/quad-spline-anatomy.pathogen" caption="quadSpline anatomy — cyan arrows show derived direction, orange shows tangent extension" code-open></mini-workspace>

The signature is different from `cubicSpline`: start and end are separate arguments, with an array of intermediates between them. This reflects the asymmetry — only the start carries an explicit angle.

<mini-workspace src="samples/post13/quad-spline-demos.pathogen" caption="quadSpline examples — simple arc, flowing curve, and zigzag" code-open></mini-workspace>

**When to choose quadSpline over cubicSpline:** When you want smooth curves but don't need per-point angle control. `quadSpline` is less to specify and produces naturally flowing shapes. Because it generates quadratic Bézier segments (which have one control point per segment instead of two), the curves have fewer degrees of freedom — great for organic, flowing lines but less precise for art-directed shapes. Use `cubicSpline` when you need exact control at every waypoint.

## clippedQuadSpline: Controlling Eccentricity

Quadratic curves can sometimes bulge more than you want — the implicit shared control point sits far from the curve, pulling it outward. *Eccentricity* here refers to how much the curve deviates from the straight line between waypoints: more eccentric curves bulge further away from the baseline.

`clippedQuadSpline` solves this by adding `exitTime` and `entryTime` parameters that control how far the actual control points are placed along the arm toward the virtual shared CP. The placement uses linear interpolation ([`lerp`](/docs#stdlib-math-functions)) — `lerp(start, sharedCP, t)` returns a point partway between the endpoint and the virtual CP, where `t` is the fraction of the distance to travel.

| Argument | Properties | Description |
|----------|-----------|-------------|
| `start` | `{ x, y, angle, exit, exitTime }` | First point with time fraction |
| `points` | `[{ x, y, exit, exitTime, entryTime }, ...]` | Intermediates with time fractions |
| `end` | `{ x, y, entryTime }` | Final waypoint with time fraction |

```pathogen
clippedQuadSpline(
  { x: 50, y: 150, angle: -40deg, exit: 80, exitTime: 0.5 },
  [{ x: 180, y: 30, exit: 70, exitTime: 0.5, entryTime: 0.5 }],
  { x: 310, y: 150, entryTime: 0.5 }
)
```

The time values range from 0 to 1:
- **t = 1.0** — control points at the virtual shared position (equivalent to quadratic, maximum bulge)
- **t = 0.5** — control points halfway along the arm (moderate dampening)
- **t = 0** — control points at the endpoints (straight lines, no curve)

<mini-workspace src="samples/post13/eccentricity-anatomy.pathogen" caption="Single segment anatomy — virtual shared CP (diamond) and actual CPs placed via lerp" code-open></mini-workspace>

The effect is dramatic when overlaid. Same waypoints, same angles — only the time values change:

<mini-workspace src="samples/post13/eccentricity-comparison.pathogen" caption="Same waypoints, different time values — t=1.0 (blue) down to t=0.25 (orange)" code-open></mini-workspace>

Unlike `quadSpline` (which emits `q` commands), `clippedQuadSpline` emits `c` (cubic) commands because splitting the shared CP into two independent CPs requires cubic Béziers. This is transparent to the user — the output is still a valid SVG path.

**When to choose clippedQuadSpline:** When you want the convenience of implicit angles (like `quadSpline`) but need to control how much the curve bulges at each segment. It's particularly useful for decorative borders, data visualization curves, and any shape where uniform curvature matters more than maximum expressiveness.

All three spline functions emit relative commands, so they compose naturally with [path blocks](/blog/pathblock-introduction) and [transforms](/docs#path-blocks-transforms). They also pair well with [`heading()` and `turn()`](/blog/heading-turn) for establishing tangent context before tangent-dependent functions. Try editing any of the examples above in the [Pathogen playground](/) — adjust angles, handle lengths, and time values to see how the curves respond.

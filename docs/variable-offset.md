# Variable Offset

`variableOffset` and `compoundVariableOffset` are [path block](#path-blocks) methods that trace a **new** path alongside an existing one, using a gradient-stop-like syntax. You place *stops* at positions along a reference path (the **spine**) and give each stop a perpendicular offset distance; the resulting points are connected into a smooth (or sharp) curve whose joins you control per-stop.

Where the existing `offset(distance)` produces a uniform parallel curve at one fixed distance, `variableOffset` lets the distance **vary** from stop to stop — and lets you choose the curve continuity (sharp corners, smooth tangents, or flowing curvature) at each stop. Reach for it when you want tapered or calligraphic strokes, ribbons and casings that follow a path, or banded flow-field effects.

## The model: the spine is a rail

Each stop samples the spine at a position, then steps **perpendicular** to the spine by the offset distance to produce a point. The new path is built *through those points*. The spine positions and orients the points — its own segments do not appear in the output. Think of the spine as a rail that places and aims your control points, not as a shape the result must hug.

## Simple offset — an open path

`variableOffset` returns a new **open** path block. Call it with a block that receives two parameters: `go` (the offset builder) and `pb` (a read-only reference to the spine).

```
let spine = @{
  h 20
  tangentArc(20, 45deg);
  tangentLine(20);
  tangentArc(20, 45deg);
  v 20
};

let edge = spine.variableOffset() {|go, pb|
  go.stop(10%, 5,  CurveContinuity.G1);
  go.stop(50%, 12, CurveContinuity.G2);
  go.stop(90%, 20, CurveContinuity.G1);
};
```

The path spans the first stop to the last stop. To add a lead-in or lead-out, compose path blocks with the `<<` concatenation operator — e.g. `@{ m -10 0 } << edge` — rather than adding endpoints inside the block.

### `go.stop(time, normalOffset, continuity)`

| Argument | Meaning |
|----------|---------|
| `time` | Position along the spine as an arc-length fraction: `0` = start, `1` (or `100%`) = end. Percent literals are sugar — `10%` is exactly `0.1`. |
| `normalOffset` | Perpendicular distance from the spine at that position. Positive and negative offset to opposite sides (same sign convention as `offset()`). |
| `continuity` | A [`CurveContinuity`](#variable-offset-curve-continuity) value controlling the join at this point. |

Stops are visited in the order written. `time` must be in `[0, 1]`.

## Curve continuity

`CurveContinuity` selects how the curve behaves at each stop — the trade-off between sharp and smooth:

| Value | Join | Result |
|-------|------|--------|
| `CurveContinuity.G0` | position only | a **corner** — the curve meets the point but bends sharply |
| `CurveContinuity.G1` | + matching tangent direction | **no kink** — the curve flows through with a continuous heading |
| `CurveContinuity.G2` | + matching curvature | **seamless flow** — the rate of bending is continuous, the smoothest option |

A `G0` stop breaks the curve into separate smooth spans on either side. A run of `G1`/`G2` stops is built as a single spline through them; `G2` runs solve for curvature continuity across the whole run. (Keep continuity uniform within a run — mixing `G1` and `G2` in the same run is treated as `G2` for now.)

## Endpoint tangents

By default, the curve leaves its first and last points along the **spine's own direction** at those stops — a sensible, zero-configuration default. To control an endpoint explicitly, supply a [`PolarVector`](#stdlib) handle:

```
let edge = spine.variableOffset() {|go, pb|
  go.startTangent(PolarVector(-90deg, 8));       // leave straight up (y-down: -90° = up), tension 8
  go.stop(10%, 5,  CurveContinuity.G2);
  go.stop(90%, 20, CurveContinuity.G2);
  go.endTangent(PolarVector(0deg, 6).turn(pb.tangent(90%).angle));  // relative to the spine
};
```

The `PolarVector` angle is absolute; its distance encodes tension (how firmly the curve pulls toward the handle). For a spine-relative angle, rotate by the spine tangent with `.turn(pb.tangent(time).angle)`. A tangent handle applies only to a `G1`/`G2` endpoint — a `G0` endpoint is a corner with no tangent to set.

> **Angles are radians.** Sampling queries (`pb.tangent`, `pb.normal`) return angles in radians, and Pathogen's y-axis points **down** — so `-π/2` (i.e. `-90deg`) points up. Angle literals in code carry a unit suffix, e.g. `90deg`, `45deg`.

## Compound offset — a closeable ribbon

`compoundVariableOffset` places **two** profiles — one on each side of the spine — and can close them into a filled ribbon with end caps. Each stop takes two offset/continuity pairs:

```
let ribbon = spine.compoundVariableOffset() {|go, pb|
  go.startCap(Cap.round());
  go.stop(10%,  5, CurveContinuity.G1,  -10, CurveContinuity.G1);
  go.stop(50%, 10, CurveContinuity.G2,   -5, CurveContinuity.G2);
  go.stop(90%, 20, CurveContinuity.G1,  -20, CurveContinuity.G1);
  go.endCap(Cap.tapered(12, CurveContinuity.G2));
};
```

### `go.stop(time, offset1, continuity1, offset2, continuity2)` (compound)

| Argument | Meaning |
|----------|---------|
| `time` | Position along the spine (`0`–`1` or percent), as in the simple form. |
| `offset1`, `continuity1` | Offset distance and join for **profile 1**. |
| `offset2`, `continuity2` | Offset distance and join for **profile 2**. |

With both caps present the result is a **closed** path, assembled as: profile 1 forward → end cap → profile 2 back → start cap → close. **Omit a cap** and that end stays open — omitting both yields two separate, unconnected profiles.

The offset **signs** decide which side each profile lands on. Opposite signs (as above) put the profiles on opposite sides of the spine; same-side offsets produce a self-intersecting ribbon (permitted — see [Errors](#variable-offset-errors)).

### End caps

Caps are **constructor values** — Pathogen's convention is *enums for parameter-less choices (like `CurveContinuity`), constructor functions for parameterized ones*. Given the two profile endpoints at the capped stop:

| Cap | Geometry |
|-----|----------|
| `Cap.butt()` | a straight line between the two endpoints |
| `Cap.round()` | a semicircle bulging outward |
| `Cap.elliptical(projection)` | a half-ellipse projecting `projection` units outward |
| `Cap.tapered(length, continuity?)` | a point `length` units out; the optional `CurveContinuity` smooths the taper flanks (`G0` = sharp point) |

## Querying the spine — `pb`

The second block parameter, `pb`, is a read-only handle to the spine, mirroring the [path block](#path-blocks) sampling API so it behaves exactly as you already expect:

| Member | Returns |
|--------|---------|
| `pb.length` | total arc length of the spine (a number) |
| `pb.get(time)` | the point on the spine at arc-length fraction `time` |
| `pb.tangent(time)` | `{ point, angle }` — the tangent at `time`; `angle` in radians |
| `pb.normal(time)` | `{ point, angle }` — the normal at `time`; `angle` in radians |
| `pb.vertices` | the spine's vertices as a list of points |

## Errors

The compiler rejects:

- **`time` outside `[0, 1]`** — stops must fall on the spine.
- **An unknown `continuity` value** — use `CurveContinuity.G0`, `.G1`, or `.G2`.
- **A cap on the simple form** — `startCap`/`endCap` apply only to `compoundVariableOffset`.
- **Fewer than one stop** — an offset needs at least one point to place.

Self-intersecting output is **not** an error: if dense stops or extreme offsets make the curve cross itself, Pathogen emits the true curve as-is rather than silently reshaping your geometry.

## Related

- [Path Blocks](#path-blocks) — the `@{ }` blocks and methods (`offset`, `partition`, `boundingBox`, `get`/`tangent`/`normal`) this builds on
- [Standard Library](#stdlib) — `PolarVector` and the spine-sampling helpers

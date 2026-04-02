# Design Exploration: Elliptical Arcs as Chained Beziers

**Date**: 2026-04-01
**Status**: Exploration — not yet committed to any approach

---

## The Starting Question

We set out to design an `ellipticalWedge` function and quickly hit a deeper question: how should Pathogen model elliptical arcs in general? The naive approach — duplicate every circular arc function with elliptical variants — felt like API bloat for uncertain utility.

A different framing emerged: **an elliptical arc is just a chained cubic bezier with specific tangent and handle constraints.** Pathogen already has a rich cubic spline API. Could we lean into that instead of building parallel elliptical infrastructure?

---

## Core Insight: Ellipse Segments Are Cubic Beziers

A 90-degree segment of an ellipse can be represented exactly (within cubic bezier approximation error) as a single cubic bezier. The kappa constant `k = 4(sqrt(2)-1)/3 ≈ 0.5523` determines handle lengths.

For a quarter-ellipse from **(rx, 0)** to **(0, ry)**, the cubic bezier is:

```
Start:  (rx, 0)    CP1: (rx, ry·k)
End:    (0,  ry)   CP2: (rx·k, ry)
```

Expressed as a `cubicSpline` point pair:

```
cubicSpline([
  { x: rx, y: 0,  angle: 0.5pi, exit: ry * 0.5523 },
  { x: 0,  y: ry, angle: 1pi,   entry: rx * 0.5523 }
])
```

Key observation: at each anchor, the **exit handle length scales with the other axis's radius**. At (rx, 0), the tangent is vertical (toward ry), so the handle is `ry * k`. At (0, ry), the tangent is horizontal (toward rx), so the handle is `rx * k`. When rx = ry, both handles are `r * k` — a circular arc.

A full ellipse is 4 such segments. A semicircle is 2. This maps directly onto the existing `cubicSpline` format.

---

## The Kappa Generalization

The 0.5523 constant only applies to 90-degree segments. For an arbitrary arc span `theta`, the handle scale factor is:

```
k(theta) = (4/3) * tan(theta / 4)
```

| Arc span | k value | Segments needed |
|----------|---------|-----------------|
| 45deg | 0.2652 | 1 |
| 60deg | 0.3634 | 1 |
| 90deg | 0.5523 | 1 |
| 120deg | 0.7676 | 1 (acceptable error) |
| 180deg | — | 2 × 90deg |
| 270deg | — | 3 × 90deg |
| 360deg | — | 4 × 90deg |

For spans above ~120 degrees, splitting into multiple segments (each ≤90 degrees) preserves approximation quality. The max error for a single 90-degree bezier segment is ~0.027% of the radius — visually imperceptible.

---

## Three API Levels

### Level 1: Point Array Helper (Maximum Composability)

A function that computes `cubicSpline`-compatible points for an elliptical arc:

```
ellipseArcPoints(rx, ry, fromAngle, toAngle) → Array<{ x, y, angle, entry?, exit? }>
```

The returned points are passed to `cubicSpline()`:

```
// Standalone elliptical arc
cubicSpline(ellipseArcPoints(40, 80, 0, 0.5pi))

// Mixed with freeform points — smooth transition guaranteed
cubicSpline([
  ...ellipseArcPoints(40, 80, 0, 0.5pi),
  { x: 120, y: 60, angle: 0.25pi, entry: 20, exit: 30 },
  { x: 200, y: 0, angle: 0, entry: 25 }
])
```

**Strengths:**
- Zero new path infrastructure — reuses existing `cubicSpline`
- Maximum composability — mix arcs with freeform curves in a single spline
- G1 continuity guaranteed by the shared tangent model at join points
- Users can inspect/modify the points before passing to `cubicSpline`

**Weaknesses:**
- Verbose for simple cases
- The `...spread` into a mixed array is a new pattern for the language
- No context awareness (no tangent chaining)

### Level 2: Standalone Function (Convenience)

```
ellipticalArc(rx, ry, fromAngle, toAngle)
```

Emits a chain of relative `c` commands directly. Simpler to use:

```
M 100 100
ellipticalArc(40, 80, 0, 0.5pi)
```

**Strengths:**
- Simple, self-contained
- Familiar pattern (like `arc()` but with angles instead of flags)

**Weaknesses:**
- Not composable with other spline points
- No tangent chaining (doesn't read or update `ctx.lastTangent`)
- Essentially a less flexible version of Level 1

### Level 3: Context-Aware (Full Integration)

```
tangentEllipticalArc(rx, ry, sweepAngle)
```

Reads `ctx.lastTangent`, computes the bezier chain continuing in the current direction, updates the tangent for downstream chaining:

```
M 0 0
heading(0)
tangentLine(50)
tangentEllipticalArc(20, 40, 0.5pi)   // smooth entry from line
tangentLine(30)                         // smooth exit to line
tangentEllipticalArc(30, 30, -0.5pi)   // circular arc, opposite direction
tangentLine(20)
```

**Algorithm:**
1. Read `ctx.lastTangent` for entry direction
2. Place ellipse center perpendicular to tangent (same logic as `tangentArc`)
3. Compute start angle from center-to-position vector
4. Split sweep into segments of ≤90 degrees
5. For each segment: compute anchor point, tangent angle, and handle lengths using `k(theta)` and local ellipse radii
6. Emit relative `c` commands
7. Update `ctx.lastTangent` to exit direction

**Strengths:**
- Slots into existing tangent chaining model seamlessly
- `tangentArc(r, sweep)` becomes `tangentEllipticalArc(r, r, sweep)` — natural generalization
- Connects smoothly to lines, other arcs, any context-aware function
- Users think in terms of geometry, not bezier math

**Weaknesses:**
- Context-aware functions are more complex to implement
- Not composable with `cubicSpline` point arrays
- The ellipse center placement with two radii + tangent constraint has some geometric subtlety (see below)

---

## The Center Placement Problem

For `tangentArc(r, sweep)`, center placement is straightforward: go perpendicular to the tangent, distance `r`. The current point is guaranteed to lie on the circle.

For `tangentEllipticalArc(rx, ry, sweep)`, center placement is harder. The current point must lie on the ellipse, and the tangent at that point must match `ctx.lastTangent`. Given a tangent angle, the parametric angle `t` on the ellipse where the tangent has that direction is:

```
t = atan2(-rx * cos(tangentAngle), ry * sin(tangentAngle))
```

Then the center is offset from the current position by:

```
cx = position.x - rx * cos(t)
cy = position.y - ry * sin(t)
```

This works but the ellipse orientation is always axis-aligned. A rotation parameter would add another degree of freedom. However, as discussed in the [proposal](proposal-v1.md), axis-aligned covers the dominant use case and rotation can be applied via transforms.

---

## Connection to Existing Geometry

The tangent chaining model answers the "how do you connect to existing geometry" question naturally:

### Line → Elliptical Arc

```
M 0 0
tangentLine(50)                        // heading established
tangentEllipticalArc(20, 40, 0.5pi)   // continues from tangent
```

The arc entry is automatically smooth (G1 continuous) because it reads the line's heading.

### Elliptical Arc → Line

```
tangentEllipticalArc(20, 40, 0.5pi)
tangentLine(30)                        // continues from arc's exit tangent
```

The line continues in the arc's exit direction — smooth transition.

### Elliptical Arc → Circular Arc

```
tangentEllipticalArc(20, 40, 0.5pi)
tangentArc(15, 0.25pi)                 // seamless transition
```

Both update `ctx.lastTangent`, so they chain naturally.

### Elliptical Arc → Freeform Curve (via Level 1)

```
cubicSpline([
  ...ellipseArcPoints(40, 80, 0, 0.5pi),
  { x: 120, y: 60, angle: 0.25pi, entry: 20, exit: 30 },
  { x: 200, y: 0, angle: 0, entry: 25 }
])
```

G1 continuity at the join point is guaranteed because the last ellipse point's `angle` matches the freeform point's `angle` (both specify tangent direction).

### Mixed Spline: Elliptical Arc + Freeform

This is the most novel capability. An elliptical arc smoothly transitioning into a freeform curve in a single path — something neither D3 nor Paper.js can express in one call.

---

## On the Utility of Ellipses

Pure elliptical arcs are niche. But the reframing changes the question:

**Old question**: "How important are ellipses?"
**New question**: "How important are smooth curves with variable curvature that chain seamlessly?"

The answer to the second question is: very. The elliptical arc is one specific flavor of variable-curvature curve, but the infrastructure serves all of them:

| Use case | What it really is |
|----------|------------------|
| Elliptical wedge | Chained beziers with specific handle ratios, inside a composite shape |
| Egg/organic shapes | Chained beziers with smoothly varying curvature |
| Isometric circle projections | Elliptical arcs (literally) |
| S-curves / sigmoid transitions | Two arcs of opposite curvature joined at an inflection point |
| Spirals (approximate) | Arcs with progressively changing radius |
| Track/road layouts | Alternating straight segments and smooth curves |

The bezier-based model handles all of these. The elliptical arc is just the entry point.

---

## Recommendation

**Build Level 1 and Level 3. Skip Level 2.**

- **Level 1** (`ellipseArcPoints`) provides composability with `cubicSpline` — the novel capability that no other library offers. Low implementation cost since it's just a computation function returning data, no path infrastructure needed.

- **Level 3** (`tangentEllipticalArc`) provides the ergonomic, context-aware chaining that makes Pathogen's arc API distinctive. This is the function that makes "line → elliptical arc → line" as easy as "line → circular arc → line" already is.

- **Level 2** is the worst of both worlds — neither composable nor context-aware. Skip it.

Once these two exist, the `ellipticalWedge` composite shape from the [original proposal](proposal-v1.md) could be built on top of them, or it could remain a separate function using the direct bezier math internally.

---

## Open Questions

1. **Should `ellipseArcPoints` accept polar (geometric) angles or parametric angles?** Polar is consistent with `radialWedge` and more intuitive, but requires the `atan2(rx·sin, ry·cos)` conversion internally.

2. **Should `tangentEllipticalArc` subsume `tangentArc`?** Calling `tangentEllipticalArc(r, r, sweep)` is equivalent to `tangentArc(r, sweep)` but emits `c` commands instead of `a` commands. The SVG arc command is more compact and exact. Keeping both means circular arcs remain as `a` commands (precise, compact) while elliptical arcs use `c` commands (approximate, more verbose).

3. **Array spread in Pathogen**: Does the language currently support `...spread` syntax inside array literals? If not, Level 1 composability requires either adding spread support or providing a `concat`/`join` utility for point arrays.

4. **Handle length at non-cardinal points**: The kappa formula assumes the arc segment starts and ends at symmetric positions on the ellipse. For arcs that start at arbitrary angles, the entry and exit handle lengths differ because the ellipse curvature is different at each end. The formula needs to account for the local curvature: `handle = k(theta) * rho(t)` where `rho(t)` is the local radius of curvature.

5. **Should this eventually replace SVG `A` commands in output?** If bezier-based arcs are good enough, should the compiler emit `c` commands everywhere instead of `a` commands? This would simplify boolean operations (which already convert arcs to cubics internally via `arcToCubics`). Tradeoff: larger path strings, but more uniform internal representation.

---

## Related Documents

- [ellipticalWedge Proposal v1](proposal-v1.md) — original composite shape proposal
- [SVG Arc Command Primer](svg-arc-command-primer.md) — analysis of SVG arc limitations
- [D3 and Paper.js Arc Approaches](d3-paperjs-arc-approaches.md) — how other libraries solve this

# ellipticalWedge — Feature Proposal (v1)

**Status**: Postponed
**Date**: 2026-03-31

## Overview

A stdlib function that generalizes `radialWedge` from circular to elliptical geometry, enabling annular sectors with independent X/Y radii on inner and outer boundaries.

## Proposed Signature

```
ellipticalWedge(innerRX, innerRY, outerRX, outerRY, fromAngle, toAngle, cornerRadius)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `innerRX` | number | Inner ellipse horizontal radius |
| `innerRY` | number | Inner ellipse vertical radius |
| `outerRX` | number | Outer ellipse horizontal radius |
| `outerRY` | number | Outer ellipse vertical radius |
| `fromAngle` | Angle | Start angle (matches conic gradient convention) |
| `toAngle` | Angle | End angle |
| `cornerRadius` | number | Fillet radius at corners (0 for sharp) |

## Design Decisions

### 1. No rotation parameter (for now)

SVG elliptical arcs support x-axis-rotation, but adding it brings the parameter count to 8. Axis-aligned ellipses cover the dominant use case. Users can apply transforms for rotation. An optional 8th `rotation` parameter (default 0) can be added later without breaking changes.

### 2. Polar (geometric) angle interpretation

Angles mean the geometric angle from center, consistent with `radialWedge`. When `fromAngle = 0`, the wedge starts at 3 o'clock regardless of eccentricity.

Internally, polar angle `theta` is converted to parametric angle `t` for computing ellipse points:

```
t = atan2(rx * sin(theta), ry * cos(theta))
point = (rx * cos(t), ry * sin(t))
```

This ensures visual consistency: same angle inputs to `radialWedge` and `ellipticalWedge` produce visually analogous wedges.

### 3. Circular fillets via osculating circle approximation

The existing `radialWedge` fillet math relies on constant curvature (1/R). With ellipses, curvature varies along the arc:

```
kappa(t) = (rx * ry) / (rx^2 * sin^2(t) + ry^2 * cos^2(t))^(3/2)
rho(t) = 1 / kappa(t)    // local radius of curvature
```

Strategy: use **circular fillets** with the local radius of curvature at each corner point substituted for R in the existing fillet formulas. Same graceful degradation behavior — corner radius is clamped to the maximum that fits. Approximation error is O(r^2/rho^2), negligible for reasonable fillet sizes.

### 4. Straight side lines

Straight lines from inner ellipse point to outer ellipse point at the same polar angle, matching the radial line behavior of `radialWedge`.

### 5. SVG arc commands

Elliptical `A` commands: `a rx ry 0 large-arc sweep dx dy` with `x-axis-rotation = 0` (axis-aligned). Large-arc flag computed from the parametric sweep span.

## Degenerate Cases

| Condition | Behavior |
|-----------|----------|
| `innerRX === innerRY && outerRX === outerRY` | Equivalent to `radialWedge` |
| `innerRX === 0 && innerRY === 0` | Pie slice (filled elliptical sector) |
| Full sweep (`toAngle - fromAngle = 2pi`) | Elliptical annulus |
| `cornerRadius <= 0` | Sharp corners, no fillets |

## Relationship to `radialWedge`

`radialWedge(innerR, outerR, from, to, cr)` is semantically equivalent to `ellipticalWedge(innerR, innerR, outerR, outerR, from, to, cr)`. The circular version is kept as a convenience and for backward compatibility.

## Implementation Notes

- Add to `src/stdlib/path.ts` adjacent to `radialWedge` (~120-150 lines)
- Add docs to `docs/stdlib.md`
- Add tests to `tests/evaluator.test.ts` (~8-10 tests)
- No parser, evaluator, or stdlib/index.ts changes needed (auto-exported via `pathFunctions` spread)
- Follow existing lifecycle: docs first, failing tests, implement, visual verify, code review, full suite

## Open Questions for Future Exploration

- Should `cornerRadius` accept separate inner/outer values?
- Is there demand for an `ellipticalCornerRadius(rx, ry)` option for fillets that match the elliptical aesthetic?
- Would a rotation parameter be needed often enough to warrant the 8th parameter vs. relying on transforms?

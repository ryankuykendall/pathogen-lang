# Bug: Boolean XOR Produces Diagonal Artifacts with Arc-Heavy Paths

**Status**: Documented, not yet fixed
**Severity**: Visual artifacts in boolean operations involving arcs
**Discovered**: 2026-03-27, during radialWedge diagnostic matrix
**Related**: `project-docs/textblock/10-boolean-assembly-artifact-fix.md` (prior fix for glyph overlaps)

## Symptom

XOR between a sharp-cornered `radialWedge` and a rounded-cornered `radialWedge` should produce small crescent shapes only at the four corners. Instead, some cells in a diagnostic matrix show large diagonal artifacts — triangular regions that span the full interior of the wedge, connecting far-apart intersection points.

The artifacts are **inconsistent**: some parameter combinations render correctly while others produce dramatic diagonal slashes. The pattern does not correlate cleanly with whether corner radii fit or are reduced.

## Root Cause

**Missing arc tangent computation in `tangentAtEnd()` and `tangentAtStart()`**

**File**: `src/evaluator/boolean-ops.ts`, lines ~1468-1510

These functions compute tangent directions at segment endpoints. The tangent is used in `buildIntersectionLinks()` (line ~1667) to disambiguate between multiple candidate runs at intersection points — the algorithm picks the candidate whose tangent direction most closely aligns with the current run's exit tangent.

**The bug**: Arc commands (`'a'`) have no dedicated case. They fall through to the default, which uses the **chord direction** (start→end) instead of the actual arc tangent:

```typescript
function tangentAtEnd(cmd: TransformCmd): Point {
  if (u === 'q') { /* quadratic tangent */ }
  if (u === 'c') { /* cubic tangent */ }
  // Arc falls through to here:
  const tx = cmd.end.x - cmd.start.x;
  const ty = cmd.end.y - cmd.start.y;
  // ...normalize and return
}
```

For a small fillet arc (radius 4-16), the chord direction can differ from the true tangent by 30-60 degrees. This causes the dot-product test to select the wrong candidate run, and the assembly algorithm creates a diagonal link across the contour instead of following the correct intersection boundary.

## Why It's Inconsistent

The artifact only manifests when the tangent disambiguation is **decisive in the wrong direction**:

- **Shallow intersection angles** (arcs nearly tangent to lines): chord and true tangent diverge most → wrong link selected → artifact
- **Steep intersection angles**: one candidate clearly dominates the dot product even with the wrong tangent → correct link → no artifact
- **Symmetric geometries** (wedge centered on axis): chord may accidentally align with true tangent → no artifact

This explains why some cells in the matrix render perfectly while adjacent cells (slightly different theta or radius) show dramatic artifacts.

## Affected Operations

- `.xor()` — most visually obvious (union of two differences)
- `.difference()` — same tangent bug applies
- `.intersection()` — same tangent bug applies
- `.union()` — may be affected but less likely to hit ambiguous intersections

All boolean operations share the `tangentAtEnd()`/`tangentAtStart()` functions.

## Pipeline Analysis

The boolean operation pipeline has four stages. Only stage 4 is affected:

| Stage | Function | Arc Handling | Status |
|-------|----------|-------------|--------|
| 1. Intersection finding | `intersectArcArc()` | Arcs → cubic Bezier approximation (π/2 segments) | Correct |
| 2. Splitting at intersections | `splitCmdAtT()` | Arc splitting preserves arc commands, recomputes flags | Correct |
| 3. Segment classification | `classifyAllSegments()` | Winding number uses `arcCrossing()` with depth-12 adaptive subdivision | Correct |
| 4. **Assembly** | `assembleResult()` | **`tangentAtEnd/Start()` missing arc case** | **Bug** |

## Proposed Fix

Add arc tangent computation to `tangentAtEnd()` and `tangentAtStart()`:

```typescript
if (u === 'a') {
  const center = cmdArcCenter(cmd);
  if (center) {
    // Tangent at arc endpoint = perpendicular to radius
    const radX = cmd.end.x - center.cx;
    const radY = cmd.end.y - center.cy;
    const len = Math.sqrt(radX * radX + radY * radY);
    if (len > 1e-12) {
      // Perpendicular direction depends on arc sweep
      if (center.deltaAngle > 0) {
        return { x: -radY / len, y: radX / len };  // CCW tangent
      } else {
        return { x: radY / len, y: -radX / len };   // CW tangent
      }
    }
  }
  // Fall through to chord default if center computation fails
}
```

Similarly for `tangentAtStart()`, using `cmd.start` instead of `cmd.end`.

The `cmdArcCenter()` helper already exists in the same file (line ~242) and returns `{ cx, cy, startAngle, deltaAngle }`.

## Test Plan

1. Add XOR test with two `radialWedge` PathBlocks (sharp vs rounded) — verify output produces only corner crescents
2. Add difference test with overlapping arcs at various angles
3. Add the diagnostic matrix as a visual regression test (compile + check for artifacts)
4. Test arc-line intersection tangent alignment specifically

## Diagnostic Matrix

The diagnostic matrix that revealed this bug is at `/tmp/test-wedge-diag.pathogen`. It renders a grid of `radialWedge` shapes with varying theta (0.05π to 0.5π) and outer radius (50 to 140), showing:

- Light red: rounded wedge fill
- Dark red: XOR diff (should only appear at corners)
- Green dots: sharp wedge outline
- Blue dashes: inner/outer radius guides
- Labels: effective inner/outer corner radii

Artifacts appear as dark red diagonal slashes inside wedges where the XOR should show only small corner crescents.

## Relationship to Prior Fix

The `10-boolean-assembly-artifact-fix.md` documents a 2026-03-17 fix for triangular artifacts at glyph overlaps. That fix introduced the tangent-based disambiguation (Ring-based Weiler-Atherton with dot product alignment). However, the tangent computation was only implemented for cubic and quadratic curves — the arc case was never added. This bug is the natural consequence of that gap.

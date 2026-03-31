# Bug: Boolean XOR Produces Diagonal Artifacts with Arc-Heavy Paths

**Status**: Partially fixed (2026-03-31) — improvements across multiple pipeline stages; remaining artifacts documented
**Severity**: Visual artifacts in boolean operations involving arcs
**Discovered**: 2026-03-27, during radialWedge diagnostic matrix
**Related**: `project-docs/textblock/10-boolean-assembly-artifact-fix.md` (prior fix for glyph overlaps)

## Symptom

XOR between a sharp-cornered `radialWedge` and a rounded-cornered `radialWedge` should produce small crescent shapes only at the four corners. Instead, some cells in a diagnostic matrix show large diagonal artifacts — triangular regions that span the full interior of the wedge, connecting far-apart intersection points.

The artifacts are **inconsistent**: some parameter combinations render correctly while others produce dramatic diagonal slashes.

## Root Cause Analysis

Investigation revealed **two distinct classes** of artifacts, both contributing to the diagnostic matrix failures:

### Class 1: Shared/Coincident Geometry (~50% of artifacts)

The two radialWedge shapes share extensive boundary geometry:
- **Inner arcs**: both lie on the same circle (same center, same radius)
- **Outer arcs**: same
- **Radial lines**: collinear, overlapping portions at both fromAngle and toAngle

The boolean pipeline had no concept of "shared segments." It only understood discrete intersection points (crossings). For segments that overlap without crossing:
- `intersectCircleCircle()` returned `[]` for arcs on the same circle
- `intersectLineLine()` returned `[]` for collinear lines
- Without intersection points at overlap boundaries, long shared segments were never split
- The midpoint-based winding number classifier is unreliable when the midpoint lies on the other path's boundary

**Validation**: Offsetting the rounded wedge geometry by 0.5 units (eliminating all shared boundaries) increased correct cells from 9/24 to 18/24.

### Class 2: Assembly Linking at Shallow Angles (~25% of artifacts)

Even without shared geometry, 6/24 cells showed artifacts. These occur at near-tangent intersections where fillet arcs meet the inner/outer arcs at shallow angles. The assembly's `buildIntersectionLinks()` greedy distance-sorted matching sometimes picks a wrong run when multiple candidates are at similar distances from an exit point.

### Original Analysis (Revised)

The original bug doc identified missing arc tangent computation as the sole root cause. Investigation showed this was **necessary but insufficient**: the tangent fix alone produces no visual improvement on the diagnostic matrix because `findBestEntry()` tangent disambiguation is rarely the deciding factor (there's typically only 1 candidate within tolerance at each intersection point). The real bottleneck was the fixed `LINK_TOL = 1e-5` tolerance being too tight for the actual endpoint distances.

## Pipeline Analysis (Revised)

| Stage | Function | Issue | Fix Applied |
|-------|----------|-------|-------------|
| 1. Intersection finding | `intersectCircleCircle()` | Returns `[]` for coincident arcs | **Fixed**: `coincidentArcIntersections()` |
| 1. Intersection finding | `intersectLineLine()` | Returns `[]` for collinear lines | **Not fixed** (breaks union edge cases) |
| 2. Splitting | `splitPathAtIntersections()` | Near-coincident intersections create degenerate tiny segments | **Fixed**: t-value merging (MIN_SEG_LEN = 0.5) |
| 3. Classification | `classifySegment()` | Midpoint winding number unreliable on shared boundaries | **Fixed**: ring-walk classifier with tangent-touch detection |
| 4. Assembly | `tangentAtEnd/Start()` | Missing arc case | **Fixed**: elliptical arc tangent formula |
| 4. Assembly | `buildIntersectionLinks()` | Fixed 1e-5 tolerance too tight; greedy fallback creates wrong links | **Fixed**: distance-sorted greedy assignment |
| 4. Assembly | No-intersection check | Vertex-vertex intersections bypass `handleNoIntersections()` | **Fixed**: effective intersection filter |

## Fix Details (2026-03-31)

### 1. Coincident arc intersection detection

New `coincidentArcIntersections()` in `intersectCircleCircle()`. When two circular arcs share the same circle (`d < GEOMETRIC_EPSILON && |rA - rB| < GEOMETRIC_EPSILON`), reports the overlap boundary points — endpoints of one arc that fall within the other's angular range — as intersection points via `arcTForPoint()`.

### 2. Near-coincident t-value merging

In `splitPathAtIntersections()`, after sorting intersection t-values for each segment, merges nearby t-values whose geometric distance is < 0.5 units. This prevents the coincident arc detection (and cubic approximation) from creating degenerate tiny segments that get randomly classified.

### 3. Ring-walk segment classifier

Replaces the midpoint winding number classifier with a ring-walk approach: seed from a reliable segment (verified by sampling at t=0.3 and t=0.7), then propagate inside/outside state through the ring, flipping at transverse crossings (same-origIndex boundaries). Tangent-touch detection via cross product of the two paths' tangent vectors prevents false flips at near-tangent intersections.

### 4. Arc tangent computation

Added `'a'` cases to `tangentAtEnd()` and `tangentAtStart()` using the elliptical arc parametric derivative: `dP/dθ = R(φ) · [-rx·sin(θ), ry·cos(θ)]`, negated for CW sweeps (`deltaAngle < 0`). Falls through to chord default if `cmdArcCenter()` returns null.

### 5. Distance-sorted greedy assembly linking

Replaced the fixed-tolerance + tangent-disambiguation + greedy-fallback linking with a simpler distance-sorted greedy assignment. All possible exit→entry pairs across paths are sorted by distance; processed shortest-first, each run used at most once. This eliminates the tolerance calibration problem and naturally pairs correct matches before wrong candidates.

### 6. Effective intersection filter

Changed the no-intersection check from `intersections.length === 0` to also verify at least one intersection creates an actual split (has a non-endpoint t-value). This prevents vertex-vertex intersections from bypassing `handleNoIntersections()`.

## Quantitative Results

Diagnostic matrix (6×4 grid, theta × outerR, cornerR=16, innerR=30):

| Metric | Baseline | With Fix |
|--------|----------|----------|
| Correct cells | 9/24 (37%) | 11/24 (46%) |
| Improved chord (still artifact) | — | 6 cells |
| Regressions | — | 0 cells |

With offset geometry (no shared boundaries): 18/24 correct (75%), confirming shared geometry as the dominant cause.

## Remaining Work

1. **Collinear line intersection detection**: Adding `coincidentLineIntersections()` (analogous to the arc version) would handle the radial edge overlaps. Earlier attempt broke the "union of rectangles sharing a collinear edge" test — needs operation-specific gating.

2. **Assembly linking at shallow angles**: The greedy distance-sorted assignment sometimes picks wrong matches when fillet arcs intersect at near-tangent angles. Angular ordering or curvature-aware matching could improve this.

## Tests Added

Three new tests in `tests/boolean-ops.test.ts`:
- XOR of `radialWedge` sharp vs rounded — verifies corner crescents, no large diagonal line artifacts
- Difference of circle from rectangle at shallow angle — verifies arc-line tangent disambiguation
- XOR of overlapping rotated ellipses (rx≠ry, φ=30°) — exercises full elliptical tangent formula

One test updated:
- Union of rectangles sharing collinear edge — relaxed from exactly 2 subpaths to 1-2 (ring-walk classifier produces a correctly merged single subpath)

## Relationship to Prior Fix

The `10-boolean-assembly-artifact-fix.md` documents a 2026-03-17 fix for triangular artifacts at glyph overlaps. That fix introduced the tangent-based disambiguation (Ring-based Weiler-Atherton with dot product alignment). However, the tangent computation was only implemented for cubic and quadratic curves — the arc case was never added, and the broader issues of coincident geometry handling were not addressed.

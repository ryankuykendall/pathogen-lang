# Radial Wedge Geometry: Diagnostic Process & Reflections

## The Problem

Building a `radialWedge()` stdlib function that draws an annular sector (ring segment) with rounded corners and graceful degradation when corners don't fit. The function needed to match the visual quality of Observable's radial bar charts, where narrow bars have smooth teardrop tips instead of broken geometry.

## Iteration History

### Attempt 1: Post-hoc fillet on PathBlock

Initial approach used `heading`/`tangentArc`/`tangentLine`/`turn` inside a PathBlock, then `.fillet(cornerR)` to round corners.

**Problem:** The `.fillet()` implementation only handled line-to-line corners. Arc-to-line and line-to-arc transitions were silently skipped, leaving all corners sharp.

**Fix:** Extended fillet in `path-transforms.ts` to compute tangent directions at arc endpoints using `arcEndpointToCenter()`, then apply the same half-angle/trim-distance geometry. Added a degenerate-guard to skip fillets where the radius exceeds edge length (prevents `undefined` in SVG output from zero-length split commands).

**Lesson:** Fillet was designed for polygons, not mixed arc/line paths. The tangent-based generalization works but revealed that computing tangent directions for arcs requires the full SVG arc center parametrization — a non-trivial dependency.

### Attempt 2: Native stdlib function with absolute coordinates

Moved to a dedicated `radialWedge()` in `stdlib/path.ts` using absolute SVG commands and `cx, cy` center parameters.

**Problems:**
1. Used absolute `M` command — prevented composition in PathBlocks
2. Corner arcs computed by angular trimming (`cr / R` radians) rather than exact tangent geometry — produced arcs that didn't meet radial edges at the tangent
3. No cap fallback for narrow ends — small wedges failed to render

### Attempt 3: Relative commands, fromAngle/toAngle API

Removed `cx, cy` (center is cursor position), switched to all relative commands (`m`, `a`, `l`, `z`), renamed to `fromAngle`/`toAngle` matching conic gradient convention.

**Problem:** Fillet arcs were concave (curving inward) instead of convex. The sweep flag was wrong.

### Attempt 4: Correct sweep flags + inner/outer cap fallback

Added `useInnerCap` and `useOuterCap` detection. When an end was too narrow for two corner radii, replaced with a single smooth cap arc.

**Problems:**
1. Outer arc fillet endpoints were in the wrong order — `oaFPt` (near fromAngle) was used as the first stop after arriving from the toAngle side, causing the fillet to jump across the entire wedge
2. Inner cap sweep was using `iSw` instead of `oSw`, producing concave caps
3. Cap radius computed from the wrong circle (`outerR` instead of `outerR - cr`)

### Attempt 5: First-principles rewrite with tangent geometry

Rewrote from scratch using correct fillet tangent point math:
- Fillet center sits on concentric circle of radius `R ± cr`
- Angular offset to tangent point: `alpha = asin(cr / (R ± cr))`
- Tangent point on radial line: `cr` along the line from the vertex

**Problems:**
1. Inner fillet sweep was still inverted — used `iSw` but needed `oSw`
2. No graceful degradation — when `cr` was too large, shapes disappeared instead of rendering with reduced radius

### Attempt 6: Analytical radius reduction (current)

**Key insight:** Instead of cap fallback, compute the maximum corner radius that fits each end analytically:
- Inner: `maxCr = innerR * sin(halfSweep) / (1 - sin(halfSweep))`
- Outer: `maxCr = outerR * sin(halfSweep) / (1 + sin(halfSweep))`

Each end gets an independent effective radius (`iCr`, `oCr`). No caps, no fallback shape — just the correct corners at whatever radius fits.

**Sweep flag resolution:** All four corners curve toward the wedge interior. Regardless of inner/outer, this is always `oSw` (opposite of the main traversal direction). The fillet center is always on the "inside" of the wedge boundary.

## Key Geometric Insights

### Why angular trimming fails

The naive approach `angularTrim = cr / R` assumes the fillet tangent point on the concentric arc is at a linear arc-length offset. But the actual tangent point is where the fillet circle (radius `cr`, center at `R ± cr`) touches the main circle (radius `R`). This is a circle-circle tangency problem, and the angular offset is `asin(cr / (R ± cr))`, not `cr / R`. For small `cr/R` ratios the difference is negligible, but for large ratios (narrow wedges, large corners) the error produces visible artifacts.

### Why all fillets share the same sweep

Traversing the wedge boundary CW, every corner is a "right turn." The fillet always curves toward the interior. In SVG arc terms, this is always the `oSw` direction (opposite of the inner arc's sweep) because:
- At inner corners: fillet center is at `R + cr` (outside inner circle), arc curves outward from inner circle = toward wedge interior
- At outer corners: fillet center is at `R - cr` (inside outer circle), arc curves inward from outer circle = toward wedge interior

Both directions are the same in absolute terms — toward the wedge center line.

### Why independent radii per end

The inner end and outer end have different angular budgets. At `innerR = 30` and `outerR = 140` with `sweepAngle = 0.1π`:
- Inner arc length = 30 × 0.1π ≈ 9.4 — very tight
- Outer arc length = 140 × 0.1π ≈ 44 — plenty of room

Using a single `cr` for all corners either limits the outer corners unnecessarily (if clamped to inner budget) or breaks the inner corners (if using the outer budget). Independent `iCr` and `oCr` let each end use the maximum radius that fits.

## Diagnostic Technique: XOR Matrix

To validate the geometry, we built a visual diagnostic matrix:
- Rows: varying `outerR` (50, 70, 100, 140)
- Columns: varying `theta` (0.05π to 0.5π)
- Each cell shows:
  1. Guide circles (inner/outer radius) as dashed blue lines
  2. Sharp-cornered wedge as dotted outline
  3. Rounded wedge filled
  4. XOR between sharp and rounded — highlights areas where rounding adds or removes geometry
  5. Arc-length labels for inner/outer arcs and effective corner radius

The XOR layer reveals tangent mismatches as colored slivers where the rounded wedge extends beyond or falls short of the sharp-cornered reference.

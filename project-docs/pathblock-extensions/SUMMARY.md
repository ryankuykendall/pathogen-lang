# PathBlock Extensions — Implementation Summary

## Overview

Multi-phase implementation of PathBlock capabilities: `drawTo()`, chamfers, fillets, elliptical fillets, boolean operations, and four blog posts.

## Phases Completed

### Phase 1: `drawTo(x, y)` — Convenience Drawing
- Emits `M x y` + relative commands, returns `ProjectedPathValue`
- Works on both `PathBlockValue` and `ProjectedPathValue`
- 13 tests

### Phase 2: Chamfers
- `chamfer(distance)`, `chamfer(d1, d2)`, `chamferAtVertex(index, distance)`
- Shared infrastructure: `identifyCornerVertices()`, `findTrimFromEndT()`, `findTrimFromStartT()`
- Handles closed paths (expands `z`), clamping, open paths
- 12 tests

### Phase 3: Circular Fillets
- `fillet(radius)`, `filletAtVertex(index, radius)`
- Line-line junctions only (curve junctions skip with warning)
- Trim distance = `radius / tan(halfAngle)`, sweep from cross product
- 11 tests

### Phase 4: Elliptical Fillets
- `ellipticalFillet(rx, ry)`, `ellipticalFillet(rx, ry, rotation)`
- `ellipticalFilletAtVertex(index, rx, ry)`, `ellipticalFilletAtVertex(index, rx, ry, rotation)`
- 7 tests

### Phase 5: Boolean Operations
- `union()`, `difference()`, `intersection()`, `xor()`
- Curve-preserving: no linearization
- Full intersection finder for all curve pair types (line-line, line-cubic, cubic-cubic via Bezier clipping, arc combinations)
- Winding number classification, graph traversal
- 1804 lines in `src/evaluator/boolean-ops.ts`
- 21 tests

### Phase 6: Blog Posts (4 posts)
- `pathblock-introduction.md` — PathBlock syntax, draw/drawTo, reuse, properties
- `pathblock-parametric-sampling.md` — get/tangent/normal/partition, fence demo
- `pathblock-fillets-chamfers.md` — chamfer/fillet/ellipticalFillet gallery
- `pathblock-boolean-operations.md` — union/difference/intersection/xor, curve preservation

## Key Files Modified
- `src/evaluator/index.ts` — PathBlockValue/ProjectedPathValue method dispatch
- `src/evaluator/annotated.ts` — Annotated mode support
- `src/evaluator/path-transforms.ts` — Corner operations (~600 LOC added)
- `src/evaluator/boolean-ops.ts` — New file (1804 LOC)
- `docs/path-blocks.md` — Documentation for all new features
- `tests/path-blocks.test.ts` — 43 new tests
- `tests/boolean-ops.test.ts` — New file, 21 tests
- 7 sample `.pathogen` files in `website/blog/samples/post6-9/`
- 4 blog post markdown files in `website/blog/`

## Test Results
- All 1566 tests passing
- Build succeeds

## Known Issues
- `circle()` stdlib PathBlock has a NaN endpoint — worked around in boolean ops tests by using rectangles
- Fillets only work at line-line junctions (by design for v1)

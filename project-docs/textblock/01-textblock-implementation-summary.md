# TextBlock Implementation Summary

## Date: 2026-03-13

## What Was Implemented

The full TextBlock feature across 5 phases:

### Phase 1: Core Types, Parser, Basic Evaluation
- **AST**: `TextBlockExpression` node in `src/parser/ast.ts`
- **Parser**: `&{ }` sigil in `src/parser/index.ts`, registered in `primaryExpression` with `withPostfix`
- **Types**: `TextBlockValue`, `ProjectedTextValue`, `TextBlockElement` in `src/evaluator/types.ts`
- **Evaluator**: `evaluateTextBlockExpression()` with dedicated `evaluateTextBlockBody()` recursive helper for control flow (for/if/let) inside text blocks
- **Methods**: `.project(x, y)`, `.drawTo(x, y, rotation?)`, `.draw()`, `.translate(dx, dy)`
- **Properties**: `.elementCount`, `.styles`, `.origin`
- **Operators**: `<<` for style merging on both TextBlockValue and ProjectedTextValue
- **Type guards**: `isTextBlockValue()`, `isProjectedTextValue()`
- **Display**: `TextBlock(N elements)`, `ProjectedText(x, y, N elements)`
- **Enum**: `BBoxAnchor` with 9 positions (TopLeft, Top, TopRight, Right, BottomRight, Bottom, BottomLeft, Left, Center)

### Phase 2: Font Metrics and BoundingBox
- **New file**: `src/evaluator/font-metrics.ts`
  - Per-character width tables for sans-serif, serif, monospace
  - `estimateTextBoundingBox()` — walks TextBlockElements accounting for font-size, font-family, font-weight, letter-spacing, tspan dx/dy
  - ~85-90% accuracy for Latin text
- **Methods**: `.boundingBox()` on both types, `.paddedBoundingBox(blockPad, inlinePad)` on ProjectedTextValue

### Phase 3: Anchor Points and Polar Projection
- **Methods**: `.anchor(BBoxAnchor)` on ProjectedTextValue, `.polarProject(px, py, angle, distance, anchor)` on both types
- **Helper**: `resolveAnchorPoint()` maps BBoxAnchor string to point within bounding box

### Phase 4: Intersection Detection
- **Methods**: `.intersects(geometry)` returns boolean, `.intersectionPoints(geometry)` returns Array<PointValue>
- **Geometry utilities** in `font-metrics.ts`: `bboxOverlaps()`, `bboxPathIntersects()`, `bboxPathIntersectionPoints()`
- Accepts ProjectedTextValue (AABB), ProjectedPathValue (bbox-vs-path), or {x,y,width,height} objects

### Phase 5: Documentation, Exports, Tests
- **Annotated evaluator**: Full mirror in `src/evaluator/annotated.ts`
- **Exports**: `src/index.ts` updated with all new types and type guards
- **Playground types**: `playground/types/compiler.d.ts` updated
- **Documentation**: `docs/textblock.md` with full reference and examples
- **Tests**: 52 tests in `tests/textblock.test.ts`

## Files Changed

| File | Change |
|------|--------|
| `src/parser/ast.ts` | Added `TextBlockExpression` node + unions |
| `src/parser/index.ts` | Added `&{}` parser + primaryExpression registration |
| `src/evaluator/types.ts` | Added `TextBlockValue`, `ProjectedTextValue`, `TextBlockElement` + Value union |
| `src/evaluator/index.ts` | Full evaluator: expression dispatch, methods, properties, `<<`, display, log, BBoxAnchor enum |
| `src/evaluator/font-metrics.ts` | **New** — char width tables, bbox estimation, intersection geometry |
| `src/evaluator/annotated.ts` | Mirror of all evaluator changes |
| `src/index.ts` | Export new types + type guards |
| `playground/types/compiler.d.ts` | Added TextBlock type declarations |
| `docs/textblock.md` | **New** — feature documentation |
| `tests/textblock.test.ts` | **New** — 52 tests |

## Test Results

- 1754 total tests passing (1702 existing + 52 new)
- 17 test files, all green
- Build succeeds (ESM, CJS, IIFE, DTS)

## Key Design Decisions

1. **Dedicated `evaluateTextBlockBody()` helper**: Unlike PathBlock which reuses `evaluateStatementToAccum`, TextBlock needs its own recursive body evaluator because text statements inside for/if loops must accumulate to the TextBlock's element array, not to a TextLayer.

2. **Font metrics are synchronous**: No async font loading — uses built-in character width tables. API designed so opentype.js can slot in behind `estimateTextBoundingBox()` in a future phase.

3. **Style inheritance**: Block-level styles (from `<<`) cascade to all elements. Element-level styles (from `text(..., styles)`) override block-level. tspan styles override element-level.

4. **`.drawTo()` on TextBlockValue**: Emits to TextLayer AND returns ProjectedTextValue, matching the PathBlock pattern where `.drawTo()` both emits and returns a projected value.

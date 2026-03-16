# TextBlock Design Feedback & Refined API

## Context

Users composing SVG diagrams/schematics with text need to know text dimensions
BEFORE drawing to avoid overlap with other elements. Currently, `text()` statements
only work inside `TextLayer.apply {}` blocks and emit directly — there's no way to
compose text, measure it, then decide where to place it.

TextBlock solves this by introducing a **composition-first** text primitive that
parallels PathBlock: compose → measure → position → draw.

## Design Feedback on the User's Sketch

### What works well

1. **`&{}` sigil** — clean parallel to `@{}` for PathBlock. Distinctive, memorable.
2. **`.project(x, y)` → ProjectedTextValue** — consistent with PathBlock's projection model.
3. **`<< ${}` style application** — already works for PathBlock/StyleBlock. Natural extension.
4. **BoundingBoxPositionEnum anchor points** — great for radial label placement.
5. **Multiple `text()` elements per block** — treats a group of text as a single layout unit.

### Refinements suggested

#### 1. Coordinate model: relative to origin (like PathBlock)

All `text(x, y)` coordinates inside `&{}` should be **relative to the block's origin (0,0)**.
`.project(x, y)` offsets everything to absolute space. This is the PathBlock model and
users already understand it.

#### 2. `.boundingBox()` without DOM — the core architectural challenge

The compiler runs synchronously in a Web Worker (no DOM) and in Node.js CLI. The user's
sketch mentions using `getBBox()` via offscreen SVG, but this isn't directly possible in
the compiler's execution context.

**Proposed approach: font-metrics estimation**

- A new `src/evaluator/font-metrics.ts` module provides synchronous, DOM-free bbox estimation
- Uses font-size, font-family category, and per-character width tables
- Accuracy: ~85-90% for common Latin text (sufficient for layout/overlap decisions)
- Works identically in browser worker, CLI, and tests
- Documentation clearly states this is an estimate

The estimation model:
- Parse `font-size` from styles (default: 16)
- Select character width table by `font-family` category (sans-serif, serif, monospace)
- Width = sum of per-character widths scaled by font-size
- Height = font-size x ascent+descent factor (~1.2)
- Account for `letter-spacing`, `font-weight` (bold: x1.05), tspan dx/dy offsets
- Union all text element bboxes for the aggregate result

**Future enhancement path**: If pixel-perfect measurement becomes critical, we could add
an async measurement callback that the playground provides, or integrate `opentype.js`
for real font file metrics. But the estimation approach is the right starting point.

#### 3. Method API: separate concerns, don't fake-chain

The sketch showed `.boundingBox().bboxWithPadding().intersectionVertices().drawTo()` as
if chaining, but these return different types. Cleaner as distinct methods on
ProjectedTextValue:

```
projected.boundingBox()                          → ObjectValue {x, y, width, height}
projected.paddedBoundingBox(blockPad, inlinePad) → ObjectValue {x, y, width, height}
projected.intersects(geometry)                   → boolean
projected.intersectionPoints(geometry)           → Array<Point>
projected.anchor(BBoxAnchor.TopRight)            → Point
projected.drawTo(x, y, rotation?)               → (emits to TextLayer)
```

#### 4. Naming refinements

| User's name | Suggested name | Reason |
|---|---|---|
| `BoundingBoxPositionEnum` | `BBoxAnchor` | Brevity; matches enum naming style (Easing, Interpolation) |
| `.bboxWithPadding()` | `.paddedBoundingBox()` | Method on ProjectedTextValue, not on the bbox result |
| `.intersectionVertices()` | `.intersects()` + `.intersectionPoints()` | Separate boolean check from point extraction |
| `.polarProjectToPoint()` | `.polarProject()` | Brevity; mirrors `.project()` naming |

#### 5. Add `BBoxAnchor.Center`

The user's enum has 8 perimeter positions. Adding `Center` is useful for centering text
on a target point (common use case for labels).

#### 6. `.drawTo()` requires TextLayer context

Just like `text()` requires being inside a `TextLayer.apply {}` block, `.drawTo()` on
TextBlock/ProjectedTextValue should enforce the same constraint. This maintains the
principle that text emission only happens through TextLayers.

#### 7. Drop `.draw()` on raw TextBlockValue

PathBlock has `.draw()` because there's a "current pen position" from PathContext. Text
has no equivalent cursor. Forcing `.drawTo(x, y)` (explicit position) or
`.project(x, y).draw()` is clearer and avoids a foot-gun of accidentally drawing at (0,0).

**Alternative**: `.draw()` on ProjectedTextValue makes sense — it draws at the projected
position. This is the natural "I've positioned it, now render it" method.

## Refined Type Hierarchy

```
TextBlockValue (relative coords, origin 0,0)
  │
  ├── << StyleBlockValue     → TextBlockValue (merged styles)
  ├── .project(x, y)         → ProjectedTextValue
  ├── .drawTo(x, y, rot?)    → emits to TextLayer, returns ProjectedTextValue
  ├── .boundingBox()          → ObjectValue {x, y, width, height}
  ├── .polarProject(...)      → ProjectedTextValue
  ├── .elementCount           → number (property)
  ├── .styles                 → StyleBlockValue (property)
  │
ProjectedTextValue (absolute coords)
  │
  ├── .draw()                 → emits at projected position
  ├── .drawTo(x, y, rot?)    → re-project and emit
  ├── .boundingBox()          → ObjectValue {x, y, width, height}
  ├── .paddedBoundingBox(b,i) → ObjectValue {x, y, width, height}
  ├── .anchor(BBoxAnchor)     → PointValue
  ├── .intersects(geometry)   → boolean
  ├── .intersectionPoints(g)  → Array<PointValue>
  ├── .polarProject(...)      → ProjectedTextValue
  ├── .translate(dx, dy)      → ProjectedTextValue
  ├── .origin                 → PointValue (property)
  ├── .elementCount           → number (property)
  ├── .styles                 → StyleBlockValue (property)
```

## BBoxAnchor Enum

```
enum BBoxAnchor {
  TopLeft,    Top,    TopRight,
  Left,       Center, Right,
  BottomLeft, Bottom, BottomRight,
}
```

## Usage Example

```pathogen
let label = &{
  text(0, 0)`Temperature`;
  text(0, 14) {
    tspan(0, 0, ${ font-weight: bold; })`${temp}`;
    tspan(4, 0)`${unit}`;
  }
} << ${ font-size: 12; font-family: sans-serif; };

// Measure before placing
let bbox = label.boundingBox();
log(bbox.width, bbox.height);

// Place radially from a data point
let placed = label.polarProject(dataX, dataY, 45deg, 20, BBoxAnchor.BottomLeft);

// Check for overlap with other elements
if (!placed.intersects(otherPlacedLabel)) {
  let tl = TextLayer('labels') ${ fill: #333; };
  tl.apply {
    placed.draw();
  }
}
```

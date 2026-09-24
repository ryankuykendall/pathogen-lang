# 01 — The six coordinate spaces

The published mental model has two: *a PathBlock is local, a ProjectedPath is page*. The
code has at least six **families**, and only the first edge has a named conversion. Family 6
is itself six sub-spaces — see the section below — so "six" is the conservative count used
throughout these notes, not the total.

| # | Space | Origin means | Who lives in it |
|---|---|---|---|
| 1 | **PathBlock-local** | the block's own `(0,0)`, an abstraction with no page position | `@{ }` and every derived block |
| 2 | **page / world** | SVG user-space coordinates | `ProjectedPathValue`, layer records |
| 3 | **layer-local, pre-transform** | page coordinates *before* the layer's `transform` attribute | **layer queries — typed as `ProjectedPath`** |
| 4 | **glyph space** | the glyph's baseline origin, font-size-scaled units, y-down | `PathBlock.fromGlyph`, `.contours` |
| 5 | **TextBlock-local** | the text block's own origin | `TextBlockValue` elements |
| 6 | **per-defs-element** | each `<defs>` child's own frame | mask / clipPath / pattern-frame / pattern-content / marker-viewBox / gradient-bbox |

## The one named conversion

`projectCommands(commands, originX, originY)` (`src/evaluator/index.ts:1255`) — pure
translation, no scale or rotation. It is the only function in the codebase whose job is to
move geometry between spaces. Edges 1↔2 use it. **Edges 3, 4, 5 and 6 have no conversion
function at all**; the code simply reinterprets the numbers.

## Space 3 is the dangerous one, because it lies about its type

A layer query returns a `ProjectedPathValue`, whose contract is "page coordinates". When the
layer carries a `transform`, that is false — the query answers *pre-transform* coordinates
and the browser then moves the geometry.

```
let moved = PathLayer('moved') #{ translate-x: 100; translate-y: 50; };
moved.apply { M 10 10; L 60 10; }
log(layer('moved').query('endpoint:last').point);   // Point(60, 10)
```
```html
<path d="M 10 10 L 60 10" transform="translate(100, 50)"/>   <!-- renders at (160, 60) -->
```

An annotation placed from that query lands 100,50 away from the thing it annotates.
`layerState.transformState` is never read by `src/evaluator/path-query.ts`. No published
page mentions this. See `05-defects.md` D2.

## Space 6 is not one space, it is six

Each `<defs>` child interprets its content differently, and `.append()` treats them all
identically — `projectCommands(cmds, 0, 0)`, a no-op, then serialize:

| Element | Content space | Units knob exposed? |
|---|---|---|
| `<mask>` | page user space | **none** — region silently defaults to `objectBoundingBox` |
| `<clipPath>` | page user space | **none** (`userSpaceOnUse` is the SVG default, so it matches) |
| `<pattern>` | frame and content in **different** spaces | `patternUnits`, `patternContentUnits` |
| `<marker>` | the marker's own `viewBox`, scaled by the referencing stroke-width | `markerUnits`, `viewBox`, `refX/refY` |
| gradients | object bounding box by default | `gradientUnits` |

Consequences, both silent:

- A **PathBlock** handed to `Marker.append()` is read as marker-viewBox coordinates. The
  default viewBox is `0 0 markerWidth markerHeight` — **no negative quadrant** — so a block
  centred on its own origin (which is what `circle()` and `.contours` produce) has three
  quadrants clipped away.
- A **ProjectedPath** handed to the same method keeps its page numbers: a path projected at
  `(200, 150)` sits at `(200, 150)` inside a `0 0 10 10` viewBox, entirely invisible.

## Space 4: why the glyph example adds `(x, y)`

A glyph outline is neither em units nor page units: it is *font-size-scaled units measured
from the glyph's baseline origin* (`src/evaluator/font-provider.ts:191-289`). `fromGlyph`
and `.contours` both rebuild with an explicit `{x:0, y:0}`, which **keeps** the baseline
origin rather than moving it to the first inked point — which is exactly why every contour
of a letter composes back into that letter when drawn at one anchor.

That is what `docs/variable-offset.md:158` means by "`anchor` is relative to the glyph
origin", and why its worked example adds the glyph's own `(x, y)`.

## The viewBox origin is dropped on the way to defs

`buildSvgTree` passes `buildDefs` the viewBox **width and height only**, never
`originX`/`originY` (`src/render/build-tree.ts:63`). Every consumer that "fills the canvas"
therefore assumes the canvas starts at `(0,0)`. With `define ViewBox(-100, -100, 200, 200)`
the visible area is `(-100,-100) → (100,100)`, but the conic-gradient mask, its backing rect
and its output pattern all span `(0,0) → (200,200)`, and the default conic centre lands at
`(100,100)` — the bottom-right corner. See `05-defects.md` D5.

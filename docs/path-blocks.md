# Path Blocks

Path Blocks let you define reusable, introspectable paths without immediately drawing them. A PathBlock captures relative path commands and exposes metadata (length, vertices, endpoints) for positioning other elements relative to the path.

## Syntax

```
let myPath = @{
  v 20
  h 30
  v -20
};
```

`@{` opens a Path Block, `}` closes it. The body contains **relative** path commands, control flow, variables, and function calls. The result is a `PathBlock` value — no path commands are emitted.

## Drawing a Path Block

Use `.draw()` to emit the path's commands at the current cursor position:

```
let shape = @{ v 20 h 20 v -20 z };

M 10 10
shape.draw()     // emits: v 20 h 20 v -20 z
M 50 50
shape.draw()     // reuse at a different position
```

`draw()` advances the cursor to the path's endpoint and returns a `ProjectedPath` with absolute coordinates.

### Assigning the draw result

```
let shape = @{ v 20 h 20 };
M 10 10
let proj = shape.draw();
// proj.startPoint = Point(10, 10)
// proj.endPoint = Point(30, 30)
```

### Drawing at a specific position

Use `.drawTo(x, y)` to emit `M x y` followed by the path's commands in a single call. This combines positioning and drawing — no separate `M` command needed.

```
let shape = @{ v 20 h 20 v -20 z };

shape.drawTo(10, 10)     // emits: M 10 10 v 20 h 20 v -20 z
shape.drawTo(50, 50)     // reuse at a different position
```

`drawTo()` returns a `ProjectedPath` with absolute coordinates, just like `draw()`:

```
let shape = @{ v 20 h 30 };
let proj = shape.drawTo(10, 10);
// proj.startPoint = Point(10, 10)
// proj.endPoint = Point(40, 30)
```

`drawTo()` also works on ProjectedPath values — it re-positions the projected path to the new origin:

```
let shape = @{ h 50 v 30 };
let proj = shape.project(0, 0);
proj.drawTo(100, 100)    // emits: M 100 100 h 50 v 30
```

## Projecting Without Drawing

Use `.project(x, y)` to compute absolute coordinates without emitting commands or moving the cursor:

```
let shape = @{ v 20 h 30 };
let proj = shape.project(10, 10);
// proj.startPoint = Point(10, 10)
// proj.endPoint = Point(40, 30)
// No path commands emitted, cursor unchanged
```

## Properties

### PathBlock

| Property | Type | Description |
|---|---|---|
| `length` | `number` | Total arc-length of the path |
| `vertices` | `Point[]` | Unique start/end points of each command segment |
| `subPathCount` | `number` | Number of subpaths (separated by `m` commands) |
| `subPathCommands` | `object[]` | Structured command list (see below) |
| `startPoint` | `Point` | Always `Point(0, 0)` |
| `endPoint` | `Point` | Final cursor position (relative to origin) |
| `isEmpty` | `boolean` | `true` when the block contains no path commands — e.g. a space glyph from `fromGlyph`, or `subPath(t, t)` |

### ProjectedPath

Same properties as PathBlock but with absolute coordinates.

### subPathCommands entries

Each entry in `subPathCommands` is an object with:

```
{
  command: "v",           // lowercase command letter
  args: [20],             // numeric arguments
  start: Point(0, 0),     // cursor before command
  end: Point(0, 20)       // cursor after command
}
```

## Control Flow Inside Path Blocks

Variables, `for` loops, `foreach` loops, `if` statements, and function calls all work inside path blocks:

```
let zigzag = @{
  for (i in 0..4) {
    v 10
    h calc(i % 2 == 0 ? 10 : -10)
  }
};
```

Context-aware functions like `arcFromPolarOffset`, `tangentLine`, and `tangentArc` work against the block's temporary path context.

## Accessing Outer Variables

Path blocks can read variables from enclosing scope:

```
let size = 20;
let box = @{ v size h size v calc(-size) z };
```

## First-Class Values

PathBlocks can be passed as function arguments and returned from functions:

```
fn makeStep(dx, dy) {
  return @{ h dx v dy };
}

let step = makeStep(10, 5);
M 0 0
step.draw()    // emits: h 10 v 5
```

## Using Path Metadata

Access path properties for layout calculations:

```
let segment = @{ v 20 h 30 };

// Use length to create a matching horizontal line
let total = segment.length;       // 50

// Use endpoint for positioning
let end = segment.endPoint;       // Point(30, 20)
M end.x end.y                     // Position at path endpoint
```

## Restrictions

Path blocks enforce these rules at runtime:

1. **Relative commands only** — All path commands must be lowercase (`m`, `l`, `h`, `v`, etc.). Uppercase (absolute) commands throw an error.
2. **No layer definitions** — `define PathLayer/TextLayer` is not allowed
3. **No layer apply blocks** — `layer().apply { }` is not allowed
4. **No text statements** — `text()` / `tspan()` are not allowed
5. **No nesting** — Path blocks cannot contain other `@{ }` expressions
6. **No draw/project inside blocks** — Calling `.draw()` or `.project()` inside a path block throws an error

## Parametric Sampling

Parametric sampling lets you query points, tangent directions, and normal directions at any position along a path. The parameter `t` is a fraction from 0 (start) to 1 (end) measured by arc length.

These methods work on both PathBlock values and ProjectedPath values.

### `get(t)` → Point

Returns the point at arc-length fraction `t` along the path.

```
let p = @{ v 50 h 100 };
let mid = p.get(0.5);       // Point roughly at distance 75 along path
M mid.x mid.y               // position at midpoint
```

### `tangent(t)` → `{ point, angle }`

Returns the point and tangent angle at fraction `t`. The angle is the direction of travel, as a plain number in radians.

```
let p = @{ v 50 h 100 };
let tan = p.tangent(0.0);
log(tan.point);              // Point(0, 0)
log(tan.angle);              // ~1.5708 (π/2, pointing down)
```

### `normal(t)` → `{ point, angle }`

Returns the point and left-hand normal angle at fraction `t`. The normal angle equals the tangent angle minus π/2.

```
let p = @{ h 100 };
let n = p.normal(0.5);
log(n.point);                // Point(50, 0)
log(n.angle);                // ~-1.5708 (pointing up — left-hand normal of rightward path)
```

### `partition(n)` → OrientedPoint[]

Divides the path into `n` equal-length segments, returning `n + 1` oriented points (endpoints inclusive). Each oriented point has `point`, `angle`, and `t` properties.

| Property | Type | Description |
|---|---|---|
| `point` | `Point` | Position at this sample |
| `angle` | `number` | Tangent angle (radians) |
| `t` | `number` | Arc-length fraction (`i / n`) |

```
let p = @{ h 100 };
let pts = p.partition(4);    // 5 points at x = 0, 25, 50, 75, 100
for (op in pts) {
  log(op.point.x, op.angle, op.t);
}
// t values: 0, 0.25, 0.5, 0.75, 1
```

### Sampling on ProjectedPath

Projected paths return absolute coordinates:

```
let p = @{ h 100 };
let proj = p.project(10, 20);
let mid = proj.get(0.5);    // Point(60, 20) — offset by projection origin
```

### Curve Support

Sampling works on all command types including cubic/quadratic Bézier curves and arcs. Curves use arc-length parameterization so that `t = 0.5` always represents the geometric midpoint, not the parametric midpoint.

## Transforms

Transforms create new paths from existing ones — reversing direction, computing bounding boxes, and constructing parallel paths. These methods work on both PathBlock values and ProjectedPath values.

### `reverse()` → PathBlock / ProjectedPath

Returns a new path with reversed direction of travel. The reversed path starts where the original ended and ends where the original started.

```
let p = @{ h 50 v 30 };
let r = p.reverse();
log(r.endPoint);             // Point(-50, -30) — reversed from original
M 100 100
r.draw()                     // draws the path in reverse
```

Smooth commands (S/T) are automatically converted to their explicit forms (C/Q) before reversal. Closed paths (ending with `z`) preserve closure.

```
let closed = @{ h 30 v 30 h -30 z };
let rev = closed.reverse();  // reversed, still ends with z
```

### `boundingBox()` → `{ x, y, width, height }`

Returns the axis-aligned bounding box of the path. Accounts for Bézier curve extrema and arc extrema — not just endpoints.

```
let p = @{ c 0 -40 50 -40 50 0 };
let bb = p.boundingBox();
log(bb.y);                    // negative — curve extends above endpoints
log(bb.width, bb.height);    // full extent of the curve
```

For a straight-line path the bounding box matches the endpoint coordinates:

```
let line = @{ h 100 };
let bb = line.boundingBox();
// bb = { x: 0, y: 0, width: 100, height: 0 }
```

### `intersects(geometry)` → Boolean

AABB overlap test — returns `true` if this path's bounding box overlaps the argument's bounding box. Works on both PathBlock and ProjectedPath values.

**Accepted arguments:**

| Argument type | Comparison |
|---|---|
| PathBlock or ProjectedPath | Bounding box vs bounding box |
| ProjectedText | Path bbox vs text bbox |
| `{x, y, width, height}` object | Path bbox vs rectangle |

```
let a = @{ h 60 v 40 h -60 z };
let b = @{ h 40 v 30 h -40 z };

// Overlapping — both start at origin
let projA = a.project(0, 0);
let projB = b.project(10, 10);
log(projA.intersects(projB));        // true

// Non-overlapping
let projC = b.project(200, 200);
log(projA.intersects(projC));        // false
```

Testing against a rectangle object:

```
let shape = @{ h 50 v 50 h -50 z };
let proj = shape.project(10, 10);
log(proj.intersects({x: 0, y: 0, width: 100, height: 100}));    // true
log(proj.intersects({x: 200, y: 200, width: 10, height: 10}));  // false
```

Works on unprojected PathBlocks too (bounding box computed from relative coordinates):

```
let a = @{ h 60 v 40 h -60 z };
let b = @{ h 40 v 30 h -40 z };
log(a.intersects(b));                // true (both at origin)
```

### `intersectionPoints(geometry)` → Array\<Point\>

Returns the intersection points between this path's bounding box edges and the geometry's line segments. Works on both PathBlock and ProjectedPath values.

**Accepted arguments:**

| Argument type | Returns |
|---|---|
| PathBlock or ProjectedPath | Points where bbox edges cross path segments |
| ProjectedText | Corners of the overlap rectangle (4 points), or empty array if no overlap |

```
let box = @{ h 100 v 100 h -100 z };
let line = @{ m -10 50 h 120 };

let projBox = box.project(0, 0);
let projLine = line.project(0, 0);
let pts = projBox.intersectionPoints(projLine);
// pts contains the points where the line crosses the box's bounding box edges
```

Non-overlapping paths return an empty array:

```
let a = @{ h 50 v 50 h -50 z };
let b = @{ h 10 v 10 h -10 z };
let projA = a.project(0, 0);
let projB = b.project(200, 200);
let pts = projA.intersectionPoints(projB);
log(pts.length);                     // 0
```

### `offset(distance, options?)` → PathBlock / ProjectedPath

Creates a parallel path offset by `distance` units. Positive values offset to the left of the travel direction, negative to the right. On pieces produced by [`cut()`](#path-blocks-cutting-paths) and results of boolean operations, winding is canonicalized with material on the left, so a positive distance always grows the piece outward — including through hole boundaries.

```
let p = @{ h 60 v 40 };
let outer = p.offset(5);     // 5 units left of travel
let inner = p.offset(-5);    // 5 units right of travel
```

**Corners.** Where two segments meet, the join is chosen by the corner and the `join` option:

- Gentle corners between two straight segments keep a sharp **miter** (the true corner point), up to a miter length of 2× the offset distance — so rectangular offsets stay rectangles.
- Sharper corners, and every corner involving a curve, get a **bevel**: each segment is offset with its own normals and a short connecting line bridges the gap. Join geometry is never folded into a curve's own shape — a sharp corner cannot distort the curve next to it.
- `offset(d, { join: 'round' })` replaces the bevels with circular arcs of radius `|distance|` centered on the original corner — the offset a rolling pen would draw. `{ join: 'bevel' }` forces bevels even at gentle straight corners; the default is `'miter'` (miter where safe, bevel beyond the limit).
- Join options apply only to **convex** corners — the side the offset opens a gap on. **Concave** corners are always trimmed back to where the two offset sides cross (exactly for straight segments, by curve subdivision for curves), never given an external connector. One current limitation: a concave corner where an *arc* segment meets the join falls back to a connector; and an offset distance large enough to swallow a feature entirely (an inward offset wider than half the shape) can still self-intersect rather than collapsing.

A connector between two segments that carry the same segment label inherits that label, so a labeled edge that turns a corner still answers as one run.

**Curves.** Cubic and quadratic segments are offset as true parallel curves: the curve is subdivided where it bends strongly and each piece is offset via its control polygon, so a deep scoop's offset stays `distance` away along its whole length — at the cost of the output containing more curve segments than the input. Arcs offset by radius adjustment, quadratics are emitted as cubics.

```
let curve = @{ c 0 -40 50 -40 50 0 };
let parallel = curve.offset(3);
M 0 50
curve.draw()
M 0 50
parallel.draw()              // parallel curve 3 units to the left
```

### `mirror(angle)` → PathBlock / ProjectedPath

Reflects the path across a line through the start point at the given angle. The angle uses standard language units (radians).

```
let p = @{ h 60 v 40 };
let m = p.mirror(0.5pi);       // reflect across vertical axis → goes left
M 100 100
m.draw()
```

Common angles:
- `mirror(0)` — horizontal axis (y → -y)
- `mirror(0.5pi)` — vertical axis (x → -x)
- `mirror(0.25pi)` — diagonal (swaps x and y)

Mirror preserves path length and curve types. Arc commands have their sweep flag flipped (reflection reverses chirality) and their rotation parameter adjusted.

```
let curve = @{ c 0 -40 50 -40 50 0 };
let flipped = curve.mirror(0);
M 0 50
curve.draw()
M 0 50
flipped.draw()               // curve reflected below the axis
```

### `rotateAtVertexIndex(index, angle)` → PathBlock / ProjectedPath

Rotates the path around the vertex at `index` (from the `.vertices` array) by `angle` radians. PathBlockValue results are normalized to `(0, 0)` start.

```
let p = @{ h 50 v 50 };
// p.vertices = [Point(0,0), Point(50,0), Point(50,50)]
let r = p.rotateAtVertexIndex(1, 0.5pi);  // rotate around corner
M 10 10
r.draw()
```

The index must be a non-negative integer within range. The rotation preserves path length and curve types. Arc commands have their rotation parameter adjusted.

```
// Create a radial pattern by rotating around the first vertex
let arm = @{ h 50 v 10 };
for (i in 0..5) {
  let angle = calc(i * 2 * 3.14159265358979 / 6);
  let r = arm.rotateAtVertexIndex(0, angle);
  M 100 100
  r.draw()
}
```

### `rotate(angle, origin?)` → PathBlock / ProjectedPath

Rotates the path by `angle` around `origin` — a [`Point`](#syntax-points), defaulting to the block origin `(0, 0)` when omitted. The angle accepts plain radians or Angle values (`0.5pi`, `45deg`).

```
let arm = @{
  h 50
  v 10
};
let quarter = arm.rotate(0.5pi);          // about the block origin
let spun = arm.rotate(45deg, Point(25, 5));  // about the arm's center
```

Unlike `rotateAtVertexIndex`, the result is **not** re-based: the geometry rotates about the pivot inside the block's own coordinate frame and stays where it is. A piece that carries placement — a [`cut()`](#path-blocks-cutting-paths) shard, for example — keeps that placement, so rotating it in place needs no compensation:

```
let plate = @{
  h 60
  v 40
  h -60
  z
};
let knife = @{
  m 30 -10
  l 0 60
};
let pieces = plate.cut(knife);
for ([p, i] in pieces) {
  let pb = p.boundingBox();
  let c = Point(calc(pb.x + pb.width / 2), calc(pb.y + pb.height / 2));
  let spunPiece = p.rotate(0.1, c);
  M 20 20
  spunPiece.draw();
}
```

`rotate(a)` with no origin is equivalent to `rotateAtVertexIndex(0, a)` when the path starts at the origin. Rotation preserves path length and curve types; arc commands have their rotation parameter adjusted. Segment and endpoint labels survive (see [Labels Survive Derived Paths](#segment-labels-labels-survive-derived-paths)).

### `scale(sx, sy)` → PathBlock / ProjectedPath

Scales the path from its start point. `sx` scales x-coordinates, `sy` scales y-coordinates.

```
let p = @{ h 50 v 30 };
let doubled = p.scale(2, 2);      // endPoint (100, 60)
let wide = p.scale(3, 1);         // endPoint (150, 30)
let flipped = p.scale(-1, 1);     // mirror across y-axis
```

Uniform scaling (`sx == sy`) preserves shape and scales arc radii proportionally. Non-uniform scaling (`sx != sy`) performs full ellipse eigendecomposition to compute new arc radii and rotation. Negative scale values flip the arc sweep flag (reflection reverses chirality).

```
let arc = @{ a 25 25 0 0 1 50 0 };
let wide = arc.scale(2, 1);       // stretched elliptical arc
let big = arc.scale(3, 3);        // uniform: radii tripled
```

### `subPath(startT, endT)` → PathBlock

Extracts the geometric portion of a path between two arc-length fractions. Both `startT` and `endT` must be between 0 and 1. Always returns a PathBlock (normalized to `(0, 0)` origin), even when called on a ProjectedPath.

```
let p = @{ h 100 v 100 };
let first = p.subPath(0, 0.5);    // first half of the path
let second = p.subPath(0.5, 1);   // second half of the path
M 10 10
first.draw()
M 10 10
second.draw()                      // visually reconstructs the original
```

If `startT > endT`, the result is reversed (equivalent to `.subPath(endT, startT).reverse()`):

```
let p = @{ h 100 };
let rev = p.subPath(1, 0);        // full path, reversed direction
```

Use `.get()` on the ProjectedPath to find the absolute position, then `.draw()` the extracted PathBlock:

```
let p = @{ h 100 v 50 };
let proj = p.project(10, 20);
let start = proj.get(0.2);
let sub = proj.subPath(0.2, 0.8);  // PathBlock, normalized to (0,0)
M start.x start.y
sub.draw()                          // draws the middle 60% at the right position
```

Edge cases:

- `subPath(0, 1)` returns approximately the original path
- `subPath(t, t)` returns an empty PathBlock (not an error)
- Works with all command types including curves and arcs

```
let curve = @{ c 0 -40 50 -40 50 0 };
let front = curve.subPath(0, 0.5);
M 0 50
curve.draw()
M 0 80
front.draw()                        // first half of the Bézier curve
```

### Transforms on ProjectedPath

Projected paths return results in absolute coordinates:

```
let p = @{ h 100 };
let proj = p.project(10, 20);
let bb = proj.boundingBox();
// bb.x = 10, bb.y = 20 — absolute coordinates

let rev = proj.reverse();
log(rev.startPoint);         // Point(110, 20) — starts at original end
```

For `mirror()` on a ProjectedPath, the mirror line passes through the projection's start point. For `rotateAtVertexIndex()`, the rotation center is the absolute vertex position. For `rotate()`, the `origin` is an absolute point; when omitted, the pivot defaults to the projection's start point.

```
let p = @{ h 50 };
let proj = p.project(100, 100);
let m = proj.mirror(0.5pi);
// Mirrors across vertical line through (100, 100)
// startPoint stays at (100, 100), endPoint moves to (50, 100)
```

For `scale()` on a ProjectedPath, the scale center is the projection's start point:

```
let p = @{ h 50 v 30 };
let proj = p.project(10, 20);
let s = proj.scale(2, 2);
// startPoint stays at (10, 20), endPoint moves to (110, 80)
```

## Concatenation (`<<`)

The `<<` operator joins two PathBlocks end-to-end. The right path's relative commands continue from where the left path ends.

```
let a = @{ h 50 };
let b = @{ v 30 };
let c = calc(a << b);               // endPoint (50, 30)
M 10 10
c.draw()                             // draws "h 50 v 30"
```

Chaining works naturally since `<<` is left-associative and the result is a PathBlock:

```
let a = @{ h 50 };
let b = @{ v 30 };
let d = calc(a << b << a);          // endPoint (100, 30)
```

Self-concatenation repeats the path:

```
let p = @{ h 50 };
let doubled = calc(p << p);         // endPoint (100, 0)
```

Concatenated paths support all PathBlock methods — draw, project, sampling, and transforms:

```
let combined = calc(a << b);
let rev = combined.reverse();
let mid = combined.get(0.5);
```

The `<<` operator also works for [style block merging](#syntax-style-blocks). The operand types must match — mixing PathBlocks and style blocks throws an error. `<<` has one more job on PathBlocks: applying a [worker function](#syntax-applying-workers) to a `variableOffset()`/`compoundVariableOffset()` call written without a trailing block.

## Chamfers

Chamfers cut corners by replacing a vertex with a straight line segment. The incoming and outgoing edges are trimmed by the specified distance, and a line connects the two trim points.

### `chamfer(distance)` → PathBlock / ProjectedPath

Chamfers all corner vertices with equal distance on both sides:

```
let box = @{ h 60 v 40 h -60 z };
let chamfered = box.chamfer(8);
M 10 10
chamfered.draw()
```

### `chamfer(d1, d2)` → PathBlock / ProjectedPath

Asymmetric chamfer — `d1` is the trim distance on the incoming edge, `d2` on the outgoing edge:

```
let box = @{ h 60 v 40 h -60 z };
let asym = box.chamfer(5, 15);
M 10 10
asym.draw()
```

### `chamferAtVertex(index, distance)` → PathBlock / ProjectedPath

Chamfers a single vertex by index (from the `.vertices` array):

```
let box = @{ h 60 v 40 h -60 z };
// box.vertices: Point(0,0), Point(60,0), Point(60,40), Point(0,40)
let oneCorner = box.chamferAtVertex(1, 10);
M 10 10
oneCorner.draw()
```

### `chamferAtVertex(index, d1, d2)` → PathBlock / ProjectedPath

Asymmetric chamfer at a single vertex:

```
let box = @{ h 60 v 40 h -60 z };
let asym = box.chamferAtVertex(2, 5, 15);
M 10 10
asym.draw()
```

### Edge cases

If the chamfer distance exceeds the available edge length, it is clamped to the edge length and a warning is logged. If the vertex index is out of range, an error is thrown.

Chamfers work with all command types — lines, curves, and arcs. For curves, the trim operation uses arc-length parameterization to find the exact split point.

## Fillets

Fillets round corners by replacing a vertex with a circular arc. The incoming and outgoing edges are trimmed, and an arc tangent to both edges is inserted.

**Scope:** Line-line junctions only. At curve junctions, the fillet is skipped and a warning is logged.

> **Name-based alternative:** instead of a numeric vertex index, you can label a vertex with `as endpoint('name')` and round it with `pb.vertex('name').fillet(radius)` — or attach the fillet where you draw the corner with `with fillet(radius)`. Labels don't break when commands are added earlier in the path. See [Segment Labels & Corner Suffixes](#segment-labels-segment-labels-corner-suffixes).

### `fillet(radius)` → PathBlock / ProjectedPath

Fillets all corner vertices with the given radius:

```
let box = @{ h 60 v 40 h -60 z };
let rounded = box.fillet(8);
M 10 10
rounded.draw()
```

### `filletAtVertex(index, radius)` → PathBlock / ProjectedPath

Fillets a single vertex:

```
let box = @{ h 60 v 40 h -60 z };
let oneRound = box.filletAtVertex(1, 12);
M 10 10
oneRound.draw()
```

If the radius is too large for the available edge length, it is clamped and a warning is logged. If the vertex index is out of range, an error is thrown.

## Elliptical Fillets

Elliptical fillets replace a corner with an elliptical arc instead of a circular one, allowing for more expressive corner shapes.

**Scope:** Line-line junctions only (same as circular fillets).

### `ellipticalFillet(rx, ry)` → PathBlock / ProjectedPath

Fillets all corners with an elliptical arc of radii `rx` and `ry`:

```
let box = @{ h 60 v 40 h -60 z };
let eFilleted = box.ellipticalFillet(12, 6);
M 10 10
eFilleted.draw()
```

### `ellipticalFillet(rx, ry, rotation)` → PathBlock / ProjectedPath

Elliptical fillet with a rotated ellipse (rotation in radians, default 0):

```
let box = @{ h 60 v 40 h -60 z };
let rotated = box.ellipticalFillet(12, 6, 0.3);
M 10 10
rotated.draw()
```

### `ellipticalFilletAtVertex(index, rx, ry)` → PathBlock / ProjectedPath

Elliptical fillet at a single vertex:

```
let box = @{ h 60 v 40 h -60 z };
let one = box.ellipticalFilletAtVertex(1, 15, 8);
M 10 10
one.draw()
```

### `ellipticalFilletAtVertex(index, rx, ry, rotation)` → PathBlock / ProjectedPath

Elliptical fillet at a single vertex with rotation:

```
let box = @{ h 60 v 40 h -60 z };
let one = box.ellipticalFilletAtVertex(2, 15, 8, 0.5);
M 10 10
one.draw()
```

## Boolean Operations

The four set operations — `union`, `difference`, `intersection`, and `xor` — combine two closed paths. Both operands must be closed (end with `z` or have coincident start and end points). The result preserves original curve types — no linearization. To slice a path along open cut lines instead, see [Cutting Paths](#path-blocks-cutting-paths).

See also: [Standard Library path functions](#stdlib-path-functions) for creating shapes to use with boolean operations.

### `union(other)` → PathBlock

Combines two paths into their union (outer boundary):

```
let a = @{ circle(0, 0, 30); };
let b = @{ circle(0, 0, 30); };
let combined = a.project(50, 50).union(b.project(70, 50));
```

### `difference(other)` → PathBlock

Subtracts `other` from the path:

```
let plate = @{ circle(0, 0, 40); };
let hole = @{ circle(0, 0, 15); };
let result = plate.project(50, 50).difference(hole.project(50, 50));
```

### `intersection(other)` → PathBlock

Returns only the overlapping region:

```
let a = @{ circle(0, 0, 30); };
let b = @{ circle(0, 0, 30); };
let overlap = a.project(50, 50).intersection(b.project(70, 50));
```

### `xor(other)` → PathBlock

Returns the symmetric difference — everything in either path but not both:

```
let a = @{ circle(0, 0, 30); };
let b = @{ circle(0, 0, 30); };
let exclusive = a.project(50, 50).xor(b.project(70, 50));
```

### Requirements and behavior

- Both paths must be closed for `union`, `difference`, `intersection`, and `xor`. Open paths throw an error. ([`cut()`](#path-blocks-cutting-paths) is the exception — its cutter is usually open, and its subject may be too.)
- The `other` argument can be a PathBlock or ProjectedPath.
- Multi-component results produce multiple subpaths (`M...z M...z`).
- All curve types (lines, cubics, quadratics, arcs) are preserved through the operation.
- Results are always returned as PathBlock values (normalized to `(0, 0)` origin).
- Segment and endpoint labels from **both** operands survive into the result (see [Labels Survive Derived Paths](#segment-labels-labels-survive-derived-paths)).

## Cutting Paths

Where the [set operations](#path-blocks-boolean-operations) combine two closed shapes, `cut()` slices one shape along cut lines — like drawing a knife across it — and hands back the resulting pieces. Each piece is a complete PathBlock, healed shut along the lines that cut it (a cut *open* path is the exception: its pieces stay open fragments).

> **Debug mode:** `cut()` is not yet supported in the CLI's `--annotated` debug mode. It works normally everywhere else — CLI compilation, the playground, and the VS Code preview.

### `cut(cutter)` → array of PathBlock

Cuts the path along every stroke of `cutter` and returns the pieces:

```
let box = @{
  h 60
  v 40
  h -60
  z
};
let knife = @{
  m 30 -10
  l 0 60
};
let pieces = box.cut(knife);
log(pieces.length);    // 2
```

Each subpath of the cutter is one knife stroke, and strokes may be lines or curves. An open stroke slices the shape wherever it crosses. A closed loop acts as a cookie cutter, stamping out the region inside it — and the loop doesn't have to be authored with `z`: separate strokes whose endpoints meet are recognized as a loop geometrically:

```
let box = @{
  h 60
  v 40
  h -60
  z
};
let stamp = @{ circle(0, 0, 10); };
let pieces = box.cut(stamp.project(30, 20));
log(pieces.length);    // 2 — the stamped-out disk, and the box now carrying a hole
```

Alignment works exactly like the set operations: both blocks are overlaid in block-local coordinates, and you position the cutter with [`project()`](#path-blocks-projecting-without-drawing):

```
let plate = @{ circle(0, 0, 40); };
let knife = @{
  l 100 20
};
let pieces = plate.project(50, 50).cut(knife.project(0, 40));
log(pieces.length);    // 2
```

Pieces keep their original placement inside the subject, so drawing them all at the same position reassembles the shape — and offsetting each one produces an exploded view:

```
let box = @{
  h 60
  v 40
  h -60
  z
};
let knife = @{
  m 30 -10
  l 0 60
};
let pieces = box.cut(knife);

for ([piece, i] in pieces) {
  M calc(20 + i * 10) 20
  piece.draw()
}
```

Cutting works on multi-contour subjects — a glyph, a donut, a shape with holes. Here the knife crosses both contours of an 'O' (from [`PathBlock.fromGlyph`](#path-blocks-pathblockfromglyphtext-styles)), so each piece's boundary follows the outer edge, the cut line, and the inner edge — two C-shapes:

```
@font "Inter";
let styles = ${ font-family: Inter; font-size: 96; };
let glyphs = PathBlock.fromGlyph("O", styles);
let knife = @{ m -10 -40 l 90 8 };
let pieces = glyphs[0].cut(knife);
log(pieces.length);    // 2 — two C-shaped pieces
```

A hole the cut *misses* isn't lost — it rides along as an extra subpath inside whichever piece contains it (inspect it with [`contours`](#path-blocks-contours)).

Open subjects can be cut too. Cutting an open path severs it at each crossing and returns the open fragments — no healing, since there is no interior to close:

```
let wave = @{
  q 20 -20 40 0
  q 20 20 40 0
};
let knife = @{
  m 30 -30
  l 0 60
};
let parts = wave.cut(knife);    // 2 open fragments
```

Because every piece is a full PathBlock, styling them individually is just iteration — cut once, then route pieces to differently-styled layers:

```
let warm = PathLayer(`warm`) ${ fill: #e0b17c; stroke: #40311f; stroke-width: 1; };
let cool = PathLayer(`cool`) ${ fill: #7c9ce0; stroke: #1f2540; stroke-width: 1; };

let disc = @{ circle(0, 0, 40); };
let knives = @{
  m -20 -50
  l 0 100
  m 20 -100
  l 0 100
  m 20 -100
  l 0 100
};
let slices = disc.cut(knives);    // 4 slices

for ([piece, i] in slices) {
  if (calc(i % 2) == 0) {
    warm.apply {
      M calc(50 + i * 6) 50
      piece.draw()
    }
  } else {
    cool.apply {
      M calc(50 + i * 6) 50
      piece.draw()
    }
  }
}
```

### Cutting behavior

**Arguments and results**

- The `cutter` argument can be a PathBlock or ProjectedPath; so can the receiver. Pieces always come back as PathBlock values, even from a ProjectedPath receiver.
- Pieces keep their original placement inside the subject (like the set operations, results are normalized to a `(0, 0)` origin). Drawing every piece at one position reassembles the shape.
- Piece order is deterministic but unspecified — style pieces by iterating, not by assuming which index is which.
- Labels survive: pieces keep the subject's `as segment(...)` / `as endpoint(...)` names on their surviving boundary fragments, and every healed seam edge carries the automatic segment label `cut` (query the seams with `segmentAll('cut')`). The cutter's own labels do not propagate. See [Labels Survive Derived Paths](#segment-labels-labels-survive-derived-paths).

**Tolerances and fidelity**

- A cutter endpoint that lands on the subject's boundary — or close to it — snaps onto the boundary and completes the cut there (a T-junction). "Close" means about half a unit for typical viewBox-scale drawings, growing with the drawing's size (`max(0.5, bounding-box diagonal × 0.001)`) — so on very small coordinate systems the snap is proportionally generous. The same snapping applies when a stroke passes through a subject vertex.
- All curve types are preserved through the cut; the healed edges follow the cutter's own geometry.

**Strokes that don't cut**

- A stroke that ends deep inside the shape without reaching the far boundary does not cut — that stroke is ignored and the region stays whole. Cutting never invents geometry beyond the tolerance snap.
- A stroke that only grazes the boundary tangentially, or runs collinear along an edge, also leaves the shape whole.
- Portions of the cutter outside the shape (or inside a hole) are ignored.
- A cutter that never touches the shape — or has no drawable strokes at all — returns a single-element array containing the original. Cutting an empty PathBlock returns an empty array.

**Compound cases**

- Strokes crossing each other inside the shape subdivide it together: an X of two strokes produces four pieces from one region.
- A subject mixing closed and open subpaths returns both kinds of pieces: healed closed pieces for the closed contours, open fragments for the open ones.
- In rare degenerate cases — a fragment that can't be traced cleanly, or a sliver thinner than the geometric tolerance — `cut()` drops the fragment and emits a `[warn]` entry in the log output rather than failing.

## Font Integration

Font integration lets you convert text characters into PathBlock values — turning each glyph into vector paths you can draw, transform, sample, and combine with boolean operations.

### @font Directive

The `@font` directive declares a font for use in the program. It must appear at the top level (not inside a function or block).

```
@font "Inter";
@font "Roboto Mono" 700;
@font "./fonts/CustomFont.ttf";
```

The source can also be a variable, as long as it is a top-level `let` bound to a plain string literal:

```
let family = "Inter";

@font family;
@font family 700;
```

**Syntax:**

```
@font "family-or-path" [weight];
@font <variable> [weight];
```

| Part | Required | Description |
|------|----------|-------------|
| Source | Yes | Font family name (e.g., `"Inter"`), file path (e.g., `"./fonts/Custom.ttf"`), or a top-level `let` variable bound to a string literal |
| Weight | No | Numeric weight 100–900 (default: 400) |

Because fonts are loaded by the host environment *before* the program runs, a variable source must be resolvable statically: a top-level `let` whose value is a plain string literal. Referencing anything else fails with:

```
@font directive references 'x', which is not a top-level string variable.
Declare it at the top level: let x = "Family Name";
```

**Font loading by environment:**

- **CLI**: Loads from local file paths (relative to source file), or resolves family names against font files on disk. Named lookup searches, in order: any directories in the `PATHOGEN_FONT_DIRS` environment variable (colon-separated), a `fonts/` directory found by walking up from the source file (so a project-local font mirror works from anywhere in the repo), and the system font directories (`/Library/Fonts`, `/System/Library/Fonts`, `~/Library/Fonts` on macOS; equivalent paths on Linux/Windows). Files are matched by the Google Fonts naming convention — `@font "Playfair Display" 700;` finds `PlayfairDisplay-Bold.ttf` — so a family name that works in the playground also compiles in the CLI when the font file is mirrored locally.
- **Playground**: Fetches from Google Fonts CDN automatically. Google serves large fonts split into per-script subsets (a Korean family like `"Nanum Gothic"` or `"Moirai One"` ships as ~100 small slices); the playground loads the Latin subset up front and fetches additional slices automatically when the text you render needs them — no extra directives required

The directive is declarative metadata — the host environment loads fonts before compilation begins. If a font cannot be found, the CLI logs a warning and compilation continues; in the playground it is a compile error (what counts as "cannot be found" is explained below).

**Curated families vs. any Google Font (playground)**

The playground's font picker — opened by clicking the `font-family` value in the inspector — lists about 100 popular families: the *curated list*. `@font` is not limited to it. It accepts **any family published on [Google Fonts](https://fonts.google.com)**, so a display face that never appears in the picker still works — browse the catalog and paste the family name:

```
@font "Gravitas One";
```

The difference between the two tiers is what the playground knows about a family: it has the curated families' weight lists; for any other family it must ask Google.

| | In the curated list | Not in the curated list |
|---|---------------------|-------------------------|
| **Loading** | Loads silently | Loads, plus a dismissible warning: `"Gravitas One" is not in the curated font list; loaded directly from Google Fonts.` |
| **Unavailable weight** | Snapped to the nearest known weight *before* any request — `@font "Baumans" 900;` loads its only weight, 400 | The requested weight is tried first; if Google rejects it, the playground *retries* without a weight and takes Google's default: `Gravitas One does not provide weight 700 on Google Fonts; using its default weight 400` |
| **Family can't be served** | Compile error reporting the CDN's reason | Compile error. The name may be wrong *or* the network request may have failed — the browser cannot read Google's error details across origins. Check the spelling at [Google Fonts](https://fonts.google.com) |

Warnings appear in the workspace's dismissible warning banner and never stop compilation. Weight substitution applies to both `@font` weights and `font-weight` in a style block. Other font-loading failures are also compile errors: a CSS generic family (`@font "sans-serif";` — generics can't be fetched from Google Fonts, even though the picker lists them), an unresolvable variable (shown above), or a malformed directive. See [Error cases](#path-blocks-error-cases) for `fromGlyph`-specific errors.

A variable source pairs naturally with style blocks, letting a single declaration drive both the font load and the styles that use it:

```
let family = "Inter";

@font family;

let styles = ${
  font-family: `${family}`;
  font-size: 48;
};
```

### PathBlock.fromGlyph(text, styles)

Converts text into an array of PathBlock values — one per character. Each PathBlock contains the glyph's vector outline as relative path commands.

```
@font "Inter";

let glyphs = PathBlock.fromGlyph("A", ${ font-family: Inter; font-size: 48; });

M 50 100
glyphs[0].draw()
```

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| `text` | string | Characters to convert (each becomes a separate PathBlock) |
| `styles` | style block | Must contain `font-family`; optionally `font-size` (default 16) and `font-weight` (default 400) |

**Returns:** Array of PathBlock values. Each element has all standard PathBlock properties and methods (`draw()`, `project()`, `get()`, `tangent()`, `boundingBox()`, `scale()`, boolean operations, etc.).

```
@font "Inter";
let styles = ${ font-family: Inter; font-size: 48; };
let glyphs = PathBlock.fromGlyph("Hi", styles);
log(glyphs.length);    // 2
```

### advanceWidth

Each glyph PathBlock has an `.advanceWidth` property — the horizontal distance to advance the cursor after drawing the glyph. This enables manual text layout:

```
@font "Inter";
let styles = ${ font-family: Inter; font-size: 48; };
let glyphs = PathBlock.fromGlyph("Hello", styles);

let x = 10;
let y = 100;
for (g in glyphs) {
  M x y
  g.draw()
  x = calc(x + g.advanceWidth);
}
```

Note the plain assignment `x = calc(...)` — a `let` inside the loop body would declare a fresh per-iteration variable that shadows the outer `x`, so the cursor would never advance.

Space characters return an empty PathBlock (no path commands) but still have a non-zero `advanceWidth`.

### Glyph provenance and character classes

Each glyph PathBlock records where it came from and whether it drew anything:

| Property | Type | Description |
|---|---|---|
| `char` | `string` | The source character this glyph was generated from (1 character) |
| `codePoint` | `number` | The Unicode code point of `char` (e.g. `32` for a space, `12288` for the ideographic space `U+3000`) |
| `isWhitespace` | `boolean` | `true` when the source character is whitespace (space, tab, newline, …) |
| `isSpace` | `boolean` | `true` for every whitespace character that is not a tab or a line break — regular space, no-break space, ideographic space `U+3000`, en/em/thin spaces, and the zero-width no-break space `U+FEFF` |
| `isTab` | `boolean` | `true` for the tab character `U+0009` |
| `isNewline` | `boolean` | `true` for line-break characters — `\n`, `\r`, vertical tab, form feed, and the Unicode line/paragraph separators `U+2028`/`U+2029` |
| `isMark` | `boolean` | `true` for combining marks — accents and vowel signs that overlay the previous glyph (see below) |
| `isEmpty` | `boolean` | `true` when the glyph produced no outline commands (spaces, and other outline-less characters) |

`char`, `codePoint`, and the `is*` classifications exist only on glyphs produced by `fromGlyph` — reading them on any other PathBlock is an error. `isEmpty` works on every PathBlock (and ProjectedPath).

Use `isNewline` to honor hard line breaks during layout:

```
@font "Inter";
let styles = ${ font-family: Inter; font-size: 48; };
let glyphs = PathBlock.fromGlyph("Hello\nworld", styles);

let marginX = 10;
let x = marginX;
let y = 60;
let lineHeight = 56;
for (g in glyphs) {
  if (g.isNewline) {
    y = calc(y + lineHeight);
    x = marginX;
    continue;
  }
  if (!g.isWhitespace) {
    M x y
    g.draw()
  }
  x = calc(x + g.advanceWidth);
}
```

`isSpace`, `isTab`, and `isNewline` partition `isWhitespace` exactly: every whitespace character is exactly one of the three, and a non-whitespace character is none of them. That is what makes the loop above safe — a whitespace glyph that is not a newline can only be a space or a tab, and both just advance the cursor. Two caveats worth knowing:

- **Tabs are not tab stops.** A tab has no glyph in most fonts, so its `advanceWidth` is the font's placeholder-box width — commonly about half an em — not a jump to the next tab column. If tab stops matter, branch on `isTab` and compute the next stop yourself (or expand tabs to spaces before calling `fromGlyph`).
- **Windows line endings.** `\r\n` is two characters, both `isNewline`; break-once code should treat a `\r` followed by `\n` as one break or normalize the input string first.

`isWhitespace` and `isEmpty` are not the same test, in either direction: `isWhitespace` classifies the *source character*, while `isEmpty` reports whether the *outline* is blank. An unmapped control character can be empty without being whitespace — and whitespace can be non-empty: a tab or newline has no glyph in most fonts, so it renders the font's placeholder box (some fonts' placeholder has a visible outline, some don't). That is why the layout example above skips on `isWhitespace`, not `isEmpty`.

`isMark` matters whenever you add your own spacing: a combining mark must stay on top of its base glyph, so never insert tracking (or a line break) between a base and its mark:

```
@font "Inter";
let styles = ${ font-family: Inter; font-size: 48; };
// Decomposed "é": "e" followed by the combining acute U+0301 (code point 769)
let glyphs = PathBlock.fromGlyph("é", styles);
log(glyphs[1].isMark);      // true
log(glyphs[1].codePoint);   // 769

let tracking = 6;
let x = 10;
for (g in glyphs) {
  M x 60
  g.draw()
  x = calc(x + g.advanceWidth);
  if (!g.isMark) {
    x = calc(x + tracking);  // letter-space after base glyphs only —
  }                          // never between a base and its combining mark
}
```

#### Scripts and Unicode notes

- **Newlines are universal.** Every script — Latin, Arabic, Hangul, CJK, Devanagari — uses the same Unicode line-break characters, so `isNewline` works identically for all of them. (One deliberate exclusion: the rare legacy NEL character `U+0085` is not `isNewline` — it is not `isWhitespace` either, and the three classes always partition `isWhitespace` exactly.)
- **Spaces are more than `U+0020`.** `isSpace` also covers the no-break space, the ideographic (full-width) space `U+3000` used in CJK text, and the typographic en/em/thin spaces — so CJK spacing works without special cases. Note that Chinese, Japanese, and Thai text does not separate words with spaces at all; space-based word handling only applies to scripts that use spaces.
- **Zero-width space is not whitespace.** `U+200B`, the break-opportunity character often used in CJK and Thai text, is a format character: every `is*` member here is `false` for it (it renders as an invisible zero-advance glyph). Detect it with `g.codePoint == 8203` if your layout should treat it as a break opportunity.
- **Combining marks overlay, they don't advance.** Characters like Arabic harakat, Hebrew niqqud, Thai vowel signs, or a decomposed accent (`e` + `◌́`) are *combining marks*: they render on top of the previous base glyph and typically have little or no `advanceWidth`. Use `isMark` to detect them and keep them attached to the preceding glyph (see the tracking example above).
- **No contextual shaping.** `fromGlyph` looks up one glyph per character, so scripts that reshape letters by position — Arabic's isolated/initial/medial/final forms — render each letter in its isolated form. Full shaping is outside `fromGlyph`'s per-character model.
- **`codePoint` is the escape hatch.** For any classification not covered above, compare code points directly, e.g. `if (g.codePoint == 12288) { … }` to detect the ideographic space `U+3000` (Pathogen number literals are decimal, so write the code point in decimal).

### contours

Glyphs with multiple contours (e.g., "O" has an outer ring and inner hole) can be decomposed with the `.contours` property. This returns an array of PathBlock values, one per contour:

```
@font "Inter";
let styles = ${ font-family: Inter; font-size: 48; };
let glyphs = PathBlock.fromGlyph("O", styles);
let contours = glyphs[0].contours;
log(contours.length);              // 2 (outer + inner)

for (c in contours) {
  c.drawTo(100, 100)
}
```

Each contour is a closed PathBlock with all standard properties and methods.

### Non-Latin text and missing glyphs

`fromGlyph` handles any script the font provides glyphs for — Hangul, Cyrillic, Greek, kana, and so on:

```
@font "Nanum Gothic";
let styles = ${ font-family: "Nanum Gothic"; font-size: 48; };
let glyphs = PathBlock.fromGlyph("안녕하세요", styles);
```

In the playground, the extra script subsets are fetched automatically on the first compile that needs them (see the `@font` directive above).

When a character has **no glyph in the font at all** — for example Hangul text with a Latin-only family, or an emoji — the glyph renders as the font's placeholder box and a warning is logged to the console pane:

```
[warn] Font 'Inter' (weight 400) has no loaded glyph for: 한 — rendered as placeholder boxes
```

The program still compiles; the warning tells you the font itself lacks those characters, so switch to a family that covers the script. `TextBlock.toPathBlock()` reports missing glyphs the same way.

### Error cases

| Condition | Error message |
|-----------|---------------|
| Wrong number of arguments | `PathBlock.fromGlyph() expects 2 arguments (text, styles)` |
| First argument not a string | `PathBlock.fromGlyph() first argument must be a string` |
| Second argument not a style block | `PathBlock.fromGlyph() second argument must be a style block` |
| Style block missing font-family | `PathBlock.fromGlyph() requires font-family in style block` |
| No fonts loaded | `PathBlock.fromGlyph() requires font data, but no fonts were loaded. If you wrote an @font directive, font loading may have failed earlier — look for a preceding font-loading error.` |
| Font not in registry | `Font 'X' not found in font registry. Available fonts: [list]` |

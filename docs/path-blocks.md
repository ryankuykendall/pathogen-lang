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

Returns the point and tangent angle (radians) at fraction `t`. The angle is the direction of travel.

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

### `offset(distance)` → PathBlock / ProjectedPath

Creates a parallel path offset by `distance` units. Positive values offset to the left of the travel direction, negative to the right.

```
let p = @{ h 60 v 40 };
let outer = p.offset(5);     // 5 units left of travel
let inner = p.offset(-5);    // 5 units right of travel
```

Offset preserves curve types — cubic Béziers produce offset cubics, arcs produce offset arcs with adjusted radii. Segment joins use miter joins with a limit of 4× the offset distance.

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

For `mirror()` on a ProjectedPath, the mirror line passes through the projection's start point. For `rotateAtVertexIndex()`, the rotation center is the absolute vertex position.

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

The `<<` operator also works for [style block merging](#syntax-style-blocks). The operand types must match — mixing PathBlocks and style blocks throws an error.

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

Boolean operations combine two closed paths using set operations. Both paths must be closed (end with `z` or have coincident start and end points). The result preserves original curve types — no linearization.

See also: [Standard Library path functions](#stdlib-path-functions) for creating shapes to use with boolean operations.

### `union(other)` → PathBlock

Combines two paths into their union (outer boundary):

```
let a = @{ circle(30) };
let b = @{ circle(30) };
let combined = a.project(50, 50).union(b.project(70, 50));
```

### `difference(other)` → PathBlock

Subtracts `other` from the path:

```
let plate = @{ circle(40) };
let hole = @{ circle(15) };
let result = plate.project(50, 50).difference(hole.project(50, 50));
```

### `intersection(other)` → PathBlock

Returns only the overlapping region:

```
let a = @{ circle(30) };
let b = @{ circle(30) };
let overlap = a.project(50, 50).intersection(b.project(70, 50));
```

### `xor(other)` → PathBlock

Returns the symmetric difference — everything in either path but not both:

```
let a = @{ circle(30) };
let b = @{ circle(30) };
let exclusive = a.project(50, 50).xor(b.project(70, 50));
```

### Requirements and behavior

- Both paths must be closed. Open paths throw an error.
- The `other` argument can be a PathBlock or ProjectedPath.
- Multi-component results produce multiple subpaths (`M...z M...z`).
- All curve types (lines, cubics, quadratics, arcs) are preserved through the operation.
- Results are always returned as PathBlock values (normalized to `(0, 0)` origin).

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

- **CLI**: Loads from local file paths (relative to source file) or searches system font directories (`/Library/Fonts`, `/System/Library/Fonts`, `~/Library/Fonts` on macOS; equivalent paths on Linux/Windows)
- **Playground**: Fetches from Google Fonts CDN automatically

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
  let x = calc(x + g.advanceWidth);
}
```

Space characters return an empty PathBlock (no path commands) but still have a non-zero `advanceWidth`.

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

### Error cases

| Condition | Error message |
|-----------|---------------|
| Wrong number of arguments | `PathBlock.fromGlyph() expects 2 arguments (text, styles)` |
| First argument not a string | `PathBlock.fromGlyph() first argument must be a string` |
| Second argument not a style block | `PathBlock.fromGlyph() second argument must be a style block` |
| Style block missing font-family | `PathBlock.fromGlyph() requires font-family in style block` |
| No fonts loaded | `PathBlock.fromGlyph() requires font data, but no fonts were loaded. If you wrote an @font directive, font loading may have failed earlier — look for a preceding font-loading error.` |
| Font not in registry | `Font 'X' not found in font registry. Available fonts: [list]` |

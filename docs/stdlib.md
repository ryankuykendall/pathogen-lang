# Standard Library Reference

pathogen-lang includes built-in functions for math operations and common SVG shapes.

## Math Functions

### Trigonometry

All trigonometric functions use radians.

| Function | Description |
|----------|-------------|
| `sin(x)` | Sine |
| `cos(x)` | Cosine |
| `tan(x)` | Tangent |
| `asin(x)` | Arc sine |
| `acos(x)` | Arc cosine |
| `atan(x)` | Arc tangent |
| `atan2(y, x)` | Two-argument arc tangent |

```
// Draw a point on a circle
let angle = 0.5;
let r = 50;
M calc(100 + cos(angle) * r) calc(100 + sin(angle) * r)
```

### Angle Conversion

| Function | Description |
|----------|-------------|
| `rad(degrees)` | Convert degrees to a plain number of radians |
| `deg(radians)` | Convert radians to a plain number of degrees |

```
// Use degrees instead of radians
let angle = rad(45);
M calc(cos(angle) * 50) calc(sin(angle) * 50)
```

These return **plain numbers**, not [Angle values](#syntax-angle-units) — handy when a bare number is what you want (e.g. in a template literal). For carrying an angle through your program, an angle-suffixed literal (`45deg`) does the same job and keeps its unit; its `.deg`/`.rad` members cover most conversion needs.

### Exponential & Logarithmic

| Function | Description |
|----------|-------------|
| `exp(x)` | e raised to power x |
| `log(x)` | Natural logarithm |
| `log10(x)` | Base-10 logarithm |
| `log2(x)` | Base-2 logarithm |
| `pow(x, y)` | x raised to power y |
| `sqrt(x)` | Square root |
| `cbrt(x)` | Cube root |

### Rounding

| Function | Description |
|----------|-------------|
| `floor(x)` | Round down |
| `ceil(x)` | Round up |
| `round(x)` | Round to nearest integer |
| `trunc(x)` | Truncate decimal part |

### Utility

| Function | Description |
|----------|-------------|
| `abs(x)` | Absolute value |
| `sign(x)` | Sign (-1, 0, or 1) |
| `min(a, b, ...)` | Minimum value |
| `max(a, b, ...)` | Maximum value |

### Interpolation & Clamping

| Function | Description |
|----------|-------------|
| `lerp(a, b, t)` | Linear interpolation: `a + (b - a) * t` |
| `clamp(value, min, max)` | Constrain value to range |
| `map(value, inMin, inMax, outMin, outMax)` | Map value from one range to another |
| `smoothstep(edge0, edge1, x)` | Hermite ease from 0 to 1 as `x` crosses from `edge0` to `edge1` |

```
// Interpolate between two positions
let t = 0.5;
M calc(lerp(0, 100, t)) calc(lerp(0, 50, t))

// Clamp a value
let x = clamp(150, 0, 100);  // Result: 100

// Ease a width profile in over the first quarter of a stroke
let w = smoothstep(0, 0.25, t);  // t = 0.5 → 1 (fully eased in)
```

`smoothstep` uses the GLSL argument order and formula: `x` is clamped into
the `[edge0, edge1]` range as `t = clamp((x - edge0) / (edge1 - edge0), 0, 1)`,
then eased as `t * t * (3 - 2 * t)`. The result rises smoothly from 0 to 1
with zero slope at both edges. Values of `x` outside the range saturate at
0 or 1. Swapping the edges reverses the ramp — GLSL leaves that case
undefined; Pathogen defines and tests it. When `edge0 === edge1` the ramp
collapses to a hard step: 0 for `x` below the edge, 1 above it, and `NaN`
exactly at `x === edge0`.

### Constants

| Function | Returns |
|----------|---------|
| `PI()` | 3.14159... |
| `E()` | 2.71828... |
| `TAU()` | 6.28318... (2π) |
| `mpi(x)` | `x * π` (multiply by π) |

```
// Draw a semicircle
let r = 50;
for (i in 0..20) {
  let angle = calc(i / 20 * PI());
  L calc(100 + cos(angle) * r) calc(100 + sin(angle) * r)
}
```

### Random

| Function | Description |
|----------|-------------|
| `random()` | Random number between 0 and 1 |
| `randomRange(min, max)` | Random number in range |

**Note**: Random functions are not deterministic. Each call produces a
different value, and recompiling the same program produces different output.
For reproducible randomness use `hash01(i)` with a loop or element index
(see [Hash & Noise](#stdlib-hash-noise)).

### Hash & Noise

Deterministic randomness: the same inputs always produce the same output, so
recompiles are repeatable and a "seed" is just another argument. Hash lands
first; a continuous `noise()` companion follows.

| Function | Description |
|----------|-------------|
| `hash01(n, seed?)` | Deterministic hash of integer `n` to `[0, 1)`; `seed` defaults to 0 |

```
// Jittered tick marks — identical on every recompile
for (i in 0..18) {
  let x = i * 10 + hash01(i) * 4;
  M x 0
  L x calc(10 + hash01(i, 1) * 20)
}
```

**Determinism.** `hash01` is built entirely from integer bit-mixing and
exactly-specified IEEE arithmetic — no trigonometry — so it returns the
identical value for identical arguments on every machine and JavaScript
engine: CLI, playground, and VS Code preview agree, today and on every
future recompile. The hash constants are a fixed contract; changing them
would be a breaking change.

**Seeds.** The optional `seed` (default 0, so `hash01(i)` is `hash01(i, 0)`)
selects an independent stream: `hash01(i, 0)` and `hash01(i, 1)` are two
unrelated sequences over the same indices. Use it to give each layer or
element family its own randomness — `hash01(i, layerIndex)` — instead of
ad-hoc arithmetic like `hash01(i * 7 + layerIndex * 1013)`.

**Integers only.** Both `n` and `seed` are truncated to 32-bit integers
before hashing: `hash01(0.9)` equals `hash01(0)`, and non-finite inputs
(`NaN`, `Infinity`) truncate to 0 rather than propagating. Smoothly varying
a *continuous* input is what `noise()` is for — it joins this section
shortly.

**vs. Cycler.** `Cycler` (below) is the other deterministic tool: it assigns
values round-robin by call order, while `hash01` assigns them positionally
by index.

### Cycler

A `Cycler` wraps an array and cycles through it sequentially via `.pick()`, returning to the beginning after reaching the end. Useful for deterministic round-robin assignment of colors, layer names, styles, etc.

#### Cycler(array, shuffle?)

Creates a cycler from an array. If the optional `shuffle` argument is truthy, the array is shuffled once at construction (the shuffled order is stable across all cycles).

```
let c = Cycler(['red', 'green', 'blue']);
c.pick()  // 'red'
c.pick()  // 'green'
c.pick()  // 'blue'
c.pick()  // 'red' (wraps around)
```

```
// Shuffled cycler — stable order across wraps
let r = Cycler(['a', 'b', 'c'], true);
```

#### .pick()

Returns the next element in the cycle, advancing the internal index. Wraps around to the beginning after the last element.

#### .length

Returns the number of items in the cycler.

```
let c = Cycler([1, 2, 3]);
log(c.length);  // 3
```

### PolarVector

A `PolarVector` represents a direction and distance in polar coordinates. It is used to define bezier control point positions relative to anchor points — you specify "which direction and how far" rather than computing absolute x, y coordinates.

#### PolarVector(angle, distance)

Creates a polar vector. Angle is in radians (use `rad()` or `deg` suffix for degrees).

```
let pv = PolarVector(0.25 * PI(), 30);
let pv2 = PolarVector(rad(45), 30);      // equivalent
```

#### .angle

Returns the angle as a **plain number** in radians (not an [Angle value](#syntax-angle-units)).

#### .distance

Returns the distance.

#### .turn(deltaAngle)

Returns a new PolarVector with the angle rotated by `deltaAngle`. Distance is unchanged.

```
let pv = PolarVector(0, 20);
let turned = pv.turn(0.5 * PI());  // angle is now π/2, distance still 20
```

#### .scale(factor)

Returns a new PolarVector with the distance multiplied by `factor`. Angle is unchanged.

```
let pv = PolarVector(0, 20);
let wider = pv.scale(1.5);  // angle still 0, distance is now 30
```

#### .mirror()

Returns a new PolarVector with the angle rotated by π (180°). Distance is unchanged. This is the key operation for achieving C1 (smooth) continuity when chaining bezier curves — the outgoing handle mirrors the incoming handle.

```
let pv = PolarVector(0.25 * PI(), 20);
let mirrored = pv.mirror();  // angle is now 1.25π, distance still 20
```

---

## Path Functions

These functions generate complete path segments.

### circle(cx, cy, r)

Draws a circle centered at (cx, cy) with radius r.

```
circle(100, 100, 50)
```

Output: A full circle using two arc commands.

### rect(x, y, width, height)

Draws a rectangle.

```
rect(10, 10, 80, 60)
```

### roundRect(x, y, width, height, radius)

Draws a rectangle with rounded corners.

```
roundRect(10, 10, 80, 60, 10)
```

### polygon(cx, cy, radius, sides)

Draws a regular polygon.

```
polygon(100, 100, 50, 6)  // Hexagon
polygon(100, 100, 50, 8)  // Octagon
```

### star(cx, cy, outerRadius, innerRadius, points)

Draws a star shape.

```
star(100, 100, 50, 25, 5)  // 5-pointed star
```

### line(x1, y1, x2, y2)

Draws a line segment.

```
line(0, 0, 100, 100)
```

### arc(rx, ry, rotation, largeArc, sweep, x, y)

Draws an arc to (x, y). This is a direct wrapper around the SVG `A` command.

```
M 50 100
arc(50, 50, 0, 1, 1, 150, 100)
```

### quadratic(x1, y1, cx, cy, x2, y2)

Draws a quadratic bezier curve from (x1, y1) to (x2, y2) with control point (cx, cy).

```
quadratic(0, 100, 50, 0, 100, 100)
```

### cubic(x1, y1, c1x, c1y, c2x, c2y, x2, y2)

Draws a cubic bezier curve.

```
cubic(0, 100, 25, 0, 75, 0, 100, 100)
```

### polarCubicBezier(start, pv1, pv2, end)

Draws a cubic bezier curve where control points are defined as polar vectors relative to the start and end points. `start` and `end` are `Point` values; `pv1` and `pv2` are `PolarVector` values.

- **pv1** — direction and distance from `start` to the first control point
- **pv2** — direction and distance from `end` to the second control point

```
let a = Point(0, 100);
let b = Point(100, 100);
polarCubicBezier(a, PolarVector(rad(-60), 40), PolarVector(rad(-120), 40), b)
```

Output: `m` (relative move) followed by `c` (relative cubic) — matches the spline function convention.

PolarVector methods compose naturally for handle manipulation:

```
let handle = PolarVector(rad(-45), 30);
// Symmetric curve: mirror the handle for the other end
polarCubicBezier(a, handle, handle.mirror(), b)

// Wider version: scale the handle distance
polarCubicBezier(a, handle.scale(1.5), handle.mirror().scale(1.5), b)
```

### moveTo(x, y)

Returns a move command. Useful inside functions.

```
moveTo(50, 50)
```

### lineTo(x, y)

Returns a line command.

```
lineTo(100, 100)
```

### closePath()

Returns a close path command.

```
closePath()
```

### cubicSpline(points)

Draws a chain of cubic bezier curves with explicit tangent angle and handle length at each point. Adjacent curves share a common tangent direction at join points, guaranteeing G1 (smooth) continuity.

**Point schema:**

| Property | Type | Description |
|----------|------|-------------|
| `x` | number | X coordinate |
| `y` | number | Y coordinate |
| `angle` | number | Tangent angle (radians; use `rad()` or `deg` suffix for degrees) |
| `exit` | number | Distance from point along tangent to outgoing control point (omit on last point) |
| `entry` | number | Distance backward along tangent to incoming control point (omit on first point) |

```
cubicSpline([
  { x: 0, y: 100, angle: 0, exit: 30 },
  { x: 50, y: 0, angle: 0, entry: 20, exit: 25 },
  { x: 100, y: 100, angle: 0, entry: 30 }
])
```

Output: `m` (relative move) followed by one `c` (relative cubic) command per segment. A single-point array emits only `m`. All spline functions use relative commands so they work naturally inside path blocks.

### quadSpline(start, points, end)

Draws a chain of quadratic bezier curves with implicit angle derivation. Only the start point specifies an explicit angle; intermediate points derive their tangent angle from the geometry of the previous control point.

**Start:** `{ x, y, angle, exit }`
**Intermediate:** `{ x, y, exit }`
**End:** `{ x, y }`

```
quadSpline(
  { x: 0, y: 0, angle: 0, exit: 30 },
  [{ x: 60, y: 0, exit: 30 }],
  { x: 120, y: 0 }
)
```

Output: `m` followed by one `q` (relative quadratic) command per segment.

### clippedQuadSpline(start, points, end)

Extends `quadSpline` by splitting the implicit shared control point into two cubic control points using time-based fractions (`exitTime`/`entryTime`). This allows dampening curve eccentricity while preserving the quadratic geometry.

**Start:** `{ x, y, angle, exit, exitTime }`
**Intermediate:** `{ x, y, exit, exitTime, entryTime }`
**End:** `{ x, y, entryTime }`

- `exitTime = 1`, `entryTime = 1`: mathematically equivalent to quadratic
- `exitTime = 0.5`, `entryTime = 0.5`: control points at half arm length (moderate dampening)
- `exitTime = 0`, `entryTime = 0`: linear segments

```
clippedQuadSpline(
  { x: 0, y: 0, angle: 0, exit: 100, exitTime: 0.5 },
  [],
  { x: 200, y: 0, entryTime: 0.5 }
)
```

Output: `m` followed by one `c` (relative cubic) command per segment — not `q`.

### Grid Functions

These functions generate complete grid patterns as path segments. Each accepts a `GridPatternType` enum (or string) that controls the visual style:

> **Not to be confused with** the [`Grid()`](#grid-grid) constructor — that's a data container for 2D values mapped to canvas coordinates (flow fields, heatmaps, sampling). The functions below produce SVG path data for visual lattices.


| Pattern | Description |
|---------|-------------|
| `GridPatternType.Shape` (`'shape'`) | Cell outlines — full grid lines |
| `GridPatternType.Dot` (`'dot'`) | Small circles at grid vertices |
| `GridPatternType.Intersection` (`'intersection'`) | Small cross marks at grid vertices |
| `GridPatternType.Partial` (`'partial'`) | Centered partial segments on each edge |

#### squareGrid(type, x, y, width, height, cellSize)

Generates a square grid pattern within the bounding rectangle starting at (x, y).

- `type` — `GridPatternType` enum value or string (`'shape'`, `'dot'`, `'intersection'`, `'partial'`)
- `x, y` — Top-left origin of the grid
- `width, height` — Bounding dimensions
- `cellSize` — Side length of each square cell

The grid contains `floor(width / cellSize)` columns and `floor(height / cellSize)` rows. Extra space is ignored.

```
gridLayer.apply {
  squareGrid(GridPatternType.Shape, 0, 0, 200, 200, 20);
}
```

#### triangleGrid(type, x, y, width, height, cellSize)

Generates an equilateral triangle grid. `cellSize` is the triangle height (altitude). Triangles have flat bases with alternating up/down orientation.

```
gridLayer.apply {
  triangleGrid(GridPatternType.Shape, 0, 0, 200, 200, 20);
}
```

The triangle side length is derived from the height: `side = 2 * cellSize / sqrt(3)`.

#### hexagonGrid(type, x, y, width, height, cellSize, orientation?)

Generates a hexagonal grid. `cellSize` is the flat-to-flat height of each hexagon.

- `orientation` — Optional. `HexagonOrientation.Edge` (default, flat-top) or `HexagonOrientation.Vertex` (pointy-top)

```
// Flat-top hexagons (default)
gridLayer.apply {
  hexagonGrid(GridPatternType.Shape, 0, 0, 200, 200, 20);
}

// Pointy-top hexagons
gridLayer.apply {
  hexagonGrid(GridPatternType.Shape, 0, 0, 200, 200, 20, HexagonOrientation.Vertex);
}
```

#### Usage with Layers and Transforms

Grid functions return path data and are typically used inside `layer.apply {}` blocks. Rotation and styling are handled via the layer:

```
let gridStyles = ${ stroke: #88f; stroke-width: 0.25; fill: none; };
let gridLayer = PathLayer('grid') << gridStyles;

gridLayer.ctx.transform.rotate.set(0.125pi);
gridLayer.apply {
  squareGrid(GridPatternType.Partial, 0, 0, 400, 400, 20);
}
```

A convenience wrapper for one-line grid drawing:

```
fn drawGridToLayer(layer, gridFn, type, angle, x, y, w, h, s) {
  layer.ctx.transform.rotate.set(angle);
  layer.apply { gridFn(type, x, y, w, h, s); }
}
```

---

## Context-Aware Functions

These functions use the current path context (position, tangent direction) to generate path segments. They maintain path continuity and are ideal for building complex shapes programmatically.

### Polar Movement

#### polarPoint(angle, distance)

Returns a point at a polar offset from current position. Does not emit any path commands.

```
M 100 100
let p = polarPoint(0, 50);
L p.x p.y  // Line to (150, 100)
```

#### polarOffset(angle, distance)

Returns `{x, y}` coordinates at a polar offset. Similar to `polarPoint`.

#### polarMove(angle, distance)

Emits a line command (`L`) moving in the specified direction. Updates position but draws a visible line.

```
M 100 100
polarMove(0, 50)  // Draws line to (150, 100)
```

#### polarLine(angle, distance)

Emits a line command (`L`) in the specified direction. Same as `polarMove`.

```
M 100 100
polarLine(45deg, 70.7)  // Draws line diagonally
```

### Arc Functions

#### arcFromCenter(dcx, dcy, radius, startAngle, endAngle, clockwise)

Draws an arc defined by center offset and angles. Returns `{point, angle}` with endpoint and tangent.

- `dcx, dcy`: Offset from current position to arc center
- `radius`: Arc radius
- `startAngle, endAngle`: Start and end angles in radians
- `clockwise`: 1 for clockwise, 0 for counter-clockwise

**Warning:** If current position doesn't match the calculated arc start point, a line segment (`L`) will be drawn to the arc start. For guaranteed continuous arcs, use `arcFromPolarOffset`.

```
M 50 50
arcFromCenter(50, 0, 50, 180deg, 270deg, 1)
// Center at (100, 50), arc from (50, 50) to (100, 100)
```

#### arcFromPolarOffset(angle, radius, angleOfArc)

Draws an arc where the center is at a polar offset from current position. The current position is guaranteed to be on the circle, so only an `A` command is emitted (no `M` or `L`). Returns `{point, angle}` with endpoint and tangent.

- `angle`: Direction from current position to arc center (radians)
- `radius`: Arc radius
- `angleOfArc`: Sweep angle (positive = clockwise, negative = counter-clockwise)

This function is ideal for creating continuous curved paths because it never emits extra line segments.

```
M 100 100
arcFromPolarOffset(0, 50, 90deg)
// Center at (150, 100), sweeps 90° clockwise
// Ends at (150, 50)
```

**Comparison with arcFromCenter:**

| Aspect | arcFromCenter | arcFromPolarOffset |
|--------|---------------|-------------------|
| Center defined by | Offset from current position | Polar direction from current position |
| Start point | Calculated from startAngle | Current position (guaranteed) |
| May emit L command | Yes, if position doesn't match | Never |
| Best for | Arcs with known center offset | Continuous curved paths |

### Heading Control

Angles follow SVG coordinate conventions: 0 is rightward, positive angles rotate clockwise (toward the positive y-axis, which points down in SVG).

#### heading(angle)

Sets the heading to an absolute angle. No command is emitted and the cursor does not move. This enables `tangentArc` and `tangentLine` immediately after `M` without needing a dummy segment like `h 0.01`.

```
M 50 100
heading(0)           // Set heading to rightward
tangentArc(20, 90deg) // Works immediately — no dummy segment needed
```

Inside [path blocks](#path-blocks-path-blocks), `heading()` avoids the offset artifacts that `h 0.01` causes with `z` closePath:

```
let cLike = @{
  heading(0)
  tangentArc(20, 90deg)
  tangentArc(20, -90deg)
  z  // Closes cleanly to start — no tiny offset
};
```

#### turn(delta)

Adds `delta` to the current heading (relative change). Requires an existing heading — either from `heading()` or from a previous drawing command. Negative deltas turn counter-clockwise.

```
M 50 100
heading(0)          // Start heading rightward
turn(90deg)         // Now heading downward
tangentLine(30)     // Draws 30px down
```

After drawing commands:

```
M 0 0  L 50 0      // Heading is 0 (rightward)
turn(45deg)         // Heading is now 45°
tangentLine(20)     // Continues at 45°
```

#### ctx.heading

The current heading (read-only), readable via the context object. Set by `heading()`, `turn()`, or any drawing command that establishes direction. `M` (moveTo) clears the heading.

```
M 0 0  L 50 0
log(ctx.heading)   // 0 (rightward)
heading(90deg)
log(ctx.heading)   // π/2 (downward)
M 200 200
log(ctx.heading)   // undefined (M clears the heading)
```

### Tangent Functions

These functions continue from the current heading. Any path command that establishes a direction — including native SVG commands (`L`, `H`, `V`, `C`, `S`, `Q`, `T`, `A`, `Z`) and stdlib path functions — sets a heading that `tangentLine` and `tangentArc` can follow.

You can also set the heading explicitly with `heading()`, adjust it with `turn()`, or read it via `ctx.heading`.

`M` (moveTo) clears the heading since a move does not establish a direction.

#### tangentLine(length)

Draws a line continuing in the tangent direction from the previous command.

```
arcFromPolarOffset(0, 50, 90deg)
tangentLine(30)  // Continues in the arc's exit direction
```

After native SVG commands:

```
M 50 100  L 150 100
tangentLine(30)  // Continues rightward to (180, 100)
```

#### tangentArc(radius, sweepAngle)

Draws an arc continuing tangent to the previous command.

```
arcFromPolarOffset(0, 50, 90deg)
tangentArc(30, 45deg)  // Smooth continuation with a smaller arc
```

After native SVG commands:

```
M 50 100  L 150 100
tangentArc(30, 90deg)  // Smooth arc curving down from the line's endpoint
```

---

---

## Color

The `Color` type provides first-class color manipulation in OKLCH color space. See the full [Color documentation](#color-color-type) for constructor forms, methods, properties, and examples.

```
let c = Color('#e63946');
let lighter = c.lighten(0.2);
let comp = c.complement();
```

---

## CSSVar

The `CSSVar` type creates CSS custom property references (`var()`) for use in style blocks. See the full [CSSVar documentation](#css-var-cssvar-type) for constructor forms, properties, and examples.

```
let fg = CSSVar('--foreground', '#333');
define PathLayer('main') ${ stroke: fg; }
```

---

## Using Functions Inside calc()

Math functions can be used inside `calc()`:

```
M calc(sin(0.5) * 100) calc(cos(0.5) * 100)
L calc(lerp(0, 100, 0.5)) calc(clamp(150, 0, 100))
```

Path functions are called at the statement level:

```
circle(100, 100, calc(25 + 25))  // calc() inside arguments
```

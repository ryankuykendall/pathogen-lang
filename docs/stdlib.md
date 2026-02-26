# Standard Library Reference

svg-path-extended includes built-in functions for math operations and common SVG shapes.

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
| `rad(degrees)` | Convert degrees to radians |
| `deg(radians)` | Convert radians to degrees |

```
// Use degrees instead of radians
let angle = rad(45);
M calc(cos(angle) * 50) calc(sin(angle) * 50)
```

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

```
// Interpolate between two positions
let t = 0.5;
M calc(lerp(0, 100, t)) calc(lerp(0, 50, t))

// Clamp a value
let x = clamp(150, 0, 100);  // Result: 100
```

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

**Note**: Random functions are not deterministic. Each call produces a different value.

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

### Tangent Functions

These functions continue from the previous drawing command's direction. Any path command that establishes a direction — including native SVG commands (`L`, `H`, `V`, `C`, `S`, `Q`, `T`, `A`, `Z`) and stdlib path functions — sets a tangent that `tangentLine` and `tangentArc` can follow.

`M` (moveTo) clears the tangent since a move does not establish a direction.

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

The `Color` type provides first-class color manipulation in OKLCH color space. See the full [Color documentation](color.md) for constructor forms, methods, properties, and examples.

```
let c = Color('#e63946');
let lighter = c.lighten(0.2);
let comp = c.complement();
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

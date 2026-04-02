# Syntax Reference

svg-path-extended is a superset of SVG path syntax that adds variables, expressions, control flow, functions, and [path blocks](#path-blocks-path-blocks).

## Path Commands

All standard SVG path commands are supported:

| Command | Name | Parameters |
|---------|------|------------|
| `M` / `m` | Move to | `x y` |
| `L` / `l` | Line to | `x y` |
| `H` / `h` | Horizontal line | `x` |
| `V` / `v` | Vertical line | `y` |
| `C` / `c` | Cubic bezier | `x1 y1 x2 y2 x y` |
| `S` / `s` | Smooth cubic | `x2 y2 x y` |
| `Q` / `q` | Quadratic bezier | `x1 y1 x y` |
| `T` / `t` | Smooth quadratic | `x y` |
| `A` / `a` | Arc | `rx ry rotation large-arc sweep x y` |
| `Z` / `z` | Close path | (none) |

Uppercase commands use absolute coordinates; lowercase use relative coordinates.

```
M 0 0 L 100 100 Z
```

## Variables

Declare variables with `let`:

```
let width = 200;
let height = 100;
let centerX = 100;
```

Use variables directly in path commands:

```
let x = 50;
let y = 75;
M x y L 100 100
```

**Note**: Single letters that are path commands (M, L, C, etc.) cannot be used as variable names.

## Strings and Template Literals

String values use double quotes:

```
let name = "World";
```

Template literals use backticks with `${expression}` interpolation:

```
let greeting = `Hello ${name}!`;          // "Hello World!"
let msg = `Score: ${2 + 3}`;             // "Score: 5"
let pos = `(${ctx.position.x}, ${ctx.position.y})`;
```

Template literals are the sole string construction mechanism — the `+` operator stays strictly numeric. String equality works with `==` and `!=`:

```
let mode = "dark";
if (mode == "dark") { /* ... */ }
if (mode != "light") { /* ... */ }
```

### `.length`

Returns the number of characters in the string:

```
let str = `Hello`;
log(str.length);  // 5
```

### `.empty()`

Returns `1` (truthy) if the string has no characters, `0` (falsy) otherwise:

```
let str = ``;
if (str.empty()) {
  // string is empty
}
```

### Index Access

Access individual characters by zero-based index using `[expr]`:

```
let str = `Hello`;
let first = str[0];   // "H"
let last = str[4];     // "o"
```

Out-of-bounds access throws an error.

### `.split()`

Splits a string into an array of individual characters:

```
let str = `abc`;
let chars = str.split();  // ["a", "b", "c"]
for (ch in chars) {
  log(ch);
}
```

### `.append(value)`

Returns a new string with the given value appended to the end:

```
let str = `Hello`;
let result = str.append(` World`);  // "Hello World"
```

### `.prepend(value)`

Returns a new string with the given value prepended to the beginning:

```
let str = `World`;
let result = str.prepend(`Hello `);  // "Hello World"
```

### `.includes(substring)`

Returns `1` (truthy) if the string contains the given substring, `0` (falsy) otherwise:

```
let str = `Hello World`;
if (str.includes(`World`)) {
  // found it
}
```

### `.slice(start, end)`

Returns a substring from `start` (inclusive) to `end` (exclusive). Negative indices count from the end:

```
let str = `Hello World`;
let sub = str.slice(0, 5);    // "Hello"
let end = str.slice(6, 11);   // "World"
let last3 = str.slice(-3, 11); // "rld"
```

## Color Literals

Hex color codes and CSS color functions are first-class expressions:

```
let c = #cc0000;                      // 6-digit hex
let c = #f00;                         // 3-digit shorthand
let c = #cc000080;                    // 8-digit with alpha
let c = rgb(255, 0, 0);              // CSS color function
let c = hsl(0, 100%, 50%);           // % is literal inside parens
let c = oklch(0.6 0.15 30);          // any CSS color space
let lighter = (#cc0000).lighten(20%); // method chaining via parens
```

See the [Color documentation](color.md) for full details.

## Percent Suffix

The `%` suffix converts a number to a fraction: `50%` becomes `0.5`.

```
let half = 50%;          // 0.5
let third = 33.3%;       // 0.333
let c = (#ff0000).lighten(20%);  // lighten by 0.2
```

**Disambiguation**: `20%` (no space) is a percent literal (= 0.2). `20 % 5` (with spaces) is the modulus operator (= 0).

## Expressions with calc()

For mathematical expressions, wrap them in `calc()`:

```
let r = 50;
M calc(100 - r) 100
L calc(100 + r) 100
```

### Supported Operators

| Operator | Description |
|----------|-------------|
| `+` | Addition |
| `-` | Subtraction |
| `*` | Multiplication |
| `/` | Division |
| `%` | Modulo (use spaces: `a % b`) |
| `<` | Less than |
| `>` | Greater than |
| `<=` | Less than or equal |
| `>=` | Greater than or equal |
| `==` | Equal |
| `!=` | Not equal |
| `&&` | Logical AND |
| `\|\|` | Logical OR |
| `!` | Logical NOT (unary) |
| `-` | Negation (unary) |
| `<<` | Merge (objects, style blocks, path blocks, text blocks) |

Operator precedence follows standard mathematical conventions.

## Style Blocks

Style blocks are CSS-like key-value maps wrapped in `${ }`. They're used for layer styles but are also first-class values — you can store them in variables, merge them, and read their properties.

### Literals

```
let styles = ${
  stroke: #cc0000;
  stroke-width: 3;
  fill: none;
};
```

Each property is a `name: value;` declaration. Values are try-evaluated as expressions — if the value parses as a valid expression (like a variable reference or `calc()`), its result is used. Otherwise the raw string is kept (e.g., `rgb(...)`, `#hex`).

### Merge (`<<`)

The `<<` operator merges two values of the same type. The right side overrides the left on key conflicts:

```
// Style blocks
let base = ${ stroke: red; stroke-width: 2; };
let merged = base << ${ stroke-width: 4; fill: blue; };
// Result: stroke: red, stroke-width: 4, fill: blue

// Objects
let a = { x: 1, y: 2 };
let b = a << { y: 99, z: 3 };
// Result: {x: 1, y: 99, z: 3}
```

Multiple merges can be chained: `a << b << c`. See also [Objects — Merging](objects.md#merging-objects-).

### Property Access

Use dot notation with camelCase names to read kebab-case properties:

```
let s = ${ stroke-width: 4; };
let sw = s.strokeWidth;  // "4" (reads 'stroke-width')
```

Property values are always strings.

### Usage in Layers

Style blocks are used in layer definitions and can be passed as per-element styles on `text()` and `tspan()`. See [Layers](layers.md) for full details.

## Null

The `null` literal represents the absence of a value. It is returned by `pop()` and `shift()` on empty arrays, and can be used in variable assignments and conditionals.

```
let x = null;
```

### Truthiness

`null` is falsy in conditionals:

```
let x = null;
if (x) {
  // not reached
} else {
  M 0 0  // this branch runs
}
```

### Equality

`null` is only equal to itself:

```
if (x == null) { /* x is null */ }
if (x != null) { /* x has a value */ }
```

`null == 0` evaluates to `0` (false) — null is distinct from zero.

### Error Behavior

Using `null` in arithmetic or as a path argument throws a descriptive error:

```
let x = null;
let y = x + 1;     // Error: Cannot use null in arithmetic expression
M x 0               // Error: Cannot use null as a path argument
```

## Booleans

The `true` and `false` keywords represent boolean values. They are a semantic subtype of number — `true` is `1`, `false` is `0` — but display as `true`/`false` in logs and template literals.

```
let flag = true;
let check = false;
```

### Numeric Equivalence

Booleans participate in arithmetic as their numeric values:

```
true + 1     // 2
true + true  // 2
false + 1    // 1
true == 1    // true
false == 0   // true
```

### Display

Booleans display as `true` or `false`, and comparisons return booleans:

```
log(true);       // true
log(5 > 3);      // true
log(1 > 5);      // false
log(`${true}`);  // true
```

### Truthiness

`false` is falsy (like `0` and `null`); `true` is truthy:

```
if (true) { /* runs */ }
if (false) { /* skipped */ }

let result = 5 > 3;  // true (BooleanValue)
if (result) { /* runs */ }
```

### Logical Operators

```
!true         // false
!false        // true
true && false // false
false || true // true
```

### Arc Flags

Booleans can be used directly as arc flag arguments, converting to `1`/`0` in the SVG output:

```
let largeArc = true;
let sweep = false;
M 0 0 A 50 50 0 largeArc sweep 100 0
// → M 0 0 A 50 50 0 1 0 100 0
```

## Enums

### Built-in Enums

Pathogen provides built-in enums for gradient and geometry properties. Enum members resolve to the string values accepted by these properties:

| Enum | Members |
|------|---------|
| `Easing` | `Linear`, `Smoothstep`, `EaseIn`, `EaseOut`, `EaseInOut` |
| `Interpolation` | `SRGB`, `OKLCH`, `LinearRGB` |
| `SpreadMethod` | `Pad`, `Reflect`, `Repeat` |
| `GradientUnits` | `ObjectBoundingBox`, `UserSpaceOnUse` |
| `Direction` | `CW`, `CCW` |
| `ConicSpread` | `Clamp`, `Repeat`, `Transparent` |
| `InnerFill` | `Transparent`, `TransparentBlend`, `Center` |
| `TopoMethod` | `Distance`, `Laplace` |

```
topo.easing = Easing.Smoothstep;       // equivalent to 'smoothstep'
grad.interpolation = Interpolation.OKLCH;
```

Enum values are interchangeable with their string equivalents:

```
Easing.Linear == 'linear'  // true
```

### User-Defined Enums

Define custom enums with `enum`:

```
// Auto-valued — member name lowercased to a string
enum Symmetry { None, Bilateral, Radial, Rotational }
log(Symmetry.Bilateral);  // bilateral

// Explicit string values
enum Season { Spring = 'vernal', Summer = 'estival' }

// Explicit typed values — number, angle, color, boolean
enum Angle { Quarter = 90deg, Half = 180deg, Full = 360deg }
enum Palette { Primary = #0066ff, Accent = #ff6600, Muted = #999 }
enum Weight { Thin = 1, Normal = 2, Bold = 4 }
enum Toggle { On = true, Off = false }
```

Auto-valued members always produce the lowercase string of the member name. Other types require an explicit `= value`.

Enum members are accessed with dot notation and can be used in conditionals:

```
let d = Dir.Up;
if (d == 'up') { M 10 20 }
```

## Points

Points represent 2D coordinates and provide geometric operations for SVG path construction.

### Constructor

Create a point with `Point(x, y)`:

```
let center = Point(200, 200);
let origin = Point(0, 0);
```

### Properties

| Property | Returns | Description |
|---|---|---|
| `.x` | number | X coordinate |
| `.y` | number | Y coordinate |

```
let pt = Point(100, 200);
M pt.x pt.y           // M 100 200
L calc(pt.x + 10) pt.y  // L 110 200
```

### Methods

All angles are in radians, consistent with the standard library.

#### `.translate(dx, dy)`

Returns a new point offset by the given deltas:

```
let pt = Point(100, 100);
let moved = pt.translate(10, -20);  // Point(110, 80)
```

#### `.polarTranslate(angle, distance)`

Returns a new point offset by angle and distance:

```
let pt = Point(100, 100);
let moved = pt.polarTranslate(0, 50);     // Point(150, 100)
let up = pt.polarTranslate(-0.5pi, 30);   // 30 units upward
```

#### `.midpoint(other)`

Returns the midpoint between two points:

```
let a = Point(0, 0);
let b = Point(100, 100);
let mid = a.midpoint(b);  // Point(50, 50)
```

#### `.lerp(other, t)`

Linear interpolation between two points. `t=0` returns this point, `t=1` returns the other:

```
let a = Point(0, 0);
let b = Point(100, 200);
let quarter = a.lerp(b, 0.25);  // Point(25, 50)
```

#### `.rotate(angle, origin)`

Rotates this point around a center point:

```
let pt = Point(100, 0);
let center = Point(0, 0);
let rotated = pt.rotate(90deg, center);  // Point(0, 100) approximately
```

#### `.distanceTo(other)`

Returns the Euclidean distance between two points:

```
let a = Point(0, 0);
let b = Point(3, 4);
log(a.distanceTo(b));  // 5
```

#### `.angleTo(other)`

Returns the angle in radians from this point to another:

```
let a = Point(0, 0);
let b = Point(1, 0);
log(a.angleTo(b));  // 0 (pointing right)
```

#### `.offset(other)`

Returns an object with `dx` and `dy` properties representing the vector from this point to `other`. Useful for applying the same relative displacement to multiple points:

```
let ref = Point(200, 200);
let target = Point(100, 300);
let off = ref.offset(target);
// off.dx = -100, off.dy = 100

// Apply the same offset to a different point
let other = Point(50, 75);
M calc(other.x + off.dx) calc(other.y + off.dy)
```

### Display

`log()` shows points in a readable format:

```
let pt = Point(100, 200);
log(pt);  // Point(100, 200)
```

### Template Literals

Points display as `Point(x, y)` when interpolated in template literals:

```
let pt = Point(42, 99);
let msg = `position: ${pt}`;  // "position: Point(42, 99)"
```

## Arrays

Arrays hold ordered collections of values. Elements can be numbers, strings, style blocks, other arrays, or `null`.

### Literals

```
let empty = [];
let nums = [1, 2, 3];
let mixed = [10, "hello", [4, 5]];
```

### Spread (`...`)

Use the spread operator to expand an array's elements into another array literal:

```
let a = [1, 2, 3];
let b = [0, ...a, 4, 5];     // [0, 1, 2, 3, 4, 5]
let c = [...a, ...b];         // combine two arrays
```

Spread works anywhere inside an array literal and can be mixed with regular elements:

```
let head = [10, 20];
let tail = [40, 50];
let full = [...head, 30, ...tail];  // [10, 20, 30, 40, 50]
```

### Index Access

Access elements by zero-based index using `[expr]`:

```
let list = [10, 20, 30];
let first = list[0];         // 10
let second = list[1];        // 20
M list[0] list[1]            // M 10 20
```

Out-of-bounds access throws an error.

### `.length`

Returns the number of elements:

```
let list = [1, 2, 3];
log(list.length);  // 3
```

### `.empty()`

Returns `1` (truthy) if the array has no elements, `0` (falsy) otherwise:

```
let list = [];
if (list.empty()) {
  // list is empty
}
```

### Methods

#### `.push(value)`

Appends a value to the end. Returns the new length.

```
let list = [1, 2];
let len = list.push(3);  // list is now [1, 2, 3], len is 3
```

#### `.pop()`

Removes and returns the last element. Returns `null` if the array is empty.

```
let list = [1, 2, 3];
let last = list.pop();   // last is 3, list is now [1, 2]
let empty = [];
let x = empty.pop();     // x is null
```

#### `.unshift(value)`

Prepends a value to the start. Returns the new length.

```
let list = [2, 3];
list.unshift(1);  // list is now [1, 2, 3]
```

#### `.shift()`

Removes and returns the first element. Returns `null` if the array is empty.

```
let list = [1, 2, 3];
let first = list.shift();  // first is 1, list is now [2, 3]
```

#### `.slice(start, end?)`

Returns a new array containing elements from `start` to `end` (inclusive). Negative indexes count from the end. If `end` is omitted, returns from `start` to the end of the array.

> **Note:** Array `.slice()` uses inclusive end indexes, while string `.slice()` uses exclusive end indexes (matching JavaScript string behavior).

```
let arr = [10, 20, 30, 40, 50];

let mid = arr.slice(1, 3);    // [20, 30, 40] — indices 1, 2, 3
let tail = arr.slice(3);      // [40, 50]     — from index 3 to end
let last2 = arr.slice(-2);    // [40, 50]     — last 2 elements
let head = arr.slice(0, -2);  // [10, 20, 30, 40] — up to second-to-last
```

#### `.map {|item| ... }` / `.map {|item, index, arrayRef| ... }`

Transforms each element using a trailing block, returning a new array. Use `return` to specify the mapped value. If no `return` is executed, the element maps to `null`.

The block receives up to three parameters:
- `item` — the current element
- `index` (optional) — the zero-based index
- `arrayRef` (optional) — a reference to the original array

```
let prices = [10, 25, 50];
let doubled = prices.map {|price|
  return calc(price * 2);
};
// doubled is [20, 50, 100]

// Block body supports full language features
let labels = [1, 2, 3].map {|n|
  let prefix = `item-`;
  return `${prefix}${n}`;
};
// labels is ["item-1", "item-2", "item-3"]
```

Use the index parameter for position-aware transforms:

```
let items = [10, 20, 30];
let indexed = items.map {|val, i|
  return calc(val + i);
};
// indexed is [10, 21, 32]
```

Use the array reference for look-ahead or look-behind:

```
let arr = [1, 2, 3, 4];
let pairs = arr.map {|item, idx, ref|
  if (idx < ref.length - 1) {
    return calc(item + ref[idx + 1]);
  }
  return item;
};
// pairs is [3, 5, 7, 4]
```

The block has access to variables from the enclosing scope:

```
let offset = 100;
let shifted = [1, 2, 3].map {|x|
  return calc(x + offset);
};
// shifted is [101, 102, 103]
```

#### `.reduce(initialValue) {|accumulator, item, index, arrayRef| ... }`

Iterates the array, threading an accumulator through each step. The `initialValue` argument sets the starting accumulator. The block must `return` the new accumulator value; if no `return` is executed, the accumulator becomes `null`.

The block receives up to four parameters:
- `accumulator` — the current accumulated value
- `item` (optional) — the current element
- `index` (optional) — the zero-based index
- `arrayRef` (optional) — a reference to the original array

```
let sum = [1, 2, 3, 4].reduce(0) {|acc, n|
  return calc(acc + n);
};
// sum is 10

let csv = ['a', 'b', 'c'].reduce('') {|acc, s, i|
  if (i == 0) { return s; }
  return `${acc},${s}`;
};
// csv is "a,b,c"
```

On an empty array, `reduce` returns `initialValue` unchanged:

```
let result = [].reduce(42) {|acc, n| return calc(acc + n); };
// result is 42
```

#### `.mapSlice(length)`

Returns a new array where each element is a sub-array (slice) of `length` elements starting at that element's index. Near the end of the array, slices are shorter as they extend past the bounds.

```
let arr = [1, 2, 3, 4];
let slices = arr.mapSlice(2);
// slices is [[1, 2], [2, 3], [3, 4], [4]]

let triples = [10, 20, 30, 40, 50].mapSlice(3);
// triples is [[10, 20, 30], [20, 30, 40], [30, 40, 50], [40, 50], [50]]
```

### Reference Semantics

Arrays are passed by reference. Mutations through one binding are visible through all others:

```
let a = [1, 2, 3];
let b = a;
b.push(4);
log(a.length);  // 4 — same underlying array
```

### For-Each Iteration

Iterate over array elements with `for (item in list)`:

```
let points = [10, 20, 30];
for (p in points) {
  M p 0
}
// Produces: M 10 0 M 20 0 M 30 0
```

Destructure to get both item and index with `for ([item, index] in list)`:

```
let sizes = [5, 10, 15];
for ([size, i] in sizes) {
  circle(calc(i * 40 + 20), 50, size)
}
```

Iterating over an empty array produces no output.

### Destructuring

Extract array elements into individual variables with destructuring in `let` declarations:

```
let [a, b, c] = [1, 2, 3];
log(a);  // 1
log(b);  // 2
log(c);  // 3
```

If the array has more elements than bindings, extras are silently ignored:

```
let [first, second] = [10, 20, 30, 40];
// first is 10, second is 20 — 30 and 40 ignored
```

If the array has fewer elements than bindings, missing values are `null`:

```
let [x, y, z] = [1, 2];
// x is 1, y is 2, z is null
```

Use the rest pattern (`...name`) to collect remaining elements into a new array:

```
let [head, ...tail] = [1, 2, 3, 4, 5];
// head is 1, tail is [2, 3, 4, 5]

let [only, ...rest] = [42];
// only is 42, rest is []
```

The rest pattern must be the last binding in the destructuring pattern.

## Angle Units

Numbers can have angle unit suffixes for convenience:

| Suffix | Description |
|--------|-------------|
| `45deg` | Degrees (converted to radians internally) |
| `1.5rad` | Radians (no conversion) |
| `0.25pi` | Multiplied by π (i.e. `0.25 * π`) |

```
let angle = 90deg;
M sin(45deg) cos(45deg)

// Equivalent to:
let angle = rad(90);
M sin(rad(45)) cos(rad(45))
```

The `pi` suffix multiplies the number by π. This is especially convenient for polar coordinates and angles expressed as fractions of π:

```
let quarter = 0.25pi;   // π/4
let half = 0.5pi;       // π/2
let full = 2pi;          // 2π
M sin(0.25pi) cos(0.25pi)
```

The `pi` suffix participates in angle unit mismatch checking: `calc(0.25pi + 5)` throws an error, while `calc(90deg + 0.5pi)` is allowed (both have angle units).

**Note**: The `pi` suffix only works on numeric literals. For expressions or variables, use `mpi(x)` (see [Standard Library](stdlib.md)).

## For Loops

Repeat path commands with `for`:

```
for (i in 0..10) {
  L calc(i * 20) calc(i * 10)
}
```

The range `0..10` includes both endpoints (0 through 10, giving 11 iterations).

### Descending Ranges

Ranges automatically count down when start > end:

```
// Countdown from 5 to 1
for (i in 5..1) {
  M calc(i * 20) 0
}
// Produces: M 100 0 M 80 0 M 60 0 M 40 0 M 20 0
```

### Nested Loops

```
for (row in 0..2) {
  for (col in 0..2) {
    circle(calc(col * 50 + 25), calc(row * 50 + 25), 10)
  }
}
```

This creates a 3x3 grid (rows 0, 1, 2 and cols 0, 1, 2).

## Conditionals

Use `if`, `else if`, and `else` for conditional path generation:

```
let size = 100;

if (size > 75) {
  M 0 0 L 100 100
} else if (size > 50) {
  M 0 0 L 75 75
} else {
  M 0 0 L 50 50
}
```

You can chain as many `else if` blocks as needed. Comparison results are numeric: `1` for true, `0` for false.

## Functions

### Defining Functions

Create reusable path generators with `fn`:

```
fn square(x, y, size) {
  rect(x, y, size, size)
}
```

### Calling Functions

```
square(10, 10, 50)
square(70, 10, 50)
```

Functions can call other functions and use all language features.

## Comments

Line comments start with `//`:

```
// This is a comment
let x = 50;  // inline comment
M x 0
```

## Path Context (ctx)

When using `compileWithContext()`, a `ctx` object tracks the current drawing state:

```
M 10 20
L 30 40
L calc(ctx.position.x + 10) ctx.position.y  // L 40 40
```

### ctx Properties

| Property | Type | Description |
|----------|------|-------------|
| `ctx.position.x` | number | Current X coordinate |
| `ctx.position.y` | number | Current Y coordinate |
| `ctx.start.x` | number | Subpath start X (set by M, used by Z) |
| `ctx.start.y` | number | Subpath start Y |
| `ctx.commands` | array | History of executed commands |

### How Position Updates

- **M/m**: Sets position and subpath start
- **L/l, H/h, V/v**: Updates position to endpoint
- **C/c, S/s, Q/q, T/t**: Updates position to curve endpoint
- **A/a**: Updates position to arc endpoint
- **Z/z**: Returns to subpath start

Lowercase (relative) commands add to current position; uppercase (absolute) set it directly.

### log() Function

Use `log()` to inspect the context during evaluation:

```
M 10 20
log(ctx)           // Logs full context as JSON
log(ctx.position)  // Logs just position object
log(ctx.position.x) // Logs just the x value
L 30 40
```

The logs are captured in the `logs` array returned by `compileWithContext()`.

### Example: Drawing Relative to Current Position

```
M 100 100
L 150 150
// Continue from current position
L calc(ctx.position.x + 50) ctx.position.y
L ctx.position.x calc(ctx.position.y + 50)
Z
```

## Complete Example

```
// Draw a grid of circles with varying sizes
let cols = 5;
let rows = 5;
let spacing = 40;

for (row in 0..rows) {
  for (col in 0..cols) {
    let x = calc(col * spacing + 20);
    let y = calc(row * spacing + 20);
    let r = calc(5 + col + row);
    circle(x, y, r)
  }
}
```

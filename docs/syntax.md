# Syntax Reference

pathogen-lang is a superset of SVG path syntax that adds variables, expressions, control flow, functions, and [path blocks](#path-blocks-path-blocks).

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

See the [Color documentation](#color-color-type) for full details.

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

`calc()` computes on **values**. Percent suffixes are converted at the literal (`20%` → 0.2), so they always produce plain numbers. Angle suffixes (`deg`, `rad`, `pi`) are different: an angle-suffixed literal produces an **Angle value**, and `calc()` arithmetic keeps angle-ness where it makes sense — scaling an angle by a plain number is still an angle, a ratio of two angles is a plain number. **An angle is an angle wherever it flows**: it survives being stored in a variable, put in an array, or passed through a function. See [Angle Units](#syntax-angle-units).

Separately, the compiler still reads the expression *as written* to reject nonsense at compile time, like `calc(0.25pi + 5)` — see the mismatch rules under [Angle Units](#syntax-angle-units).

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
| `<<` | Merge (objects, style blocks, path blocks, text blocks) — or [apply a worker function](#syntax-applying-workers) to a callback builtin: `arr.map() << f` |

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

Each property is a `name: value;` declaration. The trailing `;` is required on **every** declaration, including the last one before `}` — a declaration missing its `;` is a compile error. Values are try-evaluated as expressions — if the value parses as a valid expression (like a variable reference, backtick template literal, or `calc()`), its result is used. Otherwise the raw string is kept (e.g., `rgb(...)`, `#hex`). See [Variables and Interpolation in Values](#layers-variables-and-interpolation-in-values) for dynamic values.

### CSS Function Values

Style-block values are **native CSS syntax**, not Pathogen call syntax. This matters for CSS functions whose grammar is space-separated — the CSS filter functions (`blur`, `brightness`, `contrast`, `drop-shadow`, `grayscale`, `hue-rotate`, `invert`, `opacity`, `saturate`, `sepia`) take space-separated arguments, and commas inside them are a compile error:

```
// ✗ Compile error — Pathogen-style commas are not valid CSS here
filter: drop-shadow(4px, 4px, 4px, shadowColor);
// drop-shadow() uses space-separated CSS syntax:
// drop-shadow(4px 4px 4px color) — remove the commas

// ✓ Native CSS syntax — space-separated
filter: drop-shadow(4px 4px 4px shadowColor);
```

Filter chains are also space-separated: `filter: blur(2px) brightness(1.2);` — a comma between chained filter functions is likewise a compile error.

Functions whose CSS grammar genuinely uses commas keep them, exactly as in CSS: `rgba(0, 0, 0, 0.5)`, `color-mix(in oklch, red, blue)`, `translate(10px, 20px)`, `cubic-bezier(0.4, 0, 0.2, 1)`, `polygon(0 0, 100% 0, 50% 100%)`, and `font-family` fallback lists.

Pathogen variables still work anywhere inside a CSS function value — `drop-shadow(4px 4px 4px shadowColor)` resolves `shadowColor` to its CSS color at compile time, and a numeric variable substitutes as a bare number (`brightness(level)` → `brightness(1.4)`). Substitution is not unit-aware, and the compiler checks the result — arguments that need a unit want a template fragment instead: `` blur(`${softness}`px) ``. See [Argument Units](#syntax-argument-units) below and [Variables and Interpolation in Values](#layers-variables-and-interpolation-in-values).

#### Argument Units

CSS is strict about units per function, and a wrong one makes the browser drop the whole declaration silently. Pathogen checks the final value — after any variable substitution or interpolation — and fails with a fix-it message instead:

| Group | Functions | Numeric arguments |
|-------|-----------|-------------------|
| Filter | `blur`, `drop-shadow` | A **length** — unit required (`px`, `em`, `rem`, `pt`, `in`, `cm`, `vw`, …). No percentages. |
| Filter | `hue-rotate` | An **angle** — unit required (`deg`, `rad`, `turn`). |
| Filter | `brightness`, `contrast`, `grayscale`, `invert`, `opacity`, `saturate`, `sepia` | A plain number **or** percentage. Units are an error. |
| Shape | `inset`, `circle`, `ellipse`, `polygon` | A **length or percentage** — one or the other is required. |
| Transform | `scale`, `scaleX`, `scaleY`, `scaleZ`, `scale3d`, `matrix`, `matrix3d` | Plain numbers only. Any unit, including `%`, is an error. |
| Timing | `cubic-bezier`, `steps` | Plain numbers only. Any unit, including `%`, is an error. |

The table above is the **complete** list of checked functions. Any CSS function not listed — including `rotate`, `translate`, `skew`, `perspective`, the color functions, and `path()` — passes through unchecked.

```
filter: blur(4);              // ✗ blur() takes a length — "4" needs a unit (try 4px)
filter: blur(4px);            // ✓
filter: hue-rotate(90);       // ✗ hue-rotate() takes an angle — "90" needs a unit (try 90deg)
filter: hue-rotate(90deg);    // ✓
filter: opacity(50%);         // ✓ percentages are fine for filter amounts
transform: scale(2px);        // ✗ scale() takes plain numbers — "2px" must not have a unit
transform: scale(0.5);        // ✓

let softness = 4;
filter: blur(softness);       // ✗ substituted values are checked the same way
filter: blur(`${softness}`px); // ✓
```

**Zero is always allowed bare** — `blur(0)` and `polygon(0 0, 100% 0, 50% 100%)` are valid CSS and pass unchanged.

#### Why Some Functions Are Unchecked

Pathogen checks a function's units only where CSS and SVG agree on the right answer.

**Color functions** (`oklch`, `rgb`, `color-mix`, …) accept numbers, percentages, and angles interchangeably depending on the channel, so there is no single rule to enforce — they are left alone.

**Most transform functions** are emitted into SVG's `transform` attribute, whose grammar takes unitless user units. `transform: rotate(45)` and `translate(100, 200)` are correct there and are exactly what Pathogen's own [transform convenience properties](#layers-transform-convenience-properties) generate, while the CSS grammar for the same functions requires units. Because the two grammars disagree, Pathogen accepts both forms and checks neither — `translate(10px, 20px)` is accepted too.

**`scale*` and `matrix*` are the exception**, which is why they appear in the table. A unit is invalid in *both* grammars — SVG's is `scale(<number>)` and `matrix(<number>×6)` — so there is one correct answer and Pathogen enforces it.

#### Functions Must Match the Property

A function also has to belong to the property it is used on — `fill: rotate(45);` is a compile error, since a transform function means nothing to `fill`:

```
fill: rotate(45);             // ✗ rotate() is not valid on "fill" — that property takes color functions
fill: oklch(0.7 0.15 240);    // ✓
clip-path: blur(4px);         // ✗ blur() is not valid on "clip-path" — that property takes basic shapes
clip-path: circle(50%);       // ✓
```

The mapping is:

| Property | Accepts |
|----------|---------|
| `filter` | Filter functions |
| `clip-path` | Basic shapes |
| `transform` | Transform functions |
| `fill`, `stroke`, `stop-color`, `flood-color`, `lighting-color` | Color functions |
| `transition-timing-function`, `animation-timing-function` | Timing functions |

Any property not in this table accepts any allow-listed function. Nesting is unaffected: `drop-shadow(4px 4px 8px oklch(0.65 0.26 357))` is fine, because only the outermost function is matched against the property.

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

Multiple merges can be chained: `a << b << c`. See also [Objects — Merging](#objects-merging-objects).

### Applying workers (`<<`)

`<<` has a second job: it applies a **worker function** to a callback
builtin. The parentheses parameterize the call; `<<` supplies the function
that does the work. (The shape rhymes with `PathLayer('name') << styles` —
though that one is mechanically a merge, the reading "feed the right side
into the left" is the same.)

```
let doubler = {|v| return calc(v * 2); };
let doubled = [1, 2, 3].map() << doubler;

let cells = Grid(4, 4, { xDim: 25, yDim: 25 });
cells.fill() << {|row, col| return calc(row * 4 + col); };

let total = [1, 2, 3].reduce(0) << {|acc, v| return calc(acc + v); };

let spine = @{ l 120 0 };
let ribbon = spine.variableOffset() << {|go, pb|
  go.stop(0, 4, CurveContinuity.G1);
  go.stop(1, 12, CurveContinuity.G1);
};
```

The rule is structural: when the **left side is one of the eight callback
builtins** — array `.map`/`.reduce`/`.sort`, `Grid.fill`/`.forEach`/`.map`,
`variableOffset`/`compoundVariableOffset` — written **without** a trailing
block, `<<` provides its callback. The right side may be a lambda variable,
a named `fn`, or a lambda literal. Anywhere else, `<<` is the ordinary
merge above.

Evaluation order: the receiver, then the parenthesized arguments (e.g.
`reduce`'s initial value), then the worker expression, then the iteration.

A few consequences of the structural rule:

- **A trailing block and a `<<` worker are mutually exclusive.** If the
  call already carries a literal block, `<<` falls back to merge — so
  `spine.variableOffset() {|go, pb| ... } << edge` still means "build the
  offset, then concatenate the `edge` path block", exactly as before.
  (And `arr.map {|v| ... } << f` errors: the block completed the call, and
  a function is not a mergeable value.)
- **Application happens once.** `arr.map() << f << g` applies `f`, and the
  second `<<` then sees an array on its left — already a value, so the
  error says exactly that. Apply then merge is fine when the types line
  up: `spine.compoundVariableOffset() << mk << tail` builds the ribbon and
  concatenates `tail`.
- Passing the worker *inside* the parentheses (`map(f)`) is not supported —
  the error message points you to `<<`.

### Property Access

Use dot notation with camelCase names to read kebab-case properties:

```
let s = ${ stroke-width: 4; };
let sw = s.strokeWidth;  // "4" (reads 'stroke-width')
```

Property values are always strings.

### Usage in Layers

Style blocks are used in layer definitions and can be passed as per-element styles on `text()` and `tspan()`. See [Layers](#layers-layers) for full details.

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

The `Easing` curves are also callable as stdlib functions (`easeIn`,
`easeOut`, `easeInOut`, `smoothstep`) — the formulas and the enum↔function
mapping are documented in [the stdlib's Easing section](#stdlib-easing).

### User-Defined Enums

Define custom enums with `enum`:

```
// Auto-valued — member name lowercased to a string
enum Symmetry { None, Bilateral, Radial, Rotational }
log(Symmetry.Bilateral);  // bilateral

// Explicit string values
enum Season { Spring = 'vernal', Summer = 'estival' }

// Explicit typed values — number, angle, color, boolean
enum Turn { Quarter = 90deg, Half = 180deg, Full = 360deg }
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

All angles are in radians, consistent with the standard library. [Angle values](#syntax-angle-units) are accepted anywhere an angle goes in (`.rotate(90deg, c)`); angles that come *out* (`.angleTo()`) are plain numbers in radians.

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

Transforms each element using a trailing block, returning a new array. Use `return` to specify the mapped value. If no `return` is executed, the element maps to `null`. A reusable worker applies with `<<` — `prices.map() << f;` (see [Applying workers](#syntax-applying-workers)).

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

A reusable worker applies with `<<` — the initial value stays in the
parentheses: `values.reduce(0) << sumFn;` (see
[Applying workers](#syntax-applying-workers)).

#### `.mapSlice(length)`

Returns a new array where each element is a sub-array (slice) of `length` elements starting at that element's index. Near the end of the array, slices are shorter as they extend past the bounds.

```
let arr = [1, 2, 3, 4];
let slices = arr.mapSlice(2);
// slices is [[1, 2], [2, 3], [3, 4], [4]]

let triples = [10, 20, 30, 40, 50].mapSlice(3);
// triples is [[10, 20, 30], [20, 30, 40], [30, 40, 50], [40, 50], [50]]
```

#### `.reverse()`

Returns a new array with the elements in reverse order. The original array is not modified.

```
let arr = [1, 2, 3];
let rev = arr.reverse();
// rev is [3, 2, 1]
// arr is still [1, 2, 3]
```

#### `.sort()` / `.sort {|a, b| ... }`

Returns a new array with the elements sorted. Sorting is how you z-order shapes by area, order gradient stops by offset, or arrange points by angle before drawing.

> **Note:** Unlike JavaScript, `.sort()` and `.reverse()` do not sort or reverse in place — they return new arrays and leave the original untouched. Of the array methods, `.push()`, `.pop()`, `.unshift()`, and `.shift()` mutate the array; `.slice()`, `.map()`, `.mapSlice()`, `.reverse()`, and `.sort()` return copies. See [Reference Semantics](#syntax-reference-semantics) for why the distinction matters when an array has more than one binding.

Called without a block, `.sort()` sorts in natural ascending order — numbers sort numerically, strings by character code order:

```
let source = [10, 2, -1];
let nums = source.sort();
// nums is [-1, 2, 10] — numeric, not lexicographic
// source is still [10, 2, -1]

let names = ["cherry", "apple", "banana"].sort();
// names is ["apple", "banana", "cherry"]
```

String order compares character codes, not locale rules — uppercase letters sort before lowercase, and digits before letters:

```
let mixed = ["apple", "Banana"].sort();
// mixed is ["Banana", "apple"] — "B" (66) precedes "a" (97)
```

For locale-aware or any other custom ordering, supply a comparator block.

The natural order is only defined when every element is a number, or every element is a string. Sorting anything else without a comparator — Points, Colors, `null`, or mixed types — is an error:

```
let mixed = [1, "two", Point(0, 0)];
let bad = mixed.sort();
// Error: sort() without a comparator requires all-number or all-string
// elements — use sort {|a, b| return ...; } to define the order
```

`NaN` has no defined order, so a numeric array containing `NaN` is also an error. An empty array sorts to an empty array. A single-element array of an unsortable type still errors — the element check does not depend on the array's size.

For custom ordering, supply a comparator as a trailing block or apply one
with `<<` (`values.sort() << cmp` — see
[Applying workers](#syntax-applying-workers)). `.sort()` takes no
parenthesized arguments:

```
let points = [Point(30, 0), Point(10, 0), Point(20, 0)];
let byX = points.sort {|a, b|
  return calc(a.x - b.x);
};
// byX is [Point(10, 0), Point(20, 0), Point(30, 0)]
```

The comparator block receives exactly two parameters — unlike `.map` and `.reduce`, there is no index or array reference:

- `a` — the first element being compared
- `b` — the second element being compared

The block must `return` a number:

- negative — `a` sorts before `b`
- positive — `b` sorts before `a`
- zero — keep the original relative order

The sort is stable: elements that compare equal keep their original relative order.

> **Note:** The comparator must return a number — a comparison operator will not do. `return a < b;` can only produce two outcomes, but a comparator needs three: `a` first, `b` first, or equal. Subtract instead: `return calc(a - b);`
>
> Returning anything other than a number (including `NaN`) raises: `sort() comparator must return a number (negative = a first, positive = b first, zero = keep order) — e.g. return calc(a - b);`

```
let descending = [3, 1, 2].sort {|a, b|
  return calc(b - a);
};
// descending is [3, 2, 1]
```

The comparator can read variables from the enclosing scope, but any path commands it emits are discarded — a comparator is for ordering only.

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

Object destructuring works on object literals and on fixed-shape struct
values such as `Point`, `Grid`, `Color`, and `ctx.position` —
see [Destructuring](#objects-destructuring) in the Objects guide:

```
let { x, y } = Point(20, 20);
```

The one-name syntax also works in the other direction: `{ x, y }` builds an
object with those variables as values — see
[Shorthand Properties](#objects-shorthand-properties) in the Objects guide.

## Angle Units

Numbers can have angle unit suffixes:

| Suffix | Description |
|--------|-------------|
| `45deg` | Degrees |
| `1.5rad` | Radians |
| `0.25pi` | Multiplied by π (i.e. `0.25 * π`) |

An angle-suffixed literal produces an **Angle value** — radians on the inside, with the written unit remembered for display. **An angle is an angle wherever it flows**: it survives variables, arrays, function parameters, and return values. In angle-accepting positions — path arguments, trig and polar functions, comparisons, loop bounds, `calc()` arithmetic, rotation and orient properties, gradient `from`/`to`, filter angles — an Angle reads as its radians value, so `sin(45deg)` and `sin(rad(45))` are identical. Slots that want a plain count or dimension still reject an Angle: `Grid(90deg, 4)` errors with *"must be a positive integer"*. The one place radians are **not** the reading is the degree-based color API — see [Angle Display](#syntax-angle-display) below.

> **Behavior change:** Angle units used to be consumed at the literal — `let t = 0.5pi; c.hueShift(t)` shifted 1.57°, not 90°. Angles are now values that survive variables, so that program shifts 90°. Likewise `Color(0.6, 0.15, 90deg)` now stores hue 90 (was 1.5708), interpolating an Angle prints `90deg` rather than a radians number, and `sort()` orders Angle arrays instead of erroring.

```
let quarter = 90deg;      // an Angle — prints "90deg", auto-converts for hue methods
M sin(quarter) cos(quarter)

// Only inside sin() are these equivalent — an Angle reads as radians there.
// rad(45) itself returns a plain number, not an Angle:
M sin(rad(45)) cos(rad(45))
```

The `pi` suffix multiplies the number by π. This is especially convenient for polar coordinates and angles expressed as fractions of π:

```
let eighth = 0.25pi;   // π/4
let half = 0.5pi;      // π/2
let full = 2pi;        // 2π
M sin(eighth) cos(eighth)
```

### Angle Members

An Angle value exposes its measure in whichever unit you need:

| Member | Description |
|--------|-------------|
| `.deg` | The angle in degrees |
| `.rad` | The angle in radians |
| `.pi` | The angle in multiples of π (`90deg.pi` is `0.5`) |
| `.turns` | The angle in full circles (1 = 360°) |

All members return **plain numbers**:

```
let a = 90deg;
log(a.deg);    // 90
log(a.rad);    // 1.5707963267948966
log(a.pi);     // 0.5
log(a.turns);  // 0.25
```

### Unit Re-tagging

`.toDeg()`, `.toRad()`, `.toPi()`, and `.toTurns()` return the **same angle**
with a different display unit — the value is unchanged (it still compares
equal and reads as the same radians everywhere), only how it prints changes:

```
let a = 90deg;
log(a.toPi());          // 0.5pi
log(a.toRad());         // 1.5707963267948966rad
log(a.toTurns());       // 0.25turns
log(a.toPi() == 0.5pi); // true — same angle, different label
```

`turns` exists only as a display unit — there is no `0.25turns` literal; write
`calc(0.25 * 2pi)` (or `90deg`) and re-tag with `.toTurns()` when you want it
displayed that way.

**Where Angles come from.** Only angle-suffixed literals — and `calc()` arithmetic over them — produce Angle values. Standard-library functions that *compute* an angle return **plain numbers in radians**: `atan2()`, `.angleTo()`, `tangent(t).angle`, `PolarVector.angle`, and [`deg()`/`rad()`](#stdlib-angle-conversion)/`mpi()`. That matters most for the degree-based color methods below, which read a bare number as **degrees** — write `c.hueShift(deg(p.angleTo(q)))`, not `c.hueShift(p.angleTo(q))`.

### Angle Arithmetic

`calc()` arithmetic keeps angle-ness where it makes sense:

- Adding or subtracting angles gives an angle: `calc(90deg + 0.5pi)`.
- Scaling an angle by a plain number keeps the angle: `calc(2 * 45deg)`, `calc(2pi / 4)`, and `calc(i / 9 * 2pi)` are all angles.
- A ratio of two angles is a plain number: `calc(1pi / 2pi)` is `0.5`.
- Everything else (`%`, comparisons, boolean logic) reads the radians value and produces a plain number.

Unit mismatch checking rejects nonsense at compile time, reading the expression *as written*:

- `calc(0.25pi + 5)` throws — adding an angle to a unitless number is ambiguous (`%` counts as unitless for this check).
- `calc(90deg * 45deg)` throws — multiplying two angles has no meaning here.
- Angle-ness propagates through a product: `calc((90deg * 2) + 5)` throws, because the product is still an angle.
- The static check only sees literals: `calc(x + 5)` is never rejected, even when `x` holds an angle. At runtime the result is still an angle — the plain `5` is read as radians.

### Angle Display

Interpolating an Angle into a [template literal](#syntax-strings-and-template-literals) or `log()` shows it in its written unit — `90deg`, `0.5pi`, `1.5708rad` — not the raw radians number. Use `.rad` or `.deg` when you need a bare number in text.

**Degree-based color methods**: `hueShift`, `analogous`, and `splitComplementary` read a **bare number** argument in degrees. An Angle value — however it arrives: literal, variable, array element, or the return value of a function you defined — is converted exactly, so `hueShift(90deg)`, `hueShift(90)`, and `let turn = 0.5pi; hueShift(turn)` all shift by 90°. Everywhere else in the language, a bare number is radians.

`Color(L, C, H)` follows the same rule: a bare `H` is degrees, and an Angle `H` auto-converts — `Color(0.6, 0.15, 90deg)` stores a hue of 90. The `.hue` property returns a plain number in degrees. See [Color § Hue](#color-hue).

**Note**: The `pi` suffix only works on numeric literals. To scale π by a variable, multiply inside `calc()` — `calc(x * 1pi)` — which keeps the result an Angle. `mpi(x)` also multiplies by π but returns a **plain number**, so it reads as radians in numeric slots and as *degrees* in the color methods above.

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

### Loop Control: continue and break

`continue;` skips the rest of the current iteration and moves to the next one; `break;` exits the loop entirely:

```
// Draw circles at 0, 20, 40, 80, 100 — skipping 60
for (i in 0..5) {
  if (i == 3) {
    continue;
  }
  circle(calc(i * 20), 50, 8);
}

// Stop the first time a threshold is crossed
for (i in 0..100) {
  if (calc(i * i) > 500) {
    break;
  }
  M calc(i * 10) calc(i * i)
}
```

Both work in range loops and for-each loops (over arrays and objects), and inside loops in `text` blocks. A typical use with glyph layout — skip whitespace without drawing:

```
for (g in glyphs) {
  if (g.isWhitespace) {
    x = calc(x + g.advanceWidth);
    continue;
  }
  M x y
  g.draw()
  x = calc(x + g.advanceWidth);
}
```

**Placement rules:**

- In nested loops, `continue`/`break` control the **innermost** enclosing loop.
- They may appear directly in a loop body or inside `if`/`else` branches nested in it.
- Everything else is a boundary: `fn` bodies, lambdas, callback blocks (`Grid.fill`, `.map`, …), `apply { }` blocks, path blocks (`@{ }`), and text blocks (outside their own loops). Using `continue` or `break` there — or outside any loop — is a compile error: `'continue' is only valid inside a for loop`.
- `break` and `continue` are reserved words and cannot be used as variable names.

Note: the loop-size safety limit (32,000 iterations) is checked against the range *before* the loop runs, so a `break` cannot make an over-limit range acceptable.

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
  rect(x, y, size, size);
}
```

### Calling Functions

```
square(10, 10, 50);
square(70, 10, 50);
```

Functions can call other functions and use all language features.

Functions are values: pass one to another function by name and call it through
the parameter.

```
fn double(x) { return calc(x * 2); }
fn callWith(f, v) { return f(v); }

let n = callWith(double, 5);   // 10
```

(Note: `apply` is reserved for layer blocks and can't be used as a function
name.)

A function body may either `return` a value, or fall through after emitting
path commands — in that case the call produces a path segment that can be used
directly in path context:

```
fn square(x, y, size) {
  rect(x, y, size, size);
}
square(10, 10, 50);          // emits the rect's path commands
```

### Scoping: functions vs lambdas

Named functions are **dynamically scoped**: a free name inside the body (one
that isn't a parameter or a local `let`) resolves against the *caller's* scope
at call time. Because top-level `let`s are visible from almost every call site,
this usually behaves the way you'd expect — but a caller-local variable of the
same name will take precedence:

```
fn f() { return amt; }
fn g() { let amt = 7; return f(); }
let amt = 1;
let a = f();   // 1  — resolves from the top level
let b = g();   // 7  — resolves from g's scope, the call site
```

If you need a function that remembers the variables where it was *written*,
use a lambda.

### Lambdas

A lambda is a function literal, written with the same block syntax used by
[array methods](#syntax-map-item-map-item-index-arrayref) and other builders, and stored or passed
like any other value:

```
let add = {|a, b| return a + b; };
let one = {|| return 1; };          // zero parameters

let three = add(1, 2);
```

Unlike named functions, lambdas are **lexically scoped**: the body captures
the scope where the lambda was written (a closure), not the caller's scope.

```
let scale = 3;
let times = {|x| return calc(x * scale); };

fn caller() {
  let scale = 100;      // does NOT affect the lambda
  return times(2);
}
let six = caller();     // 6
```

Capture is by reference — if a captured variable is reassigned later, the
lambda sees the new value. Loops create a fresh scope per iteration, so
lambdas created inside a loop each capture that iteration's values:

```
let fns = [];
for (i in 1..3) {
  fns.push({|| return i; });
}
let first = fns[0];
let last = fns[2];
// first() is 1, last() is 3  (bind to a name before calling — see limitations)
```

Lambda bodies have the same dual mode as named functions: `return` a value, or
fall through after path commands to produce a path segment.

**Applying workers with `<<`.** Anywhere a **callback builtin** accepts a
trailing block, a lambda (or a named function) can do the same job —
applied with the `<<` operator, never passed inside the parentheses.
(Constructor binding blocks are the exception — see the limitations
below.) A worker earns its keep when it's reused:

```
let ease = {|t| return calc(t * t * (3 - 2 * t)); };
let rows = [0.2, 0.5, 0.9].map() << ease;
let cols = [0.1, 0.6].map() << ease;
```

```
let doubler = {|v| return calc(v * 2); };

let a = [1, 2, 3].map() << doubler;      // same as .map {|v| ...}
let b = [1, 2, 3].map() << {|v| return calc(v * 2); };   // inline literal

let grid = Grid(4, 4, { xDim: 25, yDim: 25 });
grid.fill() << {|row, col| return calc(row * 4 + col); };
```

This works for array `.map`/`.reduce`/`.sort`, `Grid.fill`/`.forEach`/`.map`,
and `variableOffset`/`compoundVariableOffset`. The parentheses keep their
ordinary parameters — `reduce(init) << f` — and the worker stays outside
them. The full rules (evaluation order, chaining, interaction with merge)
live in [Applying workers](#syntax-applying-workers) under the `<<`
operator. The old argument form (`map(f)`) was removed before any
production use; it now errors with a pointer to `<<`.

**Current limitations:**

- A lambda must be called through a plain name (`f(1, 2)`). Calling the result
  of an expression — `fns[0](5)`, `obj.f(1)`, or an immediately-invoked
  literal — is not yet supported: assign to a `let` first.
- A lambda *literal* cannot appear inside a call in path-argument position
  (`M use({|x| ...}) 0`) — path arguments stop at `|`. Bind the lambda to a
  variable and pass the name instead. (Worker application is unaffected:
  `<< {|x| ... }` sits in ordinary expression position.)
- Constructor binding blocks (`LinearGradient(...) {|g| ...}`, `Marker`,
  `Pattern`, filters, `Grid(...) {|g| ...}`) still require a literal trailing
  block — `<<` worker application is a possible future extension there.

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

`ctx` is an ambient global — so is `viewbox`, which exposes the dimensions set by `define ViewBox(…)`; see [Reading the viewbox](#viewbox-reading-the-viewbox).

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

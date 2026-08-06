# Objects

Objects are key-value containers for grouping related data — coordinates, configuration, metadata, or any structured values.

## Object Literals

Create objects with curly braces and `key: value` pairs:

```
let obj = {};
let point = { x: 50, y: 80 };
let config = { name: 'Dave', age: 32, cats: ['foo', 'bar', 'baz'] };
```

Use the spread operator (`...`) to expand an existing object's properties into a new object:

```
let base = { x: 10, y: 20 };
let extended = { ...base, z: 30 };      // { x: 10, y: 20, z: 30 }
let override = { ...base, x: 99 };      // { x: 99, y: 20 }
```

Spread can be mixed with regular properties and used multiple times:

```
let a = { x: 1 };
let b = { y: 2 };
let merged = { ...a, ...b, z: 3 };      // { x: 1, y: 2, z: 3 }
```

Later properties override earlier ones (same as the `<<` merge operator):

```
let defaults = { stroke: 'black', width: 2 };
let custom = { ...defaults, width: 4 };  // { stroke: 'black', width: 4 }
```

Keys can be identifiers or string literals. Trailing commas are allowed:

```
let obj = {
  'first-name': 'Alice',
  lastName: 'Smith',
  age: 30,
};
```

Objects can be nested:

```
let shape = {
  center: { x: 100, y: 100 },
  radius: 50,
};
```

### Shorthand Properties

When a property value is a variable with the same name as the key, you can write the name once — `{ x }` is shorthand for `{ x: x }`:

```
let x = 50;
let y = 80;
let point = { x, y };        // { x: 50, y: 80 }
```

Shorthand shines when accumulating records in a loop, or at call sites that take an options object:

```
let offsets = [];
for ([glyph, gIndex] in ['a', 'b', 'c']) {
  let leftOffset = calc(60 + gIndex * 48);
  offsets.push({ glyph, leftOffset });
}
```

```
let xDim = 10;
let yDim = 10;
let grid = Grid(4, 5, { xDim, yDim });
```

Shorthand, regular properties, and spread mix freely, and later properties still override earlier ones:

```
let radius = 40;
let base = { cx: 100, cy: 100, radius: 10 };
let spec = { ...base, radius };   // { cx: 100, cy: 100, radius: 40 }
```

This is the mirror of [destructuring](#objects-destructuring), which unpacks with the same one-name syntax:

```
let { x, y } = point;    // destructure out...
let copy = { x, y };     // ...and pack back up
```

The symmetry stops at failures, though: destructuring a key that doesn't exist gives `null`, while packing a name that isn't defined is an error.

Two constraints on the shorthand form:

- The key must be a plain identifier. String keys (`{ 'first-name' }`) and computed keys (`[expr]: value`) are parse errors.
- The name is an ordinary variable reference. If it isn't defined, evaluation fails with `Undefined variable: name`.

## Reading Properties

**Dot notation** — for identifier keys:

```
let x = point.x;       // 50
let r = shape.radius;   // 50
```

**Bracket notation** — for any string key, including dynamic expressions:

```
let x = point['x'];     // 50

let key = 'name';
let val = config[key];   // 'Dave'
```

Accessing a key that doesn't exist returns `null`:

```
let missing = point.z;       // null
let also = point['nope'];    // null
```

The `length` property returns the number of keys:

```
let size = point.length;  // 2
```

## Writing Properties

Use bracket notation to set or update properties:

```
let obj = {};
obj['x'] = 10;
obj['y'] = 20;
obj['x'] = 99;  // overwrite
```

This also works for updating array elements:

```
let arr = [1, 2, 3];
arr[0] = 99;  // arr is now [99, 2, 3]
```

Assigning to an element of an array that is currently being iterated — from inside a `.map`/`.filter`/`.reduce`/`.sort` block or a `for (item in arr)` body — is an error. See the syntax reference's Reference Semantics section for the iteration lock.

## Checking Key Existence

Use `.has()` to check if a key exists:

```
let obj = { name: 'Alice' };
if (obj.has('name')) {
  // true
}
if (obj.has('age')) {
  // false
}
```

## Object Namespace Functions

The `Object` namespace provides utility functions:

### Object.keys(obj)

Returns an array of all keys:

```
let obj = { a: 1, b: 2, c: 3 };
let keys = Object.keys(obj);  // ['a', 'b', 'c']
```

### Object.values(obj)

Returns an array of all values:

```
let vals = Object.values(obj);  // [1, 2, 3]
```

### Object.entries(obj)

Returns an array of `[key, value]` pairs:

```
let entries = Object.entries(obj);  // [['a', 1], ['b', 2], ['c', 3]]
```

### Object.delete(obj, key)

Removes a key from the object. Returns the deleted value, or `null` if the key didn't exist:

```
let obj = { x: 10, y: 20 };
let deleted = Object.delete(obj, 'x');  // 10
// obj is now { y: 20 }
```

## Iterating Over Objects

### Keys only

```
let obj = { x: 10, y: 20 };
for (key in obj) {
  log(key);  // 'x', then 'y'
}
```

### Key-value pairs

```
for ([key, value] in obj) {
  log(key, value);  // 'x' 10, then 'y' 20
}
```

This also works with `Object.entries()`:

```
for ([key, value] in Object.entries(obj)) {
  log(key, value);
}
```

## Reference Semantics

Objects use reference semantics (like arrays). Assigning an object to another variable shares the same underlying data:

```
let a = { x: 1 };
let b = a;
b['x'] = 99;
log(a.x);  // 99 — both a and b point to the same object
```

Unlike arrays, objects are **not** locked during iteration — `for (key in obj)` walks a snapshot of the keys, and mutating the object inside the body is allowed. The iteration lock described in the syntax reference's Reference Semantics section applies to arrays only.

## Merging Objects (`<<`)

The `<<` operator creates a new object by merging two objects together. Properties from the right side override those on the left:

```
let a = { x: 1, y: 2 };
let b = { y: 99, z: 3 };
let merged = a << b;
log(merged);  // {x: 1, y: 99, z: 3}
```

The original objects are not modified:

```
log(a);  // {x: 1, y: 2} — unchanged
```

Multiple merges can be chained (evaluated left-to-right):

```
let defaults = { stroke: 'black', width: 2, fill: 'none' };
let theme = { stroke: 'red' };
let overrides = { width: 4 };
let final = defaults << theme << overrides;
// {stroke: 'red', width: 4, fill: 'none'}
```

Merge is shallow — nested objects are shared by reference, not deep-copied:

```
let inner = { val: 1 };
let a = { nested: inner };
let b = a << {};
b.nested['val'] = 99;
log(a.nested.val);  // 99 — same inner object
```

## Destructuring

Extract object properties into individual variables with destructuring in `let` declarations:

```
let point = { x: 50, y: 80 };
let { x, y } = point;
log(x);  // 50
log(y);  // 80
```

If a key doesn't exist, the variable is set to `null`:

```
let { x, z } = { x: 1, y: 2 };
// x is 1, z is null
```

Rename properties with `key: localName` syntax:

```
let point3d = { x: 1, y: 2, z: 3 };
let { z: depth } = point3d;
log(depth);  // 3
```

Use the rest pattern (`...name`) to collect remaining properties into a new object:

```
let config = { x: 1, y: 2, z: 3, w: 4 };
let { x, ...rest } = config;
// x is 1, rest is { y: 2, z: 3, w: 4 }
```

The rest pattern must be the last binding in the destructuring pattern.

### Destructuring Built-in Values

Destructuring is not limited to object literals — it also works on Pathogen's
fixed-shape struct values, the built-ins with a known, fixed set of
properties: `Point`, `PolarVector`, `Grid`, `MeshPoint` (from mesh
gradients), `Color`, `Angle` (`let { deg, rad, pi, turns } = 90deg;` — see
[Angle Units](#syntax-angle-units)), and context objects like
`ctx.position`. It does not
work on open-ended built-ins like `TextBlock` or `ProjectedPath`, even
though those support dot access.

```
let point = Point(20, 20);
let { x, y } = point;
log(x);  // 20
log(y);  // 20
```

```
let { angle, distance } = PolarVector(45deg, 100);
// angle is 0.7853... — a plain number in radians, not an Angle value:
// an Angle goes into the constructor, a number comes back out

let grid = Grid(4, 5, { xDim: 10, yDim: 10 });
let { rows, cols, width, height } = grid;
// rows is 4, cols is 5, width is 50, height is 40

let { lightness, chroma, hue } = oklch(0.7 0.15 200);
// lightness is 0.7, chroma is 0.15, hue is 200
```

Because path commands move the pen, you can destructure the live pen
position mid-path from `ctx.position`:

```
M 50 50
L 120 80
let { x, y } = ctx.position;
// x is 120, y is 80
```

Renaming works too:

```
let { x: px, y: py } = Point(10, 30);
// px is 10, py is 30
```

Unlike object literals, built-in values have a fixed set of properties, so
destructuring a key that doesn't exist is an error rather than `null` —
the same behavior as dot access:

```
let { z } = Point(1, 2);
// Error: Property 'z' does not exist on Point
```

The rest pattern collects the remaining properties into a plain object.
Computed properties are included — for example, a `Grid` rest includes
`width` and `height`:

```
let { x, ...rest } = Point(1, 2);
// x is 1, rest is { y: 2 }

let { rows, cols, ...dims } = Grid(4, 5, { xDim: 10, yDim: 10 });
// dims.width is 50, dims.height is 40
// dims also includes xDim, yDim, origin, outOfBounds, interpolation
```

## Using Objects with Path Commands

Objects are natural containers for coordinates and configuration:

```
let start = { x: 10, y: 20 };
let end = { x: 180, y: 160 };

M start.x start.y
L end.x end.y
```

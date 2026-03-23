# Objects

Objects are key-value containers for grouping related data — coordinates, configuration, metadata, or any structured values.

## Object Literals

Create objects with curly braces and `key: value` pairs:

```
let obj = {};
let point = { x: 50, y: 80 };
let config = { name: 'Dave', age: 32, cats: ['foo', 'bar', 'baz'] };
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

## Using Objects with Path Commands

Objects are natural containers for coordinates and configuration:

```
let start = { x: 10, y: 20 };
let end = { x: 180, y: 160 };

M start.x start.y
L end.x end.y
```

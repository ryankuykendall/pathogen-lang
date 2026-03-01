# Gradients

Gradients define SVG paint servers (`<linearGradient>` and `<radialGradient>`) that can be used as `fill` or `stroke` values on layers.

## LinearGradient

Create a linear gradient with an ID and coordinates defining the gradient axis:

```
let fade = LinearGradient('fade', 0, 0, 1, 1) {|g|
  g.stop(0, Color('#e63946'));
  g.stop(0.5, Color('#f4a261'));
  g.stop(1, Color('#2a9d8f'));
};
```

Constructor signature: `LinearGradient(id, x1, y1, x2, y2)` — coordinates are in `objectBoundingBox` units by default (0–1 range).

## RadialGradient

Create a radial gradient with an ID, center point, and radius:

```
let glow = RadialGradient('glow', 0.5, 0.5, 0.5) {|g|
  g.stop(0, Color('#ffffff'));
  g.stop(1, Color('#000000').alpha(0));
};
```

Constructor signature: `RadialGradient(id, cx, cy, r)` — optional focal point: `RadialGradient(id, cx, cy, r, fx, fy)`.

## Trailing Block Syntax

Both constructors accept a trailing block `{|g| ... }` where `g` is bound to the newly created gradient. Use `g.stop(offset, color)` inside the block to add color stops:

- **offset** — a number from 0 to 1 (position along the gradient axis)
- **color** — any Color value (`Color('#hex')`, `Color('named')`, OKLCH constructor, etc.)

The block is optional — you can create an empty gradient and add stops later or use `.inherit()` to derive from another gradient.

```
let empty = LinearGradient('empty', 0, 0, 1, 0);
```

## Using Gradients in Styles

Reference a gradient in `fill` or `stroke` style properties. The compiler automatically wraps the gradient ID as `url(#id)`:

```
let g = LinearGradient('sunset', 0, 0, 1, 0) {|g|
  g.stop(0, Color('#e63946'));
  g.stop(1, Color('#2a9d8f'));
};

define PathLayer('bg') ${ fill: g; stroke: none; }

layer('bg').apply {
  M 0 0 L 200 0 L 200 200 L 0 200 Z
}
```

This produces `fill="url(#sunset)"` on the output `<path>` element, with a `<linearGradient id="sunset">` in `<defs>`.

## Gradient Attributes

Set optional attributes via property assignment after creation:

```
let g = LinearGradient('repeat-fade', 0, 0, 0.25, 0) {|g|
  g.stop(0, Color('#e63946'));
  g.stop(1, Color('#2a9d8f'));
};

g.spreadMethod = 'repeat';
g.gradientUnits = 'userSpaceOnUse';
g.gradientTransform = 'rotate(45)';
```

| Property | Values | Default |
|----------|--------|---------|
| `spreadMethod` | `'pad'`, `'reflect'`, `'repeat'` | `'pad'` |
| `gradientUnits` | `'objectBoundingBox'`, `'userSpaceOnUse'` | `'objectBoundingBox'` |
| `gradientTransform` | SVG transform string | none |

## Gradient Inheritance

Create a new gradient that inherits stops and attributes from an existing one using `.inherit(newId)`:

```
let base = LinearGradient('base', 0, 0, 1, 0) {|g|
  g.stop(0, Color('#e63946'));
  g.stop(0.5, Color('#f4a261'));
  g.stop(1, Color('#2a9d8f'));
};

let rotated = base.inherit('rotated');
rotated.gradientTransform = 'rotate(90, 0.5, 0.5)';
```

The inherited gradient uses SVG's `href` attribute to reference the parent. It inherits all stops and attributes from the parent, and you can override specific attributes on the child. Inherited gradients with no stops of their own produce self-closing elements.

## Property Access

| Expression | Returns |
|------------|---------|
| `gradient.id` | The gradient's string ID |
| `gradient.spreadMethod` | Current spreadMethod or `undefined` |
| `gradient.gradientUnits` | Current gradientUnits or `undefined` |
| `gradient.gradientTransform` | Current gradientTransform or `undefined` |

## Dynamic Stop Generation

Use loops and expressions inside the trailing block for programmatic stops:

```
let ramp = LinearGradient('ramp', 0, 0, 1, 0) {|g|
  let colors = ['#e63946', '#f4a261', '#2a9d8f', '#264653', '#e9c46a'];
  for ([color, i] in colors) {
    g.stop(calc(i / 4), Color(color));
  }
};
```

Any statement valid in the language can appear inside the block — `for` loops, `if` statements, `let` bindings, function calls, etc.

## SVG Output

The compiler produces gradient definitions in the `<defs>` section:

```xml
<defs>
  <linearGradient id="fade" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="rgb(89.56% 22.41% 27.51%)"/>
    <stop offset="0.5" stop-color="rgb(95.69% 63.53% 38.04%)"/>
    <stop offset="1" stop-color="rgb(16.47% 61.57% 56.08%)"/>
  </linearGradient>
</defs>
```

Radial gradients use the `<radialGradient>` tag with `cx`, `cy`, `r` (and optionally `fx`, `fy`) attributes.

Inherited gradients use `href`:

```xml
<linearGradient id="rotated" href="#base" gradientTransform="rotate(90, 0.5, 0.5)"/>
```

## Output Format

When using the JavaScript API, gradients appear in `result.gradients`:

```js
const result = compile(`
  let g = LinearGradient('fade', 0, 0, 1, 1) {|g|
    g.stop(0, Color('#e63946'));
    g.stop(1, Color('#2a9d8f'));
  };
`);

// result.gradients:
// [
//   {
//     id: 'fade',
//     type: 'linear',
//     attrs: { x1: '0', y1: '0', x2: '1', y2: '1' },
//     stops: [
//       { offset: 0, color: 'rgb(89.56% 22.41% 27.51%)' },
//       { offset: 1, color: 'rgb(16.47% 61.57% 56.08%)' }
//     ]
//   }
// ]
```

## Error Handling

| Error | Cause |
|-------|-------|
| `Duplicate defs ID 'x'` | Gradient ID conflicts with another gradient, mask, or clipPath |
| `LinearGradient() expects 5 arguments` | Wrong argument count |
| `RadialGradient() expects 4-6 arguments` | Wrong argument count |
| `First argument must be a string` | Non-string ID |
| `stop() offset must be a number` | Non-numeric stop offset |
| `stop() color must be a Color value` | Non-Color stop color |

## Full Example

```
// Define a gradient palette
let warm = LinearGradient('warm', 0, 0, 0, 1) {|g|
  g.stop(0, Color('#e63946'));
  g.stop(0.5, Color('#f4a261'));
  g.stop(1, Color('#e9c46a'));
};

let cool = RadialGradient('cool', 0.5, 0.5, 0.5) {|g|
  g.stop(0, Color('#2a9d8f'));
  g.stop(1, Color('#264653'));
};

// Use in layer styles
define PathLayer('bg') ${ fill: warm; stroke: none; }
define PathLayer('circle') ${ fill: cool; stroke: none; }

layer('bg').apply {
  M 0 0 L 200 0 L 200 200 L 0 200 Z
}

layer('circle').apply {
  circle(100, 100, 60)
}
```

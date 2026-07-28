# Layers

Layers let you output multiple `<path>` elements from a single program, each with its own styles and independent pen tracking.

See also [`define ViewBox`](#viewbox-viewbox) for declaring the SVG viewBox — a sibling `define`-family statement that controls the canvas dimensions.

## Defining Layers

Use `define` to create a named layer with a style block:

```
define PathLayer('outline') ${
  stroke: #cc0000;
  stroke-width: 3;
  fill: none;
}
```

Layer names must be unique strings. The style block uses CSS/SVG property syntax — any SVG presentation attribute works (`stroke`, `fill`, `opacity`, `stroke-dasharray`, etc.).

> **Breaking change:** Style blocks now use `${ }` syntax instead of `{ }`. Update existing layer definitions: `{ stroke: red; }` → `${ stroke: red; }`.

### Default Layer

Every program has exactly **one** default layer — the layer that receives all bare path commands (commands outside any `layer().apply` block). You don't create it; it always exists. `define default PathLayer('name')` simply **names and styles** that one layer:

```
define default PathLayer('main') ${
  stroke: #333;
  stroke-width: 2;
  fill: none;
}

// These commands go to 'main' — the default layer
M 10 10
L 90 10
L 90 90
Z
```

If you never write `define default PathLayer`, the default layer is still there: bare commands flow into it and it appears in the output named `'default'` (with no styles). There is no separate "global" layer alongside the default — bare commands, the pen position (`ctx`), and any top-level transform all belong to this single default layer, whether or not you have named it.

## Writing to Layers

Use `layer('name').apply { ... }` to send commands to a specific layer:

```
define PathLayer('grid') ${
  stroke: #ddd;
  stroke-width: 0.5;
}

define default PathLayer('shape') ${
  stroke: #333;
  stroke-width: 2;
  fill: none;
}

// Draw a grid on the 'grid' layer
layer('grid').apply {
  for (i in 0..10) {
    M calc(i * 20) 0
    V 200
    M 0 calc(i * 20)
    H 200
  }
}

// These go to 'shape' (the default)
M 40 40
L 160 40
L 100 160
Z
```

### Context Isolation

Each layer has its own pen position. Commands in one layer don't affect another layer's `ctx`:

```
define default PathLayer('a') ${ stroke: red; }
define PathLayer('b') ${ stroke: blue; }

M 100 100    // layer 'a' position: (100, 100)

layer('b').apply {
  M 50 50    // layer 'b' position: (50, 50)
}

// Back in layer 'a', position is still (100, 100)
L 200 200
```

## Querying Labeled Geometry

Path commands inside `apply { }` blocks can carry [`as segment(...)` / `as endpoint(...)` labels](#segment-labels-segment-labels-corner-suffixes). A labeled layer answers geometry queries by name from anywhere:

```
let pl = PathLayer('outline') ${ stroke: #333; fill: none; };
pl.apply {
  M 10 10
  h 60 as segment('top');
  v 40 as endpoint('corner');
}

let top = layer('outline').segment('top');   // ProjectedPath (absolute coords)
let c = layer('outline').point('corner');    // Point(70, 50)
```

`segment('name')` returns a `ProjectedPath` with the full sampling API (`get`, `tangent`, `partition`, `boundingBox`, ...); `point('name')` returns the labeled vertex as a Point. See [Segment Labels & Corner Suffixes](#segment-labels-segment-labels-corner-suffixes) for the full query surface.

## Accessing Layer Context

Use `layer('name').ctx` to read a layer's pen state from anywhere:

```
define default PathLayer('main') ${ stroke: #333; }
define PathLayer('markers') ${ stroke: red; fill: red; }

M 50 50
L 150 80
L 100 150

// Draw markers at the main layer's current position
layer('markers').apply {
  let px = layer('main').ctx.position.x
  let py = layer('main').ctx.position.y
  circle(px, py, 4)
}
```

Available context properties:

| Expression | Description |
|------------|-------------|
| `layer('name').ctx.position.x` | Current X position |
| `layer('name').ctx.position.y` | Current Y position |
| `layer('name').ctx.start.x` | Subpath start X |
| `layer('name').ctx.start.y` | Subpath start Y |
| `layer('name').name` | Layer name string |

## Dynamic Layer Names

Layer names can be expressions, including variables:

```
let target = 'overlay'
define PathLayer(target) ${ stroke: blue; }

layer(target).apply {
  M 0 0 L 100 100
}
```

## Dynamic Layer Creation

Layers can also be created as first-class values using `PathLayer()` and `TextLayer()` constructor expressions. This allows storing layers in variables, appending styles after creation, and using `.apply { }` directly on the variable.

### Constructor Expression

```
let myLayer = PathLayer('unique-name') ${ stroke: red; fill: none; };
myLayer.apply { M 0 0 L 100 100 }
```

The style block is optional:

```
let myLayer = PathLayer('unique-name');
myLayer.apply { M 0 0 }
```

### Style Mutation with `<<`

The `<<` operator on a layer reference merges styles in place and returns the reference for chaining:

```
let l = PathLayer('outline');
l << ${ stroke: red; } << ${ fill: blue; };
l.apply { M 0 0 L 100 100 }
// l.styles: stroke: red, fill: blue
```

### Explicit `.styles` Property

Read or replace a layer's styles via the `.styles` property:

```
let l = PathLayer('outline') ${ stroke: red; };

// Read: returns a StyleBlockValue copy
let s = l.styles;
log(s.stroke)  // "red"

// Write: replaces all styles
l.styles = l.styles << ${ fill: blue; };
```

### TextLayer Constructor

```
let labels = TextLayer('labels') ${ font-size: 14; font-family: monospace; };
labels.apply { text(50, 45)`Start` }
```

### Accessing Layer Properties

Dynamic layers support the same properties as `layer()` references:

| Expression | Description |
|------------|-------------|
| `myLayer.name` | Layer name string |
| `myLayer.ctx` | Path context (PathLayer only) |
| `myLayer.styles` | Style block (read/write) |

### Coexistence with `define`

Both approaches work together. The `define` syntax supports the `default` modifier; dynamic constructors do not:

```
define default PathLayer('main') ${ stroke: #333; fill: none; }
let overlay = PathLayer('overlay') ${ stroke: red; };

M 10 10 L 90 90          // goes to 'main' (default)
overlay.apply { M 50 50 L 60 60 }

// layer() function works for both:
layer('overlay').apply { M 70 70 }
```

Layers render in definition order regardless of how they were created.

## Style Properties

Style properties map directly to SVG presentation attributes. Common properties:

| Property | Example | Description |
|----------|---------|-------------|
| `stroke` | `#cc0000` | Stroke color |
| `stroke-width` | `3` | Stroke width |
| `stroke-linecap` | `round` | Line cap style |
| `stroke-linejoin` | `round` | Line join style |
| `stroke-dasharray` | `4 2` | Dash pattern |
| `stroke-dashoffset` | `1` | Dash offset |
| `stroke-opacity` | `0.5` | Stroke opacity |
| `fill` | `none` | Fill color |
| `fill-opacity` | `0.3` | Fill opacity |
| `opacity` | `0.8` | Overall opacity |

Each property is a semicolon-terminated declaration:

```
define PathLayer('dashed') ${
  stroke: #0066cc;
  stroke-width: 2;
  stroke-dasharray: 8 4;
  fill: none;
}
```

## Output Format

When using the JavaScript API, `compile()` returns a structured result:

```js
import { compile } from 'pathogen-lang';

const result = compile(`
  define default PathLayer('bg') ${
    stroke: #ddd;
    fill: none;
  }
  define PathLayer('fg') ${
    stroke: #333;
    stroke-width: 2;
    fill: none;
  }

  M 0 0 H 100 V 100 H 0 Z

  layer('fg').apply {
    M 20 20 L 80 80
  }
`);

// result.layers is an array of LayerOutput:
// [
//   {
//     name: 'bg',
//     type: 'path',
//     data: 'M 0 0 H 100 V 100 H 0 Z',
//     styles: { stroke: '#ddd', fill: 'none' },
//     isDefault: true
//   },
//   {
//     name: 'fg',
//     type: 'path',
//     data: 'M 20 20 L 80 80',
//     styles: { stroke: '#333', 'stroke-width': '2', fill: 'none' },
//     isDefault: false
//   }
// ]
```

Programs without any `define` statements produce a single implicit layer:

```js
compile('M 0 0 L 100 100').layers
// [{ name: 'default', type: 'path', data: 'M 0 0 L 100 100', styles: {}, isDefault: true }]
```

## Full Example

A multi-layer illustration with a background grid, main shape, and annotation markers:

```
// Layer definitions
define PathLayer('grid') ${
  stroke: #e0e0e0;
  stroke-width: 0.5;
}

define default PathLayer('shape') ${
  stroke: #333333;
  stroke-width: 2;
  fill: none;
  stroke-linejoin: round;
}

define PathLayer('points') ${
  stroke: #cc0000;
  fill: #cc0000;
}

// Grid
layer('grid').apply {
  for (i in 0..10) {
    M calc(i * 20) 0  V 200
    M 0 calc(i * 20)  H 200
  }
}

// Shape (goes to default layer)
let cx = 100
let cy = 100
let r = 60
let sides = 6

for (i in 0..sides) {
  let angle = calc(i * 360 / sides - 90)
  let x = calc(cx + r * cos(radians(angle)))
  let y = calc(cy + r * sin(radians(angle)))
  if (i == 0) { M x y } else { L x y }
}
Z

// Mark each vertex
layer('points').apply {
  for (i in 0..sides) {
    let angle = calc(i * 360 / sides - 90)
    let x = calc(cx + r * cos(radians(angle)))
    let y = calc(cy + r * sin(radians(angle)))
    circle(x, y, 3)
  }
}
```

## TextLayer

TextLayers produce SVG `<text>` elements instead of `<path>` elements.

### Defining a TextLayer

```
define TextLayer('labels') ${
  font-size: 14;
  font-family: monospace;
  fill: #333;
}
```

### text() — Two Forms

**Inline form** — simple text content:

```
layer('labels').apply {
  text(50, 45)`Start`
  text(150, 75, 30deg)`End`    // rotation uses angle units (deg/rad/pi)
}
```

**Block form** — mixed text runs and tspan children:

```
layer('labels').apply {
  text(10, 180) {
    `Hello `
    tspan(0, 0, 30deg)`world`
    ` and more`
  }
}
```

The block form maps to SVG's mixed content model:
`<text x="10" y="180">Hello <tspan rotate="30">world</tspan> and more</text>`

Note: `30deg` in the source becomes `rotate="30"` (degrees) in SVG output.

### tspan() — Only Inside text() Blocks

```
tspan()`content`                   // no offset
tspan(dx, dy)`content`             // with offsets
tspan(dx, dy, 45deg)`content`      // with offsets and rotation
```

Position arguments (x, y, dx, dy) are plain numbers. Rotation follows the standard angle unit convention — bare numbers are radians, use `deg`/`rad`/`pi` suffixes for explicit units. Content is always a template literal.

### Template Literals

Template literals use backtick syntax with `${expression}` interpolation. They work everywhere — text content, log messages, variable values:

```
let name = "World"
let x = `Hello ${name}!`              // "Hello World!"
let msg = `Score: ${2 + 3}`           // "Score: 5"
log(`Position: ${ctx.position.x}`)    // in log messages
```

Template literals are the sole string construction mechanism — `+` stays strictly numeric. String equality (`==`/`!=`) works for conditionals:

```
let mode = "dark"
if (mode == "dark") { /* ... */ }
if (mode != "light") { /* ... */ }
```

### TextLayer Output Format

```js
const result = compile(`
  define TextLayer('labels') ${ font-size: 14; fill: #333; }
  layer('labels').apply {
    text(50, 45)\`Start\`
    text(10, 180) {
      tspan()\`Multi-\`
      tspan(0, 16)\`line\`
    }
  }
`);

// result.layers[0]:
// {
//   name: 'labels',
//   type: 'text',
//   data: 'Start Multi-line',
//   textElements: [
//     { x: 50, y: 45, children: [{ type: 'run', text: 'Start' }] },
//     { x: 10, y: 180, children: [
//       { type: 'tspan', text: 'Multi-' },
//       { type: 'tspan', text: 'line', dx: 0, dy: 16 },
//     ]},
//   ],
//   styles: { 'font-size': '14', fill: '#333' },
//   isDefault: false,
// }
```

### Restrictions

- `text()` can only be used inside a `layer().apply` block targeting a TextLayer
- `tspan()` can only appear inside a `text() { }` block
- Path commands (`M`, `L`, etc.) cannot be used inside a TextLayer apply block
- If a TextLayer is the default layer, bare path commands will throw an error

## Style Blocks

Style blocks are first-class values that can be stored in variables, merged, and accessed via dot notation.

### Style Block Literals

```
let styles = ${
  stroke-dasharray: 0.01 20;
  stroke-linecap: round;
  stroke-width: 8.4;
};
```

### Merge Operator (`<<`)

The `<<` operator merges two style blocks, with the right side overriding the left:

```
let base = ${ stroke: red; stroke-width: 2; };
let merged = base << ${ stroke-width: 4; fill: blue; };
// merged has: stroke: red, stroke-width: 4, fill: blue
```

### Property Access

Use dot notation with camelCase to read kebab-case properties:

```
let styles = ${ stroke-width: 4; };
let sw = styles.strokeWidth;  // reads 'stroke-width' → "4"
```

### Expression Evaluation in Values

Style block values are try-evaluated: if a value parses and evaluates as an expression, its result is used. Otherwise the raw string is kept:

```
let dynamic = ${
  font-size: calc(12 + 15);       // evaluates to "27"
  stroke-width: randomRange(2, 8); // evaluates to a random number
  stroke: rgb(232, 74, 166);       // kept as raw string
  fill: #996633;                   // kept as raw string
};
```

### Variables and Interpolation in Values

This is the same expression evaluation from the previous section applied to variables: a bare identifier is just an expression that resolves to its value, and a backtick template is an expression that interpolates with `${...}`:

```
let family = "Noto Sans";
let size = 16;

let textStyles = ${
  font-family: family;              // resolves to "Noto Sans"
  font-size: `${size * 2}`;         // interpolates to "32"
};
```

Double-quoted strings are always literal — they never interpolate. `font-family: "family";` is the literal family name `family`, not the variable; use a bare identifier or backticks for dynamic values. (Inside a `${...}` interpolation, at most one nested level of `{ }` braces is supported.)

#### Dynamic Function Arguments

A template doesn't have to span the whole value — a backtick fragment can sit anywhere inside it, including function arguments. Each fragment evaluates and splices into the surrounding text before the value is checked:

```
let amount = randomRange(1.1, 2.2);

define PathLayer('soft') ${
  fill: hotpink;
  filter: blur(`${amount}`px);   // splices to e.g. "blur(1.63px)"
};
layer('soft').apply { circle(100, 100, 60); }
```

These four forms are all available, and all produce `blur(1.5px) brightness(1.4)` for `softness = 1.5`, `level = 1.4`:

| Form | Example | Use when |
|------|---------|----------|
| Fragment, unit outside | `` blur(`${softness}`px) `` | Most cases — the unit stays visible as CSS |
| Fragment, unit inside | `` blur(`${softness}px`) `` | The unit itself is computed |
| Whole-value template | `` `blur(${softness}px)` `` | The whole value is one interpolated string |
| Bare identifier | `brightness(level)` | The argument is a **unitless** number — a length or angle here is a compile error |

The quoting rule above still applies to fragments: a backtick inside a double- or single-quoted string is literal text, not a splice point.

A bare identifier works as a function argument when the variable holds a number — the compiler substitutes the value, as it already does for Color and `CSSVar()` references:

```
let level = 1.4;
define PathLayer('bright') ${ filter: brightness(level); };
```

**Substitution is not unit-aware, and the compiler checks the result.** A numeric variable substitutes as a bare number, so `filter: blur(amount);` would emit `blur(4)` — a unitless length, which is invalid CSS. Rather than emit a declaration the browser silently drops, Pathogen rejects it:

```
blur() takes a length — "4" needs a unit (try 4px). Lengths without a valid
unit are invalid CSS and the browser drops the whole declaration.
```

The check runs on the final value, so it catches the mistake whether the number was typed literally, substituted from a variable, or interpolated. Use a bare identifier for the unitless filter functions (`brightness`, `contrast`, `grayscale`, `invert`, `opacity`, `saturate`, `sepia`); whenever the argument is a length or an angle, attach the unit with a template fragment. Literal arguments written with units (`blur(2px)`, `hue-rotate(-90deg)`) are always left exactly as typed. See [CSS Function Values](#syntax-css-function-values) for the full per-function unit rules.

Interpolation is a convenience, not an escape hatch: every interpolated result — whole-value or fragment — is validated against the same style-value allow-list as hand-written values (see the [security model](#security-whats-allowed-in-style-blocks)). Note the two `calc()`s are different things: an unquoted `calc(12 + 15)` is Pathogen arithmetic resolved before emission, while a `calc()` that survives *into* the emitted CSS string — including via interpolation — is rejected.

### Layer Definitions with Style Expressions

Layer definitions accept any expression that evaluates to a style block:

```
let baseStyles = ${ stroke: red; stroke-width: 2; };
define PathLayer('main') baseStyles << ${ fill: none; }
```

### Per-Element Styles on Text and Tspan

Pass style blocks as the 4th argument to `text()` or `tspan()`:

```
let bold = ${ font-weight: bold; };
layer('labels').apply {
  text(10, 20, 0, bold)`Hello`
  text(50, 80) {
    tspan(0, 0, 0, ${ fill: red; })`colored`
  }
}
```

## Transforms

Apply SVG matrix transformations (translate, rotate, scale) at the layer level. Transforms are set via method calls on `ctx.transform` and rendered as SVG `transform` attributes on the output elements.

### Translate

```
define PathLayer('shape') ${ stroke: #333; fill: none; }

layer('shape').ctx.transform.translate.set(50, 50)

layer('shape').apply {
  M 0 0 L 100 0 L 100 100 Z
}
// Output: <path d="..." transform="translate(50, 50)"/>
```

### Rotate

Angles are in **radians** (consistent with polar commands). Use `deg` suffix for degrees:

```
layer('shape').ctx.transform.rotate.set(45deg)         // around origin
layer('shape').ctx.transform.rotate.set(45deg, 50, 50) // around (50, 50)
```

### Scale

```
layer('shape').ctx.transform.scale.set(2, 2)             // uniform scale
layer('shape').ctx.transform.scale.set(2, 2, 50, 50)     // scale around (50, 50)
```

### Reset

```
layer('shape').ctx.transform.translate.reset()  // clear translate only
layer('shape').ctx.transform.rotate.reset()     // clear rotate only
layer('shape').ctx.transform.scale.reset()      // clear scale only
layer('shape').ctx.transform.reset()            // clear all transforms
```

### Read Access

```
layer('shape').ctx.transform.translate.x    // 0 if not set
layer('shape').ctx.transform.translate.y
layer('shape').ctx.transform.rotate.angle   // 0 if not set
layer('shape').ctx.transform.scale.x        // 1 if not set (default scale)
layer('shape').ctx.transform.scale.y        // 1 if not set
```

### Default Layer Context

Outside any `layer().apply` block, `ctx` refers to the default layer's context — including its transform. This is true whether or not you have named the default layer with `define default PathLayer`:

```
ctx.transform.translate.set(25, 25)
ctx.transform.rotate.set(45deg)
M 0 0 L 100 0
```

### Inside Apply Blocks

Inside a `layer().apply` block, `ctx` refers to the active layer's context:

```
layer('shape').apply {
  ctx.transform.translate.set(10, 20)
  M 0 0 L 50 50
}
```

### Combined Transforms

When multiple transforms are set, they are applied in SVG order: **translate → rotate → scale** (translate applied last visually):

```
layer('shape').ctx.transform.translate.set(10, 20)
layer('shape').ctx.transform.rotate.set(90deg)
layer('shape').ctx.transform.scale.set(2, 2)
// Output: transform="translate(10, 20) rotate(90) scale(2, 2)"
```

### Transform Convenience Properties

Style blocks support individual transform properties as an alternative to `transform: ...` or the imperative API. These work on PathLayer, GroupLayer, and TextLayer:

```
define PathLayer('p') ${
  translate-x: 50;
  translate-y: 100;
  scale-x: 2;
  scale-y: 2;
  rotate: 0.25pi;
}
// Output: transform="translate(50, 100) rotate(45) scale(2, 2)"
```

Shorthands for translate and scale accept comma-separated values:

```
define PathLayer('p') ${ translate: 50, 100; scale: 2, 3; }
// Output: transform="translate(50, 100) scale(2, 3)"
```

Single-value `scale` uses the same value for both axes:

```
define PathLayer('p') ${ scale: 2; }
// Output: transform="scale(2, 2)"
```

The `rotate` value is an expression in radians (angle units like `deg` and `pi` work normally):

```
define PathLayer('p') ${ rotate: 45deg; }
// Output: transform="rotate(45)"
```

**Precedence**: An explicit `transform` property overrides convenience properties. Convenience properties override imperative `ctx.transform` calls. The individual `translate-x`/`translate-y` properties override the `translate` shorthand (and similarly for scale).

Convenience properties are removed from the output styles — they only affect the `transform` attribute.

### Per-Layer Isolation

Each layer has independent transforms — setting a transform on one layer does not affect others:

```
define PathLayer('a') ${ stroke: red; }
define PathLayer('b') ${ stroke: blue; }

layer('a').ctx.transform.translate.set(10, 10)
layer('b').ctx.transform.scale.set(2, 2)
// Layer 'a' gets translate(10, 10), layer 'b' gets scale(2, 2)
```

## GroupLayer

GroupLayers map to SVG `<g>` elements and organize child layers via `.append()`. They support transforms through style blocks and the imperative `ctx.transform` API, but do not support apply blocks.

### Definition

```
// Define a group with styles
let panel = GroupLayer('panel') ${ opacity: 0.8; };

// Or with define (cannot be default)
define GroupLayer('panel') ${ opacity: 0.8; }
```

GroupLayers **cannot** be the default layer — `define default GroupLayer(...)` is an error.

### Adding Children with `.append()`

Use `.append(ref1, ref2, ...)` to add layers as children of a group. All arguments must be layer references:

```
let panel = GroupLayer('panel') ${};
let bg = PathLayer('bg') ${ fill: #eee; };
bg.apply { rect(0, 0, 200, 200) }

let label = TextLayer('label') ${ font-size: 14; fill: #333; };
label.apply { text(10, 20)`Panel Title` }

// Append children to group
panel.append(bg, label)
```

Output SVG:
```xml
<g>
  <path d="..." fill="#eee" .../>
  <text x="10" y="20" font-size="14" fill="#333">Panel Title</text>
</g>
```

Appended layers are removed from the top-level output and rendered inside the group.

### Nesting Groups

Groups can contain other groups, up to a maximum nesting depth of 10:

```
let inner = GroupLayer('inner') ${};
let child = PathLayer('child') ${};
child.apply { M 5 5 }
inner.append(child)

let outer = GroupLayer('outer') ${};
outer.append(inner)
```

### Transforms

GroupLayers support both style block transforms and imperative transforms:

```
// Style block transform
let panel = GroupLayer('panel') ${ transform: translate(50, 100); };

// Imperative transform
panel.ctx.transform.rotate.set(0.785)
panel.ctx.transform.scale.set(2, 2)
```

When both are present, the style block transform takes precedence.

### Moving Layers Between Groups

Appending a layer that already belongs to another group moves it. A warning log is emitted:

```
let g1 = GroupLayer('g1') ${};
let g2 = GroupLayer('g2') ${};
let child = PathLayer('child') ${};
g1.append(child)  // child is in g1
g2.append(child)  // child moves to g2, warning logged
```

### No Apply Blocks

GroupLayers do not support `.apply` blocks. Use `.append()` to add children:

```
// This is an error:
// g.apply { M 0 0 }

// Use .append() instead:
g.append(myPath)
```

## Limitations

- **No nesting apply blocks** — `layer().apply` blocks cannot be nested inside each other
- **Layer order** — layers render in definition order (first defined = bottom)
- **GroupLayer nesting** — maximum depth of 10 levels
- **PathLayer transforms only** — transforms are currently available on PathLayers and GroupLayers via `ctx.transform`; TextLayer transform support can be added later

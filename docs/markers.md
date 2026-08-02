# Markers

Markers decorate lines and path vertices — arrowheads at the end of a connector, dots at each vertex of a polyline, endpoint caps on a freehand stroke. Define a marker **once** with the `Marker()` constructor and attach it to any number of layers via the `marker-start`, `marker-mid`, and `marker-end` style properties; special paint values `context-stroke` and `context-fill` let one marker automatically track each line's color.

Markers live in the shared `<defs>` block alongside gradients, patterns, and masks, and are referenced via `url(#id)`.

## Creating a Marker

Use the `Marker()` constructor with a unique ID and the marker's intrinsic width and height:

```
let arrow = @{
  m 0 0 l 10 5 l -10 5 z
};

let arrowMarker = Marker('arrowhead', 10, 10) {|m|
  m.append(arrow, ${ fill: Color('#333'); });
};

define PathLayer('line') ${
  stroke: Color('#333');
  stroke-width: 3;
  fill: none;
  marker-end: arrowMarker;
}

layer('line').apply {
  M 40 100 L 360 100
}
```

Constructor signature: `Marker(id, markerWidth, markerHeight)` — `id` is a string, `markerWidth` and `markerHeight` are numbers in user-space units.

The trailing block `{|m| ... }` binds the newly-created marker to `m`. Use `m.append(...)` inside the block to add the marker's path content.

## Appending Paths

Use `.append(pathBlock, styles?)` to add path geometry to the marker:

```
m.append(arrow, ${ fill: context-stroke; });
```

- **pathBlock** — a `PathBlock` (`@{ ... }`) or `ProjectedPath`. PathBlocks are automatically projected at the marker's local origin `(0, 0)`.
- **styles** — optional style block for the appended path element. Accepts normal colors, `Color(...)` values, and the special context values `context-stroke` and `context-fill` described below.

`.append()` can be called multiple times to layer multiple shapes inside a single marker.

## Using Markers in Styles

Reference a marker in a layer's style block using `marker-start`, `marker-mid`, or `marker-end`:

```
define PathLayer('line') ${
  stroke: Color('#333');
  stroke-width: 3;
  fill: none;
  marker-start: dotMarker;
  marker-mid: dotMarker;
  marker-end: arrowMarker;
}
```

- **`marker-start`** — rendered at the first vertex of the path.
- **`marker-mid`** — rendered at every interior vertex (not the first or last).
- **`marker-end`** — rendered at the last vertex of the path.

These properties — along with the shorthand `marker` — automatically wrap the marker as `url(#id)`, so `marker-end: arrowMarker` in Pathogen becomes `marker-end="url(#arrowhead)"` in the output SVG. If you prefer to be explicit, `marker-end: arrowMarker.id` or `marker-end: url(#arrowhead)` produce the same result.

The `marker` shorthand applies the same marker to all three positions:

```
define PathLayer('vertices') ${
  stroke: Color('#333');
  stroke-width: 2;
  fill: none;
  marker: dotMarker;   // shorthand: applies to start, mid, AND end
}
```

## Default Attribute Values

Markers are created with smart defaults so the simple case just works:

| Attribute | Default | Notes |
|-----------|---------|-------|
| `viewBox` | `0 0 {markerWidth} {markerHeight}` | Derived from constructor args |
| `refX` | `markerWidth / 2` | Centered horizontally |
| `refY` | `markerHeight / 2` | Centered vertically |
| `markerUnits` | `'strokeWidth'` | Marker scales with the line's stroke width |
| `orient` | `'auto'` | Marker rotates to match path direction |
| `preserveAspectRatio` | `'xMidYMid meet'` | Standard SVG default |

## Mutable Properties

After construction, properties can be reassigned to override the defaults. Numeric values are allowed on `refX`, `refY`, and `orient`; all other properties — plus the symbolic forms of `refX`/`refY`/`orient` — take members of a named enum.

```
let arrowMarker = Marker('flow-arrow', 12, 12) {|m|
  m.append(arrow, ${ fill: context-stroke; });
};

// Numeric override: position the arrow tip exactly at the endpoint
arrowMarker.refX = 12;
arrowMarker.refY = 6;

// Enum override: align the reference point to the marker's right edge,
// size the marker in absolute user-space units, and flip the start-marker
arrowMarker.refX = MarkerRefX.Right;
arrowMarker.markerUnits = MarkerUnits.UserSpaceOnUse;
arrowMarker.orient = MarkerOrient.AutoStartReverse;
```

| Property | Accepts | Enum |
|----------|---------|------|
| `viewBox` | string (`"minX minY width height"`) | — |
| `refX` | number **or** enum value | `MarkerRefX` (`Left`, `Center`, `Right`) |
| `refY` | number **or** enum value | `MarkerRefY` (`Top`, `Center`, `Bottom`) |
| `markerUnits` | enum value | `MarkerUnits` (`StrokeWidth`, `UserSpaceOnUse`) |
| `orient` | Angle value, number (radians), **or** enum value | `MarkerOrient` (`Auto`, `AutoStartReverse`) |
| `preserveAspectRatio` | enum value | `MarkerPreserveAspectRatio` — `None`, or `{XMin,XMid,XMax}{YMin,YMid,YMax}{Meet,Slice}` (e.g. `XMidYMidMeet`, the default; `XMinYMinSlice`) |

Invalid enum values throw an error that lists the valid options.

## Orient

The `orient` property controls how the marker is rotated at each vertex. It accepts both enum strings and a numeric radian value:

```
// Rotates to match path direction (the default)
autoMarker.orient = MarkerOrient.Auto;

// Rotates to match path direction, but flips start markers so arrows
// on both ends point outward
reverseMarker.orient = MarkerOrient.AutoStartReverse;

// Fixed angle — an Angle value works directly
fixedMarker.orient = 45deg;

// Plain numbers are radians
plainMarker.orient = PI() / 4;

// Explicit zero — always points right
zeroMarker.orient = 0;
```

Numeric values are interpreted as radians and converted to degrees for the generated SVG attribute. [Angle values](#syntax-angle-units) are accepted too — `marker.orient = 45deg;` works, including via a variable.

## `context-stroke` and `context-fill`

Markers often need to match the color of the line they decorate. SVG provides two special paint values — `context-stroke` and `context-fill` — that tell the marker to inherit from its referencing element. Pathogen passes these through as raw strings:

```
let arrow = @{
  m 0 0 l 10 5 l -10 5 z
};

// One marker reused across many lines; fill picks up each line's stroke color
let arrowMarker = Marker('context-arrow', 10, 10) {|m|
  m.append(arrow, ${ fill: context-stroke; stroke: none; });
};

define PathLayer('red')    ${ stroke: Color('#e63946'); stroke-width: 3; fill: none; marker-end: arrowMarker; }
define PathLayer('orange') ${ stroke: Color('#f77f00'); stroke-width: 3; fill: none; marker-end: arrowMarker; }
define PathLayer('green')  ${ stroke: Color('#2a9d8f'); stroke-width: 3; fill: none; marker-end: arrowMarker; }

layer('red').apply    { M 40 60  L 360 60 }
layer('orange').apply { M 40 130 L 360 130 }
layer('green').apply  { M 40 200 L 360 200 }
```

Each line renders with an arrowhead in its own stroke color, even though there is only a single `Marker` definition in `<defs>`.

Use `context-stroke` when the marker fill should match the line's stroke color, and `context-fill` when it should match the line's fill.

## Multiple Markers on One Path

A single layer can attach different markers at the start, mid, and end vertices. This is how flow-diagram-style polylines decorate every joint:

```
let arrow = @{ m 0 0 l 10 5 l -10 5 z };
let dot   = @{ circle(5, 5, 4); };
let ring  = @{ circle(5, 5, 4); };

let arrowMarker = Marker('arrow', 10, 10) {|m|
  m.append(arrow, ${ fill: context-stroke; });
};
let dotMarker = Marker('dot', 10, 10) {|m|
  m.append(dot, ${ fill: context-stroke; });
};
let ringMarker = Marker('ring', 10, 10) {|m|
  m.append(ring, ${ fill: Color('#fff'); stroke: context-stroke; stroke-width: 1.5; });
};

define PathLayer('path1') ${
  stroke: Color('#2a9d8f');
  stroke-width: 3;
  fill: none;
  marker-start: ringMarker;
  marker-mid: dotMarker;
  marker-end: arrowMarker;
}

// Zig-zag exercises start, 3 mid vertices, and end
layer('path1').apply {
  M 40 80 L 120 40 L 200 120 L 280 40 L 360 80
}
```

## Generated SVG Output

The basic arrow example above produces:

```xml
<defs>
  <marker id="arrowhead" viewBox="0 0 10 10" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
    <path d="M 0 0 L 10 5 L 0 10 Z" fill="#333333"/>
  </marker>
</defs>
...
<path d="M 40 100 L 360 100" fill="none" stroke="#333333" stroke-width="3" marker-end="url(#arrowhead)"/>
```

The marker geometry is stored as absolute path commands inside `<defs>`, and each layer that references it gets `marker-end="url(#id)"` (or `marker-start` / `marker-mid`) on the output `<path>` element.

Attributes that match the SVG default are omitted to keep output compact — in the example above, `markerUnits="strokeWidth"` and `preserveAspectRatio="xMidYMid meet"` are implied. Assign a non-default value (e.g. `arrowMarker.markerUnits = MarkerUnits.UserSpaceOnUse`) and the attribute appears in the output.

## Properties

| Property | Returns | Description |
|----------|---------|-------------|
| `.id` | string | The ID passed to the constructor |
| `.viewBox` | string | Current viewBox attribute |
| `.markerWidth` | number | Intrinsic width |
| `.markerHeight` | number | Intrinsic height |
| `.refX` | number or string | Reference point X (see [Mutable Properties](#markers-mutable-properties)) |
| `.refY` | number or string | Reference point Y |
| `.markerUnits` | string | Current `markerUnits` value |
| `.orient` | number or string | Current orient (radians if numeric) |
| `.preserveAspectRatio` | string | Current `preserveAspectRatio` value |

## Methods

| Method | Description |
|--------|-------------|
| `.append(pathBlock, styles?)` | Add a path element to the marker. Accepts `PathBlock` or `ProjectedPath`; optional style block. |

## Auto-Wrapping

These CSS properties automatically wrap marker values as `url(#id)`:

- `marker` (shorthand)
- `marker-start`
- `marker-mid`
- `marker-end`

If the value already starts with `url(`, it's left as-is.

## Error Handling

| Error | Cause |
|-------|-------|
| `Marker() expects 3 arguments (id, markerWidth, markerHeight)` | Wrong number of constructor args |
| `Marker() first argument must be a string` | Non-string ID |
| `Marker() markerWidth and markerHeight arguments must be numbers` | Non-numeric dimensions |
| `Duplicate defs ID '<id>'` | Another Mask, ClipPath, Gradient, Pattern, or Marker already uses this ID |
| `Marker.append() expects 1-2 arguments (path, styles?)` | Wrong number of `.append()` args |
| `Marker.append() first argument must be a PathBlock or ProjectedPath` | Passed something other than `@{ ... }` or a projected path |
| `Marker.append() second argument must be a style block` | Passed something other than a `${ ... }` style block |
| `Unknown Marker method: <name>` | Called a method other than `.append()` |
| `Cannot assign to Marker property '<name>'` | Assigned to a non-mutable property |
| `Marker.refX must be a number or MarkerRefX enum value` | Assigned an invalid type to `refX` (same pattern applies to `refY`, `orient`, `markerUnits`, `preserveAspectRatio`) |
| `Invalid value '<x>' for Marker.<prop>. Valid values: ...` | Assigned a string that isn't a member of the relevant enum |

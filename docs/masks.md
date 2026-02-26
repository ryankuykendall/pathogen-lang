# Masks and Clip Paths

Masks and clip paths are SVG `<defs>` elements that control visibility of layers. They're created with `Mask()` and `ClipPath()` constructors and referenced from layer style blocks.

## Masks

A mask uses luminance to control visibility — white areas are fully visible, black areas are hidden, and gray values create partial transparency.

### Creating a Mask

```
let m = Mask('my-mask');
```

The argument is the mask's ID string. IDs must be unique across all masks and clip paths.

### Appending Paths

Use `.append(path, styles?)` to add path elements to the mask:

```
let base = @{ m 0 0 l 200 0 l 0 200 l -200 0 z };
let hole = @{ m 50 50 l 100 0 l 0 100 l -100 0 z };

let m = Mask('reveal');
m.append(base, ${ fill: white; });    // visible area
m.append(hole, ${ fill: black; });    // hidden cutout
```

The first argument accepts either a `PathBlock` or a `ProjectedPath`. PathBlocks are automatically projected at the origin (0, 0). The optional second argument is a style block for the path element.

### Using a Mask

Reference the mask from a layer's style block using the `.id` property:

```
define PathLayer('art') ${ mask: m.id; }
layer('art').apply {
  M 10 10 L 190 190
}
```

The `mask` property automatically wraps the ID with `url(#...)`, so `m.id` (which returns `'reveal'`) becomes `mask: url(#reveal)` in the output.

### Full Example

```
// Define mask geometry
let fullRect = @{ m 0 0 l 200 0 l 0 200 l -200 0 z };
let circle = @{ m 100 50 a 50 50 0 1 1 0 100 a 50 50 0 1 1 0 -100 };

// Create mask: white = visible, black = hidden
let m = Mask('circle-reveal');
m.append(fullRect, ${ fill: black; });
m.append(circle, ${ fill: white; });

// Apply mask to layer
define PathLayer('drawing') ${ mask: m.id; stroke: #333; stroke-width: 2; }
layer('drawing').apply {
  for (i in 0..20) {
    M 0 calc(i * 10)
    L 200 calc(i * 10)
  }
}
```

This draws horizontal lines that are only visible inside the circular mask.

## Clip Paths

A clip path uses geometry to clip content — anything inside the path is visible, everything outside is hidden. Unlike masks, clip paths don't use styles (they're purely geometric).

### Creating a Clip Path

```
let c = ClipPath('my-clip');
```

### Appending Paths

Use `.append(path)` to add path elements. No styles parameter — clip paths are geometry-only:

```
let shape = @{ m 20 20 l 160 0 l 0 160 l -160 0 z };
let c = ClipPath('frame');
c.append(shape);
```

### Using a Clip Path

```
define PathLayer('scene') ${ clip-path: c.id; }
layer('scene').apply {
  M 0 0 L 200 200
}
```

Like masks, the `clip-path` property automatically wraps the ID with `url(#...)`.

## Auto-Wrapping

The following CSS properties automatically wrap bare ID strings with `url(#...)`:

- `mask`
- `clip-path`
- `filter`
- `marker-start`
- `marker-mid`
- `marker-end`

If the value already starts with `url(`, it's left as-is:

```
// These produce the same output:
define PathLayer('a') ${ mask: m.id; }         // m.id → 'my-mask' → url(#my-mask)
define PathLayer('b') ${ mask: url(#my-mask); } // already wrapped, left as-is
```

## Properties

| Property | Returns | Description |
|----------|---------|-------------|
| `.id`    | string  | The raw ID string passed to the constructor |

## Methods

| Method | Applies To | Description |
|--------|-----------|-------------|
| `.append(path, styles?)` | Mask | Add a path element with optional styles |
| `.append(path)` | ClipPath | Add a path element (no styles) |

## Error Handling

- Duplicate IDs across masks and clip paths throw an error
- Constructor requires exactly one string argument
- `.append()` requires a PathBlock or ProjectedPath as the first argument
- Mask `.append()` requires a style block as the optional second argument

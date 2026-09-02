# TextBlock

TextBlock is a composition-first text primitive that lets you **compose, measure, and position** text before drawing it. This is essential for diagrams and schematics where labels must be positioned relative to geometry without overlapping.

TextBlock parallels PathBlock: both follow the pattern **compose -> measure -> position -> draw**.

## Quick Overview

```pathogen
// Compose text at relative coordinates
let label = &{
  text(0, 14)`Title`
  text(0, 30)`Subtitle`
} << ${ font-size: 14; fill: #333; };

// Measure before placing
let bb = label.boundingBox();

// Project into absolute coordinates
let placed = label.project(50, 100);

// Draw to a TextLayer
define TextLayer('labels') ${}
layer('labels').apply {
  placed.draw();
}
```

## Syntax

TextBlock uses the `&{ }` sigil:

```pathogen
let t = &{
  text(x, y)`content`
  text(x, y) {
    tspan()`first`
    tspan(0, 16)`second`
  }
};
```

Inside a text block you can use:
- **`text()` statements** — the core text elements
- **`let`, `for`, `if`, `switch`** — control flow for dynamic content
- **User-defined functions** — called as expressions

Not allowed inside text blocks:
- Path commands (`M`, `L`, etc.)
- Layer definitions or apply blocks
- Nested text blocks

## Types

### TextBlockValue

Created by the `&{ }` expression. All coordinates are **relative to origin (0, 0)**.

### ProjectedTextValue

Created by `.project()`, `.drawTo()`, `.polarProject()`, or `.translate()`. Contains text elements with **absolute coordinates** and tracks the projection origin.

## Methods

### TextBlockValue

| Method | Returns | Description |
|--------|---------|-------------|
| `.project(x, y)` | ProjectedTextValue | Offset all elements to absolute coordinates |
| `.drawTo(x, y [, rotation])` | ProjectedTextValue | Emit to active TextLayer at position |
| `.boundingBox()` | Object `{x, y, width, height}` | Estimated bounding box |
| `.polarProject(px, py, angle, distance, anchor)` | ProjectedTextValue | Project along polar vector with anchor alignment |
| `.toPathBlock()` | PathBlockValue | Flatten glyph outlines into a single PathBlock (requires `@font`) |
| `.toCodeSnippetBlock(name [, fontSize, padding])` | LayerReference | Generate a syntax-highlighted code snippet GroupLayer |

### ProjectedTextValue

| Method | Returns | Description |
|--------|---------|-------------|
| `.draw()` | ProjectedTextValue | Emit to active TextLayer at projected position |
| `.drawTo(x, y [, rotation])` | ProjectedTextValue | Re-project and emit at new position |
| `.translate(dx, dy)` | ProjectedTextValue | Return new value with shifted origin |
| `.boundingBox()` | Object `{x, y, width, height}` | Estimated bounding box |
| `.paddedBoundingBox(blockPad, inlinePad)` | Object `{x, y, width, height}` | Bbox expanded by padding |
| `.anchor(BBoxAnchor)` | PointValue | Point at named position on bbox |
| `.intersects(geometry)` | Boolean | AABB overlap test |
| `.intersectionPoints(geometry)` | Array\<PointValue\> | Intersection points between bbox and geometry |

## Properties

### TextBlockValue

| Property | Type | Description |
|----------|------|-------------|
| `.elementCount` | number | Number of text elements |
| `.styles` | StyleBlockValue | Block-level styles |

### ProjectedTextValue

| Property | Type | Description |
|----------|------|-------------|
| `.elementCount` | number | Number of text elements |
| `.styles` | StyleBlockValue | Block-level styles |
| `.origin` | PointValue | Projection origin |

## Style Merging

Use the `<<` operator to merge styles into a TextBlock:

```pathogen
let t = &{ text(0, 16)`Hello` } << ${ font-size: 24; fill: #333; };
```

This sets block-level styles that apply to all elements unless overridden by element-level styles.

## BBoxAnchor Enum

The `BBoxAnchor` enum provides named positions on a bounding box:

```
BBoxAnchor.TopLeft      BBoxAnchor.Top      BBoxAnchor.TopRight
BBoxAnchor.Left         BBoxAnchor.Center   BBoxAnchor.Right
BBoxAnchor.BottomLeft   BBoxAnchor.Bottom   BBoxAnchor.BottomRight
```

Used with `.anchor()` and `.polarProject()`.

## Font Metrics

TextBlock uses built-in character width tables for bounding box estimation:
- **Sans-serif** (default): per-character widths approximating Arial/Helvetica
- **Serif**: per-character widths approximating Times New Roman
- **Monospace**: uniform character width approximating Courier New

Set the font category via the `font-family` style property. Accuracy is ~85-90% for Latin text, sufficient for layout decisions.

Font metrics respect:
- `font-size` (default 16)
- `font-family` (category detection)
- `font-weight` (bold applies ~6% width increase)
- `letter-spacing`
- tspan `dx`/`dy` offsets

## Polar Projection

Place text along a polar vector with anchor alignment:

```pathogen
let label = &{ text(0, 14)`Node A` } << ${ font-size: 14; };

// Place label 80px from center at 45 degrees, anchored at center-left
let placed = label.polarProject(100, 100, 45deg, 80, BBoxAnchor.Left);
```

The anchor determines which point of the text's bounding box is placed at the target location. For example, `BBoxAnchor.Left` means the left-center of the text bbox lands on the polar target point.

## Intersection Detection

Check if text bounding boxes overlap to avoid label collisions:

```pathogen
let label1 = (&{ text(0, 14)`First` } << ${ font-size: 14; }).project(50, 50);
let label2 = (&{ text(0, 14)`Second` } << ${ font-size: 14; }).project(55, 55);

if (label1.intersects(label2)) {
  // Labels overlap — adjust position
  label2 = label2.translate(0, 20);
}
```

`.intersects()` accepts:
- Another `ProjectedTextValue` (AABB overlap test)
- A `ProjectedPathValue` (bbox-edge vs path-segment intersection)
- An object with `{x, y, width, height}` (AABB overlap test)

## Text to Path Conversion

When you need text that renders identically without requiring fonts — or when you want to apply path transforms and boolean operations to text — `.toPathBlock()` converts glyph outlines into vector geometry. After conversion, the text is no longer a text element: it's path geometry that can be filled, stroked, scaled, mirrored, and combined with boolean operations like any other PathBlock.

This is different from `PathBlock.fromGlyph()`, which returns an array of per-character PathBlocks. `.toPathBlock()` returns a single PathBlock containing all glyphs from the entire TextBlock, already laid out according to element positions, tspan offsets, and letter-spacing.

**Requirements:**
- Fonts must be loaded via [`@font` directive](#cli-cli-reference) or compile options
- `font-family` must be set in the TextBlock's styles
- Only available on TextBlockValue (not ProjectedTextValue)

```pathogen
@font "./fonts/Baumans-Regular.ttf";

let tb = &{
  text(0, 20)`Hello`
  text(0, 40)`World`
} << ${ font-family: Baumans-Regular; font-size: 24; };

let pb = tb.toPathBlock();

define PathLayer('text-as-path') ${ fill: #333; stroke: none; }
layer('text-as-path').apply {
  pb.drawTo(20, 20);
}
```

The resulting PathBlock is normalized to a (0, 0) origin, so `.drawTo(x, y)` places the text geometry at absolute coordinates `(x, y)`. Space characters advance the cursor without generating outline commands.

Since the result is a standard [PathBlock](#path-blocks-path-blocks), you can chain any PathBlock operation:

```pathogen
// Scale the text geometry down to 60%
let small = pb.scale(0.6, 0.6);

// Mirror the text horizontally
let flipped = pb.mirror(0);

// Use text as a boolean punch — cut text out of a rectangle
let plate = @{ h 200 v 60 h -200 z }.project(10, 10);
let cutout = plate.difference(pb.project(20, 20));
```

Per-tspan style overrides (font-family, font-size) are respected, allowing mixed fonts within a single PathBlock output.

## Code Snippet Blocks

For diagrams that need to show source code alongside visual output — tutorials, blog schematics, API documentation — `.toCodeSnippetBlock()` generates a self-contained code block as SVG layers with Pathogen-aware syntax highlighting.

`.toCodeSnippetBlock(name [, fontSize, padding])` transforms a TextBlock containing code text into a styled GroupLayer.

**Arguments:**
- `name` (string) — name for the GroupLayer
- `fontSize` (number, optional) — code font size, default 10
- `padding` (number, optional) — padding around code, default 12

**Returns:** LayerReference to a GroupLayer containing:
- `{name}-bg` — PathLayer with dark background (`#1e293b`), border (`#334155`), and rounded corners
- `{name}-code` — TextLayer with per-token syntax-highlighted tspan elements

The `name` must not collide with existing layer names (including the `-bg` and `-code` suffixed names).

```pathogen
let code = &{
  text(0, 0)`// Shape layer with styles
define PathLayer('main') \${ fill: #3b82f6; }

let shape = rect(0, 0, 80, 60);
layer('main').apply {
  shape.drawTo(50, 50);
}`
};

let snippet = code.toCodeSnippetBlock('my-snippet', 10, 12);
snippet << ${ translate-x: 400; translate-y: 100; };
```

### Escaping `${` in Code Text

Template literals in Pathogen treat `${` as a string interpolation sequence. If your code text contains literal `${` (e.g., style blocks), escape the dollar sign with a backslash:

```pathogen
// ✗ This fails — ${ triggers interpolation
let code = &{ text(0,0)`let s = ${ fill: red; }` };

// ✓ Escape the dollar sign
let code = &{ text(0,0)`let s = \${ fill: red; }` };
```

`@{` and `&{` do **not** need escaping — they pass through template literals as plain text. Only `${` requires the `\$` escape.

### Syntax Highlighting Palette

Keywords and builtins share the same color (`#c084fc`) — both represent language-level constructs.

| Token | Color | Examples |
|-------|-------|---------|
| Keyword | `#c084fc` (purple) | `let`, `for`, `if`, `define`, `fn` |
| Builtin | `#c084fc` (purple) | `PathLayer`, `Color`, `circle`, `log` |
| Function | `#f59e0b` (amber) | any identifier followed by `(` |
| Number | `#f59e0b` (amber) | `42`, `3.14`, `45deg` |
| String | `#22c55e` (green) | `` `hello` ``, `"world"` |
| Comment | `#64748b` (slate) | `// comment` |
| Operator | `#94a3b8` (gray) | `=`, `<<`, `+`, `-` |
| Punctuation | `#64748b` (slate) | `{ } ( ) ; ,` |
| Text | `#e2e8f0` (light) | identifiers, whitespace |

The code text is automatically normalized: common leading whitespace is removed (dedent), blank leading/trailing lines are trimmed, and tabs are converted to 2 spaces. Indentation within the code (for blocks, loops, conditionals) is preserved and rendered via x-coordinate offsets.

## Examples

### Label placement around a shape

```pathogen
define PathLayer('shape') ${ stroke: #333; fill: none; }
define TextLayer('labels') ${ font-size: 12; fill: #666; }

let shape = @{ l 80 0 l 0 60 l -80 0 z };

// Place labels at compass positions around the shape
let top = &{ text(0, 12)`Top` } << ${ font-size: 12; };
let right = &{ text(0, 12)`Right` } << ${ font-size: 12; };

layer('shape').apply { shape.drawTo(60, 70); }

layer('labels').apply {
  top.polarProject(100, 100, -90deg, 50, BBoxAnchor.Bottom).draw();
  right.polarProject(100, 100, 0, 60, BBoxAnchor.Left).draw();
}
```

### Dynamic labels with collision avoidance

```pathogen
define TextLayer('labels') ${ font-size: 11; }

let points = [
  { x: 50, y: 50, name: "A" },
  { x: 55, y: 65, name: "B" },
  { x: 120, y: 50, name: "C" },
];

let placed = [];
layer('labels').apply {
  for (pt in points) {
    let label = &{ text(0, 11)`${pt.name}` } << ${ font-size: 11; };
    let proj = label.project(pt.x + 5, pt.y);

    // Check against all previously placed labels
    let ok = true;
    for (prev in placed) {
      if (proj.intersects(prev)) {
        ok = false;
      }
    }

    if (ok) {
      proj.draw();
      placed.push(proj);
    } else {
      // Try below instead
      let alt = label.project(pt.x + 5, calc(pt.y + 15));
      alt.draw();
      placed.push(alt);
    }
  }
}
```

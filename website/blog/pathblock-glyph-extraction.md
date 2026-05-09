---
title: "From Fonts to Paths: Glyph Extraction with PathBlock.fromGlyph()"
slug: pathblock-glyph-extraction
date: 2026-03-17
description: "Turn font glyphs into PathBlock geometry — manual text layout, contour decomposition, per-character transforms, and boolean text cutouts."
---

*Part 2 of 2 in our series on TextBlock and font integration.*

> **Series: TextBlock & Font Integration**
> 1. [TextBlock: Measure-First Text for SVG Diagrams](/blog/textblock-introduction)
> 2. **From Fonts to Paths: Glyph Extraction with PathBlock.fromGlyph()** (this post)

> **Prerequisites:** This post assumes familiarity with PathBlock basics — the `@{}` sigil, `.draw()`, `.project()`, and boolean operations. If you're new to Pathogen, start with [Introduction to PathBlocks](/blog/pathblock-introduction). For boolean operations, see [Boolean Operations](/blog/pathblock-boolean-operations).

[TextBlock](/blog/textblock-introduction) gives you a compose-measure-position workflow for SVG text. You build text at relative coordinates, measure its bounding box, place it precisely, and draw it to a TextLayer. That covers most labeling and annotation work. But the result is still an SVG `<text>` element — a string the browser renders with its own font engine. You can't sample points along its outline, apply a fillet to its corners, or punch it out of a rectangle with a boolean difference.

Where Part 1 made text measurable, this post makes it malleable — converting glyphs into path geometry you can transform, decompose, and combine.

What if you need text *as geometry* — actual path commands you can transform, combine, and query like any other shape? Think logo construction where letters are punched out of a background plate. Or generative typography where each character follows a different arc. Or a stencil design where glyph outlines need to be offset and duplicated. These tasks require the text's vector outline, not its rendered pixels.

That's what font integration provides. The `@font` directive loads a font file, and `PathBlock.fromGlyph()` converts each character into a PathBlock with the glyph's full vector outline. From there, everything in the [PathBlock series](/blog/pathblock-introduction) applies: [drawing and positioning](/docs#path-blocks-drawing-a-path-block), [parametric sampling](/blog/pathblock-parametric-sampling), [fillets and chamfers](/blog/pathblock-fillets-chamfers), [boolean operations](/blog/pathblock-boolean-operations), and all the transforms.

## Loading Fonts with @font

Before you can extract glyphs, Pathogen needs access to the font's vector data. The [`@font` directive](/docs#path-blocks-font-directive) declares a font at the top level of your program:

```pathogen
@font "Inter";
@font "Roboto Mono" 700;
@font "./fonts/CustomFont.ttf";
```

The directive takes a font source (family name or file path) and an optional numeric weight (100-900, default 400). How the font is actually loaded depends on the environment:

- **CLI**: Loads from local file paths relative to the source file, or searches system font directories (`/Library/Fonts`, `/System/Library/Fonts`, `~/Library/Fonts` on macOS, with equivalent paths on Linux and Windows).
- **Playground**: Fetches from the Google Fonts CDN automatically. Specify a family name and the playground handles the HTTP request.

The directive is purely declarative — the host environment loads font data before compilation begins. If a font can't be found, a warning is logged and compilation continues. This means `@font` never blocks the build; it just determines whether glyph extraction and precise TextBlock metrics are available.

A single `@font` declaration serves double duty: it makes the font available for `PathBlock.fromGlyph()` glyph extraction *and* upgrades [TextBlock](/blog/textblock-introduction) `.boundingBox()` measurements from estimation tables to exact kerning-aware metrics via opentype.js. You don't need separate declarations for paths and text — one directive covers both.

> **CLI vs Playground:** In the CLI, `@font` loads from local file paths or system font directories. In the Playground, fonts are fetched automatically from Google Fonts by family name. Both environments use the same opentype.js parser, so identical font files produce identical geometry.

## Extracting Glyphs with PathBlock.fromGlyph()

[`PathBlock.fromGlyph(text, styles)`](/docs#path-blocks-pathblockfromglyphtext-styles) is the core conversion function. It takes a text string and a style block, and returns an array of PathBlock values — one per character:

```pathogen
@font "Inter";

let styles = ${ font-family: Inter; font-size: 48; };
let glyphs = PathBlock.fromGlyph("Hello", styles);

log(glyphs.length);    // 5 — one PathBlock per character
```

The style block must include `font-family` (matching a loaded `@font` declaration). `font-size` defaults to 16 and `font-weight` defaults to 400 if omitted. The function walks each character in the text string, looks up the glyph in the loaded font, extracts its outline as cubic Bezier curves and line segments, scales to the requested font size, and wraps the result as a PathBlock with relative commands starting at `(0, 0)`.

Each glyph PathBlock is a full PathBlock value with all the standard properties and methods. You can call `.draw()`, `.drawTo()`, `.project()`, `.get()`, `.tangent()`, `.boundingBox()`, `.scale()`, `.fillet()`, `.union()` — everything from the [PathBlock documentation](/docs#path-blocks-syntax). The glyph is geometry now, not text.

```pathogen
@font "Inter";

let glyphs = PathBlock.fromGlyph("A", ${ font-family: Inter; font-size: 72; });

// Draw the glyph
glyphs[0].drawTo(50, 100)

// Query its geometry
log(glyphs[0].length);           // total outline arc-length
log(glyphs[0].boundingBox());    // { x, y, width, height }
log(glyphs[0].vertices.length);  // number of junction points
```

`fromGlyph()` always returns an array — one PathBlock per character — even for single characters. That's why we index with `glyphs[0]` above.

Space characters are handled correctly: they return an empty PathBlock (no path commands, zero length) but still carry a non-zero `.advanceWidth` for layout purposes. This means a loop over `PathBlock.fromGlyph("Hello World", styles)` will naturally insert a gap between "Hello" and "World" without special-casing.

If something goes wrong, the [error messages](/docs#path-blocks-error-cases) are specific. Wrong argument count, missing `font-family`, no `@font` loaded, font not found in the registry — each condition has its own message telling you exactly what to fix.

## Manual Text Layout with advanceWidth

Drawing glyph PathBlocks is straightforward, but you need to position them correctly. In a font, each glyph has an *advance width* — the horizontal distance the cursor should move after drawing that glyph before drawing the next one. This is how proportional fonts work: a narrow "i" advances less than a wide "M".

Every glyph PathBlock from `fromGlyph()` carries an [`.advanceWidth`](/docs#path-blocks-advancewidth) property. To lay out a word, accumulate advance widths in a loop:

```pathogen
@font "Bebas Neue";
let styles = ${ font-family: BebasNeue-Regular; font-size: 64; };
let glyphs = PathBlock.fromGlyph("PATHOGEN", styles);

let cursor_x = 60;
let baseline_y = 140;
for (g in glyphs) {
  g.drawTo(cursor_x, baseline_y)
  cursor_x = calc(cursor_x + g.advanceWidth);
}
```

This is the text layout engine's job, and now it's yours. The advance width accumulation produces the same letter spacing that a browser would use for the same font at the same size — because the values come directly from the font file via opentype.js.

The difference between proportional and monospace fonts shows up clearly here. A proportional font like Bebas Neue produces variable spacing: the "P" might advance 22px while the "I" advances 8px. A monospace font like Inconsolata advances every character by the same amount. The demo below renders the same word in both fonts, with dashed tick marks showing each character's advance-width boundary.

<mini-workspace src="samples/post12/glyph-layout.pathogen" caption="Advance-width layout — proportional (Bebas Neue) vs monospace (Inconsolata)"></mini-workspace>

The yellow baseline and dashed tick marks make the layout mechanics visible. In the top row, the proportional font produces uneven column widths — "A" and "H" are wider than "T" and "O". In the bottom row, the monospace font produces a uniform grid. Both layouts use the same accumulation loop; the font's advance widths do all the work.

Because you're controlling the cursor directly, you can adjust spacing however you want. Multiply advance widths by a tracking factor to tighten or loosen letter spacing. Add a fixed offset for extra gaps. Skip characters, reverse the order, lay them out vertically — it's just arithmetic in a loop.

## Contour Decomposition

Most glyphs are made of multiple contours. The letter "O" has an outer ring and an inner hole — two closed paths. The letter "i" has a body and a dot — also two. Some glyphs are more complex: "B" has an outer shape plus two enclosed holes.

The [`.contours`](/docs#path-blocks-contours) property splits a glyph PathBlock into its constituent contours, returning an array of PathBlock values — one per contour:

```pathogen
@font "Inter";
let styles = ${ font-family: Inter; font-size: 48; };
let glyphs = PathBlock.fromGlyph("O", styles);

let contours = glyphs[0].contours;
log(contours.length);    // 2 — outer ring + inner hole
```

Each contour is a closed PathBlock with all standard properties and methods. You can draw them individually, apply different styles, transform them independently, or use them in boolean operations. Here's what iterating over contours looks like:

```pathogen
@font "Inter";
let styles = ${ font-family: Inter; font-size: 48; };
let glyphs = PathBlock.fromGlyph("B", styles);

let contours = glyphs[0].contours;
// contours[0] = outer shape
// contours[1] = upper hole
// contours[2] = lower hole

// Draw each contour with different styling
for (c in contours) {
  c.drawTo(50, 100)
}
```

The number of contours per glyph varies by character and font design. Simple glyphs like "n" or "c" typically have a single contour. Letters with enclosed spaces — "o", "e", "d", "g" — usually have two. Letters with multiple enclosed regions — "B", "8" — can have three or more. Punctuation follows the same logic: "!" has two contours (the body stroke and the dot below), while "-" has just one.

To draw each contour with a different fill, iterate over the array and assign colors from a palette:

```pathogen
@font "Inter";
let styles = ${ font-family: Inter; font-size: 56; };
let glyphs = PathBlock.fromGlyph("B", styles);

let colors = [Color('#3b82f6'), Color('#22c55e'), Color('#f59e0b')];
let fills  = [Color('#3b82f630'), Color('#22c55e30'), Color('#f59e0b30')];

let contours = glyphs[0].contours;
let ci = 0;
for (c in contours) {
  let layer = PathLayer('c' + ci) ${
    fill: fills[ci];
    stroke: colors[ci];
    stroke-width: 1.5;
  };
  layer.apply { c.drawTo(50, 100) }
  ci = calc(ci + 1);
}
```

The demo below decomposes "Bingo!" into its contours. Count them: B has 3 (outer shape + 2 holes), i has 2 (body + dot), n has 1 (solid body), g has 2 (body + descender loop), o has 2 (outer + inner), and ! has 2 (body + dot). That's 12 contours across 6 characters, each drawn in its own color. Each contour is colored from a 12-color palette cycling through blue, green, amber, red, purple, pink, cyan, lime, orange, indigo, teal, and fuchsia.

<mini-workspace src="samples/post12/contour-decomposition.pathogen" caption="Contour decomposition — 12 contours across 6 characters of 'Bingo!'"></mini-workspace>

The top row shows the assembled word rendered normally — solid fill, single color. The decomposed version below separates every contour into its own PathBlock, each with a distinct stroke color and semi-transparent fill. The color key on the right identifies each piece: B's three parts, i's body and dot, and so on.

When would you use contour decomposition? Anytime you need to treat parts of a glyph independently. Color the inside of an "O" differently from its ring. Animate the dot of an "i" separately from its stem. Extract just the outer contour of a "B" for a custom logo mark. Each contour is a full PathBlock, so it composes with everything else in the language.

## Per-Character Transforms

When each character is its own PathBlock, you can transform them individually. The standard PathBlock transform methods — [`.scale()`](/docs#path-blocks-scalesx-sy-pathblock-projectedpath), [`.rotateAtVertexIndex()`](/docs#path-blocks-rotateatvertexindexindex-angle-pathblock-projectedpath), [`.mirror()`](/docs#path-blocks-mirrorangle-pathblock-projectedpath) — work on glyph PathBlocks just like any other shape.

These patterns appear frequently in poster design, motion graphics titles, custom lettering, and generative art.

The interesting part is combining transforms with the advance-width layout loop. Instead of just placing each glyph at the cursor position, you apply a per-character transformation first:

### Wave Effect

Offset each character vertically using a sine function:

```pathogen
let idx = 0;
for (g in glyphs) {
  let y_offset = calc(sin(idx * 0.8) * 15);
  g.drawTo(cursor_x, calc(baseline + y_offset))
  cursor_x = calc(cursor_x + g.advanceWidth);
  idx = calc(idx + 1);
}
```

Each character sits at a different vertical position along the sine curve, creating a wave pattern. The advance widths still control horizontal spacing — only the y-coordinate changes.

### Scale Cascade

Increase the scale of each successive character:

```pathogen
let idx = 0;
for (g in glyphs) {
  let s = calc(0.5 + idx * 0.25);
  let scaled = g.scale(s, s);
  scaled.drawTo(cursor_x, baseline)
  cursor_x = calc(cursor_x + g.advanceWidth * s);
  idx = calc(idx + 1);
}
```

Notice that both the glyph *and* its advance width are scaled by the same factor. This keeps the spacing proportional to the size. The first character is half-size, the second is 75%, and so on.

### Circular Arc Text

The key geometric relationship is `angle = arc_length / radius` — dividing a character's advance width by the arc radius converts linear distance to angular offset in radians. This lets you place characters along a circular path using trigonometry:

```pathogen
for (g in glyphs) {
  let char_mid = calc(arc_cursor + g.advanceWidth / 2);
  let angle = calc(arc_start + char_mid / arc_r);
  let cx = calc(arc_cx + cos(angle) * arc_r);
  let cy = calc(arc_cy + sin(angle) * arc_r);
  let rotated = g.rotateAtVertexIndex(0, calc(angle + 0.5pi));
  rotated.drawTo(cx, cy)
  arc_cursor = calc(arc_cursor + g.advanceWidth);
}
```

Each glyph is rotated to follow the arc's tangent direction using `.rotateAtVertexIndex(0, angle)`, then placed at the corresponding position on the circle. The `0.5pi` uses Pathogen's numeric suffix notation — a shorthand for π/2 (a quarter turn) — which converts the radial angle to the tangent direction. The advance widths are converted to angular offsets by dividing by the arc radius.

<mini-workspace src="samples/post12/per-char-transforms.pathogen" caption="Three per-character transform effects — wave, grow, and circular arc text"></mini-workspace>

The three columns show each effect in isolation. The wave uses `sin()` to offset characters vertically. The grow effect scales each successive character larger with `.scale()`. The circular layout places rotated characters along a dashed guide circle. All three use the same advance-width accumulation loop — the only difference is what happens to each glyph before it's drawn.

These are building blocks, not finished effects. Combine a wave offset with a scale cascade. Apply a color gradient by assigning each character to a different layer with different fill colors. Use [`.mirror()`](/docs#path-blocks-mirrorangle-pathblock-projectedpath) to flip alternating characters for a decorative pattern. Apply a rotation to characters along a Bezier curve instead of a circle (using [parametric sampling](/blog/pathblock-parametric-sampling) from Part 2 of the PathBlock series). The transform methods compose freely because each one returns a new PathBlock.

The key insight is that the advance-width loop structure stays the same across all these effects. You always accumulate cursor positions using `.advanceWidth`. The creative part is what you do to each glyph *before* drawing it — and since PathBlock transforms return new PathBlocks without modifying the original, you can experiment freely.

## Text Cutout with Boolean Operations

One of the most visually striking uses of glyph extraction is punching text out of geometry. The conceptual pipeline has three stages: extract the glyph paths, combine them into a single outline, then subtract that outline from a background shape.

### Punching Text from Geometry

The approach uses [`.union()`](/docs#path-blocks-unionother-pathblock) and [`.difference()`](/docs#path-blocks-differenceother-pathblock) from the [boolean operations post](/blog/pathblock-boolean-operations). First, extract and lay out the glyphs, then union them into a single outline and subtract from a plate:

```pathogen
@font "Bebas Neue";
let glyphs = PathBlock.fromGlyph("CUTTING", styles);

// Project each glyph at its layout position (advance-width loop)
let tracking = 0.8;
let cursor = 0;
let projected = [];
for (g in glyphs) {
  projected.push(g.project(cursor, 0));
  cursor = calc(cursor + g.advanceWidth * tracking);
}

// Union into a single path, then punch from a rectangle
let combined = projected[0];
for (i in 1..6) {  // remaining 6 of 7 glyphs
  combined = combined.union(projected[i]);
}
let cutout = plate.project(px, py).difference(combined);
```

The chaining works because every boolean operation returns a PathBlock, so the result of `.union()` feeds directly into the next `.union()` or `.difference()` — for any number of glyphs. Because boolean operations [preserve curve types](/blog/pathblock-boolean-operations), the glyph outlines stay smooth at any zoom level.

The demo below shows the full pipeline in five panels: individual glyph outlines, a `.union()` arrow, the combined path, a `.difference()` arrow, and the final cutout. Stage 1 lays out each of the seven glyphs as a separate colored outline. Stage 2 unions all seven into a single solid path. Stage 3 punches the united text out of a green rectangle using `.difference()`.

<mini-workspace src="samples/post12/text-cutout.pathogen" caption="Text cutout pipeline — 7 glyph outlines → .union() chain → .difference() from a rectangle"></mini-workspace>

Text cutouts are common in logo design, stencil art, and anywhere you need negative-space typography. The pipeline is `.union()` calls followed by `.difference()` — a few lines of code instead of manual path editing in a vector graphics tool.

You can extend the boolean pipeline further. Apply a [fillet](/blog/pathblock-fillets-chamfers) to the plate's corners before punching to get a rounded badge. Use `.intersection()` instead of `.difference()` to clip text to a circular mask. Chain multiple `.difference()` calls to punch text at different positions on the same plate. The boolean operations return PathBlocks, so the entire [PathBlock composability model](/blog/pathblock-introduction) is available at every stage.

## Paths vs Text: Why @font Matters

Converting text to paths produces more SVG data than `<text>` elements — a single glyph may contain 20+ Bezier segments. For short words and display text this is negligible; for paragraph-length content, prefer TextBlock. Glyph extraction runs once at compile time — the PathBlock values stored in variables are reused across parameter changes without re-extracting from the font.

> **Accessibility note:** Glyph paths are not accessible to screen readers the way `<text>` elements are. For content that needs to be machine-readable or searchable, prefer TextBlock. Reserve `fromGlyph()` for decorative, logotype, and generative typography use cases where the visual treatment requires actual path geometry.

There's a subtle but important benefit to the font integration model that's easy to overlook. When you use `PathBlock.fromGlyph()`, the loaded font is both the *renderer* and the *measurer*. The path commands that define each glyph's shape come from the same font file that provides the advance widths and bounding boxes. There's no mismatch — the geometry and the metrics are always in agreement.

Contrast this with SVG `<text>`. When you write `<text font-family="Inter">Hello</text>`, the *browser* picks the font and renders the text. If you need to know how wide "Hello" is before drawing it, you're estimating — either with built-in character width tables (which TextBlock uses when no font is loaded) or with a `@font` declaration that might not exactly match what the browser loads. The estimation tables are ~85-90% accurate for Latin text, which is usually good enough for layout decisions. But for tight positioning — aligning a bounding box precisely to rendered text, for example — the gap can be visible.

With `fromGlyph()`, there's no gap. The path commands *are* the rendering. The advance widths *are* the layout. Everything comes from one source — the loaded font file.

<mini-workspace src="samples/post12/metrics-upgrade.pathogen" caption="Same word, two approaches — fromGlyph() paths with exact metrics vs SVG text with estimated metrics"></mini-workspace>

The left side shows "LAYOUT" rendered as glyph PathBlocks with advance-width ticks and a bounding box computed from the actual font geometry. The right side shows the same word as SVG `<text>` with a bounding box from estimation tables. The green box on the left fits tightly because paths and metrics come from the same font. The amber dashed box on the right may not align as well, because the browser's font and Pathogen's estimation table can diverge.

This doesn't mean `<text>` is wrong for all cases — TextBlock with estimation tables works well for most label placement, especially with `.intersects()` collision avoidance where a few percent of width variation doesn't matter. But when you need pixel-level precision — logo construction, stencil output, precise baseline alignment — `fromGlyph()` eliminates the measurement-rendering mismatch entirely.

## Putting It Together

Here's the full pipeline from font declaration to rendered output — the workflow that ties together everything in this post:

```pathogen
// 1. Load the font
@font "Inter";
let styles = ${ font-family: Inter; font-size: 64; };

// 2. Extract glyphs
let glyphs = PathBlock.fromGlyph("HELLO", styles);

// 3. Lay out with advance widths
let cursor_x = 50;
let baseline_y = 120;
for (g in glyphs) {
  g.drawTo(cursor_x, baseline_y)
  cursor_x = calc(cursor_x + g.advanceWidth);
}
```

That's three steps: `@font` declares the font, `fromGlyph()` converts text to geometry, and an advance-width loop handles layout. From there, every PathBlock operation is available — transforms, sampling, fillets, boolean operations, contour decomposition. The glyph is geometry now, and geometry composes.

## What's Next

TextBlock and glyph extraction form two sides of the same coin. [TextBlock](/blog/textblock-introduction) gives you a fast, compose-measure-position workflow for text labels in diagrams — estimation-based measurement is good enough, and the output is semantic SVG `<text>` that's accessible and searchable. `PathBlock.fromGlyph()` gives you text as geometry — exact outlines you can transform, decompose, and combine with any PathBlock operation.

Together, they cover the full spectrum of text needs in programmatic SVG. Labels that need to avoid overlapping? TextBlock with `.intersects()`. A logo with text punched out of a shape? `fromGlyph()` with `.difference()`. Characters scattered along a curved path? `fromGlyph()` with [parametric sampling](/blog/pathblock-parametric-sampling). A diagram with precisely measured annotations? TextBlock with a loaded `@font` for exact metrics.

The font integration features build directly on the PathBlock foundation covered in the [PathBlock series](/blog/pathblock-introduction) — if you haven't explored [transforms](/docs#path-blocks-transforms), [sampling](/blog/pathblock-parametric-sampling), [fillets](/blog/pathblock-fillets-chamfers), and [boolean operations](/blog/pathblock-boolean-operations), those posts show the full range of what glyph PathBlocks inherit. Every operation that works on a hand-drawn `@{ h 50 v 30 z }` shape works identically on a glyph extracted from a font.

Try it yourself in the [Pathogen playground](/) — load a font with `@font`, extract some glyphs, and see what happens when typography becomes geometry.

---
title: "TextBlock: Measure-First Text for SVG Diagrams"
slug: textblock-introduction
date: 2026-03-16
description: "Compose, measure, and position text before drawing — collision-free label placement for parametric SVG diagrams."
---

*Part 1 of 2 in our series on TextBlock and font integration.*

> **Series: TextBlock & Font Integration**
> 1. **TextBlock: Measure-First Text for SVG Diagrams** (this post)
> 2. [From Fonts to Paths: Glyph Extraction with PathBlock.fromGlyph()](/blog/pathblock-glyph-extraction)

> **Prerequisites:** This post assumes familiarity with PathBlock basics — the `@{}` sigil, `.draw()`, and `.project()`. If you're new to Pathogen, start with [Introduction to PathBlocks](/blog/pathblock-introduction).

Labels on parametric diagrams have a coordination problem. The geometry is computed — points, curves, bounding boxes are all known values — but the text that annotates that geometry gets hard-coded at pixel offsets, with no way to ask "how wide is this string?" before placing it. When the font size changes, the data changes, or the viewport scales, those hard-coded offsets break silently, producing overlapping labels or text that drifts away from the thing it's supposed to annotate.

TextBlock solves this by making text a measurable, positionable value — the same compose-then-place pattern that [PathBlock](/blog/pathblock-introduction) brought to shapes. You compose text at relative coordinates, measure its bounding box before placing it, project it into position using polar coordinates and semantic anchors, and check for collisions against other labels and geometry. The result is label placement that adapts automatically when anything changes.

## What Is a TextBlock?

A TextBlock is a composition of text elements at relative coordinates. You create one with the `&{ }` sigil — the text counterpart to PathBlock's `@{ }` — and the elements inside are positioned relative to an implicit `(0, 0)` origin. Like a PathBlock, the TextBlock doesn't draw anything on its own. It's a value: a template holding text content and relative positions, waiting to be styled, measured, and placed. See the full [TextBlock syntax](/docs#text-block-syntax) documentation for details.

```pathogen
let label = &{
  text(0, 14)`Server Node`
  text(0, 30)`Status: online`
  text(0, 48)`Latency: 12ms`
};
```

Each `text(x, y)` statement positions a text element relative to the block's origin. The backtick-delimited content follows the coordinate pair. You can have as many `text()` statements as you need — a single-line label, a multi-line card, a table of values.

The anatomy diagram below shows how this works in practice. A three-line TextBlock is defined once, then drawn at two different positions using `.drawTo()`. The green crosshairs mark each placement's origin. The dashed amber rectangles show the bounding box — measured once from the TextBlock value, valid at both locations. The arrow connecting the placements reinforces the key idea: one definition, many positions.

<mini-workspace src="samples/post11/textblock-anatomy.pathogen" caption="TextBlock anatomy — compose once, place anywhere with bounding box overlay"></mini-workspace>

The coordinate model mirrors SVG's `<text>` element: `y` is the baseline position, so `text(0, 14)` places the first baseline 14 units below the origin. This means the text's visible pixels extend *above* that y coordinate, not below it.

TextBlocks also support [control flow](/docs#text-block-syntax) — `let`, `for`, and `if` work inside the block just as they do elsewhere in Pathogen:

```pathogen
let items = ["CPU: 42%", "MEM: 1.2G", "NET: 88Mb/s"];
let card = &{
  text(0, 14)`Dashboard`
  for (i in 0..2) {
    text(0, calc(30 + i * 14))`${items[i]}`
  }
};
```

Notice the parallel with PathBlock: `@{ h 40 v 20 h -40 z }` captures relative path commands, while `&{ text(0, 14)\`Hello\` }` captures relative text elements. Both are inert values until you project or draw them. Both carry metadata (bounds, element count) you can query before committing to a position.

## Drawing and Positioning

Once you have a TextBlock, you need to place it. There are three positioning methods, each returning a [ProjectedTextValue](/docs#text-block-types) — text with absolute coordinates:

- **`.project(x, y)`** — offset all elements to absolute coordinates without drawing. Useful when you need to measure or test collisions before committing.
- **`.drawTo(x, y)`** — project and immediately emit to the active [TextLayer](/docs#text-block-syntax). This is the most common method.
- **`.polarProject(cx, cy, angle, distance, anchor)`** — project along a polar vector with anchor alignment. We'll cover this in detail below.

TextBlocks emit to TextLayers, which are the text counterpart to PathLayers. You define one with `define TextLayer('name') ${ styles }` and activate it with `layer('name').apply { ... }`:

```pathogen
define TextLayer('labels') #{ font-size: 12; fill: #333; }

layer('labels').apply {
  label.drawTo(50, 100);
}
```

This layer model keeps text and path geometry in separate SVG elements, which matters for rendering order, styling, and accessibility.

## Style Merge with <<

A TextBlock starts unstyled — it has no font-size, no font-family, no fill color. The `<<` operator merges a [style block](/docs#text-block-style-merging) into the TextBlock, producing a new styled TextBlock with block-level styles that apply to all elements unless overridden at the element level:

```pathogen
let info = &{
  text(0, 14)`Node Status`
  text(0, 30)`CPU: 42%`
  text(0, 44)`MEM: 1.2G`
};

let styled = info << #{ font-family: monospace; font-size: 12; };
```

The power here is that `info` remains unstyled. You can merge different styles into the same TextBlock to produce different presentations — and the bounding box adapts to each one:

```pathogen
let mono_sm = #{ font-family: monospace; font-size: 10; };
let mono_lg = #{ font-family: monospace; font-size: 14; };
let sans    = #{ font-family: sans-serif; font-size: 12; };

let bb1 = (info << mono_sm).boundingBox();  // compact
let bb2 = (info << mono_lg).boundingBox();  // wider, taller
let bb3 = (info << sans).boundingBox();     // different widths
```

This separation of content from presentation is what makes TextBlock composable. Define the text structure once, apply different styles for different contexts, measure for layout, then place. The `<<` operator does not mutate the original — it returns a new value with the styles merged in, leaving the original available for reuse.

The demo below shows the same three-line TextBlock rendered with three different style blocks. The dashed outlines are the bounding boxes — each one reflects the actual measured dimensions for that style variant.

<mini-workspace src="samples/post11/style-merge.pathogen" caption="One TextBlock, three styles — bounding box adapts to each font configuration"></mini-workspace>

The dimension annotations at the bottom of each variant confirm what the code reports: same content, different measurements. A monospace 10px version is compact; monospace 14px is proportionally larger; sans-serif 12px has different character widths entirely. The `<<` operator and `.boundingBox()` handle all of this transparently.

## Measuring Before You Place

The central insight of TextBlock is that you can measure text *before* deciding where to put it. The [`.boundingBox()`](/docs#text-block-methods) method returns an object with `x`, `y`, `width`, and `height` — the estimated bounding rectangle of all text elements in the block. Using the `<<` operator introduced above, you style a TextBlock before measuring so the metrics reflect the actual font configuration:

```pathogen
let label = &{ text(0, 14)`Hello World` } << #{ font-size: 14; };
let bb = label.boundingBox();
log(bb.width);   // estimated pixel width
log(bb.height);  // fontSize * 1.2 (line height)
```

This measurement drives layout decisions. Need to center a label above a shape? Subtract half the width. Need to check whether two labels overlap? Compare their bounding boxes. Need to draw a background rectangle behind text? Use the bbox dimensions directly. Need to verify that a label fits inside a container? Compare bbox width to the container's width.

The measurement works on both TextBlockValues (relative coordinates) and ProjectedTextValues (absolute coordinates). On a TextBlockValue, the bbox is relative to the origin — just like measuring a PathBlock's `.bounds` before drawing. On a ProjectedTextValue, the bbox reflects the absolute position.

TextBlock computes these estimates using built-in [character width tables](/docs#text-block-font-metrics) that cover three font categories:

- **Sans-serif** (default): per-character widths approximating Arial/Helvetica
- **Serif**: per-character widths approximating Times New Roman
- **Monospace**: uniform character width approximating Courier New

The metrics respect several style properties:

- **`font-size`** (default 16) — scales all character widths proportionally
- **`font-family`** — selects the appropriate width table (category detection: serif, sans-serif, or monospace)
- **`font-weight`** — bold applies a ~6% width increase
- **`letter-spacing`** — adds uniform spacing between characters
- **tspan `dx`/`dy` offsets** — accounted for in multi-span text elements

> **Accuracy: 85-90% for Latin text.** A label that measures 87px might actually render at 100px — a gap of roughly one character width at typical font sizes. This is sufficient for collision avoidance, anchor-based layout, and background rectangle sizing, where a few pixels of margin are invisible. It is *not* sufficient for pixel-perfect alignment, tight kerning, or text that must match an exact grid. For those cases, Part 2 of this series covers the [`@font` directive](/blog/pathblock-glyph-extraction), which loads OpenType font files for exact glyph measurement.

The demo below shows `.boundingBox()` at three different font sizes. Each row renders the same text, measures it, and draws width/height dimension lines. Notice how the bounding box scales with font size — the measurement adapts automatically.

<mini-workspace src="samples/post11/bbox-measurement.pathogen" caption="Bounding box measurement at font sizes 10, 16, and 24 — width and height scale with the text"></mini-workspace>

## Polar Projection with BBoxAnchor

Placing labels around a shape — node diagrams, compass roses, radial charts — is one of the most common annotation patterns in technical SVGs. The naive approach is to compute `x` and `y` offsets by hand, adjusting for text width and height at each position. A label to the right of a circle needs `x = centerX + radius + gap`; a label above needs `y = centerY - radius - textHeight`. Each direction requires different math, and every label with different content needs a different width offset. This is tedious, error-prone, and breaks the moment the text content or font size changes.

[`.polarProject()`](/docs#text-block-polar-projection) replaces all of that with two clean ideas: polar coordinates for direction and distance, and anchor alignment for text positioning.

```pathogen
let label = &{ text(0, 14)`Node A` } << #{ font-size: 14; };

// Place 80px from center at 45 degrees, anchored at center-left
let placed = label.polarProject(100, 100, 45deg, 80, BBoxAnchor.Left);
```

The first two arguments are the center point (the thing you're labeling). The angle and distance describe *where* the label goes in polar coordinates. The fifth argument — the [BBoxAnchor](/docs#text-block-bboxanchor-enum) — is the key innovation: it specifies which point of the text's bounding box lands on the target location.

The nine anchor positions form a grid over the bounding box:

```
BBoxAnchor.TopLeft      BBoxAnchor.Top      BBoxAnchor.TopRight
BBoxAnchor.Left         BBoxAnchor.Center   BBoxAnchor.Right
BBoxAnchor.BottomLeft   BBoxAnchor.Bottom   BBoxAnchor.BottomRight
```

The convention is that the **anchor faces the center** — so a label projected to the right of a shape uses `BBoxAnchor.Left` (the left edge of the text box is closest to the center), while a label above uses `BBoxAnchor.Bottom`. This keeps text radiating outward naturally.

The compass demo below shows this in action. Eight labels are placed at 45-degree intervals around a central hexagon, each using the appropriate anchor. The amber dots mark the polar target points on the guide circle; the text stays clear of the shape at every position.

<mini-workspace src="samples/post11/polar-compass.pathogen" caption="Polar projection — 8 labels around a hexagon with directional BBoxAnchor alignment"></mini-workspace>

The code for each label is minimal — a one-line TextBlock, a `polarProject()` call, and a `draw()`. The loop at the center of the demo iterates through names and anchors in parallel:

```pathogen
for (i in 0..7) {
  let angle = calc(i * 0.7854 - 1.5708);
  let label = &{ text(0, 11)`${names[i]}` } << label_styles;
  let proj = label.polarProject(0, 0, angle, 160, anchors[i]);
  proj.draw();
}
```

No magic offsets. No per-label width calculations. Change the label text, the font size, or the radius, and the layout adapts. The `polarProject()` method handles the trigonometry internally — computing `cos(angle) * distance` and `sin(angle) * distance` for the target point, then shifting the text so the specified anchor point lands exactly there.

This matters because label placement around shapes is combinatorial. A hexagon with 6 vertex labels, 6 edge labels, and a center label requires 13 placements. Doing those with manual offsets means 26 magic numbers (x and y for each). With `polarProject()`, it's 13 calls with angles, one shared radius, and the appropriate anchors. When you add a seventh vertex to the polygon, the labels redistribute automatically.

## Collision Avoidance

Placing labels one at a time works until two of them end up on top of each other. Scatter plots, node graphs, and dense diagrams inevitably produce clusters where data points are close together and naive placement causes overlaps. A label that's perfectly clear in one dataset collides with its neighbor when the data changes. This is the label placement problem — well-studied in cartography and information visualization — and TextBlock brings a pragmatic solution directly into the language.

TextBlock's [`.intersects()`](/docs#text-block-intersection-detection) method detects collisions using axis-aligned bounding box (AABB) overlap testing.

```pathogen
let label1 = (&{ text(0, 14)`First` } << styles).project(50, 50);
let label2 = (&{ text(0, 14)`Second` } << styles).project(55, 55);

if (label1.intersects(label2)) {
  // Labels overlap — try a different position
}
```

`.intersects()` accepts a ProjectedTextValue (for text-vs-text checks), a ProjectedPathValue (for text-vs-shape checks), or a plain object with `{x, y, width, height}` (for text-vs-rectangle checks). The test is fast — it's a simple AABB comparison — which makes it practical to run in a loop over multiple candidate positions.

The simplest collision check is a single-direction attempt: project the label in your preferred direction and test whether it overlaps anything already placed:

```pathogen
let candidate = label.polarProject(
  pt.x, pt.y, 0, dist, BBoxAnchor.Left
);
// (dot-position checks omitted — see full sample)
if (!candidate.intersects(prevLabel)) {
  candidate.draw();
}
```

When a single direction isn't enough, expand to an 8-angle search that tries each compass direction in order and picks the first collision-free position:

```pathogen
let try_anchors = [
  BBoxAnchor.Left, BBoxAnchor.BottomLeft,
  BBoxAnchor.Bottom, BBoxAnchor.BottomRight,
  BBoxAnchor.Right, BBoxAnchor.TopRight,
  BBoxAnchor.Top, BBoxAnchor.TopLeft,
];

for (ai in 0..7) {
  let angle = calc(ai * 0.7854);
  let candidate = label.polarProject(
    pt.x, pt.y, angle, dist, try_anchors[ai]
  );
  // (dot-position checks omitted — see full sample)
  let ok = true;
  for (prev in placed) {
    if (candidate.intersects(prev)) { ok = false; }
  }
  if (ok) { best = candidate; found = true; }
}
```

Each angle is paired with an anchor that faces back toward the center point. This means the label always radiates outward, regardless of which direction it ends up. The search stops at the first collision-free candidate, so labels near the top of the list get their preferred direction (right, then bottom-left, then bottom, and so on).

The demo below shows the full pattern in action: a scatter of 8 data points, labeled in two ways. The left panel uses naive fixed-offset placement — every label is shifted right of its point by 8 pixels. Three clusters produce visible collisions, highlighted with red dashed boxes. The right panel uses the 8-angle search above. Study the demo source to see how the complete loop integrates with the data point geometry checks.

<mini-workspace src="samples/post11/collision-avoidance.pathogen" caption="Before and after — naive fixed-offset placement vs smart 8-angle collision avoidance"></mini-workspace>

Unlike force-directed label placement (as in D3), TextBlock's collision avoidance is deterministic and runs at compile time — the same input always produces the same layout.

This is a greedy algorithm — it doesn't guarantee a globally optimal layout, but it's fast and produces good results for the cluster sizes typical in diagrams. The search is O(N^2) in the number of labels — fast for typical diagrams with 2-20 labels, but worth noting at larger scales. You could customize the preference order, increase the number of angles for finer-grained search, or adjust the distance for denser layouts. For truly dense point clouds, you might combine this with `.translate()` as a fallback — nudging a label incrementally until it clears.

The `.intersects()` check also works against path geometry and plain rectangles, not just other TextBlocks. This means you can verify that labels don't overlap shapes, borders, axis lines, or any other element in the diagram. The collision-avoidance demo checks against both previously placed labels *and* the data point circles themselves, ensuring labels don't obscure the data they annotate.

## Magic Numbers vs Semantic Anchors

To see why `polarProject()` matters, compare the two approaches side by side. The left panel places four cardinal labels around a hexagon using manual offset arithmetic:

```pathogen
// Manual: compute x from center minus half text width
text(133, 138)`Top`     // 150 - 17 = 133 (how wide is "Top"?)
text(218, 213)`Right`   // 210 + 8 = 218 (what's the gap?)
text(124, 290)`Bottom`  // 150 - 26 = 124 (different width!)
text(57, 213)`Left`     // 90 - 38 = 52 (why 38?)
```

Every position is a magic number derived from the text content, the font metrics, and the shape geometry. Change the text from "Top" to "North" and the offset is wrong. Change the font size and every number needs recalculation.

The right panel uses `polarProject()`:

```pathogen
top_label.polarProject(450, 210, -PI/2, 75, BBoxAnchor.Bottom)
right_label.polarProject(450, 210, 0, 75, BBoxAnchor.Left)
bottom_label.polarProject(450, 210, PI/2, 75, BBoxAnchor.Top)
left_label.polarProject(450, 210, PI, 75, BBoxAnchor.Right)
```

Four calls, four directions, one radius. The text content doesn't appear in the positioning logic at all — it's fully decoupled. The demo below makes the contrast visual: red annotations on the left expose the fragile arithmetic; green annotations on the right show the semantic anchor names.

<mini-workspace src="samples/post11/before-after.pathogen" caption="Manual offset math (fragile) vs polarProject with BBoxAnchor (adaptive)"></mini-workspace>

The right panel adapts to any text content, font size, or font family without changing a single coordinate. Swap "Top" for "North" and the anchor still centers the text correctly above the shape. Double the font size and the label still clears the hexagon's edge. This is the fundamental value proposition of TextBlock: text becomes a measurable, composable value that participates in the same spatial reasoning as paths and shapes.

The manual approach isn't just more work — it's more *fragile* work. Every time the diagram's parameters change (and in parametric SVGs, that's the whole point), the magic numbers need manual recalculation. `polarProject()` makes the positioning logic parameter-free with respect to text content.

## Putting It Together

TextBlock follows the same lifecycle as PathBlock: **compose, measure, position, draw**. Here's the complete pipeline in one snippet:

```pathogen
// 1. Compose — relative coordinates, no styles yet
let label = &{
  text(0, 14)`Temperature`
  text(0, 28)`23.4 C`
};

// 2. Style — merge font and color properties
let styled = label << #{ font-family: monospace; font-size: 12; };

// 3. Measure — get bounding box before placing
let bb = styled.boundingBox();

// 4. Position — project with collision awareness
let placed = styled.polarProject(cx, cy, angle, radius, BBoxAnchor.Left);

// 5. Verify — check for overlaps
if (!placed.intersects(otherLabel)) {
  // 6. Draw — emit to the active TextLayer
  placed.draw();
}
```

Each step is a pure value transformation until `.draw()`. You can inspect, branch on, and iterate over the intermediate results. This pipeline means text is no longer an afterthought bolted onto a diagram. It's a first-class participant in the layout — queryable, testable, and automatically adaptive. Labels can respond to the geometry they annotate instead of being hard-coded beside it.

The TextBlock API surface is small by design — a handful of methods that compose cleanly. For a deeper look at each one, see the [TextBlock documentation](/docs#text-block-syntax), which covers all [methods](/docs#text-block-methods), [properties](/docs#text-block-properties), [style merging](/docs#text-block-style-merging), [BBoxAnchor](/docs#text-block-bboxanchor-enum), [font metrics](/docs#text-block-font-metrics), [polar projection](/docs#text-block-polar-projection), and [intersection detection](/docs#text-block-intersection-detection).

## What's Next

The built-in character width tables get you 85-90% accuracy — enough for layout and collision avoidance. But sometimes you need exact metrics: tight-fitting background rectangles, precise kerning, or text that aligns to a pixel grid. The next post, [From Fonts to Paths: Glyph Extraction with PathBlock.fromGlyph()](/blog/pathblock-glyph-extraction), covers the `@font` directive that loads OpenType font files for exact measurement, and `PathBlock.fromGlyph()` that converts individual glyphs into PathBlocks — actual SVG path geometry — that you can transform, [sample](/blog/pathblock-parametric-sampling), [fillet](/blog/pathblock-fillets-chamfers), and [boolean-combine](/blog/pathblock-boolean-operations) just like any other shape.

Text as geometry. That's where this is headed.

Paste the collision-avoidance snippet into the [playground](/) and change the data point positions — watch the labels redistribute automatically.

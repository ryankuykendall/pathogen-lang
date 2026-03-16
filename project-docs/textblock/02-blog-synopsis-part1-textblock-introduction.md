# Blog Synopsis: TextBlock — Measure-First Text for SVG Diagrams

**Slug**: `textblock-introduction`
**Date**: TBD
**Series**: TextBlock & Font Integration (Part 1 of 2)

## Synopsis (~250 words)

SVG `<text>` has a fundamental problem for programmatic diagrams: you can't know how wide a label is until after you've drawn it. This makes collision-free label placement impossible without trial and error — or external measurement APIs that don't exist inside a compiler.

TextBlock solves this with a **compose-measure-position** workflow. The `&{}` sigil creates a text value at relative coordinates without drawing anything. You call `.boundingBox()` to get estimated dimensions, then `.project()` or `.polarProject()` to place it precisely — all before a single pixel is emitted.

This post introduces TextBlock through progressively complex examples:

1. **Basic composition** — The `&{}` sigil, `text()` statements, multi-element blocks, and the `<<` style merge operator. How TextBlock parallels PathBlock as a "compose first, draw later" primitive.

2. **Measurement** — `.boundingBox()` returns `{x, y, width, height}` using a two-tier system: built-in character width tables (~85-90% accuracy for Latin text) when no font is loaded, or exact kerning-aware metrics from opentype.js when a font is loaded via `@font`. Font-size, font-weight, letter-spacing, and font-family category all factor in.

3. **Positioning** — `.project(x, y)` for absolute placement, `.drawTo(x, y)` for one-step emit, and `.polarProject()` with `BBoxAnchor` for placing labels at compass positions around geometry.

4. **Collision avoidance** — `.intersects()` tests AABB overlap between projected labels, projected paths, or arbitrary rectangles. A loop-based layout example shows labels automatically nudging to avoid overlaps.

The post closes by showing how `.polarProject()` with anchors replaces pages of manual offset arithmetic, and previews Part 2's glyph extraction for exact font metrics and path-based typography.

## Target Audience

Users familiar with PathBlock basics who want to add text labels to parametric SVG diagrams.

## Key Links to Documentation

- `/pathogen/docs#text-block-syntax`
- `/pathogen/docs#text-block-methods`
- `/pathogen/docs#text-block-bboxanchor-enum`
- `/pathogen/docs#text-block-polar-projection`
- `/pathogen/docs#text-block-intersection-detection`

## Estimated Mini-Workspace Demos

1. **TextBlock anatomy** — Simple `&{}` with two text elements, showing relative coordinates
2. **Bounding box visualization** — Label + rectangle overlay showing `.boundingBox()` output
3. **Polar projection compass** — Labels placed at 8 compass positions around a shape using `BBoxAnchor`
4. **Collision avoidance** — Dense label set with `.intersects()` nudging overlapping labels
5. **Before/after comparison** — Manual position math vs `.polarProject()` for the same layout

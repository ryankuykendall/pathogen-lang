# Blog Synopsis: From Fonts to Paths — Glyph Extraction with PathBlock.fromGlyph()

**Slug**: `pathblock-glyph-extraction`
**Date**: TBD (day after Part 1)
**Series**: TextBlock & Font Integration (Part 2 of 2)

## Synopsis (~250 words)

TextBlock measures text, but what if you need text *as geometry* — path commands you can transform, boolean-combine, or sample? The `@font` directive and `PathBlock.fromGlyph()` bridge this gap by converting loaded font glyphs into PathBlock values.

This post covers the full font-to-path pipeline:

1. **Loading fonts** — The `@font` directive declares fonts by family name or file path, with optional weight. The CLI searches system font directories; the playground auto-fetches from Google Fonts. A single directive makes a font available to both TextBlock metrics and glyph extraction.

2. **Extracting glyphs** — `PathBlock.fromGlyph(text, styles)` converts each character into a PathBlock with the glyph's vector outline. The style block must include `font-family` and optionally `font-size` (default 16) and `font-weight` (default 400). The result is an array — one PathBlock per character.

3. **Manual text layout** — Each glyph PathBlock carries an `.advanceWidth` property for cursor advancement. A `for` loop accumulating advance widths reproduces the text layout engine's job, with full control over spacing, baseline shifts, and per-character transforms.

4. **Contour decomposition** — `.contours` splits multi-contour glyphs (like "O" with its outer ring and inner hole) into separate PathBlocks. Each contour supports all PathBlock operations: sampling, transforms, boolean ops.

5. **Practical composition** — Combining glyph paths with geometry using `.union()`, `.difference()`, and `.scale()` to create logo-style artwork, text cutouts, and typographic patterns.

The post closes with the relationship between `@font` and TextBlock — loaded fonts upgrade `.boundingBox()` from estimation tables to exact opentype.js metrics.

## Target Audience

Users who want to treat text as manipulable geometry — logo design, generative typography, text cutouts, typographic art.

## Key Links to Documentation

- `/pathogen/docs#path-blocks-font-integration`
- `/pathogen/docs#path-blocks-font-directive`
- `/pathogen/docs#path-blocks-pathblockfromglyphtext-styles`
- `/pathogen/docs#path-blocks-advancewidth`
- `/pathogen/docs#path-blocks-contours`
- `/pathogen/docs#path-blocks-error-cases`

## Estimated Mini-Workspace Demos

1. **Hello World glyph layout** — `PathBlock.fromGlyph("Hello", ...)` with advance-width loop placing each letter
2. **Contour decomposition** — "O" glyph split into outer/inner contours, drawn separately with different fills
3. **Per-character transforms** — Each letter of a word scaled or rotated individually (wave/arc text effect)
4. **Text cutout** — Glyph `.union()` merged into a single path, then `.difference()` punched from a rectangle
5. **Font metrics upgrade** — Side-by-side showing TextBlock `.boundingBox()` with estimation tables vs loaded font precision

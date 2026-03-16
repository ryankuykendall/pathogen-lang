# Blog Drafts Status

## Part 1: TextBlock — Measure-First Text for SVG Diagrams

**File:** `website/blog/textblock-introduction.md`
**Slug:** `textblock-introduction`
**Date:** 2026-03-16
**Word count:** ~3,100

**Sections:**
1. Opening — problem statement (SVG text measurement gap)
2. What Is a TextBlock? — `&{}` sigil, `text()` statements, demo: textblock-anatomy
3. Drawing and Positioning — `.project()`, `.drawTo()`, `.polarProject()`
4. Measuring Before You Place — `.boundingBox()`, two-tier metrics, demo: bbox-measurement
5. Style Merge with `<<` — same content, different styles, demo: style-merge
6. Polar Projection with BBoxAnchor — 9 anchors, compass demo: polar-compass
7. Collision Avoidance — `.intersects()`, 8-angle search, demo: collision-avoidance
8. Magic Numbers vs Semantic Anchors — before/after demo: before-after
9. Putting It Together — full pipeline summary
10. What's Next — preview Part 2

**Mini-workspaces:** 6 (all in `samples/post11/`, all compiled)

## Part 2: From Fonts to Paths — Glyph Extraction with PathBlock.fromGlyph()

**File:** `website/blog/pathblock-glyph-extraction.md`
**Slug:** `pathblock-glyph-extraction`
**Date:** 2026-03-17
**Word count:** ~3,050

**Sections:**
1. Opening — text as geometry motivation
2. Loading Fonts with @font — directive syntax, CLI vs playground
3. Extracting Glyphs — `fromGlyph()` API, style requirements
4. Manual Text Layout with advanceWidth — loop pattern, demo: glyph-layout
5. Contour Decomposition — `.contours`, "Bingo!" example, demo: contour-decomposition
6. Per-Character Transforms — wave/grow/circular, demo: per-char-transforms
7. Text Cutout with Boolean Operations — union + difference pipeline, demo: text-cutout
8. Paths vs Text: Why @font Matters — renderer-measurer identity, demo: metrics-upgrade
9. What's Next — building blocks summary

**Mini-workspaces:** 5 (all in `samples/post12/`, all compiled)

## Build Status

Both posts compile via `npm run build:blog` with no errors.

## Next Steps

1. Agentic review (per blogging playbook Step 4)
2. Final version incorporating review feedback (Step 5)
3. Publish and verify links (Step 6)

# Verification: Instructional Designer Review

**Reviewer:** Alex Rivera, Staff Instructional Designer & Technical Writer
**Date:** 2026-03-16
**Scope:** Verification of revisions to Post 1 (TextBlock Introduction) and Post 2 (Glyph Extraction) against weaknesses identified in the original review (`06-agentic-review-id.md`).

---

## Post 1 Verification

### Original Weakness 1: Prerequisite knowledge boundary is implicit, not stated
- **RESOLVED** — The revised post adds a prominent blockquote callout immediately below the series TOC: *"Prerequisites: This post assumes familiarity with PathBlock basics — the `@{}` sigil, `.draw()`, and `.project()`. If you're new to Pathogen, start with Introduction to PathBlocks."* This is exactly the fix I recommended — a named prerequisites section with a direct link to the prior post. A developer arriving from a search engine now knows what to read first.

### Original Weakness 2: `.boundingBox()` accuracy caveat is buried and under-explained
- **RESOLVED** — The accuracy disclosure has been pulled out of inline prose into a dedicated blockquote callout with a bold header: *"Accuracy: 85-90% for Latin text."* The callout includes a concrete example ("a label that measures 87px might actually render at 100px — a gap of roughly one character width at typical font sizes"), names the use cases where estimation is sufficient (collision avoidance, anchor-based layout, background rectangles), names the use cases where it is not (pixel-perfect alignment, tight kerning, grid alignment), and directs the reader to Part 2 for exact metrics. This is a significant improvement — the information is now impossible to miss and gives readers enough to assess whether estimation meets their needs.

### Original Weakness 3: BBoxAnchor "faces the center" convention lacks a visual diagram
- **PARTIALLY RESOLVED** — The revised post retains the ASCII grid of nine anchor positions and adds explanatory prose: "the anchor faces the center — so a label projected to the right of a shape uses `BBoxAnchor.Left`." The compass demo is still the primary visual, and it does show the convention in action. However, the dedicated anchor-position diagram I recommended — a single bounding box with nine labeled points and arrows showing the "faces the center" directionality — is not present. The existing coverage is adequate for most readers, but a visual learner encountering the convention for the first time would still benefit from one more diagram. This is a minor gap, not a blocking concern.

### Original Weakness 4: Cognitive load spikes in the collision-avoidance section
- **RESOLVED** — The revised post now decomposes the collision-avoidance pattern into two stages. First, a "simplest collision check" subsection introduces a single-direction attempt with a minimal code block (one `polarProject` call, one `intersects` check). Then a second code block expands to the full 8-angle search. This two-step scaffolding is exactly the decomposition I recommended. The reader internalizes the single-angle pattern before encountering the loop, nested iteration, and anchor array. The explanatory prose between the two blocks bridges the conceptual gap cleanly.

### Original Weakness 5: Style-merge section (`<<` operator) arrives late in the conceptual sequence
- **RESOLVED** — The `<<` operator now has its own section ("Style Merge with <<") positioned before the "Measuring Before You Place" section. This means the reader encounters the operator's definition and semantics before seeing it used in `.boundingBox()` examples. The forward-reference problem is eliminated. The measuring section now opens with a natural callback: "Using the `<<` operator introduced above, you style a TextBlock before measuring so the metrics reflect the actual font configuration." This is clean dependency ordering.

---

## Post 2 Verification

### Original Weakness 1: `@font` environment-specific behavior could confuse developers switching between CLI and Playground
- **RESOLVED** — The revised post includes a dedicated blockquote callout titled "CLI vs Playground" that explicitly states the behavioral difference: CLI loads from local file paths or system font directories, Playground fetches from Google Fonts by family name. The callout also notes that both environments use the same opentype.js parser, so identical font files produce identical geometry. The preceding prose section also covers this in the body text. Between the inline explanation and the callout, the reader is well-informed about which environment each example targets and what to expect.

### Original Weakness 2: Contour decomposition section lacks a practical workflow example
- **RESOLVED** — The revised post now includes a full end-to-end code example showing how to draw each contour of a "B" glyph with a different fill color. The code iterates over contours, creates a per-contour PathLayer with distinct stroke and fill colors from a palette, and draws each contour at the same position. The accompanying demo ("Bingo!" contour decomposition) decomposes six characters into 12 contours with individually colored fills. The color key in the demo identifies each piece. This grounds the concept with a concrete, reproducible workflow that the reader can adapt.

### Original Weakness 3: Union chaining in the text-cutout section has a variable-shadowing issue
- **RESOLVED** — The revised code no longer re-declares `let text` twice. Instead, it uses `let combined` for the union accumulation and mutates it with a reassignment (`combined = combined.project(0, 0).union(...)`) rather than re-declaring with `let`. The variable naming is clear and the progression from individual glyphs to a single combined PathBlock to the final cutout is readable. There is no ambiguity about scoping.

### Original Weakness 4: Post does not address performance implications of glyph extraction
- **RESOLVED** — The revised "Paths vs Text: Why @font Matters" section opens with a direct statement: "Converting text to paths produces more SVG data than `<text>` elements — a single glyph may contain 20+ Bezier segments. For short words and display text this is negligible; for paragraph-length content, prefer TextBlock." This is concise, correctly placed, and gives the reader a clear heuristic for choosing between the two approaches. It does not over-engineer the guidance — one sentence is sufficient for this audience.

### Original Weakness 5: Circular arc text is introduced without sufficient geometric setup
- **RESOLVED** — The revised post now leads the circular arc section with the key geometric relationship: "The key geometric relationship is `angle = arc_length / radius` — dividing a character's advance width by the arc radius converts linear distance to angular offset in radians." This sentence appears before the code block, giving the reader the mathematical foundation needed to understand the `char_mid / arc_r` expression. The explanation is self-contained and does not assume prior knowledge of arc-length parameterization.

---

## Cross-Post Assessment: Prerequisites Gap

### Original Weakness: Neither post includes an explicit "Prerequisites" section
- **PARTIALLY RESOLVED** — Post 1 now includes a clear prerequisites callout referencing the PathBlock introduction. Post 2, however, does not include a parallel prerequisites callout. The series TOC and the opening paragraph do establish that Post 2 builds on Post 1, and the body text links to the PathBlock series and boolean operations post. But a developer arriving at Post 2 from a search engine does not see an explicit "Prerequisites: This post assumes you have read Part 1 and are familiar with PathBlock boolean operations" callout. Given the generous cross-linking throughout the body, this is a minor gap — but adding a prerequisites blockquote to Post 2 (mirroring Post 1's format) would complete the pattern.

---

## Remaining Concerns

1. **Post 2 prerequisites callout is missing.** As noted above, Post 1 now has an explicit prerequisites blockquote, but Post 2 does not mirror this pattern. Adding one would give the series a consistent onboarding surface for readers who enter mid-stream. Suggested text: *"Prerequisites: This post builds on Part 1 (TextBlock) and assumes familiarity with PathBlock basics, including boolean operations (`.union()`, `.difference()`). See the [PathBlock series](/pathogen/blog/pathblock-introduction) for background."*

2. **The text-cutout demo uses a visual approximation rather than actual boolean operations.** The prose describes the boolean `.union()` / `.difference()` pipeline as "the production approach," but the accompanying `<mini-workspace>` demo uses the simpler overlay technique (drawing glyphs in background color over a plate). The post is transparent about this — the "Visual Approximation" subheading names the technique honestly, and the production code is shown in a separate code block. This is a pedagogical trade-off (the visual result is identical and the demo is simpler to follow), but a reader skimming the demo without reading the surrounding prose might not realize the demo does not demonstrate the boolean pipeline it illustrates. Consider adding a brief caption note to the demo itself: "This demo uses color overlay for visual simplicity; the boolean pipeline above produces the same result as a single path."

3. **No explicit mention of accessibility trade-offs.** Converting text to paths removes semantic text from the SVG. A `<text>` element is readable by screen readers and searchable; a `<path>` element representing the same glyph is neither. Post 2 mentions this implicitly in the "Paths vs Text" section ("the output is semantic SVG `<text>` that's accessible and searchable" — referring to TextBlock) but does not state the converse for `fromGlyph()`. A single sentence noting that glyph paths are not accessible text would help developers make informed choices, particularly for content that needs to meet WCAG requirements.

---

## Summary

Of the 10 specific weaknesses raised in the original review (5 per post) plus 1 cross-post gap:

- **9 RESOLVED** — substantive revisions that fully address the original concern
- **2 PARTIALLY RESOLVED** — Post 1's BBoxAnchor visual diagram (adequate but not ideal) and Post 2's missing prerequisites callout (minor gap in an otherwise well-linked post)

The revisions are thorough and well-executed. The three remaining concerns above are refinements, not structural issues. The posts are ready for publication in their current form.

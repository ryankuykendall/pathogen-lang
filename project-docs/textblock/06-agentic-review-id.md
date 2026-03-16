# Agentic Review: Instructional Designer / Technical Writer

**Reviewer:** Alex Rivera, Staff Instructional Designer & Technical Writer
**Domain:** 2D Vector Graphics Programming Documentation
**Date:** 2026-03-16

---

## Post 1: TextBlock: Measure-First Text for SVG Diagrams

### Strengths

- **Problem-first framing sets a clear learning objective.** The opening paragraph identifies the exact pain point (hard-coded pixel offsets breaking when parameters change) before introducing the solution. This is textbook motivational scaffolding — the reader knows *why* TextBlock exists before learning *what* it is. The "labels on parametric diagrams have a coordination problem" sentence is a strong hook because it names a frustration the target audience has lived through.

- **Concept sequencing follows a natural dependency chain.** The post progresses through a well-ordered pipeline: compose (the `&{}` sigil and `text()` statements) then measure (`.boundingBox()`) then position (`.drawTo()`, `.polarProject()`) then verify (`.intersects()`). Each section depends on but does not duplicate the previous one. The "Putting It Together" section at the end explicitly numbers the six-step pipeline, reinforcing the mental model. This mirrors the compose-measure-position-draw lifecycle that PathBlock introduced, which is good curriculum coherence across the series.

- **The "Magic Numbers vs Semantic Anchors" section is outstanding pedagogical contrast.** Showing the manual-offset code side by side with the `polarProject()` equivalent — with specific arithmetic like `150 - 17 = 133 (how wide is "Top"?)` — makes the fragility visceral. The parenthetical annotations in the comments ("how wide is 'Top'?", "different width!", "why 38?") voice the reader's own confusion, which is a powerful instructional technique. This section alone would convince a skeptical reader.

- **Progressive disclosure of complexity is well-managed.** The post introduces the simple `.drawTo(x, y)` case first, defers polar projection to a dedicated section, and saves collision avoidance for last. A reader who only needs basic label placement can stop after the first three sections and still have a complete, useful workflow. The collision-avoidance section is clearly marked as an advanced pattern and includes an honest caveat about it being a greedy algorithm.

- **Interactive demos are placed at pedagogically correct moments.** Each `<mini-workspace>` appears immediately after the concept it illustrates, not before. The anatomy diagram follows the TextBlock definition; the bbox demo follows the measurement API; the collision demo follows the `.intersects()` explanation. This respects the principle that examples should *confirm* understanding, not *introduce* concepts.

### Weaknesses

- **The prerequisite knowledge boundary is implicit, not stated.** The post assumes familiarity with PathBlock (referencing `@{}`, `.draw()`, `.project()`, and the compose-then-place pattern) but never explicitly says "this post assumes you have read the PathBlock introduction." A developer new to Pathogen who lands on this post from a search engine would encounter unexplained parallels ("the text counterpart to PathBlock's `@{}`") without context. A single sentence at the top — or a prerequisites callout box — would fix this. The series TOC at the top helps, but it identifies sequence, not prerequisites.

- **The `.boundingBox()` accuracy caveat is buried and under-explained.** The "roughly 85-90% for Latin text" disclosure appears mid-paragraph in the Measuring section. For a developer making layout decisions based on these measurements, the accuracy boundary is critical information. It deserves a more prominent treatment — perhaps a callout or a dedicated subsection — with concrete examples of what "85-90%" means in practice (e.g., "a 100px-wide label might measure as 87px or 93px"). The transition to `@font` for exact metrics is mentioned but deferred to Part 2, which is fine for progressive disclosure, but the current post should give enough information for readers to assess whether estimation is sufficient for their use case.

- **The BBoxAnchor mental model has a "faces the center" convention that could confuse beginners.** The post states the convention (`BBoxAnchor.Left` for a label projected to the right) but does not include a visual diagram of the nine anchor positions mapped onto a bounding box. The ASCII grid of anchor names is helpful, but a visual showing an actual text box with the nine points marked and arrows indicating "this anchor faces the center" would reduce the cognitive load significantly. The compass demo partially serves this purpose, but readers need to synthesize the convention from the code — a dedicated anchor-position diagram before the compass demo would scaffold this better.

- **Cognitive load spikes in the collision-avoidance section.** The 8-angle search code example is the densest snippet in the post. It introduces a `try_anchors` array, a nested loop, a `found` flag, and the `0.7854` radian constant without decomposing these into smaller steps. For a developer unfamiliar with polar coordinates, this is a lot to absorb at once. Breaking this into two code blocks — first showing a single-angle attempt, then expanding to the 8-angle search — would reduce the working memory burden. The explanatory prose after the code block is good, but readers who get stuck in the code may not reach it.

- **The style-merge section (`<<` operator) arrives late in the conceptual sequence.** Styles affect measurement (font-size changes bounding box dimensions), so the `<<` operator is actually a dependency of the `.boundingBox()` section. The post introduces `<<` in the measuring section's code example (`label << ${ font-size: 14; }`) before formally explaining it two sections later. This forward reference creates a brief moment of confusion. Moving the style-merge section before or immediately after the measuring section would eliminate this gap.

### Overall Verdict

A well-structured, example-rich introduction that follows sound pedagogical principles — particularly the problem-first framing, the dependency-ordered concept sequence, and the magic-numbers-vs-semantic-anchors contrast. The main gaps are an unstated prerequisite boundary, a style-merge section that arrives after it is first used, and a collision-avoidance section that would benefit from one more layer of scaffolding. With those adjustments, this post would serve both the "I need to place labels" reader and the "I want to understand the design philosophy" reader effectively.

---

## Post 2: From Fonts to Paths: Glyph Extraction with PathBlock.fromGlyph()

### Strengths

- **The opening paragraph precisely delineates the boundary between Post 1 and Post 2.** It recaps what TextBlock provides (compose-measure-position for SVG `<text>`) and names exactly what it cannot do (sample outlines, apply fillets, boolean-punch). Then it lists three concrete scenarios — logo cutouts, generative typography, stencil designs — that require geometry rather than rendered text. This is a clean learning-objective statement: "after this post, you will be able to turn font glyphs into manipulable path geometry."

- **The three-stage text-cutout pipeline is a masterclass in procedural scaffolding.** Breaking the boolean text cutout into Extract, Union, and Punch — each with its own labeled code block and a single conceptual operation — manages cognitive load beautifully. The reader can understand each stage in isolation before seeing them composed. The `<mini-workspace>` demo reinforces this by laying the stages out left-to-right spatially, which maps the temporal sequence onto a spatial arrangement. This is strong visual pedagogy.

- **The `advanceWidth` concept is introduced with exactly the right amount of font-engineering context.** The explanation of why proportional fonts need variable spacing, the comparison to monospace, and the statement "this is the text layout engine's job, and now it's yours" gives the reader a mental model for what they are taking responsibility for when they choose glyph extraction over TextBlock. The proportional-vs-monospace demo with dashed tick marks makes the abstract concept concrete. This is well-calibrated for developers who are not typography specialists.

- **The "Paths vs Text: Why @font Matters" section addresses a subtle architectural question that most tutorials skip.** Explaining the measurement-rendering mismatch (browser font vs estimation table) and why `fromGlyph()` eliminates it gives the reader a principled framework for choosing between TextBlock and glyph extraction. This section elevates the post from a how-to into a why-to — the kind of conceptual depth that helps developers make good architectural decisions rather than just copying patterns.

- **Each per-character transform (wave, scale cascade, circular arc) builds on the same loop structure.** Showing three variations of the advance-width accumulation loop — with only the per-character transform changing — is effective example-driven learning. The reader internalizes the loop pattern through repetition while learning three different effects. The explicit callout that "the advance-width loop structure stays the same across all these effects" names the invariant, which is the kind of metacognitive prompt that accelerates transfer learning.

### Weaknesses

- **The `@font` environment-specific behavior could confuse developers switching between CLI and Playground.** The post states that CLI loads from local paths or system font directories, while Playground fetches from Google Fonts CDN. But the code examples use font names like "Inter" and "Bebas Neue" without specifying which environment they target. A developer following along in the CLI who writes `@font "Inter";` will get a different result depending on whether Inter is installed locally. A brief note per example — or a consistent callout like "these examples use Google Fonts names; for CLI, ensure the font is installed or provide a path" — would prevent a frustrating first experience.

- **The contour decomposition section lacks a practical workflow example.** The section explains what contours are and shows how to iterate them, but the use cases listed ("color the inside of an O differently", "animate the dot of an i") are described rather than demonstrated. Given that this is an advanced operation that most developers will not have encountered, a small end-to-end example — say, drawing the outer contour of a letter with one fill and the inner contour with another — would ground the concept. The `<mini-workspace>` demo shows contours colored differently, which is good, but the corresponding code in the post only shows iteration with a uniform `drawTo()`.

- **The union chaining in the text-cutout section has a variable-shadowing issue that may confuse readers.** The Stage 2 code declares `let text = ...` twice in succession. While the post is showing conceptual stages, this pattern would not compile in most languages (and it is unclear whether Pathogen allows re-declaration with `let`). If this is valid Pathogen syntax, it deserves a brief note. If it is pseudocode, it should be labeled as such. As written, a reader who tries to paste this directly will either encounter an error or be confused about variable scoping.

- **The post does not address performance implications of glyph extraction.** Converting text to paths produces significantly more SVG data than `<text>` elements — a single "O" glyph might have 20+ cubic Bezier segments. For a developer considering `fromGlyph()` for a diagram with 50 labels, there is no guidance on when the path-based approach becomes impractical. A brief note about the tradeoff — exact geometry vs output size and rendering cost — would help readers make informed choices. The "Paths vs Text" section is the natural home for this.

- **Circular arc text is introduced without sufficient geometric setup.** The arc layout code uses `arc_start`, `arc_r`, `arc_cx`, `arc_cy`, and the formula `char_mid / arc_r` (converting linear advance width to angular offset) without explaining the underlying geometry. A developer who has not worked with arc-length parameterization will not understand why dividing by the radius converts pixels to radians. One or two sentences explaining `angle = arc_length / radius` as the fundamental relationship would make this snippet self-contained. The wave and scale examples are immediately understandable; the arc example requires background knowledge that is not signposted.

### Overall Verdict

A strong second installment that successfully bridges typography and vector geometry — the three-stage cutout pipeline and the per-character transform variations are particularly well-scaffolded. The main instructional gaps are environment-specific font loading guidance, a variable-shadowing issue in the union example that could trip up readers, and an arc-text snippet that assumes arc-length parameterization knowledge without stating it. Addressing these would make the post fully self-contained for its target audience of developers who are competent programmers but not necessarily experienced with font engineering or computational geometry.

---

## Cross-Post Assessment

### Series Coherence

The two posts form a well-designed learning arc. Post 1 establishes the compose-measure-position-draw lifecycle for text as SVG `<text>` elements. Post 2 extends the same lifecycle to text as SVG path geometry. The boundary between them — estimation-based measurement vs exact font metrics, semantic text vs manipulable geometry — is clearly drawn and revisited from both sides. A reader who completes both posts will have a principled framework for choosing between the two approaches.

### Documentation Alignment

Both posts link generously to the documentation site and to other posts in the PathBlock series. The links are contextual (appearing where the reader would naturally want to go deeper) rather than decorative. The series TOC at the top of each post provides orientation. The `<mini-workspace>` demos are consistently placed after explanatory prose, maintaining the explain-then-demonstrate pattern throughout.

### Gap

Neither post includes an explicit "Prerequisites" section. A reader arriving from a search engine needs to understand that TextBlock builds on PathBlock concepts and that glyph extraction builds on both TextBlock and PathBlock boolean operations. A small prerequisites box at the top of each post — listing the posts or docs sections to read first — would significantly improve the onboarding experience for readers who enter the series mid-stream.

# Agentic Review: Principal UX Designer (Jordan Chen)

**Reviewer:** Jordan Chen, Principal UX Designer
**Date:** 2026-03-16
**Scope:** Independent assessment of two blog posts in the TextBlock & Font Integration series

---

## Post 1: TextBlock — Measure-First Text for SVG Diagrams

### Strengths

- **Strong information hierarchy through progressive disclosure.** The post follows a clear narrative arc — What is it? How do you draw it? How do you measure it? How do you style it? How do you place it smartly? How do you avoid collisions? — with each section building on the previous one. A reader can stop at any section and have a complete understanding up to that point. This is textbook progressive disclosure and it works well here.

- **The "before and after" comparison pattern is highly effective.** The magic-numbers-vs-semantic-anchors section is the strongest visual argument in the post. Showing fragile manual offsets on the left against clean `polarProject()` calls on the right communicates the value proposition instantly. The red/green annotation color coding (fragile = red, adaptive = green) leverages a universally understood visual vocabulary. This is exactly the kind of diagram that reduces explanatory text by making the idea visually obvious.

- **Code examples are well-calibrated for scan-readability.** The code blocks are short (5-12 lines), each one demonstrates exactly one concept, and the inline comments are terse but sufficient. The progressive pipeline example at the end (compose / style / measure / position / verify / draw) is an excellent summary artifact — it works as both a learning tool and a quick-reference card.

- **The series navigation and cross-linking are well-structured.** The boxed series TOC at the top, the "What's Next" teaser at the bottom, and the inline links to documentation sections create a clear wayfinding system. A reader always knows where they are in the series and where to go for deeper detail.

- **The TextBlock/PathBlock parallel is established early and reinforced consistently.** Calling out the `&{}` / `@{}` sigil parallel and the shared compose-then-place pattern in the opening section gives the reader a mental model to hang everything else on. This reduces cognitive load significantly for readers already familiar with PathBlock.

### Weaknesses

- **The collision avoidance section is too long and code-heavy relative to its visual payoff.** The 8-angle search algorithm is explained twice — once in prose and once in a 15-line code block — and then discussed for another two paragraphs. This is the densest section in the post and it risks losing non-technical readers. The algorithm description should lean harder on the diagram (the before/after scatter plot demo) and lighter on the implementation details. A brief "here's what the code does" with a pointer to documentation would suffice; the full loop with `ok = false` branching logic reads like API documentation rather than a blog post.

- **The font metrics section buries critical accuracy information.** The "85-90% accuracy" caveat for the estimation tables is mentioned almost in passing at the end of the Measuring section. This is a key design tradeoff that deserves more visual prominence — perhaps a callout box or a brief comparison table showing estimation vs exact metrics scenarios. A reader skimming the section could easily come away thinking the measurements are pixel-perfect, which would lead to frustration when they are not.

- **The mini-workspace demos are described but not visually scaffolded in the prose.** Each demo gets a one-paragraph setup and a `<mini-workspace>` tag, but there is no visual legend or annotation key that carries across demos. For example, the anatomy diagram uses "green crosshairs" and "dashed amber rectangles" and "arrows," but the style-merge demo uses "dashed outlines" without specifying color. The demos would feel more cohesive if a consistent visual language (crosshair color = origin, dashed outline color = bounding box, etc.) were established once and referenced throughout, rather than re-described with slightly different terminology each time.

- **The polar projection anchor grid is presented as a code block instead of a visual diagram.** The nine `BBoxAnchor` positions are listed as a 3x3 text grid in a monospace code fence. This is a missed opportunity — a visual diagram showing a labeled bounding box with the nine anchor points marked would communicate the spatial relationships far more effectively than text names in a grid. The existing compass demo partially fills this gap, but an explicit anchor-position diagram early in the section would reduce the cognitive load of mapping names to positions.

- **The "What Is a TextBlock?" section front-loads two code examples before the reader has any visual context.** The anatomy demo is the first visual artifact, but it appears after two code blocks and three paragraphs of explanation. Moving the anatomy demo higher — immediately after the first code example — would give readers a visual anchor before they encounter the coordinate model explanation and the control flow example. The current ordering asks the reader to build a mental picture from code alone, then validates it with a diagram; reversing this would be more effective.

### Overall Verdict

A well-structured, thorough introduction that communicates the TextBlock value proposition clearly through strong before/after comparisons and well-paced progressive disclosure. The main areas for improvement are visual consistency across demos, over-reliance on code in the collision avoidance section, and a missed opportunity to visualize the BBoxAnchor grid as a proper diagram rather than a text listing.

---

## Post 2: From Fonts to Paths — Glyph Extraction with PathBlock.fromGlyph()

### Strengths

- **The three-stage text cutout pipeline is brilliantly structured.** Breaking the boolean text cutout into Extract / Union / Punch stages with a left-to-right visual progression in the demo is exactly how complex pipelines should be communicated. Each stage is self-contained, the arrows between stages label the operations, and the code at the bottom ties it together. This section alone justifies the post — it takes a complex workflow and makes it feel achievable.

- **The contour decomposition section makes an abstract concept tangible.** Explaining contour count per character ("B has 3, i has 2, n has 1") and then showing the decomposition with per-contour coloring is an excellent teaching strategy. The color-coded separation makes the concept self-evident. The "when would you use this?" paragraph at the end gives practical grounding without over-explaining.

- **Per-character transform examples are well-chosen and well-differentiated.** Wave, scale cascade, and circular arc are three distinct effects that each demonstrate a different transformation pattern (y-offset, uniform scale, rotation + polar placement). The consistent advance-width accumulation loop running through all three reinforces the message that the layout structure is stable while the creative surface varies. The three-column layout in the demo supports direct visual comparison.

- **The metrics comparison section honestly addresses the estimation-vs-exact tradeoff.** Rather than overselling `fromGlyph()` as strictly superior to TextBlock, the post clearly articulates when each approach is appropriate: estimation for layout/collision avoidance, exact metrics for logo construction and pixel-level alignment. This honest positioning builds trust.

- **The opening paragraph establishes clear "you can't do this with `<text>`" motivation.** Listing specific blocked capabilities (sampling points along outlines, applying fillets, boolean difference) immediately tells the reader whether this post is relevant to their needs. This is good information scent — readers self-select efficiently.

### Weaknesses

- **The manual text layout section feels mechanical without enough visual motivation.** The advance-width accumulation loop is presented as a code block with brief explanation, but the reader hasn't yet seen *why* they'd want manual layout control (the creative transforms come later). Reordering so the per-character transforms section comes before or alongside the basic layout section would give the advance-width concept a motivating visual payoff immediately rather than asking the reader to trust that the payoff is coming.

- **The `@font` loading section lacks environment-specific visual cues.** The three loading approaches (CLI system fonts, CLI file paths, playground Google Fonts CDN) are described in a bullet list, but there is no visual differentiation or callout that helps the reader identify which path applies to them. A small table or icon-annotated list (terminal icon for CLI, browser icon for playground) would improve scanability and reduce the chance of a reader following the wrong path.

- **The Stage 2 union code example reuses the `let text` variable name with reassignment.** Two consecutive `let text = ...` lines is visually confusing and technically questionable — it looks like a copy-paste error even if the language permits shadowing. Renaming the second binding (e.g., `let textUnion = text.project(0, 0).union(...)`) would eliminate the double-take and make the pipeline stages more traceable in the code.

- **The post lacks a summary pipeline diagram equivalent to Post 1's "Putting It Together" section.** Post 1 ends with a clean 6-step pipeline in a single code block that serves as both summary and reference card. Post 2 has a "What's Next" section that summarizes both posts but doesn't distill the glyph extraction pipeline into a single, copy-paste-ready snippet. Adding a parallel "Putting It Together" section with the full `@font` / `fromGlyph()` / layout / transform / draw pipeline would give the post a stronger close and maintain consistency with the series structure.

- **The contour decomposition demo description mentions a "color key on the right" but the post doesn't establish what the color mapping convention is.** If the colors are arbitrary per-contour, saying so explicitly would set expectations correctly. If they follow a pattern (hue rotation, palette from a shared set), describing that pattern would help readers decode the visual. As written, the reader has to infer the color system from the rendered demo alone.

### Overall Verdict

A technically rich and well-organized post that effectively communicates glyph extraction as the natural extension of TextBlock. The three-stage cutout pipeline and contour decomposition sections are standout visual communication. The main structural gap is the lack of a summary pipeline equivalent to Post 1's closing section, and the advance-width section would benefit from earlier visual motivation.

---

*Review conducted under the Agentic Review Process defined in `website/guidelines/agentic-review.md`. This is the independent assessment phase (Step 1). Cross-critique (Step 2) and synthesis (Step 3) to follow.*

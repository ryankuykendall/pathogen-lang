# Verification Review: Principal UX Designer (Jordan Chen)

**Reviewer:** Jordan Chen, Principal UX Designer
**Date:** 2026-03-16
**Scope:** Verification of revised blog posts against original weaknesses from `06-agentic-review-uxd.md`

---

## Post 1 Verification: TextBlock — Measure-First Text for SVG Diagrams

- **[Collision avoidance section too long and code-heavy]**: PARTIALLY RESOLVED — The section has been trimmed meaningfully. The algorithm explanation no longer doubles up with a full prose restatement alongside the code. The inline comment `// (dot-position checks omitted — see full sample)` is a good editorial choice that reduces code weight. However, the section still contains two code blocks (the simple single-direction check and the 8-angle search) plus four paragraphs of surrounding prose. It remains the densest section in the post. The suggestion to lean harder on the demo and lighter on implementation was partially taken — the demo callout now explicitly labels the before/after panels and directs readers to study the demo source — but the `ok = false` branching logic is still present in the code block. A "see documentation for the full loop" pointer would have gone further.

- **[Font metrics 85-90% accuracy buried]**: RESOLVED — The accuracy caveat is now presented as a blockquote callout (the `>` prefix block starting with "**Accuracy: 85-90% for Latin text.**"). This is a significant improvement in visual prominence. The callout includes a concrete example ("A label that measures 87px might actually render at 100px"), states what the estimation is and is not sufficient for, and links directly to Part 2 for exact metrics. A reader skimming the section will not miss this.

- **[Mini-workspace demos lack consistent visual language across demos]**: PARTIALLY RESOLVED — The anatomy demo paragraph now explicitly describes the visual vocabulary: "green crosshairs mark each placement's origin," "dashed amber rectangles show the bounding box." The style-merge demo description now says "dashed outlines are the bounding boxes" and notes that "dimension annotations at the bottom of each variant confirm what the code reports." This is better than the original, which used inconsistent terminology. However, the suggestion to establish a single visual legend once and reference it throughout was not adopted — each demo still re-describes its visual conventions independently. The terminology is more consistent now (amber/dashed for bounding boxes appears in both anatomy and compass sections), but a single "Visual Key" sidebar at the top of the post would have been the cleanest solution.

- **[BBoxAnchor grid presented as code block instead of visual diagram]**: NOT RESOLVED — The nine `BBoxAnchor` positions are still presented as a 3x3 monospace text grid in a code fence. No visual diagram of a labeled bounding box with anchor points marked has been added. The compass demo still serves as the primary visual for understanding anchor positions, which partially compensates, but the original suggestion for an explicit anchor-position diagram early in the section was not implemented.

- **[Two code examples before first visual context in "What Is a TextBlock?" section]**: RESOLVED — The anatomy demo now appears immediately after the first code block, with a descriptive paragraph bridging the two. The second code example (the `for` loop with control flow) comes after the anatomy demo, meaning the reader sees a visual artifact before encountering the more complex code. The ordering change is exactly what was suggested: show the visual anchor before asking readers to build mental models from code.

**Post 1 summary:** 2 resolved, 2 partially resolved, 1 not resolved. The two most impactful changes — promoting the accuracy callout and reordering the anatomy demo — were both made. The visual consistency improvements are incremental rather than structural.

---

## Post 2 Verification: From Fonts to Paths — Glyph Extraction with PathBlock.fromGlyph()

- **[Manual text layout section lacks visual motivation before advance-width code]**: PARTIALLY RESOLVED — The advance-width section still comes before the per-character transforms section, so the structural reordering was not done. However, the section now opens with a clearer motivation paragraph ("Drawing glyph PathBlocks is straightforward, but you need to position them correctly") and the demo at the end of the section includes visual annotations (yellow baseline, dashed tick marks, proportional vs monospace comparison) that give the layout concept immediate visual payoff within its own section. The suggestion to move creative transforms before or alongside the basic layout was not taken, but the section is now better self-contained with its own visual reward.

- **[@font loading section lacks environment-specific visual cues]**: PARTIALLY RESOLVED — The three loading approaches have been reorganized. CLI and Playground are now presented as two clearly separated bullet points rather than three. There is also a blockquote callout ("**CLI vs Playground:**") that summarizes the distinction. This is better scanability than the original bullet list. However, the suggestion for icon-annotated differentiation (terminal icon for CLI, browser icon for playground) was not implemented — the distinction is purely textual. The blockquote helps, but a reader quickly scanning for "which path applies to me" still has to read prose rather than visually self-selecting.

- **[Stage 2 union code reuses `let text` variable name]**: RESOLVED — The revised code in the text cutout section uses `combined` as the variable name for the union result, and each stage uses distinct variable names (`glyphs`, `combined`, `plate`, `cutout`). The pipeline stages are now traceable through the variable names without any shadowing confusion.

- **[Post lacks summary pipeline diagram equivalent to Post 1's "Putting It Together"]**: RESOLVED — A "Putting It Together" section has been added at the end of the post, before "What's Next." It contains a clean three-step pipeline (`@font` declaration, `fromGlyph()` extraction, advance-width layout loop) in a single code block with numbered comments matching Post 1's structure. This gives the post a strong close and maintains series consistency. The closing paragraph ("That's three steps...") distills the message cleanly.

- **[Contour decomposition demo color key description is ambiguous]**: RESOLVED — The demo description now explicitly states the color system: "Each contour is colored from a 12-color palette cycling through blue, green, amber, red, purple, pink, cyan, lime, orange, indigo, teal, and fuchsia." The palette is enumerated in the prose, and the code example above the demo shows `colors` and `fills` arrays with explicit hex values. A reader can now decode the visual without inference.

**Post 2 summary:** 3 resolved, 2 partially resolved, 0 not resolved. The two most structurally important additions — the summary pipeline section and the contour color key — were both made. The @font environment guidance and advance-width motivation improvements are incremental.

---

## Remaining Concerns

1. **Post 1, collision avoidance: the "see full sample" directive may be too subtle.** The inline comment `// (dot-position checks omitted — see full sample)` appears inside a code block, which means it's easy to miss when scanning prose. A sentence after the code block saying "The full sample in the demo below includes data-point overlap checks — open the source to see the complete loop" would be more discoverable.

2. **Post 2, text cutout section introduces two approaches (boolean and visual approximation) that could confuse readers about which to use.** The "Visual Approximation" subsection explains a simpler technique that produces the same appearance but different geometry. The post correctly notes that the boolean approach is "production-quality" while the overlay is a "practical shortcut," but the demo actually shows the visual approximation, not the boolean result. A reader following the code examples might expect the demo to match the boolean pipeline code above it. A brief note like "The demo uses the visual overlay approach for clarity — the boolean pipeline produces identical visual output but as a single queryable PathBlock" would prevent confusion.

3. **Post 2, circular arc text code block lacks a setup context.** The `arc_cursor`, `arc_start`, `arc_r`, `arc_cx`, `arc_cy` variables appear without definition, unlike the wave and scale examples where the setup is self-evident. Adding a one-line comment like `// arc_r = radius, arc_cx/cy = center, arc_start = starting angle` would help readers who try to adapt the snippet.

4. **Both posts: the `<mini-workspace>` tags have no `code-open` attribute.** Based on the blog authoring guidelines, `code-open` controls whether the code panel starts expanded. Neither post uses it, which means the default behavior (collapsed) applies uniformly. For the anatomy demo in Post 1 and the glyph-layout demo in Post 2 — both of which are the first interactive demos the reader encounters — starting with code visible would reinforce the "code produces this visual" connection. Consider adding `code-open` to the first demo in each post.

---

*Verification conducted under the Agentic Review Process defined in `website/guidelines/agentic-review.md`. This is the verification phase following revision.*

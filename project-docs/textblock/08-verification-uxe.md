# Verification Review: UX Engineer (Maya Patel)

**Reviewer:** Maya Patel, Principal UX Engineer / Design Technologist
**Date:** 2026-03-16
**Scope:** Verification of edits to Blog posts #11 (TextBlock Introduction) and #12 (Glyph Extraction) against original review findings from `06-agentic-review-uxe.md`

---

## Post 1 Verification: TextBlock: Measure-First Text for SVG Diagrams

- **[`<<` operator explanation arrives late]**: RESOLVED — The section order has been restructured. "Style Merge with <<" now appears *before* "Measuring Before You Place." The first code example in the post (`let label = &{ ... };`) is unstyled, and `<<` is not used until after it has been formally introduced. The measurement section then opens with "Using the `<<` operator introduced above," making the dependency explicit. This is exactly the fix I recommended.

- **[`.boundingBox()` return value semantics on TextBlockValue vs ProjectedTextValue not demonstrated]**: NOT RESOLVED — The post still contains the same prose description: "On a TextBlockValue, the bbox is relative to the origin... On a ProjectedTextValue, the bbox reflects the absolute position." There is still no side-by-side code example comparing `label.boundingBox()` returning `{x: 0, y: ...}` vs `label.project(100, 100).boundingBox()` returning `{x: 100, y: ...}`. The distinction remains conceptual rather than concrete.

- **[Collision avoidance code snippet does not match actual sample source]**: RESOLVED — The blog snippet now includes the comment `// (dot-position checks omitted -- see full sample)` in both the single-direction example and the 8-angle search example. The prose also explicitly says "Study the demo source to see how the complete loop integrates with the data point geometry checks." This clearly signals that the blog snippet is simplified and directs the reader to the actual sample for the full logic.

- **[No performance discussion for collision avoidance]**: RESOLVED — The post now includes an explicit paragraph after the demo: "This is a greedy algorithm -- it doesn't guarantee a globally optimal layout, but it's fast and produces good results for the cluster sizes typical in diagrams. The search is O(N^2) in the number of labels -- fast for typical diagrams with 2-20 labels, but worth noting at larger scales." It also suggests customization strategies (more angles, adjusted distance, `.translate()` fallback). This is a clear and honest performance caveat.

- **[Coordinate model explanation could benefit from a visual]**: NOT RESOLVED — The post still explains the baseline model in prose only: "y is the baseline position, so text(0, 14) places the first baseline 14 units below the origin. This means the text's visible pixels extend above that y coordinate, not below it." There is no inline diagram showing baseline, ascent, and descent. However, the TextBlock anatomy mini-workspace demo immediately following this paragraph does show crosshairs at the origin and bounding boxes, which partially serves this purpose. This is a minor issue and the demo does mitigate it.

---

## Post 2 Verification: From Fonts to Paths: Glyph Extraction with PathBlock.fromGlyph()

- **[Text cutout demo does not actually use `.union()` and `.difference()` operations]**: PARTIALLY RESOLVED — The blog has been significantly restructured. The section now splits into two clearly labeled subsections: "The Production Approach: Boolean Operations" (which shows the `.union()` and `.difference()` code with proper syntax) and "Visual Approximation" (which introduces the demo with the sentence: "The demo below shows the visual result using a simpler technique: drawing glyph paths in the background color on top of a colored plate"). The prose no longer claims the demo exercises boolean operations. However, the actual `text-cutout.pathogen` sample file still has arrow labels reading `.union()` and `.difference()` between the three stages (lines 213 and 235), and the Stage 2 label still says "single united path" (line 125). These labels in the visual output imply boolean operations are being performed when they are not. The blog prose is now honest, but the demo's own annotations still mislead. A reader examining just the rendered demo (without reading the blog text) would reasonably believe `.union()` and `.difference()` are being called.

- **[`@font` directive's environment-dependent behavior not demonstrated in mini-workspace context]**: PARTIALLY RESOLVED — The blog now includes a callout box: "CLI vs Playground: In the CLI, @font loads from local file paths or system font directories. In the Playground, fonts are fetched automatically from Google Fonts by family name." This clarifies the two environments. However, the sample files still use relative paths like `"../../../../fonts/Bebas_Neue/BebasNeue-Regular.ttf"`, and the post does not explain how these samples would behave in the playground (where a family name rather than a file path is needed). For blog samples that are compiled ahead of time via CLI and displayed as pre-rendered SVGs in mini-workspaces, this may be moot -- but a reader who copies the sample code into the playground will need to change the `@font` declaration.

- **[`fromGlyph()` returns an array even for single characters -- unusual API choice not explained]**: RESOLVED — The post now includes the sentence: "fromGlyph() always returns an array -- one PathBlock per character -- even for single characters. That's why we index with glyphs[0] above." This directly acknowledges the design choice and explains the indexing pattern. It does not explain *why* the API was designed this way (consistency with multi-character calls), but the acknowledgment is sufficient to prevent confusion.

- **[Circular arc code uses `0.5pi` shorthand that differs from actual sample]**: PARTIALLY RESOLVED — The blog code now uses `calc(angle + 0.5pi)` while the actual `per-char-transforms.pathogen` sample uses `calc(angle + 0.5 * 3.14159265358979)`. I verified that `0.5pi` is valid Pathogen syntax -- the parser supports a `pi` unit suffix on numeric literals (see `src/parser/ast.ts` line 206 and `docs/syntax.md` line 677). So the blog's syntax is correct. However, the mismatch between blog and sample still exists. A reader opening the sample source will see a different (more verbose) expression than the blog shows. This is a minor readability issue, not a correctness issue. The better fix would be to update the sample to use `0.5pi` since it is valid and more readable.

- **[No performance discussion for glyph extraction at scale]**: NOT RESOLVED — The post still does not discuss performance characteristics of `fromGlyph()` for longer strings. The "Paths vs Text" section notes that "Converting text to paths produces more SVG data than `<text>` elements -- a single glyph may contain 20+ Bezier segments. For short words and display text this is negligible; for paragraph-length content, prefer TextBlock." This addresses SVG output size but not compile-time cost. A sentence noting that glyph extraction is a compile-time operation (not frame-rate sensitive) and that extracted glyphs are stored in variables (naturally cached across uses) would address this.

---

## Remaining Concerns

### 1. Text cutout demo annotations still mislead (Post 2)

The most significant remaining issue. The `text-cutout.pathogen` sample file draws arrows labeled `.union()` (line 213) and `.difference()` (line 235) between stages, and Stage 2 is labeled "single united path" (line 125). The blog prose now correctly distinguishes between the "production approach" (boolean operations) and the "visual approximation" (what the demo actually does), but the demo's own rendered annotations still claim boolean operations are happening. A reader looking at just the rendered SVG in the mini-workspace will see `.union()` and `.difference()` labels and reasonably conclude those operations are being called. The fix is either:
- Update the demo annotations to say something like "visual union" and "visual difference" or "overlay technique"
- Or rewrite the demo to actually use `.union()` and `.difference()` (which would be the strongest fix, making the demo match the production code path)

### 2. Blog code in "The Production Approach" subsection is plausible but untested (Post 2)

The "production approach" code snippets showing `.union()` and `.difference()` chaining (lines 259-267 of the blog) are presented as working code but do not correspond to any sample file. The syntax looks plausible:

```pathogen
let combined = glyphs[0].project(x0, y).union(glyphs[1].project(x1, y));
combined = combined.project(0, 0).union(glyphs[2].project(x2, y));
let cutout = plate.project(px, py).difference(combined.project(tx, ty));
```

However, the `combined.project(0, 0)` call between union operations is worth scrutinizing. After `.union()`, the result is already a PathBlock with absolute coordinates baked in (since the inputs were projected). Re-projecting to `(0, 0)` and then unioning with another projected glyph could produce unexpected coordinate behavior depending on how `.project()` interacts with already-absolute geometry. Without a running sample to verify, this code path is an untested claim in the blog. If the boolean operations work as described elsewhere in the PathBlock documentation, this is likely fine -- but it would be stronger to have a verified sample.

### 3. Mini-workspace caption still references "union, then difference" (Post 2)

Line 276 of the blog: `<mini-workspace src="samples/post12/text-cutout.pathogen" caption="Text cutout pipeline -- glyph outlines, union, then difference from a rectangle">`. The caption describes the boolean pipeline, but the demo shows the visual approximation. The caption should match what the demo actually demonstrates.

### 4. "Paths vs Text" section is well-written but could be more specific about when to use which (Post 2)

This is not a deficiency in the edits -- the section is good. But it closes with "when you need pixel-level precision ... fromGlyph() eliminates the measurement-rendering mismatch entirely" without noting the tradeoff: `fromGlyph()` paths are not accessible as text (screen readers cannot read them), not searchable, and not selectable. A sentence acknowledging this would make the comparison complete. This is a new observation, not from the original review.

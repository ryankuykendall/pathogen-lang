# Code Example Guidelines

Standards for code examples embedded in blog posts, documentation, and tutorials.

---

## 1. Rich Labeling and Text

- All key elements in a code example should be labeled where appropriate.
- Use descriptive text annotations to explain what the example demonstrates.
- Labels should be concise, readable, and positioned to avoid obstructing the geometry they describe.

---

## 2. Schematic Overlays

- Rendered SVGs should include relevant and rich schematic overlays that explain functionality and clarify intent.
- Schematic drawing and labeling is challenging — maintain precise, thoughtful composition to ensure overlays do not obfuscate (or get obfuscated by) the geometry, drawing, or imagery they annotate.
- Use geometry and text bounding boxes to assess and avoid collisions and obfuscation.
- See the full review checklist and anti-patterns list: [schematic-and-diagram-checklist-plus-antipatterns.md](./schematic-and-diagram-checklist-plus-antipatterns.md)

---

## 3. Interactive Code Examples

- Be liberal in identifying and adding interactive code examples (mini-workspaces).
- Interactive examples get users up to speed with the Pathogen language faster than static code blocks.
- Prefer `<mini-workspace>` embeds over static screenshots whenever the example benefits from live editing.

---

## 4. Visual Quality and Brand

- Code examples should be visually rich, elegantly crafted, beautiful, and sophisticated.
- Examples elevate the brand, identity, and perceived value of the Pathogen language.
- Avoid generic, minimal, or throwaway examples — every example is an opportunity to showcase capability and craft.

---

## 5. Toolchain Usage

- Use the existing toolchain for generating `.bbwp.html` and `.mw.html` files.
- Compile samples via the `/bbwp` skill or `npm run compile:bbwp`.
- Blog samples go through the mini-workspace pipeline (see `website/blog/CLAUDE.md` for details).

---

## 6. Code Snippet Formatting

- When including Pathogen Language code snippets in generated SVG files, pre-pad lines to preserve indentation for readability.
- Indentation is critical for conveying code structure — never flatten or strip leading whitespace from code rendered as SVG text.

---

## 7. Margins and Spacing

- Ensure samples have sufficient margins around their boundaries.
- Text blocks must not encroach on margins.
- Verify at the intended viewing scale that all content has breathing room.

---

## 8. Avoid Hard-Coding

- Avoid hard-coding or approximating values when a suitable Pathogen language method or coding convention provides the correct information and geometry.
- These examples guide users toward idiomatic usage — always bias toward approaches that improve their understanding and efficacy with the language.

---

## 9. GroupLayer-Based Diagrams

- Build diagrams from GroupLayers that represent logical components.
- Position components using transforms (`translate`, `scale`, `rotate`).
- Avoid constructing diagrams entirely in absolute canvas coordinates — use the composability that GroupLayer provides.

---

## 10. Label-to-Geometry Association

Every annotation label in a schematic must have a clear, unambiguous association with the geometric element it describes. A reader should never have to guess which geometry a label refers to.

### Rules

1. **Leader lines required for non-adjacent labels.** If a label cannot be placed immediately adjacent to its geometry (within ~5 units), draw a thin leader line connecting the label to the exact point, edge, or arc it annotates. No floating labels.

2. **Proximity first, leaders second.** Place labels as close as possible to their geometry without overlapping other content. Use leader lines only when proximity alone is insufficient due to crowding.

3. **Consistent offset direction.** Labels for radius measurements should sit along or parallel to the radius line they measure. Angle labels should sit near the arc endpoint they reference. Avoid placing labels perpendicular to the association direction.

4. **Clear anchor points.** Each label type has a natural anchor:
   - **Point labels** (e.g., "center"): immediately adjacent to the point, offset in a direction that avoids other geometry.
   - **Radius/distance labels** (e.g., "innerR", "outerR"): along the measurement line, between the two endpoints that define the span. Use dimension-style dots or ticks at both ends of the span.
   - **Angle labels** (e.g., "fromAngle", "toAngle"): near the arc endpoint they reference, with a leader to the arc tip if not immediately adjacent.
   - **Function/code labels**: positioned in clear space with no geometric association needed — they describe the code, not the shape.

5. **No ambiguous labels.** If you cover up the label text and look at only the leader line and anchor point, you should be able to tell exactly which geometric element the label describes.

6. **Avoid label clustering.** If multiple labels would crowd the same area, spread them outward along leader lines rather than stacking them. Each label should have clear breathing room from its neighbors.

---

## 11. Schematic Review

- Before publishing, review all diagrams and schematics against the checklist and anti-patterns list.
- See: [schematic-and-diagram-checklist-plus-antipatterns.md](./schematic-and-diagram-checklist-plus-antipatterns.md)

---

## 12. Design System

- For the token-level design system (colors, typography, spacing, labeling patterns) that governs every example, see [example-design-system.md](./example-design-system.md).
- That doc defines core tokens (MUST) and extended tokens (MAY), the canvas-width convention, and the hex-literal `CSSVar` default rule required for mini-workspace picker auto-detection.

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

## 10. Schematic Review

- Before publishing, review all diagrams and schematics against the checklist and anti-patterns list.
- See: [schematic-and-diagram-checklist-plus-antipatterns.md](./schematic-and-diagram-checklist-plus-antipatterns.md)

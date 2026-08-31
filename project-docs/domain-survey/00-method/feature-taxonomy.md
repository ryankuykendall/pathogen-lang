# Feature Taxonomy

Every gap named in a profile is tagged `[D]` or `[G]`. Stage 4 synthesizes the
`[D]` entries into a cross-domain matrix (which feature unlocks which domains)
and consolidates the `[G]` entries into a general-language requirements doc.

## [G] General language requirements

Seeded from the user's list, plus gaps the Stage 1 exploration confirmed are
*unrepresented anywhere in the repo* (not deferred — never proposed):

| Requirement | Notes |
|-------------|-------|
| Modules & libraries | No `import`/`include` exists; every domain's value is a reusable library (joints, blocks, gears, motifs) |
| Testing | No way to assert on geometry; curriculum/marketplace sellers need regression safety |
| Data import | No CSV/JSON/file-read primitive; only compile-time network is `@font` Google Fonts fetch |
| HTTP / API client | Absent; output sanitizer deliberately bans remote URLs (docs/security.md) — import side is a separate design |
| CLI support | Exists but thin (single-file compile); missing batch, `--param k=v`, watch, multi-variant export |
| **Physical units** | Language is unitless user-space; units exist only in the PDF export dialog. Recurs in nearly every physical-output domain |
| **Machine-format export** | DXF (laser/CNC), HPGL/G-code (plotters), machine-safe SVG profiles (Cricut 72-dpi, no-stroke conventions) |
| **Robust `offset()`** | Item A fixed miter spikes; curvature-aware curve/text offsetting remains the single most cross-domain blocker |
| Sheet nesting / packing | Fitting pieces onto a material sheet; wanted by laser, die-cutting, quilting, garment |
| Number/string formatting | Dimension labels need `12.70 mm` not `12.699999…` |
| **Multi-view export** | One drawing → many outputs (PDF pages, PNG/SVG/DXF sets, tiled pages, per-layer masters). Subsumes every profile's "multi-page PDF" ask — see `../04-synthesis/multi-view-export-concept.md` |
| Parameter UI (sliders) | Playground-side: live parameter tweaking sells the parametric story (STEM demos, product configurators) |

## [D] Domain-specific opportunities

Recorded per profile; consolidated into `04-synthesis/feature-matrix.md` at
Stage 4. Examples from the sample five: kerf compensation, finger-joint/living-
hinge primitives, FPP section numbering from the seam graph, fill-to-hatch,
path-order optimization, involute gear primitive, dimension lines.

## Tagging rules

- A feature wanted by **3+ domains** graduates from `[D]` to `[G]` candidate at
  synthesis time (that's the wedge analysis).
- Cite the Cutting Room ledger item when a gap is already tracked there
  (e.g. Item L `ctx` block argument).
- Per `../../cutting-room/opportunities/README.md`: every new method needs an
  annotated counterpart or an explicit entry in the annotated.ts unsupported
  list — feature-cost estimates must include that.

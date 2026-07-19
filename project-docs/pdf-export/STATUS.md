# Print-Ready PDF Export — Status

**Date:** 2026-07-18 · **Status:** Implemented, verified end-to-end, agentic reviews applied, pending commit

## Review outcomes (both agentic reviews run + findings applied)

**Code review** (no critical; warnings fixed in-session):
- Font-load failure now ABORTS the PDF export (was: silently shipped live text,
  voiding the zero-font-dependency guarantee) — `_downloadPdf` throws if any
  `<text>` survives outlining.
- Mid-download reopen race fixed: background/canvas dims snapshotted into
  locals before the first await.
- `@vite-ignore` variable-specifier applied to the pdf-export vendor import.
- Also: hex background normalized (#rgb/#rrggbbaa → #rrggbb) before
  `setFillColor`; margin input ignores invalid values (matches size fields);
  `.export-status.error` red variant for thrown errors vs amber notices;
  italic text now warns (outlined upright); canvas-context null gets a clear error.
- **Deferred** (follow-ups): unit tests for modal-internal logic (aspect-lock
  math, `_layoutInput`, `_safeName`); italic font-variant fetching; deriving
  bleed from the preset's native unit in preset mode.

**Content review** (blocker + should-fixes applied):
- All post assets unified on Orbital Study (screenshots re-shot from a real
  "Orbital Study" workspace; no internal test names); prose numbers now
  reproduce from the hero sample (24 in wide → 24×30 artwork, 25×31 page).
- Sample title converted to `PathBlock.fromGlyph` Baumans outlines — renders
  identically in the mini-workspace iframe (CSP blocks external fonts there)
  and demonstrates the post's outlining thesis. Required adding **Baumans to
  `playground/utils/google-fonts.ts`** so `@font "Baumans";` resolves in the
  playground (committed sample keeps the CLI path form per post27 precedent).
- Non-selectable-text trade-off stated in "What stays vector"; corner-detail
  image (`pdf-export-cropmarks.png`) added showing bleed + crop-mark anatomy.

**Final state:** full suite 90 files / 3725 tests green; E2E harness 23/23.

## Post-release fixes (user-reported, 2026-07-18 evening)

Ryan's first real export ("More awesome pattern", oklch-palette spiral) surfaced
two bugs the synthetic fixtures missed:

1. **All artwork rendered black in the PDF.** svg2pdf.js cannot parse
   `oklch()`/`lab()`/`color()` paints — unparseable colors fall back to black,
   and Pathogen is oklch-first (palettes, HDR picker, CSS vars). Fix: new
   `playground/utils/svg-pdf-colors.ts` (`normalizeSvgPaintColors`) rewrites
   every fill/stroke/stop-color/color to sRGB hex before svg2pdf, folding color
   alpha into *-opacity. **Gotcha:** the classic canvas `fillStyle` read-back
   trick no longer converts — modern Chrome preserves the CSS Color 4
   serialization in the getter — so the resolver paints a 1×1 pixel and reads
   sRGB bytes back via `getImageData`. E2E scenario F (oklch workspace →
   chromatic rg/RG operators in the decoded stream) guards the regression.
2. **Vector PDFs of dense generative artwork are unviewable.** Ryan's spiral
   exported to a valid PDF with 463k vector operators — Quick Look needed
   **114s of CPU for a 400px thumbnail**; Preview showed blank. Fix: new
   **Artwork: Vector / Raster** toggle in the PDF settings (raster = the
   existing 300 DPI `_rasterizeArtwork` path; legend + text outlines stay
   vector). `open()` auto-defaults to Raster when artwork exceeds complexity
   thresholds (total path-d length > 1.5M chars or > 20k geometry nodes).
   Masks/filters still force raster. E2E scenario A2 covers the manual toggle.
   NOTE: `.artwork-toggle` reuses `.orient-toggle` styling — orientation
   selectors are scoped `:not(.artwork-toggle)`.
   **Follow-up crash (user console):** the first raster implementation put the
   image into the SVG as a data URL — svg2pdf's `fetchImageData` runs
   `String.match` over the whole data-URL string and overflows the call stack
   at print resolution (`RangeError: Maximum call stack size exceeded`). Fix:
   the raster NEVER passes through svg2pdf — `_rasterizeArtwork` returns raw
   **JPEG bytes** (flattened onto the page background at q0.95; jsPDF's
   RGBA-PNG path splits channels in JS, prohibitive at 55MP) embedded via
   `doc.addImage(bytes, 'JPEG', …)`, and svg2pdf draws only the legend-only
   clone on top. E2E scenario G (8200×10000 canvas → 8192px raster) guards it.
3. **Size fields overflowed the form panel.** Per Ryan's direction: width and
   height stacked on their own lines with `w`/`h` prefixes inside the inputs
   (mirroring the unit suffixes) and the aspect-lock spanning both rows via a
   two-column grid (`.size-grid`).
4. **Advanced Export Settings vanished when PDF was selected.** Not a
   stacking/visibility bug: `.advanced-settings` has `overflow: hidden`, which
   strips the automatic flex minimum size, so once the PDF settings made the
   flex-column form panel overflow, flexbox crushed the details to its 2px of
   borders. Fix: `.form-panel > * { flex-shrink: 0 }` (the panel scrolls
   instead) + the details block moved above the Format selector.

Extends "Export with Legend" with a print-ready PDF format for third-party
poster printing, plus the legend footer rebrand to "Created in pathogen.studio".

## Decisions (user-confirmed)

- **Font fidelity via text outlining** (opentype.js) — chosen over embedding
  TTFs in the PDF. The produced PDF has no font programs and no text operators.
- **Sizing modes**: Match artwork (exact print size, ratio locked to ViewBox,
  page = artwork + margins), US + ISO presets, custom 1–100 in with toggleable
  aspect lock. From mockup-v2 review: one **Units** select on its own row,
  unit suffixes on width/height/margin inputs, no per-field unit pickers.
- **Print prep**: margins + bleed (0.125 in / 3 mm) + corner crop marks.
- **Library**: jsPDF + svg2pdf.js (lazy vendor bundle); masks/filters artwork
  falls back to a ≥300 DPI raster (legend stays vector).

## Artifacts

- Mockups (reviewed & approved): `website/bbwp/2026-07-18-*--pdf-export--*.bbwp.html`
  (modal v1, footer, modal v2 with aspect-ratio sizing)
- Implementation: `playground/utils/pdf-page-layout.ts`,
  `playground/utils/svg-text-outliner.ts`, `playground/components/export-legend-modal.ts(.css)`,
  `scripts/vendor-entries/pdf-export.ts`, `scripts/build-vendor.ts`
- Docs: `docs/exporting.md` (registered in DOC_FILES)
- Blog: `website/blog/print-ready-pdf-export.md` + `samples/post29/orbital-study.pathogen`
- Tests: `tests/pdf-page-layout.test.ts` (23), `tests/svg-text-outliner.test.ts` (12)
- E2E harness: `verify-pdf-export.ts` (this dir) — 21/21 checks; outputs in `verify/`
  (PDFs, Quick Look renders, modal screenshots light+dark, blog screenshots)

## Bugs caught by the E2E harness

1. jsPDF `format:[w,h]` is normalized by `orientation` (default portrait puts
   the smaller side first) — wide pages were flipped. Fixed by passing the real
   orientation to the constructor.
2. jsPDF always *declares* the standard-14 fonts in Resources; the correct
   no-font assertion is "no `/FontFile` + no `BT` operators", not "no `/Font`".

## Gotchas for future sessions

- Rebuilding the playground while dev servers run **must** use
  `PATHOGEN_API_BASE=http://localhost:8787` or the SPA silently points at prod.
- `public/` is git-tracked → always rebuild with a plain `npm run build:website`
  (prod API base) before committing `public/`.
- `.wrangler/state` was incompatible with the current wrangler runtime
  (workerd `_cf_ALARM` sqlite error); verification ran against fresh persist
  dirs `.wrangler/state-pdf-verify` (safe to delete).
- tsx + puppeteer: use string-form `page.evaluate` (esbuild `__name` helper
  leaks into serialized functions).
- Known limitation: bleed size keys off the selected *unit* (in → 0.125 in,
  cm → 3 mm), not the preset's native unit.
- Non-latin artwork text may miss glyphs (font-loader fetches the Google Fonts
  latin subset) — documented in docs/exporting.md.

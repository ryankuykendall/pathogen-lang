# Print-Ready PDF Export — Status

## 2026-09-05 — Field report: vector mode + rasterized gradient ⇒ stack overflow

**Ryan:** vector-mode PDF export of a larger project fails with `Maximum call
stack size exceeded`, with or without Precision. Reproduced with
`verify/huge-vector-repro.ts` (drives the modal like the harness but calls
`_downloadPdf` directly so the stack comes back): a 1.4 MB single path and a
4,000-layer scene both export fine (410 KB / 146 KB PDFs, decimation on or
off); a 4000×4000 `ConicGradient` fill — a 41 MB `data:image/png` `<image>`
inside the gradient's `<pattern>` — throws from `String.match` inside svg2pdf's
`ImageNode.fetchImageData`. Its `dataUriRegex` ends in `((?:.|\s)*)$`: an
alternation inside a repetition costs V8 one backtrack frame per character.
Fix: `scripts/lib/vendor-patches.ts` rewrites the group to `([\s\S]*)` when
`build-vendor.ts` bundles `pdf-export.js` (asserts exactly one application, so
an svg2pdf upgrade cannot silently drop it); `tests/vendor-patches.test.ts`
pins equivalence and a 40 MB payload. Follow-ups: jsPDF then decodes the
PNG in-page (a 41 MB image is slow — a size-aware notice or automatic JPEG
re-encode of gradient rasters before svg2pdf would help); an automatic
raster fallback when the vector pass throws would stop any future svg2pdf
failure from producing no file at all.

## 2026-08-19 (later) — Field report: minute-long UI lockup + invisible progress

**Ryan's console (4× PNG, M2 Max):** `full-size draw failed verification at
8800×8800 (uniform)` — the big single draw is a **silent no-op** (context
alive, `isContextLost()` false, buffer untouched), plus Chrome's "Multiple
readback operations … willReadFrequently" warning pointing at the banded
scan. Two shipped defects diagnosed and fixed:

1. **Banded getImageData on a large GPU canvas is catastrophic** — ~19
   readbacks of a 77 MP accelerated surface, each forcing a full pipeline
   sync ⇒ the ~1 min main-thread lockup. Fix: `_probeVerifyCanvas` — large
   (> `VERIFY_SCAN_MAX_PX` = 4.19 MP) GPU canvases are verified by one
   GPU-side downscale into a ≤1024px probe + a single small readback
   (milliseconds). The precise sample-grid + banded scan survives for small
   canvases and for the CPU-backed tiled destination (`cpuBacked` hint —
   direct scans are cheap there, and probing would force a CPU→GPU upload).
   A sub-pixel-thin-ink false 'uniform' from the probe is safe by
   construction: it only causes retries, and the uniform fallback that
   ships is the real encoded canvas, so missed ink is still in the output.
2. **`setTimeout(0)` yields don't paint** — the macrotask usually fires
   before the next frame, so every progress message was written and then
   buried under synchronous canvas work ⇒ "no progress indicator appeared".
   Fix: `_afterPaint()` (requestAnimationFrame → setTimeout) used between
   attempts and per tile.

Also from the field data: single draws no-op somewhere between 19 MP
(4400² worked) and 39 MP (6223² blank) ⇒ new
`RASTER_SINGLE_DRAW_MAX_PX = 32 MP`. Above it the full-size single attempt
is skipped entirely (straight to tiles), and ladder rungs above it use the
tiled path too — no more slow guaranteed-failure attempts. Harness still
62/62 (10d's full-res-via-tiles assertion now exercises the tile-first
branch; 10e/10g ladder assertions unchanged).

## 2026-08-19 — Raster progress UI, CPU-backed tiled destination, honest notices

**Real-GPU field result (Ryan, M2 Max):** the 4× PNG (8800²) landed at
4400² — single draw failed, the tiled full-res attempt ALSO failed, ladder
step 6223 failed, 4400 succeeded. Tiling failing on capable hardware
pinpoints the *destination* canvas: an 8800² accelerated canvas is a
~310 MB single GPU allocation, and Chrome's per-context budgets don't
scale with the machine (Apple-Silicon unified memory is irrelevant to
them). "Close other tabs" was therefore mostly false on such hardware.

Follow-ups shipped (user-selected 1–3; the 8×/16×/32× streaming
mega-export was explored and deliberately parked as a future project —
feasible via tile → row-band → streaming-PNG-encode → File System Access
writes, but a separate effort):

1. **Live progress in the modal status line** — `_rasterizeSvg` takes
   `label`/`onProgress`; messages per attempt ("Rendering the artwork at
   8,800 × 8,800 px…", "Browser limit hit — rendering in tiles…",
   "Rendering the PNG in tiles — 12/16…", "Retrying at a reduced …") with
   event-loop yields (incl. per tile) so they actually paint. PDF end-state
   sets `notices.join(' ')` unconditionally and PNG clears on full-res
   success, so progress text never lingers.
2. **CPU-backed tiled destination** — the tiled attempt's destination
   context is created `{ willReadFrequently: true }`: the big surface lives
   in system RAM (where an M2 Max's headroom actually helps) while the
   filter-heavy SVG still rasterizes GPU-accelerated on the 2048² scratch.
   Directly targets the observed failure; expected to recover full-res
   tiled output on real hardware. `_attemptTiledRasterDraw` is now async
   (per-tile yield + progress callback).
3. **Honest notices** — "Your browser limits how much it can rasterize at
   once — … A smaller print/export size or fewer filtered layers may allow
   full resolution." replaces the close-other-tabs framing; the total-
   failure error is now "This artwork exceeds what your browser can
   rasterize…" (harness 10f regex updated to match).

**User report (Looking-at-Kablammo, 24×24 in, cover ON, filter-forced raster):**
PDF page 2 was solid black; a 4× PNG export of the same workspace was blank.
Forensics on the PDF bytes (which motivated the new `inspect:pdf` tool):
page-2 content stream was correct, but the embedded 7200×7200 DCTDecode
stream was **100% uniform black pixels** while the 1200px cover preview of
the same clone was healthy — same `_rasterizeSvg`, only the size differed.

**Root cause:** `_rasterizeSvg` did fill → `drawImage` → `toBlob` with zero
verification. The artwork carries thousands of per-path `drop-shadow`
filters; at ~52 MP the browser loses the canvas (buffer resets to
transparent black → JPEG encodes solid black) or silently no-ops the draw.
The PNG path shares the function (8800×8800 at 4×; no pre-fill, so both
failure shapes yield a fully transparent PNG). `RASTER_MAX_SIDE_PX` is
per-side only; nothing checked area or output content, and every harness
raster check was content-blind (image count/operators — a black JPEG passed).

**Fix (export-modal.ts + new `playground/utils/raster-verify.ts`):**
- Every raster attempt is verified: `isContextLost()` where supported, a
  5×5 `getImageData` sample grid (opaque mode: any alpha<255 proves a wipe;
  samples identical to the pre-fill snapshot suggest a no-op), and a banded
  full scan before any suspect verdict sticks. Pure decision logic in
  raster-verify.ts (24 unit tests in tests/raster-verify.test.ts).
- Recovery order (user-selected): single draw → **tiled full-res**
  (RASTER_TILE_PX=2048 scratch → composite; keeps true 300 DPI) → ×1/√2
  size ladder to RASTER_MIN_SIDE_PX=2048 (cover preview floors at 600) with
  a user-visible achieved-DPI/px notice → thrown red-status error. A
  'uniform' (intact but ink-free) result ships only when the smallest
  attempt is also uniform — genuinely uniform artwork, not a masked no-op.
- `_rasterizeSvg` returns `{blob, width, height}`; PDF/PNG callers surface
  reduction notices through the existing status machinery.

**Tooling (user-requested):** devDeps pdf-lib/jpeg-js/pngjs; new
`scripts/lib/pdf-inspect.ts` + `scripts/inspect-pdf.ts` CLI
(`npm run inspect:pdf -- summary|pixel-stats|extract-image|dump-stream`).
`pixel-stats` on the user's PDF prints `UNIFORM (failure signature!)` for
/I1 — the diagnosis is now a one-command check.

**Code-review follow-ups applied in-session:** attempt B's 'uniform' result
is captured into the fallback slot (without it, a small export — empty size
ladder — whose full-size draw wiped but whose tiled draw proved the artwork
genuinely uniform would have thrown the "too complex" error on legitimate
input); failed attempt canvases are released eagerly (`_releaseCanvas`
zeroes dims) so retries never stack two full-res buffers under the very
memory pressure being recovered from; the reduced-DPI notice compares
against the *requested* DPI (RASTER_MAX_SIDE_PX may already cap below 300);
`bandHasInk` throws in opaque mode without a fill color; the tile loop
checks the destination context for loss too; a `setTimeout(0)` yield runs
between attempts.

**Known limitations (reviewed, accepted):**
- A *partial* tile no-op in the tiled path is undetectable in principle: an
  un-drawn tile is indistinguishable from a legitimately empty region of the
  artwork (per-tile ink demands would false-positive on sparse artwork).
  Total failure is always caught by the aggregate verification.
- `willReadFrequently: true` (CPU-backed canvas) might avoid GPU context
  loss at the source; deliberately not adopted — software-rendering
  thousands of filters at 50+ MP can hang for minutes, and SwiftShader
  harness runs can't validate the trade. Worth a real-GPU experiment later.

**Verification:** harness `verify-export.ts` grew sections 10b–10g —
pixel-truth on raster + cover PDFs, prototype-patch failure injection
(SwiftShader can't lose a real context): tiled path keeps 7200×4500,
ladder lands at 2546 with the ~106 DPI notice, all-fail raises the
"too complex" red error with no file, PNG 6000 → 3000×1875 with notice —
**62/62 checks**. Gotcha for future sessions: the injection seams are
`_attemptRasterDraw` / `_verifyCanvasDraw` on
`customElements.get('export-modal').prototype`; keep those method names
stable or update the harness. Real-GPU repro on the Kablammo workspace is
the user-side confirmation step (headless SwiftShader cannot reproduce the
context loss).

## 2026-07-19 (night) — showSaveFilePicker user-activation hotfix

Ryan's prod verification on a 13200×5200 piece hit
`SecurityError: Failed to execute 'showSaveFilePicker' … Must be handling a
user gesture`. Root cause: Chrome expires **transient user activation**
(~5s); the export pipeline (decimation → outlining/font fetches → preview
raster → cover → svg2pdf) outlives it on dense artwork, so the save dialog
opened AFTER the gesture died. **The harness is structurally blind to this**
— it stubs `showSaveFilePicker`, so real activation semantics never run.

Fix: picker-FIRST flow (`_acquireSaveTarget` inside the click → generate →
`_writeBlob` to the pre-acquired handle). `_downloadSvg`/`_downloadPdf` now
return Blobs; `_saveBlob` split into acquire/write. Cancel in the dialog
returns null from the acquire step and skips the export entirely — no work
done, no error status (harness check A1b). *(Sentence was left dangling by
the original session; completed 2026-07-29 from the shipped behavior.)*

## 2026-07-19 (evening) — Option B modal layout

Ryan flagged the Download button living in the modal top bar, far from the
form. Four bbwp layout variations shipped
(`…--export-legend-ux--action-bar-variations.bbwp.html`, with live-scrolling
form columns); **Option B approved**: no top bar; sticky form-column header
(title + close) + sticky bottom action bar (Cancel left / Download primary
right); preview gains full modal height. Markup/CSS-only restructure —
`.top-bar`/`.form-spacer` removed; `.form-panel` → header/`.form-scroll`/
`.form-actions`. **Gotcha:** the flex no-crush guard moved with the scroll
container (`.form-panel > *` → `.form-scroll > *`) — it protects children of
whatever element scrolls. `shoot-blog-assets.ts` scroll target updated to
`.form-scroll`; blog `pdf-export-modal.png` re-shot. Harness untouched and
green (selectors are class-based, position-independent): 56/56. Verified
scrolled/top, light/dark, and 640px mobile stack.

## 2026-07-19 (later) — Cover sheet + review fixes

**Review fixes applied** (from the optimization-diff code review):
- CRITICAL: `_optimizeArtworkPaths` now skips `defs/marker/clipPath/pattern`
  subtrees (local coordinate systems); marker E2E fixture guards it.
- S/T reflection: normalized to explicit C/Q in `parsePathDataExpanded` — at
  PARSE time, not the serializer as the review suggested, because after
  decimation the serializer no longer knows the original adjacency. Test
  proves the ~56-unit reflection corruption is fixed.
- Counters only increment after the DOM write; comments corrected.

**Cover sheet** (mockup-reviewed): page-1 job ticket, Letter/A4 by Units,
defaults ON via `_isArtworkComplex` (same flag as Raster/Standard). Pure
content module `playground/utils/pdf-cover-sheet.ts` (manifest/technical/
notes/fit math — 15 unit tests); `_buildCoverSvg` in the modal (reuses
`_createText`/`_wrapText` + legend brand footer); preview = 1200px JPEG of
the optimized+outlined clone captured BEFORE raster-stripping, drawn via
`doc.addImage` (never a data URL through svg2pdf); cover text outlined under
the same zero-font guarantee (export fails rather than embedding fonts);
jsPDF multi-page: constructor = cover format, `addPage([w,h], orient)` for
the artwork page (per-page MediaBoxes verified against jspdf 4.2.1 source).

**Harness fixture gotcha:** `_isArtworkComplex`'s d-length threshold needs
FLOAT coordinates to trip economically — 16k integer-coordinate circles
compile to only ~0.7M chars; 25k float-coordinate circles ≈ 1.59M (measured
via `node -e` against dist before burning harness runs). Loop commands merge
into one path element, so the >20k-node route is impractical in fixtures.

**Verification:** harness now **56/56**; full suite 93 files / 3,771 tests.
Rendered `verify/cover-vector.pdf` page 1 matches the approved mockup
(instant Quick Look render — the feature working as designed).

**Second review round (combined diff):** no criticals; independently
re-verified S/T reflection rules against the SVG spec (incl. confirming
parse-time normalization was the right call over serializer-time). Warning
fixed in-session: cover text fields had no width bounds on the fixed-size
page — meta line, manifest values, and technical line now truncate with
ellipsis to their column widths, and description/note tokens longer than a
line are hard-broken before wrapping (`fitChars`/`fitLine`/`breakLongWords`
in `_buildCoverSvg`). Harness gained the previously-untested combination
(cover + Standard detail + overlong creator → `verify/cover-long-values.pdf`,
visually confirmed truncating cleanly). Also: S/T Z/M-boundary + chained-S
reflection tests added; dead-branch comment in `commandExtent`; CHANGELOG
counts corrected.

## 2026-07-19 — Export output optimization (Precision + Detail)

Follow-up from Ryan's question about relative→absolute conversion as a PDF
performance lever (answer: no — PDF operators are already absolute and the
conversion is additions, not trig; the real levers are operator count and
number size). Mockup-reviewed, then shipped:

- **Precision** (Advanced Export Settings, SVG+PDF): per-export decimal
  trimming via new `trimPathDataPrecision` — post-processing over artwork
  `path[d]` (NOT a recompile: that would lose GPU-rasterized gradients),
  emitting ABSOLUTE commands because rounding relative deltas accumulates
  drift (~2.8 units over 200 × `l .014 .014` at 1 decimal; absolute stays
  within half an ULP). Seeded from the workspace `toFixed`, never mutates it.
- **Detail** (PDF + Vector only): `decimatePathData(d, epsilon)` with
  `epsilon = frac × (72/300)pt / layout.scale` (frac ½ = Fine, 1 = Standard);
  sub-epsilon runs accumulate and emit a synthetic `L` at each epsilon of net
  travel, so error is bounded by one printed dot. Complex artwork defaults to
  Standard. Dense 4,000-segment fixture: 2,447 removed, line ops 8461→6014,
  visually identical renders.
- **jsPDF `floatPrecision: 5`** — NOT `'smart'`, which keeps full 16-digit
  precision for sub-1 values and thus fails the no-overlong-floats probe.
- Library additions (all additive; byte-locked round-trip suites untouched):
  `commandsToAbsoluteD`, `parsePathDataExpanded` (multi-group expansion with
  the extra-M-groups-become-LineTos SVG rule; incomplete groups dropped —
  'garbage' tokenizes to bare `a` commands), exported via `src/index.ts` to
  `window.PathogenLang`.
- E2E harness now 41 checks; unit suites tests/path-precision.test.ts (13)
  and tests/path-decimate.test.ts (12).

Deferred: decimation for SVG export (needs an intended-display-size input);
smooth-command (`S`/`T`) reflection base shifts by ≤ ~2·epsilon when a tiny
predecessor is culled (documented, sub-dot).


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

## 2026-07-29 — Transparent workspace background painted the bleed fill black

**User report:** PDF export (Match artwork, 0.5 in margins, Bleed + crop marks
ON) produced a thick solid-black band across the margin+bleed area, framed by
the white slug ring. Repro PDF: user's `bug-check-on-black-border.pdf`; page 2
content stream began `0. g` + `18. 972. 1910.88 -954. re` + `f` — the bleed
rect filled black.

**Root cause:** the workspace background was `oklch(75% 75% 180 / 0%)` (fully
transparent, set via the footer color input). `canvasResolve()` in
`playground/utils/svg-pdf-colors.ts` returns `{ hex: '#000000', alpha: 0 }`
for any zero-alpha color, and `resolveCssColorToHex()` dropped the alpha —
so the bleed-edge background fill in `export-modal.ts` painted opaque black.
Same class of bug: semi-transparent backgrounds painted at full strength
(alpha silently dropped), and the raster/JPEG flatten used black instead of
the white-paper fallback.

**Fix:** `resolveCssColorToHex()` now returns `null` for zero-alpha colors
(matching the `transparent` keyword → the bleed fill is skipped, paper stays
white) and flattens partial alpha over white via the exported pure helpers
`paintedOnWhite()` / `flattenOverWhite()`. `normalizeSvgPaintColors()` (the
SVG paint path, which correctly folds alpha into `*-opacity`) is untouched.
Review follow-up in the same change: `_downloadPdf` now strips the clone's
`#preview-bg` rect — the page-level bleed fill is the single source of
background paint; left in, a semi-transparent background would composite the
raw color a second time on top of the flattened fill, printing a deeper tint
inside the artwork than in the margins.

**Verification:** red/green on the real `_downloadPdf` path via
`repro-black-border.ts` (this dir) — pre-fix: `0. g` bleed fill (zero-alpha)
and `0. 0.89 0.7 rg` (25% alpha, unflattened); post-fix: no bleed fill /
`0.75 0.97 0.93 rg` (exact flatten-over-white values). Regression checks live
in the **current** harness `project-docs/unified-export/verify-export.ts`
(section 12b) — `verify-pdf-export.ts` in this dir predates the unified
Export modal rename (`export-legend-modal` → `export-modal`, `export-legend`
→ `open-export` event) and can no longer drive the UI; it remains a
historical artifact. Unit tests: `tests/svg-pdf-colors.test.ts`.

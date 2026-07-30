# Export follow-ups — deferred from the black-border fix (2026-07-29)

Context: while fixing the transparent-background black bleed fill (commit
`d1ec506`, full story in `STATUS.md`), three adjacent defects were confirmed
in the code but deliberately left out of scope. Each is real, reproducible
from the cited lines, and none is a regression from that fix.

## 1. Export modal preview doesn't render the margin/bleed background fill

The PDF paints the margin+bleed area with the workspace background
(`export-modal.ts` `_downloadPdf`, the `doc.rect(layout.bleed…, 'F')` fill),
but the modal's preview pane never draws that band — margins always look
paper-white in the preview regardless of background color. This is exactly
why the black-border bug shipped invisibly: the preview and the downloaded
PDF disagreed, and the defect only appeared after download.

**Fix direction:** render the page mock in the preview with the same
`resolveCssColorToHex(background)` fill behind the artwork area (and the
slug ring white), so preview == PDF for any background. A cheap variant:
tint the preview's page rect with the resolved color whenever print prep is
on.

## 2. Default black 2-unit stroke leaks onto strokeless layer paths

`playground/components/svg-preview-pane.ts:36-37` + `995-1006`: any layer
path without an explicit layer stroke gets `stroke: #000000; stroke-width: 2`
in the preview DOM — including full-canvas background rects. Exports clone
that DOM, so the stroke prints. Visible thickness ≈ `layout.scale` pt just
inside the artwork edge (half is clipped): negligible for an 800-unit canvas
at 24 in (~2 pt), but a 100-unit ViewBox printed at 24 in scales to ~17 pt ≈
0.24 in of solid black frame inside the artwork boundary — a *second*,
independent "thick black border" trap.

Both PDF verify fixtures dodge it by declaring `stroke: none` explicitly
(`project-docs/pdf-export/verify-pdf-export.ts:57,84`), which is how it has
stayed unnoticed.

**Fix direction:** decide whether the implicit preview default should ship in
exports at all — either exclude the default from export clones (apply it as a
preview-only style, not a DOM attribute) or stop defaulting to black/2 for
paths whose layer declared no stroke. Needs a survey of existing workspaces
that may rely on the visible default.

## 3. Non-zero ViewBox origin offsets the background rect in SVG/PNG exports

`export-modal.ts` (`_prepareExportClone` path, viewBox reset around line
~1124) rewrites the clone's viewBox to `0 0 w h`, but `#preview-bg` keeps
`x/y = viewBoxOriginX/Y` (set from the compiled ViewBox in
`workspace-view.ts:893`). For a workspace with a non-zero origin the exported
background rect is shifted, leaving uncovered strips on two sides of the
canvas — an asymmetric band of missing background.

The 2026-07-29 fix removed this hazard from the **PDF** path only (PDF now
strips `#preview-bg`; the page-level bleed fill supplies the background).
**SVG and PNG exports still carry the offset rect** and remain affected.

**Fix direction:** when resetting the clone's viewBox, re-anchor
`#preview-bg` to the new origin (or size it `x/y = new origin, 100%/100%`),
plus a harness case with `define ViewBox(-100, -50, …)`.

## Non-defect note: legacy harness retirement

`project-docs/pdf-export/verify-pdf-export.ts` targets the pre-unification
modal (`export-legend-modal` / `export-legend` event) and can no longer
drive the UI; regression coverage lives in
`project-docs/unified-export/verify-export.ts` (section 12b for the
background cases). Kept as a historical artifact per project convention — do
not extend it.

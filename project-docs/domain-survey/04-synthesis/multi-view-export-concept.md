# Multi-View Export — Reframing "Multi-Page PDF" (2026-08-30)

*Prompted by user question on `calligraphy-worksheets.md`: do we need
"multi-page PDF," or a general means to output multiple views from a single
drawing (to PDF pages, multiple PNGs, multiple SVGs, …)? Answer: the latter —
"multi-page PDF" in the profiles is three distinct mechanisms wearing one
name. This note is the concrete record for Stage 4.*

## The three mechanisms hiding under "multi-page PDF"

**1. Pagination — many drawings, one document.**
Each page is an independent drawing, usually a parameter/variant sweep:
coloring interiors (C2: 24–100 seeded pages), planner spreads (E2: 12
months + trackers), worksheet packs (C7 calligraphy graded sets, D2
twelve-key music sheets), three-part card sets (D5). The unit is a
*collection of drawings* bound into one artifact.

**2. Tiling — one drawing, many pages.**
A single large drawing split across printable pages with overlap keys and
registration marks: quilt patterns (B1), full-size woodworking plans (A7),
oversized charts (B2 cross-stitch "multi-page chart splitting"), foam armor
(A18). The unit is a *projection* of one drawing onto a page grid.

**3. View splitting — one drawing, many outputs.**
The same drawing emitted as multiple files that differ by layer filter,
region, scale, or format: per-ink grayscale masters (C4 riso), layer-per-
colour SVG splits (A15 die-cutting), print PDF + cut SVG + DXF from one
source (A7, A11, D3 — the "one design, three formats" pattern), fixed-
resolution PNG renders (E7 e-ink), detail/callout views. The unit is a
*named view*: drawing + (layer subset, region, scale) + format.

## The unifying design concept

Separate the **drawing model** from the **artifact plan**:

- A program defines geometry (as today) and, optionally, a set of **views**
  — each view = a drawing (or variant invocation) + layer filter + region/
  crop + scale + annotations (registration marks, overlap keys).
- **Export targets consume view lists**: the PDF target binds an ordered
  view list into pages (mechanism 1 and 2 both reduce to this); the
  PNG/SVG/DXF targets emit one file per view (mechanism 3); tiling is just
  a *view generator* (drawing → grid of overlapping region-views).
- Mechanism 1's "many drawings" fits the same shape: page i = the program
  evaluated at parameter i — which is also what CLI batch generation wants,
  so **views and batch output are one feature**, not two.

Corollaries:
- "Multi-page PDF" stops being a PDF feature and becomes *PDF as one
  consumer of the view abstraction* — PNG sets and SVG sets come for free.
- Hyperlinked-PDF navigation (E2 digital planners) is a PDF-target concern
  layered on top; registration/overlap marks are view-generator concerns.
- The existing export modal (`export-modal.ts`, the single export path)
  is the natural surface for choosing a view list target.

## Where the profiles asked for it (for the feature matrix)

| Mechanism | Profiles |
|---|---|
| Pagination | C2, E2, C7, D2, D5, B7-bridge, C6 |
| Tiling | B1, A7, B2, A18, A10, A19 |
| View splitting | C4, A15, A6, A7, A11, D3, E7, A12/A13/A17 (format views incl. DXF) |

## Stage 4 disposition

Record in the General requirements doc as **"Multi-view export"** (one
feature, three mechanisms), replacing the separate "multi-page PDF" line
wherever it appears; note that it composes with CLI batch (same view
abstraction) and with machine-format export (a format is a view property).

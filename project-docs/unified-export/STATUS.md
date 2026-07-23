# Unified Export Workflow — STATUS

**Started:** 2026-07-21
**Plan:** `/Users/ryan/.claude/plans/we-made-a-great-tranquil-hinton.md` (approved 2026-07-21)

## Goal

Make the (former) "Export with Legend" modal the primary and only export
workflow:

- Legend optional, **default OFF**
- Legend off → exports still carry a "Created in pathogen.studio" watermark
- Legend on → optional **syntax-highlighted** source code (default ON),
  reusing `highlightPathogen` classification + the light `--code-*` palette
- New **PNG** format alongside SVG and PDF (scale presets, transparency)
- Overflow menu: single "Export" item (old `.svgx` source save dropped)
- Ctrl+S stays autosave-only; **Ctrl/Cmd+Shift+E** opens Export
- New launch blog post (new slug `unified-export`); old
  `print-ready-pdf-export` post left untouched

## Phase log

### Phase A — Mockups (2026-07-21) — IN REVIEW

Static HTML mockups in `mockups/` (open directly in a browser; Google Fonts
fetched for Baumans/Inconsolata/Inter fidelity):

1. `01-default-export.html` — modal retitled "Export", 3-way format toggle,
   Include legend OFF (default state), watermark in preview
2. `02-legend-on-highlighted.html` — legend ON with syntax-highlighted code
   (real light-palette hexes) + highlight on/off comparison
3. `03-png-settings.html` — PNG format panel: scale presets, size summary,
   transparent background (checkerboard preview) + custom-width variant
4. `04-menu-and-watermark.html` — overflow menu before/after; watermark
   legibility close-ups on light and dark artwork

Verified renders in `mockups/previews/*.png` (shot via `shoot-mockups.mjs`,
run from repo root with `node project-docs/unified-export/shoot-mockups.mjs`).

**Paused for user review before implementation (Phase B).**

### Phase B — Implementation (2026-07-21) — DONE (reviewed, committed)

Code review (code-reviewer agent): one Warning — re-entrant `open()`
leaked document listeners (Ctrl+Shift+E twice → duplicated relative
arrow-key nudge handlers, never cleaned up). Fixed with a
`_removeDocumentListeners()` guard at the top of
`_addDocumentListeners()`; E2E gained a double-open regression check
(arrow nudges exactly one snap step). Full suite 3,850 tests green;
E2E 32/32.

Mockups approved by Ryan; implementation followed the approved plan:

- **B0 docs**: `docs/exporting.md` rewritten for the unified dialog
  (formats-at-a-glance, optional legend, branding, PNG section; PDF
  deep-dive carried over). `build:docs` + `check-links` clean.
- **B1 tokens**: `highlightPathogenTokens()` added to `src/highlight.ts`
  (shared `flatTokens()` walk; `highlightPathogen` reimplemented on top,
  HTML behavior preserved). Exported via `src/index.ts` →
  `window.PathogenLang`. Palette module
  `playground/utils/code-print-palette.ts` with drift-guard test.
  Finding: anonymous operator tokens (`=`, `+`, `;`) never appear as
  Lezer leaves — they land in gap text, matching shipped
  `highlightPathogen` behavior (ANON_OP_CLASS is effectively dead).
- **B2–B5 modal**: renamed to `export-modal.ts` / `<export-modal>` /
  `ExportModal`. Format toggle SVG|PNG|PDF at top; `includeLegend`
  (default OFF, reset per open()); `highlightCode` (default ON,
  memoized tokens, monochrome fallback + round-trip guard in
  `legend-code-tokens.ts`); watermark `#pathogen-watermark` via shared
  `_createBrandText()`; PNG pipeline (`_rasterizeSvg` generalization,
  scale presets/custom width, 16384px cap, transparent = remove
  `#preview-bg`); watermark added to optimize-skip + raster keep-list;
  Inter subset added to `_embedFonts`. **No italics / no bold** in
  highlighted export (outliner renders upright; color-only keeps
  SVG/PNG/PDF identical — deviation from mockup 02 noted).
- **B6 rewiring**: single `open-export` event; breadcrumb has one
  Export item; `exportFile()` (.svgx source save) deleted;
  Ctrl+Shift+E opens Export; Ctrl+S untouched (autosave flush).
- **B7 verification**: 41 unit tests (highlight-tokens,
  legend-code-tokens, code-print-palette drift guard, outliner
  multi-tspan fills). E2E `verify-export.ts`: **31/31 checks** (menu,
  shortcut, defaults, SVG legend on/off/highlight bytes, PNG dims /
  custom width / oversize error / transparency alpha, PDF outlined
  watermark in vector+raster modes, picker-cancel). Outputs in
  `verify/`.

Gotchas hit:
- `npm run build:playground` bakes `PATHOGEN_API_BASE` (defaults to
  prod!) — must run with `PATHOGEN_API_BASE=http://localhost:8787`
  while dev:stack is running (same trap as build:website).
- `eslint --fix` stripped load-bearing `as` casts (workspace-view
  getters, header/status elements) breaking `typecheck:playground`;
  restored by hand. Playground typecheck has 7 pre-existing errors —
  compare counts before/after.
- Transparency E2E must use artwork that doesn't paint the probed
  corner (a drawn full-canvas rect is artwork, not workspace
  background).

### Phase C — Blog (2026-07-23) — IN REVIEW

- Sample: `website/blog/samples/post30/meridian-bloom.pathogen`
  (900×1200 poster, six petal rings + Baumans glyph title; GroupLayer'd;
  `compile:samples` + `validate-samples` clean; BBWP compiled
  2026-07-23-09:53:40)
- Screenshots via `shoot-blog-assets.ts` (adapted from pdf-export
  shooter, EXPORT-MODAL tag): `website/blog-static/unified-export-modal
  / -legend / -png.png` + `verify/meridian-bloom-poster.pdf`
- Post: `website/blog/unified-export.md` — "Export Anything: SVG, PNG,
  and Print-Ready PDF from One Dialog" (slug `unified-export`,
  2026-07-23). Standalone launch framing (no upgrade story); old
  print-ready-pdf-export post untouched.
- `build:blog` (29 pages) + `build:website` + `check-links` clean;
  post + images + sample SVG verified serving on :3000.
- Content review (4-persona round table) verdict: strong launch, clean
  net-new framing. Actions taken:
  - **Must-Fix 1** (color claim needed visible evidence): added
    `unified-export-legend-detail.png` — high-res crop of the exported
    legend card with fully legible token colors — into the post.
  - **SF-3**: sample now uses the idiomatic `2pi` unit instead of
    `6.28318`; recompiled + revalidated + fresh BBWP
    (2026-07-23-10:04:48).
  - **SF-4** verified real: `open()` seeds the legend Name from the
    workspace name (screenshot shows it pre-filled). Phrasing kept.
  - **C-5**: Precision/Detail sentence split (decimals vs segments).
  - **C-6**: PNG screenshot recaptured with legend off (matches alt).
  - **C-7**: watermark line no longer claims light-artwork evidence.
  - **SF-2 flagged, not actioned**: old `print-ready-pdf-export.md:54`
    still says "Export with Legend" (menu item that no longer exists).
    User directed the old post stay completely untouched — surfaced to
    Ryan as a known staleness for a future editorial pass.
  - **C-8**: no forward link from old post added (out of scope, same
    directive).

### Post-launch fixes (2026-07-23)

Ryan reported two preview issues (both pre-dated the unification but are
front-and-center now that this is the only export surface):

1. **Rounded clip mask on zoom** — `.preview-area svg` has
   `border-radius: 12px` and SVG UA style is `overflow: hidden`; the
   modal zooms by viewBox mutation, so magnified content clipped to the
   fixed element box *with rounded corners*. Fix: `_updateViewBox()`
   toggles a `zoomed` class off-fit; CSS squares the corners while
   zoomed/panned, restoring the card look at Fit. (Proper long-term fix
   remains PanZoomController Phase 4 — transform-mode migration — but
   the controller pans on any mousedown and would fight legend drag; it
   needs a pointer-filter API first.)
2. **Legend draggable outside the viewBox** — drag/arrows/resize never
   clamped position; the export clone resets the viewBox, so off-canvas
   legend content was silently cut from downloaded files. Fix:
   `_clampLegendPos()` applied on drag, arrow nudge, resize/content
   rebuild, and initial placement; maximal-overlap clamp when the card
   is larger than the canvas.

E2E grew 3 checks (arrow-hammer clamp, zoomed square corners, fit
restore) → **35/35**; the double-open nudge check now nudges LEFT (the
default position sits near the right-edge clamp, which would truncate a
rightward step and mask a duplicate listener). Visual probes:
`verify/probe-zoomed-square-corners.png`, `verify/probe-clamped-at-fit.png`
(`probe-zoom-clamp.ts`).

**Follow-up identified as the real issue by Ryan:** the Export and Set
Thumbnail modals still run the LEGACY viewBox-mutation zoom while the
primary preview / mini-workspace / VS Code preview use the shared
transform-mode PanZoomController. The zoomed-corner patch above treats
a symptom of that gap. Full divergence audit + alignment plan:
`project-docs/pan-zoom-performance/zoom-surface-parity.md`.

## Key implementation facts (verified during planning)

- Legend card is always white → light code palette only:
  kw `#6d3aa6` · fn `#a83d80` · num `#d97a6e` · str `#5a8a72` ·
  cm `#9087a0` · op `#6b5a7a` · tp `#b65a2a` · default `#1c1722`
- Outliner supports multi-tspan lines (per-tspan `fill` attr survives; tspans
  without `x` continue the pen). **No italics** in exported text.
- `_rasterizeArtwork()` keep-list and `_optimizeArtworkPaths()` skip-selector
  must both learn `#pathogen-watermark`.
- PDF rasters stay JPEG (jsPDF PNG path too slow); PNG export is its own
  canvas path (`canvas.toBlob('image/png')`), max side clamp 16384 px.
- Ctrl+S (workspace-view.ts:527) is autosave-only today; menu tooltip
  claiming "(Ctrl+S) export" was already wrong.
- `playground-header.ts` is storybook-only; live menu is `app-breadcrumb.ts`.

# Detail-Page Hero Viewer — Exploration

Elevating the hero on the public view-only workspace detail page
(`pathogen.studio/u/:handle/:slug`) from a static plate — often a raster
`hero.png` — to a mini-workspace-grade viewer over the pre-compiled SVG:
pan, zoom, fullscreen, and layers. Scope is deliberately limited to the
space the hero already occupies; everything below (title, byline, source
disclosure) stays. Progressive disclosure of the code further down the
page is unchanged.

Motivating example: `/u/ryan/experiments-in-random-variable-offsets`,
which renders a raster hero today.

## Key findings (2026-07-30 exploration)

1. **The vector infrastructure already exists.** The detail page renderer
   (`website/_worker.ts`, `renderWorkspaceDetailPage`) already prefers an
   inline SVG (legacy KV `approval.svg` field) or an `<object>` pointing
   at R2 `${workspaceId}/approval.svg`, and only falls back to the raster
   `hero.png` when no approval SVG was captured. The raster on the
   motivating example is a **missing-data gap** (the record predates SVG
   capture), not missing plumbing. "Pre-compile and store the SVG" is a
   backfill + regenerate exercise, not new architecture.
2. **Every viewer building block is reusable.** `dist/pan-zoom.global.js`
   registers `window.PathogenPanZoom.PanZoomController` and
   `<pathogen-zoom-pill>`; every compiled SVG carries `data-layer-name`
   on layer elements (both CLI and playground emit it), so a layers panel
   needs only the SVG DOM; `--include-metadata` adds the richer
   `pathogen-metadata` JSON block.
3. **The current art cap is the main size lever.** `.detail-plate-art` is
   capped at 720px inside a 1280px plate. The motivating artwork is a
   wide 860×200 banner, so the cap is especially punishing for it.
4. **Layer UIs must scale.** This one real artwork has **485 layers**
   (generated `pl-N` halos + `gl-N` glyph layers). Any layers panel needs
   a filter, bulk show/hide, and a scrollable list — a bare checkbox
   column does not survive contact with real content.

## The three mock-ups (`mockups/`)

Interactive HTML pages using the real theme tokens, the real pan/zoom
bundle, and the real artwork compiled from the motivating workspace.
Serve with `npm run serve:bbwp`, then open
`http://localhost:3001/project-docs/detail-hero-viewer/mockups/index.html`
(also linked from the pinned section of `website/bbwp/index.html`).

| Variant | Thesis | Signature |
|---|---|---|
| **A — Refined plate** (`variant-a-refined-plate.html`) | Keep today's plate (crop marks, elevation) exactly; art grows 720→1040px; controls appear on hover | Viewer chrome invisible until you reach for it |
| **B — Framed viewer** (`variant-b-framed-viewer.html`) | The stage becomes a framed instrument: slim toolbar (layers count, fit, fullscreen) over a full-width viewport (~1216px art) | Discoverable toolbar; layers drawer with ⌥-click solo |
| **C — Full-bleed stage** (`variant-c-full-bleed.html`) | The viewport IS the plate: edge-to-edge art on a gradient backdrop, glass corner controls | Collapsible glass swatch-dot layers rail over the artwork |
| **B·2 — Frameless + full viewport** (`variant-b2-full-viewport.html`) | **Chosen direction** (2026-07-30 review): B with the toolbar removed — just the framed art, a hover-revealed fullscreen toggle, viewport-fill "fullscreen" (fixed overlay, not the Fullscreen API), layers gated to that mode | Quietest resting state: one glass button |

All variants share: `mockup-shared.js` (controller + pill + layer model +
fullscreen wiring), `mockup-shared.css` (glass buttons, layer rows, wheel
hint), wheel-zoom gated on ⌘/Ctrl (the page must scroll normally),
double-click zoom, and a fixed A/B/C switcher bottom-right. Both themes
work via the real `<theme-toggle>`.

## Assets (`assets/`)

- `experiments-in-random-variable-offsets.pathogen` — fetched verbatim
  from the public `source.json` route.
- `experiments-in-random-variable-offsets-localfont.pathogen` — one-line
  variant adding `@font './Noto Sans.ttf';` because the CLI cannot fetch
  Google Fonts yet (`PathBlock.fromGlyph` needs font data). A file-path
  `@font` registers under the filename stem, so naming the TTF
  `Noto Sans.ttf` makes it match the source's `font-family: 'Noto Sans'`.
- `Noto Sans.ttf` — static Noto Sans Regular (googlefonts/noto-fonts).
- `artwork.svg` — compiled via
  `npm run cli -- <localfont file> --output-svg-file=... --include-metadata --stroke=none`.
  `--stroke=none` avoids the CLI's default `stroke="#000"` leaking onto
  the style-less `base` layer (a border the playground would not draw).

## Verification

`verify-mockups.ts` (run `npx tsx project-docs/detail-hero-viewer/verify-mockups.ts`
with `serve:bbwp` running) drives all six variant×theme combinations
headless: artwork mounts, viewBox `0 0 860 200`, 485 layer elements and
rows, pill − / Fit / + / % works, layer toggle hides and restores
elements. Screenshots land in `mockups/screenshots/variant-{a,b,c}-{light,dark}.png`.

## Production notes for the next phase (after a winner is picked)

- **Render surface**: the real page must inject the stored SVG through
  the sandboxed preview iframe (`playground/utils/preview-iframe.ts`,
  `bootstrapPreviewIframe(iframe, 'mini')`, CSP `script-src 'none'`) —
  the mock-ups inline it only because we compiled the artwork ourselves.
  Attach the controller to the iframe document like `mini-preview.ts`
  does, and call `endGesture()` from a parent-document pointerup.
- **viewBox origin**: parse all four viewBox numbers and pass
  `originX/originY` to the controller. `mini-preview._panZoomCanvas()`
  hardcodes `0,0` — a known gap; nonzero-origin drawings would get offset
  fit/clamping. The mock-up wiring already does this correctly.
- **Approval SVG backfill**: records without `approvalSvgAt` fall back to
  raster. Decide whether the admin approval capture
  (`admin-moderation-view.ts`, `lib.generateSvg(result, dims)`) should
  pass `includeMetadata: true` for richer layer names, then regenerate
  existing approvals.
- **fullscreen-toggle.ts** carries stale `#10b981` green fallback
  literals — fix before reuse (zoom-pill.ts documents the correct
  token fallback pattern).
- **Layer list**: reuse the filter + bulk-toggle + scroll pattern from
  `mockup-shared.js` `renderLayerList` — 485-layer artworks are real.

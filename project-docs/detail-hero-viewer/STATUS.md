# Detail-Page Hero Viewer — Status

## 2026-07-30 — Shipped and verified in production

Commit `9ac91e2` deployed via Pages auto-deploy; Ryan verified the live
viewer working as expected in production (approval SVG regenerated for
the motivating page). Remaining follow-ups, in no particular order:

- Backfill sweep: regenerate approval SVGs for older approvals still
  missing `svg`/`approvalSvgAt` so every detail page gets the viewer.
- CHANGELOG.md entry covering work since the last entry.
- Optional: flip `includeMetadata: true` in the admin approval capture
  (`admin-moderation-view.ts` `lib.generateSvg`) for richer inspector
  layer data (names/nesting/gradients) on future regenerations — weigh
  against the script-tag-in-served-SVG security posture first.

## 2026-07-30 — Production implementation (B·2) on dev, verified

Reuse-first build — all viewer behavior comes from existing components;
the new code is host glue only:

- **`playground/utils/detail-hero-mount.ts`** (new) — progressive
  enhancement: reads the SSR hero (legacy inline SVG, else fetches the
  `<object>`'s R2 approval-SVG URL — CORS-mirrored by the API worker),
  mounts **`<mini-preview>`** (sandboxed iframe, shared PanZoomController,
  zoom pill, scroll hint, class-based viewport-fill fullscreen), adds the
  single hover-revealed glass fullscreen button (delegates to the
  component's internal toggle — never sets `.fullscreen` directly), and
  wires **`<inspector-panel>`** the way mini-workspace does (lazy import,
  `fullscreen-overlay open` classes, Esc closes panel before fullscreen,
  any fullscreen transition dismisses it). Layers derive from
  `data-layer-name` (approval SVGs carry no metadata block).
- **`website/_worker.ts`** — `heroVector` flag → `data-hero-vector` on the
  stage, conditional `pan-zoom.global.js` classic script (ordering
  contract), hydration IIFE in the existing module script. All static
  fallback tiers unchanged; non-vector pages byte-identical.
- **`playground/styles/workspace-detail.css`** — `.detail-hero-live`
  frameless stage (padding 0, crop marks off), `.detail-hero-viewport`
  height clamp, glass button recipe.
- **Component fixes that de-drift every consumer**: mini-preview
  viewBox-origin support (parses all four viewBox numbers; controller
  canvas, bg rect, navigator viewBox/rect/mouse math all origin-aware —
  closes the long-standing `0,0` gap noted in zoom-surface-parity;
  behavior-preserving for zero-origin content, and a malformed viewBox now
  falls back to defaults instead of NaN dims), `CSS.escape()` on the
  author-chosen layer names in `setLayerVisibility`'s selectors (review
  finding — reachable from arbitrary published workspaces via this
  feature; robustness, not XSS: the query runs inside the author's own
  sandboxed iframe), and the stale `#10b981` green fallback literals in
  fullscreen-toggle.ts + mini-preview replaced with theme.css pink per
  the zoom-pill.ts pattern.
- **Post-review hardening**: hydration script gated on `heroVector` so
  non-vector pages serve byte-identical HTML; `mountHeroViewer` is
  idempotent (`.detail-hero-live` guard); `wireInspector` returns a
  teardown that removes its document keydown listener (unused on the MPA
  page today, required if the route is ever absorbed into the SPA).

**Verified E2E on the dev stack** (`verify-production.ts`, screenshots in
`production-verify/`): local approval backfilled through the real
`PUT /admin/approval/:id/svg` endpoint (R2 + `approvalSvgAt`), then 31/31
checks green in light + dark — mount, frameless stage, pill zoom, viewport-
fill fullscreen at exactly window size, layers gated to fullscreen,
485-layer inspector, layer toggle reaching the sandboxed iframe, double-Esc
restore, and the non-vector fallback page untouched (crop marks intact).
Full Vitest suite: 4282/4282 across 103 files.

**Prod rollout note**: the motivating page
(/u/ryan/experiments-in-random-variable-offsets) still needs its approval
SVG backfilled (admin moderation "Regenerate preview", or
`PUT /admin/approval/:id/svg`) before the viewer appears there — the
render path now exists for every approval with `svg`/`approvalSvgAt`.

## 2026-07-30 — Design review: variant B chosen, revised as B·2

User picked **variant B** with four changes, built as
`mockups/variant-b2-full-viewport.html` (B preserved untouched per the
artifact convention):

1. Toolbar (title + dims + buttons) removed entirely — the stage is just
   the framed art.
2. The only floating control at rest is the fullscreen toggle
   (hover-revealed glass button, always visible on touch).
3. "Fullscreen" fills the **browser viewport** (fixed overlay, body
   scroll locked, Esc exits), not the Fullscreen API.
4. The layers toggle (and its drawer, with ⌥-click solo) appears **only
   in full-viewport mode**.

Verified headless: all 4 variants × 2 themes pass, plus B·2-specific
checks (layers button hidden at rest / visible in full-viewport, fixed
overlay geometry, body scroll lock, exit restores). Screenshots:
`variant-b2-{light,dark}.png` + `variant-b2-fullviewport-{light,dark}.png`.

Bug found & fixed during verification: `flex: 1` on the viewport
(flex-basis 0%) collapsed the content-sized stage to 0 height — every
functional check still passed, so the verify harness now asserts viewport
geometry (>600×250) for all variants. `flex: 1` is applied only inside
the fixed-position full-viewport state, where the stage has definite
height.

**B·2 is the implementation target.** Next: plan the production build
(iframe sandbox render path, approval-SVG backfill, viewBox-origin
handling, full-viewport overlay on the real detail page).

## 2026-07-30 — Mock-up phase complete, awaiting design review

- Explored the detail page SSR (`website/_worker.ts`) and mini-workspace
  viewer stack; findings in README.md. Headline: the vector hero path
  (R2 `approval.svg` + `<object>`) already exists — the motivating page
  shows a raster only because its approval record predates SVG capture.
- **Artwork provenance**: real source fetched from
  `pathogen.studio/u/ryan/experiments-in-random-variable-offsets/source.json`
  (65 lines, modern syntax — no semicolon fixes needed). CLI could not
  fetch Google Fonts ("Noto Sans"), so a `-localfont` variant adds
  `@font './Noto Sans.ttf';` (static TTF downloaded into `assets/`).
  Compiled with `--include-metadata --stroke=none`; `--stroke=none`
  prevents the CLI default `stroke="#000"` from drawing a border the
  playground wouldn't (surface-parity class of bug).
- Built three interactive mock-ups (`mockups/`): A refined plate,
  B framed viewer, C full-bleed stage. Real pan/zoom controller, zoom
  pill, fullscreen, and DOM-derived layer toggles wired in all three.
- **Verified** headless via `verify-mockups.ts`: all 6 variant×theme
  combos pass (artwork mounts, pill −/Fit/+/% works, 485 layer rows,
  toggle hides/restores). Screenshots in `mockups/screenshots/`.
- Design fix during review: variant C's collapsed swatch rail now hugs
  its content instead of stretching the full stage height.
- Linked from the pinned section of `website/bbwp/index.html` (outside
  the regeneration markers, so `update:bbwp-index` preserves it).

**Next**: user reviews the three variants and picks a direction; then
plan the production implementation (iframe sandbox render path, approval
SVG backfill/regenerate, viewBox-origin fix, fullscreen-toggle cleanup —
see README "Production notes").

**Open questions for the review**
1. Should layers be discoverable at rest (B's toolbar) or hover-revealed
   (A/C)?
2. How much viewport height should the hero take for wide artworks —
   A ~420px, B ~520px, C ~600px at desktop widths?
3. Does the crop-mark plate identity matter enough to keep (A), or does
   the meta block below carry it (B/C)?

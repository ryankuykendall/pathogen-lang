# Zoom/Pan Surface Parity — Divergence Audit

**Date:** 2026-07-23
**Status: EXECUTED 2026-07-23** — all five surfaces now run the shared
`PanZoomController` in transform mode with the shared
`<pathogen-zoom-pill>` chrome. See "Execution record" at the end; the
audit below is preserved as written for the historical picture.

**Trigger:** Ryan compared 500% zoom in the primary workspace preview
(smooth transform-mode magnification filling the pane) against 500% in
the Export modal (content magnified inside a fixed, clipped window with
a misplaced zoom bar). The two experiences are visibly different
products. This document records exactly where every zoom surface stands
so the alignment pass can be executed quickly.

**Goal:** all five preview surfaces look and behave the same way.

## The two systems in play

**Modern — shared `PanZoomController`** (`src/ui/pan-zoom-controller.ts`,
shipped to surfaces as `dist/pan-zoom.global.js` → `window.PathogenPanZoom`):

- `mode: 'transform'` — CSS transform during the gesture, baked into the
  `viewBox` on idle (the pan-zoom-performance refactor; see
  `findings-and-recommendations.md` in this directory)
- Owns wheel/pointer/pinch input, pan clamping (`clampPan` with margin),
  zoom-about-center, mid-gesture rebaselining
- Zooming visually scales the artwork element — magnified content fills
  the pane naturally; no element-box clipping

**Legacy — hand-rolled viewBox mutation**: component-local `_zoom`/
`_panX`/`_panY` fields, manual `mousedown`/`mousemove`/`wheel` handlers,
and `svg.setAttribute('viewBox', …)` per change. Borrows only the pure
math (`viewToViewBox`, `clampZoom`, `adjustPanForZoom`) from the shared
module. Because the element box never changes, zoomed content clips at
the element bounds — the "window" effect Ryan flagged.

## Surface-by-surface status

| Surface | File | System | Wheel gate | Zoom range | Notes |
|---|---|---|---|---|---|
| **Workspace — primary preview** | `playground/components/svg-preview-pane.ts:242` | Controller, `transform` | Ctrl/Cmd required (hint shown) | 0.25–10, step 1.5 | Reference implementation. Store-mirrored view, navigator minimap, floating zoom pill centered over the preview. |
| **Workspace — Export modal** | `playground/components/export-modal.ts` | **Legacy** | plain wheel | **0.1**–10, step 1.5 | Manual handlers interleaved with legend drag/resize. No pan clamping (can pan into the void). `zoomed`-class hack squares the rounded corners off-fit (2026-07-23) — a patch over the window-clip, not a fix. Full-width zoom bar at the panel foot, not the floating pill; **reported rendering partially offscreen** (bar cut at the window's bottom edge in Ryan's 2026-07-23 screenshots — needs a layout pass with devtools; suspect the modal column exceeding the viewport in some window sizes). |
| **Workspace — Set Thumbnail modal** | `playground/components/thumbnail-crop-modal.ts:702` | **Legacy** | plain wheel | **0.1**–10, step 1.5 | Same hand-rolled pattern as the Export modal (comment says "this modal keeps viewBox mutation"). Crop-box interactions interleaved with pan, same coordination problem as legend drag. |
| **Blog/Docs — mini-workspace** | `playground/components/blog/mini-preview.ts:139` | Controller, `transform` | Ctrl/Cmd required | 0.25–10, step 1.5 | Aligned with primary preview. |
| **VS Code — preview panel** | `packages/vscode-pathogen/src/preview.ts:589` | Controller, `transform` | plain wheel (deliberate: dedicated panel, no scroll trap) | matches primary | Aligned. (The shared-panzoom "Phase 3" memory note is stale — VS Code is done.) |

**Score: 3 of 5 surfaces on the shared controller. The two workspace
modals are the stragglers** — ironically the surfaces closest to the
primary preview in user flow (workspace → export / set thumbnail).

## User-visible divergences (the parity debt)

1. **Zoom rendering**: modals magnify inside a fixed clipped window;
   controller surfaces scale the artwork to fill the pane. At 500% the
   experiences look like different products (Ryan's screenshots,
   2026-07-23).
2. **Wheel behavior**: primary/mini require Ctrl/Cmd to zoom (plain
   scroll passes through); modals zoom on plain wheel.
3. **Zoom floor**: modals allow 0.1 (10%); controller surfaces floor at
   0.25 (25%).
4. **Pan clamping**: controller clamps pan with a margin (and recenters
   below `panDisableBelowZoom`); modals let you pan the artwork
   entirely out of view.
5. **Gesture quality**: controller has pinch-zoom, pointer events,
   zoom-about-cursor-center, and idle-bake crispness; modals are
   mouse-only with center-anchored zoom.
6. **Zoom chrome**: primary preview uses a floating pill centered over
   the preview; modals use a full-width bar strip below it (and the
   Export modal's bar can land partially offscreen). Placement, style,
   and (for Export) correctness all diverge.
7. **Corner treatment**: the Export modal needs a `zoomed`-class hack to
   un-round its corners off-fit; controller surfaces never had the
   problem because the element scales.

## Why the modals weren't migrated with the rest

The controller binds its own `pointerdown`/`mousedown` on the event
target and treats **every** press as a pan gesture
(`handlePointerDown`, `pan-zoom-controller.ts:390`). Both modals have
foreground interactions on the same surface that must win over panning:

- Export: legend drag, legend resize handle
- Set Thumbnail: crop-box drag/resize

Migration therefore needs a small controller API first — e.g. a
`shouldStartPan(e: PointerEvent) => boolean` config predicate (return
false when the target is `.legend-group`/`.resize-handle`/crop chrome),
or an `interceptors` layer. This was deferred as "Phase 4 (modals)"
during the original controller rollout and is the actual work item.

## Alignment plan (when we circle back)

1. **Controller API**: add `shouldStartPan` (or equivalent) predicate to
   `PanZoomConfig`; unit-test that a false return leaves the event
   untouched for the caller's own handlers.
2. **Export modal**: replace `_zoom/_panX/_panY` + manual handlers with
   a controller instance (`mode: 'transform'`); legend drag/resize keep
   their document-level handlers and are excluded via the predicate.
   Delete the `zoomed`-class corner hack (obsolete under transform
   mode). Decide wheel gate: recommend matching the primary preview
   (Ctrl/Cmd) since the modal sits over the same app.
3. **Set Thumbnail modal**: same migration, excluding crop-box chrome.
4. **Zoom chrome**: extract the primary preview's floating pill as a
   shared component (`components/shared/zoom-pill.ts` or similar) and
   use it in all three workspace surfaces; fixes the Export modal's
   offscreen bar as a side effect. Storybook entry per playground
   conventions.
5. **Constants**: hoist MIN/MAX/STEP (0.25 / 10 / 1.5) into the shared
   module's `DEFAULTS` and delete the per-component copies (per the
   no-drift-prone-files rule).
6. **Verify**: extend `project-docs/unified-export/verify-export.ts`
   (zoom at 500% fills the pane, no `zoomed` class needed, wheel gate)
   + manual pass across all five surfaces at 100%/500%/10%.

## Related artifacts

- Perf refactor findings: `project-docs/pan-zoom-performance/findings-and-recommendations.md`
- Export modal patch-fixes now superseded-in-spirit by this plan:
  `project-docs/unified-export/STATUS.md` → "Post-launch fixes (2026-07-23)"
- Controller source: `src/ui/pan-zoom-controller.ts`

---

## Execution record (2026-07-23)

The alignment plan above was executed the same day, with these decisions
from Ryan:

- **Chrome**: one shared glass pill, `<pathogen-zoom-pill>`, styled after
  the mini-workspace design — **bottom-center + hover-fade on every
  surface** (mini moved from bottom-right; primary gained the fade).
- **Zoom range**: **10%–2000%** (min 0.1 / max 20), step 1.5 —
  standardized in the now-exported `DEFAULTS`
  (`src/ui/pan-zoom-controller.ts`); every per-surface MIN/MAX/STEP copy
  deleted, including VS Code's hard-coded 25–1000 input validation.
- **Wheel gates** (unchanged by design): primary + mini require
  Ctrl/Cmd; modals + VS Code plain wheel.
- **Export modal**: full-bleed preview — the bottom zoom-bar strip is
  gone; Snap became a floating glass chip beside the pill (shown only
  with the legend on).

**Final state:**

| Surface | System | Chrome |
|---|---|---|
| Workspace primary preview | Controller, transform | `<pathogen-zoom-pill>` |
| Export modal | Controller, transform | pill + snap chip (full-bleed) |
| Set Thumbnail modal | Controller, transform | `<pathogen-zoom-pill>` |
| Mini-workspace | Controller, transform | `<pathogen-zoom-pill>` |
| VS Code preview | Controller, transform | `<pathogen-zoom-pill>` |

**Key implementation facts:**

- `shouldStartPan(e)` predicate added to `PanZoomConfig` — guarded at
  the top of `handlePointerDown` BEFORE `preventDefault`, so a vetoed
  press (legend drag/resize, crop handle/area) reaches the surface's
  own handlers untouched. Move/Up needed no guarding (move ignores
  untracked pointer ids). First instance-level controller tests added
  (fake svg/eventTarget + RAF stubs, `tests/pan-zoom-controller.test.ts`).
- The pill lives in `src/ui/zoom-pill.ts`, registered by the pan-zoom
  bundle barrel (`src/ui/pan-zoom.ts` → `dist/pan-zoom.global.js`) so
  the VS Code webview gets it from the script it already loads. Element
  class defined inside `registerZoomPill()` — the Node CLI imports this
  module, so no DOM at module top level. Styles via constructed
  `adoptedStyleSheets` (CSP-safe) with `<style>` fallback; theming
  chain `--playground-token → --vscode-* → literal`.
- Pill API: `controller` (structural target; reassign after controller
  rebuilds), `zoom` (display-only, pushed by the surface's onChange —
  the pill never subscribes), `fadeTarget` (hover container),
  `always-visible`, `min`/`max` attributes. Shadow ids
  `#zoom-out/#zoom-fit/#zoom-in/#zoom-level` are a documented contract
  (E2E pierces two shadow roots).
- Modal migrations destroy + reconstruct the controller per preview
  rebuild (the SVG element is recreated), seeding the saved view.
  `endGesture()` at legend/crop mousedown keeps `getScreenCTM` settled;
  `_prepareExportClone` force-bakes and strips inline
  `transform/transform-origin/will-change/touch-action` so exports are
  byte-clean even mid-gesture (E2E-verified).
- The export modal's `zoomed`-class corner hack (2026-07-23 patch) was
  deleted — but NOT because transform mode makes a radius safe (post-bake,
  the element is back at DOM size with a magnified viewBox, and a radius
  clips again — caught by code review against the first formulation).
  Instead the artwork element's `border-radius` was removed entirely,
  matching the thumbnail modal and primary preview (shadow only); an E2E
  check pins computed radius 0 at zoom.

**Verification:** 41/41 E2E checks (`project-docs/unified-export/
verify-export.ts`) including PointerEvent pan, predicate veto,
mid-gesture byte-clean download, computed-radius-0 at zoom, a
visible-artwork-layers guard, and a standalone-bundle check proving
`pan-zoom.global.js` alone registers a styled pill (the VS Code path).
Visual probes in `project-docs/unified-export/verify/
probe-parity-500pct.png` / `probe-parity-pill-chip.png`. Full suite
green (3,855). `.vsix` builds; VS Code interactive verify is Ryan's
manual step (install + reload, wheel/drag/pill at 10%/2000%).

**Code-review round (2026-07-23):** two Warnings, both fixed —
(1) the corner-radius clip returned post-bake (review caught the flaw in
"obsolete under transform mode"; radius removed entirely + E2E pin);
(2) stale 0.25x–10x range in the published vscode-developer-experience
post (updated in place). During the fix pass an **eslint --fix
semantic rewrite** was discovered: it turned three
`visibility[...] === false` checks in svg-preview-pane into falsy
tests, hiding every layer/mask/clip on fresh workspaces (empty
visibility maps) — preview AND all exports went blank. Restored to
explicit `=== false` with an explanatory comment and a new E2E guard
(visible artwork layers in the modal snapshot). Lesson recorded:
never trust `--fix` output without a behavior diff — it rewrites
semantics, not just formatting. Also removed dead
`SvgPreviewPane.zoomIn/zoomOut`; crop-modal mid-gesture handle-size
flicker noted as cosmetic/self-healing (non-blocking).

# Zoom/Pan Surface Parity — Divergence Audit

**Date:** 2026-07-23
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

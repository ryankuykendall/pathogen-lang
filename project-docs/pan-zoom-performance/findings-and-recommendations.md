# Pan/Zoom Performance — Findings & Recommendations

**Workspace under investigation:** `experimenting-with-grids-and-cycling`
(`…/workspace/…--Uh_z743swVBf9ckijwKRL`)
**Date:** 2026-06-25
**Method:** Puppeteer harness `scripts/perf-pan-zoom-audit.ts` (`npm run perf:panzoom`)
driving the real `startPan`/`doPan`/wheel handlers and capturing a Chrome trace +
`page.metrics()`. Raw numbers in [`captured-metrics.md`](./captured-metrics.md).

---

## TL;DR

The jank is **raster/commit-bound, not JavaScript-bound.** Every pan/zoom step
changes the SVG `viewBox`, which forces Chrome to **re-rasterize the entire
drawing every frame**. The drawing is enormous: ~481 `<path>` elements carrying
**72.5 million characters of path data**. Re-rastering that costs ~270–310 ms per
frame; the main thread spends ~90% of its time blocked waiting on the compositor.

**The quick wins in the original plan (navigator rebuild, double-fire, rAF
batching) will not fix this.** They live in the Scripting/Layout budget, which is
<10% of frame time here. They remain defensible hygiene, but they are **not the
fix for this complaint** and should not be presented as such.

---

## Correction to the original premise

The exploration phase (and the approved plan) assumed the scene was **~422,000
`<circle>` DOM nodes**. That is wrong. In Pathogen, `circle()` *inside a
`PathLayer.apply` block* emits **path data**, not `<circle>` elements. So:

| Assumed | Actual (measured) |
|---|---|
| ~422,400 `<circle>` DOM nodes | **481 `<path>` nodes** (1 background + 480 drawing layers) |
| Cost = DOM node count | Cost = **path-data *volume*** (72.5M chars) → raster + path-op decode |

The 422k circles are still there — but as ~422k × 2 arc commands rendered at full
float precision *inside* 480 path `d` strings. The bottleneck is the sheer volume
of geometry the rasterizer must process, not the number of elements.

---

## Measured results (local repro, identical source)

Harness drove 60 pan frames and 60 zoom frames. Numbers are stable across runs.

| | local pan | local zoom |
|---|---:|---:|
| Wall time / frame | ~298 ms | ~256 ms |
| Longest main-thread task | 354 ms | 354 ms |
| **Verdict** | **PAINT/RASTER-bound** | **PAINT/RASTER-bound** |

Main-thread time (authoritative, from `page.metrics()`), pan scenario:

| Category | ms | % of task |
|---|---:|---:|
| Scripting | 138 | 0.8% |
| Layout | 1407 | 7.8% |
| Style | 127 | 0.7% |
| **Paint-record + commit-wait** | **16358** | **90.7%** |
| Total task | 18029 | 100% |

Off-main raster evidence (raw trace totals, pan scenario):

- `RasterTask`: **17,764 ms**
- `RasterCHROMIUM::Deserializing` (path-op stream decode): **10,558 ms**
- `LayerTreeHost::WaitForCommitCompletion` (main thread blocked on compositor): **16,027 ms**

Two independent instruments agree (~130× ratio of paint/raster to scripting), so
the verdict is not an artifact of trace parsing.

### Why the main thread is "busy" yet barely scripting

`page.metrics()` reports `TaskDuration ≈ 18 s` but `ScriptDuration ≈ 0.14 s`. The
~16 s gap is **paint recording + `WaitForCommitCompletion`** — the main thread
issues a frame, then blocks waiting for the compositor to finish rasterizing the
72.5M-char display list before it can proceed. That block *is* the jank.

---

## Prod baseline — limitation

The plan called for one prod baseline run against the live workspace. **It could
not be captured:** the workspace is private, so an anonymous Puppeteer session
gets `403 Access denied` from `GET /workspace/:id` and the page silently falls
back to the default demo scene (1 path). The local repro instead compiles the
**user's exact source**, so it reproduces the 72.5M-char volume and the
raster-bound profile faithfully by construction. To capture a true prod baseline
later, either temporarily make the workspace public and run
`npm run perf:panzoom -- --mode prod`, or run the harness with the owner's
session cookie.

---

## Recommendations

Split into **measured** (we have evidence the mechanism applies) and **candidate**
(plausible, but unproven for SVG-in-iframe and needs a prototype before we trust
it).

### A. Reduce path-data volume — *measured mechanism, cheapest lever*

Lowering decimal precision shrinks the geometry the rasterizer must decode. CLI
A/B on the identical source:

| Precision | Path-data chars | vs full |
|---|---:|---:|
| full (current) | 72,537,347 | — |
| `--to-fixed=2` | 31,646,584 | **−56%** |
| `--to-fixed=1` | 28,259,678 | **−61%** |

A 56–61% volume cut maps directly onto the `RasterCHROMIUM::Deserializing` cost
(10.6 s measured), which scales with command-string volume. This does **not**
reduce the pixel-fill portion of raster (same shapes), so expect it to help but
not eliminate the jank. The compiler already supports this (`--to-fixed=N`, store
`toFixed`); the open question is exposing/defaulting it in the editor. **Next
step to make this end-to-end-measured:** wire `toFixed` through the workspace and
re-run the harness for a before/after raster delta (the harness is built for
exactly this A/B).

### B. Decouple interaction from re-raster

The root cause is that **viewBox changes invalidate the whole raster every
frame**. Levers, in order of measured/expected leverage:

1. **CSS-`transform` pan/zoom instead of viewBox — *MEASURED, biggest win*.**
   The probe (`npm run perf:transform-probe`,
   `scripts/perf-transform-probe.ts`) drove the real loaded scene 30 frames each
   way, isolated from the component JS:

   | mechanism | wall | `RasterTask` | commit-wait |
   |---|---:|---:|---:|
   | viewBox mutation (status quo) | 4930 ms | 4915 ms | 4809 ms |
   | **CSS `transform: translate`** | **644 ms** | **200 ms** | 168 ms |
   | CSS `transform: translate + scale` | 925 ms | 413 ms | 433 ms |

   Despite the SVG-in-iframe caveat, `will-change: transform` + `transform`
   **does** get a composited layer here: pan (translate) is **~25× cheaper
   raster**, zoom (scale) **~12× cheaper**. This is the highest-leverage change.

   **Production design implied by the numbers:** during a gesture, hold the
   viewBox fixed and drive `transform` on the SVG; on gesture-end / idle, bake the
   transform back into the viewBox and clear it (one re-raster). Caveats not yet
   measured: (a) **zoom-in via scale is blurry** until the settle-time re-raster
   (GPU scales the cached texture); (b) when **already zoomed in**, the composited
   layer is rasterized at that zoom, so panning far enough to reveal un-rasterized
   area still re-rasters those tiles — the 25× win is strongest near fit-zoom.
   (c) reconciling transform with the navigator + pan clamping is real work. This
   is now a **build-it recommendation**, but a real feature, not a quick win.

2. **Raster-snapshot during interaction.** Rasterize the SVG to a bitmap
   (`<image>`/canvas) once, pan/zoom the cheap bitmap during the gesture, and
   re-render the vector on idle. Same family as (1) but explicit; cost is a
   blurry-while-dragging tradeoff. Consider if (1)'s high-zoom tile re-raster
   proves limiting.
3. **Geometry decimation / level-of-detail.** Above a path-data threshold, merge
   or simplify geometry (e.g. drop sub-pixel detail at low zoom, or merge the 480
   layers' arcs). Reduces both decode and pixel-fill cost — complements (1).

### C. Scripting hygiene — *implemented & measured; NOT the fix for this complaint*

These were real defects vs the cleaner `blog/mini-preview.ts` pattern. **Landed**
in `svg-preview-pane.ts`:

- Removed `zoomLevel/panX/panY` from the heavy `updateSvgStyles` subscription, so
  pan/zoom no longer rebuilds the navigator minimap (`navGroup.innerHTML=''` +
  re-query iframe + recreate elements + ancestor walk) or re-styles all 480 paths
  every frame. Pan/zoom now runs only the lightweight `updateViewBox` (viewBox
  attr + navigator viewport rect). This also eliminated the **double-fire**
  (`store.update` → subscription **and** a direct `updateViewBox` call).
- rAF-batched `mousemove`/`wheel`/navigator-drag via `requestViewBoxUpdate()`.
- Cached `getScreenCTM()` scale at pan start instead of reading (and forcing
  layout) on every `mousemove`.

**Measured impact (harness before → after, pan scenario on this workspace):**

| Main-thread category | before | after |
|---|---:|---:|
| Scripting | 138 ms | **6 ms** |
| Layout | 1407 ms | **8 ms** |
| Style | 127 ms | **6 ms** |
| Paint-record + commit-wait | 16358 ms | 18771 ms |
| Frame time | ~298 ms | ~309 ms |

The JS/Layout overhead is essentially gone — but **frame time is unchanged**,
because it was never the bottleneck. This is the empirical proof that the
scripting path was a red herring for *this* scene. The win is real for **small
scenes** (where it removes the per-frame navigator rebuild) and for code health.
Verified end-to-end: navigator content still renders (481 children) and is no
longer torn down on pan; pan/zoom still functions.

---

## Phase 1 implementation results (shared controller in svg-preview-pane)

The CSS-transform approach was built into a shared `PanZoomController`
(`src/ui/pan-zoom-controller.ts`, shipped as `dist/pan-zoom.global.js` →
`window.PathogenPanZoom`) and adopted in the workspace preview. Measured on the
72.5M-char scene (`npm run perf:panzoom`):

| | baseline (viewBox) | with controller |
|---|---:|---:|
| Pan frame time | ~298 ms | **~18 ms** (~16×) |
| Pan `RasterTask` | 17,764 ms | **59 ms** (~300×) |
| Zoom frame time | ~256 ms | **~18 ms** |
| Main-thread Scripting | 138 ms | 6 ms |

Two findings worth recording:

1. **The navigator minimap was a hidden second bottleneck.** It holds the full
   481 heavy paths; updating its viewport rect each frame re-rasterized all of
   them (raster stayed ~7.9 s even with the transform working). Fix: the viewport
   rect now lives in a **separate overlay SVG** stacked on the content SVG, and
   the content SVG is promoted to its own compositor layer
   (`transform: translateZ(0)`) so the overlay's per-frame repaint can't
   invalidate it. This took raster from ~7.9 s → ~59 ms. Any surface that has a
   navigator needs this same split.
2. **The bake seam is clean (verified).** A CDP screencast across the
   transform→viewBox handoff (frames bracketing the ~180 ms bake) shows the held
   view going crisp at the **same position** — no backward-jump flash. Chrome
   holds the last transformed frame until the new viewBox raster commits, so the
   atomic `setAttribute('viewBox') + clear transform` swap is seamless. No
   double-buffering needed.

**High-zoom panning reveals blank — bounded by a configurable re-baseline.** The
composited layer is only viewport-sized, so panning *far while zoomed in* moves it
past its rasterized bounds and would show blank. Characterized: **no blank at/near
fit zoom or with modest pans at ~2.5×**; it appears only on large/fast drags at
higher zoom. Mitigation (implemented): the controller's `rebaselineThreshold`
option (default **0.5** = half the viewport) bakes mid-gesture and re-anchors the
session once the live translate exceeds that fraction, so the new region
re-rasterizes crisply. Verified: a drag past the threshold fills (only a thin
leading sliver of blank); a drag under it stays cheap and fills on idle-bake. Each
surface can tune the fraction (lower → less blank, more mid-drag re-rasters; 0 →
pure transform, blank only fills on idle).

## Rollout status (all surfaces)

The shared controller is now adopted across every pan/zoom surface:

| Surface | Mode | Notes |
|---|---|---|
| Workspace preview (`svg-preview-pane.ts`) | transform | ~16× faster; navigator overlay-split |
| mini-preview (blog + BBWP `.mw.html`) | transform | + navigator overlay-split; Ctrl/Cmd wheel + scroll hint |
| VS Code preview webview (`preview.ts`) | transform | inline JS → `window.PathogenPanZoom`; bundle copied by `build-vscode-extension.ts`; nonce'd script; navigator overlay-split. Verified headless (compiles, pans/zooms, bakes); final interactive feel = `.vsix` reload |
| thumbnail-crop modal, export-legend modal | viewbox (math-only) | dedup `clampZoom`/`adjustPanForZoom`/`viewToViewBox` onto the shared functions; keep viewBox + crop/legend input handling (their crop/pan input flow conflicts with controller pan, so full adoption was intentionally not done) |

Touch/pinch is in the controller for all transform-mode surfaces. The configurable
`rebaselineThreshold` (default 0.5) bounds the high-zoom blank.

## Reproducing

```bash
npm run dev:stack                      # Pages :3000 + API :8787
npm run perf:panzoom -- --mode local --steps 60 --verbose
```

The harness creates a throwaway local workspace from
[`grids-and-cycling.pathogen`](./grids-and-cycling.pathogen), drives real
pan/wheel gestures, prints the per-scenario breakdown, writes
`captured-metrics.{md,json}`, and deletes the workspace. `--mode prod` targets the
live URL (requires the workspace be accessible to the session).

Precision A/B:

```bash
npm run cli -- --src=project-docs/pan-zoom-performance/grids-and-cycling.pathogen \
  --to-fixed=2 --output-svg-file=/tmp/out.svg   # compare byte size vs full precision
```

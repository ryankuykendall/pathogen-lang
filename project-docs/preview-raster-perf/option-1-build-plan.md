# Option 1: build plan

2026-11-16. Built from the v1 mockup (`website/bbwp/2026-11-16-11:17:18--preview-raster-perf--option-1-overlay-v1.bbwp.html`) and your answers on it.

## Your answers

| Question | Answer |
|---|---|
| 1. When the drawing moves | After the pane stops |
| 2. Ordinary drawings | Redraw once the pane stops (sharp, fitted to the gap) |
| 3. A kept picture in a wider gap (heavy drawings) | Keep it at its old size: never enlarge |
| 4. The preview's controls follow the gap | Yes, as mocked |
| 5. Room | As mocked for now: the console pushes the editor, and the gap absorbs every pane. A console "mole" is on the backlog (`project-docs/modules/backlog.md`) |

## Revised before building: the preview pane stays in the row

The first draft took the whole preview pane out of the row and put it under the panes: `z-index: -1` inside an isolated `playground-main`. Checking it against the code turned up a regression. The error panel floats over the editor's bottom at z-index 10, and today the editor's completion and hover popups open above it. Under an isolated `playground-main` they would open under it, while you type a fix.

So the pane stays where it is. The pane is the gap, and only its iframe is held still: the iframe is the full width of the workspace, at a fixed place on screen, and the pane shows the part of it that's in the gap.

Tried in the page first (`measure-overlay.ts … clip`) on the kablammo copy:
- no slow frame on Files, Console or Inspector;
- the one-time inspector freeze at 0.16 s;
- the drawing placed correctly from the start.

What this keeps as it is:
- the stacking (popups, menus, the error panel, fullscreen);
- the preview's controls, which are in the pane and so follow the gap with no change;
- the program chip's list, which fits the pane as now;
- the Tab order.

## Design

**Layout (`playground-main`, wide only: not below 800 px).**
- The editor has a fixed width, `flex: 0 1 calc((100% - 248px) / 2)`: its width today with the tree open and nothing else. It shrinks only when the panes don't fit.
- The console opens to 280 px.
- The preview pane is `flex: 1 1 0`, with no transition: it absorbs the panes.
- The inspector-open ratios (editor 2, preview 3) go.
- `playground-main` marks itself `data-preview-stage`: the box the preview's drawing is held to.

**The iframe (`svg-preview-pane`).**
- With a stage and outside fullscreen and the narrow layout, the iframe is `position: absolute`, the stage's width and the pane's height, offset left by the pane's distance from the stage's left edge.
- A `ResizeObserver` on the pane's container and on the stage moves the offset on every frame of a pane's slide, before paint. So the iframe never changes size and stays still on screen.
- The pane's `overflow: hidden` clips it to the gap.

**The drawing's box.**
- The iframe's `body` gets an inline `position: absolute; left; width` equal to the gap (`svg#preview` fills the body, as now).
- Pan, zoom and Fit measure the drawing's box, so they work against the gap with no change to their math.
- The `svg` element itself gets no new inline style, because export (`_prepareExportClone`) and thumbnails (`createSvgSnapshot`) clone it.

**When a pane moves.**
- 80 ms after the last resize report (the pane has stopped), the iframe's layer slides and scales to the new gap, 250 ms: `translateX` and `scale` about the drawn box's center.
- **Ordinary drawing:** then it's redrawn. The body takes the gap and the transform clears, in one frame.
- **Heavy drawing:** the scale is at most 1, and the moved picture stays until the next redraw.
- **The iframe changed size instead** (window resize, fullscreen): it's being redrawn anyway, so it's fitted straight to the gap with no move.

**When a heavy drawing is redrawn anyway**, the body takes the gap and the transform clears in the same frame. A redraw that lands during the 250 ms move cancels the move and fits straight to the gap. This covers:
- a compile (`setLayersWithTiming`; the first render is placed in the gap before it's drawn);
- the end of a pan or zoom gesture (the controller's `onBake`);
- a zoom button or Fit (`onChange` while no gesture is running);
- the store driving the view;
- entering or leaving fullscreen.

**Heavy or ordinary.**
- The time from a redraw to the second animation frame after it, measured after each redraw above.
- Over 100 ms is heavy, and the latest measurement wins. A drawing whose raster blocks frames shows it there; the analysis measured 1.5 to 1.9 s for kablammo-investigations and under a frame for two gears.

**Shared pan-zoom controller:** one addition, `isGestureActive()`: a drag, pinch or wheel session is running. It's needed so a zoom button's redraw can take the gap without disturbing a gesture. Rebuild with `npm run build` for `dist/pan-zoom.global.js`.

## Unchanged

- Below 800 px.
- Fullscreen.
- The blog viewer and the other previews (no stage).
- The DOM, the stacking and the Tab order.
- 100% still means Fit, now fitted to the gap.

## Steps

1. The controller's `isGestureActive()`, with a test. Run `npm run build`.
2. `playground/utils/preview-gap.ts`, with unit tests:
   - the move from the drawn box to the gap, never enlarging when heavy;
   - the heavy threshold.
3. `svg-preview-pane`: the stage, the held iframe, the body's box, the move, the redraw hooks, the timing.
4. `playground-main`: the wide-layout CSS and the stage mark.
5. Build (`npm run build:playground:dev`). Run the playground's type check and lint.
6. `verify-option-1.ts`, in full Chrome at 2x:
   - **heavy-filters:**
     - no slow frame on Files, Console and Inspector;
     - the moved picture at scale ≤ 1, centered in the gap;
     - a zoom step and a compile take the gap;
   - **two gears:** redrawn into the gap after the pane stops;
   - **the controls:** inside the gap;
   - **an export:** has no stage styles;
   - **fullscreen:** covers the page, and the gap comes back after it;
   - **below 800 px:** as before;
   - **the editor's completion popup:** over the error panel;
   - light and dark screenshots.
7. On the kablammo copy (now option 1, `measure-overlay.ts … built --repeat-inspector`):
   - the toggles;
   - the one-time inspector freeze;
   - the load: one raster, not two.
8. Re-run `verify-preview-layer.ts`. Check the storybook entries. Grep `docs/` for the preview narrowing. Then the full suite, a code review and a commit.

# Preview raster cost: why switching files and toggling Files were slow

2026-11-15. You reported, on `kablammo-investigations`:
- opening a file from the list, or switching tabs, took over 2 seconds;
- Files took about 5 seconds to open or close.

"Changing between files should be instantaneous."

## What the measurements showed

**The JavaScript is fast.** On a small workspace every action took 3 to 10 ms. On a copy of `kablammo-investigations` the main thread stayed nearly idle (`profile-workspace.ts`, CPU profiles in headless Chrome).

**The time is the GPU redrawing the drawing.** In full Chrome at 2x pixels, a laptop's screen, a tab switch painted one frame of about 1.9 s, and a Files toggle four or five such frames.
- The traces (`trace-summary.ts`) put nearly all of it in raster on the GPU: about 1.1 s for the tab switch and 4.2 s for the toggle.
- The main thread had under 0.5 s in total.

**This drawing is about the most expensive kind to rasterize.** It makes several thousand path layers, each glyph contour times 42 halos, and every layer has `filter: drop-shadow(...)`. Each glyph layer also has `blur()`.

**Two different causes:**
- **Tab switches:** the preview's iframe had no compositing layer of its own. Its drawing was rasterized together with the page, so any repaint around it rasterized it again: the tabs, the breadcrumb's file name, the program chip. The trace shows the main page repainted, and no paint inside the preview's own frame.
- **Files, Console and Inspector:** each animates the panes' widths (0.2 to 0.3 s), so the preview changes size on every frame. The drawing fills the preview (`width: 100%`, viewBox `meet`), so every frame redraws it at a new scale.

Pan and zoom were already handled: during a gesture the drawing moves as a bitmap (a CSS transform), and it's redrawn once when the gesture ends (`src/ui/pan-zoom-controller.ts`).

## What changed

**The preview's iframe has its own compositing layer:** `will-change: transform`, set in `bootstrapPreviewIframe` (`playground/utils/preview-iframe.ts`). That covers the workspace's preview and the blog viewer's. The drawing is rasterized only when it changes, or when the preview changes size.

## The numbers

`measure-toggles.ts`, on a copy of `kablammo-investigations`: how long the page stays busy after each action, at 2x pixels in full Chrome.

| Action | As built | With the layer | Layer, panes don't animate | Layer, preview keeps its width |
|---|---|---|---|---|
| Tab switch | 1.9 s | **0** | 0 | 0 |
| Files on or off | 8.2–8.4 s | 7.7–7.9 s | 1.9 s | **0** |
| Console on or off | 2.0 s | 2.0 s | 1.9 s | **0** |
| Inspector on or off | 6.9–8.1 s | 7.1–7.8 s | 1.9 s | **0** |
| Docs on or off | 0 | 0 | 0 | 0 |

`heavy-filters.pathogen` (1,521 drop-shadow layers, here, so it's reproducible without your workspace) is about five times cheaper, with the same pattern. A tab switch is 0.35 s without the layer and none with it; Files is about 1.5 s either way.

## Still open: the toggles that resize the preview (your call)

Each option is measured above. The animation was approved with the mockups, so it isn't changed without you.
1. **The preview keeps its width.** The tree, the console and the inspector take their room from the editor. Every toggle is instant, but the editor and the preview no longer split the room evenly while a panel is open.
2. **The panes don't animate.** One redraw per toggle: about 1.9 s for this drawing, against 7 to 8 s now.
3. **The drawing keeps its scale when the preview resizes.** More or less of the canvas shows around it, and it's redrawn once afterwards, as a pan or zoom is. It's a larger change to the pan-zoom model, shared with the other previews. Not measured.
4. **As now.** Heavy drawings make toggles slow.

## 2026-11-16: the preview behind the panes (your proposal)

Your proposal:
- the preview spans the whole workspace under the headers;
- the tree, the editor, the console and the inspector sit on top of it;
- when a pane opens or closes, the drawing moves once to the middle of the space the panes leave (the gap).

`measure-overlay.ts` tries this in the page by injecting CSS, with no code changed. It runs on the same copy of `kablammo-investigations`, in full Chrome at 2x. The drawing moves once each pane has finished moving (0.35 s), in one of three ways. The table gives the longest frame after each action, which is the time the page is frozen.

| Action | Re-fit the drawing to the gap | Slide the preview's layer | Slide and scale the layer |
|---|---|---|---|
| Files on or off | 1.45–1.63 s | **0** | **0** |
| Inspector on or off | 1.75–1.77 s | 0.2–0.3 s * | 0.2 s * |
| Console on or off | 1.70–1.82 s | **0** | **0** |
| One raster (a 2% zoom step, which every edit and pan already costs) | 1.47–1.95 s | 1.47–1.95 s | 1.53–1.87 s |

\* Only when the inspector closes, before the drawing moves. This is the inspector's own work: it lists 7,005 layers here. It shows in every mode.

The heavy drawing behaves the same way: a re-fit costs one stall of 0.1 to 0.3 s, and sliding costs none.

**What this shows:**
- **The panes moving over the preview cost nothing.** The preview has its own layer and keeps its size, so the browser draws the panes over pixels it already has.
- **Changing the drawing's size inside its layer is what costs.** Re-fitting it once (the "one repaint") is one full raster: 1.5 to 1.9 s for this drawing. That is the same as option 2, "the panes don't animate".
- **Moving or scaling the whole layer is free.** The browser reuses the pixels it has.
  - **Slide only:** the drawing keeps its size, so a narrower gap hides its edges under the panes.
  - **Slide and scale:** the drawing fits the gap at once. When the scaling enlarges it, it looks soft until the next edit, pan or zoom redraws it, and those redraw it anyway. Never enlarging beyond the size it was drawn at would keep it sharp; it would then fill a wider gap only at the next redraw.

**What the layout would also need:**
- **Fit and pan:** Fit, and the pointer math of pan and zoom, use the drawing's own box. They would have to use the gap instead. That is a change to the shared pan-zoom controller, which the blog viewer and VS Code also use.
- **The preview's controls** (the zoom pill, the layers button, Snapshot, Export, fullscreen) are placed inside the preview pane, so they would have to follow the gap. Fullscreen still covers everything.
- **Below 800 px the panes stack,** so this applies to the wide layout only.

**A flaw in the setup:** on the kablammo copy, the drawing was first placed in a 340 px gap instead of 593 px. When the gap was measured, something on the left reached 1,099 px. I haven't chased the cause. Moving a layer costs the same at any size, so the costs stand. The scale factors in the screenshots are larger than they would be.

## Files

- `heavy-filters.pathogen`: the generated heavy drawing.
- `verify-preview-layer.ts`: the regression check (15 checks, full Chrome at 2x):
  - the layer;
  - no slow frame on opening or switching files, or copying;
  - the slow frame back without the layer, so the check can fail;
  - the controls over the drawing on top of it, fullscreen included;
  - a pan baking into the viewBox;
  - a blog embed.
- `measure-toggles.ts`: the table above, for any workspace or the heavy drawing, and any candidate fix.
- `measure-overlay.ts`: the overlay layout (2026-11-16), with the drawing re-fitted, slid, or slid and scaled.
- `trace-summary.ts`: where a Chrome trace's time goes, by thread and event, and what painted.
- `preview-layer-light.png`, `preview-layer-dark.png`: the heavy drawing with the controls over it.
- `tests/playground-preview-iframe.test.ts`: the layer, for both kinds of preview.

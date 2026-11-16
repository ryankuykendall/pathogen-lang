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
- `trace-summary.ts`: where a Chrome trace's time goes, by thread and event, and what painted.
- `preview-layer-light.png`, `preview-layer-dark.png`: the heavy drawing with the controls over it.
- `tests/playground-preview-iframe.test.ts`: the layer, for both kinds of preview.

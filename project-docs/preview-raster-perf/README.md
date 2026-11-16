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

*Settled 2026-11-16: you chose option 1, built as described in "Option 1, built" below.*

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

\* Once, on the first inspector toggle after the drawing was last redrawn, and before the drawing moves; it shows in every mode. A first version of this note blamed the inspector's list of 7,005 layers. That was wrong: see "The inspector's one-time freeze" below.

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

### The inspector's one-time freeze

You asked whether hiding the inspector's contents (`display: none`) before it closes would remove its 0.2–0.3 s. It doesn't. The layer list is virtualized (only the rows in view exist), so the number of layers doesn't matter, and the freeze is the browser redrawing part of the drawing. Each variant was measured on the first close, slide and scale mode, kablammo copy (`measure-overlay.ts` flags):

| Variant | First close |
|---|---|
| As measured (five runs) | 0.21–0.31 s |
| The inspector's contents hidden while closed (`--hide-inspector`) | 0.36 s |
| The page's grain texture off (`--no-grain`) | 0.17 s |
| The preview's layers button kept hidden (`--no-inspector-btn`) | 0.28 s |
| **The drawing hidden** (`--hide-drawing`) | **0** |
| Closes 2 to 4 (`--repeat-inspector`) | **0** |

It happens once, on the first inspector toggle after the drawing was last redrawn (here the zoom steps). When the inspector was toggled before anything else (`--inspector-only`), the first open paid it (0.23 s) and every close was free. A trace puts it on the GPU, with the main thread idle. Which part of the drawing is redrawn, and why, isn't pinned down: Chrome's tile details need a trace category these runs didn't record. To check when building option 1, with a regression check.

### The grain texture (theme.css `body::before`)

You asked whether turning off the site's grain texture in the workspace would help. It makes no measurable difference: the browser draws it once and reuses it.

| Measured (full Chrome, 2x) | Grain on | Grain off |
|---|---|---|
| Two gears (`light`), today's layout: slow frames over 8 toggles | 0 | 0 |
| Two gears: GPU busy, opening the inspector (about 2 s traced) | 42 ms | 35 ms |
| Two gears: GPU busy, closing it | 28 ms | 31 ms |
| kablammo copy, option 1 layout: the inspector's one-time freeze | 0.21–0.31 s (5 runs) | 0.17, 0.23 s (2 runs) |

In the workspace the grain shows only in the top nav and the breadcrumb bar. In light mode it also darkens them, so turning it off lightens them. `shoot-grain.ts` captures the app with it on and off for the comparison mockup (`website/bbwp/2026-11-16-11:12:44--preview-raster-perf--grain-off-workspace.bbwp.html`).

**A flaw in the setup:** on the kablammo copy, the drawing was first placed in a 340 px gap instead of 593 px. When the gap was measured, something on the left reached 1,099 px. I haven't chased the cause. Moving a layer costs the same at any size, so the costs stand. The scale factors in the screenshots are larger than they would be.

## 2026-11-16: option 1, built

You chose option 1 and answered the mockup's five questions (`option-1-build-plan.md` has the answers and the design). It's built a little differently from the mockup.
- **The preview pane stays in the row as the gap.** Only its iframe is held at the row's full width, still on screen, and the pane shows the part of it in the gap.
- **Why:** taking the whole pane out of the row would have needed a stacking context around the panes, and the editor's popups would then open under the error panel. The plan has the details.
- **What it looks like:** the same as the mockup. The panes slide; once they stop, the drawing moves to the middle of the gap. An ordinary drawing is then redrawn there, sharp. A heavy one keeps the moved picture, never enlarged, until an edit, a pan or a zoom redraws it in the gap.
- **Which drawings are heavy:** a drawing is heavy when one of its last three redraws held frames back for over 100 ms.

On the kablammo copy, as built (`measure-overlay.ts … built --repeat-inspector`), full Chrome at 2x:

| Action | Before option 1 | Option 1 |
|---|---|---|
| Files on or off | 7.7–7.9 s | **0** |
| Console on or off | 2.0 s | **0** |
| Inspector on or off | 7.1–7.8 s | **0**, except 0.17 s once, on the first close after a redraw |
| Tab switch, opening a file | 0 (since c3b63c8) | 0 |
| An edit, a pan, a zoom | 1.5–1.9 s | 1.5–1.9 s (the drawing itself) |

The one-time inspector freeze is the same one measured above. Its cause still isn't pinned down.

**Narrow windows, your call.** The editor keeps half the room the tree leaves, so with the tree, the console and the inspector all open the preview runs out of room on a smaller window (`measure-gap-widths.ts`, preview pane's width):

| Window | Tree and inspector | Tree, console and inspector |
|---|---|---|
| 1024 px | 145 px | **0** (the editor shrinks to 254) |
| 1280 px | 273 px | **0** (the editor shrinks to 510) |
| 1440 px | 353 px | 73 px |
| 1680 px | 473 px | 193 px |

The mockup's 72 px was at 1280 px with a 440 px editor. Built, the editor is 516 px at that width.

**Checks:**
- **`verify-option-1.ts`**, 23 checks with `heavy-filters.pathogen` and a light two-gear workspace (the 23rd, added after the commit: with reduced motion the drawing jumps to the gap instead of sliding):
  - the held iframe and the body's box, with the drawing centered in the gap;
  - loading draws once;
  - Files and Console, no slow frame;
  - the picture shrinks or slides, never enlarged;
  - a zoom step and a compile take the gap;
  - a light drawing is redrawn in the gap;
  - the controls and the program list stay in the gap;
  - fullscreen, and leaving it;
  - below 800 px;
  - no stacking context added;
  - light and dark screenshots (`option-1-light.png`, `option-1-dark.png`).
- **`verify-preview-layer.ts`**, 15 checks, still passing. Its pan now drags in the middle of the pane rather than of the iframe. Its record of the Files and Console toggles is now 0, against about 1.5 s with `heavy-filters.pathogen` before. Its screenshots were taken again, so they show option 1.

## Files

- `heavy-filters.pathogen`: the generated heavy drawing.
- `option-1-build-plan.md`: your answers on the option 1 mockup, the design as built, and why it changed before building.
- `verify-option-1.ts`: option 1's checks (23, full Chrome at 2x).
- `measure-gap-widths.ts`: the preview's width at several window widths, with the panes open.
- `verify-preview-layer.ts`: the regression check (15 checks, full Chrome at 2x):
  - the layer;
  - no slow frame on opening or switching files, or copying;
  - the slow frame back without the layer, so the check can fail;
  - the controls over the drawing on top of it, fullscreen included;
  - a pan baking into the viewBox;
  - a blog embed.
- `measure-toggles.ts`: the table above, for any workspace or the heavy drawing, and any candidate fix.
- `measure-overlay.ts`: the overlay layout (2026-11-16), with the drawing re-fitted, slid, or slid and scaled.
- `shoot-grain.ts`: screenshots of the app with the grain texture on and off.
- Mockups (in `website/bbwp/`, not committed):
  - `2026-11-16-11:12:44--preview-raster-perf--grain-off-workspace.bbwp.html`: the grain on and off.
  - `2026-11-16-11:17:18--preview-raster-perf--option-1-overlay-v1.bbwp.html`: option 1, interactive, with today's layout for comparison and five open questions.
- `trace-summary.ts`: where a Chrome trace's time goes, by thread and event, and what painted.
- `preview-layer-light.png`, `preview-layer-dark.png`: the heavy drawing with the controls over it.
- `tests/playground-preview-iframe.test.ts`: the layer, for both kinds of preview.

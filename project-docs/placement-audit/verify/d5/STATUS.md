# D5 / ISSUE-027 — conic gradient vs the viewBox origin · verified 2026-09-26

**Program:** `conic-origin.pathogen` — a three-stop wheel centred at `(0, 0)` inside
`define ViewBox(-100, -100, 200, 200)`. **Control:** `conic-origin-control.pathogen`, the same
wheel at `(100, 100)` inside `0 0 200 200`; the two must render identically.

## The rule that fixed it

`resolveConicPlacement` (`src/conic-param.ts`) is **tile-local**: SVG draws `<pattern>` content
in the tile's own coordinates (top-left = `(0, 0)`) and the playground's rasters cover the same
tile, so every renderer subtracts the viewBox origin from the centre and only the `<pattern>`
is placed at the origin. The first cut placed the tile but left the wedges in user space; the
CLI PNG showed one quadrant of the wheel anchored at the corner (the raster paths were already
tile-local, which is why WebGPU and Canvas 2D agreed with each other and not with the wedges).

## Renders (400×400, scale 2)

| File | Surface | How |
|---|---|---|
| `cli-wedges.png` / `.svg` | CLI, VS Code preview, library — wedge paths | `npx tsx src/cli.ts … --output-svg-file … --png … --scale=2` |
| `cli-wedges-control.png` | the control through the same path | same |
| `webgpu.png` / `.svg` | playground WebGPU shader, headless | `… --render-gpu --viewBox="-100 -100 200 200" --width=200 --height=200 --scale=2` |
| `canvas2d.png` / `.svg` | playground Canvas 2D fallback, headless | same, `PATHOGEN_GPU=off` |
| `playground-gpu.png` | the **live** playground's raster (dev stack on :3000), pulled from the preview DOM | `node verify-playground.mjs` |
| `playground-canvas2d.png` | the live playground with `?gpu=off` + `localStorage.pathogenForceCanvas2D` | same |

Every SVG carries `<pattern id="g" x="-100" y="-100" width="200" height="200" …>`, and the live
preview's `<pattern>` reads the same (`verify-playground.mjs` prints it for both modes).

## Measurements (`compare-png.mjs`: a ring of radius 60 units, 5° steps; premultiplied channels)

| Pair | mean | p95 | max (of 255) |
|---|---|---|---|
| CLI wedges vs control (`0 0 200 200`) | 0.0 | 0 | 0 |
| CLI wedges vs headless WebGPU | 0.2 | 1 | 1 |
| CLI wedges vs headless Canvas 2D | 0.0 | 0 | 0 |
| live playground GPU vs headless WebGPU | 0.0 | 0 | 0 |
| live playground Canvas 2D vs headless Canvas 2D | 0.0 | 0 | 0 |
| live playground GPU vs CLI wedges | 0.2 | 1 | 1 |

Before the tile-local restructure, CLI wedges vs everything else was mean 69.5 / p95 178.

## Regression: the committed `project-docs/conic-parity/` renders (`0 0 900 600`)

Re-rendered through all three paths into a scratch directory and compared with the committed
files: `cli-wedges.svg` byte-identical; `cli-wedges.png`, `webgpu.png`, `canvas2d.png` all
mean 0.0 / max 0. A zero origin is the identity for the new rule.

## VS Code

No source change — `preview.ts` calls `buildSvgTree`, which now passes the origin to the defs.
The `.vsix` was rebuilt (`npm run build` → `npm run build:vscode`) so its bundled compiler
carries the fix; the bundle was grepped for `resolveConicPlacement`.

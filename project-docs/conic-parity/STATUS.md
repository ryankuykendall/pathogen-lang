# Conic gradient parity (ISSUE-017) — 2026-09-12

Evidence for the fix that makes `from` / `to` / `direction` / `spread` /
`innerRadius` / `innerFill` render the same on all three surfaces, and for
the regression that blanked conic gradients above 32768-unit viewBoxes.

## Fixture

`conic-parity.pathogen` — six 300×300 tiles, one gradient each, same three
OKLCh stops:

| Tile | Gradient | Exercises |
|---|---|---|
| 1 | `full-turn` | full sweep, `cw`, default `clamp` |
| 2 | `quarter-transparent` | `from −0.25π` → `0.25π`, `spread: transparent` |
| 3 | `quarter-clamp` | same sweep, `clamp` (gap takes the last stop) |
| 4 | `quarter-repeat` | same sweep, `repeat` (four tiles of the ramp) |
| 5 | `ccw-hole` | `0` → `π`, `direction: ccw` (arc mirrored to the top half), `innerRadius 60` hard hole |
| 6 | `blended-center` | full sweep, `innerRadius 90`, custom-color `innerFill` (smoothstep blend) |

## Renders (900×600, scale 1)

| File | Surface | Command |
|---|---|---|
| `cli-wedges.png` / `.svg` | CLI, VS Code preview, library — 1° wedge paths from `src/conic-renderer.ts` | `npx tsx src/cli.ts project-docs/conic-parity/conic-parity.pathogen --output-svg-file … --png … --scale=1` |
| `webgpu.png` | Playground WebGPU shader (reference) via headless Chrome | `… --render-gpu --scale=1 --viewBox="0 0 900 600" --width=900 --height=600` |
| `canvas2d.png` | Playground Canvas 2D fallback (draws the same wedges through Path2D) | same, with `PATHOGEN_GPU=off` |

All three agree tile for tile. Measured (`npx tsx scripts/debug-compile-cancel-and-conic.ts --only 5`,
1,440 sampled pixels on rings of radius 100 around each tile center,
premultiplied channel differences out of 255):

| Pair | mean | p95 | max |
|---|---|---|---|
| WebGPU vs CLI wedges | 0.1 | 1 | 2 |
| WebGPU vs Canvas 2D | 0.1 | 1 | 2 |
| CLI wedges vs Canvas 2D | 0.0 | 0 | 2 |

Two things had to change to get there, both found by review/measurement
rather than by eye:

- **Mixing space.** The shader's stop colors are canvas bytes uploaded as-is
  (the helper feeding it was misnamed `cssColorToLinearRGBA`; it never
  linearized), so the shader mixes gamma-encoded sRGB like CSS gradients do.
  The wedge renderer first mixed in linear light (WebGPU vs CLI mean 7.5,
  p95 43); it now mixes gamma-encoded sRGB with 8-bit-quantized inputs.
- **Seams.** The SVG wedges rasterized with faint lines between adjacent
  slices (anti-aliasing conflation), still mean 4.1 / p95 24 after a 0.1-step
  overlap; a 0.6-step overlap with the final wedge kept exact brought it to
  the table above and removed the moiré visible in the earlier render.

Note: `--render-gpu` sizes the page from `--viewBox`/`--width`/`--height`,
not from `define ViewBox` (pre-existing; the plain CLI path reads the
compiled viewBox).

## Regression

`wide-viewbox-regression.pathogen` — a 48000×18600 viewBox with a wheel
using `innerRadius` and `spread: 'transparent'`, the shape of the user
program from `project-docs/glyph-halo-diagnosis/`. Before the fix the GPU
path asked for a 12000-wide texture (0.25 floor in `clampScale`), Dawn
rejected it silently, and a transparent PNG was cached. After the fix
(`--render-gpu --scale=2`) the embedded raster is **16384×6349, 8.2 MB PNG**
with the wheel painted — `wide-viewbox-regression-raster-downscaled.png` is
that raster reduced to 900 px wide.

## What changed (see CHANGELOG)

- `src/conic-param.ts` (new): port of the shader's angle → `t` and inner-fill
  rules; `src/conic-renderer.ts` rewritten on top of it (annular sectors,
  overlay / mask for blended inner fills, gamma-sRGB mixing, 0.6-step wedge
  overlap, spread over the full circle, ccw by angle reflection);
  `src/render/build-defs.ts` emits the sibling `<radialGradient>` / `<mask>` defs.
- `playground/gpu/raster-size.ts` (new, no floor), `gpu-error-scopes.ts`
  (new), `webgpu-device.ts` (adapter limits ≤ 16384, `uncapturederror`
  logger), `texture-cache.ts` (path + post-clamp size in the key),
  `gradient-service.ts` (one `renderFamily`, error-scoped renders, Canvas 2D
  conic draws the shared wedges, notices → Pathogen console, `?gpu=off`),
  `decorate-conic-gradients.ts` (uses the shared fallback).
- `docs/gradients.md` rendering sections; `docs/cli.md` `PATHOGEN_GPU=off`.

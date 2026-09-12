# Glyph-halo diagnosis (2026-09-09 → 2026-09-11)

Diagnosis of a user workspace program (Syriac glyphs → extruded/filleted
contours → variable-offset halos → dashed → per-dash `compoundVariableOffset`
ribbons) that sat at `Compiling… 25:00` in the playground and had earlier
crashed the tab. No project code was changed in this effort; the findings that
need code are logged as ISSUE-015 … ISSUE-020 in `../known-issues.md`.

Layout: `programs/` (the program at each stage, with a local stand-in font),
`probes/` (small runnable measurements, see its README), `results/` (timings,
peak memory, and the placement crop).

## 1. The 25-minute compile

The compiler was not slow on the program. Measured with the CLI via stdin
(`npx tsx src/cli.ts - --print-logs < …`), `Baumans` + `Bogus` standing in for
Idiqlat/Noto Sans Syriac + the Syriac text (the CLI cannot fetch Google
Fonts; `fonts/` is resolved from the cwd for stdin input):

| Variant (`programs/`) | dashes | wall | SVG | peak RSS |
|---|---|---|---|---|
| 01 as written | 30,481 | 14.9 s | 126 MB | 1.39 GB |
| 02 dash unit floored at 3, peak bounded, 6 stops | 13,378 | 9.8 s | 21.6 MB | 538 MB |
| 03 dash unit floored at 6, peak bounded, 6 stops | 4,065 | 4.4 s | 6.6 MB | 281 MB |
| 04 + anchor-based placement, 72..60 range, clamped peak | 5,015 | 4.5 s | 8.5 MB | 346 MB |

Root causes in the program:

1. **Dash period collapsed below one unit.** `haloOffset = (gIndex+1) * offsetBase * 0.12`
   bottomed out at 0.12 and the dasharray summed to ~7× that, so the smallest
   halos (1,000–3,700 units of perimeter) produced up to 6,903 dashes each.
   The previous version of the program (`zzzoom-test.pathogen` at the repo
   root) never had a period under 11 units.
2. **`peak = 6 + hIndex * 3` was unbounded** — with thousands of dashes per
   halo the envelope reached 3,000–20,000 units, slabs larger than the viewBox.
   Compile cost was unaffected (offset magnitude is two multiply-adds per
   stop; `probes/per-dash-offset-cost.pathogen`), the picture and the paint
   cost were.
3. **17 envelope stops per dash** → ~37 commands per ribbon; 6 is visually
   equivalent at dash scale.

Per-call costs measured: ~1 ms per dash through `compoundVariableOffset`
(17 stops + tapered caps), independent of peak; ~0.5 s per halo build + dash.
The output *volume* (126 MB of `d`, ~1.1 M commands, 1.4 GB heap) is what the
browser could not absorb, not CPU time.

Browser-side amplifiers (from code reading, not profiled in Chrome):

- `compiler-worker.ts` never cancels: each edit during a long compile queues
  another full compile; stale results are discarded only after being computed
  and cloned; no timeout. The `Compiling…` chip spans only the worker
  round-trip, so a long chip time is always the worker. (ISSUE-016)
- First compile of a Google Font whose primary slice lacks the glyphs runs
  the whole compile twice (`resolveMissingGlyphSubsets`).
- Main thread holds four copies of every `d` (store, preview DOM, minimap,
  idle export-size clone) and forces `getBBox()` per path.
- Evaluator retains per-fragment `records` per layer with `trace` off. (ISSUE-018)
- Conic gradient: one 8192×5461 raster per gradient change + synchronous
  `toDataURL` on the main thread (~1–2 s). Contributor, not the cause.

**Correction recorded on 2026-09-10:** an earlier claim that "a Chrome worker
has a much smaller heap than Node" was unsupported. Measured: Chrome 152
default `jsHeapSizeLimit` 3,586 MB vs Node 24 default 4,288 MB on a 32 GB
Mac. `--js-flags=--max-old-space-size` is honoured only downward in Chrome
(pointer-compression cage); Node's flag is unbounded
(`probes/chrome-heap-limit.mjs`). A single 1.4 GB compile fits in either.

## 2. `<path> attribute d: Expected moveto` on every halo-stroke layer

After the tweaks, every `pl-N-halo-stroke` layer began with `c`. Cause is
documented behaviour (`docs/variable-offset.md`, "Placement — origin
normalization and `anchor`"): `variableOffset` / `compoundVariableOffset`
return a block normalized to its own first point and carry the removed
translation as `anchor`. Dash pieces keep halo-space placement via a leading
`m`; the ribbon built from a piece drops it. So `dashStroke.draw()` as the
first command of the layer (a) emitted `c …` with no moveto — invalid SVG,
layer invisible, error logged twice (mount + minimap) — and (b) would have
stacked every ribbon at the cursor. Fix, verified (`programs/04`, crop in
`results/`):

```
dashStroke.drawTo(calc(leftOffset + dashStroke.anchor.x), calc(topOffset + dashStroke.anchor.y));
```

Transform matrix on a positioned piece (`probes/transform-origin-matrix.pathogen`):

| Keeps the leading `m` | Re-origins at 0,0 |
|---|---|
| `outline()`, `scale()`, `fillet()` | `offset()`, `variableOffset()`, `compoundVariableOffset()`, `subPath()`, `reverse()` |

`compoundVariableOffset` is not available on `ProjectedPath` (ISSUE-019), so
`halo.project(…).dash(…)` is not a route. A layer with no leading moveto is a
silent failure on all three surfaces (ISSUE-015).

## 3. `angleProximity` lighting weight

The function is a correct circular distance (0 at the reference, 1 half a
turn away; the double modulo makes it immune to the atan2 range). Three
findings (`probes/angle-proximity-vs-shade.pathogen`,
`probes/angle-convention-and-winding.pathogen`):

1. With reference `0.25pi`, `0.75pi` and `1.75pi` both score 0.5 — the two
   poles the user cared about were indistinguishable. Intended reference was
   `-0.25pi` (== `1.75pi`), which the user confirmed.
2. The lerp pair (`outerPeakMax` up, `innerPeakMin` down) keeps expected
   total thickness constant (0.14 at every score) and shifts the bulge
   outward on the shadow side. The user chose to keep that (displaced-shadow
   look) rather than a thicker stroke.
3. `tangent(t).angle` is atan2 in (−π, π], but `normal(t).angle` was that
   value minus a quarter turn with no re-wrap, so it spanned (−1.5π, 0.5π]
   (up = −0.5π, left = −π, bottom-left = −1.25π; measured 2026-09-12, first
   reported here as "[−π, π]" and corrected). **Fixed the same day
   (ISSUE-020):** the normal is now wrapped into (−π, π] like the tangent
   (bottom-left = 0.75π, exactly left = +π). The halo builder's
   `case 1.2pi..<1.8pi` never matched and still cannot — nothing exceeds π
   under either convention; the preserved programs in `programs/` keep that
   arm as the historical record, the live spelling for up-facing normals is
   `case -0.8pi..<-0.2pi`. Diagrams: `normal-angle-and-winding.pathogen`
   (pre-fix record, bbwp `2026-09-12-07:44:13--…`) and
   `normal-angle-and-winding-after-issue-020.pathogen` (current behaviour).

Conventions measured: y-down, so the `0.75pi` direction is bottom-left and
`1.75pi` top-right — consistent with "heavier away from a top-right light"
(note `normal(t)` reports the bottom-left direction as −1.25π; periodic
formulas don't care). Outer
TrueType contours are clockwise on screen; their normals and positive offsets
point outward. Counters are inverted: the hole of an `O` has inward normals
and a +20 offset collapses it to a small interior blob (shading flips there).

`.length` is not expensive: 2,000 calls on a halo or contour, or 20 passes
over all pieces, are indistinguishable from `boundingBox()` (all ~0.49 s;
`probes/length-vs-bbox-cost.pathogen`). The bbox "hack" stand-ins in the
program can be replaced when convenient.

## Follow-ups (registered in `../known-issues.md`)

Fixed 2026-09-12 (see CHANGELOG, `../conic-parity/`, `scripts/debug-compile-cancel-and-conic.ts`):

- ISSUE-016 compile worker cancel (Cancel control + cancel-on-supersede; main-thread copies not addressed)
- ISSUE-017 conic `innerRadius` / `spread` parity, the >32768-unit blank-render regression, GPU limits, docs, tests
- the export-modal `willReadFrequently` readback warning

- ISSUE-020 `normal(t).angle` wrapped into (−π, π); ranges documented

Still open:

- ISSUE-015 leading-moveto silent failure (warning + `M 0 0` prepend)
- ISSUE-018 output budget warning, `records` retention, loop-cap mismatch
- ISSUE-019 `variableOffset` family on `ProjectedPath`; transform-origin docs

## Techniques worth reusing

- Measure without files: `npx tsx src/cli.ts - --print-logs --stroke=none <<'EOF' … EOF`;
  `/usr/bin/time -l` for peak RSS; `log(x.length)`, `log(pieces.length)`,
  `log(block.commands.length)`.
- Stand-in font for Google-Fonts programs: `@font 'Baumans'` (one-level
  `fonts/Baumans/Baumans-Regular.ttf`, weight 400).
- Huge viewBox PNG when `--png` fails (`Unable to capture screenshot`):
  `qlmanage -t -s 8000 -o . file.svg` then `sips --cropOffset y x --cropToHeightWidth h w`.
- Default CLI output is one `[layer] d` line per layer — `grep -v '^\[[^]]*\] [Mm] '`
  finds layers with no leading moveto.

## 4. Console review of the 48000×18600 Noto Sans Takri workspace (2026-09-12)

- **WebGPU errors (`Texture size … exceeded`, `Could not create the swapchain
  texture`, `IOSurface width (12000) exceeds`, `[Invalid Texture] …`)**: the
  0.25 floor in `clampScale()` overrides the 8192 cap once the viewBox's long
  edge exceeds 32768 units; the errors are uncaptured, nothing throws, the
  Canvas 2D fallback never runs, and a transparent PNG is cached — the
  `wheel` fill renders as nothing (only strokes). Recorded under ISSUE-017
  with the immediate fix.
- **`Compile time: 114 s … 382 s`**: worker round-trips; edits during a
  compile queue behind it and the later compile's logged time includes the
  wait (ISSUE-016). Scale: 430 code points × contours × `64..1` halos → tens
  of thousands of halos and up to two layers each; SVG estimate 54 MB.
- **`[Violation] requestIdleCallback took …`** ×10: the idle export-size
  estimate cloning + serializing the 54 MB SVG. **`setTimeout … thumbnail-service`**:
  thumbnail rasterization. **`Canvas2D … willReadFrequently`** (export-modal):
  a readback canvas created without the hint — one-line fix. Expected on a
  program this size; none of them change the picture.
- **`link preload … not used`** ×31: the playground itself preloads only the
  icon sprite; these come from the page host, unrelated to the program.
- Fillet warnings ×2,984 / ×2,497: benign (radius 16 on short extrusion edges).


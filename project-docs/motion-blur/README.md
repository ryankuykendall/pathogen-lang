# MotionBlurFilter

Internal primer for the `MotionBlurFilter()` feature — directional and progressive
blur synthesized from SVG filter primitives, inspired by the CSS
[`motion-blur` proposal](https://github.com/w3c/csswg-drafts/issues/11134) (which no
browser implements). Shipped as the seventh custom filter constructor. User-facing
docs live in `docs/filters.md`; this folder is the internal paper trail.

## Feasibility findings

The CSS proposal lists four blur types. We assessed all of them against what SVG
filter primitives can actually express (no scale, no rotate, only
position-independent `feOffset` translation):

| Type | Verdict | Mechanism |
|------|---------|-----------|
| **Linear (directional)** | ✅ Shipped | N centered `feOffset` taps along `angle`, each scaled to 1/N alpha (`feComponentTransfer`), summed additively (`feComposite operator="arithmetic"`), then fused into a smooth smear by a final direction-aligned two-value `feGaussianBlur` (blurs along the motion, keeps the perpendicular edge crisp). |
| **Progressive** | ✅ Shipped | Single `feGaussianBlur` crossfaded with the sharp source through an `feImage` gradient mask in `objectBoundingBox` units, so the ramp tracks the element's own bbox. |
| **Radial / zoom** | ❌ Not feasible | Needs position-dependent radial displacement of *scaled* copies; SVG filters have no scale/rotate and `feDisplacementMap` only warps once. Omitted from v1 entirely (no enum member). |

## Probe evidence (`probes/`)

The design was driven by empirical Chromium probes, not theory:

- `progressive-probe.*` — compared three progressive mechanisms. Proved `feImage` +
  `objectBoundingBox` gradient (variant B) ramps smoothly **and tracks a small
  offset element's bbox**, while `feFlood` bands both banded visibly and failed to
  track bounds. Drove the choice of `feImage` over the originally-planned bands.
- `render-samples.*`, `tile-sq.*`, `one-*.png` — verified linear directionality
  (`sq-90` is a clean vertical smear) and progressive ramp via the real Pathogen
  pipeline.
- `playground-path.*` — verified the **playground DOM path** (`buildDefs` +
  `mountInto`, not string serialization) renders `feImage` correctly and that the
  defs cleanup selector keeps node counts flat across recompiles.
- `measure-alpha.*` — pixel-measured the progressive interior centerline: flat
  luminance 36 (solid), confirming the additive crossfade has **no midband alpha
  dip** (the bug the original `feMerge` combine would have shipped).

## Implementation corrections vs. the original plan

1. Progressive uses `feImage` crossfade, **not** `feFlood` bands (probe-driven).
2. Progressive's final combine is additive `feComposite arithmetic`, **not**
   `feMerge` — `feMerge` over-composites complementary halves to ~75% alpha through
   the midband and lightens solid shapes.
3. Filter region is **per-`motionType`**: Linear `-50%/200%`, Progressive
   `-10%/120%` (an oversized region compresses the ramp and washes it out).
4. Fixed a pre-existing playground leak: `svg-preview-pane.ts` cleanup selector
   omitted `[data-filter-def]`, leaking all filter defs across recompiles.
5. Linear gained a final **direction-aligned smoothing `feGaussianBlur`** after user
   feedback that the raw tap sum read as discrete ghost copies on hard-edged
   shapes. The smoothing blurs *along* the motion axis (two-value `stdDeviation`
   = `σ·cos, σ·sin`) sized to the tap spacing, fusing the copies into a smooth
   smear while leaving the perpendicular cross-section crisp — an isotropic blur
   would dull that edge into a soft blob. See `probes/tile-pure.png` /
   `one2-dir0.png`.

## Renderer support caveat

Progressive blur relies on `feImage` referencing a local gradient — solid in
Chromium (playground, VS Code webview, Chrome) but weaker in some non-Chromium
engines (notably Firefox), so the CLI's portable `.svg` may show the unblurred
shape there. Documented in `docs/filters.md`. Linear blur uses only
`feOffset`/`feComposite` and renders everywhere.

## Sample BBWPs / mini-workspaces

Demo sources here, compiled into `website/bbwp/` (run `npm run compile:bbwp <file>`
then `npm run update:bbwp-index`):

- `01-linear-pan.pathogen` — horizontal directional smear
- `02-linear-angle-sweep.pathogen` — one shape, five angles (directionality proof)
- `03-progressive-frosted.pathogen` — iOS-style top→bottom variable blur
- `04-progressive-directions.pathogen` — four directions, solid interiors
- `05-motion-vs-native-blur.pathogen` — directional vs native `blur()` comparison

## Roadmap (follow-ups)

The tap-accumulation builder this work created is the foundation for:

- **Phase 2 — `SoftBlurFilter`**: a two-value directional `feGaussianBlur`
  (`stdDeviation="σx σy"`), nearly free given the existing scaffolding.
- **Phase 3 — `EchoFilter`**: trailing-ghost effect (one-sided taps with decaying
  alpha), reusing the linear tap loop.
- **Future — Radial / zoom blur**: requires render-level scaled `GroupLayer` clones
  or rasterization via the existing WebGPU/puppeteer path (the conic-gradient
  precedent), not an SVG filter chain.

# Probes

Small Pathogen programs (and one Node script) used during the 2026-09 glyph-halo
diagnosis. Each is self-contained; run from the repo root so `@font 'Baumans'`
resolves against `fonts/` (the CLI walks up from the cwd for stdin input):

```
npx tsx src/cli.ts probes/<name>.pathogen --print-logs --stroke=none > /dev/null
npx tsx src/cli.ts - --print-logs --stroke=none < probes/<name>.pathogen   # stdin form
node probes/chrome-heap-limit.mjs                                            # needs puppeteer (dev dep)
```

| Probe | What it measures |
|---|---|
| `dash-count-per-halo.pathogen` | Dash pieces, halo command count and arc length per (glyph, offsetBase) — the multiplier behind the 25-minute compile |
| `per-dash-offset-cost.pathogen` | 200 dashes through `compoundVariableOffset` (17 stops + tapered caps) at peak 6 / 600 / 6000 / 20000 — cost is ~1 ms per dash and independent of offset magnitude |
| `anchor-placement.pathogen` | Why `dashStroke.draw()` gave `d="c …"` and stacked ribbons; `anchor` + `drawTo` registration |
| `transform-origin-matrix.pathogen` | Which PathBlock transforms keep a piece's leading `m` and which re-origin at 0,0 |
| `angle-convention-and-winding.pathogen` | `tangent(t).angle` ∈ [−π, π] vs `normal(t).angle` ∈ (−1.5π, 0.5π] (unwrapped), dead `switch` ranges above 0.5π, outward vs inward normals per contour winding |
| `angle-proximity-vs-shade.pathogen` | The user's `angleProximity` at both reference angles vs a cosine shade; lerp-pair thickness cancellation |
| `length-vs-bbox-cost.pathogen` | `.length` vs `boundingBox()` cost on a halo, a contour and dash pieces (no measurable difference) |
| `chrome-heap-limit.mjs` | Chrome's V8 heap ceiling with and without `--js-flags=--max-old-space-size` (honoured only downward) |

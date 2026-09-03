# Easing interpolation

Paper trail for richer easing in Pathogen: the CSS-style `cubicBezier` timing
function, the named `Easing` curve family shared by the stdlib and topological
gradients, and the "easing with lambdas" blog post.

## Artifacts

| File | What it is |
|---|---|
| `proposal-2026-09-03.md` | Ryan's original TypeScript design doc (generators returning `(start, end, time)` interpolators). |
| `assessment-2026-09-03.md` | Critical assessment against the ergonomics/expressiveness goal, with the verified repo facts it rests on, and the approved recommendation. |
| `demo-cubic-bezier.pathogen` (+ `.svg`, `.png`) | Phase 1 demo (2026-09-03): six dot rows spaced by linear, quadratic `easeInOut`, CSS ease-in-out, CSS ease, expo-out and back in-out; the last row overshoots the rails. SVG is CLI output (`npm run cli -- … --output-svg-file=… --stroke=none`). |
| `render-png.mjs` | Renders any demo SVG here to a 2x PNG: `node project-docs/easing-interpolation/render-png.mjs demo-cubic-bezier`. |
| `scripts/debug-cubic-bezier.ts` (repo root) | Puppeteer check against the dev playground: CLI ↔ preview path parity for the demo, served completion/hover for `cubicBezier`, bit-exact value from the served bundle, positioned error for an out-of-range handle. |
| `demo-curve-gallery.pathogen` (+ `.svg`, `.png`) | Phase 2 demo: the named curve family plotted. Added when Phase 2 lands. |

## Approved plan (2026-09-03)

1. **Phase 1**: `cubicBezier(x1, y1, x2, y2, t)` in the stdlib. Docs first in
   `docs/stdlib.md`, tests, implementation, completions.
2. **Phase 2**: extend the `Easing` enum with sine/cubic/expo/circ/back/elastic/bounce
   (in/out/in-out), add `ease(curve, t)`, generate the WGSL `applyEasing` and the
   Canvas fallback from one `src/stdlib/easing-curves.ts` table, add the parity
   test.
3. **Phase 3**: blog post `easing-with-lambdas` with samples in
   `website/blog/samples/post51/`: ranges, amplitudes, cycles/half-cycles, lambda
   factories, a finished composition.

Not in scope: `(start, end, t)` interpolator generators as public API, a stdlib
`sineWave`, any `Easing.<fn>(...)` callable namespace, changing the quadratic
trio's formulas, rasterizing topo gradients in the CLI or VS Code preview.

Published surfaces once shipped: `docs/stdlib.md` (Easing section),
`docs/gradients.md` (TopoGradient `easing`), `docs/syntax.md` (enum table), and
the blog post.

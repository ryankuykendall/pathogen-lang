# General Language Requirements (Stage 4, 2026-08-30)

The consolidated [G] document the repo previously lacked. Each requirement:
what it is, who it's for (flagship motivating domains from the survey),
rough size, and design notes surfaced during profiling. Sizes are T-shirt
estimates for planning conversation, not commitments; every language-level
feature also owes annotated-evaluator parity per
`../../cutting-room/opportunities/README.md`.

## R1. Physical units — size L
A unit-bearing numeric type (`25mm`, `0.25in`, unit-safe arithmetic,
declared document units, exact-scale export guarantee). **Flagships:**
quilting (¼" allowances), luthiery (0.01 mm fret tables), robotics/CNC
(drill specs), dielines (calipers). Design notes: interacts with the whole
evaluator + both formatters (the AngleValue experience is the precedent and
the warning — see memory on annotated parity traps); "named scale ratios"
(1:87, 1:500 — A14/A19) should ride the same design. This is the *trust*
feature: without it every physical domain ships with a caveat. **Design
sketch: `units-design-sketch.md` (v2)** — declaration-only units
(`define ViewBox(...) in Units(Unit.mm)`, derived units via expression
arithmetic, e.g. `Unit.inch * 0.1`); body numbers stay plain (no literal
suffixes — avoids mixed-unit calc() and keeps CLI/export overrides a
one-binding remap); in-body physical values via conversion functions
(`inch(0.25)`); relative-unit (em) lambdas documented as a pattern. Near-
zero annotated-parity cost; size likely revises L → M under that model.

## R2. Modules & libraries — size L
`import`/`export` across files + a publishable library story. **Flagships:**
every domain (the matrix shows ~26 naming a library as the deliverable).
Design notes: this is also the **delivery vehicle for all shared kits** in
the feature matrix — joints, checks, chart kits ship as libraries, not
builtins, which keeps the core language small. Grammar + resolution +
playground/CLI/LSP loading paths (three surfaces!).

## R3. Multi-view export — size M
One drawing model, many artifacts: pagination, tiling, view splitting; PDF
pages / PNG sets / SVG sets / DXF as consumers of one view list. Full
concept: `multi-view-export-concept.md`. **Flagships:** coloring C2,
planners E2, quilting B1, riso C4. Design notes: composes with CLI batch
(R7) — page-per-parameter and file-per-seed are the same abstraction;
export-modal.ts is the natural UI surface.

## R4. Data import — size M (phased)
Phase 1: CSV/JSON file reading (CLI: fs; playground: file-drop/URL within
the existing sandbox rules). Phase 2: image sampling (unlocks E4 grid
crafts, string-art portraits, mosaic cartoons). Phase 3: thin format
adapters as *library* modules atop R2 (GPX, WIF, UIUC .dat, FOLD, star
catalogs). **Flagships:** personal data art E1 (the survey's flagship
motivator), RC ribs A13, weaving B4, stationery guest lists C6. Design
note: docs/security.md's no-remote-URL output contract is untouched —
import is compile-side input, a separate security surface to design
deliberately.

## R5. Machine-format export — size M
DXF first (R12/R2000 ASCII; LWPOLYLINE+bulge, LINE, ARC, CIRCLE, layers,
$INSUNITS), then HPGL/G-code and cutter-safe SVG profiles over the same
**biarc lowering pass** (the real work — bézier→arc fitting, transform
flattening, Y-flip, closed-path discipline, layer→operation mapping).
**Flagships:** CNC/plasma A17, robotics A12, plotters A16. Prerequisite
action item: the js-dxf vs ezdxf audit (`dxf-export-research.md`).
Composes with R1 (units make DXF trustworthy).

## R6. Robust curve/text offset() — size M–L (engine work)
Curvature-aware offsetting that survives arbitrary cut pieces and text
outlines. **Flagships:** quilting B1 and die-cutting A15 (both call the
current bug class disqualifying), leather A4, plush B6, garment (Cutting
Room Item A fixed miters; curves remain). **Recommendation unchanged from
Stage 1: pull this forward regardless of survey outcome — it is a blocker,
not a gap.** Also the foundation of the kerf idiom (4 domains).

## R7. CLI batch & parameters — size S–M
`--param k=v`, seed/parameter sweeps, batch output naming; headless
scheduled rendering (E7) as a stretch. **Flagships:** every seller-economy
domain (one script → product line: A6, A15, A17, C2, E2). Rides on R3's
view abstraction.

## R8. Number & date formatting — size S + S–M
Number: format specifiers for dimension labels and tables (A7 A11 A9 D3).
Date: calendar arithmetic (year→months/weeks, locales, week numbering) —
the *defining* gap of planners E2 and the survey's clearest single-domain
unlock. Keep as two small features; date data (holidays, moon phases) is
an R4 library concern.

## R9. Sheet nesting — size M (simple) to L (true packing)
Rectangle/convex nesting with spacing + jig marks covers most seller needs
(A1 A15 A6 A8); true irregular nesting is research-grade — don't gate on
it. Composes with R1 (sheet sizes) and R3 (sheet = a view).

## R10. Parameter sliders (playground) — size M
Live parameter UI over program variables. **Flagships:** STEM D4 (the
classroom demo IS the product), guilloche E3, fantasy maps. Playground-
only; no language change if driven by a `@param` annotation convention.

## R11. HTTP client — size M + security design
Compile-time data fetching. **Flagships:** e-ink dashboards E7 (the domain
is this gate), personal data art E1. Narrow reach (3 domains) but two
flagship stories; sequence after R4 since file import shares the parsing
half. Requires an explicit security model (playground CORS, CLI net
policy, no output-side change).

## R12. Testing — size M
Assertions over geometry (bounding boxes, point positions, path counts,
label queries) runnable in CI. **Flagships:** sci figures D1, robotics
A12, curriculum D4, origami validity C1. The existing ctx/query machinery
(`test-harness-for-ctx.md`) is the natural seed.

## Explicit non-goals (from the survey)
- **Stitch engine** (B7 embroidery): domain-engine scale; bridge via
  Ink/Stitch-friendly SVG instead.
- **True irregular nesting** (R9): ship simple nesting, defer research.
- **3D unwrapping** (B6 plush, A18 curved armor): out of scope; serve the
  flat-drafting share.
- **GIS pipeline** (D6 real-world): defer until R4 phase 3 demand is
  proven; fantasy maps need none of it.

# Feature Matrix — What Unlocks What (Stage 4, 2026-08-30)

Aggregated from all 50 profiles (45 in `../03-profiles/` + 5 samples).
Domains are cited by longlist ID (see `../02-longlist/longlist-v1.md`).
Per the taxonomy rule, any [D] feature wanted by 3+ domains graduates to a
**shared kit candidate**, listed in part 2.

## 1. General [G] requirements by domain reach

| # | Requirement | Domains touched | Hard-gated domains (blocked without it) |
|---|-------------|----------------|------------------------------------------|
| 1 | **Physical units** | ~22: A1 A4–A7 A9–A14 A17–A21 B1 B5 B6 D3 D5 + samples | none fully blocked, but *trust* fails everywhere physical — kerf, seam allowance, fret tables, drill specs are all unit-borne |
| 2 | **Modules & libraries** | ~26 — essentially every profile names a library as the deliverable (joints, blocks, gears, FEFCO styles, heraldic kit, music kit, motif packs) | dielines A5, heraldry E5, music D2 — the library IS the product |
| 3 | **Multi-view export** (pagination + tiling + view splitting; see `multi-view-export-concept.md`) | ~18: C2 E2 C7 D2 D5 C6 · B1 A7 B2 A18 A10 A19 · C4 A15 A6 A11 D3 E7 | coloring C2, planners E2 (pagination); quilting B1, woodworking A7 (tiling); riso C4 (splitting) |
| 4 | **Data import** (CSV/JSON, then domain formats: GPX, WIF, .dat airfoils, star catalogs, images) | ~18: E1 E4 E6 E7 A13 D3 B4 C6 E2 B1 A17 A19 D1 D4 A18 D2 A5 A1 | personal data art E1, RC ribs A13, grid crafts E4 (image), astronomy charts D3, real-world cartography |
| 5 | **Machine-format export** (DXF first; HPGL/G-code and cutter-safe SVG profiles share the same biarc lowering pass — see `dxf-export-research.md`) | ~12: A17 A12 A13 A9 A11 A7 A5 A8 A19 A6 + A16 (HPGL) + A15 (SVG profile) | CNC/plasma A17, robotics A12 (DXF); plotters A16 partially (HPGL) |
| 6 | **Robust curve/text `offset()`** | ~9 named: B1 A15 A4 B6 A3 A1 A17 A6 + garment (Cutting Room) | quilting B1 and die-cutting A15 call the current bug class *disqualifying* |
| 7 | **CLI batch / params** | ~12: C2 E2 A17 A6 A15 A16 C6 E7 C7 A13 A12 E4 | none alone, but the seller-economy story (one script → product line) depends on it |
| 8 | **Number + date formatting** | ~11 number: A7 A11 A17 A9 E2 E6 D3 E4 B2 B3 C6 · 4 date: E2 (defining) D3 C6 E6 | planners E2 gated on date/calendar arithmetic |
| 9 | **Sheet nesting** | ~8: A1 A15 A6 A8 A5 A19 A13 B1(layout) | none hard-gated; big quality-of-life for all cutting sellers |
| 10 | **Parameter sliders (playground)** | ~8: D4 E3 A2 C5 B4 E5 D6-fantasy A16 | STEM D4 — the live classroom demo is the product |
| 11 | **HTTP client** | 3: E7 (gate) E1 (partial) E6 | e-ink dashboards E7 entirely |
| 12 | **Testing** | ~5: D1 A12 D4 C1 E6 | none gated; credibility feature for curriculum/CI users |
| 13 | *(honest wall)* Stitch engine | 1: B7 embroidery | recommendation stands: do not build |

## 2. Graduated shared kits (recurring [D] features, 3+ domains)

| Kit | Domains | Notes |
|-----|---------|-------|
| **Joints & thickness math** (tab-slot, finger, clearances, tray fit, caliper flaps) | A1 A8 A13 A19 A10 A5 D5 A14 (~8) | The single biggest [D] cluster; parameterized by material thickness → composes with units |
| **Manufacturability checks** (island detection, min feature width, weedability, relief validation, line-weight-for-transfer, min hole, tincture rules, foldability) | A3 A20 A21 C9 A17 C1 C2 E5 (~8) | Pattern insight: build a **check framework** domain kits register rules into — "will it cut?" as a compile error is a signature Pathogen story |
| **Line-class rendering conventions** (mountain/valley/cut/score/perf/bevel legends, dash conventions) | A2 C1 A5 A18 A13 A4 A10 (~7) | Labels already carry the semantics (papercraft post); this is the rendering half |
| **Dimension & annotation kit** (dimension lines, angle arcs, leader labels) | D4 A7 A1 D1 A19 A11 (~6) | Also wanted by every plan-drawing output |
| **Procedural fills & textures** (hatch/crosshatch, halftone/dither, brick/clapboard courses, opus layouts) | A16 C4 A8 A14 C8 (~5) | Fill-to-hatch (plotters) and halftone (riso) are the same machinery |
| **Registration & alignment marks** | C4 A15 C6 B1 A7 + all tiling (~6) | Mostly folds into the multi-view/tiling generators |
| **Grid-chart kit** (cell symbols, legends, palette counts) | B2 B3 E4 B4 (~4) | One kit serves cross-stitch, knitting, grid crafts, weaving notation |
| **Kerf idiom** (`offset(kerf/2)` on closed pieces + kerf tables) | A1 A17 A6 A8 (~4) | Rides on offset robustness + units + data import |
| **Radial/ring progression helpers** | C5 E3 A6 C1(22.5°) (~4) | Cheap; mostly sugar over existing transforms |
| **Commercial palette data** (DMC, Perler, riso inks) | B2 E4 C4 B3 (~4) | Data files + nearest-color mapping |

## 3. Two-domain features (tracked, not graduated)

Island bridging beyond stencils (A3 A20) · path ordering/merging (A16, A17
lead-ins) · math-notation text (D1 D4, +D2 lightly) · scale-ratio
regeneration (A14 A19, generalizes the units work) · hyperlinked PDF (E2) ·
e-ink 1-bit profiles (E7) · FOLD/WIF/GPX format adapters (C1 B4 E1 — each
one domain, but all are thin once data import exists).

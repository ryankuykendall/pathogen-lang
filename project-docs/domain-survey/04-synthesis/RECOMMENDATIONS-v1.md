# Domain Survey — Recommendations v1 (Stage 4, 2026-08-30)

The synthesis endpoint: ranked domains, feature phases, demo-series
candidates, and honest deprioritizations. Companion docs: feature-matrix,
general-language-requirements, wedge-analysis, multi-view-export-concept,
dxf-export-research.

## 1. Re-scores applied after profiling

- **D6 split.** Fantasy maps: Pop 3 · Pain 3 · Fit 4 · Gap 3 · Adopt 4 =
  **432** (no data gate; large tool-buying community; Azgaar's proves the
  generative appetite). Real-world cartography: deferred (GIS gate).
- **FIRST verified at 530k students / 61k teams** — larger than estimated;
  D4's Pop 4 stands with higher confidence.
- All other Stage 2 scores stand after research.

## 2. Domain tiers (post-synthesis)

**Tier 1 — invest (≥400):**
laser flat-pack 720 · kirigami/pop-up 480 · origami CP 480 · fantasy maps
432 · stencils 432 · leathercraft 432 · coloring/KDP 432 · dielines 405

**Tier 2 — strong (300–399):**
quilting 384 · cross-stitch 384 · knitting charts 384 · string art 384 ·
PCB panels 360 · sci figures 360 · weaving 360 · jewelry 324 · woodworking
324 · wargaming 324 · music ed 324

**Tier 3 — content-first (high fit, low gap, modest pain):**
sashiko 200 · guilloche 240 · mandala 240 · astronomy/sundials 256 —
buildable now; feed the blog pipeline immediately.

**Tier 4 — strategic adopters (low pop, max influence):**
plotters 225 · e-ink 120 · heraldry 192 · robotics 288 · guilloche (again)
— communities that write the posts others read.

**Deprioritized (recorded honestly):**
embroidery digitizing 64 (stitch-engine wall — bridge via Ink/Stitch only) ·
vinyl signage 108 (incumbent-served) · dataviz posters 144 (serve through
E1/E2 wins) · tattoo 108 (content-only unless the geometric niche pulls) ·
real-world cartography (GIS-deferred).

## 3. Feature investment (from wedge-analysis)

Phase 0: **offset() fix** (blocker) + Tier-3 content now.
Phase A: **modules, physical units** (foundations — modules before kits).
Phase B: **multi-view export + CLI batch, DXF (post-audit), formatting**.
Phase C: **data import (CSV→image→format adapters), then HTTP**.
Phase D: **nesting, sliders, testing, shared-kit library releases**.

Seven of the eight Tier-1 domains are fully served by Phases A+B.

## 4. Candidate demo series ("Cutting Room" successors)

Each demo is chosen to *drive a wedge feature* the way the Cutting Room
drove cut()/labels — the friction log is the point:

1. **"The Third Dimension of Flat"** (laser flat-pack + kirigami +
   dielines): a finger-jointed box, a V-fold card, a mailer carton —
   drives units, joints kit, line classes. Tier-1 ×3.
2. **"Holes That Can't Disagree"** (leather wallet + quilting block):
   matched stitch holes and seam allowances — drives offset() and
   partition-on-seams. Tier-1 + Tier-2.
3. **"One Hundred Pages"** (coloring interior + planner + worksheet pack):
   drives multi-view pagination + date math + CLI batch. Tier-1 + E2.
4. **"Born Separated"** (riso poster + stencil + screen print): layers-as-
   inks, bridges, manufacturability checks — drives the check framework.
5. **"Maps That Never Were"** (fantasy map campaign set): drives noise/
   style systems + sliders; zero feature gates — could run early.
6. **"Instant classics" one-offs for Tier 3:** hitomezashi mend patch,
   engine-turned rosette, weaving drawdown explorer — publishable this
   month; community sections in the profiles carry the timing hooks
   (Genuary for plotters, New-Year for planners, wedding season for C6).

## 5. Open questions for the user

1. Which demo series to green-light first (§4) — recommendation: #6
   immediately (zero gates) + #1 as the first feature-driving series.
2. Confirm Phase 0 pull-forward of the offset() fix as its own project.
3. The js-dxf vs ezdxf audit (action item in dxf-export-research.md) —
   schedule before Phase B's DXF work.
4. Whether Tier-4 strategic domains (plotters, e-ink) justify early bridge
   work (vpype interop; TRMNL plugin) ahead of their phase gates.
5. Stage 5 deep dives: which Tier-1 domains earn multi-page treatment
   first (suggest: laser flat-pack, coloring/KDP, fantasy maps).

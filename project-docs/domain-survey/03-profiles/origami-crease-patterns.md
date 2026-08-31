# Origami Crease Patterns

**Tier:** physical-output · **Rubric:** Pop 2 · Pain 4 · Fit 4 · GapCost 3 · Adopters 5 = **480** · Longlist C1

## Snapshot
Computational origami (the Lang school) designs models as crease patterns —
labelled-line geometry governed by flat-foldability math — and its community is
the most research-literate, code-native audience on the longlist.

## Description
Crease-pattern designers, origami researchers, and advanced folders. Tools:
Robert Lang's TreeMaker/ReferenceFinder, Oripa, Origami Simulator
(origamisimulator.org), Inkscape/Illustrator for cleanup. Artifacts: CPs
published as SVG/PDF with mountain/valley/edge line classes, box-pleating
grids, tessellations. Output is printed and folded, or laser-scored.

## Problems Pathogen could address
CPs are exactly labelled line classes (mountain/valley/cut/edge) on parametric
grids — 22.5° systems and box pleating are angle-and-grid arithmetic that
Pathogen's Angle values and Grid already speak. Tessellation design is
transform-and-repeat over a unit cell. Incumbent tools are single-purpose
research apps with rough UX; the composition story (reusable molecules,
parametric gadgets) barely exists anywhere.

## Commercial value
Small direct market (books, workshops, commissioned models, laser-scored kits)
— but outsize strategic value: this community publishes, teaches, and
influences engineering origami (deployable structures, robotics). Credibility
here echoes into STEM.

## Missing features
### Domain-specific [D]
- Line-class rendering conventions (mountain dash-dot / valley dash) as a kit
- Flat-foldability checks (Maekawa/Kawasaki conditions at vertices)
- Fold simulation or export to Origami Simulator's FOLD format
- 22.5°/box-pleating grid helpers; tessellation unit-cell repeat with edge
  matching
### General [G]
- Modules (gadget/molecule libraries are the community's mental model);
  testing (verify foldability conditions in CI); data import (FOLD format is
  JSON)

## User base
Est. 20–60k serious CP folders/designers worldwide within a much larger casual
origami population · proxy: OORS Discord, r/origami (~400k, mostly casual),
convention attendance · confidence **L, unverified**. Early-adopter density:
maximal — half the community writes code already.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** Origami Online Research Society (OORS) Discord with
  monthly research seminars; langorigami.com; r/origami; the Fold (OrigamiUSA);
  origamisimulator.org users; academic venues (OSME).
- **Talking about right now:** AI-driven CP generation is live research —
  COrigami (arXiv, 2026) generates crease patterns from natural language;
  genetic-algorithm CP search; algorithmic tessellation design in engineering
  journals. The research/art bridge is unusually active.
  (arxiv.org/abs/2606.26299, cfcorigami.com, langorigami.com)
- **Obsessed with:** flat-foldability elegance, 22.5° vs box-pleating design
  philosophies, efficiency of paper usage, CP-solving as a puzzle sport.
- **Blog content angles:** (1) a box-pleated gadget defined as a reusable
  parametric module; (2) verifying Kawasaki's theorem in code — "your CP,
  type-checked"; (3) FOLD-format interop piece aimed at the simulator crowd.

## Pathogen fit today
Angle values with deg/rad, Grid, transforms, segment labels for line classes,
deterministic output. A static CP with correct conventions is buildable today;
validity checking and FOLD interop are the gaps.

## Proposed validation project
A parametric origami tessellation: unit cell with mountain/valley labels,
repeated with edge-matching, Kawasaki check logged per vertex, exported as
print PDF + laser-score SVG + (stretch) FOLD JSON.

## Top YouTube channels (as of 2026-08-31)
- [EZ Origami (Evan Zodl)](https://www.youtube.com/ezorigami) — well-explained intermediate-to-advanced tutorials with creases highlighted on-model; also authored the TED-Ed "satisfying math of folding origami" lesson.
- [OrigamiByBoice](https://www.youtube.com/channel/UCzovUuQjox0ojqd7GtRz4-g) — Boice Wong's channel is the reference for crease-pattern work: a "Crease Pattern Class" playlist plus free downloadable CPs for complex designs.
- [Alexander Kurth](https://www.youtube.com/results?search_query=Alexander+Kurth+origami) (search link) — folds his own original advanced designs with step-by-step narration; recommended in origami.me's channel roundup.

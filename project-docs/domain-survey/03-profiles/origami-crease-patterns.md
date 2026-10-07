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

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Miura-ori map fold** — The parallelogram tessellation used for pocket maps
  and solar sails, and a standard first laser-scored fold in fab-lab courses.
  One Angle value sets the zigzag and a Grid loop lays out the cells, with
  segment labels marking each crease mountain or valley by row and column.
  Change the angle or the cell count and a new static crease pattern prints,
  ready to fold.
- **Yoshimura arch pattern** — A diamond buckling pattern published in 1951
  and rated beginner level by folding teachers: diagonals fold one way and
  horizontals the other, and the sheet curls into an arch or a tube. It is a
  Grid of identical diamonds with two labelled line classes and one Angle
  parameter for the diamond's proportions. Deterministic output makes each
  printed sheet repeatable.
- **Bird base crease pattern** — The crease pattern behind the traditional
  crane, and the usual first exercise in reading and drawing patterns: a
  square crossed by creases at multiples of 22.5 degrees. Angle values in
  degrees state those directions exactly instead of by eye, a quarter of the
  square is drawn once and transforms supply the symmetry, and segment labels
  carry mountain, valley and edge.

### Intermediate — several features, or one gap
- **Waterbomb tessellation** — The waterbomb base repeated in offset rows
  gives a sheet that curls into a tube, the pattern behind origami stent
  research. It needs a unit drawn with Angle values, a Grid whose alternate
  rows shift half a cell, transforms and three label classes. The one gap is
  modules: the community thinks of the waterbomb as a reusable molecule, and
  today it would be copied between files.
- **Kresling tower** — A strip of parallelograms, each with one diagonal,
  glued into a polygonal tube that twists as it collapses; a favourite of
  origami robotics papers and classroom builds. Two parameters drive it, the
  polygon's side count and a tilt Angle, and labels separate mountain, valley,
  the cut outline and the glue-tab edge. Everything is shipped, combined in
  one small parametric script.
- **Ron Resch triangle pattern** — Resch's 1960s tessellation gathers a flat
  sheet into a relief of triangles, with creases running in three directions
  around star-shaped vertices. It combines a triangular layout built from Grid
  and transforms, Angle arithmetic and careful mountain and valley labelling.
  Testing is the gap: nothing yet lets an author assert in CI that every
  vertex carries the crease count the pattern demands.

### Advanced — depends on a named gap
- **Box-pleated insect base** — The Lang-school showpiece: a many-legged
  figure whose crease pattern lives on a square grid with creases only at
  multiples of 45 degrees, assembled from standard gadgets. Drawing one today
  means placing hundreds of lines by hand. The opportunity is the 22.5-degree
  and box-pleating grid helpers, so that a designer snaps flaps and rivers to
  the grid and edits a parameter, not a drawing.
- **Flasher deployable disc** — The spiral-wrapping pattern studied for space
  solar arrays: a flat disc that winds around a central polygon into a compact
  cylinder. Folders and engineers want to watch it deploy before cutting
  anything. FOLD-format export is the gap and the opening, because Origami
  Simulator reads that JSON, and a parametric flasher that opens there puts
  Pathogen in front of the research crowd.
- **Print-ready crease-pattern plate** — A crease pattern prepared for a
  convention book or a journal, where black-and-white printing forces the
  mountain dash-dot and valley dash conventions and a clear paper edge. Labels
  already know each line's class. What is missing is the line-class rendering
  kit that turns those labels into the standard dashes and a legend, so the
  same source serves screen, print and laser scoring.

Sources: fabacademy.org, u-tokyo.ac.jp, kristinawissling.myportfolio.com,
  ocw.mit.edu, courses.csail.mit.edu, arxiv.org, archive.bridgesmathart.org,
  routledge.com

## Top YouTube channels (as of 2026-08-31)
- [EZ Origami (Evan Zodl)](https://www.youtube.com/ezorigami) — well-explained intermediate-to-advanced tutorials with creases highlighted on-model; also authored the TED-Ed "satisfying math of folding origami" lesson.
- [OrigamiByBoice](https://www.youtube.com/channel/UCzovUuQjox0ojqd7GtRz4-g) — Boice Wong's channel is the reference for crease-pattern work: a "Crease Pattern Class" playlist plus free downloadable CPs for complex designs.
- [Alexander Kurth](https://www.youtube.com/results?search_query=Alexander+Kurth+origami) (search link) — folds his own original advanced designs with step-by-step narration; recommended in origami.me's channel roundup.

# Scientific Figures for Publication

**Tier:** physical-output (print/screen) · **Rubric:** Pop 3 · Pain 4 · Fit 3 · GapCost 2 · Adopters 5 = **360** · Longlist D1

## Snapshot
Researchers assemble paper figures across fragmented tools (matplotlib +
TikZ + Illustrator/Figma) — a decade-old pain point now being attacked by AI
figure generators, which validates demand for *programmatic* figures while
leaving the deterministic-source niche open.

## Description
Academics producing publication figures: schematic diagrams (pipelines,
apparatus, biological processes), annotated geometry, and plot-adjacent
composites. TikZ gives font-matched vector precision at brutal ergonomic
cost; matplotlib owns data plots; Illustrator/BioRender/Figma own schematics;
2026's AI entrants (AutomaTikZ, DeTikZify — sketch/caption → TikZ) show the
field wants figures-as-programs.

## Problems Pathogen could address
The schematic/diagram slice (not statistical plotting — matplotlib wins
there): versionable, journal-column-sized vector figures with exact typography
control, reproducible across revisions, diffable in Git alongside the paper.
TikZ refugees are real; a language with live preview (playground), readable
syntax, and deterministic output hits their exact complaint. Journal specs
(column widths, min font sizes, colorblind-safe palettes) are compile checks.

## Commercial value
No direct file market — the value is *adoption credibility*: researchers are
prolific tool evangelists, and "figures in Pathogen" in a methods section is
organic distribution. Adjacent service value: figure templates for labs.

## Missing features
### Domain-specific [D]
- Math-notation text (sub/superscripts minimum; LaTeX subset ideal — the
  single biggest gate)
- Journal-spec presets (column widths, font minimums) as checks
- Arrow/callout/dimension annotation kit; colorblind-safe palette checks
- SVG/PDF at publication DPI with embedded fonts (partially exists)
### General [G]
- **Data import (CSV → simple plots for composite figures)**; modules
  (lab figure kits); testing (figure regression in paper CI)

## User base
Millions of publishing researchers globally (STM estimates ~10M active
researchers) · the schematic-heavy subset is the target · confidence **M,
unverified**. Adopters 5: they write code daily.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** academic Twitter/Bluesky + Mastodon, r/LaTeX,
  TeX StackExchange, lab-tooling blogs, matplotlib/TikZ user communities.
- **Talking about right now:** AI figure generation moved "from novelty to
  useful" in 2025–26 (DeTikZify, AutomaTikZ); tool fragmentation named as a
  decade-old pain; hybrid AI-plan + manual-create workflows recommended.
  (paperbanana.online, noah.bio, arxiv.org 2405.15306)
- **Obsessed with:** reproducibility, font consistency with the manuscript,
  journal rejection over figure quality, BioRender subscription grumbling.
- **Blog content angles:** (1) "the figure is source code" — versioned,
  diffable schematics with the reproducibility pitch; (2) a TikZ-refugee
  comparison post (same figure, both languages); (3) journal spec as compile
  check.

## Pathogen fit today
Vector precision, typography via @font, annotation geometry, deterministic
output, live playground preview — strong core. Math text and data import
gate it (GapCost 2).

## Proposed validation project
A methods-section apparatus schematic: labelled components, callout arrows,
column-width preset, colorblind-safe palette — rebuilt from a published
paper's figure and diffed for fidelity.

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Experimental timeline figure** — Almost every animal or clinical methods
  section carries a timeline: a horizontal axis with day markers, treatment
  bars and sampling arrows. It is lines, rectangles and short text labels at
  computed positions, all shipped. Keeping the schedule as an array means that
  when a reviewer asks for an extra time point, one value changes and every
  tick and label moves with it.
- **Multi-panel layout skeleton** — Journals want panels aligned to a common
  grid with bold A, B and C labels at each top-left corner in a consistent
  type size. A Pathogen file that draws only the panel frames and labels gives
  exact alignment and spacing from a few parameters, and the frames then guide
  placement of plots made elsewhere. It replaces the manual nudging usually
  done in Illustrator.
- **Pipeline block diagram** — Computational papers open with a
  boxes-and-connectors overview of the analysis pipeline. Rounded rectangles,
  centred labels in a loaded font and straight connector paths are enough, and
  the source is plain text that lives in the paper's repository. Because
  output is deterministic, a rebuilt figure is byte-identical unless the
  source changed, which keeps figure diffs meaningful during revision.

### Intermediate — several features, or one gap
- **CONSORT participant flow diagram** — Trial reports require a flow chart
  tracking participants through enrolment, allocation, follow-up and analysis,
  with a count in every box. The counts change with each data freeze, so
  holding them as variables and deriving the excluded totals in the figure
  itself removes a classic source of inconsistency. It needs text, layout
  arithmetic and connectors together, but nothing that is missing.
- **Graphical abstract** — Most journals now ask for a single landscape
  summary image combining a few simplified shapes, arrows and a short
  take-home line. It uses layers, a restrained colour system, typography and
  exact vector export together. Pathogen suits abstracts built from geometric
  schematics; those needing detailed biological icons still belong to
  BioRender, and the playground preview makes iteration on proportions quick.
- **Lab figure kit** — Groups reuse the same visual vocabulary across papers:
  their colour assignments for conditions, their apparatus symbols, their
  panel-label style. In Pathogen those are functions and style definitions,
  but sharing them between figure files is where the one gap bites: modules
  [G]. Until then the kit is copied into each file, which works for one paper
  and drifts across a thesis.

### Advanced — depends on a named gap
- **Composite schematic-plus-data figure** — The typical main figure pairs a
  schematic with two or three simple plots of the measured data, and today
  that means matplotlib output pasted into Illustrator. Data import [G],
  specifically CSV into simple plots, is the bolded gap in this profile. With
  it the schematic, axes and points would share one coordinate system, one
  font and one source file.
- **Annotated reaction or equation schematic** — Chemistry and physics
  schematics label components with formulae such as CO₂, x² or subscripted
  variable names, and readers judge a figure by whether these are set
  correctly. Pathogen's text has no notion of sub- or superscripts.
  Math-notation text [D], which the profile calls the single biggest gate, is
  the dependency; even a minimal subset would unlock most schematic labelling.
- **Journal-retarget build** — A rejected paper is resubmitted elsewhere, and
  every figure must be rebuilt at the new journal's column width with its
  minimum font size, for example from Nature's 89 mm to Cell's 85 mm.
  Journal-spec presets as checks [D] is the gap. One preset name per journal,
  with a warning when any label falls below the minimum, would make
  retargeting a one-line change.

Sources: research-figure-guide.nature.com, biorender.com, help.biorender.com,
  engineering.purdue.edu, conceptviz.app, pmc.ncbi.nlm.nih.gov

## Top YouTube channels (as of 2026-08-31)
- [Corey Schafer](https://www.youtube.com/@coreyms) — the canonical matplotlib/pandas/NumPy tutorial series; where most researchers actually learn to script their figures.
- [Andy Stapleton](https://www.youtube.com/@DrAndyStapleton) — academia/research-workflow advice from an ex-chemist (search results cite 220k+ subscribers); covers the tooling and publishing side of research life.
- *Thin YouTube presence for this niche; no dedicated scientific-figure/TikZ channel surfaced — nearest-adjacent coverage is general Python data-stack teaching (e.g. freeCodeCamp's matplotlib/D3 courses) plus written guides.*

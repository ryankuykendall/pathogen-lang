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

## Top YouTube channels (as of 2026-08-31)
- [Corey Schafer](https://www.youtube.com/@coreyms) — the canonical matplotlib/pandas/NumPy tutorial series; where most researchers actually learn to script their figures.
- [Andy Stapleton](https://www.youtube.com/@DrAndyStapleton) — academia/research-workflow advice from an ex-chemist (search results cite 220k+ subscribers); covers the tooling and publishing side of research life.
- *Thin YouTube presence for this niche; no dedicated scientific-figure/TikZ channel surfaced — nearest-adjacent coverage is general Python data-stack teaching (e.g. freeCodeCamp's matplotlib/D3 courses) plus written guides.*

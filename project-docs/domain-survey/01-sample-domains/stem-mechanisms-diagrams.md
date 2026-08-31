# STEM Mechanisms & Dimensioned Diagrams

**Tier:** physical-output (+ data-driven edge) · **Rubric:** Pop 4 · Pain 3 · Fit 3 · GapCost 2 · Adopters 3 = **216**

## Snapshot
Teachers, robotics mentors, and OER authors need parametric gears, linkages,
coordinate diagrams, and exact-size classroom manipulatives — today split
between GUI-locked tools (GeoGebra, Desmos) and hostile ones (TikZ).

## Description
K-12/university STEM teachers; FIRST/VEX robotics mentors (~100k students in
teams); textbook and open-education-resource authors; museum/exhibit builders.
Artifacts: involute gears and sprockets (printed or laser-cut), four-bar
linkage diagrams, cams, fraction tiles and geoboards, labelled coordinate
diagrams for worksheets and textbooks. Tools: GeoGebra, Desmos, TikZ/LaTeX,
Fusion 360, or hand drawing.

## Problems Pathogen could address
These artifacts are parametric by nature — change the tooth count and
everything re-lays out — but GUI tools can't be versioned or composed, and TikZ
makes geometry hostile. Manipulatives need exact physical dimensions plus clean
cut files, which is the laser-domain overlap. Pathogen's Angle values,
`calc()`, segment labels, and text layers already cover the annotation half of
a dimensioned diagram.

## Commercial value
Curriculum marketplaces (Teachers Pay Teachers), OER/textbook publishers,
robotics-team kit vendors, museum fabrication shops. Distinct strategic value:
teachers create users — the education channel is how languages seed the next
cohort of early adopters.

## Missing features
### Domain-specific [D]
- Involute gear / rack / sprocket primitives (tooth count, module, pressure
  angle)
- Linkage helpers (four-bar position solve) or constraint-lite helpers
- Dimension lines, extension lines, and angle arcs with auto-placed labels
- Axes / grid / tick-mark generators for coordinate diagrams
- Math-notation text: sub/superscripts at minimum, ideally a LaTeX/MathML subset
### General [G]
- **Physical units** (manipulatives must be dimensionally true); parameter
  sliders in the playground (the live classroom demo *is* the product); data
  import (plot a CSV in a worksheet figure); testing (curriculum repos need
  regression safety); modules (a "diagram kit")

## User base
Millions of STEM teachers (US alone has ~200k+ math teachers); Desmos/GeoGebra
claim 100M+ users as an adjacent-population signal; FIRST/VEX ~100k students ·
confidence **M for teachers, L for conversion, unverified**. Early-adopter
density medium — teachers who script exist and evangelize hard.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** NCTM conferences and publications, the math-teacher
  blogosphere (MTBoS diaspora on Bluesky/X), GeoGebra forums and regional
  conferences (FL GeoGebra Conference, Feb 2026), Desmos educator community,
  r/matheducation, Teachers Pay Teachers seller groups, FIRST/VEX team forums.
- **Talking about right now:** AI-in-the-classroom dominates the discourse —
  with a counter-current the survey can ride: visual/dynamic tools are called
  "irreplaceable" precisely because text-based AI can't do dynamic geometric
  construction. Blended physical + digital manipulatives are the recommended
  practice, and *students building their own manipulatives* is an emerging
  theme. (edugenius.app, teachfloor.com, edutopia.org, nctm.org, 2026)
- **Obsessed with:** engagement and low-floor-high-ceiling activities,
  printable-on-a-budget resources, Desmos activity building, slider-driven
  live demos.
- **Blog content angles:** (1) "have students build the manipulative in code" —
  rides the student-created-tools theme directly; (2) a laser-cut gear-train
  math kit from one source file; (3) dimensioned diagrams that re-layout when
  the parameter changes — the GeoGebra story, but versionable text.

## Pathogen fit today
First-class Angle values, `calc()` with pi/deg/rad, text layers with real font
metrics, segment labels for callouts, polygon/star/arc stdlib, Grid, PDF
export at page size. A dimensioned-diagram demo is nearly buildable today
minus the dimension-line primitive.

## Proposed validation project
A gear-train worksheet + laser kit from one source: two meshing involute gears
with labelled tooth counts and a dimensioned four-bar linkage diagram —
exported both as a print PDF worksheet and a cuttable SVG.

## Population verification (2026-08-30)
**FIRST verified** (firstinspires.org, The 74): 530,000+ students/year across
61,000 teams in 85 countries — larger than the profile's ~100k US estimate;
two-thirds of US teams are school-linked with teachers as coaches ·
confidence **H for FIRST**. Total US STEM-teacher count not pinned this pass
(commonly cited ~200k+ math teachers alone) · confidence **L–M** — verify via
NCES in a deep dive.

## Top YouTube channels (as of 2026-08-31)
- [thang010146 (2,100 Animated Mechanical Mechanisms)](https://www.youtube.com/results?search_query=thang010146+mechanisms) (search link) — retired engineer Nguyen Duc Thang's 1,700+ animated gear/linkage/clutch/cam models; the de facto reference library for mechanism motion.
- [The FACTs of Mechanical Design](https://www.youtube.com/results?search_query=the+facts+of+mechanical+design) (search link) — mechanical-design skills and the mechanics behind everyday objects, explained visually.
- [Stuff Made Here](https://www.youtube.com/results?search_query=stuff+made+here) (search link) — Shane Wighton's invention builds (search results cite ~4.7M subscribers); the aspirational end of mechanism-engineering content.

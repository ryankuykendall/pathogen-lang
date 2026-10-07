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

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Unit-circle reference poster** — The trigonometry classroom staple: a
  circle with the sixteen standard angles marked in degrees and radians and
  their coordinates beside each point. First-class Angle values and calc()
  with pi place every ray exactly, text layers set the labels with real font
  metrics, and PDF export gives a page-size handout. It is a good first
  program for a teacher who scripts.
- **Geoboard and dot-paper pack** — Printable square dot paper and geoboard
  recording sheets are standard free math printables, used when the plastic
  boards run out. A Grid of small circles with a title is a few lines, and
  spacing or dots per board is a parameter, so one file yields the
  five-by-five and eleven-by-eleven versions as page-size PDFs.
- **Polygon and angle sorting cards** — A sheet of cards showing regular and
  irregular polygons and stars for students to cut out and sort by sides,
  symmetry or angle type. The polygon, star and arc stdlib draws the shapes,
  segment labels name the sides for callouts, and text layers caption each
  card. Changing the shape list regenerates the whole deck for another grade.

### Intermediate — several features, or one gap
- **Printable fraction strips** — Fraction tiles printed on colored paper and
  laminated are the budget manipulative every primary teacher makes: a whole
  bar, then halves through twelfths, each labelled. The layout is rectangles
  and text from one loop. Tiles only work if a third is truly a third of the
  whole on paper, so the project meets one general gap, physical units.
- **Tangram set with puzzle cards** — A tangram sheet to cut out, plus cards
  of silhouettes to rebuild: a classic resource with patterns, figures and
  solution sheets. The seven pieces are polygons defined once; each puzzle is
  a list of moves and rotations, drawn filled as the challenge and outlined as
  the solution. It combines polygons, Angle values, transforms, text and PDF
  pages, all shipped.
- **Versioned worksheet figures** — Teachers selling worksheets need several
  versions of one problem set, each with different numbers but identical
  layout. A deterministic hash picks side lengths and angles per version, the
  figure redraws to match, and segment labels carry the values, so the answer
  key cannot drift. Sharing those figure functions between worksheets as a
  diagram kit meets one general gap, modules.

### Advanced — depends on a named gap
- **Cardboard automata cam templates** — Cam toys, built from a box frame, a
  crank shaft and cams pushing followers, are a widely taught making lesson.
  Students need printable cam outlines, round, eccentric, snail and pear, at
  stated lift. It depends on dimension lines with auto-placed labels and on
  physical units so the printed cam matches the box. Parametric cam sheets
  would replace static PDFs.
- **Coordinate-plane graphing worksheets** — Blank and pre-plotted coordinate
  planes, number lines and function graphs with labelled axes fill math
  worksheets and textbooks. They depend on the axes, grid and tick-mark
  generators, and on math-notation text for exponents and subscripts in
  labels. Those two domain gaps are what separate Pathogen from TikZ here;
  closing them gives OER authors versionable figures without the hostile
  syntax.
- **Live slider-crank demonstration** — Turning a crank and watching a piston
  slide is the standard first mechanism in engineering classes and museum
  exhibits. Showing it live depends on parameter sliders in the playground,
  which the profile calls the product itself, and on linkage helpers to solve
  positions. A shareable, text-based mechanism demo is the GeoGebra role with
  source a class can read and change.

Sources: k12maker.mit.edu, cabaret.co.uk, stemteachers.asu.edu,
  quentinbolsee.pages.cba.mit.edu, fcit.usf.edu, kaplanco.com

## Top YouTube channels (as of 2026-08-31)
- [thang010146 (2,100 Animated Mechanical Mechanisms)](https://www.youtube.com/results?search_query=thang010146+mechanisms) (search link) — retired engineer Nguyen Duc Thang's 1,700+ animated gear/linkage/clutch/cam models; the de facto reference library for mechanism motion.
- [The FACTs of Mechanical Design](https://www.youtube.com/results?search_query=the+facts+of+mechanical+design) (search link) — mechanical-design skills and the mechanics behind everyday objects, explained visually.
- [Stuff Made Here](https://www.youtube.com/results?search_query=stuff+made+here) (search link) — Shane Wighton's invention builds (search results cite ~4.7M subscribers); the aspirational end of mechanism-engineering content.

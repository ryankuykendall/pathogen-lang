# Mosaic & Opus Layout

**Tier:** physical-output · **Rubric:** Pop 2 · Pain 3 · Fit 4 · GapCost 3 · Adopters 2 = **144** · Longlist C8

## Snapshot
Mosaic artists lay tesserae in named patterns (opus regulatum, palladianum,
vermiculatum) over a cartoon — layout templates, andamento flow lines, and
tile counts are computable geometry currently done on paper.

## Description
Craft mosaicists (glass/ceramic tesserae wall art, stepping stones,
tabletops) and community-studio students. Workflow: draw a cartoon, plan
andamento (the flow of tile courses), cut and place. Templates are
hand-drawn; tile-count estimation is guesswork. The adjacent commercial
world (2026 interior-design mosaic trends: hexagons, natural stone,
minimalism) is manufactured tile — the craft niche is smaller.

## Problems Pathogen could address
Opus patterns are procedural fills: regulatum is a grid, palladianum a
crazy-paving tessellation (Voronoi-adjacent), vermiculatum contour-follows
the cartoon — the latter being exactly variable-offset/flow-line territory
Pathogen handles. Cell-size-aware fills give tile counts and waste estimates
per colour zone. Grout-gap discipline is an offset parameter.

## Commercial value
Small: template/kit sellers, studio teaching materials, custom-commission
planning. Profiled as a fill-technique R&D domain — the procedural fills
built here (Voronoi paving, contour courses) serve terrain etch (A8), riso
texture (C4), and coloring interiors (C2).

## Missing features
### Domain-specific [D]
- Opus fill generators (grid, offset-brick, crazy-paving, contour-following
  courses over a zone)
- Tile count/area/waste estimation per colour zone
- Grout-gap-aware cell sizing
### General [G]
- Data import (cartoon images for zone tracing — later); physical units

## User base
Est. 50–200k active craft mosaicists (guilds, community studios, Etsy kit
buyers) · confidence **L, unverified**.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** mosaic guilds/associations, community-studio
  classes, Facebook mosaic groups, Etsy kit sellers; the loud 2026 signal is
  interior-design tile trends (hexagon, herringbone, natural stone,
  "less is more"), only obliquely relevant to the craft niche.
  (mecartworks.com, mytyles.com, imosaicart.com)
- **Obsessed with:** andamento quality, nipper technique, grout colour
  decisions.
- **Blog content angles:** (1) opus patterns as procedural fills — one zone,
  four classical layouts; (2) the tile-count estimate nobody wants to do by
  hand.

## Pathogen fit today
Variable-offset flow lines and Grid make contour courses plausible now;
crazy-paving needs a Voronoi-class generator ([D]). Kept mainly for its
technique spillover value.

## Proposed validation project
A stepping-stone template: cartoon zones filled with regulatum + contour
courses, grout gap applied, per-colour tile counts logged — print template
verified against a real layout session.

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Opus regulatum coaster template** — The usual first class project is a
  coaster or trivet laid with pre-cut square tiles in straight rows and
  columns. Grid draws the cells, a gap parameter stands in for the grout line,
  and each cell can take a fill colour so the print doubles as a colour plan.
  It is a ten-line program that produces something a student lays tiles
  directly on top of.
- **Opus sampler handout** — Teachers hand out a one-page key showing how
  regulatum, tessellatum and a single vermiculatum outline row differ. Two
  Grid variants, one with every other row shifted half a cell, plus one offset
  curve around a simple shape cover all three. Because the sheet is generated,
  a studio can redraw it at its own tile proportions instead of photocopying a
  diagram from a book.
- **Andamento flow-line study** — Before cutting anything, mosaicists sketch
  flow lines around the main motif to decide how the background rows will run.
  Offsetting a leaf or fish outline repeatedly gives evenly spaced contour
  courses, and variable offset lets the rows open up or tighten along the
  shape. Printed at template size, the lines guide placement; changing the
  spacing value shows the effect of a larger tessera.

### Intermediate — several features, or one gap
- **Mandala tabletop cartoon** — Round café tables with concentric, radially
  repeated rings are a favourite second project. Rotation and repetition build
  the rings from one wedge, and layers separate the colours. The design itself
  is straightforward; the single gap is physical units, because a cartoon has
  to print at the true diameter of the table and today that scale is set by
  hand at print time.
- **House-number plaque** — A weatherproof number plaque is a popular gift
  project: large numerals in one colour, an outline row around them, and a
  contrasting background. Text-to-path supplies the numerals as real outlines,
  offset draws the vermiculatum row that hugs them, and boolean operations cut
  the background zone. Nothing is missing here, but it is the first project
  that needs several features working together.
- **Greek-key border frame** — Roman-style borders such as the meander, the
  wave scroll and the guilloche frame countless tabletops and mirror
  surrounds. A single border unit repeated along each side, with a corner
  piece that must turn cleanly, is a good exercise in parametric repetition
  and in choosing a unit count that divides the edge exactly. The result is
  reusable around any rectangular panel.

### Advanced — depends on a named gap
- **Crazy-paving background** — Opus palladianum fills a background with
  irregular shards separated by an even grout line, which is how most
  broken-china and stained-glass-offcut mosaics are laid. Drawing those cells
  by hand defeats the purpose. The profile names a Voronoi-class crazy-paving
  generator among the missing opus fill generators [D]; with it, a seeded fill
  would give repeatable, evenly grouted shard layouts for any zone.
- **Class-kit tile estimator** — Community studios pre-pack tile kits for a
  dozen students making the same trivet in different colourways, and they
  guess the quantities. A design already knows the area of every colour zone,
  so counting tesserae and adding a waste allowance is arithmetic waiting to
  be exposed. Tile count, area and waste estimation per colour zone [D] is the
  gap and the saleable feature.
- **Pet-portrait cartoon from a photo** — Commissioned pet portraits start
  from a customer's photograph traced into colour zones, then filled with
  courses that follow the fur. The zone geometry and the contour rows fit
  Pathogen well, but the tracing step has no way in. Data import of cartoon
  images for zone tracing [G] is the gap the profile defers, and this is the
  project that would justify it.

Sources: helenmilesmosaics.org, themosaicstore.com.au,
  locallearningnetwork.org, craftcourses.com, isthmus.com

## Top YouTube channels (as of 2026-08-31)
- [Make it Mosaics](https://www.youtube.com/@MakeitMosaics) — Bonnie Fitzgerald & Kim Wozniak's tutorial channel: materials (including stained glass), design, grouting, and finishing.
- [Sue Smith Glass Mosaics](https://www.youtube.com/c/SueSmithGlassMosaics) — 17+ years of glass mosaic practice; project builds and technique videos.
- [Kasia Mosaics](https://www.youtube.com/results?search_query=Kasia+Mosaics) (search link) — stained glass mosaic artist known for process/time-lapse builds and beginner glass-cutting instruction.

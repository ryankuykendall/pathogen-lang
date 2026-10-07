# Luthiery & Instrument Templates

**Tier:** physical-output · **Rubric:** Pop 2 · Pain 4 · Fit 4 · GapCost 3 · Adopters 3 = **288** · Longlist A11

## Snapshot
Fret positions are the 12th root of 2 made physical — luthiery runs on
parametric math (scale lengths, fretboard tapers, radiused templates) that
builders currently get from calculators and static template sheets.

## Description
Guitar/ukulele/mandolin builders, from first-build hobbyists to small shops.
CNC is normalized (hybrid philosophy: machine precision + hand finishing);
fret slots cut to hundredths-of-a-mm tolerance. Tools: StewMac fret
calculators, printed templates, ProjectGuitar/CNCZone-shared DXFs, Fusion for
the CAD-fluent. Artifacts: fretboard slotting templates, body/headstock
routing templates, bracing layouts, rosette patterns, binding channels.

## Problems Pathogen could address
Everything derives from scale length: fret positions (equal-temperament
formula), taper (nut/bridge widths), marker-dot positions, slot depth vs
radius. Today builders combine a web calculator + manual CAD per instrument;
multi-scale (fanned-fret) instruments multiply the arithmetic. Rosettes are
radial parametric art (a Pathogen strength); bracing layouts are documented
geometry. One source generating slotting template + taper + dots for *any*
scale length is a genuine upgrade.

## Commercial value
Template/DXF packs sell (StewMac's business proves templates monetize);
lutherie schools; CNC-file marketplaces. Niche but high-commitment buyers
(a build costs hundreds in materials — template spend is easy).

## Missing features
### Domain-specific [D]
- Fret-position/taper generator (scale length, fret count, multi-scale fan)
- Slot-depth vs fretboard-radius awareness in annotations
- Rosette/binding channel parametrics
- Template output for both print-at-100% and CNC (DXF)
### General [G]
- Physical units (the domain is mm/inch bilingual); DXF export; number
  formatting (fret tables to 0.01 mm); modules (instrument-family presets)

## User base
Est. 100–300k active builders · proxy: ProjectGuitar/CNCZone forum scale,
r/Luthier (~100k+), kit-build market · confidence **L, unverified**.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** ProjectGuitar.com forums, CNCZone's musical-
  instrument board, r/Luthier, MIMF, YouTube build channels, StewMac's
  content orbit.
- **Talking about right now:** desktop CNC for luthiery is the live topic —
  fret slotting on CNC, small-machine builds, and the hybrid "CNC for
  precision, hands for soul" philosophy defending itself; guides positioning
  2026 as the year anyone-with-skill can produce professional results.
  (projectguitar.com, cncpioneer.com, mecsoft.com)
- **Obsessed with:** intonation accuracy, scale-length debates, tonewood,
  the CNC-vs-handwork identity question.
- **Blog content angles:** (1) "the fretboard is a formula" — any scale
  length, fanned frets included, one program; (2) rosettes as radial
  generative art; (3) print-vs-CNC template parity from one source.

## Pathogen fit today
The math is trivial in-language (calc, loops); exact-scale PDF works; radial
rosette art is a strength. DXF + units gate the CNC half.

## Proposed validation project
A fret-slotting + taper template: scale length and fret count in (fanned
optional), slotting template with taper, dots, and a 0.01 mm fret table out —
verified against StewMac's calculator values.

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Cigar box guitar fret strip** — Cigar box builders mark frets from a scale
  template, and makers describe a three-dollar homemade strip standing in for
  a forty-dollar bought one. Fret positions are the equal-temperament formula
  in a loop, drawn as lines across a narrow strip with marker dots. An
  exact-scale PDF taped to the neck is the whole deliverable, and any scale
  length is one number.
- **Rosette design sheet** — A soundhole rosette is concentric rings of
  repeated tiles: rope, herringbone, mosaic blocks. That is a loop around a
  circle, and radial generative art is a named Pathogen strength. A program
  varies ring count, tile shape and repeat number to produce a printed design
  sheet, or an engraving pattern for the builders who laser their rosettes.
- **Soprano ukulele half-template** — Body outlines are drawn as a half and
  flipped about the centreline so both sides match. A soprano ukulele half
  fits on one page. Curves define the upper bout, waist and lower bout from a
  few named widths, and an exact-scale PDF gives a pattern to glue onto
  template stock. Changing the widths gives the builder a new shape.

### Intermediate — several features, or one gap
- **Headstock routing template** — A headstock template carries the outline
  plus tuner hole centres, three a side or six in line. The outline is a
  mirrored curve and the holes are a spaced row, both simple today. The single
  gap is DXF export: builders with a CNC want the template cut in MDF or
  acrylic, and shared files in this community are DXF.
- **Fretboard radius gauges** — Radius gauges are small plates with arcs at
  the common fretboard radii, 7.25, 9.5, 12 and 16 inches, used to check a
  board while sanding. A loop over a radius list draws the set with engraved
  labels. The gap is physical units: the list is in inches, the stock in
  millimetres, and the domain works in both.
- **Ukulele family fret strips** — Soprano, concert, tenor and baritone
  ukuleles differ mainly in scale length, and a builder making several wants
  the same fret strip and body template for each. The math and the exact-scale
  PDF work now. The gap is modules, so that instrument-family presets live in
  one shared file that each template imports.

### Advanced — depends on a named gap
- **Rosette and binding channels** — Inlaying a rosette means routing a ring
  channel of exact width and depth around the soundhole, and binding needs a
  ledge of known size around the body edge. The decorative ring and the
  channel that receives it should come from one description. This depends on
  rosette and binding channel parametrics, a domain gap.
- **Compound-radius slot chart** — On a radiused or compound-radius fretboard
  a slot cut to constant depth from the crown is too shallow at the edges, so
  builders work out depth per fret. This depends on slot-depth versus
  fretboard-radius awareness in annotations, the domain gap that would print
  the required depth beside every slot on the template.
- **Electric body routing set** — Solid-body builders work from a stack of
  templates: body perimeter, neck pocket, pickup cavities and the control
  cavity. Paper builders print them full size; CNC builders cut them in MDF.
  This depends on template output for both print-at-100% and CNC, the domain
  gap that would produce both sets from one source.

Sources: cbgitty.com, cigarboxguitar.com, cigarboxnation.com, tdpri.com,
  crimsonguitars.com, philadelphialuthiertools.com, stewmac.com,
  forum.ukuleleunderground.com, instructables.com, luthiersforum.com

## Top YouTube channels (as of 2026-08-31)
- [Crimson Custom Guitars](https://www.youtube.com/@CrimsonCustomGuitars) — Ben Crowe's guitar-making tutorials and full custom-build video diaries; the standard on-ramp for aspiring builders
- [StewMac](https://www.youtube.com/channel/UCdr6rJVSSx54ByuY5U2ohTQ) — 50+ years supplying luthier tools and parts; technique and repair videos backed by deep trade knowledge
- [Tom Bills](https://www.youtube.com/results?search_query=Tom+Bills+luthier) (search link) — high-end handcrafted acoustic artistry from a builder with 20+ years experience

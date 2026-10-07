# Grid Crafts (Perler, Diamond Painting)

**Tier:** data-driven · **Rubric:** Pop 4 · Pain 3 · Fit 4 · GapCost 2 · Adopters 2 = **192** · Longlist E4

## Snapshot
Fuse-bead patterns and diamond-painting canvases are image-to-grid
conversions with commercial palette systems (DMC drills, Perler colors) —
free web generators already prove the computed-pattern demand; custom-canvas
sellers are the paying tier.

## Description
Perler/Hama bead crafters (pixel-art adjacent, heavily youth/nostalgia
coded), diamond painters (a mass-market kit craft), and the custom-canvas
sellers who convert customer photos into kits. Tools: MakeBead-class free
web generators (photo → pattern with DMC color matching, per-color drill
counts, printable PDF charts), kit manufacturers' internal pipelines.

## Problems Pathogen could address
The conversion pipeline is exactly Grid + palette math: image sampling,
nearest-color mapping against commercial palettes, dithering choices,
per-color counts and cost estimates, chart rendering with symbols
(cross-stitch's chart kit reused). Beyond photo conversion: *generative*
patterns (geometric, mandala-on-grid) are an underserved design space —
generators only do photos. Sellers need batch production and consistent
chart quality.

## Commercial value
Custom diamond-painting canvas sellers are an established Etsy tier;
pattern packs sell; kit manufacturers have real pipelines. Buyer population
mass-scale, seller tier the wedge.

## Missing features
### Domain-specific [D]
- Commercial palette data (DMC drills, Perler/Hama/Artkal colors) +
  nearest-color mapping and dithering options
- Chart kit with symbols, counts, and cost estimates (shared with B2
  cross-stitch)
- Board/canvas size presets (29×29 pegboards, standard canvas sizes)
### General [G]
- **Image import (the gate for the photo pipeline)**; CLI batch; number
  formatting

## User base
Diamond painting alone is a mass craft (multi-million participants; kit
market in the hundreds of millions of dollars); perler adds the pixel-art
crowd · confidence **M for scale, unverified**.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** r/diamondpainting and r/beadsprites, large
  Facebook kit groups, TikTok satisfying-process content, Etsy custom-kit
  sellers, MakeBead-class tool user bases.
- **Talking about right now:** free photo-to-pattern generators with DMC
  matching are now table stakes (MakeBead's suite); 2026 kit trends favor
  characters/animals/decor collections; community discussion lives in kit
  reviews and WIP shares more than tooling. (makebead.com, etsy.com
  markets)
- **Obsessed with:** drill/bead quality, color accuracy vs the photo,
  completion satisfaction content.
- **Blog content angles:** (1) generative patterns for a photo-only tool
  culture — mandalas on the grid; (2) the palette-mapping math explained;
  (3) chart quality as craft respect (symbols, counts, no guesswork).

## Pathogen fit today
Grid, palettes, chart rendering near-ready (shares B2's kit); the defining
photo pipeline is fully gated on image import (GapCost 2). Generative-
pattern content is viable now.

## Proposed validation project
A generative perler pattern line: geometric designs on 29×29 boards with
Perler palette mapping, symbol charts, per-color bead counts — one
physically beaded to verify chart usability.

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Geometric coaster set** — Coasters are a standard first fuse-bead project:
  a small square, a few colors, ironed flat. A set of four with related
  motifs, such as nested diamonds, checks and pinwheels, is a Grid with one
  color rule per cell and hand-picked colors. Pathogen draws each as a
  bead-per-cell chart, and one changed rule gives the next coaster in the set.
- **Mandala on a square board** — Symmetric mandalas are a staple
  diamond-painting and bead subject, yet photo converters cannot generate
  them. Compute one wedge from each cell's distance and angle, mirror it eight
  ways across the Grid, and the pattern is symmetric by construction. This is
  the generative design space the profile calls viable now: every variation is
  a new formula, with no source image required.
- **Keychain and magnet sprite sheet** — Small fruit, heart and animal sprites
  for keychains and fridge magnets fill every beginner pattern roundup. Each
  sprite is a tiny table of color choices typed inline and drawn as one circle
  per Grid cell. A page of twelve with text labels, exported as PDF, makes a
  printable pattern sheet, and shows Pathogen as a tidy chart renderer before
  any palette data exists.

### Intermediate — several features, or one gap
- **Multi-board tiled design** — Patterns larger than one 29×29 pegboard are
  built by joining square boards edge to edge. A generative design spanning a
  two-by-three layout needs the Grid, heavier rules at board seams and text
  numbering for rows and columns. Pattern and seams are shipped work; printing
  one clean page per board in a single run meets one general gap, CLI batch.
- **Seamless repeat pattern pack** — Pattern packs sell as bundles of related
  designs. Twenty tileable geometric repeats can come from one program:
  deterministic hashing chooses motif, rotation and color order for each seed,
  Grid renders the cells, and text captions name each design on a contact
  sheet. It is a combination of shipped features, and it serves the pack
  sellers whom photo-only generators leave out.
- **Dithered gradient wall panel** — A sunset-style fade between a few bead
  colors is a common large wall piece. A threshold pattern or deterministic
  noise decides which of two hand-picked colors each cell takes, so the fade
  is reproducible bead for bead. Grid, color choices and noise are all
  shipped; rendering the same fade as a series of panel sizes in one run meets
  one general gap, CLI batch.

### Advanced — depends on a named gap
- **Custom photo canvas kit** — The paying tier of this craft: a customer
  sends a pet or family photo and receives a printed canvas with drills.
  Everything starts with sampling the image, so it depends on image import,
  the gate the profile names for the whole photo pipeline. Once that lands,
  Pathogen's Grid does the sampling and the seller controls dithering, a
  choice free converters hide.
- **DMC-matched chart with drill counts** — A finished kit chart maps every
  cell to a DMC drill code, prints a symbol per color, and lists how many
  drills of each to bag. It depends on two domain gaps: commercial palette
  data with nearest-color mapping, and the chart kit with symbols, counts and
  cost estimates. Sharing that kit with cross-stitch is the opportunity, one
  investment serving two crafts.
- **Seller canvas batch run** — Etsy custom sellers offer each design in
  several canvas sizes and in square or round drills, and process orders in
  queues. Producing every size variant of every order unattended depends on
  canvas-size presets and on CLI batch. Consistent chart quality across a
  whole queue is what sellers lack today, and a scripted, versioned pipeline
  is a clear fit for Pathogen.

Sources: perlerpatterns.com, diydanielle.com, etsy.com, pressedandplaced.com

## Top YouTube channels (as of 2026-08-31)
- [Perler Bead Planet](https://www.youtube.com/c/PerlerBeadPlanet) — dedicated perler-bead tutorials, DIYs and tips; no longer posting actively but still the reference channel for the craft.
- [Diamond Painting By Doni](https://www.youtube.com/results?search_query=diamond+painting+by+doni) (search link) — positioned as the one-stop Q&A channel for diamond-painting technique and supplies.
- [Danielle Jones](https://www.youtube.com/results?search_query=danielle+jones+diamond+painting) (search link) — project-along tips channel (a roundup cited ~13k subscribers); representative of the diamond-painting community's process-video format.

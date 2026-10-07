# Cross-Stitch Charts

**Tier:** physical-output · **Rubric:** Pop 4 · Pain 3 · Fit 4 · GapCost 4 · Adopters 2 = **384** · Longlist B2

## Snapshot
Cross-stitch is grid-native craft at population scale — charts are coloured
grids with symbol overlays and a DMC palette — and Pathogen's Grid plus text
layers already speak most of the format.

## Description
A very large hobby population stitching from charts; designers sell PDF
patterns on Etsy and via pattern apps. Tools: PCStitch, WinStitch, Stitch
Fiddle (web), or hand-gridding. A chart is a cell grid where each cell maps to
a floss colour + print symbol, plus 10×10 gridlines, center marks, and a
legend with skein counts.

## Problems Pathogen could address
Designers work *around* their tools: image-to-chart converters produce noisy
100-colour messes that need manual palette reduction; parametric/geometric
designs (samplers, borders, blackwork fills) are placed cell-by-cell when they
are actually loops and symmetry. Legend/skein math is bookkeeping derivable
from the grid. Pathogen turns a sampler into code: motifs as functions,
borders as repeats, palette as data.

## Commercial value
Large PDF-pattern marketplace (Etsy cross-stitch is a top craft category);
designer tooling subscriptions (Stitch Fiddle model); kit sellers who need
charts + fabric/floss quantities computed.

## Missing features
### Domain-specific [D]
- Chart rendering kit: cell symbols, 10×10 rule weights, center marks, legend
  with DMC codes + skein estimates
- DMC/Anchor palette data + nearest-colour mapping
- Backstitch (line-on-grid) and fractional-stitch notation
- Multi-page chart splitting with overlap keys
### General [G]
- Data import (palette tables, image sampling for photo charts); number
  formatting; modules (motif/border libraries)

## User base
Multi-million hobby population (cross-stitch consistently ranks in top
needlecrafts; r/CrossStitch ~500k+) · designers the paying tier · confidence
**M for order of magnitude, unverified**. Adopter density low — but chart
*designers* use software daily.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** FlossTube (YouTube) and Twitch stitch-alongs are the
  cultural center; r/CrossStitch; ~50 active designer blogs; Etsy shops;
  Substack newsletters (BAD Stitch).
- **Talking about right now:** 2026 aesthetic shift to clean minimalist
  layouts, negative space "now tasteful rather than lazy," limited muted
  palettes, and *smaller finishable projects* — coordinating mini-sets over
  epics. (theartofstitch.com 2026 trends, knytstudio.com, lordlibidan.com)
- **Obsessed with:** palette curation, full-coverage vs minimalist debates,
  WIP finishing culture, chart readability in print.
- **Blog content angles:** (1) a mini-sampler *set* generated as coordinated
  variations — rides the small-project trend; (2) "negative space by
  construction" — geometric minimalist charts; (3) the legend that computes
  itself (skein math from the grid).

## Pathogen fit today
Grid is the substrate; color/palette types, text for symbols/legend, layers.
The chart-rendering conventions and DMC data are the whole gap — high
GapCost score (4) because it's mostly kit-building, not engine work.

## Proposed validation project
A parametric band sampler: motif functions repeated with symmetry, muted
palette, full chart kit output (symbols, gridlines, legend, skein counts) as a
print-ready PDF.

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Mini ornament chart** — Small finishable designs such as snowflakes,
  hearts and stars, on roughly twenty-by-twenty stitches, sell by the hundred
  in ornament books and beginner Etsy shops. A snowflake is one wedge mirrored
  around the centre, so a symmetry rule over a Grid fills the cells. Palette
  colours shade them and a text symbol sits in each cell. It is a plain chart,
  without a computed legend.
- **Repeating border strip** — Greek keys, zigzags, hearts and vines running
  around samplers and along towel bands. A border is one short repeat tiled
  along a line, with a corner unit where it turns, which makes it a loop
  instead of cell-by-cell placement. The Grid holds the cells, two or three
  palette colours fill them, and the repeat length and count are parameters a
  designer can change.
- **Biscornu top** — The eight-cornered pincushion is stitched as two small
  squares, and its designs are nearly always symmetric in four or eight
  directions. One triangular wedge of the Grid is drawn and the rest follows
  by reflection, so a mistake cannot break the symmetry. Layers hold colour
  cells beneath text symbols, and a limited palette suits the current taste
  for muted, quickly finished projects.

### Intermediate — several features, or one gap
- **Alphabet sampler** — Letters A to Z, often each with a small picture,
  remain a perennial sampler type and the base for personalised name
  pieces. Every letter is a small cell bitmap written as a motif function and
  laid out in rows on the Grid, with a border around them. The gap is modules:
  an alphabet is the motif library a designer most wants to reuse.
- **Coordinated mini-set** — Three or four small charts meant to hang
  together, in step with the move toward smaller projects and limited
  palettes. One motif function is called with different parameters, all
  drawing from a single palette value, so the set stays coordinated however
  often it is revised. It combines Grid, palette types, text symbols and
  layers, and needs nothing that is missing.
- **Beginner kit chart with stitch counts** — Kit sellers pack a chart with
  fabric and floss, and need the design size in stitches and the number of
  stitches in each colour. Both are counts over the Grid that a script can
  total. Printing them neatly beside the chart is where it stops: number
  formatting is the single general gap, and the DMC-coded legend still waits
  on the chart-rendering kit.

### Advanced — depends on a named gap
- **Blackwork fill sampler** — Blackwork uses repeating line patterns worked
  in backstitch along the grid's edges instead of filled crosses, and is sold
  as fill samplers, mini frames and biscornu sets. The fills are pure
  repeat-and-symmetry geometry, which suits Pathogen well. Backstitch, or
  line-on-grid, notation is the named gap: lines drawn between cell corners,
  charted and keyed alongside ordinary stitches.
- **Pet portrait from a photo** — Custom pet portraits are a standing
  commission product, and converters turn a photo into a noisy chart with far
  too many colours. A useful version reduces the image to a dozen floss
  colours on purpose. DMC and Anchor palette data with nearest-colour mapping
  is the gap named here, together with image sampling; the palette discipline
  is what incumbents handle badly.
- **Full-coverage chart across pages** — Large full-coverage pieces, with
  every cell stitched, run to hundreds of stitches a side and cannot be read
  on one sheet. Published charts split them over many pages, with shaded
  overlap rows and a key showing how the pages join. Multi-page chart
  splitting with overlap keys is the gap; it would let one Grid of any size
  become a printable booklet.

Sources: etsy.com, leisurearts.com, needlework-tips-and-techniques.com,
  woodartsupply.com, gumroad.com

## Top YouTube channels (as of 2026-08-31)
- [Peacock & Fig](https://www.youtube.com/channel/UCgmJnzKypmELKswQt2R2U5A) — Dana's tutorial-focused channel: cross stitch, blackwork, and embroidery techniques plus pattern-design behind-the-scenes — the best on-ramp before diving into FlossTube proper.
- [Cross Stitch the Globe](https://www.youtube.com/channel/UCTyD4_-gnJj7QsmUl-2hhQg) — classic FlossTube format: works-in-progress, finished objects, plans, and hauls.
- [The Flosstube Stitcher](https://www.youtube.com/@TheFlosstubeStitcher) — active FlossTube channel; representative of the 100+ channel community catalogued by the Stitching Jules and Stitching Daily directories.

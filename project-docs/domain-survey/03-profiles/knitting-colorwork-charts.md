# Knitting & Crochet Colorwork Charts

**Tier:** physical-output · **Rubric:** Pop 4 · Pain 3 · Fit 4 · GapCost 4 · Adopters 2 = **384** · Longlist B3

## Snapshot
Fair Isle, mosaic, and intarsia charts are grids with knitting-specific
rendering rules (stitch aspect ratio, in-the-round reading order, repeats) —
and 2026's gradient-colorwork trend is exactly a computed-palette story.

## Description
Knitters follow charts; designers publish patterns on Ravelry (the community
database, ~9M registered accounts) and their own sites. Tools: Stitch Fiddle,
Chart Minder, Excel, Illustrator. A chart encodes stitches on a grid that is
*not square* (knit stitches are wider than tall), read bottom-up, alternating
direction flat vs in-the-round, with repeat boxes and written-instruction
equivalents.

## Problems Pathogen could address
Chart tools don't understand garments: designers manually re-chart a yoke
motif for each size's stitch count, hand-place decreases, and eyeball how a
motif distorts on the true stitch aspect ratio. Parametric motifs that re-flow
to a size's stitch count, aspect-correct preview, and gradient palettes
computed from Color harmonies are all loops-and-types work. Mosaic knitting
has strict two-colour-per-row rules — checkable at compile time.

## Commercial value
Ravelry pattern sales are a mature indie economy ($5–9/pattern, top designers
full-time); yarn companies commission patterns; chart-tool subscriptions
exist (Stitch Fiddle model) proving designers pay for tooling.

## Missing features
### Domain-specific [D]
- Stitch-aspect grid rendering (configurable gauge ratio) + repeat boxes
- In-the-round vs flat numbering/reading conventions; written-instruction
  generation from the chart
- Mosaic-rule validation (two colours per row); intarsia bobbin estimates
- Size-graded motif reflow (motif fits N stitch counts)
### General [G]
- Data import (gauge/size tables); modules (motif libraries); number
  formatting for yardage

## User base
Very large: Ravelry ~9M registered accounts (active subset much smaller);
knitting consistently a top-3 fiber craft · confidence **M, unverified** —
Ravelry figure is well-documented but activity share is not. Designers are
the adopter wedge.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** Ravelry (database + forums, incl. "Year of Color
  2026" monthly colorwork blocks), Instagram, and — the 2026 shift — TikTok /
  YouTube Shorts as the *discovery* platform for new knitters; Substack
  pattern newsletters growing.
- **Talking about right now:** gradient colorwork is "the aesthetic of the
  2026 knit scene" (tonal fades, sunset transitions); colorwork moving beyond
  Scandinavian motifs into bold graphic designs; vintage-motif
  reinterpretation. (knitpro.eu 2026 trends, coastalknitsandpurls.com,
  ravelry.com)
- **Obsessed with:** gauge, yoke math, colour dominance/float management,
  hand-dyed yarn pairing.
- **Blog content angles:** (1) gradient colorwork chart with the palette
  *computed* (oklch fades) — dead center of the 2026 trend; (2) one motif,
  five sizes: parametric yoke reflow; (3) mosaic-rule checking as a compile
  error.

## Pathogen fit today
Grid, Color harmonies/oklch (gradient palettes are a existing strength),
text, layers. Gaps are rendering conventions + garment math — kit work, not
engine work (GapCost 4).

## Proposed validation project
A gradient-yoke chart: parametric motif on a gauge-true grid, oklch-computed
5-step fade, repeat box + legend, rendered for both flat and in-the-round
conventions.

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Peerie band chart** — Peeries are the narrow Fair Isle bands, a few rows
  tall with a repeat of four to eight stitches, that knitters use for a first
  stranded project on a hat brim or cuff. One repeat is a tiny Grid, tiled
  across by a loop, with two colours in any row. On square cells it is
  buildable now; the gauge-true grid arrives later.
- **Double-knit coaster chart** — Double knitting makes a reversible fabric
  with the colours swapped on the back, and a square coaster or potholder with
  one bold motif is the standard starter piece. The chart is a two-colour
  Grid, usually symmetric, so half is drawn and the rest mirrored. A second
  layer shows the reverse face with the palette swapped, and text labels the
  rows.
- **C2C crochet graphgan square** — Corner-to-corner crochet blankets are
  worked from pixel graphs in which every square is one block, sold as PDF
  graphgans of animals and seasonal motifs. The cells really are square, so
  the Grid matches the craft without a gauge correction. A motif rule fills
  the cells, a small palette built with Color harmonies colours them, and text
  numbers the diagonals.

### Intermediate — several features, or one gap
- **Selbu-style mitten chart** — Norwegian star mittens are charted as a
  shaped outline: back of hand, palm, a pointed top and a separate thumb, each
  with its own motif. The chart combines a Grid masked to the mitten shape,
  mirrored motifs for left and right hands, layers for the outline over the
  cells, and text for row numbers. It is several shipped features and no new
  ones.
- **Temperature blanket planner** — A year-long project in which each day's
  temperature picks that row's yarn colour; planners preview the stripes
  before any yarn is bought. Mapping temperature bands onto an oklch ramp and
  drawing 365 rows is easy Grid and Color work. The single gap is data import,
  since the year of daily temperatures has to come from a file instead of
  being typed in.
- **Colourway explorer** — Before buying yarn, knitters want the same hat or
  cowl chart shown in several colour combinations with believable contrast
  between pattern and background. One motif Grid is rendered a dozen times
  with palettes generated by Color harmonies and oklch lightness steps, set
  side by side on one sheet with text labels. It needs nothing missing and
  plays to an existing strength.

### Advanced — depends on a named gap
- **Mosaic cowl chart** — Mosaic knitting, named by Barbara Walker, uses
  slipped stitches so that only one colour is worked in any row, which makes
  it the gentlest colourwork there is. The rules about which stitches may be
  slipped are strict, and a chart that breaks them cannot be knitted.
  Mosaic-rule validation is the gap: report an illegal cell as a compile
  error, not after a ruined evening.
- **Intarsia picture panel** — Intarsia works large blocks of colour, such as
  a picture on a sweater front, with a separate bobbin of yarn for each
  region. Before starting, the knitter must wind those bobbins and guess the
  lengths. Intarsia bobbin estimates are the named gap: count the regions and
  the stitches in each straight from the chart Grid, and print a winding list
  beside the pattern.
- **Stranded hat in five sizes** — A colourwork hat graded from baby to large
  adult changes its stitch count with each size, so the motif repeat must
  divide evenly and the crown decreases must land between motifs. Designers
  re-chart every size by hand. Size-graded motif reflow is the gap: one
  parametric motif that fits each size's stitch count and reports any size it
  cannot fit.

Sources: ravelry.com, payhip.com, ribblr.com, gumroad.com, books.apple.com,
  shop.crystalbridges.org

## Top YouTube channels (as of 2026-08-31)
- [VeryPink Knits](https://www.youtube.com/@verypinkknits) — Staci Perry's technique-focused tutorials with some of the highest production value on knitting YouTube; eases knitters into colorwork, cables, socks, and sweaters.
- [Studio Knit](https://www.youtube.com/playlist?list=PLUFn5w_e6iu-go27q8HLsii2QKjaCTCWT) — dedicated colorwork patterns-and-stitches playlist (channel's colorwork hub); strong on chart-driven stitch patterns.
- [Marly Bird](https://www.youtube.com/results?search_query=Marly+Bird+knitting) (search link) — detailed close-up technique teaching; colorwork videos cover managing two yarns, reading charts, and float tension.

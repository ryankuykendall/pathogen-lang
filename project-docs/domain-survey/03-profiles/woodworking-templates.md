# Woodworking Templates & Jigs

**Tier:** physical-output · **Rubric:** Pop 4 · Pain 3 · Fit 3 · GapCost 3 · Adopters 3 = **324** · Longlist A7

## Snapshot
Router templates, joinery jigs, and full-size printed plans are exact-scale
geometry sold as digital files — a large population whose template economy
already spans Etsy PDFs, DXF packs, and 3D-printable jigs.

## Description
Hobby and professional woodworkers using printed full-size templates (spoon
carving, chair parts), router templates (corner radius, inlay, joinery), and
shop-made jigs. The file economy: Etsy template PDFs/SVGs, creator-brand plan
shops (3x3 Custom's jig plans+templates model), Printables/thingiverse jig
STLs, DXF packs for CNC owners. r/woodworking is one of the largest craft
subreddits.

## Problems Pathogen could address
Templates are parametric in obvious ways incumbents ignore: a corner-radius
jig *set* is one shape at N radii; a box-joint template is finger width ×
count × material thickness; full-size plans need print-at-100% verification
squares and multi-page tiling. Router work needs bushing-offset compensation
(template edge ≠ cut edge — a fixed offset by bushing/bit combo) that
designers compute by hand today.

## Commercial value
Plan/template sales are a proven creator business (YouTube woodworkers
monetize plans directly); Etsy template category is deep; CNC DXF packs sell.
Parametric "any dimensions" plans are a visible upgrade over fixed-size PDFs.

## Missing features
### Domain-specific [D]
- Bushing/bit offset math as a first-class idiom (template vs cut line)
- Joinery generators: box joint, dovetail layout (angle + spacing), mortise
  spacing
- Full-size multi-page tiled printing with registration + 100% test square
- Dimension/annotation kit for plan drawings
### General [G]
- Physical units (non-negotiable); DXF export; modules (jig libraries);
  number formatting for cut lists

## User base
r/woodworking ~6M+ subscribers (well-documented, though mostly spectators);
active template-buying woodworkers plausibly 1M+ · confidence **M for order
of magnitude, unverified**.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** r/woodworking and r/BeginnerWoodWorking, YouTube
  creator ecosystem (plans as the monetization layer), Etsy/creator plan
  shops, Printables for jig STLs, forums (Sawmill Creek, LumberJocks).
- **Talking about right now:** the jig economy is going digital-multi-format —
  the same creators sell PDF plans, SVG/DXF, and 3D-printable jig files;
  corner-radius and joinery template sets are marketplace staples.
  (3x3custom.com, printables.com, etsy.com markets, infinitytools.com)
- **Obsessed with:** repeatability, tear-out-free clean cuts, shop-made vs
  bought jig debates, cut-list optimization.
- **Blog content angles:** (1) a box-joint template parameterized by finger
  width + stock thickness with bushing offset computed; (2) print-at-100%
  full-size plan tiling done right; (3) one design → PDF + SVG + DXF, the
  multi-format story creators need.

## Pathogen fit today
Geometry + offset() (straight edges) + PDF page sizes work now; tiled
multi-page print, units, and DXF are the gates. Fit is 3 not 4 because much
woodworking value is 3D (out of scope) — the 2D template slice is the wedge.

## Proposed validation project
A parametric corner-radius + box-joint template set: radii series and finger
joints from stock thickness, bushing offset applied, output as tiled 100%-scale
PDF and DXF — cut one physically to verify fit.

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Spoon and spatula blanks** — Tracing templates for kitchen utensils are
  sold as printable PDFs and as laser-cut acrylic. A blank is two curved
  profiles, top and side, driven by a few proportions: bowl width, neck width,
  handle length. One program draws the family on a single PDF page to trace
  onto stock before bandsawing. Proportion matters more than exact size here,
  so missing units do not block it.
- **Bandsaw box pattern** — A bandsaw box starts as a paper pattern glued to a
  block: a free-form outer outline with drawer openings drawn inside it. The
  outline is curve geometry and each drawer opening is its own shape, so a
  short program produces a printable pattern, and changing three numbers gives
  a different box. A single PDF page holds a typical pattern.
- **Serving board outline** — Paddle-shaped serving and cutting boards are
  traced from a pattern, the handle drilled at its base and the perimeter
  bandsawn. The pattern is one closed outline with a handle, shoulder curves
  and a hang hole. Drawing it as geometry with named proportions gives a
  printable page per variation, and a maker can keep a whole range of board
  shapes in one file.

### Intermediate — several features, or one gap
- **Butterfly key inlay template** — Bow-tie keys that bridge a crack in a
  slab are routed with a template and a guide bushing. The key is all straight
  edges, so offset() already produces the template opening from the key
  outline. The single gap is physical units: the offset must equal the
  bushing-to-bit difference in real millimetres or inches, and today that is
  only a number on trust.
- **Push-stick and shop-helper pack** — Push sticks, push blocks and
  featherboards are the classic first shop-made safety aids, traced from free
  patterns. A pack of them is simple curve and straight-edge geometry that
  prints on PDF pages now. The one gap is DXF export: CNC owners expect the
  same pack as DXF, and creators already sell plans in both formats side by
  side.
- **Keepsake box plan with cut list** — Small box plans sell steadily, and
  buyers want a drawing plus a cut list. The panels are rectangles derived
  from length, width, height and stock thickness, laid out on a PDF page. The
  gap is number formatting for cut lists: derived dimensions need to print as
  tidy fractions or fixed decimals before a parametric, any-size plan can
  replace a fixed PDF.

### Advanced — depends on a named gap
- **Adirondack chair full-size patterns** — Full-size chair patterns are a
  staple of the plan trade: back slats, arms and legs traced at one-to-one
  scale from sheets far larger than a printer page. This depends on full-size
  multi-page tiled printing with registration marks and a 100% test square,
  the domain gap that would let a buyer print, tape and trust a pattern at
  home.
- **Dovetail marking templates** — Dovetail markers and layout templates set
  the slope, commonly 1:6 or 1:8, and the spacing of tails across a board. The
  geometry is angle plus spacing recomputed for each board width. This depends
  on joinery generators, the domain gap covering dovetail layout, which would
  produce a marking template or a routing template for any board from two
  numbers.
- **Curved inlay template pairs** — Router inlay kits cut a recess and a
  matching plug from one template by swapping a collar on the bushing. For
  hearts, leaves and other curved shapes the template must be offset from the
  finished line by an exact amount. This depends on bushing and bit offset
  math as a first-class idiom, beyond today's straight-edge offset().

Sources: etsy.com, jeffmacksupply.com, rockler.com, woodcraft.com,
  woodworkersjournal.com, lostartpress.com, popularwoodworking.com,
  sawmillcreek.org

## Top YouTube channels (as of 2026-08-31)
- [3x3 Custom](https://www.youtube.com/results?search_query=3x3+Custom+Tamar) (search link) — Tamar's channel of clever jig builds and template-driven joinery; the closest match to template/jig-oriented work
- [Izzy Swan](https://www.youtube.com/results?search_query=Izzy+Swan+woodworking) (search link) — jigs, contraptions, and money-saving shop solutions
- [The Wood Whisperer](https://www.youtube.com/results?search_query=The+Wood+Whisperer) (search link) — Marc Spagnuolo's long-running education channel with downloadable project and jig plans

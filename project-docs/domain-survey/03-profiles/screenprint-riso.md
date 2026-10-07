# Screen-Print & Riso Separations

**Tier:** physical-output · **Rubric:** Pop 3 · Pain 3 · Fit 3 · GapCost 3 · Adopters 3 = **243** · Longlist C4

## Snapshot
Zine, poster, and merch printers separate artwork into per-ink layers with
registration — and the riso revival's 2026 self-story ("tactile imperfection
against AI gloss") plus its community-built separation tool (Spectrolite)
prove both the audience and the tooling appetite.

## Description
Screen printers (band merch, art prints, shirts) and risograph studios
(zines, art books) working in spot-color layers: each ink = one stencil/
master. Fluorescent riso inks that CMYK can't reproduce are a signature.
Tools: Photoshop/Illustrator channel juggling, Spectrolite (the riso
community's free separation app), stencil.wiki knowledge base. Community-run
riso studios are cultural hubs.

## Problems Pathogen could address
Generative spot-color art *born separated*: a Pathogen program whose layers
ARE the ink layers skips the separation step entirely — registration marks,
trap/overlap allowances (spread ink slightly under adjacent layers), and
ink-count constraints become compile-time properties. Halftone/dither
patterns for photographic texture are procedural fills. Layered-poster
variant editions (same composition, swapped ink pairs) are parameter sweeps.

## Commercial value
Print-studio service work, poster/zine editions, workshop education;
Spectrolite's adoption shows free tooling spreads fast here — value is
adoption and culture more than file sales.

## Missing features
### Domain-specific [D]
- Halftone/dither procedural fills (AM dots, stochastic) at ink resolution
- Trap/choke allowances between adjacent ink layers
- Riso ink palette data (soy ink colors incl. fluorescents) + overprint
  simulation preview
- Per-layer grayscale master export conventions
### General [G]
- CLI batch (edition variants); modules (texture libraries); number
  formatting

## User base
Est. 200k–500k active screen printers + riso community (hundreds of studios
worldwide, growing) · confidence **L, unverified**. Riso crowd skews
designer/code-curious — good adopters.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** stencil.wiki, riso studio Discords/Instagram,
  People of Print, r/SCREENPRINTING, community print shops, zine fests.
- **Talking about right now:** the riso aesthetic's 2026 resurgence framed
  explicitly against AI-generated perfection; Spectrolite as standard
  separation tooling; fluorescent-ink love; community studios as
  collaboration spaces. (kpbs.org, illustration.app, stencil.wiki,
  cyoo.substack.com)
- **Obsessed with:** registration drift as charm-vs-flaw, ink overprint
  colors, paper stock, edition documentation.
- **Blog content angles:** (1) "art born separated" — generative posters
  whose layers are the inks; (2) overprint simulation with oklch mixing;
  (3) a two-ink zine cover edition with swapped-ink variants.

## Pathogen fit today
Layers-as-inks, generative art, registration marks, color system — strong;
halftones and overprint preview are the [D] work. Same anti-AI-provenance
narrative as plotters — the communities overlap.

## Proposed validation project
A three-ink riso poster: generative composition with layers as fluorescent
pink / blue / black masters, traps applied, registration marks — printed at a
community riso studio.

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Two-colour riso print** — The standard first job at a riso studio
  workshop: one sheet, two inks, each ink supplied as its own layer. A
  generative composition of flat shapes with one layer per ink and
  registration marks on both needs no separation step. Overlaps between the
  two layers produce the third colour that makes riso prints recognisable.
- **One-colour tote or tee graphic** — Beginner screen printing starts with
  one bold design on a tote bag or shirt, printed from a single screen. A
  generative mark with solid shapes and no fine detail exports as one black
  layer for the film positive. Regenerating variations of the graphic gives a
  small run of related designs from one program.
- **Postcard pattern set** — A set of four or six A6 postcards in two inks,
  sharing a visual system but differing in arrangement, is a common first
  edition for sale at zine fairs. One composition routine with a changing seed
  gives the set, layers are the inks, and the colour system previews likely
  ink pairs on screen.

### Intermediate — several features, or one gap
- **Printer's wall calendar** — Riso studios publish calendars every year,
  often twelve sheets each with a different two-ink design. Date grids come
  from Grid and text, artwork from a generative routine, and layers stay as
  inks with registration marks throughout. It combines most of the shipped
  features in one product without needing anything listed as missing.
- **Swapped-ink poster edition** — An edition where the same composition is
  printed in several ink pairings — pink and blue, then yellow and teal —
  numbered as variants. The composition is fixed and the ink assignment is a
  parameter. Producing every variant's masters in one run is where the CLI
  batch gap shows; today each variant is exported by hand.
- **Eight-page single-sheet zine** — The beginner zine format taught at
  community print workshops: eight pages printed on one side of a sheet,
  folded and cut, in two colours. Imposition means placing eight panels with
  half of them rotated, on two ink layers. Transforms, text and layers handle
  it, and page content can be generated or drawn.

### Advanced — depends on a named gap
- **Ink swatch and overprint chart** — Studios print reference charts showing
  every ink at several densities and every two-ink overprint, and publish them
  as small colour books. A chart is a Grid of patches, simple to lay out.
  Making the screen preview honest depends on the riso ink palette data and
  overprint simulation listed as missing — the piece the community most often
  builds for itself.
- **Halftone gig poster** — Screen-printed gig posters lean on halftone dots
  for gradients and photographic texture within two or three inks. Dot size
  varies with tone and each ink uses its own screen angle. Generating those
  dots at ink resolution depends on the halftone and dither procedural fills
  listed as missing, the largest domain-specific gap for this craft.
- **Multi-signature art book masters** — A riso art book runs to dozens of
  pages in three or four inks, and each ink on each sheet is sent to the
  machine as a separate grayscale file. Preparing and naming them is tedious
  and error-prone. Exporting them from layers depends on the per-layer
  grayscale master export conventions listed as missing.

Sources: straypages.substack.com, perimeterbooks.com, monikerpress.ca,
  community-print.org, girlsgarage.org, skillshare.com

## Top YouTube channels (as of 2026-08-31)
- [Catspit Productions](https://www.youtube.com/user/CatspitProductions) — Jonathan Monaco's long-running free how-to screenprinting library, from screen prep through production runs; the classic self-teaching resource.
- [Mikey Designs & Silk Screen](https://www.youtube.com/@mikeydesignssilkscreen473) — straightforward, approachable screen printing tutorials for small-shop printers.
- [RhyBeats](https://www.youtube.com/results?search_query=RhyBeats+screen+printing) (search link) — near-daily live videos spanning screen printing, vinyl, heat transfer, DTF, and embroidery.
- *Risograph specifically has thin dedicated-channel presence; coverage is one-off riso tutorials (e.g., GOCCOPRO T-shirt riso printing) rather than sustained channels.*

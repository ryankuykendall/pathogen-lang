# Hobby Die-Cutting (Cricut / Silhouette cut files)

**Tier:** physical-output · **Rubric:** Pop 5 · Pain 3 · Fit 3 · GapCost 3 · Adopters 2 = **270**

## Snapshot
The largest SVG-consuming craft population on earth — home crafters cutting
vinyl, cardstock, HTV, and stickers — served by a seller economy that
hand-builds every layered, offset, sized variant in Illustrator.

## Description
Cricut and Silhouette machine owners making decals, layered cardstock art,
heat-transfer shirts, sticker sheets, and party goods. Buyers get files from
Etsy / Creative Fabrica / Design Bundles; sellers produce them in Illustrator,
Affinity, or Inkscape, then hand-verify them against Design Space / Silhouette
Studio quirks. The machines' native interchange format is SVG.

## Problems Pathogen could address
Sellers' recurring chores are exactly Pathogen's primitives: welded text on a
path, offset outlines around compound shapes (sticker borders, shadow layers),
per-colour layer separation, sizing variants of one design, print-then-cut
bleed. Each is manual, repeated per design, per size, per colourway. A
parametric source file that emits the whole product line is a step-change for
the seller side; buyers never need to see code.

## Commercial value
The biggest file marketplace of any surveyed domain — SVG bundles sell in the
millions of listings. Pathogen value concentrates in the seller/designer tier:
one script → 50 colourways/sizes → zip. Secondary: font/motif asset packs,
"verified Cricut-safe" as a trust mark.

## Missing features
### Domain-specific [D]
- Machine export profiles: Cricut's 72-dpi scaling quirk, no-stroke
  compound-path conventions, layer-per-colour file splitting, print-then-cut
  bleed and registration
- **Rock-solid `offset()` on text outlines and curves** — the garment-post bug
  class (spiked, distorted rings) is fatal in this domain
- Sticker-sheet nesting; multi-size variant export in one command
### General [G]
- CLI batch export (the product-line story); modules for reusable motifs;
  number formatting for listed dimensions

## User base
Est. 10M+ machine owners · proxy: Cricut's reported ~5–9M engaged users +
Silhouette install base; r/cricut ~1M members · confidence **M for order of
magnitude, unverified**. Early-adopter density low among buyers — the wedge is
the tens of thousands of sellers, who are tool-motivated.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** r/cricut (~1M), massive Facebook groups, Cricut
  Community forums, Etsy seller forums, YouTube/Instagram/Pinterest craft
  channels, Design Bundles / Creative Fabrica communities.
- **Talking about right now:** the Design Space UI overhaul of Feb 2026 (tools
  moved into a collapsible Edit panel) drew thousands of complaints and a
  partial reversal in the June 2026 update — software churn and lock-in are the
  live grievance. Buyers are increasingly vocal about low-quality/generic SVG
  files on marketplaces. Trending projects: layered 3D shadow boxes, glass-cup
  vinyl and UV DTF wraps. (dinosaurmama.com Feb+Jun 2026 update explainers,
  wiccatdesigns.com trends)
- **Obsessed with:** file quality and "will it cut clean," subscription and
  app-dependence resentment, machine comparisons, seasonal product cycles
  (holiday SVG drops).
- **Blog content angles:** (1) "your design source shouldn't live inside an app
  that changes under you" — parametric SVG source as insurance against UI
  churn; (2) anatomy of a *quality* layered shadow-box file, generated; (3) one
  script → a full seasonal colourway line for sellers.

## Pathogen fit today
Text-to-path with any Google Font, boolean ops for welding, layers per colour,
markers, SVG export with fonts baked in, deterministic output. The gap between
"nearly" and "reliably" is mostly `offset()` robustness + export profiles.

## Proposed validation project
A sticker-sheet product line: one motif script → welded text + offset border →
nested sheet → per-colour layers → sized variants — verified importing cleanly
into Design Space and Silhouette Studio.

## Population verification (2026-08-30)
**Verified via Cricut investor filings** (investor.cricut.com): FY2025 ended
with ~5.9M Active Users, ~3.7M 90-Day Engaged Users, 3.09M Paid Subscribers;
Q1 2026 ~6.0M Active Users (+1% YoY); Q2 2026 subscribers 3.10M with
double-digit machine sell-out growth. Cricut alone supports the 5–9M claim;
with Silhouette/Brother the 10M+ owner estimate is reasonable · confidence
**H for Cricut figures, M for the total**.

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Welded script name decal** — A name in a script font, welded so the
  letters cut as one piece, is the first vinyl project most owners make for a
  bottle or laptop. Text-to-path with any Google Font plus a boolean union
  does exactly that, and the SVG carries no font dependency. The name is a
  parameter, so one file serves every customer.
- **Name cake topper** — Cardstock cake and cupcake toppers are quick party
  projects: a welded greeting or name joined to a pair of stakes. Text-to-path
  gives the lettering and boolean ops weld it to the stakes and a baseline bar
  so it cuts as one sturdy piece. Changing the name or the font is a one-line
  edit.
- **Two-colour pantry labels** — Labelling jars and bins is a standard starter
  project: a word inside a frame, often in two vinyl colours. Text-to-path
  sets the word, boolean ops shape the frame, and each colour sits on its own
  layer for separate mats. A list of words in the file yields the whole pantry
  set with consistent spacing.

### Intermediate — several features, or one gap
- **Layered mandala** — Layered cardstock mandalas, often seven sheets stacked
  for depth, are consistent best sellers. Each layer is a radial pattern with
  openings that grow or shrink from the layer above. That combines loops,
  boolean ops and a layer per sheet, all shipped, in one program. It has no
  single blocking gap, only more moving parts than a beginner file.
- **Party topper colourways** — A seller lists one cupcake topper design in
  several sizes and a dozen colourways for different party themes.
  Text-to-path, welding and layers per colour describe the design well today.
  The one gap is CLI batch export, which would turn that one source into the
  full listing in a single command.
- **Seasonal motif bundle** — Holiday SVG drops reuse the same elements, a
  snowflake, a holly sprig, a frame, across dozens of designs. Each design is
  text, boolean ops and layers. The gap is modules for reusable motifs: a
  shared motif file that every design in the bundle imports keeps the drop
  consistent and makes next year's update one edit.

### Advanced — depends on a named gap
- **Shadow-layer text decal** — The most requested lettering effect is a
  shadow layer: the welded word again, grown outward into a smooth backing
  shape in a second colour. That is an outline offset around text. This
  depends on rock-solid offset() on text outlines and curves, the domain gap,
  because a spiked or distorted ring is unsellable.
- **Layered shadow box** — Shadow boxes stack five or more cardstock frames
  with spacers, each sheet cut from its own file at an exact size. Buyers
  complain loudly when a file imports at the wrong scale. This depends on
  machine export profiles, the domain gap covering the 72-dpi scaling quirk
  and layer-per-colour file splitting.
- **Shirt design size run** — Heat-transfer designs are sold sized for infant,
  youth and adult shirts, each a separate file in the buyer's download.
  Sellers resize and re-export each one by hand today. This depends on
  multi-size variant export in one command, the domain gap that would emit the
  whole size run from one design.

Sources: jennifermaker.com, sustainmycrafthabit.com, designbundles.net,
  thehomesihavemade.com, hobbycraft.co.uk, etsy.com

## Top YouTube channels (as of 2026-08-31)
- [Cricut](https://www.youtube.com/OfficialCricut) — the official channel; Design Space walkthroughs, machine onboarding, and project tutorials straight from the vendor.
- [Kerri Crafts It](https://www.youtube.com/channel/UCvq_qe2vAtV24IMia15geFQ) — Kerri Adamczyk, author of *Cricut For Dummies*; Cricut projects plus laser engraving and sublimation, beginner-friendly.
- [Makers Gonna Learn](https://www.youtube.com/results?search_query=Makers+Gonna+Learn+Cricut) (search link) — large tutorial/membership channel covering Cricut machines, Design Space, and building a business with a die-cutting machine.

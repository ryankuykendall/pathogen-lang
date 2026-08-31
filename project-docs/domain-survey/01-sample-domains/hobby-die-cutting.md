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

## Top YouTube channels (as of 2026-08-31)
- [Cricut](https://www.youtube.com/OfficialCricut) — the official channel; Design Space walkthroughs, machine onboarding, and project tutorials straight from the vendor.
- [Kerri Crafts It](https://www.youtube.com/channel/UCvq_qe2vAtV24IMia15geFQ) — Kerri Adamczyk, author of *Cricut For Dummies*; Cricut projects plus laser engraving and sublimation, beginner-friendly.
- [Makers Gonna Learn](https://www.youtube.com/results?search_query=Makers+Gonna+Learn+Cricut) (search link) — large tutorial/membership channel covering Cricut machines, Design Space, and building a business with a die-cutting machine.

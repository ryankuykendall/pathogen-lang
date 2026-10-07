# CNC Router & Plasma Cutting

**Tier:** physical-output · **Rubric:** Pop 3 · Pain 3 · Fit 3 · GapCost 2 · Adopters 4 = **216** · Longlist A17

## Snapshot
Hobby CNC routers and plasma tables run on a DXF-file economy — dedicated
marketplaces sell decorative cut-file packs — and every seller's catalog is
variations-on-a-parametric-theme made by hand.

## Description
Garage/small-shop owners running router tables (VCarve-dominated workflow:
signs, carvings, joinery) and plasma tables (metal art, brackets, fire pits,
ranch signs). The file economy is explicit: DXF marketplaces (dxfdownloads,
CADtsy-class sites) sell art packs; machines ship with "thousands of DXF
files" as a selling point. Design: VCarve/Aspire, Fusion, Inkscape→DXF.

## Problems Pathogen could address
The seller side hand-produces file *families*: the same ranch sign at 12
sizes, name-personalized versions, bracket series across bolt patterns.
Plasma has domain math designers apply manually: kerf by material/amperage,
lead-in/lead-out placement, small-hole minimums, tab (tabbing parts into
sheets) rules. Personalized-sign generation (name + motif + border) is a
parametric product line begging for batch tooling.

## Commercial value
DXF pack sellers, personalized-sign Etsy businesses (metal monograms are a
staple), bracket/part generators for fab shops. Transactional, file-native,
proven willingness to pay for files.

## Missing features
### Domain-specific [D]
- Plasma-aware geometry rules: kerf tables, lead-in/out generation,
  min-hole-diameter validation, holding tabs
- V-carve-aware output conventions (open vs closed vector discipline)
- Personalization batch pipeline (names list → sign series)
### General [G]
- **DXF export (absolute gate)**; physical units; data import (name lists,
  kerf tables); CLI batch; sheet nesting

## User base
Est. 500k–1M hobby/small-shop CNC+plasma owners in North America · proxy:
machine-seller volume, Garage Journal/Hobby-Machinist thread scale, DXF
marketplace depth · confidence **L, unverified**.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** Garage Journal's long-running hobby plasma thread,
  Hobby-Machinist forums, VCarve/Vectric user forums, manufacturer
  communities (Langmuir is the hobby-plasma community heavyweight), DXF
  marketplaces.
- **Talking about right now:** 2026 buyer discourse centers on the cutting
  area/accuracy/cost triangle; machines marketed with bundled DXF libraries;
  VCarve remains the software default with DXF as the universal interchange.
  (garagejournal.com, hobby-machinist.com, shopsabre.com, cadtsy.com)
- **Obsessed with:** dialing consumables/feeds, dross-free edges, "what sells
  at the market" threads.
- **Blog content angles:** (1) one ranch-sign design → 50 personalized DXFs,
  the batch story; (2) plasma rules as compile checks (min holes, lead-ins);
  (3) a parametric bracket family across bolt patterns.

## Pathogen fit today
Geometry/text/motifs are ready; without DXF export the domain is unreachable
(GapCost 2). Fit 3 because toolpath-adjacent concerns (lead-ins, tabs) push
past pure geometry.

## Proposed validation project
A personalized-sign generator: name + motif + border parameters, plasma
rules validated, batch of 10 from a CSV (once data import lands) — cut one
on a community member's table.

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **V-bit depth chart** — Router owners pin up a chart showing how deep a 30,
  60, 90 or 120 degree V-bit sinks for a given line width, because that
  decides whether lettering cuts through thin stock. Each bit is a triangle
  whose depth follows from the angle by one line of trigonometry, drawn in
  cross-section with labels. It is a wall print for the shop, readable at any
  size.
- **Font-choice listing image** — Personalized-sign listings show buyers the
  lettering styles on offer as one image: the same sample name set in each
  font, numbered, with a border option or two alongside. Text, borders and a
  simple layout produce it, and a loop over font names fills the sheet. It is
  a screen graphic for the shop page, complete as an image, and nothing is cut
  from it.

### Intermediate — several features, or one gap
- **Yard-art silhouette** — Garden stakes and seasonal yard art are
  single-piece silhouettes with interior cutouts held by bridges. Drawing a
  motif and checking that every island stays attached is geometry work
  Pathogen handles now. The known dependency is DXF export, since the plasma
  table's software takes nothing else; until then the SVG is converted outside
  Pathogen, as Inkscape users already do, and re-checked for broken curves.
- **Carved sign layout** — V-carved wooden signs are a familiar router
  project: a line or two of lettering, a border, perhaps a motif. Text and
  geometry lay that out, and one file redraws for a new name. The known
  dependency is DXF export, because the router software builds its toolpaths
  from imported vectors; until then each sign is converted by hand before it
  can be carved.
- **Address sign size series** — Address and ranch signs are listed at many
  widths, each a redraw so that letter strokes and bridges stay cuttable. With
  text, motif and border in one program the series is a loop over width. The
  single gap is physical units: a listing promises 24 inches, and stroke
  minimums are stated in real dimensions.
- **Seasonal decoration pack** — File sellers publish packs: a dozen patriotic
  or holiday designs released together, each at a couple of sizes. Motifs and
  text are ready, and one parametric source can describe the pack. The gap is
  CLI batch, without which every file in a pack is exported one at a time
  before each season.

### Advanced — depends on a named gap
- **Slot-together fire pit** — Fire pits are among the most common plasma
  files: flat panels with scenic cutouts that slot together at the corners.
  The slots must match plate thickness plus the width the arc removes. This
  depends on kerf tables, part of the plasma-aware geometry rules domain gap,
  which would size every slot by material and amperage.
- **Bracket and hook family** — Mounting brackets, tool-holder tabs and hooks
  with speed holes sell as families across bolt patterns. Plasma cannot cut a
  hole much smaller than the plate is thick, so some variants in a family
  silently fail. This depends on min-hole-diameter validation, the domain gap
  that would reject a bad variant at compile time.
- **Catch-all tray** — Valet trays are a standard router project built from a
  pocket and an outline. Router software treats closed vectors as pockets and
  open vectors as lines to follow, so a stray open path ruins the job. This
  depends on V-carve-aware output conventions, the domain gap that would
  enforce open versus closed vector discipline.

Sources: langmuirsystems.com, machinistguides.com, makera.com, etsy.com,
  bococustom.com, instructables.com, forum.vectric.com, themetalpeddler.com

## Top YouTube channels (as of 2026-08-31)
- [Langmuir Systems](https://www.youtube.com/results?search_query=Langmuir+Systems) (search link) — the maker of the CrossFire hobby plasma tables; assembly, FireControl software, and cutting tutorials for exactly the entry-level machines hobbyists buy.
- [ShopSabre CNC](https://www.youtube.com/results?search_query=ShopSabre+CNC) (search link) — American CNC manufacturer with dedicated CNC router and plasma video series.
- *Dedicated hobby-plasma channels are thin; most of the best coverage is individual Langmuir CrossFire build/first-cuts/tutorial videos spread across general maker and metalworking channels.*

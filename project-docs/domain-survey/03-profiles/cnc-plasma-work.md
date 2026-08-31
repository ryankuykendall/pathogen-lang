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

## Top YouTube channels (as of 2026-08-31)
- [Langmuir Systems](https://www.youtube.com/results?search_query=Langmuir+Systems) (search link) — the maker of the CrossFire hobby plasma tables; assembly, FireControl software, and cutting tutorials for exactly the entry-level machines hobbyists buy.
- [ShopSabre CNC](https://www.youtube.com/results?search_query=ShopSabre+CNC) (search link) — American CNC manufacturer with dedicated CNC router and plasma video series.
- *Dedicated hobby-plasma channels are thin; most of the best coverage is individual Langmuir CrossFire build/first-cuts/tutorial videos spread across general maker and metalworking channels.*

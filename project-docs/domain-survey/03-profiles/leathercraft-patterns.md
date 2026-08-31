# Leathercraft Patterns

**Tier:** physical-output · **Rubric:** Pop 3 · Pain 4 · Fit 4 · GapCost 3 · Adopters 3 = **432** · Longlist A4

## Snapshot
Wallets, bags, and holsters are flat patterns whose defining detail — evenly
spaced stitch holes along every seam — is literally `partition()` on labelled
edges.

## Description
Hobby and small-business leatherworkers hand-cutting from PDF patterns or
laser-cutting veg-tan. The pattern economy runs on Etsy and Gumroad
(A4/US-letter PDFs, $5–25); designers draft in Illustrator/Fusion. Artifacts:
wallets, bags, belts, holsters, knife sheaths, watch straps. Stitching is
saddle-stitch through pre-punched holes at fixed spacing (3–4 mm irons).

## Problems Pathogen could address
Stitch-hole layout is the "walking the pattern" of leather: every mating seam
on two pieces must carry the *same hole count at the same spacing*, re-checked
by hand after any resize. Labelled seams + `partition(n)` solve it by
construction — holes derived from the shared edge can't disagree. Edge-parallel
stitch grooves are `offset()`; sizing a wallet to a new card count or a strap
to a wrist size is parameter change, not redrawing.

## Commercial value
Active PDF-pattern marketplace (Etsy/Gumroad sellers with sustained
businesses); laser-ready SVG patterns are an upsell tier; maker-brand
templates. Pattern designers are the paying wedge, as in quilting.

## Missing features
### Domain-specific [D]
- Matched-hole guarantee across mating seams (derive both sides from one edge)
- Stitch-hole primitives: slot/diamond punches at spacing, corner-turn rules
- Fold/skive/edge-finish line classes (the domain's mountain/valley)
- Strap-and-buckle parametrics (length from measurement, hole series)
### General [G]
- Physical units (hole spacing in mm is sacred); reliable curve offset()
  (grooves on curved edges — same blocker class as garment); modules (hardware
  template library); print-at-100% test square

## User base
Est. 1–2M active leatherworkers in English-speaking communities · proxy:
r/leathercraft ~600k+, large YouTube channels, sustained Etsy/Gumroad pattern
economy · confidence **L, unverified**. Adopter density medium: comfortable
with digital patterns, less with code.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** r/leathercraft, leatherworker.net forums, YouTube
  (Corter, Little King Goods school of maker channels), Etsy/Gumroad pattern
  shops, Instagram process videos.
- **Talking about right now:** digital PDF patterns are now the default
  distribution (Gumroad shops with multi-year catalogs); laser-cutting veg-tan
  is normalizing among sellers; search signal for platform discussion was thin
  this pass — flag for re-verification in Stage 5 if profiled deeper.
  (gumroad pattern shops, etsy.com listings)
- **Obsessed with:** saddle-stitch neatness (hole spacing symmetry is the
  status marker), edge finishing, tool collections (irons, skivers).
- **Blog content angles:** (1) "holes that can't disagree" — matched stitch
  holes from one labelled seam, the strongest single-mechanism story in the
  batch; (2) a card wallet parameterised by card count; (3) laser-vs-punch
  output from the same source.

## Pathogen fit today
cut() + labels for pieces and seams, partition() for hole spacing, offset()
for straight grooves, PDF at exact scale. Curved-edge offset reliability and
physical units are the real gates.

## Proposed validation project
A parametric bifold wallet: pieces with labelled mating seams, derived stitch
holes guaranteed to match, grooves, sized by card count — print PDF + laser
SVG from one source.

## Top YouTube channels (as of 2026-08-31)
- [The Leathercraft Academy](https://www.youtube.com/c/Theleathercraftacademy) — structured leathercraft instruction from fundamentals up; the closest thing to a curriculum on YouTube
- [Little King Goods](https://www.youtube.com/results?search_query=Little+King+Goods) (search link) — clean project builds and insight into modern small-shop leather-goods production
- [JH Leather](https://www.youtube.com/results?search_query=JH+Leather) (search link) — traditional English saddlery-trained maker; project walkthroughs and hand-stitching technique

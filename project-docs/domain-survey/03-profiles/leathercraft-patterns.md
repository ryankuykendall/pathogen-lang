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

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Folded card sleeve** — The usual first leather project and a staple of
  free pattern collections: one rectangle folded in half and saddle-stitched
  down two sides, with a thumb notch. The piece is a `cut()` outline with
  labelled seams, `partition()` spaces the holes evenly along each straight
  edge, and `offset()` draws the stitch groove. It prints as a PDF at exact
  scale for tracing onto veg-tan.
- **Passport cover** — A large rectangle with two inner pockets, stitched
  around the perimeter. All of its edges are straight, so it sits entirely
  inside what works now: three labelled pieces, seams named where a pocket
  meets the cover, and the same count passed to `partition()` on both sides of
  each seam, which keeps the holes in step. Resizing for a notebook or a
  different passport is a parameter change instead of a redraw.
- **Luggage tag** — Two layers with a window cut in the front, a slot for the
  strap and stitching down the straight sides; a quick gift project and a
  common first laser-cut pattern. The window and slot are plain cut shapes
  inside a labelled outline, `partition()` sets the holes and `offset()` the
  groove. One source gives the hand-cutting PDF and the SVG for a laser.

### Intermediate — several features, or one gap
- **Notebook cover** — A wrap cover for a pocket notebook, with a card pocket,
  a pen loop and an elastic slot. It is several pieces with labelled mating
  seams, hole runs from `partition()`, grooves from `offset()` and one set of
  parameters for the notebook's height, width and thickness. Everything used
  is shipped; the work lies in combining the pieces so that a size change
  carries through every part.
- **Rounded-corner card holder** — The three-pocket card holder is the pattern
  most shops sell first, and nearly all of them round the corners. That is
  where the difficulty starts: the stitch line and groove must run a constant
  distance inside a curved edge. Pieces, seams and hole counts work now, but
  reliable curve `offset()` is the one gap, the same blocker the profile names
  for grooves.
- **Dopp kit** — A zipped toiletry bag with boxed corners, sold as PDF and SVG
  with real-size pieces and a video. Body, gusset ends and zipper tabs share
  straight seams that labels and `partition()` keep in step. The single gap is
  physical units: the pattern is built around a bought zipper of fixed length
  and a 3 to 4 mm stitching iron, and both are millimetre facts.

### Advanced — depends on a named gap
- **Watch strap set** — Strap templates sell in 20, 22 and 24 mm lug widths,
  each with a taper, a pointed tail, a buckle slot and a row of adjustment
  holes. Each width is the same design under different numbers. The
  opportunity is strap-and-buckle parametrics: length derived from a wrist
  measurement and a generated hole series, which also covers the belt patterns
  sold in five widths.
- **Welted knife sheath** — A sheath sandwiches a welt strip between front and
  back so the blade cannot cut the thread, and the seam follows the blade's
  curve. Three layers must be pierced by one row of holes. The named gap is
  the matched-hole guarantee across mating seams: derive every layer's holes
  from a single labelled edge so that a drop-leg, neck or pocket variant
  cannot drift.
- **Gusseted bag** — A messenger bag or tote sews a long gusset strip around a
  front panel with rounded lower corners, the classic place where hole counts
  disagree and the strip comes out a stitch short. Stitch-hole primitives with
  corner-turn rules are the gap: slot or diamond punches at a fixed pitch that
  close up correctly around a corner, on both the strip and the panel.

Sources: makesupply.co, etsy.com, rmleathersupply.com, community.glowforge.com

## Top YouTube channels (as of 2026-08-31)
- [The Leathercraft Academy](https://www.youtube.com/c/Theleathercraftacademy) — structured leathercraft instruction from fundamentals up; the closest thing to a curriculum on YouTube
- [Little King Goods](https://www.youtube.com/results?search_query=Little+King+Goods) (search link) — clean project builds and insight into modern small-shop leather-goods production
- [JH Leather](https://www.youtube.com/results?search_query=JH+Leather) (search link) — traditional English saddlery-trained maker; project walkthroughs and hand-stitching technique

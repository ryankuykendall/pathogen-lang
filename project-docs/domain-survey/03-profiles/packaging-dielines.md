# Packaging Dielines & Cardboard Engineering

**Tier:** physical-output · **Rubric:** Pop 3 · Pain 3 · Fit 5 · GapCost 3 · Adopters 3 = **405** · Longlist A5

## Snapshot
Boxes, mailers, and retail packaging are cut/crease/perf line-class geometry
with fold labels — the domain's native vocabulary is already Pathogen's — and
the incumbent (ArtiosCAD) prices out everyone below industrial scale.

## Description
Three tiers: structural designers at converters (ArtiosCAD/EngView — the
industry standard, enterprise-priced), indie brands and print shops adapting
template dielines in Illustrator, and crafters making gift boxes on Cricut
lasers. Artifacts: FEFCO-style corrugated cases, folding cartons, mailers,
inserts, display boxes. A dieline is cut lines + crease lines + perf lines +
glue flaps with strict layer conventions.

## Problems Pathogen could address
Below the enterprise tier there is no parametric option: indie brands stretch
a template dieline and hope the flaps still meet; every dimension change is
manual re-draw with material-thickness allowances sprinkled by rule of thumb.
A FEFCO box is ~10 parameters (L/W/D, caliper, flap rules). Cut/crease/perf =
line classes = labels; glue-flap mating = shared seams; thickness allowances =
systematic offsets.

## Commercial value
Etsy/small-brand custom packaging is a real economy (box templates, wedding
favor boxes, product mailers); print shops pay for dieline generation; a
"FEFCO library in code" has trade value. The enterprise tier is unreachable
(ArtiosCAD lock-in), so target the underserved bottom.

## Missing features
### Domain-specific [D]
- FEFCO/ECMA style library as parametric modules (caliper-aware flap math)
- Crease/perf/cut line-class conventions + converter-standard layer export
- Fold sequence sanity checks (flap collision at fold time)
- 3D fold preview (stretch goal — big lift, big demo value)
### General [G]
- Physical units + caliper tables (data import); modules (the style library IS
  the product); DXF/CF2 export for die makers; sheet nesting

## User base
Est. 200k–1M across indie brands, print shops, and box crafters · proxy:
packaging-design tool market breadth, Etsy box-template sales, Cricut box
projects · confidence **L, unverified**. Adopter density medium.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** Dieline.com (awards + community), packaging-design
  subreddits and LinkedIn groups, print-shop forums, craft-side box-making
  Facebook groups.
- **Talking about right now:** DIELINE Awards 2026 signal plastic-free
  formats, refill systems, recyclables — sustainability drives *structural*
  redesign, which means new dielines everywhere; tool roundups keep naming
  ArtiosCAD the standard while listing the same gap: nothing accessible below
  it. (packnode.org, smashbrand.com, designnbuy.com, 2026)
- **Obsessed with:** sustainable substrates, unboxing experience, dieline
  correctness at the die-maker handoff.
- **Blog content angles:** (1) a FEFCO 0201 case in ~10 parameters — the
  "hello world" of packaging; (2) caliper-aware flap math as compiled
  allowances; (3) a plastic-free refill carton riffing on the awards trend.

## Pathogen fit today
Best fit score in the batch: line classes, labelled mating flaps, layers,
offset for allowances, PDF/SVG export. Units, module library, and CF2/DXF are
the gates to trade use; craft use is nearly reachable now.

## Proposed validation project
A parametric mailer box (caliper, L/W/D as inputs): cut/crease layers with
converter conventions, flap-mate labels, allowances computed — cut on a Cricut
at craft scale to verify the fold physically closes.

## Top YouTube channels (as of 2026-08-31)
- [DIELINE](https://www.youtube.com/channel/UC6nfHQa69YlycmlRG3lU-8w) — the packaging industry's leading design platform (est. 2007); hosts a "Packaging Design 101: Dieline Design Guides" playlist
- [Packaging Unboxd](https://www.youtube.com/channel/UCZm2qmdwxuYenpV3Y31bSUA) — packaging designer Evelio Mattos tears down real packaging: structure, materials, manufacturing processes, terminology
- *Thin YouTube presence for structural packaging specifically; nearest-adjacent coverage is graphic-design channels' dieline tutorials and craft box-making content.*

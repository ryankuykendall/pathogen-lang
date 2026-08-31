# Stencil Design

**Tier:** physical-output · **Rubric:** Pop 3 · Pain 4 · Fit 4 · GapCost 3 · Adopters 3 = **432** · Longlist A3

## Snapshot
Every stencil lives or dies by bridges — the connectors that keep islands
attached — and today bridge placement is a manual Illustrator chore that a
single Pathogen feature could automate.

## Description
Airbrush artists (miniature painters, automotive, cake), craft painters (signs,
furniture, murals), and small businesses (branding, packaging marks). Stencils
are cut from mylar or acrylic on lasers and blade cutters, or bought pre-made.
Design happens in Illustrator/Inkscape: convert text/art to outlines, then
hand-draw bridges so counters (the middle of an "O") don't fall out.

## Problems Pathogen could address
Bridge-and-island analysis is a well-defined geometry problem (find enclosed
islands, connect with tabs) that no accessible tool automates — designers
eyeball it, cut, discover a floating counter, and iterate. Multi-layer
stencils (one per colour) need registration marks and per-layer separation —
Pathogen layers native. Text-heavy stencils need font-aware bridging, which is
a text-to-path + boolean-ops pipeline we largely have.

## Commercial value
Custom-stencil sellers on Etsy (laser-cut stencil is an established market);
stencil-file sales into the die-cutting population; miniature-painting
aftermarket (a passionate, spendy niche); small-business branding stencils.
Reported ~35% rise in custom-stencil DIY popularity last year.

## Missing features
### Domain-specific [D]
- **Automatic bridge generation**: island detection + tab placement with
  width/count parameters (the domain's one killer feature)
- Stencil-safe validation (no floating islands, min feature width for the
  material)
- Multi-layer colour separation with registration marks
- Halftone/dot-pattern fills for shading stencils
### General [G]
- Robust boolean ops on text outlines; physical units (bridge width in mm);
  machine export profiles (laser + blade)

## User base
Est. 500k–2M people who cut or buy custom stencils across airbrush, craft, and
mini-painting communities · proxy: Etsy laser-stencil market depth,
r/minipainting (~1M) airbrush subset, craft-stencil DIY growth stat ·
confidence **L, unverified**.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** r/minipainting and airbrush forums (air-craft.net),
  laser-owner groups (stencils are a top project genre), Etsy stencil shops,
  cake-decorating and furniture-painting Facebook groups.
- **Talking about right now:** custom stencils up ~35% year-over-year in DIY
  projects; small businesses adopting stencils for branding/packaging; mylar
  vs acrylic material debates; laser precision (fine text, delicate bridges)
  as the differentiator vs blade cutters. (razorlab.online, xometry.com,
  laserpecker.net, 2026)
- **Obsessed with:** bridge aesthetics (visible tabs ruin a design), reusable
  vs one-shot materials, crisp edges without underspray.
- **Blog content angles:** (1) "the counter problem" — auto-bridging the
  letter O, a perfect single-mechanism post; (2) a three-layer miniature
  camo stencil set with registration; (3) material-minimum-width validation as
  a compile-time check.

## Pathogen fit today
Text-to-path, boolean ops, layers, offset() for tab geometry, markers for
registration. Island *detection* needs containment analysis we don't expose;
everything around it exists.

## Proposed validation project
A bridged text stencil: any Google Font phrase → outlines → automatic island
detection and tab placement → mylar-ready SVG with min-width report — the
friction log writes the [D] feature spec.

## Top YouTube channels (as of 2026-08-31)
- [Stencil Stop](https://www.youtube.com/results?search_query=Stencil+Stop) (search link) — custom and ready-made stencil company; tutorials on painting with stencils (spray paint technique, surface prep)
- [Skech](https://www.youtube.com/results?search_query=skech+spray+paint+art+stencils) (search link) — spray-paint artist with stencil-making tutorials for spray paint art
- *Thin YouTube presence for this niche; nearest-adjacent coverage is airbrush/miniature-painting channels and laser-cutting channels that cut mylar stencils.*

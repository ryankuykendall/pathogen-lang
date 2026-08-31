# Kirigami & Pop-Up Engineering

**Tier:** physical-output · **Rubric:** Pop 2 · Pain 4 · Fit 5 · GapCost 4 · Adopters 3 = **480** · Longlist A2

## Snapshot
Pop-up cards, sliceforms, and origamic architecture are cut-plus-fold
mechanisms — one step past the papercraft post, with geometry (fold angles,
layer clearances) that must be *computed*, not sketched.

## Description
Card makers and paper engineers designing pop-up greeting cards, sliceform
sculptures, and origamic-architecture buildings. Hobbyists hand-draft in
Illustrator/Silhouette Studio or buy SVG pop-up files; the serious end
(commercial pop-up book paper engineers) prototypes by hand through many
physical iterations. Output: home die-cutters, scissors + craft knife, or
laser.

## Problems Pathogen could address
A pop-up mechanism is constraint geometry: V-fold angles, parallel-fold layer
heights, and slot clearances all derive from a few parameters, but incumbent
tools store only the final outline — change the card's fold angle and every
dependent piece is manually redrawn. Sliceforms are literally computed cross
sections of a surface. Cut vs fold (mountain/valley) line classes are exactly
the `cut.<name>` sub-label system the papercraft post landed.

## Commercial value
SVG pop-up card files sell steadily on Etsy/Design Bundles into the
die-cutting population; paper-engineering courses and books; template
subscriptions. Modest but real, and it piggybacks on the A15 die-cutting
marketplace rails.

## Missing features
### Domain-specific [D]
- Fold-mechanism helpers: V-fold / parallel-fold constructors that solve layer
  heights and clearances from angle parameters
- Slice/section generator (sliceforms = sampled cross sections + slots)
- Flat-fold validity checks (does it close without collision?)
- Mountain/valley legend + dashed-line print conventions as a first-class kit
### General [G]
- Modules (mechanism libraries); physical units (card stock sizes);
  parameter sliders for live mechanism exploration

## User base
Est. 100k–500k active pop-up/kirigami makers inside the broader cardmaking
population · proxy: Pinterest boards with hundreds of curated kirigami
collections, sustained Etsy pop-up SVG sales; no dedicated survey exists ·
confidence **L, unverified**. Community signal is diffuse (Pinterest-shaped,
not forum-shaped).

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** Pinterest is the hub (kirigami/sliceform boards in the
  hundreds of ideas each); Extreme Cards and Papercrafting blog; die-cutting
  Facebook groups; Etsy pop-up template shops. Notably *not* forum-centric —
  thin discussion signal.
- **Talking about right now:** sliceforms trending as "3D algebraic equations
  sliced into sections"; steady tutorial/template economy; no live controversy
  surfaced. (pinterest.com boards, extremepapercrafting.com)
- **Obsessed with:** mechanisms that astonish on open, clean folds, template
  free-vs-paid culture.
- **Blog content angles:** (1) a parametric V-fold card where one slider
  changes the pop angle and everything re-solves; (2) sliceform of a Pathogen
  surface (Grid-sampled); (3) "mountain, valley, cut: three line classes, one
  plate" — direct sequel to the papercraft post.

## Pathogen fit today
The strongest fit score on the longlist: cut() + labels + `cut.<name>`
sub-labels were *built* on this domain's sibling. Transforms, PDF export, and
deterministic geometry cover the rest; only the mechanism solvers are missing.

## Proposed validation project
A parametric pop-up card: two-layer V-fold mechanism with computed clearances,
mountain/valley/cut legend, exported for both scissors (PDF) and die-cutter
(SVG) — friction-logging the fold-math helpers as we go.

## Top YouTube channels (as of 2026-08-31)
- [Peter Dahmen Papierdesign](https://www.youtube.com/channel/UC8D4b1ALH5RGvonypSL6e0g) — leading pop-up paper artist; mechanism and folding tutorials that define the craft's ceiling
- [Matthew Reinhart](https://www.youtube.com/channel/UCxbY5VDdSrdvcMBvZBqvChA) — award-winning pop-up book author and professional paper engineer; behind-the-scenes of elaborate commercial pop-ups
- [Popupology (Elod Beregszaszi)](https://www.youtube.com/channel/UCpJPF40BElpDlgpE_vWGDqQ) — geometric kirigami cut-and-fold workshops with free templates; the closest to parametric/template thinking in the niche

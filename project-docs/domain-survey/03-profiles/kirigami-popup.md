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

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Parallel-fold staircase card** — The first plate in most
  origamic-architecture books: pairs of parallel slits across the centre fold
  push out as a flight of steps when the card opens to ninety degrees. Every
  step is two cuts and three folds, so one loop draws the lot, with cut,
  mountain and valley lines kept apart as `cut.<name>` sub-labels. Change the
  step count and the plate redraws for PDF.
- **Pop-up birthday cake card** — The tiered cake is the beginner kirigami
  template most often shared with a video tutorial: three stacked box steps of
  shrinking width cut into one sheet. Each tier is the same parallel-fold box
  at a different size, so one function called three times builds it. Labels
  separate cuts from folds, and a mirror transform keeps every tier centred on
  the spine.
- **Abstract geometric kirigami card** — Popupology-style abstract cards
  repeat one slit-and-fold unit in rows across a ninety-degree card, giving a
  field of small boxes or louvres. This is transform-and-repeat geometry with
  nothing to solve: one unit, copied along the fold, its size stepped by a
  loop. Deterministic output means the plate recuts identically every time,
  and the labelled cut and fold classes go straight to PDF.

### Intermediate — several features, or one gap
- **Explosion box** — A lidded gift box whose four walls fall open when the
  lid lifts, showing layered panels for photos and messages. The cross-shaped
  base, the inset mats and the lid are scaled copies of one square, with score
  lines as a fold sub-label and SVG out for a die-cutter. The single gap is
  physical units, since the lid must clear the walls by a card thickness.
- **Pop-up box card** — The box card folds flat for an envelope and opens into
  a standing box with decorated cross-pieces inside. It is several flat parts
  whose tabs and slots must agree, which labelled mating edges express
  directly, and transforms place the repeated cross-pieces. The gap is
  modules: sellers reuse one box mechanism under dozens of themed toppers, and
  today that mechanism would be copied between files.
- **Origamic-architecture facade** — A building front in the Chatani
  tradition: doors, steps and balconies at several depths, all cut and folded
  from one sheet. Each element is a parallel fold whose depth is set by plain
  arithmetic on its distance from the centre crease, so the geometry is
  expressions plus sub-labels. Parameter sliders are the gap; tuning depths
  live is how designers work.

### Advanced — depends on a named gap
- **Sliceform sphere or heart** — Two sets of slotted card slices cross at
  right angles to make a solid that collapses flat, taught from
  maths-department handouts to light-up sphere cards. Each slice is a cross
  section of the surface with slots at the crossings. The opportunity is the
  slice and section generator: sample a shape, emit numbered slices and
  matched slots, and re-run for any slice count.
- **Stacked-mechanism pop-up spread** — A pop-up book spread in the Reinhart
  manner, where a second mechanism rides on the first and both must fold away
  inside the closed page. Paper engineers find collisions by building white
  dummies over and over. Flat-fold validity checks are the gap and the
  opportunity: a compile-time answer to whether the spread closes without
  anything catching or poking past the page edge.
- **Sellable template pack** — Etsy pop-up listings ship an SVG for
  die-cutters beside a PDF for scissors and a craft knife, and buyers judge
  them on how clearly cut, mountain and valley lines are told apart. Pathogen
  already carries the three classes as sub-labels. The missing piece is the
  mountain and valley legend with dashed-line print conventions as a kit, so
  every template in a shop reads alike.

*Search results for this niche were thin and template-farm heavy; the ideas
lean on the few solid sources below.*

Sources: origami-resource-center.com, allthingspaper.net, jennifermaker.com,
  loriwhitlock.com, warwick.ac.uk, chibitronics.com, community.glowforge.com,
  etsy.com

## Top YouTube channels (as of 2026-08-31)
- [Peter Dahmen Papierdesign](https://www.youtube.com/channel/UC8D4b1ALH5RGvonypSL6e0g) — leading pop-up paper artist; mechanism and folding tutorials that define the craft's ceiling
- [Matthew Reinhart](https://www.youtube.com/channel/UCxbY5VDdSrdvcMBvZBqvChA) — award-winning pop-up book author and professional paper engineer; behind-the-scenes of elaborate commercial pop-ups
- [Popupology (Elod Beregszaszi)](https://www.youtube.com/channel/UCpJPF40BElpDlgpE_vWGDqQ) — geometric kirigami cut-and-fold workshops with free templates; the closest to parametric/template thinking in the niche

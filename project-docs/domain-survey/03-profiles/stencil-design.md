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

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Geometric hexagon wall stencil** — A widely sold modern pattern for
  accent walls, floors and furniture: a field of hexagonal openings separated
  by even webs. Each opening is a separate hole, so nothing can fall out and
  no bridging is needed. One hexagon is repeated across the sheet and
  `offset()` insets every copy so the webs keep a constant width, with markers
  in the corners to register the next repeat.
- **Hex camo airbrush mask** — Miniature and scale-model painters spray hex
  camouflage through small masks sold as sets in several scales. The art is
  clusters of hexagons with some cells dropped, which a loop with a
  deterministic skip rule produces, and boolean ops trim the cluster to the
  sheet outline. Because every opening stands alone the stencil is safe by
  construction, and each scale is one parameter.
- **Petal-ring mandala stencil** — Circular mandala stencils for walls,
  tabletops and yoga corners are perennial sellers. A simple one is concentric
  rings of petal-shaped openings, each ring a single petal rotated around the
  centre. Drawn as separate holes it has no islands to bridge, boolean ops
  clip the petals where rings would touch, and `offset()` keeps the webs
  between neighbours wide enough to survive handling.

### Intermediate — several features, or one gap
- **Compass rose stencil** — The nautical compass is a steady seller for
  walls, offices and travel-themed decor: a pointed star, two rings and the
  four cardinal letters. It combines text-to-path, boolean ops to split the
  star into alternating facets, and `offset()` for the ring webs. Conveniently
  N, E, S and W have no enclosed counters, so the lettering needs no bridges
  at all.
- **Crate-marking brand stencil** — Small businesses spray a name and a mark
  onto shipping boxes, sacks and timber. Set in a ready-bridged stencil
  typeface from Google Fonts, the phrase goes through text-to-path with a
  border from `offset()` and registration markers, and no island analysis is
  required. The one gap is physical units: letter height and web width have to
  be stated in millimetres for the mylar being cut.
- **Cookie stencil set** — Bakers buy sets of small stencils sized to a cookie
  cutter, used with royal icing or an airbrush. A set is one frame with a
  dozen simple motifs, each built from separate openings and trimmed with
  boolean ops, on a layer per stencil. These are cut on blade machines from
  thin food-safe film, so the gap is machine export profiles for blade as well
  as laser.

### Advanced — depends on a named gap
- **Layered digital camo set** — Digital camouflage for models comes as
  several stencils sprayed in sequence, one per colour, each placed against
  the last. Building the set means splitting one pattern into colour layers
  that neither gap nor overlap wrongly. Layers and markers exist; the
  opportunity is multi-layer colour separation with registration marks as a
  feature, so a three-colour design yields three aligned sheets from one
  source.
- **Halftone shading stencil** — Airbrush artists fake tone with dot fields: a
  fade from large holes to small ones lets one pass of paint read as a
  gradient on a helmet, a cake or a mural. Each dot is its own opening, so the
  stencil stays safe. The named gap is halftone and dot-pattern fills, which
  would turn any region into a graded field of cuttable dots.
- **Ornate lace mandala** — The detailed mandalas that sell best nest rings
  inside rings, and their enclosed centres drop out unless someone draws ties
  by hand. This is the counter problem applied to ornament instead of
  lettering. Automatic bridge generation is the gap that matters: detect each
  island, place tabs along the pattern's own symmetry, and let the designer
  set tab width and count once for the whole plate.

Sources: mstencils.com, gumnut.com.au, michtoy.com, bigbluetrunk.sg, etsy.com

## Top YouTube channels (as of 2026-08-31)
- [Stencil Stop](https://www.youtube.com/results?search_query=Stencil+Stop) (search link) — custom and ready-made stencil company; tutorials on painting with stencils (spray paint technique, surface prep)
- [Skech](https://www.youtube.com/results?search_query=skech+spray+paint+art+stencils) (search link) — spray-paint artist with stencil-making tutorials for spray paint art
- *Thin YouTube presence for this niche; nearest-adjacent coverage is airbrush/miniature-painting channels and laser-cutting channels that cut mylar stencils.*

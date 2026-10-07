# Heraldry & Vexillology

**Tier:** data-driven · **Rubric:** Pop 2 · Pain 2 · Fit 4 · GapCost 4 · Adopters 3 = **192** · Longlist E5

## Snapshot
Blazonry is a 700-year-old domain-specific language for describing images —
"azure, a bend or" compiles to a picture — making heraldry the one hobby
whose native format is literally a program awaiting an interpreter.

## Description
Heraldry enthusiasts (arms design, SCA/reenactment communities, genealogy
crossover) and vexillologists (flag design — r/vexillology is a large,
lively community; civic flag-redesign campaigns are recurring news, with
NAVA active around events like Seattle's FIFA 2026 flag push). Tools:
Inkscape + shared SVG element libraries (Wikimedia heraldry commons),
DrawShield (an existing blazon-to-image web renderer — validation that the
idea works), general vector editors.

## Problems Pathogen could address
Blazon-to-render is a language problem: ordinaries (bend, chevron, pale)
are parametric geometry on a shield shape; divisions and counterchanging
are boolean/mask operations; tinctures map to a strict palette with rule
checking (no color-on-color). Flag design similarly: ratio-parameterized
layouts, NAVA design-principle checks (simplicity, 2-3 colors). A heraldry
module — shield shapes, ordinaries, charges as composable functions — makes
arms regenerable across shield shapes and display contexts (banner, roundel)
from one description.

## Commercial value
Small direct (commission arms/flag design, SCA scroll work, civic-flag
consulting) — but high *community resonance*: these are documentation-loving
hobbyists who write style guides, and civic flag redesigns generate press.

## Missing features
### Domain-specific [D]
- Shield/field shape library with division and ordinary constructors
- Counterchange (pattern-swap across a division) as an operation
- Tincture palette + rule-of-tincture validation
- Charge placement conventions (in chief, in base, semé strewing)
### General [G]
- Modules (the heraldic kit); parameter sliders; almost no other gate —
  GapCost 4

## User base
r/vexillology ~600k+ subscribers; r/heraldry ~100k; SCA ~30k paid members;
active designers est. 50–150k · confidence **L–M, unverified**.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** r/vexillology (large; redesign contests are its
  culture), r/heraldry, NAVA and national heraldry societies, SCA heraldic
  colleges, DrawShield user community.
- **Talking about right now:** civic flag activity clusters around events —
  Seattle's flag redesign ahead of FIFA 2026, community-flag contests
  (Cumbria's first community flag; Canadian Heritage's 2026 flag-bearer
  program); the "good flag design" discourse is evergreen. (axios.com,
  westmorlandandfurness.gov.uk, canada.ca, wikipedia societies)
- **Obsessed with:** rule-of-tincture correctness, simplicity-vs-detail
  wars, redesigning "bad" city flags recreationally.
- **Blog content angles:** (1) "blazonry was already code" — the DSL-meets-
  DSL post, catnip for both communities; (2) a city-flag redesign done
  parametrically with NAVA checks; (3) counterchange as a boolean op.

## Pathogen fit today
Boolean ops, masks, palettes, transforms — the machinery exists; the
heraldic vocabulary layer is clean module work. A strong content domain
with a ready-made narrative.

## Proposed validation project
A blazon starter kit: field divisions + three ordinaries + tincture
validation as a module, rendering the same arms on shield, banner, and
roundel — posted to r/heraldry for critique.

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Exact-ratio national flag set** — Redrawing flags to their official
  proportions is the entry exercise of vexillology: tricolors, Nordic crosses,
  cantons with stars. Each is rectangles, polygons and a star at stated
  fractions of the hoist. In Pathogen the ratio and stripe fractions are named
  values, so the same source redraws a 2:3 flag at 1:2, and every color comes
  from one small palette.
- **Parted-field shield** — The first heraldry drawing: a heater shield parted
  per pale, per fess or quarterly in two tinctures. Draw the shield outline
  once, then intersect it with plain rectangles using boolean ops to get each
  part, filled from a hand-set palette. It teaches that divisions are
  clipping, the idea the whole domain rests on, using nothing beyond shipped
  machinery.
- **Seal-on-a-bedsheet redesign** — Replacing a state or city flag that is
  just a seal on a blue field is the recurring contest brief on r/vexillology.
  A good entry is a handful of bold shapes in two or three colors, well within
  polygons, transforms and a palette. Because the layout is parametric, the
  designer can post stripe-width and color variants for critique in minutes.

### Intermediate — several features, or one gap
- **Finalist comparison sheet** — Civic redesign campaigns, like the recent
  Illinois finalist round, ask the public to compare many candidates side by
  side. One layout function, a list of palettes and emblem choices, a tiled
  sheet at identical ratio and a text label under each gives twenty variants
  on one page. All shipped; reusing the layout functions across campaigns
  waits on modules, the one general gap.
- **Ordinaries reference chart** — Heraldry primers open with a chart of the
  honorable ordinaries: pale, fess, bend, chevron, cross, saltire, chief and
  bordure. Each is a band or polygon intersected with the shield outline, so
  the chart is eight boolean operations laid out with captions. It combines
  boolean ops, transforms, palettes and text, and is the natural teaching page
  for the blazonry-is-code narrative.
- **Flag construction sheet** — Official flag specifications are published as
  construction sheets: the flag drawn in outline with every stripe, canton and
  star position marked in units of the hoist. Pathogen can draw the flag and
  its measurement labels from the same named values, so drawing and numbers
  cannot disagree. It combines geometry, text and transforms, and suits a
  documentation-loving community that writes style guides.

### Advanced — depends on a named gap
- **Counterchanged arms** — Arms such as per pale argent and sable, a chevron
  counterchanged, swap tinctures wherever a charge crosses the division line,
  an effect admired on r/heraldry and tedious in Inkscape. It depends on
  counterchange as an operation, a named domain gap. Since the swap is boolean
  intersection under the hood, Pathogen can offer it as one call that stays
  correct across shield shapes.
- **Semé fields and charge arrangements** — Blazons say three roses in chief,
  a mullet in base, or semé-de-lis for a field strewn with small charges cut
  at the edge. Rendering those phrases depends on the charge placement
  conventions listed as a domain gap. Encoding the conventions once gives
  every later arms correct positions on any shield, which hand-placing traced
  charges in a vector editor never does.
- **SCA device submission sheet** — Registering a device with the SCA College
  of Arms requires a black-and-white line drawing and a matching color
  emblazon on the kingdom's shield form. Generating both from one description
  depends on the shield/field shape library and the tincture palette, both
  domain gaps. Two outputs that cannot drift apart is a practical win for the
  heralds who check submissions.

Sources: reddit.com, will.illinois.edu, heraldry.sca.org,
  herald.poore-house.com, herald.atlantia.sca.org, heraldicart.org,
  crwflags.com

## Top YouTube channels (as of 2026-08-31)
- [Vexillographer](https://www.youtube.com/user/vexillographer) — geography and vexillology channel; flag content mixed with broader geo topics.
- [Voice of Vexillology, Flags & Heraldry](https://www.youtube.com/results?search_query=voice+of+vexillology+flags+heraldry) (search link) — Chris McMaddish's channel covering both flags and heraldry — the rare channel spanning our exact domain pair.
- [Vexillum](https://www.youtube.com/results?search_query=vexillum+flags+channel) (search link) — dedicated vexillology channel listed in FOTW's directory of vexillological sites.

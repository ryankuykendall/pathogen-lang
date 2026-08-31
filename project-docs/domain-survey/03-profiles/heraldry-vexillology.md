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

## Top YouTube channels (as of 2026-08-31)
- [Vexillographer](https://www.youtube.com/user/vexillographer) — geography and vexillology channel; flag content mixed with broader geo topics.
- [Voice of Vexillology, Flags & Heraldry](https://www.youtube.com/results?search_query=voice+of+vexillology+flags+heraldry) (search link) — Chris McMaddish's channel covering both flags and heraldry — the rare channel spanning our exact domain pair.
- [Vexillum](https://www.youtube.com/results?search_query=vexillum+flags+channel) (search link) — dedicated vexillology channel listed in FOTW's directory of vexillological sites.

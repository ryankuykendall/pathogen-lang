# PCB Art & Instrument Front Panels

**Tier:** physical-output · **Rubric:** Pop 2 · Pain 3 · Fit 4 · GapCost 3 · Adopters 5 = **360** · Longlist A9

## Snapshot
Eurorack faceplates, guitar-pedal drilling templates, and decorative badge
PCBs are precision 2D layouts made by an intensely code-native community that
already publishes panel specs as wiki tables.

## Description
Synth-DIY builders (Eurorack modules: 3U × HP-width panels with standardized
jack/pot grids), pedal builders (enclosure drill templates for 1590B/125B
boxes), and badge-life/PCB-art makers (decorative boards where copper, mask,
and silk are art layers). Tools: KiCad, Inkscape, Front Panel Express,
sdiy.info wiki specs. Panels are aluminum (drilled/engraved), FR4 (made as
PCBs), or acrylic (laser).

## Problems Pathogen could address
A Eurorack panel is a constraint grid: HP width quantization (5.08 mm),
mounting-hole positions by rail standard, component spacing rules — all
looked up from wiki tables and re-derived per module today. Drill templates
for pedals are the same chore at 1590-enclosure standards. Legend/graphic
layers (scales around pots, jack labels) are radial/text layout Pathogen
already does well. Variant panels (same circuit, 4HP vs 6HP) are manual
redraws.

## Commercial value
Panel-and-PCB kit sellers (active eBay/Tindie/Etsy economy), boutique module
makers, panel-design services; badge culture at cons. Small market, maximal
early-adopter credibility (adjacent to the developer audience Pathogen
courts).

## Missing features
### Domain-specific [D]
- Rack-standard libraries (Eurorack HP/rail math, 1590-series enclosure
  drill specs) as modules
- Drill-table output (hole schedule with sizes/coordinates)
- Panel-legend kit: pot scale arcs with tick labels, jack label conventions
- Gerber/KiCad-interop export for FR4 panels (stretch)
### General [G]
- Physical units (0.1 mm matters); DXF export (panel shops take DXF); number
  formatting; modules

## User base
Est. 50–200k active synth-DIY/pedal/badge builders · proxy: ModWiggler forum
scale, sdiy communities, kit-seller depth · confidence **L, unverified**.
Adopter density: 5 — these people write firmware for fun.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** ModWiggler (the synth-DIY forum), sdiy.info wiki,
  r/synthdiy and r/diypedals, Tindie/kit-seller pages, badge-life circles at
  DEF CON-style cons.
- **Talking about right now:** PCB-as-panel (FR4 faceplates from board houses)
  is the normalized cheap path — panel component specs (jack sockets,
  PCB-to-panel gaps) maintained as community wiki tables; steady PCB+panel
  kit economy. (sdiy.info wiki, kit listings)
- **Obsessed with:** panel aesthetics as brand identity, alignment perfection
  (a misaligned jack is a rework), HP economy in small cases.
- **Blog content angles:** (1) a Eurorack panel where HP width is *the*
  parameter and everything re-solves; (2) pot-scale arcs as radial text-on-
  path; (3) drill schedule as compiled output — speak directly to the
  spec-table culture.

## Pathogen fit today
Precise grids, radial text, markers, layers map to drill/engrave/legend;
exact-scale PDF. Units + DXF are the hard gates for real fab handoff.

## Proposed validation project
A parametric Eurorack blank-panel generator: HP width in, mounting slots +
jack grid + scale-arc legends out, drill schedule logged — validated against
the sdiy.info spec table.

## Top YouTube channels (as of 2026-08-31)
- [Moritz Klein](https://www.youtube.com/results?search_query=Moritz+Klein+synth+DIY) (search link) — the canonical synth-DIY educator: designing analog oscillators, filters, and drum circuits from scratch with cheap components; his designs are widely rebuilt across the community
- [Look Mum No Computer](https://www.youtube.com/results?search_query=Look+Mum+No+Computer) (search link) — Sam Battle's DIY synth channel (Kosmo-format modular builds) with a large active builder forum
- [Knobs](https://www.youtube.com/results?search_query=Knobs+pedal+demos) (search link) — guitar-pedal demos plus a "Why to Eurorack" series; described on MOD WIGGLER as "the Bob Ross of FX"

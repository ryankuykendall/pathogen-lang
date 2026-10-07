# RC Aircraft & Model Engineering Parts

**Tier:** physical-output · **Rubric:** Pop 2 · Pain 4 · Fit 4 · GapCost 2 · Adopters 4 = **256** · Longlist A13

## Snapshot
Wing ribs are airfoil curves scaled along a planform with spar and
lightening cutouts — the 2026 kit market has shifted wholesale to laser-cut
tab-lock construction, and the free-plans community trades DXFs already.

## Description
Balsa builders and foamboard flyers. The balsa side: ribs/formers cut from
plans, now predominantly laser-cut kits ("tab-lock" construction); vintage-
plan rib sets sell per-model; hobbyists run diode lasers on balsa and
foamboard. The foam side: Flite Test-style free-plan culture with folded
foamboard designs. Tools: downloaded PDF/DXF plans (numavig-style libraries),
DevWing/Profili niche rib software, hand tracing.

## Problems Pathogen could address
A wing is data-driven geometry: airfoil coordinate files (UIUC database
format) → ribs scaled/washed-out along the span, spar notches and lightening
holes placed per station, tab-slot joints into formers. Niche rib software
exists but is Windows-bound and closed; plans culture wants regenerable,
shareable sources. Foamboard designs need fold-line classes (score vs cut) —
papercraft mechanics at aircraft scale.

## Commercial value
Rib-set sellers (275+ vintage models as laser sets on eBay alone), plan
marketplaces, kit cottage industry. Small but transactional and file-native.

## Missing features
### Domain-specific [D]
- Airfoil ingestion (UIUC .dat) + chord/washout interpolation along a span
- Rib feature placement: spar notches, stringer slots, lightening holes with
  margin rules
- Tab-lock joint generation into formers (shared with flat-pack joints)
- Plan-sheet output conventions (part numbering, wood grain arrows)
### General [G]
- **Data import (the gate — airfoils are data files)**; physical units; DXF
  export; CLI batch (a full kit is dozens of parts)

## User base
Est. 100–500k active builders (AMA membership ~150–200k US alone historically;
foamboard community adds more) · confidence **L–M, unverified**.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** Flite Test forums (foamboard free-plans culture),
  RCGroups (the long-running forum of record), r/RCPlanes, Model Aviation/AMA,
  eBay/numavig plan-file sellers.
- **Talking about right now:** 2026 kit roundups declare the laser-cut shift
  complete — "no more weeks tracing plans"; DIY laser cutting of balsa and
  Hobby Lobby foamboard with diode machines is an active forum topic; free
  DXF+PDF plan libraries growing. (modelrec.com, forum.flitetest.com,
  numavig.com, modelaviation.com)
- **Obsessed with:** weight, crash-rebuild speed, vintage plan preservation,
  maiden-flight videos.
- **Blog content angles:** (1) a rib set generated from a UIUC airfoil file —
  the data-import flagship demo; (2) foamboard score/cut line classes, plans
  the Flite Test way; (3) regenerating a vintage plan parametrically.

## Pathogen fit today
Curves, transforms, tab geometry, labels for score/cut — but the domain
starts at a data file, so GapCost 2: without data import the core loop is
blocked.

## Proposed validation project
A parametric wing rib set: Clark-Y coordinates in, 12 stations with taper +
washout, spar notches and lightening holes, numbered plan sheet — cut in
balsa on a diode laser.

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Foamboard chuck glider** — Chuck gliders cut from a single sheet of
  foamboard are the usual introduction to building, and some powered designs
  can be built as gliders first. The parts are flat outlines with a few folds.
  Curves draw the wing and fuselage, a transform mirrors the halves, and
  labels separate score lines from cut lines. No airfoil data is involved.
- **Control horns and firewalls** — Small plywood parts, control horns,
  firewalls and servo trays, are the first things builders cut on a diode
  laser. Each is a simple outline with a few holes, drawn with curves and
  placed with transforms. They make a low-stakes first file: no airfoil, no
  joints, and the size is set when the SVG is opened in the laser software.

### Intermediate — several features, or one gap
- **Swappable power pod** — Free-plan foamboard designs share a folded box
  that carries the motor and slides into any compatible airframe. It is a
  strip of rectangles with score lines between them and tab slots at the
  firewall, and tab geometry plus score and cut labels draw it. The known
  dependency is physical units: every dimension follows foam thickness, and
  until then the builder scales the drawing on import and checks a tab against
  the foam.
- **Folded foamboard wing** — A foamboard trainer wing is one sheet scored and
  folded over a spar to form the airfoil, with left and right halves mirrored.
  Score and cut labels, curves and transforms cover the drawing. The single
  gap is physical units: fold allowances and bevels depend on foam thickness,
  so the plan needs real millimetres to be trustworthy.
- **Constant-chord rib set** — A simple trainer wing uses identical ribs, so
  one outline with a spar notch is repeated along the span. The curve can be
  entered by hand as a short list of points and the rest is transforms. That
  works, slowly. The gap is data import: typing coordinates is tolerable for
  one airfoil and absurd for a second.
- **Sheet-laid foamboard plan** — A complete foamboard airframe is laid out
  across several sheets, and builders with foam-cutting CNC machines trade
  machine-ready versions of popular trainers. Laying parts on sheets with
  score and cut labels is possible now. The gap is DXF export, which those
  machines and most shared plan libraries expect alongside a PDF.

### Advanced — depends on a named gap
- **Vintage short kit** — A short kit supplies only the shaped parts of an old
  plan, ribs and formers, on numbered sheets with grain arrows, and sellers
  offer hundreds of models this way. Redrawing one from a scanned plan is
  routine work. This depends on plan-sheet output conventions, the domain gap
  covering part numbering and wood grain arrows.
- **Tab-lock fuselage** — Modern kits build the fuselage from sides and
  formers that key together with tabs and slots, so the structure aligns
  itself without a jig. Every tab width follows the wood thickness. This
  depends on tab-lock joint generation into formers, the domain gap shared
  with flat-pack joints, which would place matching tabs and slots
  automatically.
- **Hot-wire wing-core templates** — Foam wing cores are cut with a hot wire
  guided by a root template and a tip template, each an airfoil at a different
  chord with matching station marks. This depends on airfoil ingestion from
  UIUC coordinate files with chord interpolation, the domain gap that would
  produce the template pair for any published section.

Sources: flitetest.com, store.flitetest.com, balsaworkbench.com, easel.com

## Top YouTube channels (as of 2026-08-31)
- [Flite Test](https://www.youtube.com/results?search_query=Flite+Test) (search link) — the center of the foamboard RC ecosystem since 2010 (2.15M+ subscribers per search results); step-by-step build guides for its swappable-component plane designs plus free plans.
- [Experimental Airlines](https://www.youtube.com/results?search_query=Experimental+Airlines+foamboard) (search link) — foamboard construction techniques channel cited alongside Flite Test as a key contributor to the scratch-build method canon.
- [Mesa RC Foam Fighters](https://www.youtube.com/results?search_query=Mesa+RC+Foam+Fighters) (search link) — foamboard warbird/fighter designs and builds, another named contributor to the foam scratch-build community.

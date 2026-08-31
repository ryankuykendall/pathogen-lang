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

## Top YouTube channels (as of 2026-08-31)
- [Flite Test](https://www.youtube.com/results?search_query=Flite+Test) (search link) — the center of the foamboard RC ecosystem since 2010 (2.15M+ subscribers per search results); step-by-step build guides for its swappable-component plane designs plus free plans.
- [Experimental Airlines](https://www.youtube.com/results?search_query=Experimental+Airlines+foamboard) (search link) — foamboard construction techniques channel cited alongside Flite Test as a key contributor to the scratch-build method canon.
- [Mesa RC Foam Fighters](https://www.youtube.com/results?search_query=Mesa+RC+Foam+Fighters) (search link) — foamboard warbird/fighter designs and builds, another named contributor to the foam scratch-build community.

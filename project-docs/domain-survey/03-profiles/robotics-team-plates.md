# Robotics Team Plates (FRC/FTC)

**Tier:** physical-output · **Rubric:** Pop 2 · Pain 3 · Fit 4 · GapCost 3 · Adopters 4 = **288** · Longlist A12

## Snapshot
FIRST/VEX teams cut polycarbonate and aluminum plates on routers every build
season — bolt-pattern geometry with hard deadlines, done by students who are
being handed full CAD suites for a 2D problem.

## Description
FRC/FTC/VEX teams (FIRST alone fields tens of thousands of teams; ~100k+
students) designing drivetrain plates, brackets, intake side plates, and
sensor mounts. Sponsored tooling: Onshape and Autodesk free for teams;
common shop hardware is the OMIO-class desktop router; materials
polycarbonate, aluminum, Delrin (CO2-lasering polycarb is a known hazard —
router territory). Community documentation is unusually good (gm0.org,
frcdesign.org).

## Problems Pathogen could address
Plate work is 2D: bolt circles and hole patterns at standard pitches (#10 on
0.5" grids, goBILDA/REV metric patterns), lightening-hole (pocketing)
patterns, gusset geometry. Full CAD is overkill for much of it and a
teaching bottleneck; a text-based parametric plate is version-controllable
(teams live in Git), diffable in build logs, and regenerable when the
gearbox spacing changes mid-season.

## Commercial value
Not a revenue domain — an *adoption* one: education channel, sponsorship
visibility, students who carry tools into careers. Aligns with the STEM
profile's teachers-make-users thesis.

## Missing features
### Domain-specific [D]
- Hole-pattern library for team standards (REV/goBILDA/AndyMark pitches,
  bolt circles)
- Lightening-pattern generators (pocket grids with web-width rules)
- Bracket/gusset primitives with fillet-aware corners
### General [G]
- Physical units; **DXF export (the absolute gate — routers eat DXF)**;
  modules (team part libraries); testing (regression on part dims in CI —
  teams already run CI)

## User base
FIRST ~100k+ students/season plus VEX (larger team count globally);
mentor/student designers the active tier · confidence **M** (FIRST publishes
participation figures; verify exact numbers in a deep dive).

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** Chief Delphi (the FRC forum of record), gm0.org and
  frcdesign.org docs communities, team Discords, r/FRC and r/FTC.
- **Talking about right now:** Onshape and Autodesk both court FIRST teams as
  official 2026 suppliers (CAD onboarding is a recognized pain);
  materials-guide culture (polycarb for drivetrain plates, aluminum trade-
  offs, don't-laser-polycarb safety); desktop routers (OMIO X8) as the team
  standard. (onshape.com/education, gm0.org, frcdesign.org, swyftrobotics.com)
- **Obsessed with:** weight budgets, iteration speed during build season,
  passing down knowledge across graduating cohorts.
- **Blog content angles:** (1) a drivetrain plate as 30 lines of reviewable
  text — the Git-native pitch; (2) lightening patterns with web-width rules;
  (3) the goBILDA hole-pattern module.

## Pathogen fit today
Grids, transforms, boolean ops for pockets, deterministic dims. Without DXF
export it cannot enter the shop — the single hardest gate in the batch.

## Proposed validation project
A parametric FTC drivetrain side plate: goBILDA-pitch hole rows, bolt
circles, lightening pockets — DXF (once available) or SVG→DXF-converted, cut
in polycarb by a real team workflow.

## Top YouTube channels (as of 2026-08-31)
- [FUN Robotics Network](https://www.youtube.com/@funroboticsnetwork) — formerly FIRST Updates Now; news, robot reveals, interviews, and event coverage across FRC/FTC — the hub for seeing competitive robot design discussed in public.
- [Cranberry Alarm](https://www.youtube.com/results?search_query=Cranberry+Alarm+Ri3D) (search link) — Robot-in-3-Days team that designs, builds, and reveals a complete FRC robot days after kickoff, with technical breakdowns of drivetrains, plates, and mechanisms.
- *Thin YouTube presence for dedicated FRC/FTC build-tutorial channels; nearest-adjacent coverage is Open Alliance team build threads on Chief Delphi with embedded build video.*

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

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Paper match-scouting sheet** — Many teams still scout on paper: a form per
  robot with tally boxes for each scoring action, a small field diagram for
  marking the autonomous path, and a notes strip. Teams share their designs
  each season and fit several forms to a page to save printing. Grid, ruled
  lines and text draw it, the field outline is a few shapes, and it prints on
  ordinary paper.
- **Drive-team strategy map** — Before each match the drive coach sketches
  robot paths on a top-down field diagram, often a laminated print marked with
  dry-erase pens. The field is a rectangle with zones, scoring targets and
  starting lines, mirrored for the two alliances with a transform and coloured
  red and blue. Proportions matter but true size does not, so it is complete
  as a letter-size print or a tablet image.
- **Hole-pattern reference sheet** — New students learn the standard pitches
  first: holes on a half-inch grid, bolt circles for motors and bearings. A
  Grid of holes plus a loop around a circle draws both, with text labels
  naming each pattern. A short file makes a reference sheet for the shop wall
  or a design review. It is a teaching print that shows how the patterns
  relate, and nothing is cut from it.

### Intermediate — several features, or one gap
- **Lightening-pattern study** — Teams argue about pocketing: triangles, slots
  or circles, and how much web to leave. Subtracting a Grid of pockets from a
  plate outline with boolean ops draws each option, and cutting them as
  matching polycarbonate coupons lets students weigh and flex the results. The
  known dependency is DXF export, the format the router reads; until then
  every coupon goes through a separate SVG-to-DXF conversion.
- **Gusset shape family** — Gussets, the flat T, L and angle plates that join
  box tubing, are among the first parts a team cuts in house and are sold in
  starter packs. Each is an outline with rows of holes, and transforms give
  the mirrored and rotated versions, so one program draws the family. Cutting
  them depends on DXF export; until it exists a student converts each SVG to
  DXF before the router can run it.
- **Bearing and motor mount plate** — A mount plate combines a bearing bore, a
  motor bolt circle and a few rows of grid holes, with a pocket or two removed
  by boolean ops. All of that draws today. The single gap is physical units: a
  bearing bore is a press fit, and a diameter has to be stated in real inches
  or millimetres.
- **Mirrored intake side plates** — Intake side plates come as a left and
  right pair with shaft holes placed along an arc, and they change repeatedly
  during build season. Transforms mirror the pair and deterministic dimensions
  keep them matched. The gap is testing: teams already run CI and want a
  regression check on hole spacing whenever someone edits the plate.

### Advanced — depends on a named gap
- **Elevator and arm gusset kit** — A lift or arm needs a dozen custom
  gussets, each with rounded inside and outside corners so the router bit can
  follow them and the part does not crack. This depends on bracket and gusset
  primitives with fillet-aware corners, the domain gap that would make a
  gusset one call instead of hand-built arcs.
- **Pocketed superstructure plate** — Large side plates are pocketed to save
  weight, leaving a lattice of webs around every hole. Teams draw each pocket
  by hand and redo them when holes move. This depends on lightening-pattern
  generators with web-width rules, the domain gap that would refill a plate
  with pockets automatically while guaranteeing a minimum web.
- **Custom swerve module plates** — A few teams still design their own swerve
  modules: stacked plates carrying motor bolt circles, bearing bores and
  standoff holes that must align exactly through the whole stack. This depends
  on a hole-pattern library for team standards, the domain gap that would
  supply vendor motor and bearing patterns by name.

Sources: chiefdelphi.com, andymark.com, firstinspires.org

## Top YouTube channels (as of 2026-08-31)
- [FUN Robotics Network](https://www.youtube.com/@funroboticsnetwork) — formerly FIRST Updates Now; news, robot reveals, interviews, and event coverage across FRC/FTC — the hub for seeing competitive robot design discussed in public.
- [Cranberry Alarm](https://www.youtube.com/results?search_query=Cranberry+Alarm+Ri3D) (search link) — Robot-in-3-Days team that designs, builds, and reveals a complete FRC robot days after kickoff, with technical breakdowns of drivetrains, plates, and mechanisms.
- *Thin YouTube presence for dedicated FRC/FTC build-tutorial channels; nearest-adjacent coverage is Open Alliance team build threads on Chief Delphi with embedded build video.*

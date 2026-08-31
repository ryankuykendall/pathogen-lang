# Architectural & Scale Model Making

**Tier:** physical-output · **Rubric:** Pop 2 · Pain 3 · Fit 4 · GapCost 3 · Adopters 3 = **216** · Longlist A19

## Snapshot
Architecture studios and schools laser-cut facade studies, site models, and
massing models — a professional niche where 2026 industry data shows physical
modeling still commands ~28% of a $12.5B visualization market.

## Description
Model shops, architecture students, and studios producing concept/competition
models in MDF, acrylic, museum board. Laser-cut remains preferred over 3D
printing for speed and material feel (2026 UK-practice commentary confirms);
80W CO2 machines are the studio sweet spot. Workflow: CAD plans → manual
re-drawing into cuttable layered files (walls, floors, facade layers per
material sheet) — a tedious, error-prone translation step.

## Problems Pathogen could address
The CAD→cut-file translation is the pain: scale conversion, material
thickness compensation at slot joints, facade layer separation, and topo
site contours (stacked-layer terrain from elevation data) are all systematic
transformations done by hand in Illustrator. Parametric massing studies
(vary floor count, regenerate the stack) fit expression-first design;
stacked-contour terrain is Grid + data territory.

## Commercial value
Model-shop services, architecture-school course tooling, competition-driven
studio spend. Professional rates, small population.

## Missing features
### Domain-specific [D]
- Scale-ratio-aware output (1:200/1:500 with thickness re-solve at joints)
- Stacked-contour terrain generator from elevation grids
- Facade layer separation conventions (per-sheet material mapping)
- Slot/tab joints for massing stacks (shared with flat-pack)
### General [G]
- Physical units + named scales; data import (elevation/DXF plans); sheet
  nesting; DXF export

## User base
Est. 50–200k practitioners globally (students + studios + model shops) ·
proxy: architecture-school enrollment, service-bureau market · confidence
**L, unverified**.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** studio/school shop culture (not forum-centric),
  Trotec/laser-vendor application communities, student subreddits, service
  bureaus (CutLaserCut tier).
- **Talking about right now:** lasers gained camera positioning and LiDAR
  autofocus as standard (2020→2026 shift); laser-cut still preferred over
  3D print for architectural models on speed and material quality;
  sustainability framing entering shop marketing. (qzymodels.com,
  bluestarsystem.it, propertyunder50k.com, troteclaser.com)
- **Obsessed with:** clean charred-edge control, material palettes (basswood
  vs museum board), deadline crunches.
- **Blog content angles:** (1) a topo site model from an elevation grid —
  stacked contours generated, not traced; (2) massing study regeneration
  (floors as a parameter); (3) the thickness-compensated slot joint.

## Pathogen fit today
Layers, joints, Grid for terrain; the domain starts from external data
(plans, elevations), so data import and units gate the professional loop.

## Proposed validation project
A stacked-contour site model: synthetic elevation Grid → contour layers with
alignment pins, at 1:500 with 3 mm MDF re-solve — cut and stacked.

## Top YouTube channels (as of 2026-08-31)
- [OUROBOROS ARQ](https://www.youtube.com/results?search_query=OUROBOROS+ARQ) (search link) — construction processes of highly complex miniature buildings; ~2M subscribers per search results, videos with 50M+ views.
- [Smol World Workshop](https://www.youtube.com/results?search_query=Smol+World+Workshop) (search link) — scratch-built architectural models, 3D-printed details, and scenery dioramas (124K subscribers per search results).
- [Adam Savage's Tested](https://www.youtube.com/results?search_query=Adam+Savage+Tested+scale+model) (search link) — one-day builds regularly include scale/architectural models, e.g. a 1/24 foamboard building recreation.

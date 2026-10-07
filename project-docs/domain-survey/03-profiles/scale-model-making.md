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

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Stacked floor-plate massing study** — A massing model made by stacking
  identical or stepped floor plates with spacers between them. One footprint
  outline repeated with a floor-count parameter gives the whole cut sheet, and
  tapering or rotating the plates per floor gives the twisting-tower variants
  popular in studio reviews. It uses repetition and layers only; the maker
  still sets the drawing size by hand.
- **Figure-ground base plate** — The engraved site base on which a model sits:
  street blocks and neighbouring footprints scored into a board, with the
  project plot cut out. A synthetic block layout from Grid on one engrave
  layer and the cut outline on another makes a convincing practice base. Real
  sites need imported plans, so this version is for learning the layering
  convention.

### Intermediate — several features, or one gap
- **Facade study panel** — A flat elevation plate, often an early laser
  exercise: a wall rectangle with a regular grid of window openings, plus
  engraved lines for floor levels and mullions. Grid places the openings and
  separate layers keep cut lines apart from engrave lines, so changing bay
  count regenerates the panel. It has one known dependency, physical units
  with named scales; until then the maker works out the 1:100 dimensions by
  hand.
- **Layered facade relief** — A facade built up in depth — backing wall,
  window reveals, mullions and cladding strips, each cut from a different
  sheet and glued in register. Layers map to materials and Grid drives the bay
  rhythm, so several features combine. Arranging each layer's parts compactly
  on its own sheet is manual today; sheet nesting is the one general gap it
  meets.
- **Perforated screen facade** — The patterned sunscreen or brise-soleil panel
  that appears in many competition models: thousands of small openings whose
  size varies across the surface. Grid with deterministic noise produces the
  gradient and a repeatable result. Most school and shop lasers are driven
  from DXF, so the file needs converting on the way out — the DXF export gap,
  and the only one involved.
- **Context block model** — The grey neighbourhood blocks surrounding a
  proposal on a site model, cut as stacked plates of varying height. A Grid of
  footprints with heights from deterministic noise gives a plausible invented
  district for a studio exercise. Using a real neighbourhood means reading
  footprints and heights from survey or plan files, which waits on data
  import.

### Advanced — depends on a named gap
- **Waffle-section form model** — The egg-crate model taught in digital
  fabrication courses: two sets of interlocking ribs slotted at half depth,
  usually generated in Rhino and Grasshopper and exported as numbered parts.
  Pathogen would need the slot and tab joints listed as missing, with slot
  width re-solved for the sheet thickness. Numbered ribs and the slicing loop
  are already natural fits once joints exist.
- **Building model with removable facades** — A large presentation model whose
  coloured facade panels lift away to show the floors behind, as in documented
  student work reaching two metres tall. Every element is cut from a specific
  material and sheet. That depends on the facade layer separation conventions
  and on scale-ratio-aware output, so one description of the building yields
  correct parts at 1:200 or 1:50.
- **Masterplan model from survey drawings** — The 1:500 masterplan model that
  third-year projects and planning submissions call for: dozens of existing
  buildings as blocks, roads engraved, the proposal highlighted. The geometry
  starts in CAD plans, not in the model file. It depends on data import for
  DXF plans and on named scales with physical units — the professional loop
  the profile says is gated.

Sources: websites.umass.edu, b15.humanities.manchester.ac.uk, azbigmedia.com,
  openlab.citytech.cuny.edu, iaacblog.com, patriquinarchitects.com

## Top YouTube channels (as of 2026-08-31)
- [OUROBOROS ARQ](https://www.youtube.com/results?search_query=OUROBOROS+ARQ) (search link) — construction processes of highly complex miniature buildings; ~2M subscribers per search results, videos with 50M+ views.
- [Smol World Workshop](https://www.youtube.com/results?search_query=Smol+World+Workshop) (search link) — scratch-built architectural models, 3D-printed details, and scenery dioramas (124K subscribers per search results).
- [Adam Savage's Tested](https://www.youtube.com/results?search_query=Adam+Savage+Tested+scale+model) (search link) — one-day builds regularly include scale/architectural models, e.g. a 1/24 foamboard building recreation.

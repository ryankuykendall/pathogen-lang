# Domain Survey — Five Sample Domains (Summary v1)

*Stage 1 deliverable, 2026-08-30. Population figures are informed estimates,
unverified — Stage 3 sources each one. Individual one-page profiles for these
five live alongside this file.*

## Why these five

The Cutting Room proved a pattern: a domain expert's real artifact (a plate, a
puzzle, a pattern, a window) drives out language gaps faster than feature
planning does. The five below extend that pattern across the axes the series
didn't cover — physical machines other than paper cutters, populations from
~50k to ~10M, and communities that range from already code-native to not yet
parametric-minded.

| # | Domain | Output machine | Why it's a good probe |
|---|--------|----------------|----------------------|
| 1 | Laser-cut flat-pack | Diode/CO2 laser | Physical units + kerf + joints — the "engineering" end |
| 2 | Hobby die-cutting (Cricut/Silhouette) | Blade cutters | Largest population; SVG is the native format; Etsy file economy |
| 3 | Quilting: FPP & EPP templates | Home printer | Huge, underserved craft; seam allowance = `offset()` |
| 4 | Pen-plotter generative art | AxiDraw-class plotters | Highest early-adopter density; already code-native |
| 5 | STEM mechanisms & diagrams | Print / laser / screen | Education channel; parametric by nature |

## 1. Laser-cut flat-pack

**Domain.** Makers, makerspaces, and small-batch sellers designing boxes,
enclosures, signage, and furniture for diode/CO2 lasers (Glowforge, xTool, K40,
Epilog). Toolchain today: Boxes.py / MakerCase generators → Inkscape /
Illustrator / Fusion → LightBurn.
**Problems Pathogen addresses.** Every generator is a closed form; the moment a
design deviates (a cutout, a slot, a hinge) users drop to manual CAD.
Pathogen's `cut()` + labelled seams is exactly the "which edge mates with
which" model; layers already map naturally to cut/score/engrave operations.
**Commercial value.** Paid generator templates and parametric product lines
(Etsy laser files are a multi-million-listing category); makerspace curricula;
potential LightBurn/xTool ecosystem placement.
**[D] gaps.** Physical-unit geometry; **kerf compensation** as a first-class
`offset(kerf/2)` idiom on closed cut pieces; finger-joint / tab-slot /
living-hinge primitives parameterised by material thickness; sheet nesting; DXF
export; layer → operation-colour export profiles; dimension annotations.
**[G] gaps.** Modules (a shared joint library is the whole value), data import
(material-thickness tables), CLI batch generation.
**Population.** Desktop laser owners est. 1–3M globally (unverified; Glowforge
+ xTool + K40 install bases), 2k+ makerspaces. Early-adopter density: high.

## 2. Hobby die-cutting (Cricut / Silhouette)

**Domain.** Home crafters cutting vinyl, cardstock, HTV, and stickers. SVG is
the interchange format; designs are bought on Etsy / Creative Fabrica by the
millions.
**Problems.** Design Space and Silhouette Studio are weak at parametric and
layered design; sellers hand-build multi-colour layered files and "offset"
stickers in Illustrator. Text-on-path, welded text, offset outlines, and
print-then-cut registration are the recurring manual chores — all things
Pathogen already does or nearly does.
**Commercial value.** The largest file marketplace of any domain here; a
Pathogen-generated product line ("one script, 50 colourways/sizes") is a direct
seller advantage. Possible font/asset-pack revenue.
**[D] gaps.** Machine export profiles (Cricut's 72-dpi scaling quirk, no-stroke
compound-path conventions, layer-per-colour split, print-then-cut bleed);
rock-solid **outline `offset()` on text and curves** (the garment-post bug
class is fatal here); sticker-sheet nesting; multi-size variant export.
**[G] gaps.** CLI batch export, modules for reusable motifs.
**Population.** Cricut has reported ~5–9M engaged users; Silhouette adds more —
est. 10M+ machine owners (unverified). Early-adopter density: low-medium, but
the *sellers* (tens of thousands) are the wedge.

## 3. Quilting — foundation paper piecing & English paper piecing

**Domain.** Quilters designing blocks and printing FPP foundations / EPP
templates at exact scale. Tools: EQ8 (~$240), PreQuilt, Illustrator,
hand-drafting.
**Problems.** Blocks are inherently tiled, mirrored, and numbered; seam
allowance is a ¼" offset on every piece; every change means re-numbering and
re-checking scale. This is the garment post's "edges with names sewn in"
transferred to a bigger population.
**Commercial value.** Pattern sales (indie PDF patterns are a thriving
economy), block-of-the-month subscriptions, guild/education use.
**[D] gaps.** Physical units and a print-at-100% test square; `offset(0.25in)`
seam allowance that is *reliable on every piece*; automatic FPP section
numbering / sewing order (derivable from the seam graph — `pieces.seams()` is
the seed); mirror/repeat/rotate tiling of a block into a quilt with
fabric-yardage totals (area per label); grain-line markers; multi-page tiled
PDF with registration.
**[G] gaps.** Modules (block libraries), data import (fabric/colourway CSV).
**Population.** ~9–11M US quilters (Quilting in America survey, unverified);
FPP/EPP subset est. 1M+. Early-adopter density: low, but pattern designers are
highly tool-motivated.

## 4. Pen-plotter generative art

**Domain.** Artists and coders driving AxiDraw / iDraw / homebrew plotters;
community on #plottertwitter, Genuary, Drawingbots Discord. Tools: p5.js /
Processing + vpype + Inkscape.
**Problems.** Everything is stroke geometry with pen-width awareness, path
ordering, and hatching — currently a three-tool pipeline. Pathogen's
deterministic noise/hash, `partition`, `offset()`-as-ribbon, and segment labels
are unusually well aligned.
**Commercial value.** Small direct revenue (prints, workshops), but *the
highest influence per user* — this community writes the blog posts and tools
others copy. Strategic rather than commercial.
**[D] gaps.** Fill-to-hatch (filled regions → stroke sets at pen width); path
ordering/merging optimisation (TSP-ish, like vpype `linesort`/`linemerge`);
occlusion / hidden-line removal for overlapping shapes; multi-pen layer export;
HPGL/G-code export; stroke-only render mode; paper-size presets.
**[G] gaps.** Modules, CLI batch seeds, parameter sliders in playground.
**Population.** Est. 30–80k active (unverified; AxiDraw units +
Discord/Twitter membership). Early-adopter density: very high.

## 5. STEM mechanisms & dimensioned diagrams

**Domain.** Teachers, FIRST/VEX robotics mentors, and textbook/OER authors
producing gears, linkages, cams, coordinate diagrams, and classroom
manipulatives (fraction tiles, geoboards) as printables or laser parts. Tools:
GeoGebra, Desmos, TikZ, Fusion, hand-drawn.
**Problems.** Diagrams are parametric (change the tooth count, everything
re-lays out) but tooling is either GUI-locked (GeoGebra) or hostile (TikZ).
Manipulatives need exact physical dimensions and clean cut files. Pathogen's
Angle values, `calc()`, labels, and text layers already cover the annotation
half.
**Commercial value.** OER/textbook publishers, curriculum marketplaces (TpT),
robotics-team kits; a strong on-ramp for the language itself (teachers make
users).
**[D] gaps.** Involute gear / rack / sprocket primitives; linkage helpers
(four-bar); dimension lines and angle arcs with auto-placed labels;
axes/grid/tick generators; physical units; math-notation text (at least
sub/superscripts); parameter sliders in the playground for live demos.
**[G] gaps.** Data import (plot a CSV), modules (a "diagram kit"), testing (so
curriculum repos can verify diagrams).
**Population.** Millions of STEM teachers; Desmos/GeoGebra claim 100M+ users
(unverified); robotics teams ~100k students. Early-adopter density: medium.

## Cross-cutting observations

- **Three features unlock most of the map:** (1) physical units in the
  language, (2) reliable curve/text `offset()`, (3) machine-format export
  profiles (DXF / HPGL / machine-safe SVG). These should be evaluated as
  *wedge* investments before any domain-specific primitive.
- **Modules matter more than any single primitive** — every domain's value is a
  reusable library (joints, blocks, gears, motifs).
- The series' method — build the real artifact, log the friction — is the
  validation step for every profiled domain; the profile template includes a
  proposed demo for that reason.

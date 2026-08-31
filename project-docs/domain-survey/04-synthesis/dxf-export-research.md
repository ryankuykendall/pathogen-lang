# DXF Export — Research Note (2026-08-30)

*Prompted by user follow-up on "DXF is the absolute blocker for the
CNC/robotics/RC cluster." Feeds the Stage 4 wedge-feature analysis.*

## Correction to the profiles' framing

"Absolute blocker" is overstated for **lasers**: LightBurn, Glowforge, and
xTool software all import SVG natively. DXF matters specifically for:
- **CAM handoff**: VCarve/Aspire, Fusion 360 CAM, plasma-table controllers —
  DXF is the lingua franca with trustworthy units
- **CAD sketch import**: Onshape/Fusion (robotics teams) — DXF imports as a
  constrained sketch; SVG import is second-class and 96-dpi-scaled
- **Trade handoff**: die makers (CF2/DXF), panel shops, converters

So the gate is real for A17 CNC/plasma, A12 robotics, A13 RC, A9 panels,
A5 dielines-at-trade-level — but A1/A8/A6 laser domains work today via SVG.

## Why "just convert the SVG" underdelivers

Generic SVG→DXF converters fail on exactly what shops care about:
1. **Units**: SVG px/viewport vs DXF real-world units + `$INSUNITS` header —
   wrong-scale imports are the #1 complaint
2. **Curves**: SVG cubic béziers have no direct DXF equivalent; converters
   emit either faceted polylines (ugly, heavy) or SPLINE entities (poorly
   supported in CAM); machine-grade output wants **arcs/biarcs and
   bulge-bearing LWPOLYLINEs**
3. **Open vs closed paths**: open geometry gets skipped or breaks toolpaths
4. **Y-axis flip**, transform flattening, text-to-outline, layer mapping
   (SVG groups → DXF layers, which carry operation meaning downstream)

Converting our *rendered SVG* would discard semantics we hold upstream
(true arc commands, layer identity, future unit awareness) and then try to
reconstruct them lossily. The right architecture is a **native DXF emitter
from the internal geometry model** — the same slot the PDF exporter
occupies (jsPDF+svg2pdf precedent), but simpler: DXF R12/R2000 ASCII is a
plain tagged-text format.

## Node/TS ecosystem state (verified 2026-08-30)

- **ezdxf (Python)** — the field's reference implementation; wrong stack,
  but its docs are the best spec companion for whatever we build.
- **`@tarikjabiri/dxf`** (dxfjs/writer, TypeScript) — the credible TS
  writer: blocks, hatches, inserts, images, customizable entities.
  ⚠ Maintenance signal: v2.8.9 (Jul 2023) stable; **3.0 in alpha since
  Aug 2024**. Usable, but not a foundation to bet on blindly.
- **js-dxf / dxf-writer** — older, simpler writers (LINE/ARC/POLYLINE
  level); fine for minimal needs.
- **Maker.js** (Microsoft) — purpose-built 2D-CAD-for-CNC JS library with
  DXF export; effectively dormant for years.
- Parse side (not needed for export): dxf-parser, bjnortier/dxf.

## Recommendation for Stage 4

The serializer is the easy 80%; either take `@tarikjabiri/dxf` as a thin
dependency or hand-roll a ~300–500-line R2000 ASCII writer (entity set we
need: LWPOLYLINE+bulge, LINE, ARC, CIRCLE, layers, `$INSUNITS`).
The hard 20% is **ours regardless of library**:
- bézier→arc/biarc fitting with tolerance (CAM-grade curves). *Definition:
  a biarc is a pair of circular arcs sharing a tangent at their junction
  (G1); fitting matches position+tangent at both bézier endpoints and
  recursively subdivides until within tolerance. This is how all CAM speaks
  curves — G-code G2/G3 and DXF LWPOLYLINE bulges (tan(θ/4)) are arcs; and
  arc offsets are exact, which is what makes downstream kerf/tool-radius
  compensation reliable.*
- transform flattening + Y-flip from our command model
- closed-path discipline and layer→operation mapping
- units (depends on the physical-units wedge feature — these two features
  compose: units make DXF *trustworthy*)

Net: DXF export is a **medium** feature, not a large one, and its cost is
mostly geometry lowering we'd want for HPGL/G-code too — one "machine
formats" lowering pass, three export targets.

## Action item — library audit before any build decision (added 2026-08-30, user request)

Before committing to a DXF-export approach, run a proper audit of the two
candidate foundations:

1. **js-dxf / dxfjs (`@tarikjabiri/dxf`) maturity audit** — current state of
   the 3.0 alpha, commit/issue activity, entity coverage, and especially
   **test quality**. User's first-look assessment (2026-08-30): the dxfjs
   testing directory is underwhelming — "doesn't seem terribly robust."
   Verify against real-world acceptance: do its files import cleanly into
   VCarve, Fusion, LightBurn, Onshape?
2. **ezdxf (Python) maturity audit** — capabilities, test-suite depth and
   structure, spec-conformance approach, license (MIT), and how much of it
   our export slice actually needs.

Then decide between two paths (neither is "use dxfjs as-is"):
- **Fork js-dxf/dxfjs** and harden it for our needs (add the missing entity
  coverage, real tests, `$INSUNITS`/header discipline), or
- **Port the relevant slice of ezdxf to TypeScript**, on the theory that its
  tests and capabilities are the better foundation to inherit — a subset
  port (writer-side, R12/R2000, our entity set), not the whole library.

Audit deliverable: a comparison doc in this folder with a recommendation,
including acceptance-test results (import each candidate's output into the
four target applications above) and an estimate of effort for each path.
Either way, the bézier→biarc lowering pass remains our own work and is
unaffected by this choice.

## Declaring DXF intent in-language + DXF-native live preview (2026-08-31, user direction)

Two-part idea to fold into the eventual design:

**1. Capture the target in Pathogen source, not just at export.** A document
declaration (shape TBD — plausibly riding the same slot as the units v2
declaration, e.g. a target/profile that bundles Y-up axis convention,
`$INSUNITS`, and layer→operation mapping). This makes a "DXF document" a
property of the program — shareable, versionable, and visible to tooling —
rather than a dialog choice.

**2. DXF-coordinate live preview via a render-pipeline matrix transform.**
Apply a presentation-only transform (scale(1,-1) + translate, Y-up origin
bottom-left) to the SVG preview so a pathogen.studio user targeting DXF sees
their drawing in DXF's coordinate system in real time. Crucially, **no
bézier→biarc in the renderer** — the browser keeps rendering native SVG
curves; biarc lowering stays an export-pipeline step. This marries SVG's
expressiveness with a DXF-native UX.

Implementation notes for later:
- The flip itself is one group transform — cheap. The costs are around it:
  text/labels need counter-flipping (or they mirror), and rulers/grid/
  minimap need Y-up awareness — that's the shared pan/zoom controller and
  `svg-preview-pane.ts` territory, and a three-surface parity item (VS Code
  preview + CLI `--view` too, per project policy).
- Presentation-only: geometry, `ctx`, and query results stay in Pathogen's
  own coordinate model; only the view transform changes. This keeps the
  language untouched and the annotated evaluator out of scope.
- Independent of the js-dxf/ezdxf audit — the preview needs no DXF library
  at all.

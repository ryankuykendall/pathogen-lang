# Machine Embroidery Digitizing

**Tier:** physical-output · **Rubric:** Pop 4 · Pain 4 · Fit 2 · GapCost 1 · Adopters 2 = **64** · Longlist B7

## Snapshot
The largest market on the longlist with the deepest mismatch: embroidery is
*stitch-based*, not path-based — machines consume stitch sequences with
density, underlay, and pull compensation — an honest long shot recorded so
the synthesis sees why it scores low.

## Description
Home and commercial embroiderers digitizing designs for Brother/Janome/Tajima
machines. Software market is mature and expensive: Wilcom, Hatch (~$199/yr
subscription), Embrilliance, and the open-source outlier **Ink/Stitch**
(Inkscape extension — proof that a vector-first pipeline can feed stitch
generation). Formats: DST/PES/EXP stitch files.

## Problems Pathogen could address
Only the front half: the vector artwork that *feeds* digitizing. Parametric
motifs, lettering layouts, and border systems exported as clean SVG into
Ink/Stitch is a real bridge today. Full digitizing (fill algorithms, underlay
strategy, pull compensation, trims) is a domain-engine on the scale of the
whole compiler — not a feature.

## Commercial value
Large (digitizing services, design marketplaces like Embroidery Library are
substantial businesses) — but locked behind the stitch engine. The
bridge-to-Ink/Stitch path has modest, immediate value.

## Missing features
### Domain-specific [D]
- Stitch engine (fills, satin columns, underlay, density, pull comp) —
  **out of realistic scope; the reason for GapCost 1**
- Near-term instead: Ink/Stitch-friendly SVG conventions (closed fills,
  ordered objects, param attributes)
### General [G]
- None distinctive beyond the shared list — the [D] wall dominates

## User base
Multi-million machine owners (home embroidery is mass-market; subscription
software sustains multiple vendors) · confidence **M, unverified**.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** machine-brand Facebook groups, r/MachineEmbroidery,
  Hatch/Embrilliance user forums, Ink/Stitch GitHub community.
- **Talking about right now:** 2026 software discourse is subscription-vs-
  perpetual pricing (Hatch $199/yr vs Embrilliance one-time), Mac support,
  wireless machine sync; Ink/Stitch keeps growing as the free path.
  (needledown.com, truedigitizing.com, embpunch.com)
- **Obsessed with:** density/puckering problems, font quality, format
  conversion headaches.
- **Blog content angles:** only the bridge: "parametric motifs → Ink/Stitch"
  as a workflow post if we court the adjacent textile domains.

## Pathogen fit today
SVG motif generation feeds Ink/Stitch now; nothing else. Recommendation for
synthesis: **do not invest** [D] effort here; revisit only if a stitch-engine
partnership appears.

## Proposed validation project
(Bridge-scale only) A parametric border motif exported through Ink/Stitch to
PES, stitched on a home machine — documents the boundary honestly.

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Redwork line motif** — Redwork is single-colour outline embroidery,
  stitched as a running line with no fills. A geometric motif drawn as plain
  stroked paths exports as SVG and opens in Ink/Stitch, where each stroke
  becomes a running stitch. It is the most direct bridge available today
  because the stitch engine has almost no decisions to make about a line.
- **Monogram frame** — Monograms are the standard first machine-embroidery
  project, and a decorative frame around the initials is the reusable part;
  Ink/Stitch ships one among its sample files. A ring of repeated leaf or
  scallop elements is generated as SVG and stitched as outlines, with
  lettering added inside from Ink/Stitch's own fonts. Pathogen supplies only
  the frame geometry.
- **Appliqué shape outline** — Appliqué stitches a fabric cut-out onto a
  garment and is a recommended beginner technique. The digitizer needs one
  clean closed outline, reused for the placement line, tack-down and covering
  stitch. A heart, star or number drawn as a single closed path gives exactly
  that, and the same outline can go to a cutting machine to cut the fabric.

### Intermediate — several features, or one gap
- **Continuous-line quilting motif** — Quilting in the hoop uses motifs
  stitched as one unbroken line so the machine never stops to trim. Building a
  block design as a single path with no jumps, then tiling it for sashing and
  borders, combines path construction with repetition. Exported as SVG,
  Ink/Stitch turns it into a running stitch with little further work.
- **Circular text patch artwork** — Round patches with text following the rim
  and a simple centre emblem are a mainstay of small embroidery shops. Text
  converted to outlines on a circular path, a border ring and a centre motif
  come out as separate ordered shapes. Ink/Stitch then assigns satin or fill
  to each; the layout is Pathogen's and the stitching is not.
- **Blackwork-style pattern fill panel** — Blackwork and sashiko-style machine
  designs cover an area with a repeating line pattern, not a solid fill. A
  grid pattern clipped to a shape with booleans produces the line work, and
  tiling varies its density. The result imports as running stitches, giving a
  filled look without asking Pathogen for a fill algorithm.

### Advanced — depends on a named gap
- **Satin-column lettering that imports ready to stitch** — Satin columns form
  letters and borders, and Ink/Stitch needs them as paired rails with rungs,
  in stitch order, with parameters attached to each object. Today that
  preparation is done by hand in Inkscape after import. Emitting it directly
  depends on the Ink/Stitch-friendly SVG conventions the profile names as the
  realistic near-term work.
- **Free-standing lace ornament** — Free-standing lace is stitched on
  wash-away stabiliser and must hold together as thread alone, so underlay and
  density are structural. Ornaments, snowflakes and butterflies in this style
  sell steadily. Generating one end to end depends on the stitch engine —
  underlay, density, pull compensation — which the profile places outside
  realistic scope, so the entry marks the boundary.
- **Filled multi-colour logo to PES** — The core commercial job: a company
  logo with filled areas, satin borders and several thread colours, delivered
  as a machine file. Pull compensation, fill direction, trims and colour order
  decide whether it puckers. Every one of those belongs to the missing stitch
  engine, so Pathogen's possible role stays the clean artwork underneath
  unless a partner supplies the engine.

Sources: inkstitch.org, edutechwiki.unige.ch, kimberbell.com, zdigitizing.com

## Top YouTube channels (as of 2026-08-31)
- [John Deer's Embroidery Legacy](https://www.youtube.com/channel/UC9mQiNJuVXtaVyvOcXhAWHg) — digitizing fundamentals and live interactive digitizing sessions from a fourth-generation embroiderer billed as the world's most awarded digitizer.
- [Erich Campbell](https://www.youtube.com/channel/UC5zvsURIb2Uv3jU_taPQnyg) — digitizing, apparel decoration, and decorated-garment business; hosts a weekly live show ("The Takeup") with in-depth industry Q&A.
- [Ink/Stitch](https://www.youtube.com/results?search_query=Ink%2FStitch+tutorial) (search link) — official tutorials for the free, open-source Inkscape-based digitizing extension; the SVG-native path into machine embroidery (most relevant channel to this survey's vector angle).

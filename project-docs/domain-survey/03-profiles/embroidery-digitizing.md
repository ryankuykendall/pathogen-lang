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

## Top YouTube channels (as of 2026-08-31)
- [John Deer's Embroidery Legacy](https://www.youtube.com/channel/UC9mQiNJuVXtaVyvOcXhAWHg) — digitizing fundamentals and live interactive digitizing sessions from a fourth-generation embroiderer billed as the world's most awarded digitizer.
- [Erich Campbell](https://www.youtube.com/channel/UC5zvsURIb2Uv3jU_taPQnyg) — digitizing, apparel decoration, and decorated-garment business; hosts a weekly live show ("The Takeup") with in-depth industry Q&A.
- [Ink/Stitch](https://www.youtube.com/results?search_query=Ink%2FStitch+tutorial) (search link) — official tutorials for the free, open-source Inkscape-based digitizing extension; the SVG-native path into machine embroidery (most relevant channel to this survey's vector angle).

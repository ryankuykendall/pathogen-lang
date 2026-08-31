# String Art Templates

**Tier:** physical-output · **Rubric:** Pop 2 · Pain 4 · Fit 4 · GapCost 4 · Adopters 3 = **384** · Longlist C3

## Snapshot
String art is a genuinely computational craft — nail positions plus a thread
sequence — and the existence of dedicated web generators exporting nail maps
and CNC layers proves the audience already accepts computed templates.

## Description
Crafters hammer nails along a outline (or a circle of N pins) and route
thread to form images: geometric mandalas, lettering, and — the computational
end — greyscale portraits from a single thread (the Petros Vrellis style).
Tools: printed templates, or web generators (wowstrings.com, stringar.com)
that output pin maps, step-by-step thread sequences, and SVG layers for CNC.

## Problems Pathogen could address
The craft has two computable layers incumbents split across tools: geometry
(pin placement along arbitrary paths — `partition()` verbatim) and sequencing
(which pin to which pin, in order — greedy radon-transform-style optimization
for portraits, closed-form patterns for cardioids/mandalas). A Pathogen
program can place pins on *any* labelled path (not just circles), compute the
sequence, and emit template + numbered instructions + thread-length estimate
in one artifact.

## Commercial value
Template/kit sellers on Etsy (custom portrait string art is a personalized-
gift product); workshop/party kits; the generator sites themselves prove
willingness to pay for computed output. Modest ceiling, cheap to serve.

## Missing features
### Domain-specific [D]
- Pin-sequence solvers: closed-form (cardioid, epicycloid, star polygons) and
  greedy image-approximation (needs image import)
- Numbered-pin template rendering + step list ("23 → 141 → 8 …")
- Thread-length and nail-count estimates
### General [G]
- Data import (image sampling for portrait mode); number formatting;
  CLI batch (one photo → template kit)

## User base
Est. 100k–500k active makers · proxy: sustained Etsy/kit market, generator
sites' existence, large Pinterest/tutorial footprint · confidence **L,
unverified**. Adopter density medium-high for the portrait end (already using
generators).

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** Pinterest + craft blogs (Craftionary, Gathered),
  Etsy kit shops, generator-tool user bases (wowstrings, stringar), CNC/maker
  crossover forums.
- **Talking about right now:** photo-to-string-art generators are the visible
  innovation — tools now export nail maps and SVG layers for both manual and
  CNC making, with configurable pin counts (e.g. 288 pins); popular themes:
  zodiac, lettering, hearts, geometric. (wowstrings.com, stringar.com,
  gathered.how)
- **Obsessed with:** thread tension and layering order, pin-count trade-offs,
  the reveal moment in process videos.
- **Blog content angles:** (1) pins on *any* path — string art on a labelled
  Pathogen shape, beyond the circle; (2) the cardioid family as one-liners;
  (3) thread-length math nobody does by hand.

## Pathogen fit today
partition() for pin placement on arbitrary paths, markers for pins, text for
numbering, deterministic sequences, exact-scale PDF templates. Closed-form
patterns are buildable *today*; portrait mode waits on image import.

## Proposed validation project
A geometric string-art kit: pins partitioned along a star-polygon path,
closed-form thread sequence, numbered template + step list + thread estimate —
physically strung to verify the instructions read well.

## Top YouTube channels (as of 2026-08-31)
- [String Art Workshop](https://www.youtube.com/c/StringArt) — channel dedicated to nail-and-thread string art projects and technique.
- [RavsArt](https://www.youtube.com/results?search_query=RavsArt+string+art) (search link) — string art tutorials including mandala-style and geometric patterns.
- *Thin YouTube presence for this niche; most instruction lives in one-off tutorials and playlists (geometric triangles, sacred-geometry patterns, thread portraits) on general craft channels rather than large dedicated string-art channels.*

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

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Times-table cardioid** — The classroom classic: pins spaced evenly on a
  circle, a thread from each pin to the pin with double its number, and a
  heart-shaped curve appears from straight lines. `partition()` places the
  pins, markers draw them, text numbers them, and a short hand-written loop
  gives the sequence. Changing the multiplier to three or four draws the
  related curves from the same script.
- **Curve-stitch parabola corner** — The oldest string-art exercise, taught as
  curve stitching: pins along two lines that meet at an angle, with the first
  pin on one joined to the last on the other, and so on, until the threads
  outline a parabola. Two paths, two `partition()` calls and one loop make the
  template, which prints as a PDF at exact scale to tape onto the board.
- **Heart outline nail template** — The heart is the most common beginner
  string-art project, needing few nails and filled freely with thread. The
  template is nothing more than the outline with evenly spaced pin marks,
  which is `partition()` along a heart path with a marker at each point. Pin
  count and board size are parameters, and the same few lines place pins on
  any other outline.

### Intermediate — several features, or one gap
- **Name sign** — Lettering is the perennial string-art showpiece: a name or
  short word for a nursery or wedding, with nails along every letter's
  outline. Text converted to paths supplies the outlines, `partition()` spaces
  the pins along each contour, including the counters, and markers and numbers
  finish the template. It combines several shipped features and puts pins on
  paths no circle-based generator covers.
- **Home-state outline with heart** — A state or country outline with a small
  heart over a home town, strung so the thread fills the space between them,
  is a popular housewarming gift. Pins on two labelled paths and an
  exact-scale PDF are available now. The outline itself is the obstacle:
  border geometry has to come from a file, so the gap is data import.
- **Three-colour ring mandala** — Layering several thread colours on one ring
  of pins, each with its own step size, builds a mandala with depth; the
  layering order is what makers compare notes on. One `partition()` call
  places the ring, each colour has a deterministic sequence written as a loop,
  and text numbers the pins. No gap is involved, only a longer script.

### Advanced — depends on a named gap
- **Single-thread photo portrait** — The Vrellis-style portrait is one
  continuous thread around a few hundred pins, darkening wherever the
  photograph is dark, sold as personalised gifts and produced by web
  generators. The pin ring is already `partition()`. The gap is the greedy
  image-approximation solver and the image import beneath it, which together
  would let the portrait sit on any labelled path instead of a circle.
- **Classroom times-table card set** — Maths teachers hand out one card per
  multiplier, from two up to twelve, so a class can stitch the whole family of
  curves and compare them on the wall. Each card is the cardioid script with
  one number changed, and each can be exported singly now. Turning the range
  into eleven print-ready templates in one command is the gap: CLI batch
  generation, here on its smallest useful job.

*Web results for this niche were thin and dominated by template-farm pages;
the ideas rest on the smaller set of sources below.*

Sources: etsy.com, mathforamerica.org, mathcounts.org, babbledabbledo.com,
  instructables.com, hometalk.com, justcraftyenough.com, r-universe.dev

## Top YouTube channels (as of 2026-08-31)
- [String Art Workshop](https://www.youtube.com/c/StringArt) — channel dedicated to nail-and-thread string art projects and technique.
- [RavsArt](https://www.youtube.com/results?search_query=RavsArt+string+art) (search link) — string art tutorials including mandala-style and geometric patterns.
- *Thin YouTube presence for this niche; most instruction lives in one-off tutorials and playlists (geometric triangles, sacred-geometry patterns, thread portraits) on general craft channels rather than large dedicated string-art channels.*

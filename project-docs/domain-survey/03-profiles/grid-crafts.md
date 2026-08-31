# Grid Crafts (Perler, Diamond Painting)

**Tier:** data-driven · **Rubric:** Pop 4 · Pain 3 · Fit 4 · GapCost 2 · Adopters 2 = **192** · Longlist E4

## Snapshot
Fuse-bead patterns and diamond-painting canvases are image-to-grid
conversions with commercial palette systems (DMC drills, Perler colors) —
free web generators already prove the computed-pattern demand; custom-canvas
sellers are the paying tier.

## Description
Perler/Hama bead crafters (pixel-art adjacent, heavily youth/nostalgia
coded), diamond painters (a mass-market kit craft), and the custom-canvas
sellers who convert customer photos into kits. Tools: MakeBead-class free
web generators (photo → pattern with DMC color matching, per-color drill
counts, printable PDF charts), kit manufacturers' internal pipelines.

## Problems Pathogen could address
The conversion pipeline is exactly Grid + palette math: image sampling,
nearest-color mapping against commercial palettes, dithering choices,
per-color counts and cost estimates, chart rendering with symbols
(cross-stitch's chart kit reused). Beyond photo conversion: *generative*
patterns (geometric, mandala-on-grid) are an underserved design space —
generators only do photos. Sellers need batch production and consistent
chart quality.

## Commercial value
Custom diamond-painting canvas sellers are an established Etsy tier;
pattern packs sell; kit manufacturers have real pipelines. Buyer population
mass-scale, seller tier the wedge.

## Missing features
### Domain-specific [D]
- Commercial palette data (DMC drills, Perler/Hama/Artkal colors) +
  nearest-color mapping and dithering options
- Chart kit with symbols, counts, and cost estimates (shared with B2
  cross-stitch)
- Board/canvas size presets (29×29 pegboards, standard canvas sizes)
### General [G]
- **Image import (the gate for the photo pipeline)**; CLI batch; number
  formatting

## User base
Diamond painting alone is a mass craft (multi-million participants; kit
market in the hundreds of millions of dollars); perler adds the pixel-art
crowd · confidence **M for scale, unverified**.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** r/diamondpainting and r/beadsprites, large
  Facebook kit groups, TikTok satisfying-process content, Etsy custom-kit
  sellers, MakeBead-class tool user bases.
- **Talking about right now:** free photo-to-pattern generators with DMC
  matching are now table stakes (MakeBead's suite); 2026 kit trends favor
  characters/animals/decor collections; community discussion lives in kit
  reviews and WIP shares more than tooling. (makebead.com, etsy.com
  markets)
- **Obsessed with:** drill/bead quality, color accuracy vs the photo,
  completion satisfaction content.
- **Blog content angles:** (1) generative patterns for a photo-only tool
  culture — mandalas on the grid; (2) the palette-mapping math explained;
  (3) chart quality as craft respect (symbols, counts, no guesswork).

## Pathogen fit today
Grid, palettes, chart rendering near-ready (shares B2's kit); the defining
photo pipeline is fully gated on image import (GapCost 2). Generative-
pattern content is viable now.

## Proposed validation project
A generative perler pattern line: geometric designs on 29×29 boards with
Perler palette mapping, symbol charts, per-color bead counts — one
physically beaded to verify chart usability.

## Top YouTube channels (as of 2026-08-31)
- [Perler Bead Planet](https://www.youtube.com/c/PerlerBeadPlanet) — dedicated perler-bead tutorials, DIYs and tips; no longer posting actively but still the reference channel for the craft.
- [Diamond Painting By Doni](https://www.youtube.com/results?search_query=diamond+painting+by+doni) (search link) — positioned as the one-stop Q&A channel for diamond-painting technique and supplies.
- [Danielle Jones](https://www.youtube.com/results?search_query=danielle+jones+diamond+painting) (search link) — project-along tips channel (a roundup cited ~13k subscribers); representative of the diamond-painting community's process-video format.

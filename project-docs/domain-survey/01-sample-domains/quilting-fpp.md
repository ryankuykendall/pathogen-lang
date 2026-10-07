# Quilting — Foundation Paper Piecing & English Paper Piecing

**Tier:** physical-output · **Rubric:** Pop 4 · Pain 4 · Fit 4 · GapCost 3 · Adopters 2 = **384**

## Snapshot
Millions of quilters print geometric templates at exact scale; block design is
tiling, mirroring, numbering, and a ¼-inch offset on every piece — the garment
post's "edges with names sewn in," transferred to a far bigger population.

## Description
FPP designers draft numbered foundation sections that determine sewing order;
EPP designers produce template shapes (hexies, clamshells) cut from cardstock.
Tools: EQ8 (~$240 desktop app), PreQuilt (web), Illustrator/Affinity for the
pros, graph paper for everyone else. Output: print-at-home PDFs with a 1-inch
test square, or SVG for cutting machines.

## Problems Pathogen could address
Every design change re-triggers hand work: re-numbering sewing order,
re-checking the ¼" seam allowance on each piece, re-walking mirrored pairs,
re-computing fabric yardage. Pathogen's labelled seams make sewing order
*derivable* — `pieces.seams()` is the seam graph FPP numbering walks. Tiling a
block across a quilt with mirrored colourways is a loop, not a copy-paste
session. Area-per-label gives yardage totals for free.

## Commercial value
Indie PDF-pattern sales are a thriving economy (typical $8–15/pattern);
block-of-the-month subscriptions; guild workshops; teaching. A designer tool
that regenerates a pattern in any size with allowances intact removes the
domain's single biggest revision cost.

## Missing features
### Domain-specific [D]
- `offset(0.25in)` seam allowance that is *reliable on every piece* (same
  blocker class as garment/die-cutting)
- Automatic FPP section numbering / sewing-order derivation from the seam graph
- Block → quilt tiling with mirror/rotate/colourway mapping + fabric yardage
  totals (area per label)
- Grain-line arrows; print-at-100% test square; multi-page tiled PDF with
  registration marks
### General [G]
- **Physical units** (exact-scale print is non-negotiable); modules (block
  libraries); data import (fabric/colourway CSV); number formatting

## User base
~9–11M US quilters (Quilting in America survey) · FPP/EPP subset est. 1M+ ·
confidence **M, unverified**. Early-adopter density low overall, but pattern
*designers* — the paying tier — are highly tool-motivated.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** Instagram is the center of gravity (designers,
  quilt-alongs, process video); the Modern Quilt Guild and local guilds;
  r/quilting (~300k); large Facebook groups; designer newsletters and blogs;
  QuiltCon.
- **Talking about right now:** 2026 forecasts describe a "quieter, more
  intentional era" — away from tiny pieces and stark-white backgrounds, toward
  depth-over-brightness color and texture (wovens, low-volume, tone-on-tone).
  FPP's fashionable style is pop-art everyday objects (Elizabeth Hartman, Pen &
  Paper Patterns). Designers lean on short-form video tutorials as the
  discovery channel. (labizarraquilts.com, straightstitching.com,
  thequiltpatchbytori.com, 2026)
- **Obsessed with:** precision (points that match), fabric pulls and colorway
  planning, quilt-alongs, finishing backlogs of works-in-progress.
- **Blog content angles:** (1) a pop-art everyday-object FPP block designed in
  code, sewing order derived automatically; (2) colorway-variant generation as
  a designer superpower (feeds the video-tutorial format); (3) "walking the
  pattern, but it's a compiler" — precision story for the points-must-match
  crowd.

## Pathogen fit today
`cut()` produces pieces with named seams; segment labels survive derived paths;
mirroring via transforms; PDF export with real page sizes and margins; Grid for
block layout experiments; text layers for numbering.

## Proposed validation project
A paper-pieced star block: cut a block into numbered FPP sections, derive the
sewing order from the seam graph, add allowances, tile it 4×4 with mirrored
colourways, and emit a print-ready multi-page PDF with a test square.

## Population verification (2026-08-30)
**Verified via the 2024 Quilting Trends Survey** (Craft Industry Alliance):
9–11M active US quilters; US quilting a ~$4.5B industry (2025), projected ~$5B
by 2027; new-quilter share rising 11% → 18% by 2025; weekly hours up (6–10 vs
5 in 2017). Survey methodology: 1.8M invited, 37k+ responses · confidence
**M–H**. FPP/EPP subset share still unmeasured — keep 1M+ as an estimate (L).

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Hexagon papers for a flower block** — English paper piecing starts with
  hexagons, and Grandmother's Flower Garden — seven hexagons forming a flower
  — has been the entry pattern for generations. EPP papers are cut at finished
  size with no allowance. A Grid of hexagons on a real page size, printed and
  cut from cardstock, is a usable template sheet today.
- **Flying-geese foundation strip** — A strip of flying geese is the standard
  first foundation-paper-piecing exercise because the paper guarantees sharp
  points. Cutting a rectangle into its triangles gives pieces with named
  seams, and a text layer adds the sewing-order numbers, written by hand for a
  strip this simple. The foundation prints without allowances between pieces.
- **Colourway planning sheet** — Before cutting fabric, quilters mock up a
  quilt as a coloured diagram to test fabric pulls and block rotations. Grid
  repeats one block across the layout, transforms mirror and rotate alternate
  blocks, and fills stand in for fabrics. It is a planning aid, not a sewing
  pattern, so nothing depends on exact scale.

### Intermediate — several features, or one gap
- **Star block in four sizes** — Star blocks are sold as bundles with each
  design offered at several finished sizes. Cutting the block into sections,
  numbering them on a text layer and mirroring where needed are all shipped.
  Stating the finished size as six or twelve inches and trusting the print
  needs physical units, the general gap the profile calls non-negotiable.
- **Pop-art object block** — Pictorial blocks of everyday objects such as
  mugs, cameras and sneakers are FPP's fashionable style. Such a block has
  several sections and a few dozen pieces, produced by repeated cuts, with
  labelled seams, mirrored versions for directional prints and numbers placed
  manually. It exercises most of what is shipped without relying on derived
  sewing order.
- **Block-of-the-month series** — Designers sell twelve related blocks
  released monthly, sharing a grid, a border and labelling conventions. Each
  block is its own program today. Keeping the shared parts in one place so a
  change reaches all twelve is where the missing modules feature matters;
  block libraries are the example the profile itself gives.

### Advanced — depends on a named gap
- **La Passacaglia-style rosette pack** — La Passacaglia is the famous
  advanced EPP quilt: about 1,400 papers in five shapes arranged in
  interlocking rosettes. Makers buy pre-cut paper packs and count pieces per
  fabric by hand. Generating the rosettes with piece counts and fabric totals
  depends on the tiling and yardage item listed as missing — area per label
  across a whole quilt.
- **Pictorial animal portrait** — Large FPP portraits of animals run to a
  hundred or more pieces across many sections, and one mis-numbered piece
  makes a section unsewable. Designers number them by hand and test-sew. It
  depends on automatic section numbering and sewing-order derivation from the
  seam graph, which is listed as missing and is the profile's distinctive
  opportunity.
- **New York Beauty arcs** — New York Beauty blocks combine paper-pieced
  spiked arcs with curved seams joining the arcs to their corners. Every
  curved piece needs an accurate quarter-inch allowance or the block will not
  lie flat. It depends on the reliable seam-allowance offset listed first
  among the gaps, the blocker shared with garment and die-cutting work.

Sources: gathered.how, shop.aspoonfulofsugardesigns.com, quilthistory.com,
  ladysewandsew.co.uk, jinnybeyer.com, gallery.thequiltshow.com

## Top YouTube channels (as of 2026-08-31)
- [Missouri Star Quilt Co](https://www.youtube.com/results?search_query=Missouri+Star+Quilt+Co) (search link) — Jenny Doan; the most-watched quilting channel (1M+ subscribers per search results), broad block tutorials a newcomer can follow.
- [SewVeryEasy](https://www.youtube.com/results?search_query=SewVeryEasy+Laura+Coia) (search link) — Laura Coia; the most methodical technique breakdowns on YouTube, including paper piecing, flying geese, and half-square triangle sub-units.
- [Jordan Fabrics](https://www.youtube.com/results?search_query=Jordan+Fabrics+quilting) (search link) — consistently recommended 2026 quilting channel; clear project-based tutorials from a family fabric shop.

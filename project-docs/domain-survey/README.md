# Domain Survey — Where Pathogen Can Have Outsize Impact

**Started:** 2026-08-30 · **Status:** Stage 1 complete (method + five sample domains)

## Charter

The Cutting Room series (papercraft, jigsaw, garment, stained glass) worked as a
*friction log*: building a real domain artifact drove out concrete language gaps
faster than feature planning ever did (ledger:
`../cutting-room/FEATURE-OPPORTUNITIES.md`). This survey generalizes that insight:
identify **40–50 domains** across technologist, maker, crafting, and STEM
communities where Pathogen — a typed, expression-first language for parametric
2D geometry with named edges — could have outsize impact among early adopters.

For every domain we document:

1. **Description** — who, what they make, current toolchain
2. **Problems Pathogen could address** — the incumbent pain, concretely
3. **Commercial value** — who pays, for what
4. **Missing features** — tagged `[D]` domain-specific / `[G]` general (see
   `00-method/feature-taxonomy.md`)
5. **User base** — population estimate with source and H/M/L confidence
6. **Community & current conversation** — where the community gathers, what
   it's talking about right now, what it's obsessed with, and blog content
   angles (a *dated snapshot*, feeding future blog content for these
   communities; added at user request 2026-08-30)

## Stages

| Stage | Deliverable | Location | Status |
|-------|-------------|----------|--------|
| 1 | Method docs + 5 sample domains + two-page summary | `00-method/`, `01-sample-domains/` | ✅ 2026-08-30 |
| 2 | 50-domain longlist: one-liners + rubric scores (the index) | `02-longlist/longlist-v1.md` | ✅ 2026-08-30 (awaiting user coverage review) |
| 3 | **One-page profile for every domain** (no shortlist gate — user decision 2026-08-30), population figures verified via web search | `03-profiles/` | ✅ 2026-08-30 (all 45 + verification pass) |
| 4 | Synthesis: feature matrix, wedge features, general-language requirements, ranked recommendations, candidate Cutting-Room-style demos | `04-synthesis/` | ✅ 2026-08-30 |
| 5 | (optional) Multi-page deep dives for top-ranked domains | TBD | pending |

Artifacts are versioned (`SUMMARY-v1.md`, `-v2`, …), never overwritten — per
project convention.

## How to read this folder

Start with `01-sample-domains/SUMMARY-v1.md` (the two-page overview), then the
five individual profiles there. `00-method/profile-template.md` is the contract
every later profile follows.

## Open questions / opportunities (raised at Stage 1)

1. **Population sourcing.** Stage 1 numbers are informed estimates labeled
   *unverified*; Stage 3 verifies each with web search and cites. H/M/L
   confidence tags rather than false precision.
2. **Wedge-first synthesis.** Stage 4 should rank *features by number of domains
   unlocked*, not just domains by score. Early signal: physical units, reliable
   curve/text `offset()`, and machine-format export (DXF/HPGL/machine-safe SVG)
   look like the three wedges.
3. **`offset()` is a blocker, not a gap.** The garment-post bug class
   (curved-offset distortion) is disqualifying for die-cutting and quilting.
   Worth pulling forward regardless of survey outcome.
4. ~~Scope guard~~ **Resolved (user, 2026-08-30):** volume is fine; every domain
   gets a one-page profile, deeper dives later where warranted.
5. **Community-signal proxies.** Subreddit / Discord / Facebook-group sizes and
   Etsy listing counts are cheap, comparable proxies for both population and
   commercial value; folded into the rubric.
6. **Data-driven adjacent domains** (data-viz posters, maps, calendars, music
   notation) depend almost entirely on the `[G]` bucket (data import / HTTP).
   Tracked as a separate tier so they don't crowd out physical-output domains
   where the cut/label model is the differentiator.

## Status log

- **2026-08-31 (post-synthesis additions)** — (1) `dxf-export-research.md`:
  user direction recorded — declare DXF intent in-language (plausibly riding
  the units-v2 declaration slot) + DXF-native Y-up live preview via a
  presentation-only matrix transform on the SVG render pipeline (biarc stays
  export-side; text counter-flip, Y-up rulers, and three-surface parity
  flagged as the real costs). (2) All 50 profiles now carry a **Top YouTube
  channels (as of 2026-08-31)** section — ~130 channels verified via web
  search across four parallel research passes; thin-presence niches honestly
  flagged (guilloche, sashiko, plush, KDP coloring, string art, stationery,
  riso-specific, planner-specific, stencil-specific, sci-figures-specific)
  rather than padded.
- **2026-08-30 (Stage 4 complete)** — Synthesis delivered in `04-synthesis/`:
  `feature-matrix.md` ([G]×domains + 10 graduated shared kits),
  `general-language-requirements.md` (R1–R12 + explicit non-goals),
  `wedge-analysis.md` (modules #1 — must precede kit-building; multi-view
  export displaces machine export as the third wedge; 7 of 8 Tier-1 domains
  served by Phases A+B), `RECOMMENDATIONS-v1.md` (tiers, re-scores incl.
  fantasy-maps split at 432, five demo-series candidates + Tier-3
  publish-now one-offs, five open questions for user). Survey stages 1–4
  complete; Stage 5 deep dives optional.
- **2026-08-30 (pre-Stage-4 note 2)** — `04-synthesis/multi-view-export-concept.md`:
  user reframing recorded — "multi-page PDF" is really three mechanisms
  (pagination, tiling, view splitting) unified by a **multi-view export**
  abstraction (drawing model vs artifact plan; PDF pages / PNG sets / SVG
  sets / DXF as consumers of one view list). Added to the [G] taxonomy;
  replaces "multi-page PDF" as a distinct line in Stage 4.
- **2026-08-30 (pre-Stage-4 note)** — `04-synthesis/dxf-export-research.md`:
  DXF ecosystem research (blocker framing corrected — lasers accept SVG; DXF
  gates CAM/CAD/trade handoff) + **action item**: audit js-dxf/dxfjs vs ezdxf
  maturity and decide fork-and-harden vs TypeScript-port-of-ezdxf-slice; user
  found the dxfjs test directory underwhelming. Audit must include real-world
  import acceptance tests (VCarve, Fusion, LightBurn, Onshape).
- **2026-08-30 (Stage 3 complete)** — All 45 non-sample profiles written
  across 5 batches (each web-researched: community snapshot + population with
  confidence tags); population-verification addenda appended to the 5 sample
  profiles (Cricut ~6.0M active users and quilting 9–11M verified from
  primary/industry sources; FIRST 530k students verified; laser + plotter
  counts remain proxy-based L-confidence). Re-score recommendation: split D6
  into fantasy maps (top-tier) vs real-world cartography (deferred). Next:
  Stage 4 synthesis.
- **2026-08-30 (Stage 3, batch 1)** — Ten profiles in `03-profiles/`: kirigami,
  origami CP, stencils, leathercraft, coloring/KDP, dielines, cross-stitch,
  knitting charts, string art, weaving drafts — each web-researched (community
  snapshot + population proxies). Batch plan in `03-profiles/README.md`.
- **2026-08-30 (Stage 2)** — `02-longlist/longlist-v1.md`: 50 domains in five
  clusters (A cutting/fab ×21, B textile ×7, C print/surface ×9, D STEM/edu ×6,
  E data-driven ×7) with one-liners + provisional rubric scores, top-12
  ranking, and a folded/pruned paper trail. Cutting Room's four domains kept as
  uncounted reference rows. Awaiting user coverage review before Stage 3.
- **2026-08-30 (later)** — Added **Community & current conversation** field to
  the profile template (gathering places, live topics, obsessions, blog
  angles — snapshot-dated); backfilled all five sample profiles with
  web-verified intel. Rationale: the survey doubles as a content pipeline for
  community-targeted blog posts.
- **2026-08-30** — Stage 1: folder created; scoring rubric, profile template,
  feature taxonomy; five sample profiles (laser-cut flat-pack, hobby
  die-cutting, quilting/FPP, pen-plotter art, STEM mechanisms & diagrams);
  `SUMMARY-v1.md` two-pager. User decisions: one-page profiles for *all*
  domains in Stage 3; no shortlist gate.

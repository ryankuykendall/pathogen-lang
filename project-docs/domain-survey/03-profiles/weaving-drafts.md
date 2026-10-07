# Weaving Drafts

**Tier:** physical-output · **Rubric:** Pop 2 · Pain 3 · Fit 5 · GapCost 4 · Adopters 3 = **360** · Longlist B4

## Snapshot
A weaving draft (threading, tie-up, treadling → drawdown) is pure grid logic —
the drawdown is a *computed render* of three input grids — and the community
already runs on a file format (WIF) and a 75,000-draft digital library.

## Description
Handweavers on shaft looms and rigid heddle looms. The draft notation is
matrix algebra in craft form: threading (warp thread → shaft), tie-up (treadle
→ shafts), treadling (weft sequence) determine the drawdown (the cloth
pattern). Tools: Fiberworks, WeaveIt, handweaving.net (75k+ drafts, WIF
downloads), Not So Rigid Designer for rigid heddle. WIF is the community's
interchange format.

## Problems Pathogen could address
Draft design *is* programming — but incumbent tools are grid editors, not
languages: no loops, no parametric families ("this twill at every treadling
rotation"), no colour-and-weave exploration as code. The drawdown computation
is a few lines over Grids. Colour interacts with structure (colour-and-weave
effects) in ways designers explore by trial; parameter sweeps make it
systematic. Rigid-heddle conversion (the hot 2026 tooling topic) is a
constraint-projection problem.

## Commercial value
Small but organized: draft sales and books, Handweaving Academy-style
subscription education, guild workshops, Handwoven magazine ecosystem. Tool
subscriptions exist (Not So Rigid Designer), proving payment for computed
drafts.

## Missing features
### Domain-specific [D]
- Draft rendering kit (threading/tie-up/treadling/drawdown quad layout,
  standard notation)
- WIF import/export (the interchange format — JSON-simple, high leverage)
- Colour-and-weave simulation (thread colour × structure)
- Rigid-heddle projection (shaft draft → heddle/pick-up feasibility)
### General [G]
- Data import (WIF, yarn/colour tables); modules (structure libraries: twills,
  overshot, summer-and-winter); parameter sliders for treadling exploration

## User base
Est. 100k–300k active handweavers in North America/Europe · proxy: guild
memberships, Handwoven circulation, handweaving.net user base · confidence
**L, unverified**. Adopter density good: this community already trades
files and uses niche software.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** handweaving.net (Kris Bruland's 75k-draft library),
  Handweaving Academy, Ravelry weaving forums, guilds, Handwoven magazine +
  Long Thread podcast, Not So Rigid Weaver blog.
- **Talking about right now:** Not So Rigid Designer shipped full WIF import
  (July 2026) — converting shaft drafts to rigid-heddle designs is the live
  tooling race; profile drafts vs weavable drafts confusion for newcomers;
  community members on 2026 Handwoven covers. (handweavingacademy.com,
  notsorigidweaver.com, handwovenmagazine.com, littlelooms.com)
- **Obsessed with:** structure families (overshot, twill variations), WIF
  library spelunking, warp planning economics.
- **Blog content angles:** (1) "the drawdown is a pure function" — draft
  notation as three Grids and one computation; (2) colour-and-weave sweeps:
  one structure, 24 colour sequences; (3) WIF in, drawdown out — meeting the
  library where it lives.

## Pathogen fit today
The purest Grid fit on the longlist — drawdown computation needs nothing new.
Rendering kit + WIF I/O are the whole gap; both are kit-level (GapCost 4).

## Proposed validation project
A twill-family explorer: parametric threading/tie-up/treadling Grids, computed
drawdown with colour-and-weave, rendered in standard quad notation — validated
against a known handweaving.net draft.

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Plain weave and basket weave drawdown** — Every weaving course begins by
  filling in a drawdown on graph paper from a threading, a tie-up and a
  treadling. Written as three small Grids and one computation, plain weave and
  its doubled cousin basket weave become the first program instead. The result
  is the cloth diagram as filled cells, and changing one input Grid shows at
  once what that change does.
- **Monk's belt border** — Monk's belt is a two-block pattern on four shafts,
  woven as bold bands on towels and runners and often taught through a
  sampler. Its threading is two short units repeated in whatever sequence the
  weaver likes, which a loop expresses in a line. The drawdown Grid then shows
  the blocks, and rearranging the sequence is a matter of editing a list.
- **Profile draft block design** — A profile draft plans pattern blocks
  instead of single threads, and newcomers often mistake one for a draft they
  can weave. Because each cell stands for a whole block, the profile is just
  three small Grids and the same drawdown computation. That makes it an honest
  first design tool: sketch a block pattern for placemats, then see how the
  tie-up changes it.

### Intermediate — several features, or one gap
- **Overshot name draft** — Name drafting, a long-standing guild exercise,
  turns the letters of a name or motto into a four-shaft threading by a fixed
  rule and weaves it as overshot. The rule is a small function from text to a
  threading Grid, the treadling follows the threading, and the drawdown is
  computed. It combines text handling with the Grid computation and needs
  nothing missing.
- **Structure gamp** — A gamp is a sampler cloth in which several threadings
  sit side by side in the warp and the same set is used as treadlings, so
  every square shows one combination. That is a nested loop over two lists of
  Grids with a drawdown in each cell. The gap is modules: the lists are the
  twill, overshot and summer-and-winter structure libraries weavers want to
  share.
- **Striped towel warp plan** — Kitchen towels are the standard project for
  learning a structure, usually several from one warp with stripes planned in
  advance. The plan is a sequence of colour runs mapped onto warp threads,
  drawn with the drawdown below it, and end counts per colour summed for the
  yarn order. The single gap is data import, for the yarn and colour tables
  suppliers publish.

### Advanced — depends on a named gap
- **Log cabin placemats** — Log cabin alternates light and dark threads in
  warp and weft so that plain weave appears as blocks of fine vertical and
  horizontal lines. It only looks complicated, and it sells a great many
  placemat patterns. The effect lives entirely in the thread colours, so
  colour-and-weave simulation is the gap: render the cloth from thread colour
  and structure together.
- **Library draft remix** — Weavers browse tens of thousands of drafts online,
  download one, change the treadling or tie-up, and send it to their loom
  software. Free patterns ship a WIF file beside the PDF for that reason. WIF
  import and export is the gap and the highest-leverage opening: read a draft,
  transform it with a loop, and write it back for Fiberworks.
- **Rigid-heddle towel conversion** — Many newer weavers own a rigid-heddle
  loom and want patterns written for four shafts. Converting means finding out
  whether the draft can be woven with one or two heddles and pick-up sticks,
  and then writing the pick-up sequence. Rigid-heddle projection is the named
  gap, and the live tooling race in this community; a draft that reports its
  own feasibility would be new.

Sources: handwovenmagazine.com, gistyarn.com, schachtspindle.com,
  janestaffordtextiles.com, historicweaving.com, simonandschuster.ca,
  allfiberarts.com

## Top YouTube channels (as of 2026-08-31)
- [Kelly Casanova](https://www.youtube.com/c/KellyCasanova) — prolific rigid heddle-focused channel with short, tightly scoped videos for all levels; companion to her Online Weaving School.
- [Liz Gipson (Yarnworker)](https://www.youtube.com/user/LizGipson) — rigid-heddle patterns and know-how from the author of *Weaving Made Easy*; full-time weaving teacher.
- [Sara Bixler](https://www.youtube.com/results?search_query=Sara+Bixler+rigid+heddle+weaving) (search link) — structure-oriented teaching (huck lace, color-and-weave on rigid heddle) recommended by Little Looms' rigid-heddle resource roundup.

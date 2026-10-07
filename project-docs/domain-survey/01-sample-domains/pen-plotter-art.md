# Pen-Plotter Generative Art

**Tier:** physical-output · **Rubric:** Pop 1 · Pain 3 · Fit 5 · GapCost 3 · Adopters 5 = **225**

## Snapshot
A small, intensely code-native community drawing generative work on
AxiDraw-class plotters — currently welded to a three-tool pipeline
(p5.js/Processing → vpype → Inkscape) that Pathogen could collapse into one.

## Description
Artists and programmers on #plottertwitter, Genuary, and the Drawingbots
Discord, driving AxiDraw, iDraw, NextDraw, and homebrew machines. Artifacts:
limited-run prints, cards, commissions. Everything is stroke geometry: no
fills, pen-width-aware line spacing, multi-pen colour layers, and path
ordering that dominates plot time.

## Problems Pathogen could address
The pipeline seam is the pain: generate in one tool, optimize/sort/merge lines
in vpype, hand-finish in Inkscape. Pathogen's deterministic noise/hash ("same
seeds, same mountains, every compile"), `partition`, variable-width
`offset()`-as-ribbon, and segment labels cover the generative half unusually
well; what's missing is the plotter-facing back end.

## Commercial value
Small direct revenue (prints, workshops, commissions) — but the highest
influence per user of any surveyed domain. These are the people who write the
blog posts, tools, and tutorials other communities copy. Value is strategic
adoption, not marketplace dollars.

## Missing features
### Domain-specific [D]
- Fill-to-hatch: convert filled regions to stroke sets at a given pen width
  (hatch angle, spacing, crosshatch)
- Path ordering / merging optimisation (vpype `linesort` / `linemerge`
  equivalents — TSP-ish pen-up travel minimisation)
- Occlusion / hidden-line removal for overlapping shapes
- Multi-pen layer export; HPGL / G-code export; stroke-only render mode;
  paper-size presets (A3, 11×17)
### General [G]
- Modules (shared technique libraries); CLI batch seed runs; parameter sliders
  in the playground for live exploration

## User base
Est. 30–80k active worldwide · proxy: AxiDraw unit sales, Drawingbots Discord
(~20k+), #plottertwitter/Genuary participation · confidence **L, unverified**.
Early-adopter density: the highest of any domain — already writing code today.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** Drawingbots Discord (~20k+), the plottertwitter
  diaspora on Mastodon/Bluesky (#plotterart), r/PlotterArt, Genuary each
  January, generative-art spaces (fxhash et al.), penplotter.art.
- **Talking about right now:** plotter art is being framed as the antidote to
  the AI-image flood — "physical creativity in the AI era" is the community's
  self-narrative and its growth engine. New hardware entrants (UUNA TEK, iDraw,
  NextDraw) are widening the hobby beyond AxiDraw. The Python toolchain
  (vpype, axidraw APIs) remains the lingua franca; HP-GL/2 persists as the
  wire format. (idrawpenplotter.com, uunatek.com, penplotter.art, 2026)
- **Obsessed with:** pen/ink/paper combinations, line quality, plot-time and
  travel optimization, Truchet tiles and flow fields, process videos of the
  machine drawing.
- **Blog content angles:** (1) Genuary prompts done in Pathogen (January
  timing); (2) "same seed, same mountains" — determinism as the answer to
  AI-era provenance anxiety; (3) a Pathogen→vpype bridge tutorial that meets
  the toolchain where it is.

## Pathogen fit today
Deterministic noise/hash and easing; `partition`/`subPath`/`normal` for
parametric sampling; variable-width offset ribbons; boolean ops; layers for
pens; SVG export. A plotter artist could work in Pathogen today and post-process
with vpype — that bridge is itself a credible first move.

## Proposed validation project
A flow-field landscape print: noise-driven strokes, hatched fills, two-pen
layers, occlusion between ridgelines — exported as layered SVG that runs
through vpype/saxi to a real plotter, friction-logging every seam.

## Population verification (2026-08-30)
No published community counts found: AxiDraw/Evil Mad Scientist release no
unit figures; DrawingBots.com documents the ecosystem (machines, generators,
resources) without membership stats. The 30–80k estimate stands on Discord/
hashtag proxies · confidence **L** (unchanged). Note: 2026 vendor landscape
broadened (UUNA TEK, iDraw, NextDraw), which supports the growth claim
qualitatively.

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Truchet and 10 PRINT tiles** — The recommended first plot: a grid of
  cells, each holding a diagonal or a pair of quarter arcs, with orientation
  chosen at random. In Pathogen the choice comes from the deterministic hash,
  so a seed reproduces the plot exactly. Arcs are single continuous strokes,
  which plot cleanly, and the SVG goes straight to vpype or the AxiDraw
  software without further preparation.
- **Guilloche rosette** — Spirograph-style rosettes and banknote guilloches
  are a plotter classic because fine pens render dense, even curves
  beautifully. A parametric curve sampled along its length, repeated with
  small changes in radius or phase and softened with easing, produces the
  whole family. Each curve is one unbroken path, which keeps pen lifts low
  without any path-ordering step.
- **Noise-ring study** — Concentric rings whose radii are nudged by noise,
  growing more disturbed toward the outside, are a staple of Genuary feeds.
  Sample each ring with partition, displace each sample along its normal by a
  noise value, and repeat with a rising amplitude. It teaches the sampling
  tools the profile lists, and the deterministic noise means a good seed can
  be plotted again later.

### Intermediate — several features, or one gap
- **Two-pen layered ribbon plot** — A common step up is a design split across
  two pen colours, plotted in turn with careful registration. Variable-width
  offset ribbons along a noise-bent spine, with alternate ribbons assigned to
  two layers, make a strong first piece. The layered SVG is then separated per
  pen in vpype, the bridge the profile calls a credible first move, with no
  missing feature involved.
- **Pattern clipped to shapes** — Filling a circle, a letterform or a
  silhouette with a line pattern, and leaving the surround blank, is a
  long-standing plotter look. Boolean operations cut a field of parallel or
  wavy strokes to the shape, and layers hold separate shapes for separate
  pens. It combines sampling, noise and booleans, all shipped, and is the
  manual route to effects a hatch fill would automate.
- **Postcard-exchange edition** — The Plotter Postcard Exchange has artists
  plot dozens of cards, ideally each a unique variation of one design. In
  Pathogen each card is the same program with a different seed. CLI batch seed
  runs [G] is the single gap: today the seed is edited and exported card by
  card, where a batch run would emit a numbered edition in one command.

### Advanced — depends on a named gap
- **Isometric city with hidden lines** — Stacked isometric boxes and
  cityscapes are popular plots, but a pen cannot paint over what lies behind,
  so every edge hidden by a nearer block must be removed before plotting.
  Artists use vpype's occult plugin for this. Occlusion and hidden-line
  removal for overlapping shapes [D] is the gap that would keep that step
  inside the source file.
- **Fifty-thousand-segment stipple plot** — Dense works such as stippled
  portraits or long hatched fields take hours to plot, and unsorted paths can
  double that with wasted pen-up travel. vpype's linesort and linemerge are
  the community's standard fix. Path ordering and merging optimisation [D] is
  the gap; built in, Pathogen's export would be plot-ready and the reported
  travel distance could guide design choices.
- **Vintage HP plotter revival** — A lively corner of the scene restores 1980s
  machines such as the HP 7475A, which take HPGL commands and a carousel of
  pens, not SVG. Getting a design onto one means a conversion chain with
  per-pen commands. HPGL or G-code export with multi-pen layers [D] is the
  gap, alongside paper-size presets for A3 and 11×17 sheets.

Sources: tylerxhobbs.com, dirtalleydesign.com, blog.gramener.com,
  generativeart.de, fosstodon.org, docs.rs, buttondown.com, v.st

## Top YouTube channels (as of 2026-08-31)
- [Duncan Geere](https://www.youtube.com/results?search_query=Duncan+Geere+pen+plotter) (search link) — generative/data artist documenting AxiDraw plotter work on video alongside his written tutorials.
- *Thin YouTube presence for this niche; nearest-adjacent coverage is the Generative Hut community site, Instagram plotter round-ups (@penplotart), and DrawingBotV3 tutorial videos.*

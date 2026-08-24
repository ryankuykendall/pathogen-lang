# The Cutting Room — a 4-part tutorial series on cut() + segment labels

## Context

Commit `b448c31` shipped family-wide label preservation: pieces from
`cut()` keep the subject's `as segment(...)`/`as endpoint(...)` names, and
every healed seam carries the automatic `'cut'` label. The Cutting Paths
post (series part 5) predates this and can't show it. The user wants
project-driven tutorials in the Stdlib Primers format showing cutting and
labeling working together — scope expanded from one post to **four, one
per project domain, forming a new 4-part series** (user-approved forks:
new series; one-project-laddered structure per post; all four domains).

## Series design

- **Series name (proposal)**: "The Cutting Room" — four projects that put
  `cut()` and segment labels to work. `seriesDescription` rides on part 1.
- **Posts, order, sample dirs** (order ramps from widest-toolkit opener to
  color-story finale; consecutive dates per blog convention, actual dates
  set at publication):

| Part | Slug | Domain | Samples |
|---|---|---|---|
| 1 | cutting-room-papercraft | Flat-pack papercraft ornament | post41 |
| 2 | cutting-room-jigsaw | Jigsaw puzzle | post42 |
| 3 | cutting-room-garment | Garment pattern sheet | post43 |
| 4 | cutting-room-stained-glass | Stained-glass window | post44 |

- **Format** = Stdlib Primers template, verified against primer-hash11.md:
  frontmatter (title/slug/date/description/series/seriesPart), no body H1,
  italic *Part N of 4* subtitle, blockquote series TOC (current post
  bolded + "(this post)"), `## What it does`, `## Why you'd use it`
  (closing with the idiom fence), `## Example 1 — name` … `## Example 5/6`
  (setup prose → `<mini-workspace src="samples/postNN/0N-name.pathogen"
  caption="..." code-open>` → interpretation prose), `## Where to go
  next`. Prose hard-wrapped ~72 cols.
- **Plus a `> **Prerequisites:**` callout** (unlike the primers): each post
  assumes `cut()` (link pathblock-cutting) and segment labels (link
  /docs#segment-labels). Guideline treats a missing callout as a defect.

## Per-post example ladders (each: bare mechanism → shippable composition)

**Part 1 — Papercraft** (the core toolkit, widest spread):
1. First cut + the seam query — cut a rectangle, `segmentAll('cut')` on
   the projected piece, seams highlighted; contrast row plain vs decorated.
2. Cut lines vs fold lines — dashed fold decoration via
   `.partition(n)` dots along seam runs.
3. Glue tabs — tab trapezoids generated along seam runs from partition
   points (+ angles), only on cut edges, never on original boundary.
4. Named pieces — label subject edges first; pieces keep the labels;
   identify/caption pieces by which labels they kept.
5. Exploded assembly view — pieces offset along centroid rays
   (boundingBox centers), mating seams highlighted in matching accents.
6. Finished template — unfolded ornament: solid cut lines, dashed folds,
   tabs, piece captions. Shippable print sheet.

**Part 2 — Jigsaw** (curved knives, piece identity, rotate()):
1. A wavy knife — curved cut, seams are curves; bare mechanism.
2. The interlocking nub — classic jigsaw bump knife from cubics.
3. Grid of knives — many pieces; classify corner/edge/center pieces by
   `segmentAll('cut').length` and tint accordingly.
4. Registration marks — matching alignment dots on both sides of a seam
   via partition midpoints.
5. Spin in place — frame-preserving `rotate()` per piece (no pivot
   compensation), seam dots ride along.
6. Finished puzzle — colorful subject, pieces drifted + rotated, one
   piece "missing," box-lid inset.

**Part 3 — Garment pattern** (authored labels doing the work):
1. Label the garment outline ('hem', 'collar', 'side') — labels survive
   one cut; bare survival demo.
2. Front/back pieces — identify pieces by kept labels, caption them.
3. Seam allowance — `offset()` each piece (labels survive offset);
   stitch line dashed inside the allowance edge.
4. Notches — alignment ticks at points along *labeled* edges (pointAll /
   partition on named runs), matching across pieces.
5. Pattern sheet layout — pieces arranged via boundingBox()/drawTo with
   grainline arrows and text captions.
6. Finished pattern sheet — all of the above composed: allowances,
   notches, captions, fold-on-grain markings.

**Part 4 — Stained glass** (color finale, boolean + labels):
1. Rose-window radial cuts — seam group as leading; bare mechanism.
2. Your own 'cut' label merges — user `as segment('cut')` joins the seam
   group by design; decorate once, get both.
3. Tinted panes — per-piece fills from a hash-driven oklch palette,
   thick round-cap seam strokes as came/leading.
4. Boolean + labels — window frame via `difference()`, labels from both
   operands coexisting.
5. Solder beads — partition dots along every seam intersection region.
6. Finished window — full composition with gradients/glow, the series
   closer.

(Each ladder to be tuned while drafting; 5 examples acceptable where 6
pads. No mechanism is introduced twice as a "new idea" across posts —
later posts use earlier mechanisms freely but teach only their own.)

## Build workflow (per post, sequentially — part 1 first, fully finished)

1. Write samples in `website/blog/samples/post4N/` — numbered
   `01-name.pathogen`; line 1 `// viewBox="..."`, `//--` description,
   `define ViewBox(...);`. Follow code-example-guidelines: multiline path
   blocks, GroupLayer-based layout (no absolute-canvas math), labels with
   leader lines, ≥15px margins, no hard-coded values a method provides,
   `${}` interpolation, `oklch(L C H)` literals. Seam queries on the
   **projected** form (segment() sub-blocks rebase — the trap).
2. Compile: `npm run compile:samples -- --post=4N` (never hand-roll the
   CLI; script bakes --include-metadata + GPU/CPU pick). Eyeball SVGs.
3. Validate + review PNGs: `npx tsx scripts/validate-samples.ts
   website/blog/samples/post4N/`.
4. BBWP each sample (`/bbwp`), then the user can track progress at the
   bbwp index (per standing preference).
5. Write the post `.md` in `website/blog/` (auto-discovered — no
   registry). `npm run build:blog`; verify at localhost:3000 (dev server
   already running).
6. Agentic content review: `content-reviewer` agent (4-persona) per post;
   apply must-fix findings.
7. `npm run check-links` after all four posts exist (TOCs cross-link).

## Cross-cutting changes

- **Fix stale claims in website/blog/pathblock-cutting.md** (lines 27 and
  125 say labels don't survive cut — factually wrong since b448c31;
  voice-guideline's "factually wrong" exemption authorizes editing an old
  post). Rewrite both to state the current contract and link the new
  series from its Where-to-go-next.
- Artifacts: `project-docs/cutting-room/` — STATUS.md + copy of this plan;
  preserve iterations per project convention.
- **No commits until the user has reviewed the prepared posts.** When
  approved, stage posts + samples + `website/bbwp/index.html` + source
  .pathogen files only (never generated .bbwp.html/.mw.html).

## Verification

- Every sample compiles via compile:samples with zero warnings; SVGs
  render correctly (eyeball PNGs from validate-samples).
- validate-samples passes for post41–44 (margins/collisions).
- `npm run build:blog` green; all four posts render at
  localhost:3000/blog/<slug> with series section grouping on the index.
- check-links clean over the new pages (TOC cross-links + docs anchors).
- content-reviewer findings addressed per post.
- BBWPs present in the bbwp index for all samples.
- No `src/` changes anticipated; if a language bug surfaces while writing
  samples, stop and surface it before working around it.

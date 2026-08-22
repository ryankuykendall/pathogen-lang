# PathBlock.cut() — Status

**2026-08-22 — v1 implemented, reviewed, all tests green.**

`PathBlock.cut(cutter)` slices a subject path (open or closed, multi-contour)
along the strokes of a cutter PathBlock and returns an ArrayValue of healed
pieces. Plan: `~/.claude/plans/i-would-like-to-partitioned-galaxy.md`.

## What shipped

- **Docs-first**: `docs/path-blocks.md` gained a `## Cutting Paths` section
  (`#path-blocks-cutting-paths`); the boolean section's "must be closed"
  wording is now scoped to the four set ops. Also fixed the section's
  pre-existing broken `circle(30)` 1-arg examples (they compiled to NaN;
  `circle` is `(cx, cy, r)` and calls inside `@{}` need `;`).
- **Kernel** (`src/evaluator/boolean-ops.ts`): new export
  `pathCut(subject, cutter, warnings?) → TransformCmd[][]` — planar
  arrangement + face walk, reusing the private intersection/splitting stages:
  - subject prep: §2.14 normalization prologue → close → **winding
    canonicalization** (even depth positive / odd negative → material always
    on the LEFT of every directed boundary edge);
  - cutter chains never pass through `includeClosingSegment` (the knife
    stays open); closed loops (authored or assembled geometrically from
    separate strokes) act as cookie cutters;
  - endpoint snap: golden-section nearest-point projection, tolerance
    `max(0.5, bboxDiag×1e-3)`; deep stabs prune to no-ops;
  - record-based node table (union-find) with **scale-aware merge distance**
    `cutNodeMergeDist = clamp(bboxDiag×2.5e-3, 1e-9, 0.5)`;
  - one-sided subject half-edges + twinned cutter half-edges; face walk picks
    the clockwise-most successor relative to the reversed arrival tangent
    (probe-point tie-break); every traced face is material — the unbounded
    face and hole interiors are never traced;
  - hole assignment: negative rings attach to the smallest strictly-larger
    containing positive ring (strictness keeps a cookie loop from containing
    its own reversal);
  - open subjects sever at crossings into open fragments (no healing).
- **Shared-kernel fixes** (benefit the booleans too):
  - `subpathSignedArea` now samples curves — the chord-only shoelace was
    exactly 0 for a two-arc circle, which made `unionIntersectingSameWindingSubpaths`
    eat circle-built donut holes;
  - `adaptiveCrossing` takes a precomputed evaluator closure and threads
    endpoints through the recursion — arc winding tests no longer re-derive
    the arc center per sample (~15x on arc-heavy cuts; the boolean suite
    itself dropped from ~6.1s to ~0.7s);
  - `findAllIntersections` gained `{vertexPolicy: 'drop'|'snap', vertexSnapDist}`
    (default `'drop'` byte-identical for the booleans; cut snaps vertex-vertex
    crossings instead of dropping them).
- **Evaluator**: `case 'cut'` on both PathBlock and ProjectedPath receivers
  (`src/evaluator/index.ts`), returning ArrayValue of PathBlocks built with
  origin (0,0) so pieces keep subject-local placement (drawing all pieces at
  one position reassembles the shape; offsets make exploded views).
  Data-loss paths (malformed face, sliver, unassignable hole) surface as
  `[warn]` log entries per the filletCommands pattern. Annotated mode: cut is
  on the sanctioned "not supported in --annotated" list (both receivers).
- **Language surface**: `cut(cutter): PathogenArray<PathogenPathBlock>` in
  `src/pathogen-api.ts` (both interfaces) → completions/hover/type-inference
  regenerate from it.
- **Tests**: `tests/path-cut.test.ts` (29) — piece counts, healing z-counts,
  bbox geometry, snap tolerances, vertex/tangency/collinear edges, donuts,
  islands, cookie cutters (inside + straddling + assembled-from-strokes),
  grid decomposition (16 cells), radial sectors on an arc subject (8),
  tiny-scale regression (0.3-apart knives at 3×2 scale), mixed open+closed
  subjects, empty subject, open fragments, ProjectedPath receiver, errors.
  Plus an annotated-mode error test.

## Piece emission convention

A piece's first contour has **no leading m** — the serializer's
bridgeOriginGap positions it (fillet-shift convention); later contours (holes)
are separated by an `m` whose start equals its end, keeping `boundingBox()`
free of a fictitious origin point.

## Code review outcome (2026-08-22)

No criticals. All three warnings fixed in-session: arc perf cliff
(measured 1027ms → 70ms at 80 strokes), silent data-loss paths (warnings
channel), scale-inconsistent node tolerances (reviewer's tiny-scale repro is
now a regression test). Deferred suggestions: consolidate
`interiorSampleOfRing` with `unionIntersectingSameWindingSubpaths`'s
`findInteriorPoint`; the module-wide absolute-0.5 tolerances in the four
boolean ops at tiny scales (pre-existing, tracked here).

## Verification

- Full suite green (4752 → re-run after review fixes).
- `demo-glyph-cut.pathogen` / `.svg` / `.png` — Georgia 'O' (two contours)
  cut by the two-stroke knife from the motivating example: 4 pieces / 2
  pieces, exploded, matching the original illustration.
- Playground engine path verified by executing `cut()` through the built
  `dist/index.cjs` bundle (`compileWithContext`); an in-browser playground
  click-through has not been run yet. VS Code preview remains a stub
  (pre-existing, tracked in `packages/vscode-pathogen/CLAUDE.md`).
- `npm run check-links`: 37 pages, 1135 links, 0 broken.

## Remaining (next sessions)

1. Agentic review (content-reviewer) of the new docs section — required
   before commit/publish.
2. Blog post: Part 5 of the "PathBlock Extensions" series — synopsis review
   with the user first, 5–6 samples via `compile:samples`, BBWPs, full
   playbook in `website/blog/CLAUDE.md`.
3. In-browser playground verification (dev:website) as part of the blog
   sample work.
4. Deferred v1 non-goals: options/tolerance arg, kerf, self-intersecting
   single cutter segments, annotated-mode support, meta/label preservation.

## Docs agentic review (2026-08-22)

Four-persona review (UXD/UXE/PM/ID) of the Cutting Paths section ran clean of
factual errors but returned 7 must-fix items — all applied in-session:

1. Signature heading `Array<PathBlock>` outside backticks shipped as raw HTML
   (sidebar showed "→ Array") → heading now reads `→ array of PathBlock`.
2. Published docs artifacts were stale (old broken circle examples) →
   rebuilt via `npm run build:docs`; check-links re-run.
3. Added the `--annotated` debug-mode callout (variable-offset pattern).
4. Tolerance sentence corrected: named the `max(0.5, diagonal × 0.001)`
   floor instead of implying a purely scale-relative snap.
5. "Healed shut" intro now carries the open-subject exception inline.
6. Cookie-cutter example added (was claimed, never shown); also notes that a
   loop assembled from separate strokes is recognized geometrically.
7. Grazing-tangent and collinear-stroke no-cut modes documented.

Also applied from should-improve: behavior list regrouped under bold
lead-ins (arguments/results, tolerances, strokes that don't cut, compound
cases); placement + always-PathBlock-return + labels-don't-survive +
`[warn]` bullets added; glyph example annotated as the crossing case with
`fromGlyph` linked on first use; examples given observable outcomes
(logged counts verified by compilation before writing them in); closing
composed example added (disc quartered into alternating warm/cool layers —
compiled and verified). Deferred "consider" items: dedupe of the repaired
boolean examples, blog-post link once Part 5 lands.

Blog synopsis v1 at `blog-synopsis-v1.md` (awaiting user review).

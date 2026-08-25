# Item D: pieces.seams() — implementation plan (verified, final)

## Context

Feedback-loop item D (friction log #2): every interior cut line exists
twice — once per adjacent piece — so per-piece seam decoration
double-draws it (dashed strokes visibly fill each other's gaps; samples
ship ad-hoc ownership rules, post41/02). `pieces.seams()` returns each
PHYSICAL seam exactly once as PathBlocks keeping subject-local
placement — the pieces' own frame convention. User approved the design
(summary at opportunities/D-pieces-seams/summary.md): geometric pairing
fails on merged V-runs, so twin identity is threaded as a `seamId` in
command meta at stamp time.

## Verified implementation facts (first-hand, current HEAD)

- **Meta-survival: exactly four reconstruction sites drop foreign meta
  fields; everything else whole-spreads.** Passthroughs needed at:
  1. `normalizeMeta` (src/evaluator/segments.ts:130) — rebuilds
     {segmentLabel, endVertex}; add seamId to the rebuild and to the
     emptiness check.
  2. `derivedMeta` (segments.ts:146) — feeds buildPathBlockFromCommands,
     the FINAL step of cut(); add seamId passthrough (safe: it is
     label-like identity, not a pending geometric op — the corner-op
     strip rationale doesn't apply).
  3. Split-fragment builder (boolean-ops.ts:1744) — rebuilds meta on
     parametric splits; seams crossed by other knives pass through here.
  4. `shiftRingEndVertices` (boolean-ops.ts:2327) — rebuilds meta on
     ring reversal (twin direction); preserve reversed[j].meta?.seamId.
  (reverseCmd :2311, extractDrawCmds :3155, rebase :4006/:4011, zero-z
  reattach :3169 all spread whole meta — no changes.)
- **Stamp sites + counter threading:** `stampCutSeam` (boolean-ops.ts
  :3962, one-line map) called at :4773 (per snappedCutter entry — one
  entry IS one physical seam fragment between arrangement nodes, the
  correct unit; the twin gets the SAME stamped commands via
  reverseRing, so ids pair naturally) and :4800 (cookie — both winding
  copies from one `stamped` list share the id). Bridging `l` at :4428
  (inside traceCutFaces) hardcodes meta — give it a fresh id.
  Threading: a counter local to `pathCut` (:4490); `stampCutSeam` gains
  a nextId parameter; `traceCutFaces` gains the counter (one hop).
- **Array dispatch:** main fallthrough guard at index.ts:5378
  ("Cannot call method ... on non-array value") — add `case 'seams'`
  beside reverse/sort. Annotated has its own array dispatch with the
  same guard at annotated.ts:3061 — add the same case (pure data
  reading; no annotated-specific concerns).
- **API:** `PathogenArray<T>` interface (pathogen-api.ts:662) declares
  methods with doc comments (push/map/sort...); add
  `seams(): PathogenArray<PathogenPathBlock>` there;
  `npm run generate:completions` picks it up.

## Contract

- `pieces.seams()` on an array: collects elements' commands carrying
  `meta.seamId`, groups by id, keeps the FIRST-encountered side
  (orientation documented as unspecified), returns one PathBlock per
  physical seam, ordered by id, each keeping subject-local placement
  (draw via `M x y seam.draw()` or `seam.project(x, y).draw()`).
- Within one piece a given id is a contiguous ring stretch (ids are
  assigned per post-split cutter fragment), so extraction is a simple
  contiguous scan per element.
- Elements must be PathBlock/ProjectedPath (others error, mirroring
  cut()'s element message); elements without seam ids contribute
  nothing (empty array → empty result, not an error — arrays are
  general).
- Reuse `buildPathBlockFromCommands(cmds, {x: 0, y: 0})`
  (index.ts) for result construction — with the derivedMeta
  passthrough it now preserves seamId, and pieces already use exactly
  this call, keeping frame conventions identical.
- `'seams'` is not in CALLBACK_METHODS — no `<<` interaction.

## Steps (lifecycle order)

1. **Docs first**: docs/path-blocks.md "Cutting Paths" (seams-once
   contract, frame convention, orientation note) +
   docs/segment-labels.md query section cross-ref. Rebuild docs, verify
   anchor.
2. **Failing tests** (tests/path-cut.test.ts): two-piece cut → 1 seam;
   3×3 wavy grid → 12; hex medallion (3 knives through center) → 6 —
   the merged-V case geometric pairing cannot do; cookie → 1 (closed
   ring seam, one copy despite both windings); open-subject severed cut
   (fragments); equivalence test: seams() drawn output byte-equals
   post41/02's ownership-rule output; error path (non-path element);
   empty/plain arrays → empty result; annotated parity (arrays of
   blocks with ids can't arise in annotated since cut() is unsupported
   there — parity test = seams() on a plain array returns empty in
   both).
3. **types.ts**: `PathCommandMeta.seamId?: number` with a comment
   (physical-seam identity for pieces.seams(); carried by derived ops,
   meaningful only on fresh cut results).
4. **segments.ts**: normalizeMeta + derivedMeta passthroughs.
5. **boolean-ops.ts**: counter in pathCut; stampCutSeam(cmds, seamId);
   bridging-l fresh ids; passthroughs at :1744 and :2327.
6. **index.ts + annotated.ts**: 'seams' array-method case in both
   dispatches.
7. **pathogen-api.ts** + `npm run generate:completions`.
8. **Series**: post41/02 rewritten to the seams() loop (drops the
   ownership rule — the showcase; drawn SVG must be byte-identical,
   pinned by the equivalence test) + papercraft closing-section entry
   with before/after. Part 4 came layers deliberately unchanged
   (teaching stays per-piece; one-sentence mention in its closing
   section). 42/04 registration marks unchanged by design (marks
   belong on both pieces).
9. **Bookkeeping**: CHANGELOG entry, friction log #2 resolved, tracker
   README D → LANDED, STATUS entry.

## Verification

- New tests failing-first (verify at least the count tests fail before
  implementing); full suite green (baseline 4850) + `npm run build`.
- Samples: compile:samples → format:samples → validate-samples (0 new
  warnings) → post41/02 SVG byte-compare (expect IDENTICAL — same
  drawn set, seam orientation may differ → if orientation flips dash
  phase, compare rendered PNG instead and note in review) → BBWP
  refresh (02) → build:blog + public sync → check-links.
- Code-reviewer agent round before commit (brief: meta-passthrough
  completeness — especially derived-op survival and split fragments —
  plus id pairing on cookies and the first-side-wins determinism);
  apply findings; single commit for the item.

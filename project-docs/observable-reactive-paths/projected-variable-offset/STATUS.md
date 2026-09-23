# variableOffset on a ProjectedPath — STATUS (2026-09-21)

Closes **ISSUE-019**. Prompted by a debug capture: a subscription callback called
`match.block.variableOffset()` and got `Unknown ProjectedPath method: variableOffset`.

## What was actually blocking it

Nothing structural. `buildSimpleVariableOffset` / `buildCompoundVariableOffset` take a
`GeomCmd[]` and sample through `cmd.start`/`cmd.end`, so a projected spine works
unchanged — the ProjectedPath dispatch switch had simply never been given the two cases.
A diff of the two switches' `case` labels showed the whole parity gap was
`variableOffset`, `compoundVariableOffset` and `project` (the last correctly absent).

## Two shipped bugs found while verifying, fixed first

Both broke `match.block` for layers authored with **absolute** commands, independent of
variable offsets. Layer records preserve command case; both code paths read arguments as
deltas from `start` regardless.

1. **`commandsToAbsoluteD` existed twice** (a978520). The local copy in
   `evaluator/index.ts` dispatched on the exact lowercase letter and fell through to
   `<LETTER> endX endY`, so uppercase `H`/`V`/`C`/`S`/`Q`/`A`/`Z` lost their arguments —
   `Z 50 50`, `H 200 150`, `C 250 250`, `A 380 380`. Only `M`, `L`, `T` survived. The
   case-aware implementation already existed in `path-data.ts`, exported and unused by
   the evaluator. It also corrupted `Mask`/`ClipPath`/`Pattern`/`Marker` `.append()` and
   `.contour()`, all of which accept a ProjectedPath.
2. **Case-blind sampling** (7bb4bfc): `calculateCommandLength`, `sampleOnCommand`,
   `getParametricTForCommand` and `resolveSmooth`. An absolutely-authored `C` measured
   456 where the true arc length is 79.

Both were verified with a before/after probe over every command letter: lowercase output
byte-identical (total length unchanged to the last bit), uppercase corrected. Guarded by
the coverage matrix in `tests/path-queries.test.ts`, which authors each command twice —
absolute and relative from the same start — and requires identical `d`, `length` and
samples.

## What shipped

- `variableOffset()` / `compoundVariableOffset()` on a ProjectedPath, returning a result
  **registered on its spine**: the builders' origin normalization is round-tripped by the
  `anchor` they already report, so only `start`/`end` move. The builders were left alone
  deliberately — the PathBlock path is pinned by byte snapshots.
- `anchor` on a projected result, equal to `startPoint`, so a `<<` worker written with
  the documented registration idiom reads correctly on either receiver.
- A **zero-length-spine error** on both receivers, ordered *after* the `< 2 stops` check
  so existing errors keep their message. This is what a bare `'command'` selector hits on
  the leading move; the fix in a program is `'command[length>0]'`.
- `ProjectedPath.toPathBlock()` — the free-floating escape hatch.
- The shared front half of both methods factored into `collectVariableOffsetStops`.
- API surface + regenerated completions; `<<`-worker typing made receiver-aware in
  `type-inference-ast.ts` and `inlay-hints.ts`. Also closed the reverse drift:
  `intersects` / `intersectionPoints` were in the ProjectedPath runtime switch but never
  declared.

## Verification

- `npm run test:run` — 154 files, 6372 tests. `validate:samples` clean. `check-links` 0 broken.
- **CLI**: `repro-subscription-offset.pathogen` → `repro-subscription-offset.png`. The
  offset registers on the spine (`anchor == startPoint == (400,500)`; the layer opens
  `M 400 500`).
- **Playground**: `verify-playground-surface.mjs` drives `localhost:3000/playground` and
  compiles the same program in the browser bundle.
- **VS Code**: `verify-vscode-surface.mjs` loads the `.vsix`'s own bundled compiler —
  byte-identical to the CLI.
- CLI-vs-browser showed a last-ulp difference on one subpath of the repro. Four controls
  (`control-engine-variance.mjs`, `control-pathblock-variance.mjs`,
  `control-conditioning.mjs`, `control-arc-sampling.mjs`) traced it to **arc sampling**:
  `block.get(t)` on a layer-sourced arc already differs in 1 of 21 samples at ~3e-14
  between Node's V8 and Chrome's, with no variable offset involved. Pre-existing engine
  variance in transcendental functions; the spline solve propagates it. Not a parity
  defect, and it predates this work.

## Guards added

- `tests/receiver-parity.test.ts` — derives the PathBlock method set from the generated
  completion data and probes the real ProjectedPath dispatch, in both directions. The
  by-design exclusion list is checked for teeth. It does **not** cover return types,
  which is how ISSUE-025 survived.
- `tests/path-queries.test.ts` — the absolute/relative coverage matrix, one row per
  command letter.

## ISSUE-026 — found by review, then fixed (2026-09-22)

The code review flagged that `path-transforms.ts` still had the case-blindness 7bb4bfc
fixed in the readers. An audit of the whole method surface
(`audit-absolute-methods.pathogen`) widened it from the two methods reported to **ten**:
`subPath`, `offset`, `reverse`, `startAt`, `scale`, `mirror`, `boundingBox`, `dash`,
`outline`, `fillet` all disagreed between an absolutely- and a relatively-authored copy
of the same curve, while `d`, `length`, `get`, `tangent` and `partition` agreed.

Fixed at the boundary, not at the ~20 call sites: `wrapCommands` normalizes a block to
lowercase-relative. Three statements in `docs/path-queries.md` already said that is what
a block is; the runtime had been reporting `absolute: true` on blocks. So this makes the
runtime match a documented contract rather than inventing one, and it is one site instead
of twenty reads with three different shapes (absolute points, relative deltas, tangent
vectors). All fifteen audited methods now agree. Guarded by "transforms agree too" in
`tests/path-queries.test.ts`.

## Found, flagged, not fixed

**ISSUE-025**: `ProjectedPath.subPath()` deliberately returns a PathBlock normalized to
`(0,0)` while `pathogen-api.ts` declares it returns a ProjectedPath. Documented in the
"Where the result lands" table; the fix is a decision, not a cleanup.

Pre-existing and untouched: `src/cli.ts` has a dead `_legacyGenerateSvg` referencing
undefined `escapeXml`/`radToDeg` (present at HEAD; `tsc --noEmit` flags it, the build
does not).

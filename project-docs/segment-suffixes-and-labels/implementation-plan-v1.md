# Plan: Implement segment suffixes, labels & query APIs (Full v1 + blog post)

## Context

The research in `project-docs/segment-suffixes-and-labels/research-summary.md` (committed `1632eae`) recommended: reframe suffix functions as **vertex annotations** + **segment labels**, use **record-then-apply** semantics (corner ops applied at finalization, not emit-time rewriting), spell the syntax as **`with fillet(r)` / `as segment('x'), endpoint('y')`** clauses, and land the enabling **segments-everywhere refactor first**. Ryan chose **Full v1 scope**: Milestone 1 (refactor) + Milestone 2 (definition-site syntax) + Milestone 3 (name-based query APIs `pb.segment/point/vertex` + VertexHandle on PathBlocks, ProjectedPaths, and layers). **Modifiability (replaceSegment etc.) is deferred** — layer/projected vertex-handle corner ops throw honest "not supported yet" errors.

## New types (M1, extended M2/M3) — `src/evaluator/types.ts`, mirrored in `annotated.ts` union

```ts
interface PathRecord {            // one per accum-push today (statement granularity)
  raw: string;                    // EXACT string fragment pushed to accum today
  commands: PathBlockCommand[];   // structured commands for this fragment
  label?: string;                 // M2: segment label for this range
  loc?: SourceLocation;           // provenance (PathCommand.loc, currently dropped)
}
// PathBlockCommand (types.ts:511) gains optional: id?: number; meta?: {
//   segmentLabel?: string;
//   endVertex?: { label?: string; cornerOp?: CornerOperation } }
// PathLayerState gains records: PathRecord[] (replaces accum after flip); rootRecords beside rootAccum
// M3: VertexHandleValue { type:'VertexHandle', source: pathblock|projected|layer, label, point, cornerIndex }
```

New shared module **`src/evaluator/segments.ts`** used by BOTH evaluators (drift prevention): `recordPath()` (the single replacement for every `accum.push`), `parsePathStringToCommands()` (factored out of `parseAndTrackPathString`, index.ts:7489 — rebuilt on top so records and context history agree by construction), `applyRecordedCornerOps()` (M2, subpath-aware wrapper over `applyCornerOperations`), `findVertex/buildLabeledSubPath` (M3).

## Milestone 1 — Segments-everywhere refactor (strangler)

**Decision: new `records` field, NOT trackHistory.** trackHistory (context.ts:17-22) is per-command with no statement boundaries, isn't 1:1 with accum pushes, and has user-visible semantics + perf posture. Records pair exactly with emission. Perf: start/end already computed by `updateContextForCommand` for every command; incremental cost ≈ one object per statement. Perf smoke test in gate.

**Byte-parity strategy (load-bearing):** each PathRecord carries the exact `raw` fragment; `LayerOutput.data` = `records.map(r=>r.raw).join(' ')` — **parity by construction**. Snapshots are sacred (`tests/render-snapshots.test.ts` header: fix the adapter, never update). `commandToPathString` re-serialization only for corner-op-touched subpaths (impossible in old programs). Canonical single-serializer (Addendum A.6) deliberately deferred.

Steps (strictly serial):
1. **Dual-write** (index.ts): add types + `segments.ts`; replace every `accum.push` with `recordPath()` pushing to BOTH. Command sources: `evaluatePathCommand` (index.ts:7904-7910, numeric args + start/end at :7477 + AST `loc`); draw/drawTo `PathWithResult` (:7879) and stdlib `PathSegment` strings via parse-backfill. Tests: context.test.ts (records ≡ history), layers.test.ts, multi-subpath + uppercase-M fixtures.
2. **Parity assertion**: in `buildCompileResult` (3 join sites: index.ts:8872, 8886, 9046 via `buildLayerOutput` :8967) compare records-join vs accum-join; throw on mismatch. Gate: full suite + render-snapshots (zero diffs) + render-channel-parity, assertion armed.
3. **Mirror annotated.ts** (~15 pathStrings/accum sites) via `segments.ts` helpers; annotated.test.ts green.
4. **Flip + delete**: read records for `data`; delete `accum`/`rootAccum`/dual-push/assertion; `PathBlockValue.pathStrings` → `records` (never read outside evaluators); invariant `commands ≡ records.flatMap(r=>r.commands)`. Downstream untouched (CLI build-layers.ts:88, playground, VS Code all read `LayerOutput.data`; `playground/types/compiler.d.ts` unchanged).
5. **Consumer audit**: layer records hold case-preserved commands with absolute start/end; all position math from `start`/`end`, never re-accumulated relative args. Do NOT touch boolean-ops' uppercase-M compensation (post-v1 cleanup).

**M1 gate:** full suite; snapshots byte-identical; accum/pathStrings deleted; perf smoke; `npm run build`.

## Milestone 2 — `with` / `as` syntax

0. **Docs first (policy)**: `docs/segment-labels.md` + `'segment-labels.md': 'segmentLabels'` in `scripts/build-docs.ts` DOC_FILES; `npm run build:docs`.
1. **Tokenizer + grammar** (parallel-safe with M1): add `with`/`as` to a new `CLAUSE_BOUNDARY` set in `path-args-tokenizer.ts` (boundary checks ~:68, ~:143). Grammar (pathogen.grammar:139-178):
   `PathCommand { pathCmd PathArgs WithClause? AsClause? ";"? | pathCmdZ ... }`, `WithClause { withKw CornerOpCall }`, `AsClause { asKw LabelCall ("," LabelCall)* }` — grammar enforces with-before-as, one each, comma list on `as` only. Contextual `@extend` keywords (valid identifiers elsewhere). `";"?` also fixes the `h 20;` paper cut — fix the misleading "Missing ';'" wording + diagnostics test. Statement functions (`circle(...) as ...;`): add clauses to `ExpressionStatement` (:180-182), validate in builder. Regen: `npx @lezer/generator src/parser/pathogen.grammar -o src/parser/pathogen.generated.ts` (manual, checked in). Tests: parser.test.ts (all three contexts, ordering errors), ast-builder-postfix.test.ts, pinned behavior for identifiers named `with`/`as` in path-arg position.
2. **AST**: `PathCommand.annotations? { cornerOp? {kind, args: Expression[]}, labels? {kind:'segment'|'endpoint', name: Expression}[] }` — name is an Expression so `` segment(`rib-${i}`) `` works. Builder: `buildPathCommand` (ast-builder.ts:633-672).
3. **Editor surfaces** (parallelizable): highlight.ts, TextMate keyword alternation (tmLanguage.json:45), snippets, all-syntax.pathogen fixture, formatter.
4. **Recording** (needs M1 + step 2; both evaluators via segments.ts): segment label → record + per-command `meta.segmentLabel`; endpoint label → `meta.endVertex.label` on last command. Per-path duplicate-label detection (Marker/Gradient precedent) = compile error. `with fillet(r)`: validate previous drawing command exists in subpath, statement doesn't start with m/M; record `CornerOperation` into previous command's `meta.endVertex.cornerOp` (mirror tangentArc no-heading error, index.ts:7380). Recording never moves the pen; `ctx.position` reflects authored geometry (context.test.ts).
5. **Finalization + label remap (the hard part)**: PathBlocks finalize at `@{}` close (records = authored store, commands = finalized); layers finalize in `buildLayerOutput`. Zero corner ops → identity, `raw` passes through (old programs byte-identical). Mechanism = **identity propagation through the splice, not index remapping**:
   - `applyRecordedCornerOps` splits at subpath boundaries (required: `applyCornerOperations` filters `M` at path-transforms.ts:1530 and never reinserts — fatal for layers), translates ops to per-subpath corner indices, reassembles.
   - Extend `TransformCmd` with `id`/`meta`; inside `applyCornerOperations` (:1501-1683): copies carry meta; trimmed `inHead`/`outTail` inherit source command identity; inserted arc/chamfer commands inherit `segmentLabel` iff incoming label === outgoing label (else neither); same at closure corner.
   - **Vertex queries resolve against the authored store** (no remap needed — matches non-destructive §6.2 semantics); **segment queries against finalized commands** via inherited labels.
   - Only op-touched subpaths re-serialize via `commandToPathString`; untouched records keep `raw`.
   Tests: provenance unit tests (trim/insert/closure/z-expansion/curve-junction warning), equivalence `@{ h 20; v 20 with fillet(5); }` ≡ `.filletAtVertex(0,5)`, multi-subpath layer fixtures, new snapshot fixtures, annotated parity.

**M2 gate:** docs render; grammar regenerated; full suite + new tests; old snapshots byte-identical; TextMate/snippets/fixture updated; `npm run build` + `build:vscode`; visual verify demos via `--output-svg-file`.

## Milestone 3 — Query APIs

1. **VertexHandle type** per TextBlockValue touch-point template: types.ts union+interface, annotated union (:182/:214), guards both evaluators, `src/index.ts` re-exports (:97/:116), dispatch + property branches both, `formatValueForDisplay` (index.ts:5140), struct-properties.ts DESCRIPTORS entry (:117) for `x/y/point/label` (feeds drift guard + completions).
2. **Dispatch** (`evaluateMethodCall` if-chain): PathBlockValue switch (index.ts:2274) — `segment(name)` → new PathBlockValue (full geometry API free), `point(name)` → Point, `vertex(name)` → VertexHandle; ProjectedPathValue (:2942) same in absolute coords; LayerReference (:2159, today only `.append`) — `segment` → ProjectedPathValue from layer records (what M1 enables), plus `point`/`vertex`. VertexHandle `.fillet/.chamfer/.ellipticalFillet` delegate to existing `filletCommands`/`filletAtVertex` (path-transforms.ts:1790-1802) with `cornerIndex`; pathblock sources only — projected/layer throw "not supported yet" (annotated stub precedent :1884). Unknown-label errors enumerate available labels. annotated.ts mirrors via shared helpers.
3. **Language services**: pathogen-api.ts `@type VertexHandle` + `segment/point/vertex` on PathBlock/ProjectedPath/Layer interfaces (JSDoc + @snippet) → `npm run generate:completions` (**never eslint --fix pathogen-api.ts**); `METHOD_RETURN_TYPES` in type-inference.ts:20-89; `check:completions` gate.
4. **Docs + tests**: extend segment-labels.md, path-blocks.md, layers.md ("layers are queryable"). Tests: path-blocks (sub-segment partition/boundingBox, point-as-drawTo, vertex().fillet ≡ filletAtVertex), layers, errors, struct-properties, language-services, cli end-to-end.

**M3 gate:** full suite + `check:completions` + drift guards; `npm run build` + `build:vscode`; three-surface parity check (same demo in CLI SVG, playground, VS Code preview); compiler.d.ts confirmed unchanged.

## Milestone 4 — Blog post (announce + demonstrate)

Follows `website/blog/CLAUDE.md` conventions and the pathblock-blog-series precedent (`project-docs/pathblock-extensions/blog-authoring-playbook.md`).

1. **Author** `website/blog/segment-labels-and-suffixes.md` — frontmatter (title, slug matching filename, date, description), content starting at h2. Narrative arc: the problem (index-brittle `filletAtVertex`, write-only layers, join-info-on-the-wrong-noun clunkiness) → the syntax (`with fillet(r)`, `as segment/endpoint`) → what labels unlock (name-based queries, layers as geometry) → prior-art nods (TikZ coordinates, CadQuery tags, PostScript `arct`) drawn from the research doc. Pathogen samples use `define ViewBox(...)`, `${expr}` interpolation, `oklch(...)` literals.
2. **Samples** in `website/blog/samples/postN/` (N = next free number; post22 is highest today). First line of each: `// viewBox="0 0 W H"`. Proposed set (~5): (a) before/after — manual `h 15; tangentArc; v 15` vs `v 20 with fillet(5)`; (b) labels + `segment('x').partition(n)` decoration along a named segment; (c) `point('anchor')` as a `drawTo` target for cross-shape alignment; (d) layer queryability — `layer('a').boundingBox()` centering; (e) robustness narrative — insert a command, `vertex('corner').fillet(5)` still lands where `filletAtVertex(3, r)` would not.
3. **Compile**: `npm run compile:samples -- --post=N` (auto viewBox/pipeline detection + inspector metadata). Also compile each sample as a **BBWP** (/bbwp skill) and run `scripts/update-bbwp-index.ts` so they appear at the bbwp index (established workflow).
4. **Build + verify**: `npm run build:blog`; view at `npm run dev:website`; `npm run check-links`.
5. **Agentic review before commit** (repo policy): content-reviewer agent (4-persona process per `website/guidelines/agentic-review.md`); address findings.
6. **Commit hygiene**: stage the post `.md`, sample `.pathogen` files, and `website/bbwp/index.html` — never the generated `.bbwp.html`/`.mw.html` artifacts.

**M4 gate:** post renders locally with all mini-workspace samples live; samples compile via the actual released pipeline (post-M3 `npm run build` bundle, not a dev shortcut); BBWPs listed in the index; content review passed; changelog updated to cover M1–M4.

## Top risks

1. **Byte-parity break (M1 flip)** → raw-fragment carry + always-on assertion during dual-write + snapshots in every gate.
2. **annotated.ts drift** (5,804-line parallel impl) → all logic in shared segments.ts; per-milestone annotated tests; honest-stub fallback.
3. **`with`/`as` boundary words change existing programs** → contextual keywords; pinned regression tests; scan examples/fixtures for collisions pre-landing.
4. **Corner-op provenance bugs incl. `M`-dropping** (verified path-transforms.ts:1530) → mandatory subpath-split wrapper; dedicated inheritance unit tests; authored-store vertex resolution eliminates remapping.
5. **Always-on tracking perf** in 32k-iteration loops → reuse already-computed points/args; perf smoke test with threshold.

## Sequencing

M1 steps strictly serial (dual-write → assert → annotated mirror → flip → audit). Parser track (M2.1-2.3) fully parallel with M1. Docs drafts parallel. M2.4/2.5 behind M1.4 + M2.2. All of M3 behind M2.5; within M3, PathBlock/Projected dispatch ∥ Layer dispatch. M4 behind M3 (samples must compile through the real released pipeline), though the post's prose can be drafted from the research doc any time after M2's syntax is frozen.

## Critical files

- `src/evaluator/index.ts` (accum→records :8863-9058, PathCommand arm :7863-7912, dispatch :2091/:2274/:2942/:2159, parseAndTrackPathString :7489)
- `src/evaluator/types.ts` (:511, :521, :642), new `src/evaluator/segments.ts`
- `src/evaluator/path-transforms.ts` (provenance-aware :1501-1683, :1802, :25)
- `src/parser/pathogen.grammar` (:139-178) + `src/parser/path-args-tokenizer.ts` + `ast.ts:145` + `ast-builder.ts:633`
- `src/evaluator/annotated.ts` (mirror), `src/pathogen-api.ts`, `src/language-services/type-inference.ts`
- `docs/segment-labels.md` (new) + `scripts/build-docs.ts` DOC_FILES

## Verification

- Per-milestone gates above. Overall: `npm run test:run`; `npx vitest run tests/render-snapshots.test.ts` must show **zero** snapshot changes through M1; new syntax gets NEW fixtures instead. `npm run build` before any playground check (stale-bundle gate). End-to-end: compile a demo using all three features via CLI `--output-svg-file`, open same source in playground (dev:website) and VS Code preview; diff rendered output. Agentic review before each milestone commit (repo policy).

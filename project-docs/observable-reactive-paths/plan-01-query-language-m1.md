# Path Query Language — Milestone 1 (pull model)

## Context

Ryan wants Pathogen paths to be observable and reactive (see
`project-docs/observable-reactive-paths/research-prompt.md`). The read-through
(Appendix A) split that ambition into three pieces — a selector language over path
structure, typed result objects, and push delivery while authoring — and Ryan chose
to build the first two now as a **pull-model query language**. Push/observers come
in a later milestone and will reuse this grammar and these result types. All twelve
open decisions were approved on 2026-09-14 ("Looks good. Let's move forward").

Why this shape: `segmentAll('command(a)')` was rejected as semantically unclear.
One generalized `query()` / `queryAll()` names the *kind* of thing wanted through a
noun, keeps labels in the noun's argument (mirroring `as segment(...)` /
`as endpoint(...)`), and leaves the six legacy methods untouched as sugar.

## Contract — what `docs/path-queries.md` must say

### API (three receivers: PathBlock, ProjectedPath, `layer('x')`)
- `query(sel)` → first match; **errors** when nothing matches, listing what the path
  has (labels, command kinds, calls) — querySelector model.
- `queryAll(sel)` → every match in authoring order; `[]` when none.
- Legacy `segment/segmentAll/point/pointAll/vertex/vertexAll` unchanged, including
  `:atomic`; documented as convenience over `query()`.

### Grammar
```
query      := selector ( ',' selector )*        all selectors in a list share ONE noun (compile error otherwise)
selector   := compound ( WS compound )*         descendant: right compound scoped to commands inside the left
                                                matches; the rightmost compound is what comes back
compound   := noun [ '(' arg (',' arg)* ')' ] filter* [ pseudo ]
noun       := command | call | endpoint | segment | subpath
filter     := '[' attr [ op value ] ']'         presence, or comparison; op := = | != | < | <= | > | >=
pseudo     := :first | :last | :nth( index-list )
index-spec := int | int..int | int..<int        inclusive / half-open as in for-loops; negatives count from
                                                the end as .slice() does; comma lists; :first ≡ :nth(0),
                                                :last ≡ :nth(-1); ranges read low→high (descending = none)
```

| Noun | Argument (how you name one) | Result | One match is |
|---|---|---|---|
| `command(a, c)` | letters, case-insensitive; aliases `line cubic quadratic curve arc move close`; bare/`*` = all | Command | one SVG command |
| `call(circle, draw, myFn)` | emitting stdlib fn, method, or user fn (outer statement only in M1) | Call | one statement's commands |
| `endpoint(base)` | endpoint label (`as endpoint(...)`); bare = every drawing command's end (moves excluded; `z` with length included) | Endpoint | one joint |
| `segment(rib)`, `segment(cut.rim)`, `segment(cut)` | segment label; merged runs + `cut` umbrella as today | Segment | one labeled run |
| `subpath(2)`, `subpath(1..5)`, `subpath(-1)` | index-spec; bare = all | Subpath | move-delimited pen-down run (SVG rule) |

Rules: filters are scalar (`x y` end point, `length`, `index`, `absolute`, `relative`,
`closed`, `label` presence, `cornerOp` = fillet|chamfer|ellipticalFillet, and SVG
parameter names `x1 y1 x2 y2` for C/S/Q, `rx ry rotation largeArc sweep` for A); a
multi-command match passes a filter if ANY member command passes; `:nth` indexes the
compound's match list (scoped after a combinator, like nth-child); queries answer
**finalized** geometry (existing `segment()` behavior); dynamic values via `${}`
interpolation; one pseudo per compound.

**Subpath** = SVG rule: starts at each `m`, and at the first drawing command after a
`z` with no `m`. `closed` = ends in `z`. **Distinct from the `.subPath(t0, t1)`
method**, which slices by arc-length fraction — the doc must say this in one sentence
next to each. `subPathCount` and `.contours` adopt the same rule (see Risks).
No `contour` alias.

### Result structs (member access + destructuring; registered in struct-properties.ts)
- **Command**: `command` (lowercase letter — keeps today's field name), `absolute`
  (true only for layer-sourced uppercase; PathBlock/ProjectedPath are normalized →
  false), `args`, `start`, `end`, `index`, `subpath`, `length`, `block` (one-command
  PathBlock / ProjectedPath), `segment` (label|null), `endpoint` (label|null);
  cubic: `cp1 cp2` (S resolved); quadratic: `cp` (T resolved); arc: `rx ry rotation
  largeArc sweep center`. Kind-specific members exist only on their kind (standard
  "Property 'rx' does not exist on Command" error otherwise).
- **Call**: `fn`, `commands`, `block`, `start`, `end`, `index`.
- **Endpoint** (renamed from VertexHandle; `vertex()`/`vertexAll()` return it):
  `point x y`, `label` (null when unlabeled), `index`, `command` (the command it
  ends), `next` (Command|null; wraps to first drawing command on closed subpaths),
  `turn` (Angle, signed, wrapToPi), `isJoint`; methods `fillet/chamfer/
  ellipticalFillet` exactly as today (joints only).
- **Segment**: `label`, `block`, `commands`, `start`, `end`, `length`, `index` (run
  index within its group).
- **Subpath**: `index`, `closed`, `block`, `commands`, `start`, `end`.
- `.commands` / `.subPathCommands` return the SAME Command struct as
  `queryAll('command')` (labels no longer stripped). Display string changes.

## Implementation steps (docs → tests → core → language services → verify)

### A. Docs first
1. Write `docs/path-queries.md` from the Contract above (its examples become the
   tests). Register in `scripts/build-docs.ts` `DOC_FILES` (:82-106) as
   `'path-queries.md': 'pathQueries',` right after `'segment-labels.md'` (:89).
2. Update: `docs/path-blocks.md` (:110-133 `commands`/`subPathCommands` → Command
   structs, `subPathCount` SVG rule; :578 `.subPath` cross-note; :1469-1485
   `.contours` rule), `docs/segment-labels.md` (:159-271 "vertex handle" → Endpoint,
   pointer to path-queries), `docs/layers.md` (:96-110 layer queries),
   `docs/debug.md` (:136-153 `records[].fn`).
3. `npm run build:docs` and `npm run check-links`. Agentic review (content-reviewer)
   before commit, per docs/CLAUDE.md.

### B. Tests (write failing first)
- New `tests/path-queries.test.ts`: parser (grammar; mixed-noun list error; filter
  ops; `:nth` specs incl. negatives/ranges/lists; combinator scoping — the 3-subpath
  worked example in Appendix A); each noun × 3 receivers; `query` no-match error
  lists available labels/kinds/calls; struct props + destructuring + `Object.keys`;
  `.commands` ≡ `queryAll('command')`; Endpoint `turn/next/isJoint` + legacy
  `fillet` through an Endpoint; `call` still matches after `with fillet`
  finalization (meta whitelist); subpath SVG rule (`h 10 z h 10` → 2); byte parity
  (queries never change `layers[0].data`).
- Update `tests/path-blocks.test.ts:3843` display string; `tests/language-services/
  completion.test.ts:704,1488` (Endpoint); `tests/trace.test.ts` add a `circle()`
  record asserting `fn`; add completion/hover cases for `pb.query('endpoint').` and
  `for (c in pb.queryAll('command'))`; `generate-completions.test.ts` pin that
  `TYPE_ELEMENT_TYPES.PathBlock.queryAll` is undefined (unions skipped by design).

### C. Core (this order)
1. `src/evaluator/types.ts` — `Value` union (:21-62): add `CommandValue`,
   `CallValue`, `SegmentValue`, `SubpathValue`; rename `VertexHandleValue` (:584-593)
   → `EndpointValue` (+ `index`, `command`, `next`; `label` nullable);
   `PathCommandMeta.call?: { fn: string; id: number }` (:541-552); `PathRecord.fn?`
   (:568-573); `PathRecordOutput.fn?` (:800-808).
2. `src/evaluator/segments.ts` — `recordPath` (:101-111) extras gain `fn`; stamp
   `meta.call = {fn, id}` on every command of the record (per-store counter so
   adjacent same-fn calls stay distinct); whitelist `call` in `normalizeMeta`
   (:130-142) and `derivedMeta` (:149-160) or it is silently dropped at
   finalization. Leave `applyRecordedCornerOps` move-only (comment pointing at the
   shared splitter; follow-up).
3. New `src/evaluator/subpaths.ts` — `splitSubpaths(commands): { commands; closed }[]`
   per the SVG rule. Adopt in `countSubPaths` (`index.ts:997-1004`) and
   `splitContours` (`font-provider.ts:412-431`).
4. `src/evaluator/path-transforms.ts` — export `getEdgeTangentAtEnd` /
   `getEdgeTangentAtStart` (:2049-2090; arc-aware, unlike `getEndTangent`).
5. New `src/evaluator/path-query.ts` — selector parser (tokens → selector AST with
   positions for error messages), matcher over finalized commands (run
   `resolveSmooth` once for S/T), `wrapCommands(run, 'pathblock'|'projected')`
   replacing the three near-identical builders `buildLayerSegment` (:2402-2417),
   `buildSubBlock` (:2715-2732), `buildSubProjected` (:3420-3435), `commandValues()`,
   struct builders. Reuse `findLabeledRuns` (:273), `findEndpointCommands` (:439),
   `locateCornerPos` (:229), `collectSegmentLabels/collectEndpointLabels`
   (:249-266), `firstInkedPointOf` (:315), `recordsFromCommands` (:123). Legacy
   methods keep calling `segments.ts` unchanged (no rerouting).
6. `src/evaluator/struct-properties.ts` — five descriptors via `staticDescriptor`
   keyed in `DESCRIPTORS` (:139-149; rename `VertexHandleValue` key). Lazy getters:
   `length` via `calculateCommandLength`/`calculatePathLength` (`sampling.ts:88,153`),
   `cp*` from resolved args, `center` via `arcEndpointToCenter` (`sampling.ts:301`),
   `turn` via `wrapToPi` (`sampling.ts:146`), `block` via `wrapCommands`.
7. `src/evaluator/index.ts` — type guards next to `isVertexHandleValue` (:521-523);
   `query`/`queryAll` cases on the LayerReference branch (:2373), PathBlock switch
   (:2558), ProjectedPath switch (:3280) through one `runPathQuery(receiver, source,
   raw, mError)`; `commandRecordsValue` (:6042-6055) → `commandValues`;
   `formatValueForDisplay` (:5963) and the `log()` builder (:6682; generic fallback
   prints "[object Object]") gain branches for all five kinds;
   `Object.keys/values/entries` (:5424-5438) fall back to `getStructDescriptor`;
   the **five** record sites pass `fn`: `:8863`, `:8871`, `:8883` (let/assign of a
   PathWithResult → `.method`/`.name`), `:9051` (method statement → `.method`),
   `:9087` (`stmt.command === ''` && FunctionCall → `.name`; literal commands leave
   it undefined); `storeToRecordsOutput` (:9863-9870) emits `fn`; Endpoint method
   sites (:3899-3937) + "vertex handle" error strings (:3909-3933).
8. `src/index.ts:102` export rename. Grep `src/` for any remaining `VertexHandle`.

### D. Language services
1. `src/pathogen-api.ts` — `@type Command` replaces `@type PathCommandRecord`
   (:740-751); `@type Endpoint` replaces `@type VertexHandle` (:1248-1263); add
   `@type Call | Segment | Subpath`; on PathBlock (:753), ProjectedPath (:1155),
   PathLayer (:950) declare `query(selector: string): PathogenCommand | PathogenCall
   | PathogenEndpoint | PathogenSegment | PathogenSubpath` and `queryAll(selector:
   string): PathogenArray<…union…>` — the generator deliberately skips union
   returns (`completion-extract.ts:360-366, 456-463`; precedent: layer constructors
   `pathogen-api.ts:74-78`), so members/snippets flow while hand rules own the
   types; retype `commands`/`subPathCommands` to `PathogenArray<PathogenCommand>`;
   `vertex()`/`vertexAll()` return Endpoint.
2. `npm run generate:completions`.
3. New `src/language-services/query-noun-types.ts` — `queryResultType(method,
   selectorText)`: noun of the rightmost compound of the first selector (imports the
   path-query parser; `query` → type, `queryAll` → element type).
4. `type-inference-ast.ts` — MethodCall cases at :268 (`inferExprType`) and :316
   (`inferExprElementType`): when `expr.method` is `query`/`queryAll` and
   `expr.args[0]` is a `StringLiteral`, return `queryResultType(...)` before the
   table lookups (precedent: `ANGLE_PRESERVING_ARGS` at :258-266).
5. `member-resolution.ts` — `callChainMatch` (:82) / `chainMatch` (:90) capture the
   args text; when the method is `query`, resolve via `queryResultType`;
   `queryAll(...).` resolves to `array` members.
6. `type-inference.ts:141-150` — add `query|queryAll` to the `layerQuery`
   alternation so the bare `layer(` fallback (:153) cannot mis-type
   `layer('a').query(...)` as PathLayer (prevents a wrong match; adds no rule).
7. `npm run check:completions`.

### E. Verify
```
npx vitest run tests/path-queries.test.ts tests/segment-labels.test.ts tests/path-blocks.test.ts tests/trace.test.ts tests/render-snapshots.test.ts tests/path-cut.test.ts tests/font-provider.test.ts
npx vitest run tests/language-services/
npx tsx src/cli.ts project-docs/observable-reactive-paths/demo-queries.pathogen --json   # records[].fn, log() of query results
npx tsx src/cli.ts project-docs/observable-reactive-paths/demo-queries.pathogen --output-svg-file=... --png=...   # then Read the PNG
npm run build && npm run build:docs && npm run check-links
npm run test:run && npm run lint        # never `eslint --fix` on pathogen-api.ts / playground
```
Then the code-reviewer agent (read-only; no git stash) before commit. Surface parity
for this milestone = same `query()` results via CLI `--json` and the playground
console/log panel (no new defs producers, so no preview-pane wiring).

## Risks
1. **Byte parity** — nothing here touches emit; guard is `render-snapshots.test.ts`
   plus the segment-labels byte-equal tests.
2. **`.commands` shape change** — `Object.keys`/`log()` of entries would break
   without the fallbacks in C7; `path-blocks.test.ts:3843` display string updates.
3. **`subPathCount` / `.contours` SVG rule** — differs only for `z`-then-draw
   without `m` (count goes up) and move-separated open runs in `.contours`; no
   existing test hits either; document.
4. **Meta whitelist** — forgetting `call` in `normalizeMeta`/`derivedMeta` silently
   kills `call` queries after finalization; the B test pins it. Boolean-op results
   do not answer `call` in M1 (documented, like fresh `cut` seams).
5. **Generator drift** — pin that union returns stay unparsed.
6. **Rename blast radius** — verified 2026-09-14: no `VertexHandle` references in
   `playground/` or `packages/` source; only `docs/segment-labels.md` and the
   generated `playground/utils/docs-content.js` (rebuilt by build:docs).

## Out of scope (milestone 2+)
Push/subscribe and observers; lifting the apply-nesting ban; `:not()`/`:has()`;
wildcard labels; in-string projection; animation; renaming `.subPath()` (doc note
only); nested `call` provenance inside user fns; corner-op splitter rule change;
in-string completion of nouns/attrs (stretch only if the shared parser makes it
nearly free). Bugs deferred to M2: frozen `ctx` in `@{}`, `<<` concat label drop,
discard-sink pen leak. Ride-along, separate commit: GroupLayer `apply` snippet
(`pathogen-api.ts:975-987`) that always errors at runtime.

## Paper trail + housekeeping
- Before any code: copy Appendix A into
  `project-docs/observable-reactive-paths/discussion-01-read-through-and-query-grammar.md`
  (never modify `research-prompt.md`); demo programs go in that folder as
  `.pathogen` files with PNG renders.
- After landing: update memory (retire "two evaluators"/annotated-parity notes;
  record the query-language decisions), CHANGELOG (all work since last entry), blog
  post on the query language with the `.subPath` vs `subpath` explainer.

---


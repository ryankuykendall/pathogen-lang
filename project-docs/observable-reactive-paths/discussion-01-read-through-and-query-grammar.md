# Discussion 01 — read-through of research-prompt.md and the query-language design trail

Date: 2026-09-14. Session: https://claude.ai/code/session_01N33kf8UYo9xxCyveUcvgRL

This is the verbatim design trail from the planning conversation that produced the
path query language (milestone 1 of observable/reactive paths). The approved
implementation plan is summarized in `plan-01-query-language-m1.md` alongside.

## Design trail (discussion notes, 2026-09-14)

Status: read-through of `project-docs/observable-reactive-paths/research-prompt.md`
(2026-09-14), grounded against the current code. This section is the paper trail for
the brainstorming conversation; copy it to `project-docs/observable-reactive-paths/`
per the plan above.

## Where the read-through lands

The prompt bundles three separable things whose value is unequal:

1. **A selector language over path structure** — `command(L,l)[y]`, `endpoint`,
   `segment(name):first`, control points of curves — that works *without labels*.
   This is an extension of the existing `segment()` / `:pseudo` grammar
   (`docs/segment-labels.md:85` already reserves `.` and `:` for it). Useful on its
   own as a pull query. Load-bearing.
2. **Rich result objects** — a `Command` / `Vertex` / `Segment` struct family with
   kind-specific accessors (cubic: cp1/cp2; arc: rx/ry/rotation/largeArc/sweep/center).
   Required by pull *and* push. Today `.commands` is an untyped 4-field bag with no
   labels (`index.ts:6042-6055`), and `partition(n)` is the anti-pattern to avoid
   (doc-only `OrientedPoint` name, untyped `PathogenArray` in `pathogen-api.ts:806`).
3. **Push delivery (subscribe while authoring)** — the genuinely new evaluator
   mechanism. This is where the hard semantics live: apply-nesting ban, phantom
   discard-sink writes, pre-finalization geometry, subscription lifetime, same-layer
   recursion.

Why Signals miss (agreeing with Ryan's lukewarm read): Pathogen has **no time**. A
program runs once, top to bottom, single synchronous pass (`index.ts:10414`,
`:10505`); SMIL is banned by the sanitizer (`docs/security.md:13`). A Signal models a
value that changes over time and must be recomputed; nothing changes after it is
authored. The "state face" the counter-proposal wants already exists — it is the
layer / PathBlock itself. Only the "event face" (authoring-order deltas) is missing.
The one durable idea in the counter-proposal is batched/transactional delivery, which
reappears here for a different reason (see apply nesting).

Honest challenge to keep in view: with pull queries + lambdas you can already write
the annotation program *after* the drawing. Push earns its keep only via some of:
(a) annotation code sits next to the subscription rather than after the drawing;
(b) catches drawing spread across many statements / loops / fns without collecting;
(c) access to in-flight `ctx` (heading, transform, cumulative distance) that is gone
after finalization; (d) fan-out to N layers in one pass; (e) the narrative
("thinking and drawing in parallel"). If (a)/(d)/(e) dominate, a lighter mechanism
(apply-scoped observer flushed at apply exit) suffices; if (b)/(c) dominate, a true
per-statement hook is required.

## Grounding facts from the code

- **Single writer**: `recordPath()` `src/evaluator/segments.ts:101-111` is the only
  push into a PathStore. It takes only a store — no scope, no layer identity — so it
  cannot invoke a lambda. Scope-bearing callers: `index.ts:8863, 8871, 8883, 9051,
  9087` (+ `1208` background rect). Hook = thread a context into recordPath or wrap
  those 5 sites.
- **Annotations attach after the record lands** (`applyAnnotationsToStore`,
  `segments.ts:36-90`): a hook at record time sees unlabeled commands. Corner ops
  are recorded on the *previous* command's `meta.endVertex.cornerOp` and applied at
  finalization (`applyRecordedCornerOps`, `segments.ts:190`). So the event must fire
  at statement completion, and observers see **authored, pre-finalization** geometry.
- **Statement granularity**: `circle()` = one record with many commands. Labeled
  runs merge across consecutive statements (`findLabeledRuns`, `segments.ts:273`).
- **Apply cannot nest** (`index.ts:9254-9261`): a callback firing inside
  `primary.apply {}` cannot open `annotation.apply {}`. The swap code is already
  save/restore shaped (`:9285-9298`), so the ban looks conservative, not structural.
  Also: apply is a *statement* in the grammar (`pathogen.grammar:148-149`,
  `LayerApplyBlock`), not a method — PathBlock `.apply {}` is new syntax, not a
  method addition. PathBlock values are immutable; `<<` concat rebuilds records and
  **drops record-level label/loc + statement granularity** (`segments.ts:123`).
- **Discard sinks**: `.map/.filter/.reduce/.sort`, `Grid.fill/map` run lambdas with a
  throwaway store but the *live* pathContext (`index.ts:5672, 5712, 5755, 5904, 4844,
  4925`), so pen position advances while output is dropped. `Grid.forEach` threads the
  active accum (`:4879-4886`). A naive hook would fire phantom events; needs layer
  identity to filter. This is the long-known "ctx leak".
- **`ctx` inside `@{}` is frozen** at entry (`index.ts:1986-1989` vs
  `updateCtxVariable` writing to root scope, `:8119-8140`). Untested. Constrains what
  a block-arg `@{|ctx| ...}` could offer until fixed.
- **`ctx` has no queries** (`PathContext`, `pathogen-api.ts:989-1004`: position,
  start, heading, tangentAngle, transform, commands).
- **Queries today**: receivers PathBlock / ProjectedPath / `layer('x')`;
  `segment()` returns a rebased PathBlock (or ProjectedPath on layer/projected
  sources), `point()` a Point, `vertex()` a VertexHandle. Pseudos `:atomic :first
  :last :nth(k)`. Labels form groups (querySelector model). Sites: `index.ts:2373,
  2711, 3416`, all through `runSegmentQuery` (`:534`).
- **Lambdas**: `UserFunction{params, body, closure?, isLambda?}`; invoked via
  `createScope(closure ?? scope)` (`index.ts:7876-7890`); bodies are dual-mode
  (return a value, or fall through emitting path). `<<` worker gate is
  `CALLBACK_METHODS` (`src/callback-methods.ts:10-14`: map, filter, reduce, sort,
  fill, forEach, variableOffset, compoundVariableOffset); inline lambda literal
  after `<<` is a compile error by design; trailing block and `<<` are mutually
  exclusive. `subscribe {|r| ...}` and `subscribe() << handler` both fit; adding
  `subscribe` to CALLBACK_METHODS makes it interceptable on every receiver.
- **Per-event throw = V8 cliff** (`LoopFlow` comment, `index.ts:8838`; Grid 100x
  deopt). Event dispatch must be return-value based, never throw per command.
- **ONE evaluator** since 2026-09-03 (`src/CLAUDE.md:117`, `project-docs/retire-
  annotated/`). No parity work. Convention: one rule, one home, small module
  (`switch-match.ts`, `range-loop.ts`, `struct-properties.ts`). A subscription
  registry belongs in e.g. `src/evaluator/observers.ts` hung off `EvaluationState`
  (`types.ts:1098-1130`), next to `logs`/`warnings` which are the closest precedent.
- **No first-class Bezier / Arc / Command / Segment types.** `PathSegment`
  (`types.ts:1079`) is a string wrapper — name collision if we add a real Segment.
  `BoundingBox` is completion-only; runtime returns an anonymous ObjectValue.
- **Type/method cost**: method on existing type = evaluator + `pathogen-api.ts`
  JSDoc + `npm run generate:completions` + docs; new struct = `struct-properties.ts`
  DESCRIPTORS (member access + destructuring); new constructor =
  `constructor-registry.ts` + canonical test program; new syntax = grammar regen
  (keyof patch trap) + ast-builder + evaluator + formatter + TextMate.
- **Language services**: typing the observer lambda's param requires parsing the
  selector string at completion time (precedent: segment-query parser used by
  completion for `segmentAll` element types, `completion-data.generated.ts:1231`).

## Bugs / debts found while looking (fix regardless)

1. `pathogen-api.ts:975-987` declares `apply()` with a snippet on GroupLayer; runtime
   hard-errors at `index.ts:9266`. Completion offers a snippet that always fails.
2. `ctx` inside `@{}` frozen at (0,0) — no test reads ctx inside a block.
3. `<<` PathBlock concatenation drops record `label`/`loc` and statement granularity.
4. Discard-sink ctx leak (pen advances, output dropped) — documented only half-way in
   `docs/syntax.md:1138`.
5. Memory files still describe "two evaluators"; update after plan mode.

## Questions for Ryan (with my leanings)

1. **Pull first or push first?** Leaning: selector language + result structs (pull)
   first; push = "run the selector incrementally per recorded statement" on top.
2. **String selector DSL vs typed method chains?** Leaning: one string grammar under
   `query()` / `queryAll()`, existing `segment/point/vertex` kept as sugar. Sub-question:
   is `command(L,l)[y]` a *filter* (commands having y) or a *projection* (the y values)?
   CSS reads it as filter; the prompt reads it as projection.
3. **Result object model**: is-a PathBlock (one-command block, gets length/pointAt/
   tangent/normal/bbox free) or has-a (`Command` struct with `.block`)? Which
   kind-specific fields matter first? Absolute coords always for layer sources?
4. **Emission unit**: per statement after labels attach (circle = 1 event, many
   commands) with `command(...)` fanning out per command; labeled runs emit at run
   close; `:last` only at end. Acceptable?
5. **Where/when observers draw**: (a) lift the apply-nesting ban with a re-entrancy
   guard; (b) defer callbacks to apply-block exit (batch flush); (c) observer declares
   target layer(s) up front and returns a PathBlock. Leaning: (a), because the sketch
   draws into two layers of different kinds from one callback.
6. **Lifetime**: imperative subscribe/unsubscribe handle vs lexically scoped observe
   block vs program-lifetime. Leaning: handle + natural death at program end; scoped
   sugar later.
7. **Authored vs finalized**: observers see the sharp corner a later fillet trims.
   Accept as "authored" semantics (consistent with PathBlock `point()`), or delay
   vertex events one statement so the corner op is known?
8. **PathBlock `.apply {}` and `@{|ctx| ...}`**: is the goal a mutable builder
   (append after creation, breaks value semantics) or observing a block as it is
   authored (subscribe inside `@{}`)? Fix frozen ctx first either way.
9. **Animation**: no time model exists; park it as out of scope for this feature.
10. **Boolean ops / non-linear paths**: pull queries cover them; `walk` is
    `commands` + selectors, no separate method needed.

---

# Query language v1 proposal (2026-09-14, pull-first, string grammar)

Ryan's direction: start with #1, design the string grammar for a pull model.

## Additional grounding

- Labels are `[A-Za-z][A-Za-z0-9_-]*` (`segments.ts:306`) — so `a`, `L`, `command`,
  `endpoint` are all VALID label names today. Bare letters cannot be selectors;
  structural nouns need a syntactically distinct form (parens). No word needs
  reserving if the parens form is the only structural spelling.
- Existing string grammar: `label[:pseudo]`, one pseudo, `parseSegmentQuery`
  (`segments.ts:362`); pseudos `:atomic :first :last :nth(k)`; `cut` umbrella +
  `cut.<name>`. Every existing string is the degenerate case of the new grammar.
- PathBlock commands are normalized to lowercase relative (`index.ts:2013-2018`);
  layer records keep authored case. So `command(L)` vs `command(l)` must be
  case-insensitive by default or PathBlock queries would silently miss.
- `identifyCornerVertices` (`path-transforms.ts:1672`) = every junction between two
  non-M/non-Z commands, no collinearity test. "vertex" = joint, not geometric corner.
- `PathCommand` AST: `command` is the letter, or `''` for statement-level calls with
  `args[0]` a FunctionCall/MethodCallExpression (`ast.ts:262`). At the record site
  (`index.ts:9087`) the stdlib fn name is in hand but `PathRecord` has no field for
  it. Needed for a `call(circle)` subject.
- Stdlib path emitters: circle arc rect roundRect polygon star line quadratic cubic
  moveTo lineTo closePath radialWedge cubicSpline quadSpline clippedQuadSpline
  polarCubicBezier; context-aware: polarLine arcFromCenter arcFromPolarOffset
  tangentLine tangentArc polarMove (+ heading/turn emit nothing).
- Language services do not complete inside query strings today (no hits in
  `completion.ts`). A shared parser module would make that possible.
- `docs/path-blocks.md:109`: `vertices` = unique start/end points of each command.

## Model

A query yields an ordered list of **matches**; each match is a contiguous span of
one or more commands. The **subject** sets span granularity; **filters** and
**pseudos** narrow/decompose/select; the **method** projects each span:

| Method | Projection of each span |
|---|---|
| `segment` / `segmentAll` | PathBlock (ProjectedPath on layer/projected sources) — existing |
| `point` / `pointAll` | end Point of the span — existing |
| `vertex` / `vertexAll` | VertexHandle at the span's end joint — existing |
| (Q3, later) `query` / `queryAll` | rich Match/Command struct |

Bare-label semantics per method are unchanged: in `segment()` a bare name is a
segment label; in `point()`/`vertex()` an endpoint label.

## Grammar (EBNF)

```
query     := compound ( ',' compound )*            ; union, authoring order, dedup
compound  := subject filter* pseudo?               ; one pseudo (existing rule)
subject   := label                                 ; 'rib' | 'cut' | 'cut.rim'  (existing)
           | '*'                                   ; every command
           | 'command(' kind (',' kind)* ')'       ; kind := letter | alias
           | 'call(' fn (',' fn)* ')'              ; statement emitted by stdlib fn
filter    := '[' attr ( op value )? ']'            ; presence, or comparison
op        := '=' | '!=' | '<' | '<=' | '>' | '>='
value     := number | ident                        ; dynamic values via ${} interpolation
pseudo    := ':atomic' | ':first' | ':last' | ':nth(' int ')'
```

- `kind` letters are case-insensitive (`l` ≡ `L`); aliases: `line`=L H V,
  `cubic`=C S, `quadratic`=Q T, `curve`=cubic+quadratic, `arc`=A, `move`=M,
  `close`=Z. `[absolute]` / `[relative]` filters recover the spelling.
- Span granularity: label → merged run (existing); `call(fn)` → the statement's
  commands; `command(...)` / `*` → single command. `:atomic` decomposes any span.
- Filters evaluate per command; on a multi-command span a filter matches if any
  command matches (document; alternative: all). Attributes:
  `x y` (end), `length`, `index`, `subpath`, `label` (segment label),
  `endpoint` (endpoint label), `cornerOp` (`fillet|chamfer|ellipticalFillet`),
  `absolute`/`relative`, and SVG parameter names per kind:
  `x1 y1 x2 y2` (C/S/Q), `rx ry rotation largeArc sweep` (A).
- Geometry answered: finalized commands (existing `segment()` behavior); `point()`
  keeps its authored-vertex preference on PathBlock/layer sources.
- Errors: singular forms error on no match listing what exists (labels today;
  add command kinds + calls present); `All` forms return `[]`.
- Streamability notes for the later push model: per-command evaluable — `*`,
  `command()`, all filters, `:atomic`, `:first`, `:nth(k)`; needs close-of-span —
  label runs (emit at run close), `call()` (statement close); needs end-of-source
  — `:last`.

## Deferred (not v1)

`:not(compound)`, descendant combinator `rim command(a)` (space), `subpath()`
subject (overlaps `contours`; `[subpath=k]` covers the filter case), `:has()`,
regex/wildcard labels (`rib-*`), attribute projection in-string (`[y]` returning
numbers) — projection stays with the method or `.map`.

## Implementation surface (for later planning)

- New shared module `src/evaluator/path-query.ts` replacing `parseSegmentQuery`
  and `queryLabeledRuns`; single source for evaluator + language services.
- `PathRecord.fn?: string` captured at `index.ts:9051/9087` from the statement.
- Expose `meta` (labels) on `.commands` records (independent fix).
- `pathogen-api.ts` JSDoc updates on the 6 methods × 3 receivers; regenerate.
- Language services: string-internal completion (subjects, pseudos, attrs, literal
  labels visible in the document), diagnostics for malformed queries.
- Docs: extend `docs/segment-labels.md` "Querying" or new `docs/path-queries.md`
  + `DOC_FILES`.

## Open questions put to Ryan

1. Method-as-projection (this proposal) vs a single `query()` typed by string.
2. Filters only, projection via method/`.map` — or in-string `[y]` projection.
3. Case-insensitive letters + kind aliases, or letters only.
4. Span granularity rules acceptable.
5. No reserved words (parens disambiguate) vs reserving nouns going forward.
6. v1 scope as drawn; which deferred items to pull in.
7. Rich-result `query/queryAll` in this milestone or with Q3.

**Ryan's ruling (2026-09-14):** REJECTED method-as-projection. `segmentAll('command(a)')`
is semantically unclear (labeled collection, or every arc?). Wants a single
generalized `query(...)` for commands, calls, vertices, points, segments; existing
`segment/segmentAll/point/pointAll/vertex/vertexAll` stay as convenience methods and
are NOT extended beyond their current form. Labels need a collision-free spelling.

---

# Query language v2 proposal — `query()` / `queryAll()` (supersedes v1 above)

## Shape

- `query(sel)` → first match, errors on none listing what the path has (querySelector).
- `queryAll(sel)` → every match in authoring order, `[]` on none (querySelectorAll).
- Receivers: PathBlock, ProjectedPath, `layer('x')` (same three as today).
- **The noun names the result type.** Labels live in the noun's argument list, mirroring
  the authoring clauses `as segment('rib')` / `as endpoint('base')`, so no bare
  identifier ever competes with a keyword: `segment(vertex)` is the label "vertex".

## Grammar (EBNF)

```
query     := selector ( ',' selector )*                ; union, authoring order
selector  := compound ( WS compound )*                 ; descendant: right side scoped inside left matches
compound  := noun [ '(' arg (',' arg)* ')' ] filter* [ pseudo ]
noun      := 'command' | 'call' | 'vertex' | 'segment' | 'subpath'
arg       :=  meaning depends on noun (see table); '*' or no parens = every one
filter    := '[' attr [ op value ] ']'                 ; presence, or comparison
op        := '=' | '!=' | '<' | '<=' | '>' | '>='
value     := number | ident                            ; dynamic values via ${} interpolation
pseudo    := ':first' | ':last' | ':nth(' int ')'
```

| Noun | Argument = its natural key | Result type | Unit |
|---|---|---|---|
| `command(a, c)` | command letters (case-insensitive) or aliases `line cubic quadratic curve arc move close` | **Command** | one SVG command |
| `call(circle, draw, myFn)` | emitting stdlib fn / method / user fn name | **Call** | one statement's commands |
| `vertex(base-end)` | endpoint label (`as endpoint(...)`) | **Vertex** (today's VertexHandle, grown) | one joint |
| `segment(rib)` / `segment(cut.rim)` | segment label (`as segment(...)`); merged runs, `cut` umbrella as today | **Segment** | one labeled run |
| `subpath` | (index via `:nth(k)`) | **Subpath** | M … next M / end |

Descendant combinator = containment by command membership (a vertex belongs to the
command it ends). The rightmost compound is the subject, as in CSS:
`segment(rib) command(a)` arcs inside rib; `call(circle) vertex` joints a circle drew;
`subpath:nth(0) command` first subpath's commands. This REPLACES `:atomic` inside
`query()` — `segment(rim) command` is the typed spelling. `:atomic` survives unchanged
on legacy `segmentAll`.

Filters are scalar: `x y` (end point), `length`, `index`, `absolute`/`relative`,
`closed` (subpath), `label` (presence: `vertex[label]` = every labeled joint),
`cornerOp` (`= fillet|chamfer|ellipticalFillet`), and SVG parameter names per kind:
`x1 y1 x2 y2` (C/S/Q), `rx ry rotation largeArc sweep` (A). On multi-command units
(call/segment/subpath) a filter passes if ANY member command passes (decision pending).

Rules: a selector list (`,`) must share ONE noun (else compile error) so results
stay typeable. One pseudo per compound. Letters case-insensitive because PathBlock
commands are lowercase-normalized (`index.ts:2013-2018`).

## Result objects (forced into this milestone by query())

- **Command**: `kind` (lowercase letter), `absolute`, `args`, `start`, `end`, `index`,
  `subpath`, `length`, `block` (one-command PathBlock/ProjectedPath), `segment`
  (label|none), `endpoint` (label|none); kind-specific `cp1 cp2` (cubic; S resolved),
  `cp` (quadratic; T resolved), `rx ry rotation largeArc sweep center` (arc).
- **Call**: `fn`, `commands`, `block`, `start`, `end`, `index`.
- **Vertex**: `point`, `x`, `y`, `label`, `index`, `in` (Command), `out` (Command|none),
  `turn` (signed angle), `fillet()/chamfer()/ellipticalFillet()` (existing).
- **Segment**: `label`, `block`, `commands`, `start`, `end`, `length`, `index` (run #
  within group).
- **Subpath**: `index`, `closed`, `block`, `commands`, `start`, `end`.
All registered in `struct-properties.ts` (member access + destructuring), declared
`@type` in `pathogen-api.ts`, element types via `PathogenArray<X>`.

## Convenience methods as sugar (unchanged surface)

`segment(n)` ≡ `query('segment(n)').block`; `segmentAll(n)` ≡ map `.block`;
`point(n)` ≡ `query('vertex(n)').point`; `vertex(n)` ≡ `query('vertex(n)')`;
`segmentAll('rim:atomic')` ≡ `queryAll('segment(rim) command')` mapped to `.block`.
Legacy pseudos unchanged on legacy methods.

## Data-model additions

`PathRecord.fn?: string` (captured at `index.ts:9051/9087`); expose labels on
`.commands`; shared parser `src/evaluator/path-query.ts` (evaluator + language
services; enables in-string completion of nouns/attrs/pseudos and literal labels).

## Questions v2

1. Names: `query`/`queryAll` vs `select`/`find`. 2. `vertex(...)` noun vs `endpoint(...)`
(authoring symmetry) — accept both? 3. `point` as its own noun (Point results) or
folded into Vertex. 4. Descendant combinator in v1 (recommended) or `[segment=rib]`
attrs. 5. Case-insensitive letters + aliases. 6. any-vs-all filter on multi-command
units. 7. Mixed-noun lists = error. 8. `subpath` in v1.

**Ryan (2026-09-14):** direction is right. Dislikes the `as endpoint(...)` / `vertex(...)`
asymmetry — authoring and query must be consistent. Asked for range syntax on
`:nth`, e.g. `:nth(1..5)` (implies `subpath` is in).

---

# v3 adjustments

## Noun = `endpoint` (authoring symmetry wins)

- Query noun is **`endpoint`**, mirroring `as endpoint('base')` exactly; result type
  **Endpoint** (today's VertexHandle, grown; `vertex()`/`vertexAll()`/`point()`/
  `pointAll()` stay as legacy sugar returning Endpoint / Point). Renaming authoring
  to `as vertex(...)` was rejected as a breaking change to a shipped, blogged
  feature with no upside. No aliases: one word.
- Unit: one Endpoint per **drawing** command (l h v c s q t a, and z when it has
  length). Pure moves excluded — a move's endpoint is where drawing *starts*, and
  `:atomic` already skips moves for the same reason. Endpoint fields: `point x y`,
  `label`, `index`, `command` (the command it ends), `next` (Command|none), `turn`
  (signed), `isJoint` (both sides drawing), corner-op methods (joints only; error
  otherwise — matches today's VertexHandle behavior on non-corners).
- Full noun set: `command | call | endpoint | segment | subpath`. Consistency table:
  `as segment(...)` ↔ `segment(...)`; `as endpoint(...)` ↔ `endpoint(...)`;
  `.commands` ↔ `command`; `subPathCount` ↔ `subpath`; statements ↔ `call`.

## `:nth` grows Pathogen range syntax

```
pseudo := ':first' | ':last' | ':nth(' index-list ')'
index-list := index-spec ( ',' index-spec )*
index-spec := int | int '..' int | int '..<' int          ; ints may be negative
```

- Mirrors the language: `a..b` inclusive, `a..<b` half-open (`docs/syntax.md:1364-1379`),
  negative indexes count from the end as `.slice()` does (`docs/syntax.md:894`).
  `:first` ≡ `:nth(0)`, `:last` ≡ `:nth(-1)`; last three = `:nth(-3..-1)`.
- Ranges read low to high (like switch range patterns, `docs/syntax.md:1542`);
  a descending range matches nothing. Out-of-range clips like `.slice()`; a fully
  out-of-range spec = no match (singular `query` errors with the count, `queryAll`
  returns `[]`) — same as today's `:nth(k)`.
- Result order stays authoring order regardless of list order (`:nth(4, 0)` = [0, 4]).
- Applies to every noun; composes with the combinator: `subpath:nth(1..5) command`.
- Interpolation supplies dynamic bounds: `` `subpath:nth(${a}..${b})` ``.

## Still open (carried from v2)

1. Names `query`/`queryAll`. 3. Fold `point` into Endpoint (recommend yes).
4. Descendant combinator in v1 (recommend yes). 5. Case-insensitive letters +
aliases (recommend yes). 6. any-vs-all filters on multi-command units (lean any).
7. Mixed-noun lists = compile error (recommend yes). 8. `subpath` in v1: YES (implied).

**Ryan (2026-09-14):** asked to disambiguate `subpath:nth(1..5) command` vs
`command:nth(1..5)`; skeptical of `subpath` as a noun if `:nth` exists — why both?

## Resolution: noun = kind, `:nth` = position; subpath's natural key IS position

Worked example (3 subpaths, flat command indexes 0..11):
```
M 0 0  h 10 v 10 z      subpath 0 = commands 0..3
M 20 0 h 10 v 10 z      subpath 1 = commands 4..7
M 40 0 h 10 v 10 z      subpath 2 = commands 8..11
```
- `command:nth(1..5)` → flat positions 1..5 = `h v z` of subpath 0 + `M h` of
  subpath 1 (5 commands, crosses a boundary). Position in the whole path.
- `subpath:nth(1..2) command` → every command of subpaths 1 and 2 (8 commands).
  Membership, not position.
- `subpath:nth(1) command:nth(1..2)` → `h v` of subpath 1: after a combinator,
  `:nth` indexes the SCOPED match list (like CSS nth-child is relative to parent).

Rule: `:nth` always indexes the match list built so far in its compound. It is
orthogonal to nouns. It only *looks* fused to `subpath` because subpaths have no
labels — position is the only way to name one.

**Proposal B (recommended):** make index the subpath noun's ARGUMENT, consistent with
"the argument is how you name one of that kind": `command(a)` by letter,
`call(circle)` by fn, `segment(rib)`/`endpoint(base)` by label, **`subpath(2)`,
`subpath(1..5)`, `subpath(-1)`** by position. `subpath` bare = all. Shares the
`index-list` production with `:nth`. `:nth` stays general (`command:nth(0)`,
`endpoint:nth(-1)`, legacy `segmentAll('rib:nth(2)')`) and is simply never needed
on subpath in practice. Alternatives: A = keep `subpath:nth(k)` only; C = drop the
noun, use `command[subpath=2]` filters (loses the Subpath object: block, closed,
start, end; ranges would need two comparisons).

## Definition of `subpath` (Ryan asked; 2026-09-14) — and the contour comparison

SVG definition (adopt for the noun): a subpath starts at a moveto and runs to the
next moveto. A closepath draws back to the subpath start; if drawing continues
after `z` WITHOUT a new `m`, a new subpath begins implicitly at that start point.
So boundaries are: every `m`, plus the first drawing command after a `z`.

Pathogen today has TWO splitters that disagree with each other and with the spec:
- `countSubPaths` (`index.ts:997`): splits on `m` only (count starts at 1).
- `splitContours` (`font-provider.ts:412`, backs `.contours`): splits on `z` only,
  trailing open run kept. Documented for glyphs (`docs/path-blocks.md:1467`).
They coincide for closed glyph outlines (every contour is `m … z`). They diverge on:
`m h v z h v` → 1 subpath by m-split, 2 contours by z-split (spec: 2 subpaths);
`m h v m h v` → 2 subpaths by m-split, 1 contour by z-split (spec: 2 subpaths).
"Contour" is the font term and implies closed; `subpath` is the SVG term and
matches `subPathCount`. Keep `subpath` as the noun; no `contour` alias.

Implementation note: collapse both splitters into one shared helper implementing
the spec rule (module home per the retire-annotated convention); `subPathCount`
adopts it (behavior change only for post-`z` drawing without `m`); `.contours` on
glyphs is unaffected (glyph outlines always `m … z`), hand-authored `.contours`
would change for open runs — flag in docs when it lands.

**Ryan (2026-09-14):** agreed — `.subPath(t0,t1)` method vs `subpath` noun must be
differentiated in docs + blog examples; `contour` rationale accepted. Asked for the
consolidated list of outstanding questions/issues for the initial work.

---

# Consolidated status for the initial milestone (query language, pull model)

## Settled
- Pull-first; query language is milestone 1; push/observers later.
- Single generalized `query(sel)` / `queryAll(sel)`; legacy six methods stay as sugar,
  not extended (legacy pseudos incl. `:atomic` untouched there).
- Nouns `command | call | endpoint | segment | subpath`; labels/keys in the noun's
  argument; `endpoint` for authoring symmetry; no aliases.
- `:nth` accepts Pathogen index specs (int, `a..b`, `a..<b`, negatives, lists);
  `:first`/`:last` are sugar. `:nth` indexes the compound's match list (scoped after
  a combinator).
- `subpath` = SVG rule (move-delimited; post-`z` drawing starts a new one); keep the
  name; document against `.subPath(t0,t1)`; unify the two splitters.

## Decisions still open (recommendation in brackets)
1. Names `query`/`queryAll` [yes].
2. `subpath(k)` index-as-argument, option 1 [yes].
3. Fold points into Endpoint (`.point`), no `point` noun [yes].
4. Descendant combinator (space) in v1 [yes].
5. Command letters case-insensitive + shape aliases + `[absolute]`/`[relative]` [yes].
6. Filters on multi-command matches: any member passes [any].
7. Mixed-noun comma lists = compile error [yes].
8. Command struct field naming: existing `.commands` records use `command` for the
   letter; proposed struct used `kind`. [Keep `command` for the letter for backward
   compat; make `.commands` return the SAME Command struct as `queryAll('command')`
   so one type exists.]
9. `call()` provenance depth: a statement `myFn();` is one record — `circle()` calls
   INSIDE a user fn are not separately recorded, so `call(circle)` would not see them
   (only `call(myFn)`). [v1: outer statement only, documented; nested provenance later.]
   Also: method-call statements record their method name (`call(draw)`).
10. Language-services scope for v1: [must] result element typing so `for (c in
    pb.queryAll('command'))` completes `c.`; [stretch] in-string completion of
    nouns/pseudos/attrs + malformed-selector diagnostics via the shared parser.
11. Docs home: new `docs/path-queries.md` + DOC_FILES entry, cross-linked from
    segment-labels and path-blocks [new page]; blog post after.
12. Which found bugs ride along: `.commands` meta exposure [yes, required];
    GroupLayer `apply` snippet [yes, trivial, separate commit]; frozen `ctx` in `@{}`,
    `<<` concat label drop, discard-sink ctx leak [defer to push milestone].

## Prerequisite work items (not questions)
- `PathRecord.fn` captured at the two record sites.
- Shared `path-query.ts` parser + evaluator (replaces `parseSegmentQuery`/
  `queryLabeledRuns`; legacy methods route through it for their subset).
- Unified subpath splitter; `subPathCount` adopts it.
- Struct registrations (5 types) + `pathogen-api.ts` `@type`s + regenerate.
- Memory housekeeping after plan mode: retire "two evaluators" notes.

## Out of scope for milestone 1
Push/subscribe, apply-nesting lift, `:not()`/`:has()`, wildcard labels, in-string
projection, animation, `.subPath()` rename (doc note only).

# Phase 0a audit (2026-10-26)

What the code does today, what the corpus contains, the bugs the audit turned up, and the
decisions taken with the user. The plan built on it is `06-phase-0a-plan.md`.

Sources: three read-only explorers (evaluator scope and drawing paths; tooling, docs and built-in
names; the corpus of programs), a planning agent, and CLI probes run in the session. Line numbers
are `src/evaluator/index.ts` as of commit `cedd42e` unless a file is named.

## 1. Bugs found (confirmed by running the CLI)

| # | Program | Today | Should be |
|---|---|---|---|
| B1 | `let c = Cycler([10,20,30,40]); M 0 0 L c.pick() 0 L c.pick() 0` | `L 10 0 L 30 0`; pen at 20, then 40 | `L 10 0 L 20 0` |
| B1 | `let n = 0; fn inc() { n = n + 1; }` then `M 0 0` ⏎ `inc();` | `n = 2` (an array push also runs twice) | `n = 1` |
| B1 | `M 0 0` ⏎ `L calc(random() * 100) 0` ⏎ `log(ctx.position.x)` | writes `L 13.6…`, logs `83.8…` | the pen follows the bytes |
| B2 | `M 50 50` then a lambda calling `polarLine(0deg, 10)` inside `@{ m 0 0 f(); }` | the block records `l 60 50` | `l 10 0`, as a named fn already gives |
| B2 | a lambda reading `ctx.position.x` inside `@{ m 5 0 … }` after `M 50 50` | 50 (the program's pen) | the block's pen |
| B3 | `@{ m 5 0 log(ctx.position.x); }` | 0 | 5 (`docs/debug.md:257`: "the block's own cursor") |
| B3 | `M 10 10 let b = @{ m 5 0 }; log(ctx.position.x)` | inferred from the code: 5 (the block pen leaks into the root `ctx`) | 10 |

- **B1 cause.** `evaluatePathCommand` (9468) evaluates each argument with `evaluatePathArg`
  (8894), then, for a command whose text holds no extra command letters, calls `getNumericArgs`
  (9011), which evaluates every non-literal argument again (calc, function calls, method calls,
  members, indexes) to move the pen. The comment at 9508 covers tracked commands only. A call
  that draws nothing (`''`) takes this branch; one that draws takes the reparse branch and runs
  once. `random()` is `Math.random()` (unseeded), so fixing this changes no expected output. No
  published sample puts `pick()` or `random()` directly in a path command.
- **B2 cause.** A lambda call runs `createScope(userFn.closure ?? scope)` (8725), and
  `createScope` copies the parent's `evalState` (1002), so a lambda draws with its definition's
  pen. Named fns get the caller's scope, hence the caller's pen.
- **B3 cause.** `ctx` is an ordinary variable: bound on the root (11663, 11773), bound once on
  the `@{ }` scope at block start (2534), and rewritten on the ROOT by `updateCtxVariable`
  (9072-9094) after every command — including commands inside a block.
- **Found in passing, recorded as follow-ups:** the path-args tokenizer takes a call on the line
  after a path command as that command's argument (`path-args-tokenizer.ts:17-31`), so a fn that
  returns a number there becomes a coordinate; under `--to-fixed` the lettered-command pen
  follows unrounded values while `draw()` follows the text.
- **Step 1 audit, final run (2026-10-29), `verify/semantics-audit-step1.md`:**
  - Corpus and baseline at `6e544e9`, the parent the step 1 commit will have. The new side is
    `tmp/step1-snap-6e544e9/`: HEAD's `src/` plus the step 1 patch (`--after-dir`), so the
    parallel session's edits couldn't leak in. A run on `c52d2b3` the day before gave the same
    counts.
  - The commit's own tree (HEAD plus exactly the step 1 files, built in `tmp/step1-commit/`)
    passes the full suite: 177 files, 7,479 tests.
  - 1,400 programs. 1,386 unchanged, none different. 9 of them were compared with trace off
    (over 20,000 commands), including `semi-circle-example` (480,320 commands).
  - 10 skipped because the baseline parser rejects them: 3 blog fences and 7 project-docs files.
  - Earlier runs the same day, working tree vs `694a6b9` and vs `d756611`, both gave
    1,412 programs, 1,341 unchanged and 0 different; the blog fences fixed in `c52d2b3` were
    still skipped then.
  - 4 too-large: the boolean-ops glyph matrices no longer run out of memory (`8b55bff`), but
    they take longer than 240 s.
  - Rerun of all 7 `failure-matrix*` programs with a 20-minute limit, one per process
    (`verify/semantics-audit-step1-matrices.md`): 6 unchanged. `failure-matrix.pathogen`
    (133,648 commands) passed the size check, but its other two trace-off compiles didn't finish
    in 20 minutes, so it is the one program in the corpus step 1 couldn't check.
  - Positive control (`verify/semantics-audit-step1-probes.md`): the seven programs in
    `verify/step1-probes/` give 6 expected differences, one per B1 case (one of them over the
    trace limit), and the stateless control is unchanged. The same holds against the snapshot.
    So the zero above means no real program depended on double evaluation.
  - `verify/verify-step1-surfaces.ts`: the probes give the same, expected result in the engine,
    the CLI binary (`dist/cli.js --json`), the playground bundle (`dist/index.global.js`,
    `compileWithContext`) and the VS Code extension's bundled compiler (`compile`), 28/28. The
    two bundles ran in a Node realm, not in a browser or the webview.
- **Step 1 audit, earlier runs (2026-10-27), baseline `cedd42e`:**
  - 1,433 programs: 1,232 unchanged, 0 different, 3 too-large (the matrices ran out of memory in
    the baseline itself), 198 skipped (131 of them docs fences).
  - The first run (2026-10-26) never finished: the batches had no time limit. The harness now
    stops a program after `--timeout` seconds and lists it as too-large.
- **Why the audit stalled (found by the parallel session, 2026-10-27):**
  - **Trace mode is quadratic.** With `trace: true` every pen keeps its command history, and
    `contextToObject` (`src/evaluator/context.ts:417`) copies the whole history into a new
    `ctx` after each command (`updateCtxVariable`).
  - Measured with the new evaluator, one pen drawing N `l 1 0` commands:

    | N | trace off | trace on |
    |---|---|---|
    | 1,000 | 8 ms | 18 ms |
    | 5,000 | 5 ms | 231 ms |
    | 10,000 | 8 ms | 882 ms |
    | 20,000 | 17 ms | 4.3 s |

  - `semi-circle-example` (480,320 commands) compiles in 1.9 s at 464 MB with trace off.
    Traced, it never finishes.
  - **The three glyph-union matrices** (`failure-matrix-2`, `-3-dashed`, `-3-solid`) run out of
    memory with trace off, under both the baseline `cedd42e` and the working tree (4 GB heap,
    about 150 s, all three `@font` files resolved). The stack repeats the same two frames, deep
    recursion in the boolean union. So it's an existing bug, not a step 1 regression. They stay
    too-large.
  - **Harness change:** a trace-off size check runs first, with the baseline. Over
    `--trace-limit` path commands (20,000 by default), all three compiles run with trace off, so
    before and after still use the same mode. The report lists those programs under "compared
    with trace off". `step1-probes/cycler-over-trace-limit.pathogen` (25,000 commands) is the
    positive control for that path.
  - **Blind spot:** the size check counts the path data of drawn layers only, so commands in
    defs or in blocks that are never drawn don't count. The watchdog is the backstop. If a run
    reports too-large "in the traced compiles (N commands)", lower `--trace-limit`.
- **For step 2:**
  - `src/cli.ts:1005` turns trace on for `--json`, so CLI users hit the same slowdown.
  - Step 2 removes the per-command `ctx` rebuild. Its 5k-command benchmark should include a
    traced compile, or a `--json` run on a 100k+ command program.
  - Raise `--trace-limit` only once the baseline commit is past step 2. Until then the old
    evaluator still copies the history.
  - `ctx.heading` after `M`: `docs/stdlib.md` (about line 1016) says `log(ctx.heading)` gives
    "undefined (M clears the heading)", but Pathogen throws "Property 'heading' does not exist
    on context object". The JS API's `result.context.heading` is `undefined`
    (`tests/context.test.ts:1567`). Once `ctx` is computed, decide what it reads as after `M`,
    and make the doc, the evaluator and that test agree. Found by the parallel session.
  - The parallel session's docs-fence commit has landed (`694a6b9`), so `docs/debug.md` and
    `docs/syntax.md` are free for step 2's edits.
  - Step 2's audit baseline: the step 1 commit, which sits on `d756611`. That includes the
    union fix `8b55bff`, the `\$` parser fix `f210e1f`, the builder-block fix `e8096c9` and the
    `ctx.heading` fix `d756611`. The `ctx.heading` item above is done (`null` after `M`; tests in
    `tests/ctx-heading.test.ts`). Step 2's computed `ctx` must keep that behavior.
- **A builder block's last line without `;` crashed. DONE by the parallel session in `e8096c9`
  (2026-10-28):** `runBuilderBlock` is used at all 16 sites. A last line without `;` runs as a
  statement, an explicit `return` ends the block, and a stray `return` is a positioned error.
  The original finding:
  - Found by the parallel session, 2026-10-28; reproduced with TopoGradient and LinearGradient.
  - `LinearGradient('fade', 0, 0, 1, 1) {|g| g.stop(0, red); g.stop(1, blue) }` fails. The CLI
    says "Error: undefined" and the playground "[object Object]", with no line or column.
  - Cause: the block's last expression becomes an implicit return, as in a lambda. The builder
    loops (`for (const stmt of call.block.body)`, 16 sites in `src/evaluator/index.ts`:
    LinearGradient, RadialGradient, Pattern, Marker, Grid, the seven filters, Conic, Mesh,
    Freeform and TopoGradient) don't catch the `ReturnSignal`. So it escapes `compile()` as a
    plain object, not an `Error`.
  - Fix the class: one helper for running a builder block, used at all 16 sites. Decide whether
    a value in the last position is ignored or is an error with a position. Also make sure
    nothing that isn't an `Error` can escape `compile()`.
  - The test runs every builder with a last line that has no `;`.
- **For steps 3–5, doc examples that are meant to fail:**
  - Tag them ```` ```pathogen invalid ````. The docs build reads only the first word, so they
    render like ```` ```pathogen ````. The parallel session's new test requires every other
    untagged or `pathogen` fence in `docs/` to parse.
  - Step 3's "pass it in" error example and step 5's built-in-name error examples need this tag.
  - The audit still compiles these fences, since `markdown-fences.ts` keeps only the first word.
    That's deliberate: an intended error is compared on its message, so step 3's new hint shows
    up as an expected difference.
  - An invalid fence that doesn't parse lands in "skipped" with the stale ones. To report it as
    intentional instead, pass the full info string through `markdownFences()`.
- **Follow-up, boolean union (diagnosed and fixed by the parallel session, 2026-10-28; committed
  as `8b55bff`, `src/evaluator/boolean-ops.ts`):**
  - The cause: `bezierClipRecurse` has no work limit. It runs out of memory whenever one curve
    is a speck lying on the other, or two curves share a stretch.
  - In the matrices, the self-intersection pre-pass cut a 2e-8 sliver from a chained-union
    outline that grazes itself (two crossings 1e-8 apart).
  - Only one cell of `failure-matrix-2` fails: Raleway ExtraLight "Encyclopedia" at
    tracking 0.7.
  - The planned fix applies only once a curve-pair intersection search passes a call limit set
    well above anything the 96 cells use, so programs that compile today keep their output.
  - Step 2's audit baseline must be `8b55bff` or later, or its changes show up as unexplained.
    The step 1 commit qualifies.
- **Follow-up, published docs. DONE by the parallel session in `694a6b9` (2026-10-28): every
  untagged or `pathogen` fence in `docs/` parses, and `tests/docs-examples.test.ts` keeps it
  that way.** The original finding: `docs/examples.md` and `docs/getting-started.md` show snippets
  without the `;` the parser has required since the Lezer switch (`rect(10, 10, 180, 80)` gives
  "Missing ';'"). Sort the other skipped fences into intentional fragments (error examples,
  partial syntax) and stale code, then fix the stale ones. Until then the audit can't see them,
  and step 5's built-in-name migration would miss them too.

## 2. Scope and drawing state today

- `Scope` (`types.ts:1279`): `{ variables: Map, parent, evalState? }`. Nothing per binding (no
  const flag, no location).
- `setVariable` (1146) always writes to the current scope (let, for, fn names, params,
  destructuring, callback params); it checks `pi`/`deg`/`rad`. Redeclaring a `let` in the same
  scope silently overwrites. `updateVariable` (1158) walks to an existing binding or throws
  "Cannot assign to undeclared variable".
- `lookupVariable` (1079): the scope chain, then the namespaces `Object`, `Color`, `PathBlock`,
  `Font`, `Cap`, `Marker` (1087-1109), `viewbox` (read from the ROOT, 1118), built-in enums,
  stdlib, else "Undefined variable".
- Named fn values have no closure (10041-10048); lambdas capture the live scope by reference
  (2026-2036). No hoisting: a `fn` binds when its statement runs.
- Scope-creation sites: user fn and lambda call (8725, `closure ?? caller`); per-iteration loop
  scopes (9970, 10005, 10028); if/switch (9984, 9986, 9750, 2088); `@{ }` (2518, new synthetic
  state) and `&{ }` (2632, shares the parent's pen object); `layer().apply` (10322, 10338 —
  mutates the shared state in place, so fns in apply blocks already draw on the layer);
  callbacks with `cb.closure ?? scope`: variableOffset workers 1509, Grid.fill/forEach/map
  5477/5520/5559, map/filter/reduce/sort 6383/6411/6442/6609; subscription dispatch 970 (the
  subscribe-time closure, output to `rootAccum`); constructor binding blocks (throwaway accum).
- Output accumulators are passed as parameters (`evaluateStatementToAccum` 9902 and friends);
  user fn bodies get a fresh accum per call and return a `PathSegment` the caller records. So
  the drawing-context split is about which `evalState` a call scope carries.
- Call resolution (`evaluateFunctionCall` 7507): `log`/`assert` → `layer()` → constructors
  (7533-8597, including `Color` 8507) → the 10 context-aware functions (8600) → `lookupVariable`
  → stdlib (JS function) or user callable. Names in the first four steps can't be shadowed in
  call position: a user `fn Point` or `fn polarLine` is silently ignored there, while a user
  `fn circle` shadows the stdlib.

## 3. Language tooling facts that shape the work

- Grammar: `LetDeclaration` is `kw<"let"> (destructure | VariableName) "=" expression ";"`
  (`pathogen.grammar:48-50`); `kw<>` is `@specialize`, so a `kw<"const">` reserves the word in
  every position; `with`/`as` are contextual via `@extend`. `const`, `import` and `export` are
  valid identifiers today. No npm script regenerates the main grammar:
  `npx lezer-generator src/parser/pathogen.grammar --typeScript -o src/parser/pathogen.generated.ts`.
- `path-args-tokenizer.ts` `KEYWORDS` (9-13) and `STATEMENT_ONLY_KEYWORDS` (46-48) both need a
  new statement keyword, or `M x y` ⏎ `const X = 1;` swallows `const X` as path arguments.
- Formatter prints a literal `let` (`formatter.ts:387-393`), and its default branch deletes any
  node it doesn't handle.
- `src/parser/reserved-bindings.ts:77-98` (called from `parse()` at `src/parser/index.ts:179`)
  is a positioned compile-error check over every `VariableName` except enum members; it covers
  `pi`/`deg`/`rad` today.
- Scope analysis already models fn bodies lexically (`scope-analysis.ts:220`), but walks a body
  where the fn is defined, so names declared later stay unresolved for hover, go-to-definition
  and rename.
- Rename: `NON_RENAMEABLE` (`rename.ts:17-33`) refuses stdlib names such as `min`, `max`,
  `line`, `tan`, `heading`, and edits take the first whole-word match on a line
  (`findWordRangeOnLine` 184-203), not the reference's own position.
- `code-actions.ts:82` matches `/^Undefined variable: (\w+)$/` exactly.
- Hover's `fn` entry (`hover.ts:31`) states dynamic scope.

## 4. Built-in names

No single list exists. The union is about 143 names:

| Source | Count |
|---|---|
| `stdlib` (`src/stdlib/index.ts`: math 51, path 17, grid 3, format 1, geometry 3) | 75 |
| `contextAwareFunctions` (polarPoint … tangentArc, `heading`, `turn`) | 10 |
| `EVALUATOR_CONSTRUCTORS` (`src/evaluator/constructor-registry.ts`) | 26 |
| `STATEMENT_BUILTINS` (`log`, `assert`) | 2 |
| `BUILTIN_ENUMS` | 23 |
| Namespaces in `lookupVariable` (Object, Color, PathBlock, Font, Cap, Marker) | 6 |
| `ctx`, `viewbox` | 2 |

Grammar-level names (`layer`, `calc`, `PathLayer`/`TextLayer`/`GroupLayer`, `true`/`false`/
`null`, CSS colour heads such as `oklch`) can't be declared anyway. Near-lists that have drifted:
`scope-analysis.ts:31-39` (missing `Font`, `Marker`; lists `Infinity`/`NaN`, which the runtime
doesn't resolve), `code-actions.ts:27-55`, the generated `STDLIB_COMPLETIONS`.

## 5. The corpus

| Body | Count | Published? |
|---|---|---|
| `website/blog/samples/**/*.pathogen` | 299 files, 68 with a top-level fn (172 fns) | yes |
| `website/blog/*.md` fences | ~201, 154 tagged `pathogen` | yes |
| `docs/*.md` fences | ~728, ~655 untagged (mostly Pathogen) | yes |
| `playground/utils/examples.ts` | 10 templates + boilerplate | yes |
| `project-docs/**/*.pathogen` | 278 (57 with fns, 129 fns); 13 are render-snapshot fixtures | no |
| `packages/vscode-pathogen/test-fixtures/all-syntax.pathogen` | 1 (must compile clean) | no |
| Tests | ~180 files of inline programs | no |
| KV `WORKSPACES` (`workspace:`, `approval:`, queues) | 159 records on 2026-09-04 | user data |
| R2 snapshot code, `?state=` share links, files on users' disks | unknown | user data, partly unreachable |

**`const` / `import` / `export` as names:** none anywhere in the corpus or the Sep-4 KV backups.

**Built-in names declared today** (every hit breaks under decision 18):
- Blog samples, 25 declarations in 24 files: `let sign` ×12 (post55, post56), `let heading` ×7
  (post50, post53, post54, post57), `let line` ×3 (post38, post39), `let tan` ×2 (post7),
  `fn hash01` ×1 (post31).
- Docs and blog fences, 14: `docs/masks.md:50`, `docs/syntax.md:1545, 1760, 2060`,
  `docs/path-blocks.md:304, 479, 642, 808, 1474, 1485`, `docs/gradients.md:167`,
  `pathblock-parametric-sampling.md:45`, `pathblock-boolean-operations.md:96`,
  `cutting-room-garment.md:189`, `the-reliable-line.md:26`.
- Loop variables: `for (line in …)` ×6, `for (arc in …)` ×5 (`docs/path-queries.md:70`,
  post52, project-docs).
- Internal: 18 in project-docs (including the render snapshot `12-combined-defs.pathogen:4`,
  which breaks `render-snapshots.test.ts`), the VS Code fixture's `let heading` (`:294`),
  about 29 inline test programs, and pins that assert shadowing works
  (`tests/evaluator.test.ts:791-796, 4495-4512`, `tests/viewbox.test.ts:195-205`).
- Published promises it reverses: `website/blog/the-reliable-line.md:43, 58, 102` ("your
  function shadows the built-in, by design"); `docs/viewbox.md:89` (`let viewbox = 5;` is legal).
- KV backups (Sep 4): `let min` / `let max` in a loop in 22 workspaces that look copied from one
  font-specimen starter, `let map` in 1.
- No repo file both declares `heading`/`turn` as a variable and calls `heading()`/`turn()`.

**Dynamic scope:** no fn in the repo's `.pathogen` files reads a caller-local name, by grep.
That can't be settled by grep (silent cases, style values that swallow failed lookups), hence
the differential compile in the plan. Text that teaches dynamic scope: `docs/syntax.md:1973-1990`
(the `amt` example), `website/blog/lambdas-come-to-pathogen.md:83-84, 108-112` ("named `fn`s
stay dynamic … so it doesn't [change]"), `website/blog/easing-with-lambdas.md:156-158`,
`hover.ts:31`, `CHANGELOG.md:1595, 1604`.

## 6. Decisions (continuing the decision log's numbering)

| # | Decision | Date |
|---|---|---|
| 20 | **Built-in names stay an error** (decision 18 confirmed after seeing the breakage: "I definitely think this should be an error"), for **every binding**: let, const, fn, params, lambda params, loop variables, destructured names, case bindings; imports in phase 1 | 2026-10-26 |
| 21 | **Each new built-in gets a collision audit** (corpus + KV) in the new-stdlib checklist; a widely colliding name is renamed or its hits migrated; the CHANGELOG names newly reserved names | 2026-10-26 |
| 22 | **Saved workspaces are migrated by a codemod with backups**: a read-only production dry run first, the user's go-ahead before each production step; stored code is migrated before the code that rejects it is pushed | 2026-10-26 |
| 23 | **`ctx` tracks the pen of whatever is drawing**, inside `@{ }` too | 2026-10-26 |
| 24 | **Purity is enforced at the module boundary** (decision 8, freeze after load), not per fn: names are lexical, and within one file a fn may read and update top-level `let`s as in JS. The user's note: "Functions in modules should not rely on state defined or imported into the module. Exported functions should be as pure as possible." The transition is a clear error on a miss plus the audit, with no runtime warning | 2026-10-26 |

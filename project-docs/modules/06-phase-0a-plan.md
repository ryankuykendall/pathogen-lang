# Phase 0a: one evaluation per argument, the drawing context follows the call, lexical fns, `const`, built-in names

Approved by the user on 2026-10-26. The audit it builds on is `05-phase-0a-audit.md`.

## Context

Phase 0b (one font loader, fonts in VS Code) shipped 2026-10-26 (`356a1a1`…`cedd42e`). Phase 0a is
the language change the modules design depends on (`project-docs/modules/02-decision-log-v1.md`
§16.4, §17 #6, #7, #18): an imported fn must find its own file's helpers (lexical names) while
drawing with the caller's pen (the drawing context follows the call), and modules need `const`
and a clear rule for built-in names.

Today named fns are dynamically scoped (`docs/syntax.md:1973-1990`, pinned by
`tests/evaluator.test.ts:1543`), and drawing state rides on the scope chain: `createScope`
copies the parent's `evalState` (`src/evaluator/index.ts:1002`). So a lexical parent alone
would give a fn its definition's pen — the bug lambdas already have.

## Decisions (user, 2026-10-26)

| Question | Decision |
|---|---|
| Built-in names | **An error** ("I definitely think this should be an error"), for **every binding**: let, const, fn, params, lambda params, loop variables, destructured names, case bindings (imports in phase 1) |
| Future built-ins | **Audit each addition** (corpus + KV collision report in the new-stdlib checklist) |
| Saved workspaces | **Codemod with backups**; read-only prod dry run first, user go-ahead at each prod step |
| `ctx` in `@{ }` | **Tracks the block's pen** (`docs/debug.md:257` already says "the block's own cursor") |
| Purity / transition | **Freeze at the boundary**: lexical names; within a file fns may read and update top-level `let`s (JS); decision 8 freezes imported modules. Transition = a clear error on a miss + the audit; no runtime warning |

## Bugs found (confirmed by running the CLI)

| # | Program | Today | After |
|---|---|---|---|
| B1 | `let c = Cycler([10,20,30,40]); M 0 0 L c.pick() 0 L c.pick() 0` | `L 10 0 L 30 0`, pen at 20, 40 | `L 10 0 L 20 0` |
| B1 | `M 0 0` ⏎ `inc();` (fn that draws nothing) | runs twice (`n = 2`, `xs = [1, 1]`) | once |
| B1 | `L calc(random() * 100) 0` | writes `L 13.6`, pen at 83.9 | pen follows the bytes |
| B2 | `M 50 50`; lambda calling `polarLine(0deg, 10)` inside `@{ m 0 0 f(); }` | records `l 60 50` | `l 10 0` (as a named fn) |
| B2 | lambda reading `ctx.position.x` inside `@{ }` | the program's pen | the block's |
| B3 | `@{ m 5 0 log(ctx.position.x); }` | 0 | 5 |
| B3 | `M 10 10 let b = @{ m 5 0 }; log(ctx.position.x)` (inferred; pin with a test) | 5 (block pen leaks into root `ctx`) | 10 |

## Step 0 — save the audit (project-docs, no code)

`project-docs/modules/05-phase-0a-audit.md` (the bug table, explorer findings, corpus counts and
collision list, decisions 20–24) and this file. `02-decision-log-v1.md` stays untouched.

## Step 0.5 — the differential audit harness (tooling, used by every step)

`scripts/audit-semantics.ts` + `scripts/lib/semantics-audit/`:
- **Baseline:** `git archive` of `src` at the step's parent commit into `tmp/semantics-audit/<sha>/`,
  loaded with `import(pathToFileURL(…/src/index.ts))` (node_modules resolves upward; this worked
  for testing the phase 0b commits). New evaluator = working tree.
- **Corpus:** `website/blog/samples/**/*.pathogen`; docs/*.md and website/blog/*.md fences tagged
  `pathogen` or untagged — factor `markdownFences()` out of `scripts/lib/legacy-style-opener.ts:239-297`;
  `project-docs/**/*.pathogen`; `playground/utils/examples.ts`; `packages/vscode-pathogen/test-fixtures/`;
  KV records (dev; prod after go-ahead). Programs the old parser rejects are counted and skipped.
- **Determinism:** seeded `Math.random` (mulberry32 per program id) installed per compile; old
  evaluator run twice to drop flaky programs; fonts resolved once offline and shared.
- **Compare:** exact error, or layers/defs/viewBox/warnings/logs plus the `generateSvg()` string
  (style values swallow failed lookups at `index.ts:1826` and `css-function-resolve.ts:91`).
- **Buckets:** unchanged / expected / unexplained / error→ok / ok→error, with per-step tags
  (step 1: call-shaped path args; step 2: closure state ≠ caller state, `ctx` under a block;
  step 3: `__setScopeAudit` recorder — "missing lexically, found dynamically" and "bound in a
  different scope", null-check only when off; step 5: built-in bindings + codemod gate).

## Step 1 — fix(core): a path argument is evaluated once

- `evaluatePathArg` (`index.ts:8894`) → returns `{ text, num? }`; `evaluatePathCommand`
  (`:9468-9519`) evaluates once and takes `numericArgs` from `.num` (unrounded `n`, so every
  deterministic program stays bit-identical). Delete `getNumericArgs` (`:9011-9067`) and the
  second `withTrackedArgs` (`:9508-9510`). Arc rotation slots stay keyed by source index.
- Tests (fail first): `tests/context.test.ts` — Cycler output + `context.position` + trace;
  `vi.spyOn(Math, 'random')` called once and pen = bytes; arc rotation from a counting fn;
  `L xs[c.pick()] 0`. `tests/evaluator.test.ts` — side-effect fn after a path command runs once.
- Docs: none change (Cycler docs already describe correct behavior); CHANGELOG Fixed.
- Audit: unexplained diffs must be zero; expected diffs only in tagged programs.

## Step 2 — fix(core): the drawing context follows the call (lambdas, callbacks, `ctx`)

- **Scope:** `Scope` (`types.ts:1279`) gains `caller?: Scope`. New `callScope(lexical, caller)`:
  parent = `lexical ?? caller`, `evalState` = `caller.evalState`. Used at `:8725` (user fn/lambda
  call) and the callback sites `:1509, 5477, 5520, 5559, 6383, 6411, 6442, 6609`; subscription
  dispatch `:970` passes the root (no change).
- **`ctx` is computed, not bound:** delete the bindings (`:2534-2537`, `:11663`, `:11773`) and
  `updateCtxVariable` (`:9072-9094`) with its ~16 call sites. `lookupVariable` (`:1079`) resolves
  `ctx` after a chain miss via `ctxValueFor(origin.evalState)`: inside `@{ }` the block's context
  (no transform, so `ctx.transform` still errors there); inside `&{ }` delegate to the creating
  state via a `_ctxSource` flag (keeps the outer pen + transform and stops the transform cache
  being overwritten); otherwise the active PathLayer's transform, else `state.transformState`
  (docs/layers.md:705-724). `viewbox` keeps reading the root. User `ctx` bindings still win
  until step 5. Side benefit: no per-command `ctx` rebuild (O(n²) in large blocks today) —
  benchmark a 5k-command block.
- **Consequence (accepted for consistency with named fns):** lambdas and `<<` workers called
  inside `@{ }`/`&{ }` now obey block rules (`.draw()`, nested blocks, `.subscribe()`,
  `define ViewBox`, `layer()`). If the audit finds real programs hit, bring it to the user.
- Tests (fail first, `tests/context.test.ts`): the B2/B3 rows above; a lambda defined in `@{ }`
  and called later reads the caller's `ctx`; `Grid.forEach() << lambda` in `@{ }` lands in
  `b.commands`; `map/filter/reduce/sort << lambda` see the block pen. Regression pins
  (`tests/layers.test.ts`): fn and lambda inside `layer().apply` use the layer pen; `ctx.transform`
  in a lambda in apply changes the layer's transform; `&{ }` `ctx` = outer pen + transform;
  `ctx.transform` in `@{ }` still throws.
- Docs first: `docs/debug.md:257` (the cursor moves as the block draws), docs/syntax.md lambda
  section (names from where written, pen from where called). CHANGELOG Fixed.

## Step 3 — feat(core)!: named fns are lexical

- `FunctionDefinition` (`index.ts:10041-10048`) stores `closure: scope`; `UserFunction.closure`
  becomes required; comments at `types.ts:1233-1235`, `index.ts:8723, 8787` rewritten. Named
  `<<` workers and `subscribe() << namedFn` become lexical automatically.
- **Error hint on the miss path only** (`:1143` lookup, `:1167` assignment): walk `caller` links
  to emulate the old rule; if it would have resolved, append "— a function sees the variables
  where it is written, not where it is called. Pass it in: fn f(x, amt)". Fix
  `code-actions.ts:82` (`/^Undefined variable: (\w+)$/` → `\b`) so "did you mean" survives.
- Docs first: docs/syntax.md § Scoping (`:1973-2031`, the `amt` example) rewritten to teach
  "pass state in as a parameter" (the user's purity note), hover `fn` text
  (`hover.ts:31`), dated update notes on `website/blog/lambdas-come-to-pathogen.md` (`:83-84`,
  `:108-112` promised fn scoping wouldn't change) and `easing-with-lambdas.md:156-158`,
  `post37/01-center-spread.pathogen:21` comment. CHANGELOG Changed (breaking).
- Tests: `amt` example errors with the exact hint (`tests/errors.test.ts`); later top-level
  `let`; mutual recursion with a later fn; fn defined in a loop called after it; named `<<`
  worker reading a call-site local errors; `subscribe() << namedFn` lexical; assignment-miss
  hint; code-action still offered. Replace the pin at `tests/evaluator.test.ts:1543`.
- Audit: recorder hits + output diffs over the corpus; KV dry run counts step-3 breakages —
  any stored workspace that breaks goes to the user, and is handled before this is pushed.

## Step 4 — feat(core): `const`

- Grammar: `LetDeclaration { (kw<"let"> | kw<"const">) … }` (hard keyword; no corpus program
  uses `const` as a name — the KV dry run double-checks). Regenerate with
  `npx lezer-generator src/parser/pathogen.grammar --typeScript -o src/parser/pathogen.generated.ts`.
- AST: required `kind: 'let' | 'const'` (`ast.ts:97`, built at `ast-builder.ts:513`).
- Runtime: lazy per-scope `consts` set marked at `:9904-9923`, text-body `let` (`:9659`) and
  `bindDestructuringPattern`; `updateVariable` (`:1158`) rejects reassignment; redeclaring a
  const in the same scope is an error. Static check in `parse()` (sound once step 3 makes
  resolution lexical) gives positioned errors and editor diagnostics.
- Everywhere a keyword lives: tokenizer `KEYWORDS` + `STATEMENT_ONLY_KEYWORDS`
  (`path-args-tokenizer.ts:9-13, 46-48`), `parser/highlight.ts`, `src/highlight.ts`,
  `code-snippet.ts`, completions (`completion-data-static.ts:24-47`, 285), hover (`:19-59`),
  `rename.ts` `NON_RENAMEABLE`, `code-actions.ts` `RESERVED_IDENTIFIERS` + regexes `:322-340`,
  formatter prints `kind` (`formatter.ts:387-393`), semantic tokens `readonly`, `symbols.ts`
  Constant kind, TextMate, VS Code + playground snippets, `font-directives.ts:48-49` message,
  `playground/services/font-loader.ts:627` regex, the all-syntax fixture.
- Docs first: docs/syntax.md Variables (`:28-49`) and keyword lines; docs/path-blocks.md
  `@font` variable source (`:1519-1544`). Tests: keyword-registry, parser, formatter round-trip,
  reassignment/redeclaration errors (runtime + static), `@font` with a const, semantic tokens.

## Step 5 — feat(core)!: built-in names are a compile error

- `src/builtin-names.ts`: `BUILTIN_NAMES: ReadonlyMap<name, kind>` derived from `stdlib`,
  `contextAwareFunctions`, `EVALUATOR_CONSTRUCTORS`, `STATEMENT_BUILTINS`, `BUILTIN_ENUMS`, a
  namespace table that `lookupVariable` (`:1086-1109`) also consumes, plus `ctx`, `viewbox`
  (not `Infinity`/`NaN`). No import cycle (checked).
- Parser: extend `reserved-bindings.ts:40-45` (unit names keep their message), classify the
  binding form from the parent node, message e.g. `'min' is a built-in function and can't be
  used as a variable name — rename it, e.g. 'minValue'` (alias hint for destructuring). Enum
  members, object keys, member names, aliased keys, style properties stay allowed. Runtime
  backstop in `setVariable` (`:1146`).
- Language services: `findBuiltinBindings` so diagnostics list every offender; a rename quick
  fix. **Blockers to fix first:** `NON_RENAMEABLE` (`rename.ts:17-33`) refuses exactly these
  names — export an internal `renameDeclarationEdits` without that guard; renames match by line
  text (`findWordRangeOnLine` `:184-203`) — use reference positions and the Lezer node;
  `scope-analysis.ts:220` walks fn/lambda bodies where they are defined, so names declared later
  stay unresolved — defer body walks to the end of the enclosing scope. Derive
  `scope-analysis.ts:31-39`, `code-actions.ts` `ALL_KNOWN_NAMES` from the new module.
- Migration (repo): hand-picked descriptive names in the 24 blog samples (then `format:samples`,
  `compile:samples` — SVGs must be byte-identical — `validate:samples`), docs/blog fences, loop
  variables (`docs/path-queries.md:70`, post52, post57), the VS Code fixture, the render
  snapshot `12-combined-defs.pathogen:4`, inline tests; delete the shadowing pins
  (`evaluator.test.ts:791-796, 4495-4512`, `viewbox.test.ts:195-205`); `docs/viewbox.md:89`;
  dated note on `website/blog/the-reliable-line.md` (`:43, :58, :102`).
- Migration (stored): `scripts/migrate-builtin-names-kv.ts` modelled on
  `scripts/migrate-style-opener-kv.ts` (dry run default, `--confirm` for prod, `--backup-dir`
  required to write, concurrent-write check, hashes + `rev`). A rename is accepted only if the
  renamed source parses and its seeded output equals the original's under the old evaluator;
  otherwise it is reported for review. R2 snapshot code is reported, not rewritten.
  The ~22 near-identical `let min`/`let max` workspaces look forked from one source (a featured
  or explore `approval:` record, or a template): the dry run identifies it and it is migrated
  first, so new forks don't bring the old names back.
- **Order: migrate stored workspaces before pushing.** Pushing deploys the playground compiler,
  so: dry run → user go-ahead → `--write` with backups → then commit and push the code. (Safe:
  each rename is checked output-identical under the old evaluator.) The same order applies to
  step 4 if the dry run finds a stored `const` identifier, and to step 3 for any workspace the
  audit shows breaking.
- Checklists: add the collision audit (harness step-5 mode) to the new-stdlib rows in
  `.claude/CLAUDE.md` and `src/CLAUDE.md`. Docs first: docs/syntax.md naming rules list the
  built-in categories and the error. CHANGELOG Changed (breaking).

## Per-step process (every commit)

Docs first, through agentic content review — the user sees the reviewers' critique and synthesis
and approves the docs and blog notes before commit (docs/CLAUDE.md) → failing tests → implement →
`npm run build` → audit harness → playground + VS Code harnesses (`verify-playground-fonts.mjs`
style checks for the touched features; rebuild `.vsix`) → full suite → code review →
CHANGELOG → commit only on the user's go-ahead (stage session files only), push deploys docs.

## Verification

- Each step: its new tests fail before and pass after; full suite green; harness report with
  zero unexplained diffs (expected diffs listed in the commit message).
- Three surfaces: the same probe programs (B1–B3 rows, a lexical-fn program, a const program, a
  built-in-name error) through CLI, playground preview and VS Code preview.
- Production KV: dry-run report reviewed with the user before any write; backups verified.

## Follow-ups (recorded, not in 0a)

- The path-args tokenizer takes a call on the next line as an argument of the previous path
  command (`path-args-tokenizer.ts:17-31`): a fn returning a number there becomes a coordinate.
- Under `--to-fixed`, the lettered-command pen follows unrounded values while `draw()` follows
  the text.

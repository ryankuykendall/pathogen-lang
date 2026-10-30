# Phase 0a step 3 — named fns are lexical

Plan: `06-phase-0a-plan.md` §Step 3. Decisions 24 (purity at the module boundary; "a clear
error on a miss plus the audit, with no runtime warning") and 22 (stored workspaces are
checked and handled before a breaking change is pushed). 2026-10-30.

## Before / after

| | Before (dynamic) | After (lexical) |
|---|---|---|
| A named fn's free name | resolved in the **caller's** scope at call time | resolved where the fn is **written** (as lambdas already did) |
| `fn f() { return amt; }` called from `fn g() { let amt = 7; return f(); }`, top-level `amt = 1` | `g()` = 7 | `g()` = 1, silently |
| …with no top-level `amt` | 7 | error: `Undefined variable: amt — a function sees the variables where it is written, not where it is called. Pass it in: add amt to f's parameters, fn f(amt), and pass it where f is called` |
| A fn assigning to a caller's local | assigned it | `Cannot assign to count here — … Return the new value instead: count = reset();` |
| A named `<<` worker reading the applier's local | worked | error with the worker hint: write it as a lambda where the name is visible (a parameter would bind map's index) |
| A named fn returned from a factory, `fn make(k) { fn times(x) {…k…} return times; }` | `Undefined variable: k` when called | works |
| A caller's `let round = 9;` | hid `round()` from the functions it called | the built-in |
| Where a fn draws | caller's pen (step 2) | unchanged |

## Design

- `FunctionDefinition` stores `closure: scope` (by reference, so a later top-level `let`/`fn`
  is visible by call time) and `name`. `UserFunction.closure` is required.
- `callScope(lexical, caller, calledFn?)`. For a named fn's call (and a named-fn `<<`
  worker, and a subscription's named-fn callback) the call scope also records
  `dynamicParent` (the caller: the parent under the old rule) and `calledFn`
  (`{name, params, viaWorker}`). Lambdas get neither: they didn't change.
- `oldRuleBinding(origin, name)` walks the old chain: each scope's `dynamicParent` in place of
  its `parent`. It returns the binding the old rule would have used and the innermost
  named fn whose caller the walk went through.
- On a miss only (`lookupVariable`'s throw, `updateVariable`'s throw), `lexicalMissHint`
  appends the hint when the old rule would have found the name. Lookups that succeed pay
  nothing.
- `lookupVariable`'s built-in tail moved into `builtinValue()` (returns `undefined` instead of
  throwing), so the miss is decided once.
- The audit hook `__setScopeAudit(recorder)`, exported from `src/evaluator/index.ts` only.
  When set, every non-local lookup or assignment compares the two rules and reports
  `bound-elsewhere` (the silent case, including a built-in winning over a caller's
  variable), `only-where-written` (error→ok), or `only-where-called` (the hinted error). Off:
  one null check per lookup.
- `code-actions.ts`: `/^Undefined variable: (\w+)\b/` (was `$`-anchored), so "Did you mean"
  survives the hint.
- `hover.ts` `fn`: "A function sees the variables where it is written, not where it is called
  (lexical scope). Pass anything else in as a parameter. It draws with the caller's pen."

## Docs (written first) and reviews

- `docs/syntax.md` "Scoping: where a function finds its names" (old anchor kept via
  `<a id="syntax-scoping-functions-vs-lambdas">`), the Lambdas sentence, two dated editor's
  notes on the lambdas and easing posts, the post37 sample comment.
- Content review round 1: **revise**. Blocking: (1) the notes hid the silent case; (2) the
  worker hint suggested a parameter, which `map`'s `(item, index, array)` would fill with the
  index. Both fixed, plus eight wording/placement items. No compiler warning for the silent
  case, per decision 24; the audit lists every silent case in the repository instead.
- Round 2: **approve once N1–N3 are in**, all done:
  - N1–N2: the CHANGELOG example now states the top-level `amt`, and "behaves the same" names
    the silent-case exception.
  - N3: each error message sits under the program that causes it, with its fix.
  - N4: the worker example, its message, and both fixes; the subscription case.
  - N5: hover wording.
  - N6: "Most" removed from the blog note.
  - N7: `build:website` + `check-links`: 1,551 links, 0 broken. The blog's links to the old
    anchor resolve.
  - N8: the `ctx` link, the "(since changed; see the note below)" bullet, the CHANGELOG verb and
    the test header.
  - Its N4 also found that a lambda written directly after `<<` is an error ("An inline lambda
    after '<<' is not allowed"). The worker hint said "write it as a lambda", which led
    straight to that error. It now says "write it where k is visible, as a trailing block or a
    let-bound lambda", and a test pins all three forms.

## Style values (found before commit)

A failed lookup in a style value keeps the raw text (`index.ts` style-block catch;
`css-function-resolve.ts`), which is load-bearing for `rgb(...)`, `context-stroke` and the
like. Inside a named fn, a style value naming a caller's variable used to resolve; under the
lexical rule the lookup failed and the raw name went into the SVG with no error:

| Style value in `mk()`, variable in its caller | Before | Lexical, no fix | Fixed |
|---|---|---|---|
| `stroke: col` | `#f00` | `stroke="col"` | error |
| `stroke-width: w` | `3` | `"w"` | error |
| `filter: brightness(level)` | `brightness(0.5)` | the raw `brightness(level)` | error |
| `translate-x: dx` | `translate(5, 0)` | `translate(dx, 0)` | error |
| `stroke: ${col}` | `#0f0` | error (relative position) | error |

Fix: `src/evaluator/lexical-scope.ts` holds the hint sentence and `isLexicalScopeMiss()`. Both
fallbacks let a hinted miss through, and the evaluator rethrows it as
`Style value for "stroke": Undefined variable: col — …`, positioned at the value. Every
other failure keeps its raw-text fallback (pinned: `context-stroke` passes through, and a
value that resolves where the fn is written is unchanged). A sweep of every `catch` in
`src/evaluator/` found no other place that swallows a lookup. 9 tests and a surface probe
(`step3-probes/style-value-caller-local.pathogen`).

## Code review

Approve, with changes for items 1, 4 and 6 before commit (no blocking findings). Dispositions:

1. **Scope shape:** `dynamicParent`/`calledFn` were added after creation, giving call scopes
   another hidden class on the hot lookup path. Fixed: `createScope` declares both. Bench
   (`tmp/step3/bench.ts`, median of 7, HEAD vs step 3):

   | Program | HEAD | Step 3 |
   |---|---|---|
   | fib(20) | 18.6 ms | 16.0 ms |
   | Grid 80×80 map with a named worker | 3.6 ms | 3.8 ms |
   | 30k calls reading top-level names | 22.5 ms | 21.2 ms |
   | 20k calls, 3 deep | 32.7 ms | 30.9 ms |

   Lexical chains are shorter than caller chains.
2. **Attribution:** with the name several calls away, the hint named only the innermost fn.
   Done: the hint now adds "middle needs it as a parameter too, to pass it along" (all fns in
   between, de-duplicated, so recursion stays simple).
3. No change needed.
4. **Serialization:** a named fn now carries a cyclic closure. Checked (`tmp/step3/probe-serialize.ts`):
   a program storing a named fn in an array and an object, and logging them, gives the same
   results as with lambdas. `JSON.stringify(compile())`, `structuredClone(compileWithContext())`
   (the worker's postMessage) and `cli --json` all pass. Results carry formatted strings, not
   values.
5. **Memory:** accepted. A named fn now pins its definition scope, as a lambda always has. A
   named-fn call scope also pins its caller (`dynamicParent`) for as long as the call scope
   lives, which is the same lifetime the old rule had for its parent.
6. **Tests:** added path blocks (hint plus `ctx`/`viewbox`), recursion (lexical hit at depth,
   and a miss with a simple hint), Grid `fill() << cell` hint, the functions-in-between hint,
   the hover, and the docs' assignment and worker examples verbatim. 32 tests.
7–10. Nits; `builtinValue` judged behavior-identical; no bypassing lookup sites.

## Verification

- `tests/lexical-fns.test.ts`: 41 tests (style values included; the docs examples verbatim, every hint, the innermost-fn
  attribution and the functions in between, recursion, path blocks, the worker, Grid and
  subscription hints, both forms the worker hint suggests, "Did you mean", the hover, the
  plain messages for names that exist nowhere, lambdas never hinted, and each recorder event
  kind plus the off state). 8 of the first 15 failed before the change.
  `tests/evaluator.test.ts`'s dynamic-scope pin is now the lexical result.
- Full suite before the recorder was added: 180 files, 7,559 passed; nothing else in the suite
  depended on the old rule. Final run: see the commit message.
- Probes (`verify/step3-probes/`, `verify/semantics-audit-step3-probes.md`): 6 change as
  predicted, each with its recorder tag; the control is unchanged with no events.
- `verify/verify-step3-surfaces.ts`: 38/38 with the final code (8 probes on 4 surfaces, plus the
  editor checks). Engine, `dist/cli.js --json`,
  the playground bundle (`compileWithContext`) and the VS Code bundle (`compile`) give the same
  output or the same hinted error for every probe; the `fn` hover and "Did you mean" work from
  both bundles.
- `website/blog/samples/post37`: recompiled with step 3, SVGs byte-identical.

## Audit

- **Repository** (`verify/semantics-audit-step3.md`, baseline 2f7cead, against the final `src/`
  snapshot, tree 0de061c): 1,424 programs. 1,407 unchanged, 0 unexplained, 4 too-large (the
  boolean matrices, as in every run), 10 skipped. The recorder flags only this change's own new
  docs examples:
  - the `amt` example: `bound-elsewhere f.amt`, output unchanged since it draws nothing;
  - the factory: `only-where-written times.k`, error→ok;
  - the two `pathogen invalid` examples that show the new errors: `only-where-called
    reset.count` and `scale.k`, ok→error by design. The script exits 1 whenever ok→error is
    non-empty.

  **No blog sample, existing docs example or project-docs program relies on the old rule.**
  An earlier run against the pre-review snapshot gave the same result for every other program.
- **Stored workspaces, local dev store** (`scripts/export-workspace-sources.ts --env dev`, then
  `--probe-dir`): 406 records (380 workspaces, 18 approvals, 8 queue entries). 63 unchanged
  with no recorder events; 343 skipped because the current parser already rejects them (old
  local test data from before earlier syntax migrations). The tool works; the dev data says
  little.
- **Stored workspaces, production** (2026-10-30, the user's go-ahead per decision 22; read-only
  export, copies in gitignored `tmp/kv-sources/prod`, reports kept in `tmp/` because their
  ids are users' workspaces): 215 records (189 workspaces, 20 approvals, 6 review-queue
  entries), none empty or unreadable. Compared against 2f7cead, which is what production runs:
  - **205 compile today: all unchanged, and the recorder finds no name resolved differently**,
    so no silent case either. 46 of them were compared with trace off (over 20,000 commands).
  - **10 don't compile today**, all on a missing `;` (they predate mandatory semicolons). Local
    copies with `;` inserted where the parser asked: 7 then parse, including both that define
    named fns (3 fns), and all 7 are unchanged with no recorder events. The other 3 needed more
    than 200 insertions; none defines a named fn, so step 3 can't change them.
  - **Result: no stored program breaks or changes. Nothing to migrate before the push.**

## Follow-ups (not in this step)

- Editor navigation: go-to-definition on a name a fn uses that is declared after the fn
  returns nothing (hover finds it). Scope analysis walks a fn body where the fn is defined;
  this predates step 3 (`05-phase-0a-audit.md` §3).
- `website/blog/samples/post37/*` are not formatter-clean (the formatter rewrites 115 lines
  across the five files). Predates step 3; left alone here.

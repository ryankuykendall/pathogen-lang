# Phase 0a step 2: the drawing context follows the call

Plan: `06-phase-0a-plan.md` §Step 2. Taken by this session on 2026-10-29, at the user's request; the other session (step 1) handed it over. Code waits for step 1 to commit, because step 2 deletes `updateCtxVariable`, which is called inside `evaluatePathCommand` (step 1's function). Docs, tests and probes come first.

## Before and after (probed 2026-10-29 on the working tree, which already holds step 1)

`project-docs/modules/verify/step2-probes/` holds one program per row plus `stateless-control.pathogen`. Together they are the audit's positive control. `tests/ctx-follows-call.test.ts` pins every row: 14 tests fail today, 15 pass.

| Case | Today | After |
|---|---|---|
| `@{ m 5 0; log(ctx.position.x); }` | 0: ctx is bound once, at the block's start | 5 |
| `M 10 10`, `let b = @{ m 5 0 };`, then `log(ctx.position.x)` | 5: every command, the block's included, rewrites the program's ctx | 10 |
| A lambda that calls `polarLine(0deg, 10)`, called in `@{ }` after `M 50 50` (B2) | draws on the program's pen; `b.d` is empty, with an annotation-transfer warning | `b.d` = `l 10 0` |
| A named fn reading ctx in a block; a `for` or `if` body in a block; `ctx.start` in a block | 0 | the block's cursor |
| `ctx.heading` in a block after `l 5 0` | null | 0 |
| `map() {\|v\| ctx… }` in a block | [0] | [5] |
| A lambda written in a block, called after `M 70 0` | 0 | 70 |
| `g.forEach() << lambda` drawing `l 1 0` in a block | `m 0 0`: the commands are lost | `m 0 0 l 1 0 l 1 0` |
| `.draw()` in a lambda called in a block | empty block, warning | error, as for a named fn (the plan's "accepted consequence") |
| A lambda, or `map() << lambda`, reading ctx in a block | 5 / [5] | 5 / [5]. Right today only because of the leak; pinned |

**Unchanged (pinned):** ctx in `layer().apply` is the layer's pen, for fns, lambdas and callbacks alike. `ctx.transform` from a lambda in apply moves that layer. In `&{ }`, ctx is the outer pen and transform. `ctx.heading` is null after `M`. A saved `let c = ctx;` is a snapshot. A user binding named `ctx` wins until step 5. A subscription callback reads the program's final pen. `ctx.transform` in `@{ }` throws. `compileWithContext().context` is the program's pen after a block.

## Performance baseline (before step 2, `tmp/step2/bench.ts`)

| Program | trace off | trace on |
|---|---|---|
| 5k commands inside one `@{ }` | 308 ms | 256 ms |
| 5k top-level commands | 23 ms | 256 ms |
| 20k top-level commands | 80 ms | 5.1 s |
| 100k commands from nested loops | 92 ms | 538.8 s (`tmp/step2/bench-100k-traced.ts`; this is what `--json` costs, since it turns trace on) |

Blocks are slow even with trace off. A path block's context always tracks history (`createPathContext({ trackHistory: true })`), and `updateCtxVariable` → `contextToObject` copies that history after every command. A computed ctx copies only when ctx is read.

## Where the code is (2026-10-29 line numbers; re-grep after step 1 lands)

- `createScope` copies the parent's `evalState` (`index.ts:1019`).
- **ctx bindings to delete:** the block scope (`:2569`, `contextToObject(blockContext)`, no transform, which is why `ctx.transform` errors in blocks), and the root in `evaluate` and `evaluateWithContext` (`:11604`, `:11715`).
- **`updateCtxVariable` (`:8979`)** writes the ROOT scope's `ctx` from `scope.evalState` after each command. That write is the B3 leak. It has 17 call sites, one of them inside `evaluatePathCommand` (`:9424`).
- **Call and callback sites using `closure ?? scope`:**
  - the user fn and lambda call (`:8676`);
  - the variableOffset worker (`:1536`);
  - Grid fill/forEach/map (`:5512`, `:5555`, `:5594`);
  - map/filter/reduce/sort (`:6418`, `:6446`, `:6477`, `:6644`);
  - the subscription dispatch (`:987`), which keeps the subscribe-time closure and the root output;
  - `runCallbackBody` (`:9716`) and `runBuilderBlock` (`:9741`). The builder blocks use `createScope(scope)`, where lexical scope and caller are the same, so they probably need no change; a test pins it.
- **Text block state (`:2670`):** it shares the outer `pathContext` but gets a fresh `transformState`. A computed ctx there must read the creating state (the plan's `_ctxSource`), or `ctx.transform` inside `&{ }` would lose the outer transform.
- **Language services** know `ctx` by name (`scope-analysis.ts` BUILTIN_GLOBALS, completion data, rename, semantic tokens), not from the runtime binding, so removing the binding doesn't touch them. A completion and hover check is still on the list.

## Design (to implement after step 1)

1. **`callScope(lexical, caller)`:** parent = `lexical ?? caller`, `evalState` = `caller.evalState`. Use it at the fn/lambda call and at every callback site above.
2. **ctx is computed:** `lookupVariable` carries the scope where the lookup started (it recurses through `parent`, so by the root the original is gone). After a chain miss, `ctx` = `ctxValueFor(origin)`:
   - in a path block: the block's context, with no transform;
   - in a text block: the creating state's context and transform;
   - otherwise: the active PathLayer's context and transform, else `state.transformState`.
   `contextToObject`'s cache gives the snapshot behaviour: a read after any command builds a new object.
3. **Delete** `updateCtxVariable`, its call sites and the three bindings. A user `ctx` binding still wins, because the chain is checked first.
4. **Block rules for called code** (user decision): check `evalState._insidePathBlock` where each construct runs, not only in `evaluatePathBlockStatement`, which sees the block's own statements:
   - the PathCommand case of `evaluateStatementToAccum`, for an uppercase command;
   - the LayerDefinition case;
   - the LayerApplyBlock case.
   Reuse the block's messages. Watch for constructor builder blocks (Pattern, Marker…) written inside a path block, which run with the block's state; the audit will show whether any real program trips the new checks.

## Docs review (4 personas, 2026-10-29): revise → applied

| # | Finding | Disposition |
|---|---|---|
| 1 | **Blocking.** "the block's restrictions apply to it" claimed all six rules, but called code only hits four. | **The user chose (2026-10-29) to enforce all six in step 2.** In code called inside a block, an absolute command and `define PathLayer`/`TextLayer` become errors with the block's own messages, and `layer().apply` gets its block message instead of "Undefined layer". The docs now state the full rule: syntax.md, plus a sentence and an example under path-blocks.md "Restrictions". Each rule is pinned for a lambda and a named fn, along with the docs example `fn edge() { L 10 10 }`. |
| 2 | `let c = ctx;` uses a path-command letter; `b` likewise. | `saved`, `block`, `ticks`. |
| 3 | `.d` is relative, so `l 10 0` can't show where it was drawn. | Added `log(ctx.position.x); // 50 — the program's pen didn't move`. Today it reads 60, the lambda's drawing moving the program's pen. Output is quoted as debug.md does it. |
| 4 | The subscription aside lost "final". | "runs after the program finishes, so its `ctx` is the program's final pen", linked to "where the drawing goes". |
| 5 | "the program's pen again" is wrong inside `layer().apply`. | "the surrounding pen again". |
| 6 | `ctx` reads as a captured name. | "`ctx` is the one name a lambda doesn't capture." |
| 7 | "pen" vs "cursor". | "the block's own pen, its cursor"; the syntax.md `ctx` mention links Path Context. |
| 8 | `map() {…}` spelling; the drawing claim for callbacks was unverified. | `.map {|v| … }`. Verified: a `map` trailing block already draws into a block, while `map() << worker` loses its commands today; both pinned. Links "Applying workers". |
| 9 | Four claims in one paragraph. | A three-item list, with the subscription note after it. |
| 10 | Pointers. | syntax.md Path Context and path-blocks.md "Control Flow Inside Path Blocks" now point to debug.md "ctx Object". |

**The user approved the revised docs as step 2's spec on 2026-10-30.** They are committed with the code.

## Docs re-review (2026-10-30): approve once findings 1 and 3 land → all applied

| # | Finding | Disposition |
|---|---|---|
| 1 | **Must fix.** "everything that runs while the block is being built" and "an absolute command" read as forbidding stdlib shapes like `circle()`, which emit absolute commands. | path-blocks.md now says what is written in a called function's body is checked, and that stdlib shapes still work. syntax.md says "in its body" and "a stdlib shape such as `circle()` still works". Pinned: a `circle()` in a fn called inside a block still draws. |
| 2 | "is fine on its own" is vague and gives no fix. | "draws normally at the top level … fails with *Absolute path command 'L' …*; write it as `l 10 10` to use it in both places." |
| 3 | **Must fix.** "Applying workers below" points up; "written as its trailing block" is awkward. | "(see Applying workers under the `<<` operator)", "and for a trailing block such as `.map {\|v\| … }`". |
| 4 | Four of six rules named. | "For example, …". |
| 5 | Dangling modifier in the debug.md list; syntax.md lacked "elsewhere". | List items "Inside a path block: the block's cursor" and so on; syntax.md adds "elsewhere, the program's pen". |
| 6 | "`ctx` is read when you use it" is circular. | "`let saved = ctx;` is a snapshot …" plus a 5-line example, pinned. |
| 7 | `<<` is used before its paragraph. | Resolved by #3's link. |
| — | The CHANGELOG needs a Changed entry for the new errors in called code ("use lowercase"). | Planned for the commit. |

## Implementation (2026-10-30, after step 1 landed as `8ea2998`)

What the code does is described under "Design" above; all four parts were implemented as planned. Results:
- `tests/ctx-follows-call.test.ts`: 49 tests, all passing. 23 failed before the change; the code-review cases were added after.
- Full suite: 179 files, 7,531 passed, with no existing test changed.
- **Probes:** all 8 give the "after" values. The audit positive control (`verify/semantics-audit-step2-probes.md`) gives 7 expected, 1 unchanged.
- **Surfaces:** `verify/verify-step2-surfaces.ts` passes 35/35. Engine, CLI, playground bundle and VS Code bundle agree on every probe and give the same block-rule error.
- **Performance** (same machine, nothing else running):

| Program | Before | After |
|---|---|---|
| 5k commands inside one `@{ }`, trace off | 308 ms | 35 ms |
| 5k inside one `@{ }`, trace on | 256 ms | 25 ms |
| 20k top-level, trace on | 5.1 s | 0.17 s |
| 100k nested loops, trace on (`--json`) | 538.8 s | 0.3 s |
| 5k / 20k / 100k top-level, trace off | 23 / 80 / 92 ms | 22 / 78 / 89 ms |

## Semantics audit (2026-10-30, `verify/semantics-audit-step2.md`)

- **Baseline** `8ea2998` (step 1) vs the working tree. 1,410 programs, compiled with the same seeded random numbers and fonts.
- **1,394 unchanged.** 10 of those were compared with trace off (over 20,000 commands each), including 1.27M- and 1.03M-command programs.
- **2 expected, 0 unexplained, 0 ok→error.** The two expected are step 2's own new docs examples:
  - `docs/debug.md:283`: the block's ctx now reads 5, not 0;
  - `docs/syntax.md:2057`: the lambda no longer moves the program's pen.
- **No program in the repository hits the new block-rule errors.**
- **4 too-large:** the boolean-ops failure matrices, which the baseline itself can't compile in 240 s. Re-run with a 20-minute limit (`verify/semantics-audit-step2-matrices.md`), all seven matrix files: 6 unchanged (4 of them compared with trace off, 23k–131k commands; each took about 13.5 minutes for both compiles), and 1 still too-large. `failure-matrix.pathogen` (133,648 commands) gave no result in 20 minutes, so it is the one program the audit couldn't check.
- **10 skipped:** programs the baseline parser rejects.
- Positive control (`verify/semantics-audit-step2-probes.md`): 7 expected, 1 unchanged.
- The later batches ran with the widened step 2 tags (the batch processes re-read `tags.ts`). Since nothing came out unexplained, that made no difference.
- Full suite after the review's tests: 179 files, 7,538 passed.

## Code review (2026-10-30): request changes → resolved

| # | Finding | Disposition |
|---|---|---|
| 1 | A builder block (`Pattern(…) {|p| … }`) written inside a path block runs with the block's state, so an uppercase command in its body now errors; "a builder body is not a block body". | Checked on both evaluators. Before step 2, that builder's `M 0 0 L 5 5` **leaked into the block's own path** (`m 0 0 m 0 0 l 5 5`, with an annotation-transfer warning), so the error replaces a silent bug. Kept and pinned. A builder inside a block was barely usable anyway: its normal `append(@{ … })` already fails with "Cannot nest path blocks". `ctx` inside such a builder reads the block's cursor (pinned). |
| — | (Found while checking #1.) Uppercase commands in an `if`/`for` body inside a block were accepted before, because only the block's own lines were checked; now they are errors. | It's the documented rule ("all path commands must be lowercase") applied everywhere in the block. Pinned, and in the CHANGELOG. Reported to the user. |
| 2 | Pin a subscription created inside a block. | Not possible: `layer('a')` inside a block is "Undefined layer" (a block has no layers). The root subscription pin stays. |
| 3 | Audit tag gaps. | `call-in-path-block` now also counts fn and lambda parameters. Added `callable-defined-in-path-block` and `nested-uppercase-in-path-block`. Lambdas drawing on layers needed no tag: layers already shared the caller's state, which the probes confirm (unchanged before and after). |
| — | Missing tests. | Added: a nested lambda in a block, a `reduce() << worker` drawing in a block, `ctx` in a text block and in a builder inside a path block, and the uppercase rule in if/for/builder bodies. `let ctx` shadowing was already pinned. |
| — | `_transformState` is reassigned on the cached object on a cache hit, which can touch an earlier snapshot read under another transform. | Same behaviour as before step 2. A block's and the root's contexts are different objects, and a text block reads its creator's transform, so no two readers disagree. Left as is. |

## Follow-ups found while probing (not step 2)

- **A callback that draws inside a block warns "annotation transfer skipped".** `[1, 2].map {|v| l 1 0; … }` in `@{ }` draws correctly, but warns `1 recorded vs 3 tracked commands`. Workers applied with `<<` will do the same once step 2 makes them draw into the block. The step 2 tests filter warn mirrors; check after implementing whether the warning should go.

- ~~Path-block restrictions don't reach a called function fully.~~ Moved into step 2 by the user's decision; see the docs review, item 1.
- **`ctx.commands` is empty unless trace is on,** at the top level too. docs/debug.md calls it "Array of all executed commands".
- **The known tokenizer quirk bit a draft docs example:** `m 0 0` ⏎ `tick();` made `tick()` an argument of the `m`. The docs examples avoid it.

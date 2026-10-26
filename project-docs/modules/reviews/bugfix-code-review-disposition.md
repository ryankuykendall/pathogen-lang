# Code review of the block-state fix: dispositions (2026-10-23)

Reviewer: `code-reviewer` agent, on the uncommitted `fix(core)` work
(`sharedProgramState`, the `&{ }` statement delegation, `tests/block-state-sharing.test.ts`).
Verdict: approve with comments; nothing blocking. 0 critical, 5 warnings, 6 suggestions.

| # | Finding | Disposition |
|---|---|---|
| W1 | The two message rewordings ("font-loading error" → "message") belong with the font-loader commit, whose docs say "message" | **Adopted.** Staged with the phase 0b commit, not the fix |
| W2a | `dispatching` not shared: `sub.unsubscribe()` inside a block in a callback was ignored | **Fixed.** Shared in `sharedProgramState`; test compares the in-block call with the direct one |
| W2b | `.subscribe()` inside a block was silently dropped | **Fixed** as the reviewer suggested: an error at the call (`Cannot call .subscribe() inside a path block. Subscribe outside the block.` — first worded "Subscribe at the top level of the program", changed after the docs review: subscribing inside a loop is fine), like `.draw()` in a block. Documented in docs/subscriptions.md and docs/textblock.md |
| W2c | The helper's comment named only `viewBox` and `rootAccum` as unshared | **Fixed.** `BlockLocalField` lists every block-local field with its reason |
| W3 | Tests only used `compile()`; the playground calls `compileWithContext()` | **Fixed.** Font and strict tests run through both entry points (`describe.each`); added nested `@{ }` in `&{ }`, a named fn called from a block, a running total in a loop, the `let` shadowing case; the nested strict test is anchored to `Line 3, col 7` |
| W4 | `.draw()` on a right-hand side in `&{ }` advances the program's pen while its path is discarded | **Follow-up, pre-existing.** The text block aliases the parent's path context. Options: own context, or reject path-emitting calls in text blocks |
| W5 | Behaviour changes need a CHANGELOG line and a sample check (`--strict=non-finite` now reaches blocks) | **Adopted.** CHANGELOG entry under Fixed; the strict sample sweep is recorded in this folder |
| S1 | Make the next omitted field a compile error | **Adopted (without touching types.ts).** The helper's object `satisfies Partial<EvaluationState> & Record<Exclude<keyof EvaluationState, BlockLocalField>, unknown>`; removing `dispatching` was checked to fail with TS1360 naming the field. Making `missingGlyphs`/`fontCoverageRequests` required is left for a later commit |
| S2 | Build the root state in one factory (`evaluate` and `evaluateWithContext` copy ~20 fields) | **Follow-up** |
| S3 | Delegate `let`, `fn` and expression statements in `&{ }` too; `let r = blk.draw()` bound the wrong value | **Fixed.** Every statement without a text-block meaning now runs through `evaluateStatementToAccum`, so nothing falls off the end silently (that includes `return`, now the same as in `@{ }`) |
| S4 | The Font coverage cache is keyed per state, so `Font.*` in many blocks rescans the cmap | **Follow-up** (perf; this path used to throw) |
| S5 | Prettier, import order, stale test header | **Fixed** |
| S6 | Repro comment line numbers; docs/textblock.md omits assignments | **Fixed** |

Out of scope, recorded for later (all pre-existing):

- A `return` at the top level of a program prints `Error: undefined` (a `ReturnSignal` escapes `compile()`). It should be a positioned error, like `'break' is only valid inside a for loop`.
- `let l = layer('a'); l.subscribe('endpoint') {|m| … };` fails with "subscribe() requires a trailing block or a << worker", although docs/subscriptions.md says layer variables work. `layer('a').subscribe(…) {…}` and `<<` both work.
- Closures created in a block keep the block's synthetic state, so a lambda made in `@{ }` and called later sees an empty layer table.

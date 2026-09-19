# Code review — range values (2026-09-18)

`code-reviewer` agent, read-only, working tree vs HEAD. Every finding came with
a repro it had run. Verified clean by the reviewer: every docs example against
the CLI; the map/filter/reduce fast path against the pre-diff per-statement
version (no-return → null, nested return, filter verdict, `loopFlowBoundaryError`
still wrapped, lock/unlock in `finally`); and the grammar — `RangeExpression`
can only match text that was a parse error before.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | BUG | `case (100..)` / `case (..5)` got "open-ended ranges only work as case patterns" — advice to do what the user already did — and the docs claimed "parentheses change nothing here" without qualification | **Fixed.** `describeBareRange` → `missingBoundMessage`: when the parenthesized group IS the case pattern (parent `CasePattern`) the message is `An open-ended case range takes no parentheses — write case 100..`; nested groups (`case pick((1..))`) keep the both-bounds message. Docs now say "parentheses around a two-ended range". Tests: `tests/range-values.test.ts`, `tests/language-services/diagnostics.test.ts`. Shapes recorded in `probes/error-shapes.ts`. |
| 2 | WARNING | The playground's new early return on `)` / `]` receivers left `points[0].` with NO completions (shared engine had no `IndexExpression` receiver branch; before, the legacy source's noisy dump at least showed something) | **Fixed at the root.** `member-resolution.ts` `resolveBracketedReceiver`: `points[0].` → members of the array's element type (new optional `resolveElementType` resolver, injected by completion + hover from `inferExprElementType`); `[1, 2].` → array members; nested indexes and call results stay unresolved rather than guessed. Tests: `getCompletions: bracketed receivers`, `getHoverInfo: bracketed receivers`. |
| 3 | WARNING | `..` inside a `//` comment within the parentheses faked a range receiver: `(x + 1 // a..b\n).` offered array members | **Fixed.** Only the current line is examined — a `//` comment cannot precede the cursor on its own line, so comment text is never scanned. This also bounds the scan to the line instead of the document prefix. Test added. |
| 4 | NIT | `RANGE_IN_PATH_ARGS` said "wrap the expression in calc(…)", but `calc((1..3))` is still an array | **Fixed.** Message names a reducing form: `calc((1..3).last)`. Test asserts the suggested fix compiles and that bare `calc((1..3))` does not. |
| 5 | NIT | The guard also fires on `L 1..3 5` (two numbers with no space — previously the same silent miscompile); the range-centric message was a non-sequitur there | **Fixed.** Message adds "If these are two numbers, put a space between them". Test added. |

# Code review — reserved-name position + all-syntax fixture (2026-09-19)

`code-reviewer` agent, read-only, scoped to: `src/parser/reserved-bindings.ts`,
the `parse()` scan change, one positioned throw in `getNumericArgs`, the new
tests, the rewritten fixture, and two doc lines. It ran the tests (652 passed)
and ~20 ad hoc CLI probes.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | BUG (message priority) | `parse()` threw the reserved-name error BEFORE `buildAST()` ran, so any AST-builder error was masked whenever a reserved binding existed anywhere — `break;\nlet rad = 1;` reported line 2 instead of the `break` on line 1, and `case [deg, 2]` lost its real message ("Array patterns in a case bind names only"). Not a correctness bug: no valid program rejected, no invalid one accepted — the wrong one of two true errors surfaced. | **Fixed, in both directions.** `buildAST` runs first inside try/catch; the builder error wins unless the reserved binding is EARLIER in the document (`parseErrorOffset` reads `line L, column C` from the message; an unpositioned builder error always wins). Four tests in `tests/errors.test.ts`. |
| 2 | NIT | The fixture test's keyword list came from `kw<"…">` only, so `with` / `as` (defined with `@extend`) were never checked by the keyword sub-test. Not a coverage hole — the node-type test derives from `lezerParser.nodeSet` and covers them — but the sub-test overstated what it iterated. | **Fixed.** Extraction also reads `@extend[@name=X]<Identifier, "X">` where name === word; the path-command letters (node name `PathCommandLetter`) are excluded, and the sanity test asserts both. |
| 3 | WARNING (found on re-review of fix #1) | `parseErrorOffset` required `line L, column C`, but five older builder errors (with/as on an assignment, bad corner-op kind, bad label kind / argument count) read `Parse error at line L: …` with no column. They were treated as unpositioned and always won — `let rad = 2;` on line 1 lost to a with/as error on line 3. | **Fixed.** The regex takes an optional column (absent → start of that line) and is anchored to `^Parse error at line`; only a message with no line at all is unpositioned. Test: "orders against builder errors that carry a line but no column" (asserts the column-less shape first, so it cannot pass vacuously if those messages change). Reviewer also confirmed: CRLF input and tabs do not skew the offset; on the same line the builder error wins, sensibly; the rethrow does not change the error object `getDiagnostics` reads. |

Verified clean by the reviewer: every grammar binding site funnels through
`VariableName`, `ObjectDestructureProp` or `CasePattern` (including the text-body
loop and case forms, and the second pattern of a multi-pattern arm); no false
positives (enum members, keys with legal aliases, member access, call position,
unit suffixes, strings, style values, query selectors, parenthesized
`case ([a, b])`); genuine Lezer errors still win; `??=` stops the scan cost after
the first hit and `cursor.node` is materialized for three node kinds only; the
`LineComment` exception's reason is true; every claim in the docs sentence holds.

# Phase 0a step 1: code review

2026-10-30. The change: `src/evaluator/index.ts` (17 hunks, 119 changed lines) and
`tests/context.test.ts` (5 tests).

Two code-reviewer subagents (launched 2026-10-27 and 2026-10-29) stalled before reporting,
most likely on permission prompts nobody saw. Both were stopped, and the main session
reviewed the diff itself.

## What was checked

For each argument kind, the number the pen moves by under the new code is compared with
what the deleted `getNumericArgs` used to compute:

| Argument | Before (second evaluation) | After (`num` from the one evaluation) |
|---|---|---|
| Number literal (unit, arc-rotation degrees slot) | converted value | same value |
| Boolean literal | 1 / 0 | same |
| Identifier: number | `pathArgToNumber` of the value | `pathArgNumber(n)`, same `n` |
| Identifier: PathSegment | nothing pushed | no `num` |
| calc / member / index / method / function call: number | `pathArgToNumber` of a re-evaluation | the same conversion, from the first evaluation |
| Call that returns nothing | nothing pushed | no `num` |
| PathSegment / PathWithResult | nothing pushed | no `num` (the path text still goes out) |

Other points checked:

- **Arc rotation slots** are still keyed by source index (`isArcRotationSlot(cmd.command, i)`),
  so an argument that yields no number can't shift the 7-slot arc cadence.
- **The statement form** (a call on its own line, `cmd.command === ''`) never called
  `getNumericArgs`. It only changes from a `string[]` to `.text`.
- **The pen while arguments run:** the context updates after all arguments are evaluated, as
  before, so context-aware calls inside an argument see the pre-command pen, the same as the
  old first evaluation.
- **Tracked drawing from arguments:** the old second evaluation ran inside a `withTrackedArgs`
  wrapper to throw its drawing away. With no second evaluation, that wrapper is gone and
  nothing is drawn twice.
- **Non-finite warnings:** `pathArgNumber` warns once per argument evaluation, and
  `getNumericArgs` never warned, so the count is unchanged (one).
  `tests/non-finite-warnings.test.ts:36-48` pins exactly one warning for every argument kind.

## Result

No defects found. The test coverage for the change is the five tests in
`tests/context.test.ts` (method call, calc wrapping a function call, a function call in the
degrees slot, an index with a method call, a void call on the next line) plus the existing
non-finite warning tests.

Evidence: `verify/semantics-audit-step1.md` (baseline `6e544e9`: 1,386 unchanged, 0 different),
`verify/semantics-audit-step1-probes.md` (6 expected, 1 unchanged), `verify-step1-surfaces.ts`
(28/28), and the commit tree's full suite (177 files, 7,479 tests).

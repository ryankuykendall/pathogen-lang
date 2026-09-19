# Code review — disposition

_2026-09-19. `code-reviewer` agent, read-only, over the uncommitted diff: the
path-emit guard (piece 1) and strict `mapSlice` (piece 2). Asked specifically to
hunt for false positives and false negatives. Every finding was reproduced
before it was acted on._

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | **Critical** | Context-aware functions have no arity check: a *missing* argument is not in the argument list, so the null check cannot see it. `polarLine(0.5)` → `L NaN NaN`, `tangentArc(20)` → `A 20 20 0 0 0 NaN NaN`. The emit backstop existed only on the plain-stdlib branch, while the module claimed both chokepoints. | **Reproduced (6 cases, incl. `polarPoint` and `arcFromCenter`) and fixed.** The branch now inspects what the call produced — `PathSegment.value`, `PathWithResult.path`, `ContextObject` coordinates, and the heading (`turn()` emits nothing) — by shape, not by name, and reports the received-argument count. |
| 1a | — | Reviewer's fix direction: derive arity from the declarations in `pathogen-api.ts` / generated signature data, and check *before* dispatch because the functions mutate the pen context first. | **Declined, with reasons.** The generated `SIGNATURE_DATA` does not mark optional parameters (it omits `polarMove`'s third), so it is not a required-arity source; and the evaluator has no precedent for importing from language-services. Post-dispatch is safe: the grammar has no `try`/`catch`, so a throw always ends the compile and a moved pen is never observed. |
| 2 | Warning | The tests had the same hole: nothing exercised a context-aware function with a missing argument, and no test proved a *valid* context-aware call was still byte-identical. | **Adopted.** Derived too-few-arguments matrix over `contextAwareFunctions` asserting the contract (stops the compile, or emits nothing non-numeric); four exact-output valid-call tests. |
| 2a | — | (found while adopting 2) My first matrix used `let got = polarLine(…)`, which captures the segment as a value and emits nothing — it passed with the leak open. | **Fixed.** Calls are statements; an explicit test asserts the template emits with valid arguments; a per-case dump confirmed 16 of 20 cases throw with the guard's own messages and the other 4 are genuinely complete calls. |
| 3 | Warning | No test drives an `AngleValue` through the guard. Reviewer verified there is no false positive today (the unwrap happens after the guard looks), but nothing pins it. | **Adopted.** `radialWedge(…, 45deg, 90deg, …)` compiles clean; `polarLine(90deg, 10)` equals `polarLine(0.5pi, 10)`. |
| 4 | Warning | `mapSlice` callers under `website/blog/samples/` and `playground/` were outside the reviewer's allowed search scope. | **Checked.** No tracked `.pathogen` under `website/blog/samples`, `docs`, `project-docs`, `packages` or `playground` calls `mapSlice`. |
| 5 | Suggestion | `parseMapSliceOptions` uses `isObjectValue()` while its model `parseOffsetJoinOptions` inlines the check; retrofit the older one. | **Not done** — a pre-existing function outside this change. Report was truncated here; remainder requested. |

## Found while acting on the review, beyond its scope

**ISSUE-023 — raw path arguments accept NaN / Infinity (`M NaN 0`).** The
`polarPoint` reproduction showed the class was wider than finding 1. A fix (six
call sites in `evaluatePathArg`) was written, then **reverted**: it collided with
five tests that pin those outputs as their way of observing a math function's
documented degenerate value, and making the argument fatal turns "one broken
path" into "no image" for generative programs. That is a policy decision and
was not the reviewer's finding nor in the approved plan. `evaluatePathArg` was
verified byte-identical to `HEAD` after the revert. Options and a recommendation
are in `project-docs/known-issues.md`.

# Code review synthesis — array .first/.last/.filter (2026-08-06)

Reviewer: `code-reviewer` agent (read-only), pre-commit. **Verdict: approve — 0 critical, 1 warning, 3 suggestions.**

## Warning (fixed before commit)

- The annotated test suite had no `<<` worker case for filter — the worker dispatch path was verified by hand but untested under `compileAnnotated`. **Fixed**: added `filter() << worker matches the trailing-block form` parity test.

## Suggestions

1. **Mutation during iteration (shared with `.map`)**: filter/map re-read `obj.elements.length` per iteration, so a callback pushing to the iterated array visits (and can keep) appended elements — confirmed empirically; JS snapshots the length instead. Pre-existing `.map` behavior; fixing filter alone would create divergence. → became the follow-up iteration-lock change (PLAN-iteration-lock.md).
2. **`.first` on `[null, 1]` returns `null`** — indistinguishable from the empty case; same overload as `.pop()`/`.shift()`. **Addressed**: docs note added recommending `.length` when the distinction matters.
3. **CHANGELOG entry pending** — added at commit time.

## Verified clean

- Truthiness check byte-identical to IfStatement logic in both evaluators.
- Main/annotated parity: structure, param binding, extraArgs guard, error strings mirror `map` exactly (including map's existing wrap-vs-rethrow asymmetry — consistent, not new).
- Loop-control boundary: `break`/`continue` in callback bodies already rejected at parse time; main-evaluator runtime guard is defensive-only, annotated's omission matches annotated `map`.
- No VS Code hand-edits needed (no array-method enumeration exists there; LSP consumes generated data).
- `tsc --noEmit` delta: zero new errors (98 pre-existing unrelated).

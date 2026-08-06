# Review syntheses — iteration lock (2026-08-06)

Follow-up to the `.first`/`.last`/`.filter` feature: arrays become read-only while being iterated (counter lock in `src/evaluator/iteration-lock.ts`).

## Code review (code-reviewer agent) — approve with suggestions

Verified directly (not from claims): all 14 lock sites pair lockArray/unlockArray in try/finally wrapping the whole loop (no leak path incl. break/continue LoopFlow codes and thrown callback errors); all 11 mutation sites guarded and no others exist (`splice`/`fill` aren't in the language; stdlib `asArray()` reads only); `mapSlice`/`slice`/`reverse`/bare-`sort` correctly unlocked (no user callbacks); Grid is a separate GridValue type, correctly out of scope; identical error strings with line/col across all three IndexedAssignmentStatement handlers; `iterationLock` cannot leak into log()/display output. Reviewer re-ran targeted (976) and full (4657) suites independently.

Suggestions, both applied:
1. `unlockArray` clamped with `Math.max(0, ...)` so a hypothetical unpaired unlock can't drive the counter negative and silently disable the guard for a future call site.
2. Import ordering fixed in annotated.ts (alphabetical there; index.ts has no ordering convention). The 3 cosmetic prettier collapses were skipped deliberately — surrounding code shares the style and `eslint --fix` is flagged unsafe in project memory.

## Content review (4-persona) — approve with revisions, all applied

Key correction: the For-Each worklist sentence promised `slice(0)` "grows a work list while walking it" — false; a snapshot loop never visits appended elements. Reworded honestly in both places plus a comment in the example making the three-iterations behavior visible.

Also applied: value-scoped lock explanation (lock belongs to the array, not the syntax — explains nested legality, helper-`fn` throws, `<<` workers equally locked); full error strings quoted verbatim (searchability); `#### Iteration Lock` sub-heading added (parent anchor kept — five links point at it); mutating-methods cross-reference under `### Methods`; docs/objects.md updated (element-assignment restriction where `arr[i] = x` is actually taught, and the array/object asymmetry note — object for-each is NOT locked); JS contrast made mechanism-specific (map/filter length-capture vs for...of skip/revisit); pathogen-api.ts push/pop/shift/unshift details mention the throw (hover + completions surfaces).

Verified not broken by the new rule: docs/textblock.md's accumulate-into-`placed` example (push is outside the inner loop — the canonical legal shape) and docs/objects.md's push-to-different-array example.

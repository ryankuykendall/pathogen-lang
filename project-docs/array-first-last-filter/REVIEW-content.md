# Content review synthesis — docs/syntax.md delta for .first/.last/.filter (2026-08-06)

Reviewer: `content-reviewer` agent (4-persona: UXD, UXE, PM, ID). **Verdict: approve with required revisions — all applied before commit.**

Core insight: the new sections themselves were accurate and stylistically native; the blocking defects were three *unchanged* passages the delta silently contradicted.

## Must fix (all applied)

1. `<<` worker rule said "**eight** callback builtins" and omitted `.filter` — corrected to nine + `.filter` added to the array group (two locations: the Applying-workers rule and its restatement near the Grid example).
2. `## Null` intro listed only `pop()`/`shift()` as null-on-empty sources — now also names `.first`/`.last` (it is the landing text for the delta's own links).
3. Filter's truthiness pointer led to a section that lacked the rules — rules now stated inline (`null`/`0`/`false` falsy; non-zero numbers, `true`, non-empty strings truthy) with links to both Null and Booleans.

## Should improve (all applied)

4. `.first`/`.last` now lead with the real motivation — safe alternative to `list[0]` / `list[list.length - 1]`, which throw on empty — before the `.shift()`/`.pop()` contrast.
5. Null-ambiguity callout made visible from both `.first` and `.last` (was orphaned under `.last` only).
6. `.filter` got a one-sentence "why" in `.sort()`'s voice (points-in-region, whitespace glyphs, size-threshold culling).
7. Example idiom drift fixed: `calc(i % 2) == 0` and `return true` — both re-verified against the evaluator before editing.

## Noted, deferred (pre-existing page issues, not this delta)

- Line ~1356 "comparison results are numeric" contradicts the Booleans section — separate sweep.
- Callback path-command-discard statement exists only under `.sort`; a shared statement for all callback blocks would help — candidate for the iteration-lock docs pass.
- No `<mini-workspace>` embeds anywhere in syntax.md (page-wide, not delta).

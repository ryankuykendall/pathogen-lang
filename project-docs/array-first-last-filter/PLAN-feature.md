# Array `.first` / `.last` properties + `.filter()` method — implementation plan (as executed, 2026-08-06)

## Context

Pathogen arrays exposed `.length`, mutators (`push/pop/shift/unshift`), and copy-returning methods (`slice/map/mapSlice/reverse/sort/reduce`), but no way to grab the first/last element without index arithmetic and no predicate-based filtering. This added:

- `.first` / `.last` — properties returning the first/last element, or `null` when the array is empty (same precedent as `pop()`/`shift()`).
- `.filter() {|item, index, arrayRef| ...}` — new array of elements whose callback returns truthy, JS `Array.filter` semantics, plus the `<<` worker form (`arr.filter() << pred`).

No grammar changes were needed — method-call-with-trailing-block parses generically; `filter` previously hit the evaluator's "Unknown array method" throw.

## Design decisions

- **Properties as inline branches** in each evaluator's `isArrayValue` member-access branch (matching `.length`), **not** a `struct-properties.ts` descriptor — a descriptor would silently enable `let { first, last } = arr;` destructuring and change error messages.
- **`.filter` follows the `.map` template** (per-element discard sink, positional/defensive param binding, `Error in .filter() callback at index N` wrapping). Predicate truthiness copied verbatim from the IfStatement check: `v !== null && (toNumber(v) !== undefined ? toNumber(v) !== 0 : Boolean(v))`. No `return` → `null` → falsy → dropped.
- **Known inherited behavior, unchanged in this change**: callbacks that mutate the array being iterated visit appended elements (loop re-reads live length; same as `.map`). Follow-up: iteration lock (see PLAN-iteration-lock.md).

## Steps as executed

1. **Docs first** — `docs/syntax.md`: `.first`/`.last` sections after `.length`; `.filter` section after `.map`; mutate-vs-copy note updated. `build:docs` + `check-links`.
2. **API surface** — `pathogen-api.ts` `PathogenArray`: `first`/`last: T | null`, `filter(): PathogenArray<T>` with `@snippet`; `generate:completions`.
3. **Pre-dispatch** — `'filter'` added to `CALLBACK_METHODS` (receiver-agnostic set).
4. **Evaluators** — `case 'filter'` in both array method switches; `first`/`last` in both array property branches.
5. **Language services** — `type-inference-ast.ts` (block-param arm + `<<` return arm), `inlay-hints.ts` (both arms). Legacy `type-inference.ts` skipped per its do-not-extend rule.
6. **Tests** — evaluator, annotated parity, errors, lambdas, completions (the phantom-methods test asserting `filter` absent was updated).
7. **Verification** — full suite (4634), CLI plain + `--annotated`, built bundle, playground via `scripts/debug-array-first-last-filter.ts` (puppeteer), `check:completions`.
8. **Reviews** — code-reviewer (approve; fixes applied: annotated `<<` test, null-ambiguity docs note) and 4-persona content review (approve with required revisions; all applied — see REVIEW-content.md).

## Gotchas hit during implementation

- Single-letter variable `a` in path-arg position parses as the SVG arc command — test programs must use multi-letter names (`M a.length` fails to parse).
- The dev server serves staged bundle copies from `public/dist/` — refresh by copying the four lib artifacts, never via a plain `build:website` while dev:stack runs (PATHOGEN_API_BASE trap).

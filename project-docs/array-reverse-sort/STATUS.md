# Array `.reverse()` and `.sort()` — STATUS

**Shipped: 2026-07-29.** Both methods return new arrays (non-mutating). Bare
`.sort()` = natural ascending (numbers numerically, strings by character-code
order); mixed/unsortable element types and `NaN` elements are errors. Trailing
comparator block `{|a, b| return calc(a - b); }` uses JS semantics (negative →
`a` first, positive → `b` first, zero → keep order), is stable, and rejects
non-number / `NaN` returns with a message suggesting `calc(a - b)`.

## Where things live

- Evaluators: `src/evaluator/index.ts` (comparator uses the
  `evaluateGridCellBody` top-level-return fast path + one hoisted PathStore
  sink — NOT `.map()`'s per-element throw/catch) and `src/evaluator/annotated.ts`
  (new local `evaluateBlockBodyPlain` helper mirrors the fast path). Error
  messages are byte-identical across both modes.
- Language services: `src/pathogen-api.ts` (PathogenArray), `sort` branch in
  `type-inference-ast.ts` `inferBlockParam` (both comparator params infer the
  element type), receiver-aware `reverse` in `inlay-hints.ts` (Array-literal
  receivers → `Array`, unknown/PathBlock receivers keep `PathBlock`).
- Docs: `docs/syntax.md` → Arrays → Methods. Shaped by content review:
  character-code (not "alphabetical") ordering with an `["apple", "Banana"]`
  example, verbatim error messages, three-way-outcome explanation for the
  `return a < b;` boolean footgun, JS-divergence note bridging into
  Reference Semantics.
- Tests: `tests/evaluator.test.ts`, `tests/errors.test.ts`,
  `tests/annotated.test.ts` (first array-method coverage in annotated),
  `tests/language-services/{completion,inlay-hints,hover}.test.ts`.

## Deferred follow-ups (pre-existing issues surfaced by review, NOT introduced here)

1. **`ctx` leak from discard-sink callbacks.** Path commands inside a
   `Grid.fill` / `Grid.map` / array `.map` / `.sort` comparator body are
   correctly discarded from path *output* (throwaway PathStore sink), but
   `evalState.pathContext` is shared state — so `M 5 5` inside a comparator
   moves `ctx.position` for code *after* the call. Verified identical in both
   evaluators and on pre-change `main` (Grid.fill/map/array-map all leak).
   Fix direction: save/restore `pathContext` around every discard-sink
   callback body, applied uniformly. The docs currently mitigate with
   "any path commands it emits are discarded — a comparator is for ordering
   only" (`docs/syntax.md`).

2. **Path-command hover shadows single-letter variables.** Hovering a
   variable/block-param named `a`, `s`, `m`, etc. shows the path-command hover
   ("Arc (relative)") instead of `block parameter: Point` — path-command hover
   wins over scope analysis regardless of context. Hit while writing the hover
   matrix tests (they use `pa`/`pb` to sidestep it; see the comment in
   `tests/language-services/hover.test.ts`). The canonical docs comparator
   example uses `{|a, b|` (idiomatic), so users will see this. Fix direction:
   in `hover.ts`, prefer a scope-analysis declaration match before falling
   back to path-command hover for single-letter identifiers outside path-arg
   position.

3. **Scope-less inlay-hint inference misses named-array receivers.**
   `let arr = [1, 2, 3]; let r = arr.reverse();` still hints `: PathBlock`
   because `inferExprType` in `inlay-hints.ts` has no scope access (Identifier
   receivers infer null → historical PathBlock fallback; same limitation
   `slice` has always had). Proper fix threads scope/declaration info into the
   inlay-hints inference — bigger than this feature's scope.

## Review trail

- code-reviewer: approve with follow-ups. Its one actionable finding (bare
  `.sort()` silently accepted `NaN` elements → arbitrary order) was fixed
  in-session with tests in both modes.
- content-reviewer (4-persona): all four must-fixes applied to
  `docs/syntax.md` (M1 character-code ordering + revealing example,
  M2 verbatim type-gate error, M3 boolean-note rewrite + relocation,
  M4 JS-divergence note + Reference Semantics bridge), plus S1–S3, S5, S6.

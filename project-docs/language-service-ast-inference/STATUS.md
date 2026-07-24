# Language-Service AST Inference — STATUS

**Date:** 2026-07-24
**Trigger:** User report — hovering the variableOffset workspace program gave
"loop variable" instead of PathBlock/number, and no tooltips at all on
`glyph.contours`, `.variableOffset`, or the `{|vo, cpb|}` block params.

## Investigation findings

The ts-morph metadata pipeline (`pathogen-api.ts` → `completion-extract.ts` →
`completion-data.generated.ts`) was present and working. The failures were in
the consumers plus one missing registration:

- **Hover had no member-access path at all** — flat word lookup only; it never
  read `TYPE_MEMBERS`. No method/property on any type had hover.
- **Array element types were flattened** — `fromGlyph(): PathogenArray<PathogenPathBlock>`
  stored as bare `'array'`; element type unrecoverable.
- **No rule for the `[element, index]` index binding.**
- **The variableOffset builder (`vo`) was never registered** — the method got
  completions (commit `48078e0`) but the handle type had no `@type` interface,
  and block-param inference had no method-trailing-block rule. Process gap:
  neither checklist covered builder-handle types.
- **Generalized (user counter-example `let [num, pb, sb] = [5, @{}, ${}];`):**
  no array-destructure rule, no number/boolean/StyleBlock literal rules, and
  declaration-site hover failed for every declaration kind (hover searched
  references only).

## Decision: AST-first inference (user-directed pivot)

Mid-implementation the user asked why new rules were regexes over `let ...`
text instead of the AST. Pivoted to the design already prescribed by
`project-docs/regex-audit/STATUS.md` Phase 5b item 3:

- `scope-analysis.ts`: `Declaration` now carries `typeContext` — the real AST
  node behind each binding (init expr, destructure position, loop iterable,
  loop index, block-param call + index).
- **`type-inference-ast.ts` (new)**: `inferDeclType` / `inferExprType` /
  `inferExprElementType` type declarations and expressions structurally,
  resolving names through the actual scope chain (position-aware; fixes
  first-match-wins shadowing).
- `type-inference.ts` (regex) left untouched as the fallback safety net.
  **New rules go in the AST module, never the regex engine.**
- `member-resolution.ts` (new): completion's receiver-typing branches moved
  verbatim; hover and completion now share it (injectable name resolver,
  AST-first).
- `analyzeScopes` switched from strict `parse()` to lenient `parseLezer()` so
  the scope tree survives mid-keystroke errors (essential for completion —
  `vo.` at the cursor is always "broken" code).

## Metadata additions

- `@type VariableOffsetBuilder` / `@type CompoundVariableOffsetBuilder`
  interfaces in `pathogen-api.ts` (two types: simple/compound differ in `stop`
  arity and tangent-vs-cap methods; evaluator hard-errors on cross-use).
- New JSDoc tag `@blockparams TypeA, TypeB` (must precede `@snippet`) →
  generated `METHOD_BLOCK_PARAMS`.
- `TYPE_ELEMENT_TYPES` (from `PathogenArray<X>` / `X[]` members) and
  `NAMESPACE_METHOD_RETURNS` (namespace fn returns incl. elementType) —
  parallel maps; base maps keep bare `'array'` (it is a `TYPE_MEMBERS` key
  that engine code string-compares).
- `TYPE_PROPERTY_TYPES` now keeps number/boolean properties (hover display for
  `let { x } = point`).

## Verification

- 560 language-services tests green (68 hover incl. the full repro program as
  an integration fixture and a binding-form × hover-site coverage matrix;
  new extractor + completion suites).
- Full suite: 97 files / 3911 tests green.
- `npm run check:completions` clean; `npm run build` clean; dist smoke test of
  the repro program shows every formerly-broken hover resolving.
- VS Code parity is automatic — the LSP calls the same `getHoverInfo`.

## Code review (code-reviewer agent, 2026-07-24)

- **Critical (fixed):** the regex engine stack-overflowed on multi-hop
  reference cycles (`let a = b; let b = a;`) — pre-existing, but this change
  added new trigger surfaces (member + declaration-site hover). Fixed by
  threading a visited-name set through `inferType`/`inferRhsType` recursion,
  mirroring the AST engine's guard; regression tests in hover + completion
  suites.
- **Fixed:** hover computed `analyzeScopes` eagerly (stdlib/color hovers paid
  a parse) — now lazy, matching completion's cached pattern.
- **Fixed:** generator escaping consistency (`escapeString` on new map
  entries); member-resolution header now documents its two deliberate
  deviations from the original completion branches.
- **Accepted (documented):** member completion now parses on the dot-path
  (correctness over the old parse-free regex probes); `findDeclaration` is a
  flat position heuristic, not a scope-chain walk — used only where no Scope
  is available; `scopeInfo.declarations` ordering can interleave nested block
  params within one statement (same-line ties only). Note: the primitive
  property-type inclusion touches ~15 `@type` interfaces in the generated map,
  broader than the headline `Point.x` example.

## Deferred / follow-ups

- Pattern-brace completion (`let { | } = rhs`) still uses regex `inferRhsType`
  (rule-by-rule migration continues under regex-audit Phase 5b).
- Pre-existing `'Array'` (capitalized) return for `*All` layer queries in the
  regex engine — not a `TYPE_MEMBERS` key; the AST path returns `'array'`.
- `StyleBlockValue` has dynamic properties only → display type `'StyleBlock'`,
  intentionally no `@type` interface.

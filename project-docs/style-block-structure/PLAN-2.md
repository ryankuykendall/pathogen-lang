# Style-Block Scope Awareness: variable refs in values, chip exclusion, Member expressions

## Context

Follow-up to the style-block-structure project (commits `0e053f6`, `eb9c71b`; trail in `project-docs/style-block-structure/`). Ryan's review of the shipped colors surfaced two items to fix now (the third — `.apply` keyword color — stays parked):

1. **Variable references inside style values lost their variable color.** `fill: glyphFontColor.alpha(40%);` renders `glyphFontColor` whiskey orange (the value class) while the same variable is coral red everywhere else. Root cause: the inner style grammar has no scope info — a Pathogen variable ref and a CSS keyword (`middle`) are both bare `Identifier` tokens. The same blindness makes `let tomato = ...; stroke: tomato;` render a color chip that would overwrite the variable reference if used (KNOWN LIMITATION test at `tests/cm-color-picker.test.ts:162-174`).
2. **`.` is an error node in the inner grammar.** `fill: c.alpha(40%);` parses as `Identifier ⚠(.) Call` — renders fine but member values aren't first-class.

**User decision (2026-07-25): foundation fix.** `scope-analysis.ts:361` treats `StyleBlockLiteral` as a leaf — zero references are produced inside `${ }`, which also means **rename and find-references silently skip identifiers in style values** and VS Code semantic tokens omit them. Teaching scope-analysis about style-block values fixes recolor + chips + rename + find-references + VS Code in one pass, using the `StyleProperty.valueLoc`/`valueEnd` offsets added in the previous project.

Key architectural facts (verified):
- The playground deliberately does NOT consume semantic tokens (`feature-catalog.ts:138-147`: "would fight for token positions and double-render") — the playground recolor must be a dedicated CodeMirror decoration extension, not a semantic-tokens wiring.
- `analyzeScopes` is already on `window.PathogenLang` (helper, not a catalog feature).
- Existing Declaration/Reference ranges are zero-width and statement-anchored (`locToRange`, `scope-analysis.ts:392-396`); consumers work around this with regex line scans. Style-value references can carry exact offsets.
- Inner-grammar rules referenced inside the `@skip { spaces | newline }` block must be defined in it (`@name` alias duplication pattern) — a `Member` rule needs both scope variants.

## Design decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Reference range convention | **Full-width** ranges for style-value refs + optional `inStyleValue?: true` marker on `Reference`; existing refs stay zero-width | Exact offsets are available; `navigation.ts` `isPositionInRange` already branches zero- vs full-width; full-width fixes rename/multi-cursor/semantic tokens precisely; `end > start` is a cheap discriminator |
| D2 | Identifier extraction | Hybrid: inner `styleParser` on `'_: ' + valueText + ';'` (offset = innerFrom − 3 + `valueLoc.offset`) for CSS structure; `parseExpressionAtOffset` + `walkExpr` for `${...}` template interpolations | Same tokenizer the editor renders (strings/templates/nesting free); interpolations are real Pathogen expressions where function names ARE references |
| D3 | Reference rule | CSS-level identifiers (bare values, Member heads): reference **only if the scope chain resolves to a user declaration** — builtins don't count (`stroke-linejoin: round;` stays CSS; a user `let round` shadowing it becomes a ref). Call callees + Member tails: never. Template-interp identifiers: normal Pathogen semantics | Matches evaluator behavior exactly (resolved idents substitute; unresolved pass through as CSS) |
| D4 | Member grammar | ~~`@precedence { member, call }`~~ **Shipped as `@precedence { call, member }` — verified deviation:** member-first silently misparsed a member call nested in another call's args (`drop-shadow(1px 1px c.alpha(50%))` → tail ArgList floated as a stray sibling, NO error node). Call must bind tighter. Regression-guarded by the exact-extent test in tests/style-grammar.test.ts ("member call nested in another call"). Head also accepts `Call` (chains like `rgba(...).lighten(20%)`), and `ArgMember[@name=Member]` twins it in the `@skip` scope; `"."` added to literal tokens with `@precedence { NumberUnit, "." }` | Both-skip-scope duplication is the established contract; `.5` stays `NumberUnit` |
| D5 | Recolor data source | `scopeInfo.references` filtered `inStyleValue && declaration !== null`, via a size-1 memo (`playground/utils/scope-cache.ts`) shared with the color picker | Single source of truth with rename/find-refs; no duplicate resolution logic |
| D6 | Chips exclusion | `findColorRanges(tree, docText, resolvedStyleRefRanges?)` — optional 3rd param; both `tryAddNamedColorValue` and the regex fallback skip covered candidates | Keeps existing callers/tests compiling; mounted and fallback paths stay consistent |
| D7 | Theme-aware recolor | `EditorView.baseTheme({ '&dark .cm-style-var-ref': { color: '#e06c75' }, '&light .cm-style-var-ref': { color: 'inherit' } })` | Scope-prefixed theme selectors beat single-class highlight rules on specificity; verify empirically, escalate to `!important` only if needed |

Docs-first assessment: **no published `docs/` page documents rename/find-references/editor behavior** (confirmed) → no `docs/` change required; CHANGELOG covers it.

## Implementation plan (phased)

### Phase 0 — Artifacts
`project-docs/style-block-structure/PLAN-2.md` (this plan; leave PLAN.md/STATUS.md intact), including the docs-first assessment and the `parseExpressionAtOffset` `.offset` quirk note (lezer-expression.ts:110 — consume only line/column, never `.offset`; recorded follow-up, not fixed here).

### Phase 1 — Inner grammar: `.` + Member
- `src/parser/style.grammar` per D4; regen `npm run generate:style-parser` (verify only `style.generated.ts`/`terms` change).
- `src/parser/style-highlight.ts`: optional `'"."': t.derefOperator`; verify `'Call/Identifier'` path rule still colors calls nested under Member.
- `tests/style-grammar.test.ts`: add `'Member'` to the `valueNodes` concat (:45-50); corpus entries `fill: c.alpha(40%);`, `filter: a.b.c(1).d;`, regression `stroke-width: .5;`; no-error-node assertion for member values.

### Phase 2 — scope-analysis foundation
`src/language-services/scope-analysis.ts`:
- Add `inStyleValue?: true` to `Reference`; thread `source`/`document` through the collector.
- Replace `case 'StyleBlockLiteral': break;` (:361) with `collectStyleBlockReferences`: per property with `valueLoc && valueEnd > valueLoc.offset` (run even when `expr.incomplete`), slice the value, parse `'_: ' + value + ';'` with `styleParser`; walk Identifiers (skip Call callees = first child of Call, and Member tails = non-first children of Member); resolve via scope chain; on user-decl hit push full-width ref with `inStyleValue: true`. Error nodes ignored (lenient).
- `Template` tokens: regex `/\$\{((?:[^{}]|\{[^{}]*\})*)\}/g` (grammar-parity, one brace level), `parseExpressionAtOffset` each interp, walk with `walkExpr` into a temp collector; keep `declaration || isBuiltin`, widen to `start + name.length`, mark `inStyleValue`.
- Tests (`scope-analysis.test.ts`): bare value ref, ref inside drop-shadow, member head (head yes / `alpha` no), CSS keywords & undeclared `tomato` NOT refs, stdlib name not a ref, `let round` shadowing IS a ref, template-interp refs (incl. `${myFn(x)}` fn name), incomplete-block resilience, full-width range exactness.

### Phase 3 — Consumers
- `rename.ts`: use `ref.range` directly when full-width (else keep `findWordRangeOnLine`); containment matching for full-width in `prepareRename`/target matching (mirror `navigation.ts` `isPositionInRange`).
- `semantic-tokens.ts`: reference loop branches — full-width ref → exact token (character/length from the range); zero-width → existing `addTokenForName`.
- `navigation.ts`: verify containment branch, tests only. LSP server: no change (optional field is non-breaking).
- Tests: `rename.test.ts` (rename inside drop-shadow / template interp / member head; same-line decl+style-ref case `let c = #f00; let s = ${ stroke: c; };`), `navigation.test.ts` (find-references exact style-value ranges; getDefinition from inside a value), `semantic-tokens.test.ts` (exact column/length token; CSS keyword → no token).

### Phase 4 — Playground (after `npm run build`)
- New `playground/utils/scope-cache.ts`: size-1 source-keyed memo over `window.PathogenLang.analyzeScopes` + pure `resolvedStyleRefOffsetRanges(scopeInfo, doc)` (unit-testable).
- New `playground/utils/cm-style-ref-recolor.ts`: ViewPlugin (cm-color-picker rebuild pattern), `Decoration.mark({ class: 'cm-style-var-ref' })` + D7 baseTheme.
- `cm-color-picker.ts`: D6 third param; exclusion in `tryAddNamedColorValue` + `addStyleBlockColors`; `buildDecorations` threads ranges from scope-cache.
- `code-editor-pane.ts`: register `...styleRefRecolorExtension(view)` next to `colorPickerExtension` (~:318). Do NOT wire `getSemanticTokens` into the playground (feature-catalog skip is by design).
- Tests: flip the KNOWN LIMITATION chip test (:162-175) to assert NO chip; keep `tomatoJuice` + undeclared-`tomato`-still-chips; add fallback-path (unmounted tree) exclusion test; recolor pure-function unit test.

### Phase 5 — Wrap-up
CHANGELOG; STATUS.md PLAN-2 section; code-reviewer agent; full `npm run test:run`; `npm run build`; LSP package typecheck against fresh `dist/index.d.ts`; playground visual verification.

## Risks & mitigations
- **Mixed range conventions in rename** — style refs come only from the StyleBlockLiteral path, normal refs never point into values; explicit same-line test; full-width edits bypass the first-match-on-line weakness.
- **analyzeScopes per keystroke** — shared size-1 memo; same order of work as the existing per-update chip scan; optional doc-length escape hatch.
- **Grammar regen** — `!member` marker is canonical; parity corpus + `.5` regression + nodeList snapshots gate; only generated files may change.
- **baseTheme specificity** — verified reasoning, confirm empirically both themes; fallback ladder theme → `!important`.
- **Reference-count side effects** — hover/code-lens now see style-value refs (intended); spot-check no test asserts old counts.

## Verification
- Library: language-services + style-grammar + cm-color-picker suites, then full suite.
- Playground (both themes, headless script like the prior project): with `let c = oklch(0.63 0.24 30); let s = ${ stroke: c; filter: drop-shadow(1px 1px c); fill: c.alpha(40%); };` — `c` occurrences coral in dark / default in light; no chip on `stroke: c`; chip still on undeclared `tomato`; rename `c` updates style-value occurrences; find-references multi-selects with real extents; no error node in `c.alpha(40%)`; `stroke-width: .5;` unchanged.
- VS Code/LSP: package typecheck; semantic-token exactness via unit tests (server handler unchanged).

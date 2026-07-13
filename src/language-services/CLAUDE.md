# Language Services

Shared intelligence layer consumed by both the VS Code extension (via LSP) and the playground (via direct import). Zero Node.js or VS Code dependencies — ships in the main npm bundle.

## Architecture

```
Playground (browser)                      VS Code
  cm-completion-bridge.ts                   packages/pathogen-language-server/src/server.ts
  cm-hover-tooltip.ts                         ↓
  workspace-view.ts (diagnostics)           LSP adapter (type conversion only)
        ↓                                       ↓
  window.PathogenLang.*                   import from 'pathogen-lang'
        ↓                                       ↓
        └────────── src/language-services/ ─────┘
                    (this directory)
                          ↓
                    src/parser/ (AST, Lezer tree)
                    src/evaluator/ (runtime truth)
```

Both consumers call the same functions with the same `TextDocument` interface. The language server wraps each function in an LSP handler that converts between LSP types and internal types (and typechecks against the real `dist/index.d.ts` — there is no local type shim). The playground calls functions directly via the global bundle.

## Completion Data Is Generated — Do Not Hand-Edit

Completion/hover/signature data comes from **two files with different rules**:

| File | Status | Contents |
|------|--------|----------|
| `completion-data-static.ts` | Hand-written | Keywords, style properties, block-start/declaration snippets |
| `completion-data.generated.ts` | **AUTO-GENERATED — never edit** | Stdlib + constructor completions, enum completions/members, `TYPE_MEMBERS`, `NAMESPACE_MEMBERS`, `SIGNATURE_DATA`, `CONSTRUCTOR_RETURN_TYPES`, `TYPE_METHOD_RETURNS` |

The generated file is produced by `scripts/generate-completions.ts` (pure logic in `scripts/lib/completion-extract.ts`, unit-tested in `tests/language-services/generate-completions.test.ts`) from two sources of truth:

- **`src/pathogen-api.ts`** — hand-maintained TypeScript declaration file with JSDoc. Functions, namespaces, and `@type`-tagged interfaces here become completions, member sets, signature help, and hover.
- **`src/api-surface.ts` + runtime `BUILTIN_ENUMS`** — enums are generated directly from the runtime and cannot drift.

```bash
npm run generate:completions          # regenerate after editing pathogen-api.ts
npm run check:completions             # strict drift check + git-diff sync check (used by pre-commit hook)
```

### JSDoc conventions in pathogen-api.ts

- `detail text @boost N @kind variable` — detail string, sort boost, completion kind.
- `@type TypeName` on an interface — extracted into `TYPE_MEMBERS['TypeName']`; the interface's method return types feed `TYPE_METHOD_RETURNS` (chain completions like `grid.getPoint(0,0).x`).
- `@snippet template` — explicit snippet template (VS Code `${1:x}`/`$0` syntax; `\n`/`\t` as two-character escapes). **Required for trailing-block syntax** (`apply { }`, `Marker(...) {|m| ... }`) that TS declarations can't express. Methods without `@snippet` get a derived template from their required parameters (`drawTo(${1:x}, ${2:y})$0`, string params quoted). The generator warns when a detail looks block-shaped (`{|`, `{ }`) but has no `@snippet`.
- Constructor return types that name a `@type`-tagged interface feed `CONSTRUCTOR_RETURN_TYPES` (drives `inferType` and binding-block param inference); `hasBindingBlock` is derived from `{|` in the `@snippet`.

### Drift guards

- `crossCheck()` in the generator validates pathogen-api.ts against the runtime: stdlib registry, `contextAwareFunctions`, and `src/evaluator/constructor-registry.ts` (itself behaviorally verified against the evaluators by `tests/constructor-registry.test.ts`). `--strict` (used by `check:completions`) exits non-zero on findings.
- The pre-commit hook runs `check:completions` when a commit touches `src/pathogen-api.ts`, `src/api-surface.ts`, `src/evaluator/`, `src/stdlib/`, or the generator (warn-only).

## Module Catalog

| File | Purpose | Updated When |
|------|---------|-------------|
| `types.ts` | Position, Range, Diagnostic types (LSP-compatible) | New diagnostic kinds needed |
| `document.ts` | TextDocument abstraction (StringTextDocument) | Stable — rarely changes |
| `diagnostics.ts` | `getDiagnostics()` — Lezer error recovery + contextual messages | New syntax constructs |
| `scope-analysis.ts` | `analyzeScopes()` — scope tree, declarations, references | New declaration/statement types |
| `completion-data-static.ts` | Hand-written keywords, style properties, snippets | New keyword / style property |
| `completion-data.generated.ts` | **Generated** — see above | Never by hand; `npm run generate:completions` |
| `completion.ts` | `getCompletions()` + `isStylePropertyNamePosition()` — type inference, member access, scope-aware | New inference rules (constructor data flows in automatically) |
| `hover.ts` | `getHoverInfo()` — keywords, path commands, stdlib (built from `STDLIB_COMPLETIONS`) | New keywords; stdlib flows in automatically |
| `signature-help.ts` | `getSignatureHelp()` — active parameter tracking | Flows from generated `SIGNATURE_DATA` |
| `symbols.ts` | `getDocumentSymbols()` — outline/breadcrumbs | New AST nodes that appear in outline |
| `navigation.ts` | `getDefinition()`, `getReferences()` | New declaration types |
| `rename.ts` | `prepareRename()`, `getRenameEdits()` | Rarely |
| `semantic-tokens.ts` | `getSemanticTokens()` — scope-aware highlighting | New token categories |
| `formatter.ts` | `formatDocument()` — AST-based code formatting | New statement/block types |
| `code-actions.ts` | `getCodeActions()` — quick fixes for diagnostics | New diagnostic-to-fix mappings |
| `inlay-hints.ts` | `getInlayHints()` — parameter names, type hints | New function signatures |
| `index.ts` | Re-exports all language-services | New capabilities added |

## What to Update When the Language Changes

| Change | Files to update |
|--------|----------------|
| New keyword | `completion-data-static.ts` (KEYWORD_COMPLETIONS), `hover.ts` (KEYWORD_HOVER) |
| New stdlib function | Declare in `src/pathogen-api.ts` → `npm run generate:completions` (completion + hover + signature help all flow) |
| New evaluator constructor | Add to `src/evaluator/constructor-registry.ts` + canonical program in `tests/constructor-registry.test.ts`, declare in `pathogen-api.ts` (with `@snippet` if it takes a trailing block) + `@type` return interface → regenerate |
| New type with member access | `@type`-tagged interface in `pathogen-api.ts` → regenerate (member completions + chain returns flow) |
| New enum | Runtime `BUILTIN_ENUMS` + `ENUM_METADATA` in `src/api-surface.ts` → regenerate |
| New statement kind | `scope-analysis.ts`, `symbols.ts`, `formatter.ts`, `semantic-tokens.ts` |
| Signature change | Fix the declaration in `pathogen-api.ts` → regenerate |
| New style property | `completion-data-static.ts` (STYLE_PROPERTY_COMPLETIONS) |

For the full cross-system checklist (including VS Code extension, playground, docs), see `project-docs/developer-experience/cross-system-feature-lifecycle.md`.

## Snippet Handling Per Surface

- **Playground**: `playground/utils/cm-completion-bridge.ts` converts VS Code snippet syntax to CodeMirror fields (`$0` → `${}`, choice fields → first choice) and uses the native `@codemirror/autocomplete` `snippet()` for tab-stop cycling (manual fallback selects the first placeholder). Style property-name positions widen the word/replacement pattern to include `-` via `isStylePropertyNamePosition` — everywhere else `-` stays an operator boundary.
- **VS Code**: `packages/pathogen-language-server/src/server.ts` sends `InsertTextFormat.Snippet` when the client advertises `snippetSupport` (placeholders stripped to plain text otherwise) and attaches an explicit `textEdit` covering the hyphenated prefix in style property-name position (the client word pattern treats `-` as a boundary).

## Testing

Tests live in `tests/language-services/` with 1:1 correspondence to source files:

| Source | Test |
|--------|------|
| `completion.ts` | `tests/language-services/completion.test.ts` |
| `scripts/lib/completion-extract.ts` (generator) | `tests/language-services/generate-completions.test.ts` |
| `playground/utils/cm-completion-bridge.ts` | `tests/language-services/completion-bridge.test.ts` |
| `hover.ts` | `tests/language-services/hover.test.ts` |
| `diagnostics.ts` | `tests/language-services/diagnostics.test.ts` |
| `symbols.ts` | `tests/language-services/symbols.test.ts` |
| `scope-analysis.ts` | `tests/language-services/scope-analysis.test.ts` |
| `signature-help.ts` | `tests/language-services/signature-help.test.ts` |
| `navigation.ts` | `tests/language-services/navigation.test.ts` |
| `rename.ts` | `tests/language-services/rename.test.ts` |
| `semantic-tokens.ts` | `tests/language-services/semantic-tokens.test.ts` |
| `formatter.ts` | `tests/language-services/formatter.test.ts` |
| `code-actions.ts` | `tests/language-services/code-actions.test.ts` |
| `inlay-hints.ts` | `tests/language-services/inlay-hints.test.ts` |
| constructor registry | `tests/constructor-registry.test.ts` |

**Pattern**: Create a `StringTextDocument` from source text, call the language-service function, assert on returned items. Assert `detail`/`insertText`/`isSnippet` content, not just label presence — label-only assertions let signature drift and missing templates pass silently.

```bash
npx vitest run tests/language-services/completion.test.ts   # Single file
npx vitest run tests/language-services/                      # All language-services tests
```

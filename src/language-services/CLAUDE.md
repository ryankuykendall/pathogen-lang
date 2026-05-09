# Language Services

Shared intelligence layer consumed by both the VS Code extension (via LSP) and the playground (via direct import). Zero Node.js or VS Code dependencies — ships in the main npm bundle.

## Architecture

```
Playground (browser)                      VS Code
  cm-completion-bridge.ts                   packages/pathogen-language-server/src/server.ts
  cm-hover-tooltip.ts                         ↓
  workspace-view.ts (diagnostics)           LSP adapter (type conversion only)
        ↓                                       ↓
  window.SvgPathExtended.*                import from 'pathogen-lang'
        ↓                                       ↓
        └────────── src/language-services/ ─────┘
                    (this directory)
                          ↓
                    src/parser/ (AST, Lezer tree)
                    src/evaluator/ (runtime truth)
```

Both consumers call the same functions with the same `TextDocument` interface. The language server wraps each function in an LSP handler that converts between LSP types and internal types. The playground calls functions directly via the global bundle.

## Module Catalog

| File | Purpose | Updated When |
|------|---------|-------------|
| `types.ts` | Position, Range, Diagnostic types (LSP-compatible) | New diagnostic kinds needed |
| `document.ts` | TextDocument abstraction (StringTextDocument) | Stable — rarely changes |
| `diagnostics.ts` | `getDiagnostics()` — Lezer error recovery + contextual messages | New syntax constructs |
| `scope-analysis.ts` | `analyzeScopes()` — scope tree, declarations, references | New declaration/statement types |
| `completion-data.ts` | Static completion entries (stdlib, keywords, style props, members) | **Any runtime API change** |
| `completion.ts` | `getCompletions()` — type inference, member access, scope-aware | New types with member access |
| `hover.ts` | `getHoverInfo()` — keywords, path commands, stdlib, symbols | New keywords, stdlib functions |
| `signature-help.ts` | `getSignatureHelp()` — active parameter tracking | Stdlib signature changes |
| `symbols.ts` | `getDocumentSymbols()` — outline/breadcrumbs | New AST nodes that appear in outline |
| `navigation.ts` | `getDefinition()`, `getReferences()` | New declaration types |
| `rename.ts` | `prepareRename()`, `getRenameEdits()` | Rarely |
| `semantic-tokens.ts` | `getSemanticTokens()` — scope-aware highlighting | New token categories |
| `formatter.ts` | `formatDocument()` — AST-based code formatting | New statement/block types |
| `code-actions.ts` | `getCodeActions()` — quick fixes for diagnostics | New diagnostic-to-fix mappings |
| `inlay-hints.ts` | `getInlayHints()` — parameter names, type hints | New function signatures |
| `index.ts` | Re-exports all language-services | New capabilities added |

## Completion Data Drift

`completion-data.ts` is a static, hand-maintained snapshot of the language's API surface. It has no connection to the evaluator — every runtime addition requires a separate manual update that is frequently missed. As of 2026-04-06:

- All 13 enums are missing from completions
- Several phantom completions advertise methods that don't exist at runtime
- Signature mismatches exist between completion detail strings and actual parameters

See:
- `project-docs/developer-experience/completion-coverage-audit.md` — Full audit of gaps
- `project-docs/developer-experience/completion-engine-generation-plan.md` — Proposed fix: generate completion data from annotated source

## What to Update When the Language Changes

| Change | Files to update |
|--------|----------------|
| New keyword | `completion-data.ts` (KEYWORD_COMPLETIONS), `hover.ts` (KEYWORD_HOVER) |
| New stdlib function | `completion-data.ts` (STDLIB_COMPLETIONS) — hover picks it up automatically |
| New type with member access | `completion-data.ts` (new member set), `completion.ts` (getMembersForObject + inferType) |
| New enum | `completion-data.ts` (gap — no enum completion infrastructure yet) |
| New statement kind | `scope-analysis.ts`, `symbols.ts`, `formatter.ts`, `semantic-tokens.ts` |
| Signature change | `completion-data.ts` (detail string) — signature-help extracts from it |
| New style property | `completion-data.ts` (STYLE_PROPERTY_COMPLETIONS) |

For the full cross-system checklist (including VS Code extension, playground, docs), see `project-docs/developer-experience/cross-system-feature-lifecycle.md`.

## Testing

Tests live in `tests/language-services/` with 1:1 correspondence to source files:

| Source | Test |
|--------|------|
| `completion.ts` | `tests/language-services/completion.test.ts` |
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

**Pattern**: Create a `StringTextDocument` from source text, call the language-service function, assert on returned items.

```bash
npx vitest run tests/language-services/completion.test.ts   # Single file
npx vitest run tests/language-services/                      # All language-services tests
```

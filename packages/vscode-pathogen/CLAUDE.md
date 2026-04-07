# VS Code Extension & Language Server

Thin VS Code extension + LSP server for the Pathogen language. All intelligence comes from `src/language-services/` — the extension and server are adapters only.

## Architecture

```
packages/vscode-pathogen/             packages/pathogen-language-server/
  src/extension.ts                      src/server.ts
    ↓                                     ↓
  Starts LanguageClient                 Creates LSP connection
  (stdio transport)                     Wraps language-services functions
    ↓                                   in LSP type converters
  Registers preview command                ↓
  (src/preview.ts — placeholder)        import from 'svg-path-extended'
                                        (file:../../ dependency)
```

The extension spawns the language server as a child process. The server imports all language-service functions from the `svg-path-extended` library (symlinked via `"file:../../"` in package.json) and wraps each one in an LSP handler that converts between VS Code LSP types and internal types.

## Package Layout

**Extension** (`packages/vscode-pathogen/`):

| File | Purpose |
|------|---------|
| `src/extension.ts` | Entry point. Starts LanguageClient, registers preview command |
| `src/preview.ts` | SVG preview webview panel (placeholder — not yet functional) |
| `syntaxes/pathogen.tmLanguage.json` | TextMate grammar for syntax highlighting |
| `snippets/pathogen.code-snippets` | 18 code snippets (for, fn, if, shapes, etc.) |
| `language-configuration.json` | Comment toggling, brackets, auto-closing, indentation, folding |
| `test-fixtures/all-syntax.pathogen` | Syntax coverage test file |
| `package.json` | Extension manifest (contributes: languages, grammars, snippets, commands) |

**Language Server** (`packages/pathogen-language-server/`):

| File | Purpose |
|------|---------|
| `src/server.ts` | LSP adapter — each `connection.on*` handler wraps a language-services function |
| `src/svg-path-extended.d.ts` | Type shim (workaround for DTS build issue in main package) |

## LSP Capabilities

| Capability | Language-Services Function | Trigger |
|-----------|---------------------------|---------|
| `textDocumentSync: Full` | `getDiagnostics()` | On document change |
| `documentSymbolProvider` | `getDocumentSymbols()` | Outline request |
| `completionProvider` (`.`, `$`) | `getCompletions()` | Typing trigger chars |
| `hoverProvider` | `getHoverInfo()` | Mouse hover |
| `definitionProvider` | `getDefinition()` | Ctrl+Click / F12 |
| `referencesProvider` | `getReferences()` | Find All References |
| `signatureHelpProvider` (`(`, `,`) | `getSignatureHelp()` | Inside function call |
| `renameProvider` (prepare) | `prepareRename()`, `getRenameEdits()` | F2 |
| `semanticTokensProvider` (full) | `getSemanticTokens()`, `encodeSemanticTokens()` | File open/change |
| `documentFormattingProvider` | `formatDocument()` | Format Document |
| `codeActionProvider` | `getCodeActions()` | Lightbulb / quick fix |
| `inlayHintProvider` | `getInlayHints()` | File open/change |

## Build & Development

```bash
# Root library must build first (language server depends on it)
npm run build                                           # Root — rebuilds dist/

# Language server
cd packages/pathogen-language-server && npm run build   # Compiles src/ → out/server.js

# Extension
cd packages/vscode-pathogen && npm run build            # Compiles src/ → out/extension.js

# Watch mode (separate terminals)
cd packages/pathogen-language-server && npm run watch
cd packages/vscode-pathogen && npm run watch
```

**Dependency chain**: If `src/language-services/` changes → rebuild root lib (`npm run build`) → rebuild language server → extension picks up changes.

**Testing**: No test suites exist yet for either package (`"test": "echo 'No tests yet'"`).

## TextMate Grammar

The TextMate grammar (`syntaxes/pathogen.tmLanguage.json`) provides instant syntax highlighting before the language server starts. It is **hand-maintained separately** from the Lezer grammar (`src/parser/pathogen.grammar`).

When a new keyword or syntax construct is added:
1. Update the Lezer grammar (source of truth for the parser)
2. Update the TextMate grammar keyword pattern or add new scope rules
3. Verify in `test-fixtures/all-syntax.pathogen`

The Lezer grammar also powers CodeMirror 6 highlighting in the playground via `src/parser/highlight.ts` — a third, separate highlighting definition.

## Snippets

Snippets in `snippets/pathogen.code-snippets` (18 entries) mirror the snippet bodies from `completion-data.ts` KEYWORD_COMPLETIONS entries. When a new keyword snippet is added to completion-data, add a corresponding VS Code snippet here. Same templates, different format (VS Code JSON vs completion insertText).

## What to Update When the Language Changes

| Change | Update needed in these packages |
|--------|-------------------------------|
| New keyword | TextMate grammar (keyword pattern), snippets (if templatable) |
| New syntax construct | TextMate grammar (new pattern), `test-fixtures/all-syntax.pathogen` |
| New stdlib function | Nothing — flows through language-services via LSP |
| New enum | Nothing — flows through language-services via LSP |
| New type | Nothing — flows through language-services via LSP |
| New language-service feature | `server.ts` — add new `connection.on*` handler |

For the full cross-system checklist, see `project-docs/developer-experience/cross-system-feature-lifecycle.md`.

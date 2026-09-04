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
  (src/preview.ts — functional)         import from 'pathogen-lang'
                                        (file:../../ dependency)
```

The extension spawns the language server as a child process. The server imports all language-service functions from the `pathogen-lang` library (symlinked via `"file:../../"` in package.json) and wraps each one in an LSP handler that converts between VS Code LSP types and internal types.

## Package Layout

**Extension** (`packages/vscode-pathogen/`):

| File | Purpose |
|------|---------|
| `src/extension.ts` | Entry point. Starts LanguageClient, registers preview command |
| `src/preview.ts` | SVG preview webview panel — functional; webview consumes the bundled library via `<script src="${compilerUri}">` and renders via the shared `buildSvgTree` + `mountInto` adapters. Pan/zoom is the shared `PanZoomController` (`window.PathogenPanZoom`, loaded from a second bundled script `compiler/pan-zoom.global.js`) — CSS-transform during the gesture, baked into the viewBox on idle; wheel + drag + touch pinch |
| `syntaxes/pathogen.tmLanguage.json` | TextMate grammar for syntax highlighting |
| `snippets/pathogen.code-snippets` | 18 code snippets (for, fn, if, shapes, etc.) |
| `language-configuration.json` | Comment toggling, brackets, auto-closing, indentation, folding |
| `test-fixtures/all-syntax.pathogen` | Syntax coverage test file |
| `package.json` | Extension manifest (contributes: languages, grammars, snippets, commands) |

**Language Server** (`packages/pathogen-language-server/`):

| File | Purpose |
|------|---------|
| `src/server.ts` | LSP adapter — each `connection.on*` handler wraps a language-services function |

## LSP Capabilities

| Capability | Language-Services Function | Trigger |
|-----------|---------------------------|---------|
| `textDocumentSync: Full` | `getDiagnostics()` | On document change |
| `documentSymbolProvider` | `getDocumentSymbols()` | Outline request |
| `completionProvider` (`.`, `$`, `#`) | `getCompletions()` | Typing trigger chars |
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

## Readiness Status

The extension's **preview webview is functional** — the `Broken: Preview panel shows placeholder` item previously here has been resolved. The preview consumes the bundled `pathogen-lang` library via `<script src="${compilerUri}">`, compiles Pathogen source in-webview, and renders through the shared `buildSvgTree` + `mountInto` adapters (as of the 2026-04-21 render-pipeline unification; see [`project-docs/render-pipeline-unification/PLAN.md`](../../project-docs/render-pipeline-unification/PLAN.md) Phase 5). Features working today: SVG render, layer visibility toggle, CSSVar panel, palette, recompile button, navigator, and pan/zoom.

**Pan/zoom (2026-06).** The preview adopted the shared `PanZoomController` (`src/ui/pan-zoom-controller.ts` → `dist/pan-zoom.global.js` → `window.PathogenPanZoom`); `scripts/build-vscode-extension.ts` copies that bundle into `compiler/` next to `index.global.js`, and the webview loads it via a second nonce'd `<script>`. Pan/zoom uses a CSS transform during the gesture and bakes into the `viewBox` on idle (the large-SVG perf win — see [`project-docs/pan-zoom-performance/findings-and-recommendations.md`](../../project-docs/pan-zoom-performance/findings-and-recommendations.md)); adds touch pinch-zoom; and splits the navigator viewport rect into its own GPU-promoted overlay SVG. Verified headless (`getWebviewContent` is exported for this): the webview compiles a real scene, pans/zooms, and bakes cleanly. The final interactive feel still wants a `.vsix` install/reload (see Development Lifecycle).

Other items below are still open.

### Broken

- [ ] **Language server does not activate when installed from .vsix** — The packaging pipeline bundles dependencies into `server/node_modules/`, but the language server process fails to start. The extension activates (preview command works) but no LSP features are available (no completions, hover, diagnostics, or formatting). Root cause: the server subprocess runs in its own Node process and may not resolve dependencies from the bundled path.

### Missing

- [ ] **No extension tests** — `"test": "echo 'No tests yet'"`. There are zero automated tests verifying that the extension activates, the language server starts, commands register, or LSP features work.
- [ ] **No end-to-end install verification** — The build script (`scripts/build-vscode-extension.ts`) packages a `.vsix` but does not verify that it works when installed. The packaging was never tested until 2026-04-08 and multiple dependency resolution issues were discovered. The render-pipeline unification (2026-04-21) did a manual install-verify for the preview webview; no automated gate yet.
- [ ] **No automated render-channel parity for VS Code** — `tests/render-channel-parity.test.ts` diffs CLI string output vs. playground DOM output; VS Code uses the same shared tree + `mountInto` adapter as the playground, so it is covered indirectly, but there is no test that drives the `preview.ts` entry point end-to-end.

### Known Gaps

- [ ] Language file icons (`icons/pathogen-light.svg`, `icons/pathogen-dark.svg`) are referenced but don't exist (removed from package.json to prevent errors)
- [ ] No bundling (esbuild) — the extension ships raw `node_modules/` which is fragile and bloated; vsce warns about this
- [ ] Snippet count in this doc says "18 entries" but there are now 27 after the formatter style guide work

## Development Lifecycle

The VS Code extension follows the same quality standard as the rest of the project:

1. **Verify the problem** — Before changing extension code, reproduce the issue by installing the `.vsix` and testing in VS Code, not just by reading source.
2. **Build and install** — `npm run build:vscode:install` builds everything and installs the `.vsix`.
3. **End-to-end verify** — After installing, reload VS Code and verify:
   - Extension activates (check Extension Host output for errors)
   - "Pathogen Language Server" appears in the Output dropdown
   - Completions, hover, diagnostics work on a `.pathogen` file
   - Preview command opens and renders; pan/zoom (wheel, drag, pinch) and zoom-fit work
4. **No dead features** — Do not register commands, menu items, or UI that don't work. If a feature isn't ready, don't expose it to users.
5. **Full test suite** — Run `npm run test:run` from the project root before committing.
